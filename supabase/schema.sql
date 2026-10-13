-- ================================================================
-- supabase/schema.sql, Pitman Safety Solutions HSE Manager
-- Multi-tenant PostgreSQL schema with Row-Level Security.
-- Run this in the Supabase SQL editor (or `supabase db push`).
--
-- MAPPING TO THE APP: the app stores whole records as JSON in a
-- `data` jsonb column, keyed by `id` (see js/api.js). This keeps
-- the app and the database in lock-step with zero code changes.
-- Every tenant table carries agency_id, and RLS enforces that
-- users only ever see their own agency's rows.
-- ================================================================

-- ---------- AGENCIES (the tenants) ----------
create table if not exists agencies (
  id          text primary key,
  data        jsonb not null,            -- name, subdomain, colors, logo, subscription_status
  created_at  timestamptz not null default now()
);

-- ---------- PLATFORM USERS (profiles linked to Supabase Auth) ----------
-- auth.uid() is the Supabase Auth user id; agency_id is the tenant.
create table if not exists users (
  id          uuid primary key references auth.users(id) on delete cascade,
  agency_id   text references agencies(id),
  data        jsonb not null,            -- username, full_name, role, email
  created_at  timestamptz not null default now()
);

-- ---------- TENANT COLLECTIONS ----------
-- One table per app collection (js/api.js collection names).
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings','events','corrective_actions','inspections','equipment',
    'ppe','committees','follow_ups','documents','sites','employees',
    'news','emergency_directory','first_aiders','emergency_procedures',
    'planning','feedback'
  ]
  loop
    execute format($f$
      create table if not exists %I (
        id          text primary key,
        agency_id   text references agencies(id) on delete cascade,
        data        jsonb not null,
        created     timestamptz not null default now(),
        updated     timestamptz
      );
      create index if not exists %I_agency_idx on %I (agency_id);
    $f$, t, t, t);
  end loop;
end $$;

-- ================================================================
-- ROW-LEVEL SECURITY
-- A user may only touch rows whose agency_id matches the agency
-- stored on their profile row. SUPER_ADMIN profiles have
-- agency_id = null and bypass the check below.
-- ================================================================

create or replace function current_user_agency()
returns text language sql stable security definer as $$
  select agency_id from public.users where id = auth.uid();
$$;

create or replace function is_super_admin()
returns boolean language sql stable security definer as $$
  select coalesce(
    (public.users.data->>'role') = 'SUPER_ADMIN', false)
  from public.users where id = auth.uid();
$$;

-- ---------- agencies: readable by all signed-in users,
-- writable only by SUPER_ADMIN ----------
alter table agencies enable row level security;
create policy agencies_read on agencies for select
  using (auth.uid() is not null);
create policy agencies_write on agencies for all
  using (is_super_admin()) with check (is_super_admin());

-- ---------- users: a user sees their own profile; agency admins
-- see their agency's; SUPER_ADMIN sees all ----------
alter table users enable row level security;
create policy users_self on users for select
  using (id = auth.uid());
create policy users_agency on users for select
  using (agency_id is not null and agency_id = current_user_agency()
         and (public.users.data->>'role') in ('AGENCY_ADMIN'));
create policy users_super on users for all
  using (is_super_admin()) with check (is_super_admin());

-- ---------- every tenant collection: same isolation policy ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings','events','corrective_actions','inspections','equipment',
    'ppe','committees','follow_ups','documents','sites','employees',
    'news','emergency_directory','first_aiders','emergency_procedures',
    'planning','feedback'
  ]
  loop
    execute format($f$
      alter table %I enable row level security;
      create policy %I_tenant_isolation on %I for all
        using (
          is_super_admin()
          or agency_id is null
          or (agency_id = current_user_agency() and auth.uid() is not null)
        )
        with check (
          is_super_admin()
          or agency_id = current_user_agency()
          or agency_id is null
        );
    $f$, t, t, t);
  end loop;
end $$;

-- ================================================================
-- FILE STORAGE, tenant-separated paths
-- Bucket: "uploads".  Path convention (enforced by the prefix
-- policy below):  agencies/{agency_id}/{category}/{filename}
-- e.g.  agencies/acme/docs/lockout-sop.pdf
--       agencies/acme/events/photo-12.png
-- ================================================================

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

create policy "tenant_files_read" on storage.objects for select
  using (bucket_id = 'uploads' and (
    is_super_admin()
    or (storage.foldername(name))[1] = 'agencies'
        and (storage.foldername(name))[2] = current_user_agency()
    or is_super_admin() = false and (storage.foldername(name))[2] is null
  ));

create policy "tenant_files_write" on storage.objects for insert
  with check (bucket_id = 'uploads' and (
    is_super_admin()
    or (storage.foldername(name))[1] = 'agencies'
        and (storage.foldername(name))[2] = current_user_agency()
  ));

-- ================================================================
