/* ================================================================
   app.js, ALL UI LOGIC
   ----------------------------------------------------------------
   Sections:
     1. helpers
     2. module definitions (same layout across every module)
     3. router + shell (login, sidebar, permissions)
     4. public home site
     5. generic list / form / detail engine (New-Search-List-Print)
     6. dashboard + KPIs
     7. events (full multi-step report wizard + KPI)
     8. inspections, sites, employees (module-specific views)
     9. settings (permissions, login accounts, backend info)

   NOTE ON BACKEND: nothing here talks to a database directly.
   everything goes through API.* in js/api.js.
   ================================================================ */

/* ================= 1. HELPERS ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmt = d => d ? d : 'N/A';
const fmtMoney = n => (n ? '$' + Number(n).toLocaleString() : '$0');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2600);
}
function openModal(html) {
  $('#modal-box').innerHTML = html;
  $('#modal-overlay').classList.remove('hidden');
}
function closeModal() { $('#modal-overlay').classList.add('hidden'); }

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}
function statusBadge(s) {
  const cls = { Open:'warn', 'In progress':'info', Closed:'ok', Done:'ok',
                submitted:'ok', draft:'gray', archived:'gray', pass:'ok', fail:'bad', na:'gray' }[s] || 'gray';
  return `<span class="badge ${cls}">${esc(s || 'N/A')}</span>`;
}
function barChart(items) {
  const max = Math.max(1, ...items.map(i => i.value));
  if (!items.length) return '<p class="muted">No data yet.</p>';
  return '<div class="chart">' + items.map(i => `
    <div class="bar-wrap">
      <span class="bar-val">${i.value}</span>
      <div class="bar" style="height:${Math.max(3, (i.value / max) * 130)}px"></div>
      <span class="bar-lbl">${esc(i.label)}</span>
    </div>`).join('') + '</div>';
}

/* Resolve a repeater/media array from a form's data object.
   Some arrays are nested (event damages/investigation media). */
function repArr(data, k) {
  if (k === 'injuries' || k === 'material')
    return (data.damages[k] = data.damages[k] || []);
  return (data[k] = data[k] || []);
}
function mediaArr(data, k) {
  if (k === 'damagesMedia') return (data.damages.media = data.damages.media || []);
  if (k === 'investigationMedia') return (data.investigation.media = data.investigation.media || []);
  return (data[k] = data[k] || []);
}
/* Editable media picker used in every form (uploads via API.saveFile). */
function mediaEditHTML(key, arr) {
  arr = arr || [];
  return `<div class="media-grid">` + arr.map((m, i) => `
    <div class="media-item">${m.type && m.type.startsWith('image') ? `<img src="${m.url}" alt="">` : 'File'}
      <div>${esc(m.name || '')}</div>
      <button type="button" class="btn btn-sm" data-del-media="${key}" data-del-idx="${i}">Remove</button>
    </div>`).join('') + `</div>
    <input type="file" data-media-input="${key}" multiple>`;
}
function mediaViewHTML(arr) {
  if (!arr || !arr.length) return '';
  return `<h3 class="mt">Media</h3><div class="media-grid">` + arr.map(m => `
    <div class="media-item">${m.type && m.type.startsWith('image') ? `<img src="${m.url}" alt="">` : 'File'}
      <div>${esc(m.name || '')}</div>
      <a href="${m.url}" download="${esc(m.name || '')}" target="_blank">Open</a></div>`).join('') + '</div>';
}

/* ================= 2. MODULE DEFINITIONS =================
   Every module = same layout. columns: [key, label].
   fields: k=storage key, type: text|date|number|select|textarea|
   checkbox|repeater|media.                                        */

const MODULES = {
  dashboard:         { label: 'Dashboard', icon: '', sep: 'Main', roles: ['admin','manager'] },
  events:            { label: 'Events', icon: '', sep: 'Main', roles: ['admin','manager','staff'],
    columns: [['ref','Ref'],['name','Name'],['eventType','Type'],['date','Date'],['siteName','Site'],['status','Status']],
    fields: [
      { k:'name', label:'Event name', type:'text', required:true },
      { k:'eventType', label:'Type of event', type:'select', options:['Injury','Material damage','Environment','Near miss','Security','Fire','Other'] },
      { k:'date', label:'Date', type:'date', required:true },
      { k:'reportingPerson', label:'Reporting person', type:'text' },
      { k:'manager', label:'Manager', type:'text' },
      { k:'siteName', label:'Site', type:'text' },
      { k:'employeeType', label:'Employee type', type:'select', options:['Internal','External','No Employee - Near miss confirmed'] },
      { k:'status', label:'Status', type:'select', options:['draft','submitted'] }
    ]},
  corrective_actions:{ label: 'Corrective actions', icon: '', sep: 'Main', roles: ['admin','manager'],
    columns: [['ref','Ref'],['title','Title'],['priority','Priority'],['owner','Owner'],['dueDate','Due'],['status','Status'],['cost','Cost']],
    fields: [
      { k:'ref', label:'Ref (auto if blank)', type:'text' },
      { k:'title', label:'Title', type:'text', required:true },
      { k:'priority', label:'Priority', type:'select', options:['High','Medium','Low'] },
      { k:'source', label:'Source (event ref / inspection)', type:'text' },
      { k:'description', label:'What happened and what must change', type:'textarea', full:true, required:true },
      { k:'owner', label:'Owner', type:'text', required:true },
      { k:'dueDate', label:'Due date', type:'date', required:true },
      { k:'status', label:'Status', type:'select', options:['Open','In progress','Closed'] },
      { k:'verification', label:'Verification of completion (who checked, when)', type:'textarea', full:true },
      { k:'cost', label:'Cost', type:'number' }
    ]},
  inspections:       { label: 'Inspections', icon: '', sep: 'Main', roles: ['admin','manager','staff'],
    columns: [['title','Title'],['site','Site'],['assignedName','Assigned to'],['status','Status'],['date','Scheduled'],['dueDate','Due']],
    fields: [
      { k:'title', label:'Title', type:'text', required:true },
      { k:'site', label:'Site', type:'text', required:true },
      { k:'area', label:'Area / department', type:'text' },
      { k:'date', label:'Scheduled date', type:'date', required:true },
      { k:'dueDate', label:'Due date', type:'date', required:true },
      { k:'assignedTo', label:'Assign to', type:'select', options:[] },
      { k:'status', label:'Status', type:'select', options:['Assigned','In progress','Completed'] },
      { k:'inspector', label:'Requested by', type:'text' },
      { k:'schedule', label:'Schedule', type:'select', options:['One-time','Weekly','Monthly','Quarterly','Annually'] },
      { k:'archived', label:'Archived', type:'checkbox' },
      { k:'items', label:'Checklist items', type:'repeater', sub:[
        { k:'text', label:'Item', type:'text' },
        { k:'result', label:'Result', type:'select', options:['pass','fail','na'] },
        { k:'note', label:'Note', type:'text' }]},
      { k:'followUps', label:'Follow-ups', type:'repeater', sub:[
        { k:'title', label:'Title', type:'text' },
        { k:'dueDate', label:'Due', type:'date' },
        { k:'owner', label:'Owner', type:'text' }]},
      { k:'media', label:'Media', type:'media' }
    ]},
  equipment:         { label: 'Equipment', icon: '', sep: 'Main', roles: ['admin','manager'],
    columns: [['name','Name'],['serial','Serial'],['site','Site'],['type','Type'],['nextInspection','Next inspection']],
    fields: [
      { k:'name', label:'Name', type:'text', required:true },
      { k:'serial', label:'Serial', type:'text', required:true },
      { k:'site', label:'Site', type:'text', required:true },
      { k:'type', label:'Type', type:'select', options:['Mobile equipment','Fixed plant','Tool','Vehicle','Lifting gear','Other'] },
      { k:'condition', label:'Condition', type:'select', options:['Good','Fair','Poor','Out of service'] },
      { k:'frequency', label:'Inspection frequency', type:'select', options:['Weekly','Monthly','Quarterly','Annually'] },
      { k:'lastInspection', label:'Last inspection', type:'date' },
      { k:'nextInspection', label:'Next inspection due', type:'date', required:true },
      { k:'notes', label:'Notes', type:'textarea', full:true },
      { k:'media', label:'Media', type:'media' }
    ]},
  ppe:               { label: 'PPE', icon: '', sep: 'Main', roles: ['admin','manager','staff'],
    columns: [['item','Item'],['requirement','Requirement'],['stockQty','Stock'],['need','Need'],['lastInspection','Last inspection']],
    fields: [
      { k:'item', label:'Item', type:'text', required:true },
      { k:'requirement', label:'Requirement / who needs it', type:'text', full:true, required:true },
      { k:'issuedTo', label:'Issued to', type:'text' },
      { k:'issueDate', label:'Issue date', type:'date' },
      { k:'condition', label:'Condition', type:'select', options:['Good','Replace','Out of stock'] },
      { k:'stockQty', label:'Stock qty', type:'number' },
      { k:'need', label:'Need (to order)', type:'number' },
      { k:'lastInspection', label:'Last inspection', type:'date' }
    ]},
  committees:        { label: 'Committees', icon: '', sep: 'Main', roles: ['admin','manager','staff'],
    columns: [['name','Name'],['nextMeeting','Next meeting']],
    fields: [
      { k:'name', label:'Name', type:'text', required:true },
      { k:'members', label:'Members', type:'textarea', full:true, required:true },
      { k:'chair', label:'Chair', type:'text' },
      { k:'frequency', label:'Meeting frequency', type:'select', options:['Monthly','Quarterly','Annually'] },
      { k:'nextMeeting', label:'Next meeting', type:'date', required:true },
      { k:'meetingMinutesDoc', label:'Minutes document (name/ref)', type:'text' },
      { k:'notes', label:'Notes', type:'textarea', full:true }
    ]},
  follow_ups:        { label: 'Follow ups', icon: '', sep: 'Main', roles: ['admin','manager','staff'],
    columns: [['title','Title'],['source','Source'],['owner','Owner'],['dueDate','Due'],['status','Status']],
    fields: [
      { k:'title', label:'Title', type:'text', required:true },
      { k:'source', label:'Source (event/inspection)', type:'text', required:true },
      { k:'owner', label:'Owner', type:'text', required:true },
      { k:'dueDate', label:'Due date', type:'date', required:true },
      { k:'priority', label:'Priority', type:'select', options:['High','Medium','Low'] },
      { k:'status', label:'Status', type:'select', options:['Open','In progress','Closed'] },
      { k:'notes', label:'Notes', type:'textarea', full:true }
    ]},
  documents:         { label: 'Documents', icon: '', sep: 'Records', roles: ['admin','manager','staff'],
    columns: [['title','Title'],['category','Category'],['confidentiality','Confidentiality'],['version','Version']],
    fields: [
      { k:'title', label:'Title', type:'text', required:true },
      { k:'category', label:'Category (SOP, policy, minutes, SDS)', type:'text', required:true },
      { k:'confidentiality', label:'Confidentiality', type:'select', options:['Public','Internal','Restricted'], required:true },
      { k:'version', label:'Version', type:'text', required:true },
      { k:'owner', label:'Document owner', type:'text' },
      { k:'reviewDate', label:'Next review date', type:'date' },
      { k:'notes', label:'Notes', type:'textarea', full:true },
      { k:'file', label:'File', type:'media' }
    ]},
  sites:             { label: 'Sites', icon: '', sep: 'Records', roles: ['admin','manager'],
    columns: [['name','Site'],['address','Address'],['classification','Classification']],
    fields: [
      { k:'name', label:'Site name', type:'text', required:true },
      { k:'address', label:'Address', type:'text', full:true },
      { k:'classification', label:'Classification', type:'text' },
      { k:'classificationCode', label:'Classification code', type:'text' },
      { k:'workStats', label:'Work stats', type:'text', full:true },
      { k:'contacts', label:'Contacts', type:'repeater', sub:[
        { k:'name', label:'Name', type:'text' },
        { k:'phone', label:'Phone', type:'text' },
        { k:'email', label:'Email', type:'text' }]},
      { k:'departments', label:'Departments (comma separated)', type:'text', full:true }
    ]},
  employees:         { label: 'Employees', icon: '', sep: 'Records', roles: ['admin','manager'],
    columns: [['name','Name'],['role','Role'],['site','Site'],['email','Email'],['hireDate','Hired']],
    fields: [
      { k:'name', label:'Name', type:'text', required:true },
      { k:'role', label:'Role', type:'text', required:true },
      { k:'department', label:'Department', type:'text', required:true },
      { k:'site', label:'Site', type:'text', required:true },
      { k:'email', label:'Email', type:'text', required:true },
      { k:'phone', label:'Phone', type:'text' },
      { k:'emergencyContact', label:'Emergency contact (name and phone)', type:'text' },
      { k:'supervisor', label:'Supervisor email', type:'text', required:true },
      { k:'hireDate', label:'Hire date', type:'date', required:true },
      { k:'certificates', label:'Certificates (expiry tracked)', type:'repeater', sub:[
        { k:'name', label:'Certificate', type:'text' },
        { k:'issuer', label:'Issuer', type:'text' },
        { k:'issued', label:'Issued', type:'date' },
        { k:'expiry', label:'Expiry', type:'date' }]},
      { k:'trainings', label:'Training', type:'repeater', sub:[
        { k:'name', label:'Training', type:'text' },
        { k:'date', label:'Date', type:'date' },
        { k:'expiry', label:'Expiry', type:'date' }]},
      { k:'assets', label:'Assets', type:'repeater', sub:[
        { k:'name', label:'Asset', type:'text' },
        { k:'serial', label:'Serial', type:'text' }]}
    ]},
  settings:          { label: 'Settings', icon: '', sep: 'Admin', roles: ['SUPER_ADMIN','AGENCY_ADMIN'] },
  agencies:          { label: 'Agencies', icon: '', sep: 'Admin', roles: ['SUPER_ADMIN'],
    columns: [['name','Agency'],['subdomain','Subdomain'],['subscription_status','Subscription']],
    fields: [
      { k:'name', label:'Agency name', type:'text', required:true },
      { k:'adminName', label:'First admin: full name', type:'text' },
      { k:'adminEmail', label:'First admin: email (sets own password at first sign-in)', type:'email' },
      { k:'subdomain', label:'Subdomain (e.g. acme.pitmansafety.com)', type:'text' },
      { k:'primary_color', label:'Primary color', type:'color' },
      { k:'secondary_color', label:'Secondary color', type:'color' },
      { k:'accent_color', label:'Accent color', type:'color' },
      { k:'subscription_status', label:'Subscription status', type:'select', options:['ACTIVE','SUSPENDED','CANCELED'] },
      { k:'logo', label:'Agency logo (white-label; falls back to Pitman brand)', type:'media' }
    ]},
  erg:               { label: 'ERG', icon: '', sep: 'Main', roles: ['admin','manager','staff'],
    labelLong: 'Emergency Response Guidebook' },
  user_accounts: { label: 'Login account', icon: '', collection: 'users', roles: [],
    columns: [['fullName','Name'],['email','Email'],['role','Access level']],
    fields: [
      { k:'fullName', label:'Full name', type:'text', required:true },
      { k:'email', label:'Email (used to sign in)', type:'email', required:true },
      { k:'role', label:'Access level', type:'select', options:['EMPLOYEE'] }
    ]}
};

/* Login account form. Access levels offered depend on who is editing:
   only a SUPER_ADMIN can create another SUPER_ADMIN.            */
function openUserForm(record) {
  const canSuper = State.user.role === 'SUPER_ADMIN';
  MODULES.user_accounts.fields.find(f => f.k === 'role').options =
    canSuper ? ['EMPLOYEE','SUPERVISOR','AGENCY_ADMIN','SUPER_ADMIN']
             : ['EMPLOYEE','SUPERVISOR','AGENCY_ADMIN'];
  openForm('user_accounts', record);
}

/* ---------- SUPER ADMIN console: agency management + impersonation ---------- */
async function renderAgenciesConsole() {
  const [agencies, users, events, inspections, employees, docs] = await Promise.all([
    API.list('agencies', {}), API.list('users', {}), API.list('events', {}),
    API.list('inspections', {}), API.list('employees', {}), API.list('documents', {})]);
  const active = agencies.filter(a => a.subscription_status === 'ACTIVE').length;
  const inA = (arr, a) => arr.filter(r => r.agency_id === a.id).length;
  $('#topbar-actions').innerHTML =
    `<button class="btn btn-primary" id="btn-new-agency">New agency</button>
     <button class="btn" id="btn-print">Print</button>`;
  const subBadge = st => st === 'ACTIVE' ? '<span class="badge ok">ACTIVE</span>'
    : st === 'SUSPENDED' ? '<span class="badge warn">SUSPENDED</span>'
    : '<span class="badge bad">CANCELED</span>';
  $('#view').innerHTML = `
    <div class="tile-grid">
      <div class="tile"><div class="num">${agencies.length}</div><div class="lbl">Agencies</div></div>
      <div class="tile ok"><div class="num">${active}</div><div class="lbl">Active subscriptions</div></div>
      <div class="tile"><div class="num">${users.length}</div><div class="lbl">Platform users</div></div>
      <div class="tile"><div class="num">${events.length}</div><div class="lbl">Events (all agencies)</div></div>
      <div class="tile"><div class="num">${docs.length}</div><div class="lbl">Documents (all agencies)</div></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Agency</th><th>Subdomain</th><th>Subscription</th><th>Users</th><th>Employees</th><th>Events</th><th>Inspections</th><th></th></tr></thead>
      <tbody>
      ${agencies.map(a => `<tr>
        <td><div class="row gap"><img src="${(a.logo && a.logo[0]) ? a.logo[0].url : 'img/logo-small.png'}" alt="" style="height:28px;width:28px;object-fit:contain"> ${esc(a.name)}</div></td>
        <td>${esc(a.subdomain || '')}</td>
        <td>${subBadge(a.subscription_status)}</td>
        <td>${inA(users, a)}</td><td>${inA(employees, a)}</td><td>${inA(events, a)}</td><td>${inA(inspections, a)}</td>
        <td class="right">
          <button class="btn btn-sm" data-open-as="${a.id}">Open as</button>
          <button class="btn btn-sm" data-edit-agency="${a.id}">Edit</button>
          <button class="btn btn-sm" data-del-agency="${a.id}">Del</button>
        </td></tr>`).join('')}
      </tbody></table></div>
    <p class="muted mt">Subdomain mapping (e.g. acme.yourdomain.com) is configured in DNS + your
    hosting; it is recorded here so the backend can resolve tenants. "Open as" views the app
    exactly as this agency's staff see it, with their branding.</p>`;
  $('#btn-new-agency').onclick = () => openForm('agencies');
  $('#btn-print').onclick = () => window.print();
  $('#view').querySelectorAll('[data-edit-agency]').forEach(b =>
    b.onclick = async () => openForm('agencies', await API.get('agencies', b.dataset.editAgency)));
  $('#view').querySelectorAll('[data-del-agency]').forEach(b =>
    b.onclick = async () => {
      if (!confirm('Delete this agency and keep its data orphaned?')) return;
      await API.remove('agencies', b.dataset.delAgency);
      toast('Agency deleted'); route();
    });
  $('#view').querySelectorAll('[data-open-as]').forEach(b =>
    b.onclick = async () => {
      API.session.asAgencyId = b.dataset.openAs;
      const a = await API.get('agencies', b.dataset.openAs);
      API.session.impName = a ? a.name : '';
      await applyBranding();
      location.hash = '#/dashboard';
      route();
    });
}

function updateImpBanner() {
  const el = $('#imp-banner');
  if (!el) return;
  if (API.session.asAgencyId && State.user) {
    el.classList.remove('hidden');
    el.innerHTML = `Viewing as <b>${esc(API.session.impName || 'agency')}</b>.
      data and branding are scoped to this agency.
      <button class="btn btn-sm" id="imp-exit">Exit agency view</button>`;
    $('#imp-exit').onclick = async () => {
      API.session.asAgencyId = null; API.session.impName = null;
      await applyBranding();
      location.hash = '#/agencies';
      route();
    };
  } else el.classList.add('hidden');
}

/* ================= 3. STATE / ROUTER / SHELL ================= */
const State = { user: null };
let FORM = null;  // active form/wizard (data + save hooks)

/* ---------- white-label defaults & role module sets ---------- */
const Pitman = { name: 'Pitman Safety Solutions', primary: '#1b3550',
  secondary: '#c4c9cf', accent: '#d98324',
  logoSmall: 'img/logo-small.png', logoFull: 'img/logo.png' };

const ROLE_MODULES = {
  SUPER_ADMIN:  ['agencies','dashboard','erg','events','corrective_actions','inspections','equipment','ppe','committees','follow_ups','documents','sites','employees','settings'],
  AGENCY_ADMIN: ['dashboard','erg','events','corrective_actions','inspections','equipment','ppe','committees','follow_ups','documents','sites','employees','settings'],
  SUPERVISOR:   ['dashboard','erg','events','corrective_actions','inspections','equipment','ppe','committees','follow_ups','documents','sites','employees'],
  EMPLOYEE:     ['erg','events','inspections','ppe','follow_ups','documents','committees']
};

function darken(hex, f = 0.72) {
  const n = (hex || '#1b3550').replace('#', '');
  return '#' + [0, 2, 4].map(i =>
    Math.max(0, Math.round(parseInt(n.substr(i, 2), 16) * f))
      .toString(16).padStart(2, '0')).join('');
}

/* ---------- DYNAMIC BRANDING ENGINE ----------
   Fetches the active agency's branding (or the impersonated one)
   and injects it as CSS custom properties. Falls back to the
   standard Pitman Safety Solutions brand when not set.        */
async function applyBranding() {
  const id = API.session.asAgencyId || API.session.agencyId;
  let a = null;
  if (id) a = await API.get('agencies', id);
  const logo = a && a.logo && a.logo[0] ? a.logo[0].url : null;
  const primary = (a && a.primary_color) || Pitman.primary;
  const secondary = (a && a.secondary_color) || Pitman.secondary;
  const accent = (a && a.accent_color) || Pitman.accent;
  const root = document.documentElement.style;
  root.setProperty('--blue', primary);
  root.setProperty('--blue-dark', darken(primary));
  root.setProperty('--silver', secondary);
  root.setProperty('--accent', accent);
  document.querySelectorAll('.brand-logo').forEach(i => i.src = logo || Pitman.logoSmall);
  document.querySelectorAll('.hero-logo').forEach(i => i.src = logo || Pitman.logoFull);
  document.querySelectorAll('.login-logo').forEach(i => i.src = logo || Pitman.logoFull);
  const sb = $('#side-agency');
  if (sb) sb.textContent = (a && a.name) || Pitman.name;
}

function setSession(u) {
  const ROLE_FIX = { admin: 'AGENCY_ADMIN', manager: 'SUPERVISOR', staff: 'EMPLOYEE' };
  if (u && ROLE_FIX[u.role]) u.role = ROLE_FIX[u.role];
  API.session.userId = u ? u.id : null;
  API.session.agencyId = u ? (u.agency_id || null) : null;
  API.session.role = u ? u.role : 'PUBLIC';
  API.session.asAgencyId = null;
  API.session.impName = null;
}

function saveSession() { localStorage.setItem('hse_session', State.user ? State.user.id : ''); }
function loadSession() {
  const id = localStorage.getItem('hse_session');
  if (!id) return;
  const users = JSON.parse(localStorage.getItem('hse_users') || '[]');
  State.user = users.find(u => u.id === id) || null;
  if (State.user) setSession(State.user);
}

async function permissions() {
  // scoped to the active agency; falls back to the built-in role sets
  const rows = await API.list('settings', {});
  const rec = rows.find(r => r.id === 'permissions');
  if (rec && rec.data && rec.data[State.user.role]) return rec.data;
  return ROLE_MODULES;
}
function moduleAllowed(mod, perms) {
  const u = State.user;
  if (!u) return false;
  if (u.role === 'SUPER_ADMIN') return true;
  if (mod === 'agencies') return false;
  return (perms[u.role] || []).includes(mod);
}

function routeMod() {
  return (location.hash.replace('#/', '').split('/')[0]) || 'home';
}

function buildSidebar(perms) {
  let html = '', lastSep = '';
  for (const [key, m] of Object.entries(MODULES)) {
    if (!moduleAllowed(key, perms)) continue;
    if (m.sep && m.sep !== lastSep) { html += `<div class="nav-sep">${m.sep}</div>`; lastSep = m.sep; }
    html += `<a href="#/${key}" data-mod="${key}">${m.label}</a>`;
  }
  $('#side-nav').innerHTML = html;
  $('#side-nav').querySelectorAll('a').forEach(a =>
    a.classList.toggle('active', a.dataset.mod === routeMod()));
  $('#side-user').textContent = State.user
    ? `${State.user.fullName} (${State.user.role})` : '';
}

async function route() {
  const parts = location.hash.replace('#/', '').split('/');
  if (parts[0] === 'home' || parts[0] === 'pub') return showPublic();
  if (!State.user) { showPublic(); openLogin(); return; }
  const perms = await permissions();
  const mod = parts[0];
  if (!MODULES[mod] || !moduleAllowed(mod, perms)) {
    const first = State.user.role === 'SUPER_ADMIN' ? 'agencies'
      : (perms[State.user.role] || [])[0] || 'events';
    if ('#/' + first === location.hash || !MODULES[first] || !moduleAllowed(first, perms)) {
      showApp();
      $('#view').innerHTML = '<div class="card"><h3>No access</h3><p class="muted">This account has no modules enabled. Sign out and ask an administrator for access.</p></div>';
      return;
    }
    location.hash = '#/' + first;
    return;
  }
  showApp();
  await applyBranding();
  updateImpBanner();
  buildSidebar(perms);
  if (!$('#print-header')) $('#view').insertAdjacentHTML('beforebegin', '<div class="print-header" id="print-header"><img src="img/logo-small.png" alt=""> Pitman Safety Solutions · HSE Manager</div>');
  $('#page-title').textContent = MODULES[mod].label;
  $('#topbar-actions').innerHTML = '';
  $('#top-notify').innerHTML = '';
  if (['SUPER_ADMIN','AGENCY_ADMIN','SUPERVISOR'].includes(State.user.role)) {
    const [certs, ins] = await Promise.all([certAlerts(), inspectionAlerts()]);
    const n = certs.length + ins.length;
    if (n) {
      $('#top-notify').innerHTML = `<button class="btn" id="btn-cert-alerts">Notifications (${n})</button>`;
      $('#btn-cert-alerts').onclick = openCertAlerts;
    }
  }
  const view = $('#view');
  try {
    switch (mod) {
      case 'dashboard': await renderDashboard(); break;
      case 'agencies':  await renderAgenciesConsole(); break;
      case 'settings':  await renderSettings(); break;
      case 'events':
        if (parts[1] === 'new') renderEventWizard(null, 0);
        else if (parts[1] === 'kpi') await renderEventsKPI();
        else if (parts[1] && parts[2] === 'edit') renderEventWizard(parts[1], 0);
        else if (parts[1]) await renderEventDetail(parts[1]);
        else await renderModuleList('events');
        break;
      case 'inspections':
        if (parts[1]) await renderInspectionDetail(parts[1]);
        else await renderModuleList('inspections');
        break;
      case 'sites':
        if (parts[1]) await renderSiteDetail(parts[1]);
        else await renderModuleList('sites');
        break;
      case 'employees':
        if (parts[1]) await renderEmployeeDetail(parts[1]);
        else await renderModuleList('employees');
        break;
      case 'erg': await renderERG(); break;
      default: await renderModuleList(mod);
    }
  } catch (e) {
    view.innerHTML = `<div class="card">Error: ${esc(e.message)}</div>`;
  }
}

function showPublic() {
  $('#public-site').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
}
function showApp() {
  $('#public-site').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
}

/* ---------- login ---------- */
const SUPA = () => API.supa();   // true when the app talks to Supabase
async function supaProfileByUid(uid) {
  const prof = await API.get('users', uid);
  return prof ? { ...prof, id: uid } : null;
}
function supaLoginHint() {
  $('#login-error').textContent = 'Invalid email or password.';
  $('#login-hint').textContent = 'Recently added? Check your email for the invitation to set your password first.';
}
function openLogin() {
  $('#login-error').textContent = '';
  $('#login-hint').textContent = '';
  $('#np-error').textContent = '';
  $('#fr-error').textContent = '';
  $('#np1').value = ''; $('#np2').value = '';
  $('#first-login').classList.add('hidden');
  $('#pw-row').classList.remove('hidden');
  State.pendingLogin = null;
  // no accounts at all yet: first run setup instead of sign-in
  // (Supabase mode: owner setup only at #/setup, it is rejected once any account exists)
  const firstRun = SUPA() ? location.hash === '#/setup'
    : JSON.parse(localStorage.getItem('hse_users') || '[]').length === 0;
  $('#first-run').classList.toggle('hidden', !firstRun);
  $('#login-form').classList.toggle('hidden', firstRun);
  $('#login-overlay').classList.remove('hidden');
  if (firstRun) $('#fr-name').focus();
}
$('#btn-login-open').onclick = openLogin;
$('#btn-login-cancel').onclick = openLoginHidden;
function openLoginHidden() { openLogin(); $('#login-overlay').classList.add('hidden'); }
$('#login-form').onsubmit = async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const em = String(fd.get('username') || '').trim().toLowerCase();
  if (SUPA()) {
    try {
      const s = await API.sb();
      const { data, error } = await s.auth.signInWithPassword({ email: em, password: String(fd.get('password') || '') });
      if (error || !data.user) { supaLoginHint(); return; }
      const prof = await supaProfileByUid(data.user.id);
      if (!prof) { await s.auth.signOut(); $('#login-error').textContent = 'No access profile for this account. Contact your administrator.'; return; }
      await finishLogin(prof);
    } catch (err) { $('#login-error').textContent = 'Sign-in failed: ' + err.message; }
    return;
  }
  const users = JSON.parse(localStorage.getItem('hse_users') || '[]');
  const cand = users.find(x => (x.username || '').toLowerCase() === em
                            || (x.email || '').toLowerCase() === em);
  if (cand && !cand.password) {
    // first sign-in: the person creates their own password
    State.pendingLogin = cand;
    $('#login-error').textContent = '';
    $('#first-login').classList.remove('hidden');
    $('#pw-row').classList.add('hidden');
    $('#np1').focus();
    return;
  }
  const u = cand && cand.password === fd.get('password') ? cand : null;
  if (!u) { $('#login-error').textContent = 'Invalid email or password.'; return; }
  await finishLogin(u);
};
async function finishLogin(u) {
  setSession(u);
  State.user = u; saveSession();
  // subscription gate: suspended/canceled agencies cannot sign in
  if (u.role !== 'SUPER_ADMIN' && u.agency_id) {
    const ag = await API.get('agencies', u.agency_id);
    if (ag && ag.subscription_status !== 'ACTIVE') {
      setSession(null); State.user = null; saveSession();
      openLoginHidden();
      $('#login-error').textContent =
        'Your company subscription is ' + ag.subscription_status + '. Contact Pitman Safety Solutions.';
      return;
    }
  }
  openLoginHidden();   // reset panels and keep the overlay closed
  location.hash = u.role === 'SUPER_ADMIN' ? '#/agencies' : '#/dashboard';
  route();
}
$('#btn-first-run').onclick = async () => {
  const name = String($('#fr-name').value || '').trim();
  const em = String($('#fr-email').value || '').trim().toLowerCase();
  const p1 = $('#fr-pw1').value, p2 = $('#fr-pw2').value;
  $('#fr-error').textContent = '';
  if (!name || !em.includes('@')) {
    $('#fr-error').textContent = 'Enter a full name and a valid email.'; return;
  }
  if (p1.length < 6) { $('#fr-error').textContent = 'Use at least 6 characters.'; return; }
  if (p1 !== p2) { $('#fr-error').textContent = 'Passwords do not match.'; return; }
  if (SUPA()) {
    const res = await API.invoke('manage-user', {
      action: 'bootstrap', email: em, fullName: name, password: p1 });
    if (!res || !res.ok) {
      $('#fr-error').textContent = (res && res.error) || 'Could not create the owner account.';
      return;
    }
    const s = await API.sb();
    const { error } = await s.auth.signInWithPassword({ email: em, password: p1 });
    if (error) { $('#fr-error').textContent = 'Owner created. Sign in with your email and password.'; return; }
    const { data: { user } } = await s.auth.getUser();
    const prof = await supaProfileByUid(user.id);
    if (prof) { toast('Owner account created'); await finishLogin(prof); }
    return;
  }
  const u = await API.create('users', {
    fullName: name, email: em, username: em.split('@')[0],
    password: p1, role: 'SUPER_ADMIN', agency_id: null });
  toast('Owner account created');
  await finishLogin(u);
};
$('#btn-np-set').onclick = async () => {
  const p1 = $('#np1').value, p2 = $('#np2').value, u = State.pendingLogin;
  $('#np-error').textContent = '';
  if (!u) return;
  if (p1.length < 6) { $('#np-error').textContent = 'Use at least 6 characters.'; return; }
  if (p1 !== p2) { $('#np-error').textContent = 'Passwords do not match.'; return; }
  const users = JSON.parse(localStorage.getItem('hse_users') || '[]');
  const rec = users.find(x => x.id === u.id);
  if (rec) { rec.password = p1; localStorage.setItem('hse_users', JSON.stringify(users)); }
  State.pendingLogin = null;
  await finishLogin(rec || u);
};
$('#btn-logout').onclick = async () => {
  if (SUPA()) { try { await (await API.sb()).auth.signOut(); } catch (e) {} }
  State.user = null; saveSession(); setSession(null);
  await applyBranding();
  location.hash = '#/home'; route();
};
$('#btn-menu').onclick = () => $('#sidebar').classList.toggle('open-mobile');

/* ---------- delegated events (repeaters, media, matrix, wizard) ---------- */
document.body.addEventListener('click', async e => {
  const t = e.target.closest(
    '[data-add-rep],[data-del-rep],[data-del-media],[data-open],[data-risk],#w-save,#w-submit');
  if (!t || !FORM) return;

  if (t.id === 'w-save') return void (await FORM.saveStep(FORM.step, true));
  if (t.id === 'w-submit') return void FORM.submit();

  if (t.dataset.addRep) {
    repArr(FORM.data, t.dataset.addRep).push({});
    return FORM.rerenderRep(t.dataset.addRep);
  }
  if (t.dataset.delRep !== undefined) {
    repArr(FORM.data, t.dataset.delRep).splice(+t.dataset.delIdx, 1);
    return FORM.rerenderRep(t.dataset.delRep);
  }
  if (t.dataset.delMedia !== undefined) {
    mediaArr(FORM.data, t.dataset.delMedia).splice(+t.dataset.delIdx, 1);
    return FORM.rerenderRep(t.dataset.delMedia);
  }
  if (t.dataset.open) location.hash = t.dataset.open;
  if (t.dataset.risk) {           // risk matrix cell: "severity:likelihood"
    const [s, l] = t.dataset.risk.split(':').map(Number);
    FORM.data.riskMatrix = { severity: s, likelihood: l };
    FORM.render();
  }
});
document.body.addEventListener('change', async e => {
  const t = e.target;
  if (!FORM) return;
  if (t.dataset.rep) {
    const arr = repArr(FORM.data, t.dataset.rep);
    if (arr[+t.dataset.idx] !== undefined)
      arr[+t.dataset.idx][t.dataset.sub] = t.type === 'number' ? +t.value : t.value;
  }
  if (t.dataset.mediaInput) {
    const key = t.dataset.mediaInput;
    const arr = mediaArr(FORM.data, key);
    const files = [...t.files];
    t.value = '';
    for (const f of files) arr.push(await API.saveFile(f));
    FORM.rerenderRep(key);
  }
});

/* ================= 5. GENERIC LIST / FORM / DETAIL ================= */

async function renderModuleList(mod, opts = {}) {
  const cfg = MODULES[mod];
  let rows = await API.list(mod, {});
  if (mod === 'inspections' && State.user.role === 'EMPLOYEE')
    rows = rows.filter(r => r.assignedTo === State.user.id);
  if (mod === 'documents') {
    // confidentiality enforcement by role
    const isAdmin = ['SUPER_ADMIN','AGENCY_ADMIN'].includes(State.user.role);
    const rank = isAdmin ? 3 : State.user.role === 'SUPERVISOR' ? 2 : 1;
    const lvl = { Public: 1, Internal: 2, Restricted: 3 };
    rows = rows.filter(r => isAdmin
      || (lvl[r.confidentiality] || 1) <= rank
      // SDS sheets: an employee sees only the sheets their account was granted
      || (r.category === 'SDS' && (r.grantedTo || []).includes(State.user.id)));
  }
  let q = '';
  const view = $('#view');
  $('#topbar-actions').innerHTML =
    `<input id="mod-search" placeholder="Search…">
     <button class="btn btn-primary" id="btn-new">New</button>
     <button class="btn" id="btn-print">Print</button>
     ${mod === 'events' ? '<a class="btn" href="#/events/kpi">KPI report</a>' : ''}
     ${mod === 'employees' && ['SUPER_ADMIN','AGENCY_ADMIN'].includes(State.user.role)
       ? '<button class="btn" id="btn-bulk">Bulk assign</button>' : ''}`;

  const draw = () => {
    const filtered = rows.filter(r => !q ||
      Object.values(r).some(v => typeof v !== 'object' && String(v).toLowerCase().includes(q.toLowerCase())));
    view.innerHTML = `
      ${opts.banner || ''}
      <div class="table-wrap"><table>
        <thead><tr>${cfg.columns.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead>
        <tbody>
        ${filtered.map(r => `<tr class="clickable" data-id="${r.id}">
          ${cfg.columns.map(c => `<td>${cellVal(mod, r, c)}</td>`).join('')}
          <td class="right">${mod === 'documents' && r.category === 'SDS' &&
              ['SUPER_ADMIN','AGENCY_ADMIN'].includes(State.user.role) ?
              `<button class="btn btn-sm" data-sds-access="${r.id}">Access</button>` : ''}
            ${mod === 'inspections' && r.assignedTo === State.user.id && r.status !== 'Completed' ?
              `<button class="btn btn-primary btn-sm" data-ins-complete="${r.id}">Complete</button>` : ''}
            <button class="btn btn-sm" data-open-detail="${r.id}">Open</button></td>
        </tr>`).join('') || `<tr><td colspan="99" class="muted">No records. Click New to create one.</td></tr>`}
        </tbody></table></div>
      <p class="muted mt">${filtered.length} record(s)</p>`;
    $('#mod-search').oninput = e => { q = e.target.value; draw(); };
    view.querySelectorAll('[data-open-detail]').forEach(b =>
      b.onclick = e => { e.stopPropagation(); openRecord(mod, b.dataset.openDetail); });
    view.querySelectorAll('[data-sds-access]').forEach(b =>
      b.onclick = async e => {
        e.stopPropagation();
        openSDSAccess(await API.get('documents', b.dataset.sdsAccess));
      });
    view.querySelectorAll('[data-ins-complete]').forEach(b =>
      b.onclick = async e => {
        e.stopPropagation();
        openCompleteInspection(await API.get('inspections', b.dataset.insComplete));
      });
    view.querySelectorAll('tr.clickable').forEach(tr =>
      tr.onclick = () => openRecord(mod, tr.dataset.id));
  };
  $('#btn-new').onclick = () => openForm(mod);
  $('#btn-print').onclick = () => window.print();
  if ($('#btn-bulk')) $('#btn-bulk').onclick = openBulkAssign;
  draw();
}

function cellVal(mod, r, c) {
  const v = r[c[0]];
  if (c[0] === 'status') return statusBadge(v);
  if (c[0] === 'archived') return typeof v === 'boolean' ? statusBadge(v ? 'archived' : 'Open') : '';
  if (Array.isArray(v)) return `${v.length} item(s)`;
  if (c[0] === 'cost' || c[0] === 'totalCost') return fmtMoney(v);
  return esc(typeof v === 'object' ? '' : v);
}

async function openRecord(mod, id) {
  const r = await API.get(mod, id);
  if (!r) return toast('Record not found');
  if (['events','inspections','sites','employees'].includes(mod)) { location.hash = `#/${mod}/${id}`; return; }
  const cfg = MODULES[mod];
  const kvs = cfg.fields.filter(f => !['repeater','media'].includes(f.type)).map(f => {
    let v = r[f.k];
    if (f.type === 'checkbox') v = v ? 'Yes' : 'No';
    return `<dt>${f.label}</dt><dd>${esc(v ?? '')}</dd>`;
  }).join('');
  openModal(`<h2>${esc(r.name || r.title || cfg.label)}</h2>
    <dl class="kv">${kvs}</dl>
    ${mediaViewHTML(r.media || r.file || [])}
    <div class="row gap mt">
      <button class="btn btn-primary" id="m-edit">Edit</button>
      <button class="btn btn-danger" id="m-del">Delete</button>
      <button class="btn" id="m-close">Close</button>
    </div>`);
  $('#m-close').onclick = closeModal;
  $('#m-edit').onclick = () => openForm(mod, r);
  $('#m-del').onclick = async () => {
    if (!confirm('Delete this record?')) return;
    await API.remove(mod, id);
    closeModal(); toast('Deleted'); route();
  };
}

/* ---------- generic form (modal) ---------- */
async function openForm(mod, record) {
  const cfg = MODULES[mod];
  const isNew = !record;
  const data = record ? JSON.parse(JSON.stringify(record)) : {};
  for (const f of cfg.fields)
    if (['repeater','media'].includes(f.type) && !data[f.k]) data[f.k] = [];
  if (mod === 'inspections') {
    const users = (await API.list('users', {})).filter(u => u.role !== 'SUPER_ADMIN');
    const f = cfg.fields.find(x => x.k === 'assignedTo');
    f.options = [{ value: '', label: '(not assigned)' }]
      .concat(users.map(u => ({ value: u.id, label: (u.fullName || u.email) + (u.role === 'SUPERVISOR' ? ' (Supervisor)' : '') })));
  }

  FORM = { mod, data, isNew,
    render: () => {},
    rerenderRep: k => renderRepInto(k) };

  function fieldHTML(f) {
    if (f.type === 'repeater') return `<div class="full"><label>${f.label}</label><div id="rep-${f.k}"></div>
      <button type="button" class="btn btn-sm mt" data-add-rep="${f.k}">Add</button></div>`;
    if (f.type === 'media') return `<div class="full"><label>${f.label}</label><div id="rep-${f.k}"></div></div>`;
    const v = data[f.k] ?? '';
    const cls = f.full ? 'full' : '';
    let input;
    if (f.type === 'select') input = `<select id="f_${f.k}">${(f.options || []).map(o => {
      const ov = typeof o === 'object' ? o.value : o, ol = typeof o === 'object' ? o.label : o;
      return `<option value="${esc(ov)}" ${ov === v ? 'selected' : ''}>${esc(ol)}</option>`;
    }).join('')}</select>`;
    else if (f.type === 'textarea') input = `<textarea id="f_${f.k}" rows="3">${esc(v)}</textarea>`;
    else if (f.type === 'checkbox') input = `<div class="checkline"><input id="f_${f.k}" type="checkbox" ${v ? 'checked' : ''}> ${f.label}</div>`;
    else input = `<input id="f_${f.k}" type="${f.type}" value="${esc(v)}">`;
    return `<div class="${cls}">${f.type === 'checkbox' ? input : `<label>${f.label}${f.required ? ' *' : ''}</label>${input}`}</div>`;
  }

  function repRow(f, row, i) {
    return `<div class="row gap mb" style="align-items:flex-start">
      ${f.sub.map(s => {
        if (s.type === 'select') return `<div style="flex:1"><label>${s.label}</label>
          <select data-rep="${f.k}" data-idx="${i}" data-sub="${s.k}">${(s.options || []).map(o => {
            const ov = typeof o === 'object' ? o.value : o, ol = typeof o === 'object' ? o.label : o;
            return `<option value="${esc(ov)}" ${ov === row[s.k] ? 'selected' : ''}>${esc(ol)}</option>`;
          }).join('')}</select></div>`;
        return `<div style="flex:1"><label>${s.label}</label>
          <input data-rep="${f.k}" data-idx="${i}" data-sub="${s.k}"
                 type="${s.type}" value="${esc(row[s.k] ?? '')}"></div>`;
      }).join('')}
      <button type="button" class="btn btn-sm" style="margin-top:18px" data-del-rep="${f.k}" data-del-idx="${i}">Remove</button>
    </div>`;
  }

  function renderRepInto(k) {
    const f = cfg.fields.find(x => x.k === k);
    const el = $('#rep-' + k);
    if (!el) return;
    if (f.type === 'media') { el.innerHTML = mediaEditHTML(k, data[k]); return; }
    const arr = data[k] || [];
    el.innerHTML = arr.length
      ? arr.map((row, i) => repRow(f, row, i)).join('')
      : '<p class="muted">None yet.</p>';
  }

  openModal(`<h2>${isNew ? 'New' : 'Edit'} ${cfg.label}</h2>
    <form id="g-form"><div class="form-grid mt">${cfg.fields.map(fieldHTML).join('')}</div>
    <div class="row gap mt">
      <button class="btn btn-primary" type="submit">Save</button>
      <button class="btn" type="button" id="g-cancel">Cancel</button>
    </div></form>`);
  cfg.fields.filter(f => ['repeater','media'].includes(f.type)).forEach(f => renderRepInto(f.k));

  $('#g-cancel').onclick = () => { FORM = null; closeModal(); route(); };
  $('#g-form').onsubmit = async e => {
    e.preventDefault();
    for (const f of cfg.fields) {
      if (['repeater','media'].includes(f.type)) continue;
      const el = $('#f_' + f.k);
      if (!el) continue;
      data[f.k] = f.type === 'number' ? (+el.value || 0)
        : f.type === 'checkbox' ? el.checked : el.value;
    }
    for (const f of cfg.fields)
      if (f.required && !data[f.k] && f.type !== 'checkbox')
        return toast('Required: ' + f.label);
    if (mod === 'inspections') {
      const users = await API.list('users', {});
      const au = users.find(u => u.id === data.assignedTo);
      data.assignedName = au ? (au.fullName || au.email) : '';
      if (data.assignedTo && (!data.status || data.status === 'Assigned')) data.status = 'Assigned';
    }
    if (mod === 'corrective_actions' && !data.ref)
      data.ref = 'CA-' + String((await API.list('corrective_actions', {})).length + 1).padStart(4, '0');
    if (mod === 'employees' && isNew && $('#newHireChk') && $('#newHireChk').checked) {
      // NEW-HIRE TRAINING TEMPLATE, what a new employee needs when hired on
      data.trainings = [
        { name: 'Health & Safety orientation', date: todayISO(), expiry: '' },
        { name: 'WHMIS', date: todayISO(), expiry: '' },
        { name: 'Emergency procedures walkthrough', date: todayISO(), expiry: '' }
      ].concat(data.trainings || []);
    }
    const col = cfg.collection || mod;
    if (mod === 'user_accounts' && isNew && !API.supa()) data.password = '';
    if (mod === 'user_accounts') {
      data.email = (data.email || '').toLowerCase().trim();
      const dupe = (await API.list('users', {}))
        .find(u => u.email === data.email && u.id !== (record ? record.id : ''));
      if (dupe) return toast('That email already has a login');
      if (State.user.role !== 'SUPER_ADMIN' && data.role === 'SUPER_ADMIN') data.role = 'EMPLOYEE';
    }
    if (mod === 'user_accounts' && isNew && API.supa()) {
      // Supabase: the account is created by the manage-user edge function;
      // Supabase emails the person an invitation to set their password.
      const res = await API.invoke('manage-user', {
        action: 'create', email: data.email, fullName: data.fullName || '',
        role: data.role || 'EMPLOYEE',
        agencyId: API.session.asAgencyId || API.session.agencyId });
      if (!res || !res.ok) return toast((res && res.error) || 'Could not create the login');
      FORM = null; closeModal();
      toast('Login created. An invitation email was sent to set the password.');
      route(); return;
    }
    const saved = isNew ? await API.create(col, data) : await API.update(col, record.id, data);
    if (mod === 'agencies' && isNew && data.adminEmail) {
      const aEmail = (data.adminEmail || '').toLowerCase().trim();
      const dupe = (await API.list('users', {})).find(u => u.email === aEmail);
      if (dupe) toast('That admin email already has a login');
      else if (API.supa()) {
        const res = await API.invoke('manage-user', {
          action: 'create', email: aEmail, fullName: data.adminName || '',
          role: 'AGENCY_ADMIN', agencyId: saved.id });
        toast(res && res.ok
          ? 'Agency and first admin created. An invitation email was sent to set the password.'
          : (res && res.error) || 'Agency created, but the admin account failed.');
      }
      else {
        const admin = await API.create('users', { fullName: data.adminName || '', email: aEmail,
          username: aEmail, role: 'AGENCY_ADMIN', password: '' });
        if (admin.agency_id !== saved.id)
          await API.update('users', admin.id, { agency_id: saved.id });
        toast('First admin created. They set their password at first sign-in.');
      }
    }
    FORM = null; closeModal(); toast('Saved'); route();
  };

  if (mod === 'employees' && isNew) {
    const chk = document.createElement('div');
    chk.className = 'checkline mt';
    chk.innerHTML = `<input type="checkbox" id="newHireChk">
      <label for="newHireChk" style="margin:0">New hire: add required starter training (orientation, WHMIS, emergency procedures)</label>`;
    $('#g-form').querySelector('.form-grid').after(chk);
  }
}

/* ============ ERG (EMERGENCY RESPONSE GUIDEBOOK) ============ */
function ergSearch(q) {
  q = (q || '').trim().toLowerCase();
  if (!q) return ERG_INDEX.slice(0, 100);
  return ERG_INDEX.filter(r => r[1].toLowerCase().includes(q) || r[0] === q.replace(/\D/g, ''))
    .slice(0, 100);
}

function ergDetailHTML(un, guide) {
  const g = ERG_GUIDES[String(guide)];
  if (!g) return '<div class="card mt">Guide not found.</div>';
  const t = ERG_TIH.filter(x => x[0] === String(un));
  return `<div class="card mt" id="erg-detail-card">
    <h3>Guide ${guide}: ${esc(g.title)}</h3>
    <p class="muted">UN ${esc(String(un))}${t.length ? '. Toxic inhalation hazard material.' : ''}</p>
    ${t.map(x => `<h4>Isolation and protective action distances</h4>
      <div class="table-wrap"><table>
        <thead><tr><th>Spill size</th><th>First isolate in all directions</th><th>Protect persons downwind, day</th><th>Protect persons downwind, night</th></tr></thead>
        <tbody>
          <tr><td>Small spill</td><td>${esc(x[2])} m</td><td>${esc(x[3])} km</td><td>${esc(x[4])} km</td></tr>
          <tr><td>Large spill</td><td>${esc(x[5])} m</td><td>${esc(x[6])} km</td><td>${esc(x[7])} km</td></tr>
        </tbody></table></div>`).join('')}
    ${g.sections.map(s => `<h4>${esc(s.h)}</h4><ul class="erg-list">${s.items
      .map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}
    <p class="muted mt">Reference: US DOT Emergency Response Guidebook (public domain). Follow your site emergency procedures and call 911 for any actual emergency.</p>
  </div>`;
}

async function renderERG() {
  $('#page-title').textContent = 'ERG';
  $('#topbar-actions').innerHTML = '<button class="btn" id="erg-print">Print</button>';
  let q = '';
  // static shell: the search input is rendered once so typing keeps focus
  $('#view').innerHTML = `
    <div class="card"><h3>Emergency Response Guidebook</h3>
    <p class="muted">Full guidebook: search by UN number or material name, then open the response guide.
    All 62 guide pages and the complete material index are included. Distances for toxic inhalation
    hazards show on the guide page.</p>
    <input id="erg-search" placeholder="UN number or material name, for example 1203 or chlorine">
    <p class="muted mt" id="erg-count"></p>
    <div class="table-wrap"><table>
      <thead><tr><th>UN number</th><th>Material</th><th>Guide</th><th>Toxic inhalation hazard</th><th></th></tr></thead>
      <tbody id="erg-body"></tbody></table></div>
    </div>
    <div id="erg-detail"></div>`;
  $('#erg-search').onsubmit = e => e.preventDefault();
  const draw = () => {
    const matches = ergSearch(q);
    $('#erg-count').textContent = 'Showing ' + matches.length + (matches.length === 100 ? '+' : '') +
      ' of ' + ERG_INDEX.length + ' materials.';
    $('#erg-body').innerHTML = matches.map(m => `<tr class="clickable" data-erg-un="${esc(m[0])}" data-erg-guide="${m[2]}">
      <td>${esc(m[0])}</td><td>${esc(m[1])}</td><td>${esc(String(m[2]))}</td>
      <td>${m[3] ? 'Yes' : ''}</td>
      <td class="right"><button class="btn btn-sm" data-erg-open="1">Open guide</button></td></tr>`).join('')
      || '<tr><td colspan="99" class="muted">No materials found.</td></tr>';
    $('#erg-body').querySelectorAll('[data-erg-un]').forEach(tr =>
      tr.onclick = () => {
        $('#erg-detail').innerHTML = ergDetailHTML(tr.dataset.ergUn, tr.dataset.ergGuide);
        $('#erg-print').onclick = () => window.print();
        if ($('#erg-detail').scrollIntoView) $('#erg-detail').scrollIntoView({ behavior: 'smooth' });
      });
    $('#erg-print').onclick = () => window.print();
  };
  $('#erg-search').oninput = e => { q = e.target.value; draw(); };
  draw();
}

/* ============ SDS ACCESS GRANTS (ADMIN TO EMPLOYEE) ============ */
async function openSDSAccess(r) {
  if (!r) return;
  const users = (await API.list('users', {}))
    .filter(u => u.role !== 'SUPER_ADMIN' && u.role !== 'AGENCY_ADMIN');
  const granted = r.grantedTo || [];
  openModal(`<h2>SDS access: ${esc(r.title)}</h2>
    <p class="muted">Choose which users can see this SDS sheet. Admins see every sheet;
    everyone else sees only the sheets their account is granted here.</p>
    <form id="sds-access-form">
      ${users.map(u => `<div class="checkline"><input type="checkbox" data-user="${u.id}" ${granted.includes(u.id) ? 'checked' : ''}>
        ${esc(u.fullName || '')} (${esc(u.role)}), ${esc(u.email || '')}</div>`).join('')
        || '<p class="muted">No staff accounts yet. Add logins in Settings first.</p>'}
      <div class="row gap mt">
        <button class="btn btn-primary" type="submit">Save access</button>
        <button class="btn" type="button" id="sds-cancel">Cancel</button>
      </div>
    </form>`);
  $('#sds-cancel').onclick = () => { closeModal(); route(); };
  $('#sds-access-form').onsubmit = async ev => {
    ev.preventDefault();
    const ids = [...document.querySelectorAll('[data-user]:checked')].map(c => c.dataset.user);
    await API.update('documents', r.id, { grantedTo: ids });
    closeModal(); toast('SDS access saved'); route();
  };
}

/* ============ INSPECTION COMPLETION (ASSIGNEE) ============ */
function openCompleteInspection(r) {
  if (!r) return;
  const items = (r.items && r.items.length) ? r.items : [{ text: 'Inspection carried out', result: 'na', note: '' }];
  openModal(`<h2>Complete inspection: ${esc(r.title)}</h2>
    <p class="muted">Site: ${esc(r.site || '')}${r.area ? ', ' + esc(r.area) : ''} ·
    Scheduled: ${fmt(r.date)} · Due: ${fmt(r.dueDate)}</p>
    <form id="ins-complete-form">
      <h3 class="mt">Checklist</h3>
      ${items.map((it, i) => `<div class="row gap mb" style="align-items:flex-end">
        <div style="flex:2"><label>${esc(it.text)}</label>
          <input type="hidden" data-cmp-text="${i}" value="${esc(it.text)}"></div>
        <div style="flex:1"><label>Result</label>
          <select data-cmp-result="${i}">
            <option value="pass" ${it.result === 'pass' ? 'selected' : ''}>pass</option>
            <option value="fail" ${it.result === 'fail' ? 'selected' : ''}>fail</option>
            <option value="na" ${it.result === 'na' ? 'selected' : ''}>na</option>
          </select></div>
        <div style="flex:2"><label>Note</label>
          <input data-cmp-note="${i}" value="${esc(it.note || '')}"></div>
      </div>`).join('')}
      <h3 class="mt">Overall result</h3>
      <div class="form-grid mt">
        <div><label>Result *</label>
          <select id="cmp-result">
            <option value="">Select result</option>
            <option>Pass</option>
            <option>Pass with findings</option>
            <option>Fail</option>
          </select></div>
        <div><label>Completed date</label><input id="cmp-date" type="date" value="${todayISO()}"></div>
      </div>
      <div class="mt"><label>Findings (required unless result is Pass)</label>
        <textarea id="cmp-findings" rows="4" placeholder="What was found, including anything that needs fixing"></textarea></div>
      <div class="mt"><label>Notes for the supervisor</label>
        <textarea id="cmp-notes" rows="3"></textarea></div>
      <div class="login-error" id="cmp-error"></div>
      <div class="row gap mt">
        <button class="btn btn-primary" type="submit">Send to supervisor</button>
        <button class="btn" type="button" id="cmp-cancel">Cancel</button>
      </div>
    </form>`);
  $('#cmp-cancel').onclick = () => { closeModal(); route(); };
  $('#ins-complete-form').onsubmit = async ev => {
    ev.preventDefault();
    const result = $('#cmp-result').value;
    const findings = String($('#cmp-findings').value || '').trim();
    $('#cmp-error').textContent = '';
    if (!result) { $('#cmp-error').textContent = 'Select the overall result.'; return; }
    if (!findings && result !== 'Pass') {
      $('#cmp-error').textContent = 'Findings are required unless the result is Pass.'; return;
    }
    const items2 = items.map((it, i) => ({
      text: it.text,
      result: document.querySelector(`[data-cmp-result="${i}"]`).value,
      note: document.querySelector(`[data-cmp-note="${i}"]`).value
    }));
    await API.update('inspections', r.id, {
      items: items2, result, findings,
      notes: $('#cmp-notes').value,
      completedDate: $('#cmp-date').value || todayISO(),
      status: 'Completed', reviewed: false
    });
    closeModal();
    toast('Inspection completed and sent for review');
    route();
  };
}

/* ============ BULK TRAINING / CERTIFICATE ASSIGNMENT ============ */
async function openBulkAssign() {
  const emps = await API.list('employees', {});
  openModal(`<h2>Bulk assign training or certificates</h2>
    <p class="muted">The same entry is added to every employee you tick. Use Certificates for anything
    with an expiry you want tracked; notifications use the expiry date.</p>
    <form id="bulk-form">
      <div class="form-grid mt">
        <div><label>Type</label><select id="bulk-type"><option>Certificate</option><option>Training</option></select></div>
        <div><label>Name</label><input id="bulk-name" required placeholder="for example WHMIS 2026"></div>
        <div><label>Issuer</label><input id="bulk-issuer" placeholder="optional"></div>
        <div><label>Date</label><input id="bulk-date" type="date" value="${todayISO()}"></div>
        <div><label>Expiry</label><input id="bulk-expiry" type="date"></div>
      </div>
      <h3 class="mt">Employees</h3>
      ${emps.map(e => `<div class="checkline"><input type="checkbox" data-emp="${e.id}">
        ${esc(e.name)}${e.department ? ' (' + esc(e.department) + ')' : ''}</div>`).join('')
        || '<p class="muted">No employees on file yet.</p>'}
      <div class="row gap mt">
        <button class="btn btn-primary" type="submit">Assign to selected</button>
        <button class="btn" type="button" id="bulk-cancel">Cancel</button>
      </div>
    </form>`);
  $('#bulk-cancel').onclick = () => closeModal();
  $('#bulk-form').onsubmit = async ev => {
    ev.preventDefault();
    const ids = [...document.querySelectorAll('[data-emp]:checked')].map(c => c.dataset.emp);
    if (!ids.length) return toast('Tick at least one employee');
    const name = $('#bulk-name').value.trim();
    if (!name) return toast('Enter a name');
    const isCert = $('#bulk-type').value === 'Certificate';
    const rec = isCert
      ? { name, issuer: $('#bulk-issuer').value.trim(), issued: $('#bulk-date').value || todayISO(),
          expiry: $('#bulk-expiry').value || '' }
      : { name, date: $('#bulk-date').value || todayISO(), expiry: $('#bulk-expiry').value || '' };
    for (const id of ids) {
      const emp = emps.find(e => e.id === id);
      if (!emp) continue;
      if (isCert) { emp.certificates = emp.certificates || []; emp.certificates.push(rec); }
      else { emp.trainings = emp.trainings || []; emp.trainings.push(rec); }
      await API.update('employees', id,
        { certificates: emp.certificates || [], trainings: emp.trainings || [] });
    }
    closeModal(); toast('Assigned to ' + ids.length + ' employee(s)');
    route();
  };
}

/* ============ CERTIFICATE EXPIRY NOTIFICATIONS ============ */
async function inspectionAlerts() {
  const ins = await API.list('inspections', {});
  return ins.filter(i => i.status === 'Completed' && !i.reviewed)
    .map(i => ({ inspection: i }));
}
async function certAlerts() {
  const emps = await API.list('employees', {});
  const alerts = [];
  emps.forEach(e => (e.certificates || []).forEach(c => {
    if (!c.expiry) return;
    const d = daysUntil(c.expiry);
    if (d <= 30) alerts.push({ emp: e, cert: c, days: d });
  }));
  alerts.sort((x, y) => x.days - y.days);
  return alerts;
}
function certStatusLabel(d) {
  return d < 0 ? 'EXPIRED ' + (-d) + ' day(s) ago' : d === 0 ? 'expires today' : d + ' day(s) left';
}
async function openCertAlerts() {
  const [alerts, ins] = await Promise.all([certAlerts(), inspectionAlerts()]);
  openModal(`<h2>Notifications</h2>
    <p class="muted">Certificates at 1 month, 2 weeks, 1 week, 3 days, 1 day, and day of expiry,
    plus inspections completed by staff that still need review. Items stay on this list
    until renewed or reviewed.</p>
    ${ins.length ? `<h3 class="mt">Completed inspections awaiting review</h3>
      <div class="table-wrap"><table>
      <thead><tr><th>Inspection</th><th>Site</th><th>Result</th><th>Completed</th><th></th></tr></thead>
      <tbody>${ins.map(al => { const i = al.inspection;
        return `<tr><td>${esc(i.title)}</td><td>${esc(i.site || '')}</td>
          <td><span class="badge ${i.result === 'Fail' ? 'bad' : i.result === 'Pass' ? 'ok' : 'warn'}">${esc(i.result || '')}</span></td>
          <td>${fmt(i.completedDate)}</td>
          <td class="right"><button class="btn btn-sm" data-ins-review="${i.id}">Open</button></td></tr>`;
      }).join('')}</tbody></table></div>` : ''}
    <h3 class="mt">Certificates</h3>
    ${alerts.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Employee</th><th>Certificate</th><th>Expiry</th><th>Status</th><th></th></tr></thead>
      <tbody>${alerts.map(al => {
        const sup = (al.emp.supervisor || '').trim();
        const subject = encodeURIComponent('Certificate expiring: ' + al.cert.name + ' (' + al.emp.name + ')');
        const body = encodeURIComponent(al.emp.name + "'s certificate " + al.cert.name +
          ' expires on ' + al.cert.expiry + ' (' + certStatusLabel(al.days) +
          '). Please schedule the renewal.');
        return `<tr><td>${esc(al.emp.name)}</td><td>${esc(al.cert.name)}</td>
          <td>${fmt(al.cert.expiry)}</td>
          <td><span class="badge ${al.days < 0 ? 'bad' : al.days <= 7 ? 'warn' : 'ok'}">${esc(certStatusLabel(al.days))}</span></td>
          <td class="right">${sup
            ? `<a class="btn btn-sm" href="mailto:${encodeURIComponent(sup)}?subject=${subject}&body=${body}">Email supervisor</a>`
            : '<span class="muted">No supervisor email</span>'}</td></tr>`;
      }).join('')}</tbody></table></div>`
      : '<p class="muted">No certificates are expiring soon.</p>'}
    <div class="row gap mt"><button class="btn" type="button" id="cert-close">Close</button></div>`);
  $('#cert-close').onclick = () => closeModal();
  [...document.querySelectorAll('#modal-box [data-ins-review]')].forEach(b =>
    b.onclick = () => { closeModal(); location.hash = '#/inspections/' + b.dataset.insReview; });
}

/* ================= 6. DASHBOARD / KPIs ================= */
async function renderDashboard() {
  const [events, cas, fus, equipment, employees, docs] = await Promise.all([
    API.list('events', {}), API.list('corrective_actions', {}), API.list('follow_ups', {}),
    API.list('equipment', {}), API.list('employees', {}), API.list('documents', {})
  ]);
  const openEvents = events.filter(e => e.status !== 'submitted');
  const openCA = cas.filter(c => c.status !== 'Closed');
  const overdue = fus.filter(f => f.status !== 'Closed' && daysUntil(f.dueDate) < 0);
  const expCerts = [];
  employees.forEach(emp => (emp.certificates || []).forEach(c =>
    expCerts.push({ ...c, emp: emp.name, days: daysUntil(c.expiry) })));
  const soon = expCerts.filter(c => c.days !== null && c.days <= 30).sort((a, b) => a.days - b.days);
  const eqDue = equipment.filter(q => daysUntil(q.nextInspection) !== null && daysUntil(q.nextInspection) <= 7);

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    months.push({ key: d.toISOString().slice(0, 7),
      label: d.toLocaleString('en-CA', { month: 'short' }) });
  }
  const byMonth = months.map(m => ({
    label: m.label, value: events.filter(e => (e.date || '').startsWith(m.key)).length }));
  const byType = {};
  events.forEach(e => byType[e.eventType || 'Other'] = (byType[e.eventType || 'Other'] || 0) + 1);

  $('#view').innerHTML = `
    <div class="tile-grid">
      <div class="tile"><div class="num">${events.length}</div><div class="lbl">Total events</div></div>
      <div class="tile warn"><div class="num">${openEvents.length}</div><div class="lbl">Draft events</div></div>
      <div class="tile bad"><div class="num">${overdue.length}</div><div class="lbl">Overdue follow-ups</div></div>
      <div class="tile"><div class="num">${openCA.length}</div><div class="lbl">Open corrective actions</div></div>
      <div class="tile ${soon.length ? 'warn' : 'ok'}"><div class="num">${soon.length}</div><div class="lbl">Certificates expiring ≤30 days</div></div>
      <div class="tile"><div class="num">${docs.length}</div><div class="lbl">Documents</div></div>
    </div>
    <div class="row gap wrap">
      <div class="card grow"><h3>Events by month</h3>${barChart(byMonth)}</div>
      <div class="card grow"><h3>Events by type</h3>${barChart(Object.entries(byType).map(([label, value]) => ({ label, value })))}</div>
    </div>
    <div class="row gap wrap">
      <div class="card grow"><h3>Certificates expiring soon</h3>
        ${soon.length ? `<table><tr><th>Employee</th><th>Certificate</th><th>Expiry</th></tr>
        ${soon.map(c => `<tr><td>${esc(c.emp)}</td><td>${esc(c.name)}</td>
          <td>${fmt(c.expiry)} (${c.days}d)</td></tr>`).join('')}</table>`
        : '<p class="muted">Nothing expiring in the next 30 days.</p>'}</div>
      <div class="card grow"><h3>Equipment inspections due ≤7 days</h3>
        ${eqDue.length ? `<table><tr><th>Equipment</th><th>Due</th></tr>
        ${eqDue.map(q => `<tr><td>${esc(q.name)}</td><td>${fmt(q.nextInspection)}</td></tr>`).join('')}</table>`
        : '<p class="muted">Nothing due this week.</p>'}</div>
    </div>
    <div class="card"><h3>Recent events</h3>
      <table><tr><th>Ref</th><th>Name</th><th>Date</th><th>Status</th></tr>
      ${events.slice(0, 6).map(e => `<tr class="clickable" data-open="#/events/${e.id}">
        <td>${esc(e.ref)}</td><td>${esc(e.name)}</td><td>${fmt(e.date)}</td><td>${statusBadge(e.status)}</td></tr>`).join('')}
      </table></div>`;
  $('#topbar-actions').innerHTML = `<a class="btn" href="#/events/kpi">Events KPI report</a>`;
}

async function renderEventsKPI() {
  const events = await API.list('events', {});
  const byType = {}, byStatus = { draft: 0, submitted: 0 }, costs = {};
  let sumRisk = 0, riskCount = 0;
  events.forEach(e => {
    byType[e.eventType || 'Other'] = (byType[e.eventType || 'Other'] || 0) + 1;
    byStatus[e.status || 'draft'] = (byStatus[e.status || 'draft'] || 0) + 1;
    costs[e.eventType || 'Other'] = (costs[e.eventType || 'Other'] || 0) + (e.totalCost || 0);
    if (e.riskMatrix) { sumRisk += e.riskMatrix.severity * e.riskMatrix.likelihood; riskCount++; }
  });
  $('#view').innerHTML = `
    <h2>KPI report for all events</h2>
    <div class="tile-grid">
      <div class="tile"><div class="num">${events.length}</div><div class="lbl">Events</div></div>
      <div class="tile"><div class="num">${fmtMoney(Object.values(costs).reduce((a, b) => a + b, 0))}</div><div class="lbl">Total costs</div></div>
      <div class="tile"><div class="num">${riskCount ? (sumRisk / riskCount).toFixed(1) : 'N/A'}</div><div class="lbl">Average risk score</div></div>
      <div class="tile ok"><div class="num">${byStatus.submitted}</div><div class="lbl">Submitted</div></div>
      <div class="tile warn"><div class="num">${byStatus.draft}</div><div class="lbl">Drafts</div></div>
    </div>
    <div class="row gap wrap">
      <div class="card grow"><h3>Events by type</h3>${barChart(Object.entries(byType).map(([label, value]) => ({ label, value })))}</div>
      <div class="card grow"><h3>Costs by type</h3>${barChart(Object.entries(costs).map(([label, value]) => ({ label, value })))}</div>
    </div>
    <button class="btn" onclick="window.print()">Print report</button>`;
}

/* ================= 7. EVENTS, multi-step report ================= */
const EVENT_STEPS = ['Info', 'Damages', 'Impacts', 'Follow ups', 'Investigation',
  'Risk matrix', 'Corrective actions', 'Multimedia', 'Review & submit'];

function stepDone(r, i) {
  switch (i) {
    case 0: return !!(r.name && r.date);
    case 1: return ((r.damages?.injuries || []).length + (r.damages?.material || []).length) > 0;
    case 2: return !!r.impacts;
    case 3: return (r.followUps || []).length > 0;
    case 4: return !!(r.investigation && r.investigation.personsInvolved);
    case 5: return !!r.riskMatrix;
    case 6: return (r.correctiveActions || []).length > 0;
    case 7: return ((r.media || []).length + (r.damages?.media || []).length) > 0;
    default: return true;
  }
}

const WIZARD_REPS = {
  injuries:    [{ k:'person', label:'Person' }, { k:'type', label:'Type of injury' },
                { k:'description', label:'Description' }, { k:'cost', label:'Cost', num:true }],
  material:    [{ k:'item', label:'Item' }, { k:'description', label:'Description' },
                { k:'cost', label:'Cost', num:true }],
  followUps:   [{ k:'title', label:'Title' }, { k:'owner', label:'Owner' },
                { k:'dueDate', label:'Due date', date:true }, { k:'status', label:'Status' }],
  correctiveActions: [{ k:'title', label:'Title' }, { k:'owner', label:'Owner' },
                { k:'dueDate', label:'Due date', date:true }, { k:'status', label:'Status' },
                { k:'cost', label:'Cost', num:true }]
};

async function renderEventWizard(id, step) {
  const isNew = !id;
  let r = isNew ? {
    status: 'draft', date: todayISO(), reportingPerson: State.user.fullName,
    damages: { injuries: [], material: [], media: [] }, impacts: {},
    followUps: [], investigation: { media: [] }, correctiveActions: [], media: []
  } : await API.get('events', id);
  if (!r) { toast('Event not found'); location.hash = '#/events'; return; }

  FORM = {
    mod: 'events', data: r, isNew, step,
    render: () => renderLocal(),
    rerenderRep: k => renderWizardRep(k),
    saveStep: (s, advance) => saveWizard(s, advance),
    submit: () => submitWizard()
  };

  function renderWizardRep(k) {
    const host = $('#rep-' + k);
    if (!host) return;
    if (k === 'media' || k === 'damagesMedia' || k === 'investigationMedia') {
      host.innerHTML = mediaEditHTML(k, mediaArr(r, k));
      return;
    }
    const sub = WIZARD_REPS[k];
    const arr = repArr(r, k);
    host.innerHTML = arr.length ? arr.map((row, i) => `
      <div class="row gap mb" style="align-items:flex-start">
        ${sub.map(s => `<div style="flex:1"><label>${s.label}</label>
          <input data-rep="${k}" data-idx="${i}" data-sub="${s.k}"
            type="${s.date ? 'date' : s.num ? 'number' : 'text'}"
            value="${esc(row[s.k] ?? '')}"></div>`).join('')}
        <button type="button" class="btn btn-sm" style="margin-top:18px" data-del-rep="${k}" data-del-idx="${i}">Remove</button>
      </div>`).join('') : '<p class="muted">None yet.</p>';
  }

  function renderLocal() {
    const done = EVENT_STEPS.map((_, i) => stepDone(r, i));
    $('#view').innerHTML = `
      <div class="wizard-steps">
        ${EVENT_STEPS.map((s, i) => `<button data-step="${i}"
          class="${i === step ? 'active' : ''} ${done[i] ? 'done' : ''}">${i + 1}. ${s}</button>`).join('')}
      </div>
      <div class="card" id="wiz-body">${stepHTML(step)}</div>`;
    if (step === 1) { renderWizardRep('injuries'); renderWizardRep('material'); renderWizardRep('damagesMedia'); }
    if (step === 3) renderWizardRep('followUps');
    if (step === 4) renderWizardRep('investigationMedia');
    if (step === 6) renderWizardRep('correctiveActions');
    if (step === 7) renderWizardRep('media');
    $('#view').querySelectorAll('[data-step]').forEach(b =>
      b.onclick = async () => {
        const target = +b.dataset.step;
        if (target !== step && !(await saveWizard(step, false))) return;
        renderEventWizard(id || r.id, target);
      });
    $('#page-title').textContent = isNew ? 'New event report' : `Edit event ${r.ref || ''}`;
  }

  function stepHTML(step) {
    const inp = (k, label, type = 'text', req = false) =>
      `<div><label>${label}${req ? ' *' : ''}</label><input id="w_${k}" type="${type}" value="${esc(r[k] ?? '')}" ${req ? 'required' : ''}></div>`;
    switch (step) {
      case 0: return `<h2>1. Event info</h2><div class="form-grid">
        ${inp('name', 'Event name', 'text', true)}
        <div><label>Type of event *</label><select id="w_eventType">
          ${['Injury','Material damage','Environment','Near miss','Security','Fire','Other'].map(o =>
            `<option ${o === r.eventType ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        ${inp('date', 'Date', 'date', true)}
        ${inp('reportingPerson', 'Reporting person')}
        ${inp('manager', 'Manager')}
        ${inp('siteName', 'Site')}
        ${inp('locationDetails', 'Site or location details')}
        <div class="full"><label>Employee *</label><select id="w_employeeType">
          ${['Internal','External','No Employee - Near miss confirmed'].map(o =>
            `<option ${o === r.employeeType ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      </div>${navBtns()}`;

      case 1: return `<h2>2. Damages</h2>
        <h3 class="mt">Injury</h3><div id="rep-injuries"></div>
        <button type="button" class="btn btn-sm mt mb" data-add-rep="injuries">Add injury</button>
        <h3 class="mt">Material damage</h3><div id="rep-material"></div>
        <button type="button" class="btn btn-sm mt mb" data-add-rep="material">Add material damage</button>
        <h3 class="mt">Media for this section</h3><div id="rep-damagesMedia"></div>
        ${navBtns()}`;

      case 2: { const im = r.impacts || {};
        return `<h2>3. Impacts</h2><div class="form-grid">
        ${['firstAid:First aid','environment:Environment','incident:Incident','miscellaneous:Miscellaneous'].map(x => {
          const [k, lbl] = x.split(':');
          return `<div class="checkline"><input type="checkbox" id="w_imp_${k}" ${im[k] ? 'checked' : ''}>
          <label style="margin:0" for="w_imp_${k}">${lbl}</label></div>`; }).join('')}
        <div class="full"><label>Impact notes</label><textarea id="w_imp_notes" rows="3">${esc(im.notes || '')}</textarea></div>
        </div>${navBtns()}`; }

      case 3: return `<h2>4. Follow ups</h2>
        <div id="rep-followUps"></div>
        <button type="button" class="btn btn-sm" data-add-rep="followUps">Add follow-up</button>
        ${navBtns()}`;

      case 4: return `<h2>5. Investigation</h2><div class="form-grid">
        <div class="full"><label>Persons involved</label><textarea id="w_inv_persons" rows="2">${esc(r.investigation?.personsInvolved || '')}</textarea></div>
        <div class="full"><label>Contributing factors</label><textarea id="w_inv_factors" rows="3">${esc(r.investigation?.contributingFactors || '')}</textarea></div>
        <div class="full"><label>Equipment in cause</label><textarea id="w_inv_equipment" rows="2">${esc(r.investigation?.equipment || '')}</textarea></div>
        <div class="full"><label>Recommendations</label><textarea id="w_inv_reco" rows="3">${esc(r.investigation?.recommendations || '')}</textarea></div>
        <div class="full"><label>Investigation media</label><div id="rep-investigationMedia"></div></div>
        </div>${navBtns()}`;

      case 5: return `<h2>6. Risk matrix</h2>
        <p class="muted mb">Click a cell to set severity × likelihood.</p>
        ${riskMatrixHTML(r.riskMatrix)}${navBtns()}`;

      case 6: return `<h2>7. Corrective actions</h2>
        <div id="rep-correctiveActions"></div>
        <button type="button" class="btn btn-sm" data-add-rep="correctiveActions">Add corrective action</button>
        ${navBtns()}`;

      case 7: return `<h2>8. Multimedia</h2>
        <div id="rep-media"></div>${navBtns()}`;

      case 8: return `<h2>9. Review & submit</h2>
        <ol class="steps-done">${EVENT_STEPS.slice(0, 8).map((s, i) =>
          `<li>${s} ${stepDone(r, i) ? '<span class="badge ok">done</span>' : '<span class="badge warn">incomplete</span>'}</li>`).join('')}</ol>
        ${r.status === 'submitted' ? '<div class="confirm-banner">Report already confirmed and submitted.</div>' : `
          <div class="row gap mt">
            <button class="btn btn-primary" id="w-submit">Confirm sending report</button>
            <a class="btn" href="#/events">Cancel</a>
          </div>`}
        <p class="muted mt">Submitting confirms all steps above. The event appears in KPI reporting immediately.</p>`;
    }
  }

  function navBtns() {
    return `<div class="row gap mt">
      <button class="btn btn-primary" id="w-save">Save and continue</button>
      <a class="btn" href="#/events">Cancel</a></div>`;
  }

  async function saveWizard(fromStep, advance = true) {
    const val = id => { const el = $('#w_' + id); return el ? el.value : undefined; };
    if (fromStep === 0) {
      r.name = val('name'); r.eventType = val('eventType'); r.date = val('date');
      r.reportingPerson = val('reportingPerson'); r.manager = val('manager');
      r.siteName = val('siteName'); r.locationDetails = val('locationDetails');
      r.employeeType = val('employeeType');
      if (!r.name || !r.date) { toast('Name and date are required'); return false; }
    }
    if (fromStep === 2 && $('#w_imp_firstAid')) {
      r.impacts = { firstAid: $('#w_imp_firstAid').checked, environment: $('#w_imp_environment').checked,
        incident: $('#w_imp_incident').checked, miscellaneous: $('#w_imp_miscellaneous').checked,
        notes: val('imp_notes') };
    }
    if (fromStep === 4 && $('#w_inv_persons')) {
      r.investigation = { ...r.investigation, personsInvolved: val('inv_persons'),
        contributingFactors: val('inv_factors'), equipment: val('inv_equipment'),
        recommendations: val('inv_reco') };
    }
    r.totalCost =
      (r.damages.material || []).reduce((a, m) => a + (+m.cost || 0), 0) +
      (r.damages.injuries || []).reduce((a, i) => a + (+i.cost || 0), 0) +
      (r.correctiveActions || []).reduce((a, c) => a + (+c.cost || 0), 0);

    if (isNew) {
      const n = (await API.list('events', {})).length + 1;
      r.ref = 'EV-' + String(n).padStart(4, '0');
      const rec = await API.create('events', r);
      r.id = rec.id;
      FORM.isNew = false;
      history.replaceState(null, '', '#/events/' + rec.id + '/edit');
    } else {
      await API.update('events', r.id, r);
    }
    if (advance) renderEventWizard(r.id, Math.min(fromStep + 1, EVENT_STEPS.length - 1));
    return true;
  }

  async function submitWizard() {
    if (!EVENT_STEPS.slice(0, 8).every((_, i) => stepDone(r, i)))
      return toast('Complete every step before submitting.');
    if (!confirm('Confirm sending this report?')) return;
    r.status = 'submitted';
    await API.update('events', r.id, { status: 'submitted' });
    toast('Report confirmed and submitted.');
    location.hash = '#/events/' + r.id;
  }

  $('#topbar-actions').innerHTML = '';
  renderLocal();
}

function riskMatrixHTML(sel) {
  const s = sel ? sel.severity : 0, l = sel ? sel.likelihood : 0;
  let html = '<table class="risk-matrix"><tr><th></th>' +
    [1,2,3,4,5].map(v => `<th>Severity ${v}</th>`).join('') + '</tr>';
  for (let li = 5; li >= 1; li--) {
    html += `<tr><th>Likelihood ${li}</th>`;
    for (let si = 1; si <= 5; si++) {
      const score = si * li;
      const cls = score <= 4 ? 'risk-low' : score <= 9 ? 'risk-med' : score <= 15 ? 'risk-high' : 'risk-crit';
      html += `<td class="${cls} ${si === s && li === l ? 'selected' : ''}" data-risk="${si}:${li}">${score}</td>`;
    }
    html += '</tr>';
  }
  return html + '</table>' +
    (sel ? `<p class="mt">Risk score: <b>${sel.severity * sel.likelihood}</b> (severity ${sel.severity} × likelihood ${sel.likelihood})</p>`
         : '<p class="muted mt">No score selected yet.</p>');
}

/* ---------- event detail ---------- */
async function renderEventDetail(id) {
  const r = await API.get('events', id);
  if (!r) { toast('Event not found'); location.hash = '#/events'; return; }
  const im = r.impacts || {};
  const cost = r.totalCost || 0;
  const risk = r.riskMatrix;
  $('#page-title').textContent = `${r.ref || 'Event'}: ${r.name || ''}`;
  $('#topbar-actions').innerHTML = `
    <button class="btn btn-primary" id="ev-edit">Edit (wizard)</button>
    <button class="btn" id="ev-print">Print</button>`;
  $('#view').innerHTML = `
    ${r.status === 'submitted' ? '<div class="confirm-banner">Report confirmed and submitted.</div>'
      : '<div class="card"><b>Draft</b>. Open Edit to continue the report steps.</div>'}
    <div class="row gap wrap">
      <div class="card grow"><h3>Info</h3><dl class="kv">
        <dt>Name</dt><dd>${esc(r.name)}</dd>
        <dt>Type of event</dt><dd>${esc(r.eventType || '')}</dd>
        <dt>Date</dt><dd>${fmt(r.date)}</dd>
        <dt>Reporting person</dt><dd>${esc(r.reportingPerson || '')}</dd>
        <dt>Manager</dt><dd>${esc(r.manager || '')}</dd>
        <dt>Employee</dt><dd>${esc(r.employeeType || '')}</dd>
      </dl></div>
      <div class="card grow"><h3>Event site</h3><dl class="kv">
        <dt>Site</dt><dd>${esc(r.siteName || '')}</dd>
        <dt>Location details</dt><dd>${esc(r.locationDetails || '')}</dd>
        <dt>Total cost</dt><dd>${fmtMoney(cost)}</dd>
      </dl></div>
    </div>
    <div class="row gap wrap">
      <div class="card grow"><h3>Damages</h3>
        <h3>Injury</h3>
        ${(r.damages?.injuries || []).map(i => `<p>• ${esc(i.person)}, ${esc(i.type)} (${esc(i.description)}) ${fmtMoney(i.cost)}</p>`).join('') || '<p class="muted">None recorded.</p>'}
        <h3 class="mt">Material</h3>
        ${(r.damages?.material || []).map(m => `<p>• ${esc(m.item)}, ${esc(m.description)} ${fmtMoney(m.cost)}</p>`).join('') || '<p class="muted">None recorded.</p>'}
        ${mediaViewHTML(r.damages?.media)}
      </div>
      <div class="card grow"><h3>Impacts</h3>
        ${['firstAid:First aid','environment:Environment','incident:Incident','miscellaneous:Miscellaneous'].map(x => {
          const [k, lbl] = x.split(':');
          return `<p>${im[k] ? 'Yes' : 'No'} ${lbl}</p>`;
        }).join('')}
        <p class="muted">${esc(im.notes || '')}</p>
      </div>
    </div>
    <div class="row gap wrap">
      <div class="card grow"><h3>Investigation</h3><dl class="kv">
        <dt>Persons involved</dt><dd>${esc(r.investigation?.personsInvolved || 'N/A')}</dd>
        <dt>Contributing factors</dt><dd>${esc(r.investigation?.contributingFactors || 'N/A')}</dd>
        <dt>Equipment in cause</dt><dd>${esc(r.investigation?.equipment || 'N/A')}</dd>
        <dt>Recommendations</dt><dd>${esc(r.investigation?.recommendations || 'N/A')}</dd>
      </dl>${mediaViewHTML(r.investigation?.media)}</div>
      <div class="card grow"><h3>Risk matrix</h3>${riskMatrixHTML(risk)}</div>
    </div>
    <div class="row gap wrap">
      <div class="card grow"><h3>Follow ups</h3>
        ${(r.followUps || []).map(f => `<p>• ${esc(f.title)}, ${fmt(f.dueDate)} (${esc(f.owner || '')}) ${statusBadge(f.status)}</p>`).join('') || '<p class="muted">None.</p>'}</div>
      <div class="card grow"><h3>Corrective actions</h3>
        ${(r.correctiveActions || []).map(c => `<p>• ${esc(c.title)}, ${fmt(c.dueDate)} ${statusBadge(c.status)} ${fmtMoney(c.cost)}</p>`).join('') || '<p class="muted">None.</p>'}</div>
    </div>
    <div class="card"><h3>Event KPI</h3>
      <div class="tile-grid">
        <div class="tile"><div class="num">${risk ? risk.severity * risk.likelihood : 'N/A'}</div><div class="lbl">Risk score</div></div>
        <div class="tile"><div class="num">${(r.correctiveActions || []).length}</div><div class="lbl">Corrective actions</div></div>
        <div class="tile"><div class="num">${(r.followUps || []).length}</div><div class="lbl">Follow-ups</div></div>
        <div class="tile"><div class="num">${fmtMoney(cost)}</div><div class="lbl">Total cost</div></div>
      </div>
      <h3>Cost breakdown</h3>${barChart([
        { label: 'Injury', value: (r.damages?.injuries || []).reduce((a, i) => a + (+i.cost || 0), 0) },
        { label: 'Material', value: (r.damages?.material || []).reduce((a, m) => a + (+m.cost || 0), 0) },
        { label: 'Corrective', value: (r.correctiveActions || []).reduce((a, c) => a + (+c.cost || 0), 0) }])}
    </div>
    <div class="card"><h3>Multimedia</h3>${mediaViewHTML(r.media) || '<p class="muted">None uploaded.</p>'}</div>`;
  $('#ev-edit').onclick = () => { location.hash = '#/events/' + id + '/edit'; };
  $('#ev-print').onclick = () => window.print();
}

/* ================= 8. MODULE-SPECIFIC DETAILS ================= */

async function renderInspectionDetail(id) {
  const r = await API.get('inspections', id);
  if (!r) { toast('Not found'); location.hash = '#/inspections'; return; }
  const mine = r.assignedTo === State.user.id;
  const isMgr = ['SUPER_ADMIN','AGENCY_ADMIN','SUPERVISOR'].includes(State.user.role);
  $('#page-title').textContent = r.title || 'Inspection';
  $('#topbar-actions').innerHTML =
    `${r.status !== 'Completed' && mine ? '<button class="btn btn-primary" id="ins-complete">Complete</button>' : ''}
     ${r.status === 'Completed' && !r.reviewed && isMgr ? '<button class="btn btn-primary" id="ins-review">Mark reviewed</button>' : ''}
     ${State.user.role === 'EMPLOYEE' ? '' : '<button class="btn btn-primary" id="ins-edit">Edit</button>'}
     <button class="btn" id="ins-print">Print</button>`;
  const items = r.items || [];
  const counts = { pass: 0, fail: 0, na: 0 };
  items.forEach(i => counts[i.result] = (counts[i.result] || 0) + 1);
  $('#view').innerHTML = `
    <div class="row gap wrap">
      <div class="card grow"><h3>Inspection</h3><dl class="kv">
        <dt>Site</dt><dd>${esc(r.site || '')}${r.area ? ', ' + esc(r.area) : ''}</dd>
        <dt>Scheduled</dt><dd>${fmt(r.date)}</dd>
        <dt>Due</dt><dd>${fmt(r.dueDate)}</dd>
        <dt>Assigned to</dt><dd>${esc(r.assignedName || '')}</dd>
        <dt>Status</dt><dd>${statusBadge(r.status || 'Assigned')}</dd>
        <dt>Requested by</dt><dd>${esc(r.inspector || '')}</dd>
        <dt>Schedule</dt><dd>${esc(r.schedule || '')}</dd>
        <dt>Archived</dt><dd>${r.archived ? 'Yes' : 'No'}</dd>
      </dl></div>
      <div class="card grow"><h3>Inspection results</h3>
        ${r.result ? `<p>Overall result: <b>${statusBadge(r.result)}</b></p>
        <p class="muted">Completed ${fmt(r.completedDate)}${r.reviewed ? ', reviewed by ' + esc(r.reviewedBy || '') + ' on ' + fmt(r.reviewedDate) : ', awaiting review'}</p>` : ''}
        ${items.length ? barChart(Object.entries(counts).map(([label, value]) => ({ label, value }))) : ''}
        <h3 class="mt">Listed items out (failed)</h3>
        ${items.filter(i => i.result === 'fail').map(i => `<p>• ${esc(i.text)} ${i.note ? ': ' + esc(i.note) : ''}</p>`).join('') || '<p class="muted">No failed items.</p>'}
      </div>
    </div>
    ${r.findings ? `<div class="card"><h3>Findings from the assignee</h3><p>${esc(r.findings)}</p></div>` : ''}
    <div class="card"><h3>Checklist</h3>
      <table><tr><th>Item</th><th>Result</th><th>Note</th></tr>
      ${items.map(i => `<tr><td>${esc(i.text)}</td><td>${statusBadge(i.result)}</td><td>${esc(i.note || '')}</td></tr>`).join('') || '<tr><td colspan="99" class="muted">No checklist items.</td></tr>'}
      </table></div>
    <div class="card"><h3>Follow-ups</h3>
      ${(r.followUps || []).map(f => `<p>• ${esc(f.title)}, due ${fmt(f.dueDate)} (${esc(f.owner || '')})</p>`).join('') || '<p class="muted">None.</p>'}</div>
    <div class="card"><h3>Multimedia</h3>${mediaViewHTML(r.media) || '<p class="muted">None.</p>'}</div>`;
  if ($('#ins-complete')) $('#ins-complete').onclick = () => openCompleteInspection(r);
  if ($('#ins-review')) $('#ins-review').onclick = async () => {
    await API.update('inspections', r.id, {
      reviewed: true, reviewedBy: State.user.fullName || State.user.email, reviewedDate: todayISO() });
    toast('Marked reviewed'); route();
  };
  if ($('#ins-edit')) $('#ins-edit').onclick = () => openForm('inspections', r);
  $('#ins-print').onclick = () => window.print();
}

async function renderSiteDetail(id) {
  const r = await API.get('sites', id);
  if (!r) return toast('Not found');
  const [emps, events, insp] = await Promise.all([
    API.list('employees', {}), API.list('events', {}), API.list('inspections', {})]);
  $('#page-title').textContent = r.name || 'Site';
  $('#topbar-actions').innerHTML = `<button class="btn btn-primary" id="site-edit">Edit</button>
    <button class="btn" id="site-print">Print</button>`;
  $('#view').innerHTML = `
    <div class="row gap wrap">
      <div class="card grow"><h3>Site information</h3><dl class="kv">
        <dt>Address</dt><dd>${esc(r.address || '')}</dd>
        <dt>Classification</dt><dd>${esc(r.classification || '')} ${esc(r.classificationCode || '')}</dd>
        <dt>Departments</dt><dd>${esc(r.departments || '')}</dd>
        <dt>Work stats</dt><dd>${esc(r.workStats || '')}</dd>
      </dl>
      <h3 class="mt">Contacts</h3>
      ${(r.contacts || []).map(c => `<p>• ${esc(c.name)}, ${esc(c.phone || '')} ${esc(c.email || '')}</p>`).join('') || '<p class="muted">None.</p>'}</div>
      <div class="card grow"><h3>Linked records</h3><dl class="kv">
        <dt>Employees</dt><dd>${emps.filter(e => e.site === r.name).map(e => esc(e.name)).join(', ') || 'N/A'}</dd>
        <dt>Events</dt><dd>${events.filter(e => e.siteName === r.name).map(e => esc(e.ref)).join(', ') || 'N/A'}</dd>
        <dt>Inspections</dt><dd>${insp.filter(i => i.site === r.name).map(i => esc(i.title)).join(', ') || 'N/A'}</dd>
      </dl></div>
    </div>`;
  $('#site-edit').onclick = () => openForm('sites', r);
  $('#site-print').onclick = () => window.print();
}

async function renderEmployeeDetail(id) {
  const r = await API.get('employees', id);
  if (!r) return toast('Not found');
  $('#page-title').textContent = r.name || 'Employee';
  const expiring = (r.certificates || []).filter(c => c.expiry && daysUntil(c.expiry) <= 30);
  $('#topbar-actions').innerHTML = `
    <button class="btn btn-primary" id="emp-edit">Edit</button>
    <a class="btn" id="emp-mail" href="#">Notify supervisor (expiring certificates)</a>
    <button class="btn" id="emp-print">Print</button>`;
  $('#view').innerHTML = `
    <div class="row gap wrap">
      <div class="card grow"><h3>Employee</h3><dl class="kv">
        <dt>Role</dt><dd>${esc(r.role || '')}</dd>
        <dt>Department</dt><dd>${esc(r.department || '')}</dd>
        <dt>Site</dt><dd>${esc(r.site || '')}</dd>
        <dt>Email</dt><dd>${esc(r.email || '')}</dd>
        <dt>Phone</dt><dd>${esc(r.phone || '')}</dd>
        <dt>Hired</dt><dd>${fmt(r.hireDate)}</dd>
        <dt>Supervisor</dt><dd>${esc(r.supervisor || '')}</dd>
      </dl></div>
      <div class="card grow"><h3>Certificates</h3>
        <table><tr><th>Name</th><th>Expiry</th><th>Status</th></tr>
        ${(r.certificates || []).map(c => {
          const d = daysUntil(c.expiry);
          const cls = d === null ? 'gray' : d < 0 ? 'bad' : d <= 30 ? 'warn' : 'ok';
          return `<tr><td>${esc(c.name)}</td><td>${fmt(c.expiry)}</td><td><span class="badge ${cls}">${d === null ? 'no expiry' : d < 0 ? 'EXPIRED' : d + ' days'}</span></td></tr>`;
        }).join('') || '<tr><td colspan=3 class="muted">None</td></tr>'}
        </table></div>
    </div>
    <div class="row gap wrap">
      <div class="card grow"><h3>Training</h3>
        ${(r.trainings || []).map(t => `<p>• ${esc(t.name)}, ${fmt(t.date)}${t.expiry ? ' (expires ' + fmt(t.expiry) + ')' : ''}</p>`).join('') || '<p class="muted">None.</p>'}</div>
      <div class="card grow"><h3>Assets</h3>
        ${(r.assets || []).map(a => `<p>• ${esc(a.name)} ${a.serial ? ' (' + esc(a.serial) + ')' : ''}</p>`).join('') || '<p class="muted">None.</p>'}</div>
    </div>
    <div class="card"><h3>SOP &amp; policy tracking</h3>
      <p class="muted">SOPs and policies are controlled under Documents. Certificate expiry notifications:
      the dashboard flags anything expiring within 30 days. Use “Notify supervisor” to email the list.</p></div>`;
  $('#emp-edit').onclick = () => openForm('employees', r);
  $('#emp-print').onclick = () => window.print();
  const body = expiring.length
    ? `${r.name} has certificates expiring:%0D%0A` + expiring.map(c => `- ${c.name} (${c.expiry})`).join('%0D%0A')
    : `${r.name}'s certificates are all current.`;
  const acct = (await API.list('users', {})).find(u =>
    (u.email || '').toLowerCase() === (r.email || '').toLowerCase());
  $('#view').insertAdjacentHTML('beforeend', `
    <div class="card mt"><h3>Sign-in access</h3>
      ${acct ? `<p>${esc(acct.fullName || '')} signs in with ${esc(acct.email)} as <b>${esc(acct.role || '')}</b>.</p>`
             : '<p class="muted">No login for this employee. Add one in Settings, Login accounts.</p>'}
    </div>`);
  $('#emp-mail').href = `mailto:${encodeURIComponent(r.supervisor || '')}?subject=${encodeURIComponent('Certificate status: ' + r.name)}&body=${body}`;
}

/* ================= 9. SETTINGS ================= */
async function renderSettings() {
  const perms = await permissions();
  const users = await API.list('users', {});
  const mods = Object.keys(MODULES).filter(m =>
    !['dashboard','settings','agencies','user_accounts'].includes(m));
  const myAgency = API.session.asAgencyId || API.session.agencyId
    ? await API.get('agencies', API.session.asAgencyId || API.session.agencyId) : null;
  $('#view').innerHTML = `
    <div class="card"><h3>Access restrictions: which modules each role can open</h3>
      <p class="muted mb">Super Admin and Agency Admin always have full access.
      Supervisor and Employee access is set here. Document confidentiality
      (Public / Internal / Restricted) is enforced on top of this.</p>
      <form id="perm-form"><table class="table-wrap" style="border:none">
        <tr><th>Module</th><th>Supervisor</th><th>Employee</th></tr>
        ${mods.map(m => `<tr><td>${MODULES[m].label}</td>
          <td><input type="checkbox" data-perm="SUPERVISOR" data-mod="${m}" ${(perms.SUPERVISOR || []).includes(m) ? 'checked' : ''}></td>
          <td><input type="checkbox" data-perm="EMPLOYEE" data-mod="${m}" ${(perms.EMPLOYEE || []).includes(m) ? 'checked' : ''}></td></tr>`).join('')}
      </table>
      <button class="btn btn-primary mt" type="submit">Save permissions</button></form>
    </div>
    <div class="card"><h3>Subscription</h3>
      <p>Subscription status for this agency is shown below.</p>
      ${myAgency ? `<p>Status: <b>${esc(myAgency.subscription_status || 'ACTIVE')}</b>
        ${myAgency.subscription_status === 'ACTIVE' ? '' : '. Contact Pitman Safety Solutions to reactivate.'}</p>` : ''}</div>
    <div class="card"><h3>Backend</h3>
      <p class="muted">Current: <b>${API_CONFIG.backend === 'local' ? 'Browser storage (localStorage)' : 'Supabase'}</b>.
      To connect a real database (recommended: Supabase), follow the README and the notes at
      the top of <code>js/api.js</code>: five small functions are the whole integration.</p></div>
    <div class="card"><h3>Login accounts</h3>
      <p class="muted">Add staff by name, email and access level. They create their own password
      the first time they sign in. Use Reset password to make someone set a new one.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Access level</th><th>Password</th><th></th></tr></thead>
        <tbody>
        ${users.map(u => `<tr>
          <td>${esc(u.fullName || u.username || '')}${u.id === State.user.id ? ' (you)' : ''}</td>
          <td>${esc(u.email || '')}</td>
          <td>${esc(u.role || '')}</td>
          <td>${u.password ? 'Set' : SUPA() ? 'Supabase Auth' : 'Not set yet'}</td>
          <td class="right">${u.role === 'SUPER_ADMIN' && State.user.role !== 'SUPER_ADMIN' ? '' :
            `<button class="btn btn-sm" data-edit-user="${u.id}">Edit</button>
             ${(u.password || SUPA()) && u.id !== State.user.id ? `<button class="btn btn-sm" data-reset-user="${u.id}">Reset password</button>` : ''}
             ${u.id === State.user.id ? '' : `<button class="btn btn-sm" data-del-user="${u.id}">Remove</button>`}`}</td>
        </tr>`).join('')}
        </tbody></table></div>
      <button class="btn btn-primary mt" id="btn-add-user">Add login</button></div>
`;
  $('#perm-form').onsubmit = async e => {
    e.preventDefault();
    const p = { SUPERVISOR: [], EMPLOYEE: [] };
    e.target.querySelectorAll('[data-perm]').forEach(cb => {
      if (cb.checked) p[cb.dataset.perm].push(cb.dataset.mod);
    });
    const existing = await API.get('settings', 'permissions');
    if (existing) await API.update('settings', 'permissions', { data: p });
    else await API.create('settings', { id: 'permissions', data: p });
    toast('Permissions saved');
  };
  $('#btn-add-user').onclick = () => openUserForm(null);
  $('#view').querySelectorAll('[data-edit-user]').forEach(b =>
    b.onclick = async () => openUserForm(await API.get('users', b.dataset.editUser)));
  $('#view').querySelectorAll('[data-del-user]').forEach(b =>
    b.onclick = async () => {
      if (!confirm('Remove this login? The person will no longer be able to sign in.')) return;
      if (SUPA()) {
        const res = await API.invoke('manage-user', { action: 'remove', userId: b.dataset.delUser });
        if (!res || !res.ok) { toast((res && res.error) || 'Could not remove the login'); return; }
        toast('Login removed'); route(); return;
      }
      await API.remove('users', b.dataset.delUser);
      toast('Login removed'); route();
    });
  $('#view').querySelectorAll('[data-reset-user]').forEach(b =>
    b.onclick = async () => {
      if (!confirm('Reset this password? The person will get an email to set a new one.')) return;
      if (SUPA()) {
        const rec = await API.get('users', b.dataset.resetUser);
        const s = await API.sb();
        const { error } = await s.auth.resetPasswordForEmail(rec.email || '');
        toast(error ? 'Could not send the reset email' : 'Password reset email sent');
        route(); return;
      }
      await API.update('users', b.dataset.resetUser, { password: '' });
      toast('Password reset'); route();
    });
}

/* ================= INIT ================= */
window.addEventListener('hashchange', route);
(async () => {
  if (SUPA()) {
    try {
      const s = await API.sb();
      const { data: { session } } = await s.auth.getSession();
      if (session && session.user) {
        const prof = await supaProfileByUid(session.user.id);
        if (prof) { State.user = prof; setSession(prof); }
        else await s.auth.signOut();
      }
    } catch (e) { /* stay signed out */ }
  } else {
    loadSession();
  }
  route();
})();
