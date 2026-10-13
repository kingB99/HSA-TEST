/* ================================================================
   api.js, DATA LAYER (the ONLY file that touches a database)
   ----------------------------------------------------------------
   MULTI-TENANCY: every record carries an agency_id. This file
   enforces tenant isolation for local storage. With
   Supabase, the same isolation is enforced by PostgreSQL
   Row-Level Security policies, see supabase/schema.sql.

   Sessions: app.js sets API.session on login:
     API.session = { userId, agencyId, role, asAgencyId }
   role: 'SUPER_ADMIN' | 'AGENCY_ADMIN' | 'SUPERVISOR' | 'EMPLOYEE' | 'PUBLIC'
   asAgencyId: set only when a SUPER_ADMIN impersonates an agency
   for support. While set, that agency's data/branding is used.

   Enforcement rules implemented below (and mirrored by RLS):
   - SUPER_ADMIN (not impersonating): unrestricted access.
   - Everyone else: may only read/write records whose agency_id
     matches their session agency (or platform records with no
     agency_id, e.g. the agencies directory itself).
   - create() stamps the active agency_id onto new records.

   ================================================================
   FASTEST PATH: hand AI-BACKEND-PROMPT.md (repo root) to your AI
   coding tool, it is a complete, self-contained wiring prompt.

   HOW TO CONNECT SUPABASE (recommended backend)
   ================================================================
   1. Create a free project at supabase.com.
   2. Run supabase/schema.sql in the SQL editor, it creates every
      table WITH agency_id and the RLS tenant-isolation policies,
      plus storage notes for /agencies/{agency_id}/docs/.
   3. Add the client to index.html:
      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   4. Set CONFIG below to backend:'supabase' and paste your URL/key.
   5. Replace the bodies of the five functions marked TODO(SUPABASE).
   6. Real logins: Supabase Auth (see the users/agency_id notes in
      supabase/README.md).
   ================================================================ */

const API_CONFIG = {
  backend: 'local',            // 'local' (browser storage) or 'supabase'
  supabaseUrl: 'PASTE_YOUR_SUPABASE_URL',
  supabaseKey: 'PASTE_YOUR_SUPABASE_ANON_KEY'
};

const API = (() => {
  const PREFIX = 'hse_';

  /* ---------- session / tenancy ---------- */
  const session = { userId: null, agencyId: null, role: 'PUBLIC', asAgencyId: null, impName: null };

  const activeAgencyId = () => session.asAgencyId || session.agencyId;
  const bypassTenancy  = () => session.role === 'SUPER_ADMIN' && !session.asAgencyId;

  // Tenant check mirrored by the RLS policies in supabase/schema.sql.
  // Records without agency_id are platform-level (agencies, public
  // feedback) and readable by everyone.
  function tenantOK(rec) {
    const act = activeAgencyId();
    if (!act || bypassTenancy()) return true;
    return rec.agency_id === undefined || rec.agency_id === act;
  }

  /* ---------- local (localStorage) adapter ---------- */
  function lsAll(col) {
    try { return JSON.parse(localStorage.getItem(PREFIX + col) || '[]'); }
    catch (e) { return []; }
  }
  function lsSave(col, rows) { localStorage.setItem(PREFIX + col, JSON.stringify(rows)); }

  async function localList(col, match = {}) {
    return lsAll(col).filter(r =>
      Object.entries(match).every(([k, v]) => r[k] === v) && tenantOK(r));
  }
  async function localGet(col, id) {
    return lsAll(col).find(r => r.id === id && tenantOK(r)) || null;
  }
  async function localCreate(col, data) {
    if (col !== 'agencies' && (session.asAgencyId || session.agencyId))
      data.agency_id = activeAgencyId();          // tenant stamping
    const rows = lsAll(col);
    const rec = { ...data, id: data.id || uid(), created: todayISO() };
    rows.unshift(rec);
    lsSave(col, rows);
    return rec;
  }
  async function localUpdate(col, id, patch) {
    const rows = lsAll(col);
    const i = rows.findIndex(r => r.id === id && tenantOK(r));
    if (i === -1) return null;
    rows[i] = { ...rows[i], ...patch, updated: todayISO() };
    lsSave(col, rows);
    return rows[i];
  }
  async function localRemove(col, id) {
    const rows = lsAll(col);
    const i = rows.findIndex(r => r.id === id && tenantOK(r));
    if (i === -1) return false;
    lsSave(col, rows.filter((_, k) => k !== i));
    return true;
  }

  /* ---------- supabase adapter (stubs) ----------------
     Each function shows the call to make once the client is
     installed and supabase/schema.sql has been run. With RLS
     enabled, the database enforces agency_id isolation, the
     client only needs to pass the session's agency_id where
     noted.                                            */

  async function sb() {
    if (!window._sb) window._sb = window.supabase.createClient(
      API_CONFIG.supabaseUrl, API_CONFIG.supabaseKey);
    return window._sb;
  }

  async function supaList(col, match = {}) {
    // TODO(SUPABASE): replace body with:
    //   const s = await sb();
    //   let q = s.from(col).select();
    //   for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    //   const { data, error } = await q.order('created', { ascending: false });
    //   if (error) throw error;
    //   return data.map(row => ({ ...row.data, id: row.id, agency_id: row.agency_id }));
    // (RLS already filters rows to the caller's agency.)
    throw new Error('Supabase adapter not wired yet, see TODO(SUPABASE) in js/api.js');
  }
  async function supaGet(col, id) {
    // TODO(SUPABASE):
    //   const { data, error } = await (await sb()).from(col).select().eq('id', id).single();
    //   return data ? { ...data.data, id: data.id, agency_id: data.agency_id } : null;
    throw new Error('Supabase adapter not wired yet');
  }
  async function supaCreate(col, data) {
    // TODO(SUPABASE): stamp the agency and insert:
    //   const rec = { ...data, id: data.id || uid(), created: todayISO() };
    //   const { error } = await (await sb()).from(col)
    //     .insert({ id: rec.id, agency_id: rec.agency_id || null, data: rec });
    //   if (error) throw error;
    //   return rec;
    throw new Error('Supabase adapter not wired yet');
  }
  async function supaUpdate(col, id, patch) {
    // TODO(SUPABASE):
    //   const cur = await supaGet(col, id);
    //   const rec = { ...cur, ...patch, updated: todayISO() };
    //   const { error } = await (await sb()).from(col).update({ data: rec }).eq('id', id);
    //   if (error) throw error;
    //   return rec;
    throw new Error('Supabase adapter not wired yet');
  }
  async function supaRemove(col, id) {
    // TODO(SUPABASE):
    //   const { error } = await (await sb()).from(col).delete().eq('id', id);
    //   if (error) throw error;
    //   return true;
    throw new Error('Supabase adapter not wired yet');
  }

  /* ---------- public interface ---------- */
  const useSupa = () => API_CONFIG.backend === 'supabase';

  return {
    session,   // app.js sets: { userId, agencyId, role, asAgencyId }
    list:   (col, match) => useSupa() ? supaList(col, match)   : localList(col, match),
    get:    (col, id)     => useSupa() ? supaGet(col, id)      : localGet(col, id),
    create: (col, data)   => useSupa() ? supaCreate(col, data) : localCreate(col, data),
    update: (col, id, d)  => useSupa() ? supaUpdate(col, id, d): localUpdate(col, id, d),
    remove: (col, id)     => useSupa() ? supaRemove(col, id)   : localRemove(col, id),

    /* Save an uploaded file. Data URL stored in the record
       (localStorage limit ~5 MB; use Supabase Storage in production).
       TODO(SUPABASE): store under the tenant's bucket path:
         const s = await sb();
         const path = 'agencies/' + (API.session.asAgencyId || API.session.agencyId)
                      + '/' + col + '/' + file.name;
         await s.storage.from('uploads').upload(path, file);
         const { data } = s.storage.from('uploads').getPublicUrl(path);
         return { name: file.name, type: file.type, url: data.publicUrl };  */
    saveFile: (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type, url: reader.result });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })
  };
})();

/* ---------- tiny shared helpers ---------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
