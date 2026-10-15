# Pitman Safety Solutions, HSE Manager

An internal Health, Safety & Environment (HSE) management system: incident
reporting, corrective actions, inspections, and employee safety tracking.

Built as a single web app: **no build tools, no dependencies, no demo data**.
Deploy the folder to any static host and it is ready. This is the only
documentation file.

---

## 1. Run and deploy

- The app is the `hse-manager` folder. Open `index.html` directly, or serve the
  folder with any static web server (`npx serve .`, nginx, Apache, IIS).
- To host it: upload the folder contents to any static hosting
  (GitHub Pages, Netlify, Vercel, or your own server). There is nothing to
  build or configure. Point the site at the folder so `index.html` is the
  entry page.
- Deploying with your own domain (recommended, free):
  1. Push this folder to a GitHub repository.
  2. Sign up at netlify.com (or cloudflare.com, pages section). Both are free,
     work with private repositories, and give you HTTPS automatically.
  3. In the dashboard: add a new site, import from GitHub, pick the
     repository. No build settings are needed: the publish directory is the
     repository root and there is no build command.
  4. In the site settings: add your domain under custom domains. The host
     shows you the DNS records to create.
  5. At the company where you bought the domain: add those records
     (usually a CNAME for www and A or ALIAS records for the bare domain).
     HTTPS is issued automatically within minutes.
  - GitHub Pages also works, but on the free plan the repository must be
    public. Netlify and Cloudflare Pages keep it private.
- Recommended order to go live: host the frontend first (above), then
  connect Supabase (section 5), then redeploy. Until Supabase is connected,
  each browser keeps its own data; for real use by several staff, Supabase
  must be connected.
- `single-file-standalone.html` is the same app packed into one file (styles,
  scripts and logo embedded). Use it only for quick single-file distribution;
  prefer the folder version for hosting and updates.

**Important if you open `index.html` from the zip:** extract the whole zip
first. If you open `index.html` straight from inside the zip, the `js/`,
`css/` and `img/` files will not be found and the page will be blank.

## 2. First run setup

The app starts empty, with no accounts. The first time it is opened:

1. The sign-in panel shows **First run setup**: create the platform owner
   account (full name, email, password). This account belongs to your
   company, not to any agency.
2. The owner signs in to the **Agencies console**: creates each company
   (agency) and its first administrator, giving just a name and email.
   No password is set by the owner.
3. That administrator signs in for the first time and creates their own
   password. From then on they manage their agency: Settings, Login
   accounts to add staff by name, email and access level. Every person
   creates their own password at first sign-in; nobody ever sets another
   person's password. An admin can reset a password, which makes the
   person set a new one at the next sign-in.

Roles: **SUPER_ADMIN** (platform console), **AGENCY_ADMIN** (everything in
their agency plus Settings), **SUPERVISOR** and **EMPLOYEE** (restricted
module sets; an agency admin fine-tunes these in Settings, Permissions).

## 3. Modules

All data modules follow the same pattern: **New, Search, List, Print**.

- **Dashboard:** KPI tiles, charts (events by type and by month), overdue
  follow-ups, certificates expiring soon.
- **Events:** multi-step incident report (info, damages with costs and media,
  impacts, follow-ups, investigation, risk matrix, corrective actions,
  multimedia, review and submit), per-event KPI plus a KPI report across all
  events.
- **Corrective actions, Inspections, Equipment, PPE, Committees,
  Follow-ups, Documents, Sites, Employees.**
- **Employees:** certificate tracking with expiry, training tracking,
  new-hire training template, asset tracking, and **Bulk assign** (admins):
  the same training entry or certificate added to every employee you tick,
  in one step.
- **Certificate expiry notifications:** supervisors and admins see a
  **Notifications** button in the top bar whenever any certificate is at
  1 month, 2 weeks, 1 week, 3 days, 1 day, or day of expiry. The list stays
  until the certificate is renewed, and each row has an email link to the
  employee's supervisor. (Automatic daily emails need the backend; see the
  note at the end of section 5.)
- **Documents with SDS access control:** SDS sheets (category SDS,
  Restricted) are hidden by default. An admin presses **Access** on an SDS
  row and ticks which staff accounts may see that sheet. A user sees only
  the sheets their own account was granted; no matching between logins and
  employee records is needed.
- **ERG (Emergency Response Guidebook):** the complete guidebook, built in.
  Search by UN number or material name, open any of the 62 guide pages
  (Potential hazards, Public safety, Emergency response, First aid), with
  initial isolation and protective action distances for toxic inhalation
  hazards. Derived from the official US DOT Emergency Response Guidebook
  (public domain). The data is static reference data in `js/erg.js`; it needs
  no database. To update it, replace `js/erg.js` wholesale with a newer
  edition.
- Media upload in every relevant section; print on every list view.

## 4. Multi-tenancy, branding, access control

- **Agencies:** the SUPER_ADMIN console provisions agencies, sets each
  agency's logo, brand colors and subdomain, manages subscription status
  (suspended agencies cannot sign in), and can open any agency as an
  impersonated admin with an on-screen banner.
- **Tenant isolation:** every record carries an `agency_id`; `js/api.js` only
  lets a session read and write its own agency's records, mirroring the
  PostgreSQL RLS policies in `supabase/schema.sql`.
- **Branding:** on login the app injects the agency's colors as CSS
  variables and swaps the logo; the whole interface restyles instantly.
  No brand set falls back to standard Pitman Safety Solutions branding.
- **Confidentiality:** document-level Public / Internal / Restricted on top
  of role permissions.

## 5. Connect a real database (Supabase)

Out of the box, data is stored in the browser (localStorage, about 5 MB per
agency browser, fine to start). All data access goes through **one file**,
`js/api.js`, and five adapter functions (`list, get, create, update,
remove`) plus one `saveFile` for uploads. Nothing else in the app knows
where data lives, so wiring a backend touches only that file.

Steps (the same notes are inline at the top of `js/api.js`):

1. Create a project at https://supabase.com (free tier is enough).
2. Run `supabase/schema.sql` in the Supabase SQL editor. It creates every
   table with `agency_id`, the Row-Level Security tenant-isolation
   policies, and the `uploads` storage bucket with tenant-separated paths.
3. Add the Supabase JS client script tag to `index.html`.
4. In `js/api.js` set `CONFIG.backend = 'supabase'`, paste the project URL
   and anon key, and fill in the five adapter functions (each has a clearly
   marked TODO with the exact call) and `saveFile` (upload to the
   `uploads` bucket and return the public URL).
5. Use Supabase Auth for sign-in: create a `users` profile row per auth
   user with `agency_id` and `role`. Keep the same account provisioning
   rules: accounts are created without a password and the person completes
   sign-up themselves.

Two backend rules the database must enforce the same way the app does:

- **SDS grants:** a user may see a category SDS, Restricted document only
  if their own user id is in the row's `grantedTo` array.
- **Tenancy:** every table's RLS policy compares `agency_id` on the row
  with `agency_id` on the signer's profile.

**Certificate reminder emails (recommended once Supabase is connected):**
schedule one daily job (a Supabase Edge Function with pg_cron, or any cron
calling a small endpoint) that lists certificates and emails the employee's
supervisor whenever an expiry is exactly 30, 14, 7, 3, 1, or 0 days away.
The in-app Notifications button (see section 3) already shows the same
list; the email job makes the reminder arrive without anyone opening the
app. Both use the `supervisor` field on the employee record as the
recipient.

If you use an AI coding tool for the wiring, paste this file and
`js/api.js` into it; those two files describe the entire integration
surface.

## 6. Files

```
index.html                    app shell
single-file-standalone.html   the whole app in one file
img/                          logo files (logo, logo-small, favicon)
css/styles.css                styling
js/api.js                     data layer, the only backend integration file
js/erg.js                     ERG reference data (static, no backend needed)
js/app.js                     all UI logic (modules sectioned and commented)
supabase/schema.sql           tables + RLS policies + storage bucket
README.md                     this file
```

## 7. Rebranding

Branded for Pitman Safety Solutions (navy and silver). Logo files are in
`img/`: `logo.png` (login and setup panels), `logo-small.png` (sidebar,
header, print), `favicon.png`. To rebrand, replace those three files (keep
the names) and adjust `--blue` at the top of `css/styles.css`.
