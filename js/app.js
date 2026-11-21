import { state, commit, subscribe, reset, uid, ensureAutoGuests, undoable } from './store.js';
import { WEDDING, STATUSES, MILESTONES, MOODS, INSPO } from './data.js';
import { seatCount, RELATIONS, relationOf } from './layout.js';
import { renderSeating } from './seating.js';
import { renderConnections, stopConnections } from './connections.js';
import { esc, toast, daysUntil, fmtDate } from './util.js';

const view = document.getElementById('view');
let guestFilter = 'all';
let guestQuery = '';
let guestView = 'list'; // 'list' | 'graph'
const openGuests = new Set();
const openRoles = new Set();

const rolesOf = (pid) => state.roles.filter((r) => r.people.includes(pid));
const personName = (id) => state.people.find((p) => p.id === id)?.name || id;
const relDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const statusKey = (s) => s.toLowerCase().replace(/\s+/g, '-');

/* ---------------- Overview ---------------- */
const FIT_OV = '(min-width: 1100px) and (min-height: 640px)'; // desktop: overview fits one screen
let justAddedMs = null;

function milestoneList() {
  if (!Array.isArray(state.milestones)) state.milestones = structuredClone(MILESTONES);
  return state.milestones.slice().sort((a, b) => a.date.localeCompare(b.date));
}

/** Timeline with spacing proportional to real time; H is the height the dates spread over. */
function milestonesHTML(H = 420) {
  const list = milestoneList();
  if (!list.length) return '<p class="mtl-empty">No dates yet</p>';
  const t = (d) => new Date(d + 'T12:00:00').getTime();
  const now = Date.now();
  const pts = list.map((m) => ({ m, at: t(m.date) }));
  // Today takes part in the spacing so its line never lands on a label
  if (now <= pts.at(-1).at) pts.push({ today: true, at: now });
  pts.sort((a, b) => a.at - b.at || (a.today ? -1 : 1));
  const start = pts[0].at, span = Math.max(1, pts.at(-1).at - start);
  pts.forEach((p, i) => {
    const prev = pts[i - 1];
    const raw = ((p.at - start) / span) * H;
    p.y = prev ? Math.max(raw, prev.y + (prev.today ? 16 : p.today ? 44 : 46)) : 0;
  });
  let i = 0;
  return `
    <div class="mtl" style="height:${pts.at(-1).y + 48}px">
      <div class="mtl-line"></div>
      ${pts.map((p) => p.today
        ? `<div class="mtl-today" style="top:${p.y}px"><span>Today</span></div>`
        : `<div class="mtl-item ${p.at < now ? 'past' : ''} ${p.m.id === 'wedding' ? 'big' : ''} ${p.m.id === justAddedMs ? 'fresh' : ''}" style="top:${p.y}px;--i:${i++}">
            <div class="what" title="${esc(p.m.label)}">${esc(p.m.label)}</div>
            <div class="when">${fmtDate(p.m.date)}</div>
            ${p.m.id !== 'wedding' ? `<button class="x mtl-x" data-delms="${esc(p.m.id)}" aria-label="Remove ${esc(p.m.label)}">×</button>` : ''}
          </div>`).join('')}
    </div>`;
}

/** Draw the timeline to fit its card (the card scrolls if the dates need more room). */
function drawMilestones() {
  const host = view.querySelector('.mtl-host');
  if (!host) return;
  const n = milestoneList().length;
  const H = matchMedia(FIT_OV).matches ? Math.max(120, host.clientHeight - 92) : Math.min(460, 140 + n * 46);
  host.innerHTML = milestonesHTML(H);
  host.querySelectorAll('[data-delms]').forEach((b) => b.onclick = () => {
    const m = state.milestones.find((x) => x.id === b.dataset.delms);
    if (!m) return;
    undoable(`${m.label} removed`, () => { state.milestones = state.milestones.filter((x) => x.id !== m.id); }, toast);
  });
  const fresh = host.querySelector('.mtl-item.fresh') || host.querySelector('.mtl-today');
  if (fresh && host.scrollHeight > host.clientHeight) host.scrollTop = Math.max(0, fresh.offsetTop - host.clientHeight / 3);
  justAddedMs = null;
}
let msResize;
addEventListener('resize', () => { clearTimeout(msResize); msResize = setTimeout(drawMilestones, 120); });

function overview() {
  const days = Math.max(0, daysUntil(WEDDING.date));
  const done = state.roles.filter((r) => r.status === 'Done').length;
  const going = state.guests.filter((g) => g.rsvp !== 'Declined');
  const seated = going.filter((g) => g.tableId).length;
  const yes = state.guests.filter((g) => g.rsvp === 'Yes').length;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const stat = (href, n, of, label) => `<a class="stat" href="${href}"><b>${n}<small>/${of}</small></b><span>${label}</span><div class="meter"><i style="--w:${pct(n, of)}%"></i></div></a>`;

  view.innerHTML = `
    <div class="ov">
      <section class="hero">
        <div class="hero-text">
          <h1 class="hero-names">Betel <span class="amp">&amp;</span> Carter</h1>
          <p class="hero-meta">June 17, 2027 · Morais Vineyards</p>
          <div class="hero-count"><b class="countup" data-to="${days}">0</b><span>days to go</span></div>
        </div>
        <div class="hero-photo">
          <img src="${esc(WEDDING.heroImage)}" alt="Betel and Carter" onerror="this.parentElement.classList.add('empty');this.remove()"/>
          <div class="photo-empty">assets/hero.jpg</div>
        </div>
      </section>

      <div class="ov-side">
        <div class="stats">
          ${stat('#team', done, state.roles.length, 'Tasks done')}
          ${stat('#guests', going.length, state.guestTarget, 'Guests')}
          ${stat('#guests', yes, state.guests.length, 'RSVP yes')}
          ${stat('#seating', seated, going.length, 'Seated')}
        </div>

        <div class="ov-cards">
          <section class="card ov-card">
            <h2>Milestones</h2>
            <div class="ov-scroll mtl-host"></div>
            <form class="mtl-add" autocomplete="off">
              <input type="date" name="date" required aria-label="Date"/>
              <input name="label" required maxlength="60" placeholder="Add a date" aria-label="Milestone"/>
              <button class="mtl-plus" aria-label="Add milestone">+</button>
            </form>
          </section>
          <section class="card ov-card">
            <h2>Team</h2>
            <ul class="glance ov-scroll">
              ${state.people.map((p) => `<li><a href="#team">${esc(p.name)}</a>
                <span class="dots">${rolesOf(p.id).map((r) => `<i class="dot ${statusKey(r.status)}" title="${esc(r.title)} · ${esc(r.status)}"></i>`).join('')}</span></li>`).join('')}
            </ul>
            <div class="legend"><span><i class="dot not-started"></i>To do</span><span><i class="dot in-progress"></i>In progress</span><span><i class="dot waiting-on-bride"></i>Waiting</span><span><i class="dot done"></i>Done</span></div>
          </section>
        </div>
      </div>
    </div>`;

  drawMilestones();
  const f = view.querySelector('.mtl-add');
  f.onsubmit = (e) => {
    e.preventDefault();
    const date = f.date.value, label = f.label.value.trim();
    if (!date) { f.date.focus(); return; }
    if (!label) { f.label.focus(); return; }
    const m = { id: uid(), date, label };
    state.milestones = [...milestoneList(), m];
    justAddedMs = m.id;
    commit();
    view.querySelector('.mtl-add input[name="date"]')?.focus();
  };
}

/* ---------------- Team ---------------- */
function linkMeta(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* not a URL */ }
  if (/pin\.it|pinterest/.test(host)) return { host: 'Pinterest', cls: 'pinterest' };
  if (/spotify/.test(host)) return { host: 'Spotify', cls: 'spotify' };
  if (/instagram/.test(host)) return { host: 'Instagram', cls: '' };
  if (/tiktok/.test(host)) return { host: 'TikTok', cls: '' };
  return { host: host || 'Link', cls: '' };
}

const linkChip = (l, del) => {
  const m = linkMeta(l.url);
  return `<a class="lchip ${m.cls}" href="${esc(l.url)}" target="_blank" rel="noopener" title="${esc(m.host)}">${esc(l.label || m.host)}<span aria-hidden="true">↗</span>${del ? `<button class="lx" data-dellink="${del}" aria-label="Remove link">×</button>` : ''}</a>`;
};

function personCard(p) {
  const rs = rolesOf(p.id);
  const doneN = rs.filter((r) => r.status === 'Done').length;
  return `
    <article class="person" data-pid="${p.id}">
      <header class="p-head">
        <div>
          <h3>${esc(p.name)}</h3>
          ${p.tag ? `<span class="p-tag">${esc(p.tag)}</span>` : ''}
        </div>
        <span class="p-count" title="Roles done">${doneN}/${rs.length}</span>
        <button class="x p-del" data-delperson="${p.id}" aria-label="Remove ${esc(p.name)}">×</button>
      </header>

      <div class="roles">
        ${rs.map((r) => `
          <div class="role">
            <div class="role-top">
              <button class="role-title" aria-expanded="false" data-toggle-role>${esc(r.title)}</button>
              <label class="st ${statusKey(r.status)}"><i></i><select data-status="${r.id}" aria-label="Status for ${esc(r.title)}">${STATUSES.map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
            </div>
            ${r.people.length > 1 || r.with ? `<div class="with">with ${esc([...r.people.filter((x) => x !== p.id).map(personName), r.with].filter(Boolean).join(' & '))}</div>` : ''}
            <div class="role-more"><div>
              <ul class="brief">${r.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
              ${r.links.length ? `<div class="lrow">${r.links.map((l) => linkChip(l)).join('')}</div>` : ''}
            </div></div>
          </div>`).join('')}
      </div>

      <div class="p-foot">
        ${p.links.length ? `<div class="lrow">${p.links.map((l, i) => linkChip(l, `${p.id}:${i}`)).join('')}</div>` : ''}
        ${p.updates.length ? `<ol class="feed">${p.updates.slice().reverse().map((u) => `
          <li><time>${relDate(u.at)}</time><p>${esc(u.text)}</p><button class="x" data-delupdate="${p.id}:${u.id}" aria-label="Delete update">×</button></li>`).join('')}</ol>` : ''}
        <form class="quick" data-addupdate="${p.id}">
          <input name="text" autocomplete="off" placeholder="Add an update or paste a link…" aria-label="Add an update or link for ${esc(p.name)}"/>
        </form>
        <details class="add-role"><summary>+ Role</summary>
          <form data-addrole="${p.id}">
            <input class="input" name="title" placeholder="Role" required/>
            <textarea class="input" name="details" rows="2" placeholder="Details, one per line"></textarea>
            <button class="btn moss sm">Add</button>
          </form>
        </details>
      </div>
    </article>`;
}

function team() {
  view.innerHTML = `
    <div class="page-head"><h1>Team</h1></div>
    <div class="people">
      ${state.people.map(personCard).join('')}
      <form class="person add-person" id="addPerson">
        <input name="name" placeholder="+ Add someone" aria-label="Name" required autocomplete="off"/>
      </form>
    </div>`;

  const P = (id) => state.people.find((p) => p.id === id);
  // Role details fold away; tap the title to open (remembered while you stay on the page)
  view.querySelectorAll('[data-toggle-role]').forEach((b) => {
    const role = b.closest('.role');
    const key = b.closest('.person').dataset.pid + ':' + b.textContent;
    if (openRoles.has(key)) { role.classList.add('open'); b.setAttribute('aria-expanded', 'true'); }
    b.onclick = () => {
      const open = role.classList.toggle('open');
      b.setAttribute('aria-expanded', String(open));
      open ? openRoles.add(key) : openRoles.delete(key);
    };
  });
  view.querySelectorAll('[data-status]').forEach((s) => s.onchange = () => {
    state.roles.find((r) => r.id === s.dataset.status).status = s.value;
    view.querySelectorAll(`[data-status="${s.dataset.status}"]`).forEach((x) => { x.value = s.value; x.parentElement.className = `st ${statusKey(s.value)}`; });
    commit({ silent: true });
  });
  // One box for both: a URL becomes a link chip, anything else becomes an update
  view.querySelectorAll('[data-addupdate]').forEach((f) => f.onsubmit = (e) => {
    e.preventDefault();
    const text = f.text.value.trim();
    if (!text) return;
    const p = P(f.dataset.addupdate);
    if (/^https?:\/\/\S+$/i.test(text)) p.links.push({ url: text, label: '' });
    else p.updates.push({ id: uid(), text, at: new Date().toISOString() });
    commit();
    view.querySelector(`[data-addupdate="${p.id}"] input`)?.focus();
  });
  view.querySelectorAll('[data-delupdate]').forEach((b) => b.onclick = () => {
    const [pid, id] = b.dataset.delupdate.split(':');
    const p = P(pid); p.updates = p.updates.filter((u) => u.id !== id); commit();
  });
  view.querySelectorAll('[data-dellink]').forEach((b) => b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const [pid, i] = b.dataset.dellink.split(':');
    P(pid).links.splice(+i, 1); commit();
  });
  view.querySelectorAll('[data-addrole]').forEach((f) => f.onsubmit = (e) => {
    e.preventDefault();
    const d = new FormData(f);
    state.roles.push({ id: uid(), title: d.get('title').trim(), people: [f.dataset.addrole], status: 'Not started',
      details: d.get('details').split('\n').map((s) => s.trim()).filter(Boolean), links: [] });
    commit();
  });
  view.querySelectorAll('[data-delperson]').forEach((b) => b.onclick = () => {
    const p = P(b.dataset.delperson);
    undoable(`${p.name} removed`, () => {
      state.people = state.people.filter((x) => x.id !== p.id);
      state.roles = state.roles.filter((r) => { r.people = r.people.filter((x) => x !== p.id); return r.people.length; });
    }, toast);
  });
  view.querySelector('#addPerson').onsubmit = (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    state.people.push({ id: uid(), name, tag: '', links: [], updates: [] });
    ensureAutoGuests(); commit();
  };
}

/* ---------------- Guests ---------------- */
const RSVP = ['Invited', 'Yes', 'Maybe', 'Declined'];
const SIDES = ['Betel', 'Carter', 'Both'];
const MEALS = ['Chicken', 'Beef', 'Fish', 'Vegetarian', 'Vegan', 'Kids meal'];
const DETAIL_FIELDS = [
  ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'],
  ['street', 'Street', 'text'], ['city', 'City', 'text'], ['state', 'State', 'text'], ['zip', 'ZIP', 'text'],
  ['household', 'Household', 'text'], ['plusOne', 'Plus-one', 'text'],
  ['diet', 'Dietary', 'text'], ['notes', 'Notes', 'text'],
];
const CSV_COLS = [['name', 'Name'], ['side', 'Side'], ['relation', 'Relation'], ['rsvp', 'RSVP'], ['meal', 'Meal'], ['table', 'Table'], ...DETAIL_FIELDS.map(([k, l]) => [k, l])];

function guestsCSV() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = state.guests.map((g) => CSV_COLS.map(([k]) => q(k === 'table' ? (state.tables.find((t) => t.id === g.tableId)?.name || '') : k === 'relation' ? (g.party === 'couple' ? 'Couple' : relationOf(g)) : g[k])).join(','));
  const csv = [CSV_COLS.map(([, l]) => q(l)).join(','), ...rows].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = 'griffin-wedding-guests.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* One filter menu: status, side, relation */
const going = (g) => g.rsvp !== 'Declined';
const GUEST_FILTERS = [
  [['all', 'Everyone', () => true],
   ['unseated', 'Still to seat', (g) => going(g) && !g.tableId && g.party !== 'couple'],
   ['reception', 'Reception guests', going],
   ['awaiting', 'Awaiting RSVP', (g) => g.rsvp === 'Invited' || g.rsvp === 'Maybe'],
   ['declined', 'Declined', (g) => g.rsvp === 'Declined'],
   ['noaddr', 'No address', (g) => !g.street && g.party !== 'couple']],
  [['couple', 'The couple', (g) => g.party === 'couple'],
   ['Betel', 'Betel’s side', (g) => g.side === 'Betel' && g.party !== 'couple'],
   ['Carter', 'Carter’s side', (g) => g.side === 'Carter' && g.party !== 'couple'],
   ['Both', 'Shared', (g) => g.side === 'Both']],
  RELATIONS.map((r) => ['rel:' + r, r === 'Plus-one' ? 'Partner / plus-one' : r, (g) => g.party !== 'couple' && relationOf(g) === r]),
];
const filterDef = (k) => GUEST_FILTERS.flat().find((f) => f[0] === k) || GUEST_FILTERS[0][0];
const guestFilterMenu = () => {
  const cur = filterDef(guestFilter);
  return `
    <div class="gfilter" id="gFilter">
      <button class="gf-btn ${guestFilter === 'all' ? '' : 'set'}" aria-haspopup="listbox" aria-expanded="false"><span>${esc(cur[1])}</span><b>${state.guests.filter(cur[2]).length}</b><i aria-hidden="true"></i></button>
      <div class="gf-menu" role="listbox">${GUEST_FILTERS.map((grp) => `<div class="gf-grp">${grp.map(([k, l, fn]) => {
        const n = state.guests.filter(fn).length;
        return `<button role="option" data-gf="${esc(k)}" class="${k === guestFilter ? 'on' : ''} ${n ? '' : 'none'}" aria-selected="${k === guestFilter}">${esc(l)}<span>${n}</span></button>`;
      }).join('')}</div>`).join('')}</div>
    </div>`;
};
addEventListener('pointerdown', (e) => { const m = document.querySelector('.gfilter.open'); if (m && !m.contains(e.target)) m.classList.remove('open'); });
addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelector('.gfilter.open')?.classList.remove('open'); });

/* List | Connections toggle */
const guestViewToggle = () => `
  <div class="viewseg" role="tablist" aria-label="Guest view">
    <button role="tab" data-gview="list" class="${guestView === 'list' ? 'on' : ''}" aria-selected="${guestView === 'list'}">List</button>
    <button role="tab" data-gview="graph" class="${guestView === 'graph' ? 'on' : ''}" aria-selected="${guestView === 'graph'}">Connections</button>
  </div>`;
function wireGuestViewToggle() {
  view.querySelectorAll('[data-gview]').forEach((b) => b.onclick = () => {
    if (guestView === b.dataset.gview) return;
    guestView = b.dataset.gview;
    guests();
  });
}

/* Connections: who knows who, feeding auto-seat */
function guestGraph() {
  const n = (state.links || []).length;
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Guests</h1>
        <p class="lede">${n ? `${n} connection${n === 1 ? '' : 's'} · used by Auto-seat` : 'Tap two people to link them'}</p>
      </div>
      <div class="head-actions">${guestViewToggle()}</div>
    </div>
    <section class="card flush" id="graphHost"></section>`;
  wireGuestViewToggle();
  renderConnections(view.querySelector('#graphHost'));
}

function guests() {
  if (guestView === 'graph') return guestGraph();
  stopConnections();
  const tableOpts = (sel) => `<option value="">—</option>` + state.tables.map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.id === 'head' ? 'Sweetheart' : t.name)}</option>`).join('');
  const q = guestQuery.toLowerCase();
  const fil = filterDef(guestFilter)[2];
  const list = state.guests.filter((g) => fil(g)
    && (!q || [g.name, g.email, g.city, g.household, relationOf(g)].join(' ').toLowerCase().includes(q)));
  const relCell = (g) => g.party === 'couple' ? '<span class="rel-fixed">Couple</span>'
    : `<select class="select rel" data-k="relation" data-v="${esc(relationOf(g))}" aria-label="Relation"><option value="">—</option>${RELATIONS.map((r) => `<option ${r === relationOf(g) ? 'selected' : ''}>${r}</option>`).join('')}</select>`;
  const c = (fn) => state.guests.filter(fn).length;

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Guests</h1>
        <p class="lede">${c((g) => g.rsvp !== 'Declined')} of ${state.guestTarget} · ${c((g) => g.rsvp === 'Yes')} yes</p>
      </div>
      <div class="head-actions">${guestViewToggle()}<button class="btn line" id="csv">Export CSV</button></div>
    </div>

    <form class="guest-add" id="gForm">
      <input class="input" name="name" placeholder="Add guests" required/>
      <select class="select" name="side">${SIDES.map((s) => `<option>${s}</option>`).join('')}</select>
      <button class="btn moss">Add</button>
    </form>

    <div class="guest-tools">
      <input class="input search" id="gSearch" type="search" placeholder="Search" value="${esc(guestQuery)}"/>
      ${guestFilterMenu()}
    </div>

    <section class="card flush">
      ${list.length ? `<div class="table-wrap"><table class="guests">
        <thead><tr><th>Name</th><th>Side</th><th>Relation</th><th>RSVP</th><th>Meal</th><th>Table</th><th><span class="sr">Details</span></th></tr></thead>
        <tbody>${list.map((g) => `
          <tr class="row" data-id="${g.id}">
            <td><input class="input" data-k="name" value="${esc(g.name)}" aria-label="Name"/></td>
            <td><select class="select" data-k="side">${SIDES.map((s) => `<option ${s === g.side ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
            <td class="rel-td">${relCell(g)}</td>
            <td><select class="select rsvp" data-k="rsvp" data-v="${g.rsvp}">${RSVP.map((s) => `<option ${s === g.rsvp ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
            <td><input class="input" data-k="meal" list="meals" value="${esc(g.meal)}" placeholder="—" aria-label="Meal"/></td>
            <td><select class="select" data-k="tableId">${tableOpts(g.tableId)}</select></td>
            <td class="row-actions">
              <button class="more ${g.street ? '' : 'warn'}" data-open="${g.id}" aria-expanded="${openGuests.has(g.id)}" title="Address & details">${openGuests.has(g.id) ? '−' : '+'}</button>
              ${g.party === 'couple' ? '' : `<button class="x" data-delg="${g.id}" aria-label="Remove ${esc(g.name)}">×</button>`}
            </td>
          </tr>
          ${openGuests.has(g.id) ? `<tr class="detail-row" data-id="${g.id}"><td colspan="7"><div class="detail-grid">
            ${DETAIL_FIELDS.map(([k, l, type]) => `<label class="field ${k}">${l}<input class="input" data-k="${k}" type="${type}" value="${esc(g[k])}"/></label>`).join('')}
          </div></td></tr>` : ''}`).join('')}</tbody></table></div>
        <datalist id="meals">${MEALS.map((m) => `<option value="${m}"></option>`).join('')}</datalist>`
      : `<p class="muted" style="margin:0;padding:20px">No guests${guestFilter === 'all' && !q ? ' yet' : ' match'}.</p>`}
    </section>`;

  const add = (name, side = 'Both') => state.guests.push({ id: uid(), name, side, rsvp: 'Invited', diet: '', tableId: null });
  view.querySelector('#csv').onclick = () => guestsCSV();
  wireGuestViewToggle();
  const gForm = view.querySelector('#gForm');
  gForm.name.addEventListener('paste', (e) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\n')) return;
    e.preventDefault();
    const names = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    names.forEach((n) => add(n, gForm.side.value)); commit(); toast(`Added ${names.length}`);
  });
  gForm.onsubmit = (e) => {
    e.preventDefault();
    const n = gForm.name.value.trim();
    if (!n) return;
    add(n, gForm.side.value); commit();
    view.querySelector('#gForm [name=name]').focus();
  };
  const search = view.querySelector('#gSearch');
  search.oninput = () => { guestQuery = search.value; guests(); const s = view.querySelector('#gSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); };
  const gf = view.querySelector('#gFilter');
  gf.querySelector('.gf-btn').onclick = () => { const o = gf.classList.toggle('open'); gf.querySelector('.gf-btn').setAttribute('aria-expanded', o); };
  view.querySelectorAll('[data-gf]').forEach((b) => b.onclick = () => { guestFilter = b.dataset.gf; guests(); });
  view.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => {
    const id = b.dataset.open;
    openGuests.has(id) ? openGuests.delete(id) : openGuests.add(id);
    guests();
  });
  view.querySelectorAll('tr[data-id]').forEach((tr) => {
    const g = state.guests.find((x) => x.id === tr.dataset.id);
    tr.querySelectorAll('[data-k]').forEach((el) => {
      el.onchange = () => {
        const k = el.dataset.k;
        if (k === 'tableId' && el.value) {
          const t = state.tables.find((x) => x.id === el.value);
          if (state.guests.filter((x) => x.tableId === t.id && x.id !== g.id).length >= seatCount(t)) { toast('That table is full'); el.value = g.tableId || ''; return; }
        }
        g[k] = el.value || (k === 'tableId' ? null : '');
        if (k === 'rsvp' || k === 'relation') el.dataset.v = el.value;
        commit({ silent: !['rsvp', 'side', 'street'].includes(k) });
      };
    });
  });
  view.querySelectorAll('[data-delg]').forEach((b) => b.onclick = () => {
    const g = state.guests.find((x) => x.id === b.dataset.delg);
    undoable(`${g.name} removed`, () => { state.guests = state.guests.filter((x) => x.id !== g.id); }, toast);
  });
}

/* ---------------- Mood ---------------- */
function mood() {
  view.innerHTML = `
    <div class="page-head">
      <h1>Mood</h1>
      <a class="btn line" href="${WEDDING.board}" target="_blank" rel="noopener">Pinterest ↗</a>
    </div>
    <div class="palettes" role="radiogroup" aria-label="Palette">
      ${MOODS.map((m) => `
        <button class="palette ${m.id === state.mood ? 'on' : ''}" data-mood="${m.id}" role="radio" aria-checked="${m.id === state.mood}">
          <span class="sw">${m.swatches.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
          <span class="pname">${esc(m.name)}</span>
        </button>`).join('')}
    </div>
    <div class="inspo-grid">
      ${INSPO.map((p) => `<img src="${p.src}" alt="${esc(p.caption)}" loading="lazy"/>`).join('')}
    </div>`;

  view.querySelectorAll('[data-mood]').forEach((el) => el.onclick = () => {
    state.mood = el.dataset.mood;
    commit({ silent: true });
    view.querySelectorAll('[data-mood]').forEach((x) => { x.classList.toggle('on', x === el); x.setAttribute('aria-checked', String(x === el)); });
    toast('Reception colors updated');
  });
}

/* ---------------- router ---------------- */
let enterTimer;
// Numbers marked .countup tick up from 0 when a page opens
function countUp() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  view.querySelectorAll('.countup').forEach((el) => {
    const to = +el.dataset.to, t0 = performance.now(), dur = 900;
    const step = (now) => {
      const k = Math.max(0, Math.min(1, (now - t0) / dur));
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
// Slide the wine underline under the active tab
function moveInk() {
  const nav = document.querySelector('.mainnav'), a = nav?.querySelector('a.active'), ink = nav?.querySelector('.nav-ink');
  if (!a || !ink) return;
  ink.style.setProperty('--ink-x', a.offsetLeft + 14 + 'px');
  ink.style.setProperty('--ink-w', a.offsetWidth - 28 + 'px');
}
addEventListener('resize', moveInk);
document.fonts?.ready.then(moveInk);
document.fonts?.addEventListener?.('loadingdone', moveInk);
setTimeout(moveInk, 400);
// Mood palettes stay internal (branding) — no page; old #mood links fall back to the overview
const ROUTES = { overview, team, seating: () => renderSeating(view), guests };
function route(opts = {}) {
  const name = location.hash.slice(1) || 'overview';
  const fn = ROUTES[name] || overview;
  document.body.dataset.route = ROUTES[name] ? name : 'overview';
  document.querySelectorAll('.mainnav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  moveInk();
  // Keep scroll position when re-rendering the same page (e.g. after posting an update)
  const y = window.scrollY;
  fn();
  if (opts.enter) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); clearTimeout(enterTimer); enterTimer = setTimeout(() => view.classList.remove('enter'), 600); countUp(); }
  else { window.scrollTo(0, y); view.querySelectorAll('.countup').forEach((el) => { el.textContent = el.dataset.to; }); }
}
window.addEventListener('hashchange', () => { route({ enter: true }); window.scrollTo(0, 0); view.focus({ preventScroll: true }); });
subscribe(() => route());

function tickCountdown() {
  document.getElementById('countdown').innerHTML = `<b>${Math.max(0, daysUntil(WEDDING.date))}</b> days`;
}

document.getElementById('resetBtn').onclick = () => {
  undoable('Started fresh', reset, toast);
};
document.addEventListener('storage-full', () => toast('Storage full — remove a few photos'));

tickCountdown();
setInterval(tickCountdown, 60_000);
route({ enter: true });
