import { state, commit, subscribe, reset, uid, ensureAutoGuests, undoable } from './store.js';
import { WEDDING, STATUSES, MILESTONES, MOODS, INSPO } from './data.js';
import { seatCount, RELATIONS, relationOf } from './layout.js';
import { renderSeating } from './seating.js';
import { renderConnections, stopConnections } from './connections.js';
import { enableAddressLookup } from './address.js';
import { esc, toast, daysUntil, fmtDate, confirmDialog } from './util.js';
import { openPerson } from './person.js';
import { detailsHTML, wireDetails } from './guest-details.js';
import { renderAgenda } from './agenda.js';
import { initGuide, refreshGuide } from './guide.js';
import { initHistory } from './history.js';
import { initSync, mountLive } from './sync.js';
import { mountPaste, openPaste, pasteIsOpen } from './guest-paste.js';

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

const LOCKED_MS = ['wedding', 'engaged']; // sourced dates: can't be removed
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOf = (s) => new Date(s + 'T12:00:00');
const weddingDay = () => WEDDING.date.slice(0, 10);
/** "Mar 3" — no year; the timeline only spans this year and next. */
const shortDate = (s) => dayOf(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * Typed date → ISO. Accepts "Mar 3", "March 3", "3 Mar", "3/3", "3/3/27", "2027-03-03".
 * Without a year it becomes the next Mar 3 from today; if that would be after the wedding, the one before (already past).
 */
function parseDay(str) {
  const t = String(str || '').trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/[,.]/g, ' ');
  let m, d, y = null;
  let r;
  if ((r = t.match(/^(\d{2})(\d{2})$/))) [m, d] = [+r[1], +r[2]]; // 0303
  else if ((r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = t.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/))) [m, d, y] = [+r[1], +r[2], r[3] ? +r[3] : null];
  else if ((r = t.match(/^([a-z]{3,})\s+(\d{1,2})(?:\s+(\d{2,4}))?$/))) [m, d, y] = [MONTHS.indexOf(r[1].slice(0, 3)) + 1, +r[2], r[3] ? +r[3] : null];
  else if ((r = t.match(/^(\d{1,2})\s+([a-z]{3,})(?:\s+(\d{2,4}))?$/))) [d, m, y] = [+r[1], MONTHS.indexOf(r[2].slice(0, 3)) + 1, r[3] ? +r[3] : null];
  else return null;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  if (y !== null && y < 100) y += 2000;
  const make = (yy) => { const x = new Date(yy, m - 1, d, 12); return x.getMonth() === m - 1 ? x : null; };
  if (y !== null) { const x = make(y); return x ? iso(x) : null; }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const wed = dayOf(weddingDay());
  let x = make(today.getFullYear());
  if (!x || x < today) x = make(today.getFullYear() + 1);
  if (!x) return null;
  if (x > wed) x = make(x.getFullYear() - 1) || x;
  return iso(x);
}

/**
 * Timeline from today to the wedding: what's already happened sits greyed and compact at the start,
 * then Today, then the rest spaced in proportion to the time left. H is the height the dates spread over.
 */
function milestonesHTML(H = 420) {
  const list = milestoneList();
  if (!list.length) return '<p class="mtl-empty">No dates yet</p>';
  const now = Date.now();
  const pts = list.map((m) => ({ m, at: dayOf(m.date).getTime() }));
  const past = pts.filter((p) => p.at < now), next = pts.filter((p) => p.at >= now);
  const GAP = 40;
  let y = 0;
  past.forEach((p) => { p.y = y; y += GAP; });
  const todayY = past.length ? y - GAP + 48 : 0;
  const end = Math.max(dayOf(weddingDay()).getTime(), ...next.map((p) => p.at), now + 1);
  const top = todayY + 16, room = Math.max(H - top, next.length * GAP);
  let prev = null;
  next.forEach((p) => {
    const raw = top + ((p.at - now) / (end - now)) * room;
    p.y = prev === null ? raw : Math.max(raw, prev + GAP);
    prev = p.y;
  });
  const showToday = now <= end;
  let i = 0;
  const item = (p) => `<div class="mtl-item ${p.at < now ? 'past' : ''} ${p.m.id === 'wedding' ? 'big' : ''} ${p.m.id === justAddedMs ? 'fresh' : ''}" style="top:${p.y}px;--i:${i++}">
            <div class="what" title="${esc(p.m.label)}">${esc(p.m.label)}</div>
            <div class="when">${shortDate(p.m.date)}</div>
            ${!LOCKED_MS.includes(p.m.id) ? `<button class="x mtl-x" data-delms="${esc(p.m.id)}" aria-label="Remove ${esc(p.m.label)}">×</button>` : ''}
          </div>`;
  const last = Math.max(todayY, ...pts.map((p) => p.y));
  return `
    <div class="mtl" style="height:${last + 44}px">
      <div class="mtl-line"></div>
      ${past.map(item).join('')}
      ${showToday ? `<div class="mtl-today" style="top:${todayY}px"><span>Today</span></div>` : ''}
      ${next.map(item).join('')}
    </div>`;
}

/** Draw the timeline to fit its card (the card scrolls if the dates need more room). */
function drawMilestones() {
  const host = view.querySelector('.mtl-host');
  if (!host) return;
  const n = milestoneList().length;
  const H = matchMedia(FIT_OV).matches ? Math.max(120, host.clientHeight - 92) : Math.min(460, 140 + n * 46);
  host.innerHTML = milestonesHTML(H);
  host.querySelectorAll('[data-delms]').forEach((b) => b.onclick = async () => {
    const m = state.milestones.find((x) => x.id === b.dataset.delms);
    if (!m || LOCKED_MS.includes(m.id)) return;
    if (await confirmDialog({ title: 'Remove this milestone?', body: `“${m.label}” comes off the timeline.`, confirmLabel: 'Remove', cancelLabel: 'Keep' })) {
      state.milestones = state.milestones.filter((x) => x.id !== m.id);
      commit();
    }
  });
  const fresh = host.querySelector('.mtl-item.fresh') || host.querySelector('.mtl-today');
  if (fresh && host.scrollHeight > host.clientHeight) host.scrollTop = Math.max(0, fresh.offsetTop - host.clientHeight / 3);
  justAddedMs = null;
}
let msResize;
addEventListener('resize', () => { clearTimeout(msResize); msResize = setTimeout(drawMilestones, 120); });

/** Expected guest count (state.guestTarget): one editable number, shared by the Overview tile and the Guests header. */
const guestCountHTML = () => `<button type="button" class="gcount" data-gcount title="Change expected guests" aria-label="Expected guests ${state.guestTarget}. Edit">${state.guestTarget}</button>`;
function wireGuestCount(root) {
  root.querySelectorAll('[data-gcount]').forEach((btn) => btn.onclick = () => {
    const inp = document.createElement('input');
    Object.assign(inp, { type: 'number', min: 1, max: 300, value: state.guestTarget, className: 'gcount-in' });
    inp.setAttribute('aria-label', 'Expected guests');
    btn.replaceWith(inp);
    inp.focus(); inp.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const v = Math.round(+inp.value);
      if (save && v >= 1 && v <= 300 && v !== state.guestTarget) { state.guestTarget = v; commit(); } else inp.replaceWith(btn);
    };
    inp.onkeydown = (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') { e.stopPropagation(); finish(false); } };
    inp.onblur = () => finish(true);
  });
}

function overview() {
  const days = Math.max(0, daysUntil(WEDDING.date));
  const done = state.roles.filter((r) => r.status === 'Done').length;
  const going = state.guests.filter((g) => g.rsvp !== 'Declined');
  const seated = going.filter((g) => g.tableId).length;
  const yes = state.guests.filter((g) => g.rsvp === 'Yes').length;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const stat = (href, n, of, label, ofHTML = of) => { const tag = href ? `a class="stat" href="${href}"` : 'div class="stat"'; return `<${tag}><b>${n}<small>/${ofHTML}</small></b><span>${label}</span><div class="meter"><i style="--w:${pct(n, of)}%"></i></div></${href ? 'a' : 'div'}>`; };

  view.innerHTML = `
    <div class="ov">
      <section class="banner" aria-label="Betel and Carter are getting married">
        <img class="banner-bg" src="assets/venue/site/ceremony-locations-pergola-1-2Blog-Images-0043.jpg" alt="" />
        <div class="banner-text">
          <h1 class="banner-names">Betel <i>&amp;</i> Carter</h1>
          <p class="banner-place"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><a href="https://moraisvineyards.com/" target="_blank" rel="noopener">Morais Vineyards</a></p>
          <p class="banner-date"><span class="bd-d">June 17, 2027</span><span class="bd-sep" aria-hidden="true">·</span><span class="bd-n"><b class="countup" data-to="${days}">0</b> days to go</span></p>
        </div>
        <div class="lace-photo"><img src="${WEDDING.heroImage}" alt="Betel and Carter" /></div>
      </section>

      <div class="ov-side">
        <div class="stats">
          ${stat('#team', done, state.roles.length, 'Tasks done')}
          ${stat(null, going.length, state.guestTarget, 'Guests', guestCountHTML())}
          ${stat('#guests', yes, state.guests.length, 'RSVP yes')}
          ${stat('#seating', seated, going.length, 'Seated')}
        </div>

        <div class="ov-cards">
          <section class="card ov-card">
            <h2>Milestones</h2>
            <div class="ov-scroll mtl-host"></div>
            <form class="mtl-add" autocomplete="off">
              <input name="date" required placeholder="Mar 3 or 3/3" aria-label="Date (month and day)" title="Mar 3, 3/3, 0303, 3 March" class="mtl-date"/>
              <input name="label" required maxlength="60" placeholder="Add a milestone" aria-label="Milestone"/>
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
  wireGuestCount(view);
  const f = view.querySelector('.mtl-add');
  f.onsubmit = (e) => {
    e.preventDefault();
    const date = parseDay(f.date.value), label = f.label.value.trim();
    if (!date) { f.date.focus(); f.date.classList.remove('bad'); void f.date.offsetWidth; f.date.classList.add('bad'); return; }
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

/* Team v2 (REQ-51). Bridesmaids' cards are filled with their group colour; anyone else is a plain cream card.
   The colour can be changed per person from the card's menu (stored as p.color: 'pink' | 'burgundy' | 'green' | 'none'). */
const TEAM_COLORS = { none: 'Default', pink: 'Pink', burgundy: 'Burgundy', green: 'Green', cream: 'Cream', rose: 'Rose', sage: 'Sage', plum: 'Plum', sand: 'Sand' };
const COLOR_OF = { kiara: 'pink', monica: 'pink', ashlyn: 'burgundy', eden: 'burgundy', noella: 'burgundy', noemi: 'green', morgan: 'green', isabele: 'green' };
const colorOf = (p) => p.color || COLOR_OF[p.id] || 'none';
let teamFilter = 'all';   // 'all' | 'st:<status-key>' | 'role:<title>'
let confirmDel = null;    // person id showing the inline "Remove X?"
let editingRole = null;  // role id being edited on a team card
let menuFor = null;       // person id whose colour menu is open

const statusDots = (r) => `<button type="button" class="stbtn ${statusKey(r.status)}" data-role="${r.id}" title="Change status" aria-label="Status: ${r.status}. Click to change"><i aria-hidden="true"></i><span>${r.status}</span></button>`;

/** Agenda blocks this person is responsible for (the Agenda page stays the source) */
function agendaOf(pid) {
  const list = (state.agenda || []).filter((a) => a.responsible === pid);
  if (!list.length) return '';
  const t = (x) => { const [h, m] = String(x || '0:0').split(':').map(Number); return `${(h % 12) || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${h >= 12 ? 'pm' : 'am'}`; };
  return `<ul class="tc-ag" aria-label="On the agenda">${list.map((a) => `<li><a href="#agenda">${t(a.start)} ${esc(a.title || 'Event')}</a></li>`).join('')}</ul>`;
}
const EDIT_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const SHARE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="9" cy="9" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 19c.5-3 2.7-4.5 5.5-4.5s5 1.5 5.5 4.5M17 7v6M14 10h6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
/** Roles this person could join (a shared role is one role with several people, so status moves together). */
const sharable = (p) => state.roles.filter((r) => !r.people.includes(p.id));
function personCard(p) {
  const rs = rolesOf(p.id);
  const asking = confirmDel === p.id;
  return `
    <article class="tcard c-${colorOf(p)}" data-pid="${p.id}">
      <header class="tc-head">
        <button class="tc-name" data-openperson="${p.id}">${esc(p.name)}</button>
        ${p.tag ? `<span class="tc-tag">${esc(p.tag)}</span>` : ''}
        <span class="tc-tools">
          <button class="tc-btn" data-menu="${p.id}" aria-label="Card colour" aria-expanded="${menuFor === p.id}">⋯</button>
          <button class="tc-btn" data-delperson="${p.id}" aria-label="Remove ${esc(p.name)}">×</button>
        </span>
        ${menuFor === p.id ? `<div class="tc-menu" role="menu" aria-label="Card colour">
          ${Object.entries(TEAM_COLORS).map(([k, l]) => `<button role="menuitemradio" aria-checked="${colorOf(p) === k}" class="sw sw-${k}${colorOf(p) === k ? ' on' : ''}" data-setcolor="${k}" title="${l}" aria-label="${l}"></button>`).join('')}
        </div>` : ''}
      </header>
      ${asking ? `<div class="tc-confirm" role="alertdialog" aria-label="Remove ${esc(p.name)}?">
        <span>Remove ${esc(p.name)}?</span>
        <button class="tc-yes" data-confirmdel="${p.id}">Remove</button><button class="tc-no" data-canceldel>Keep</button>
      </div>` : ''}
      <ul class="tc-roles">
        ${rs.map((r) => {
          const w = r.people.length > 1 || r.with ? [...r.people.filter((x) => x !== p.id).map(personName), r.with].filter(Boolean).join(' & ') : '';
          if (editingRole === r.id) return `<li class="tc-role editing"><form class="tc-redit" data-saverole="${r.id}" autocomplete="off">
            <input name="title" value="${esc(r.title)}" required maxlength="80" aria-label="Role name"/>
            <div class="tc-chips" role="group" aria-label="Who has this role">${state.people.map((x) => `<button type="button" class="tc-chip" data-rwith="${x.id}" aria-pressed="${r.people.includes(x.id)}">${esc(x.name)}</button>`).join('')}</div>
            <div class="tc-redit-foot"><button type="button" class="tc-no" data-delrole="${r.id}">Delete role</button><span class="spacer"></span><button type="button" class="tc-no" data-canceledit>Cancel</button><button class="tc-yes">Save</button></div>
          </form></li>`;
          return `<li class="tc-role" data-status="${statusKey(r.status)}"><span class="tc-title">${esc(r.title)}</span><button class="tc-btn tc-edit" data-editrole="${r.id}" aria-label="Edit role ${esc(r.title)}" title="Edit role">${EDIT_ICON}</button><div class="tc-meta">${statusDots(r)}${w ? `<small class="tc-with">with ${esc(w)}</small>` : ''}</div></li>`;
        }).join('')}
      </ul>
      ${agendaOf(p.id)}
      <form class="tc-add" data-addrole="${p.id}" autocomplete="off">
        <div class="tc-add-row"><input name="title" placeholder="+ Role" aria-label="Add a role for ${esc(p.name)}"/>
          <button type="button" class="tc-btn tc-sharebtn" data-share aria-label="Share this role" aria-expanded="false" title="Share with others">${SHARE_ICON}</button></div>
        <div class="tc-share" hidden>
          <div class="tc-chips" role="group" aria-label="Share with">${state.people.filter((x) => x.id !== p.id).map((x) => `<button type="button" class="tc-chip" data-with="${x.id}" aria-pressed="false">${esc(x.name)}</button>`).join('')}</div>
          ${sharable(p).length ? `<select name="join" aria-label="Link to an existing role"><option value="">Link to existing role…</option>${sharable(p).map((r) => `<option value="${r.id}">${esc(r.title)} · ${esc(r.people.map(personName).join(' & '))}</option>`).join('')}</select>` : ''}
        </div>
      </form>
    </article>`;
}

function matchesFilter(p) {
  if (teamFilter === 'all') return true;
  const [kind, val] = [teamFilter.slice(0, teamFilter.indexOf(':')), teamFilter.slice(teamFilter.indexOf(':') + 1)];
  const rs = rolesOf(p.id);
  return kind === 'st' ? rs.some((r) => statusKey(r.status) === val) : rs.some((r) => r.title === val);
}

/* order the grid so pink / burgundy / green alternate instead of sitting in blocks; uncoloured cards go last */
function mixColors(list) {
  const by = { pink: [], burgundy: [], green: [], none: [] };
  list.forEach((p) => (by[colorOf(p)] || by.none).push(p));
  const out = [];
  while (by.pink.length || by.burgundy.length || by.green.length) ['burgundy', 'pink', 'green'].forEach((k) => { if (by[k].length) out.push(by[k].shift()); });
  return [...out, ...by.none];
}

function team() {
  const titles = [...new Set(state.roles.map((r) => r.title))].sort((a, b) => a.localeCompare(b));
  const people = mixColors(state.people.filter(matchesFilter));
  view.innerHTML = `
    <div class="page-head team-head">
      <h1>Team</h1>
      <div class="st-tabs" role="group" aria-label="Filter by status">
        <button type="button" aria-pressed="${teamFilter === 'all'}" class="${teamFilter === 'all' ? 'on' : ''}" data-f="all"><span class="n"><b>${state.people.length}</b></span><span class="l">Everyone</span></button>
        ${STATUSES.map((st) => `<button type="button" aria-pressed="${teamFilter === 'st:' + statusKey(st)}" class="${statusKey(st)}${teamFilter === 'st:' + statusKey(st) ? ' on' : ''}" data-f="st:${statusKey(st)}"><span class="n"><b>${state.roles.filter((r) => r.status === st).length}</b><i class="shp" aria-hidden="true"></i></span><span class="l">${st}</span></button>`).join('')}
      </div>
      <label class="tf-select"><span class="sr-only">Role</span>
        <select id="teamFilter" aria-label="Filter by role"><option value="all">All roles</option>${titles.map((t) => `<option value="role:${esc(t)}">${esc(t)}</option>`).join('')}</select>
      </label>
    </div>
    <div class="tgrid">
      ${people.map(personCard).join('')}
      ${teamFilter === 'all' ? `<form class="tcard t-add" id="addPerson" autocomplete="off"><input name="who" placeholder="+ Add someone" aria-label="New team member's name"/></form>` : ''}
    </div>
    ${people.length ? '' : `<div class="tf-none"><p>No one has a role in this view.</p><button type="button" class="tc-yes" data-f="all">Show everyone</button></div>`}`;
  const sel = view.querySelector('#teamFilter');
  sel.value = teamFilter.startsWith('role:') ? teamFilter : 'all';
  sel.onchange = () => { teamFilter = sel.value; team(); };
  view.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { teamFilter = teamFilter === b.dataset.f ? 'all' : b.dataset.f; team(); });

  const P = (id) => state.people.find((p) => p.id === id);
  // Status cycles in place (no re-render); legend counts follow
  view.querySelectorAll('.stbtn').forEach((b) => b.onclick = () => {
    const rid = b.dataset.role;
    const r = state.roles.find((x) => x.id === rid);
    if (!r) return;
    r.status = STATUSES[(STATUSES.indexOf(r.status) + 1) % STATUSES.length];
    const st = r.status;
    view.querySelectorAll(`.stbtn[data-role="${CSS.escape(rid)}"]`).forEach((o) => { o.className = 'stbtn ' + statusKey(st); o.querySelector('span').textContent = st; o.setAttribute('aria-label', `Status: ${st}. Click to change`); o.closest('.tc-role').dataset.status = statusKey(st); });
    view.querySelectorAll('.st-tabs [data-f^="st:"]').forEach((sp, i) => { sp.querySelector('b').textContent = state.roles.filter((x) => x.status === STATUSES[i]).length; });
    commit({ silent: true });
  });
  view.querySelectorAll('[data-openperson]').forEach((b) => b.onclick = () => openPerson(b.dataset.openperson));
  view.querySelectorAll('[data-menu]').forEach((b) => b.onclick = () => { menuFor = menuFor === b.dataset.menu ? null : b.dataset.menu; confirmDel = null; team(); });
  view.querySelectorAll('[data-setcolor]').forEach((b) => b.onclick = () => {
    const p = P(b.closest('.tcard').dataset.pid);
    p.color = b.dataset.setcolor;
    menuFor = null;
    commit();
  });
  view.querySelectorAll('[data-addrole]').forEach((f) => f.onsubmit = (e) => {
    e.preventDefault();
    const title = f.elements.title.value.trim();
    const join = state.roles.find((r) => r.id === f.elements.join?.value);
    if (join) { join.people.push(f.dataset.addrole); return commit(); }
    if (!title) return;
    const who = [f.dataset.addrole, ...[...f.querySelectorAll('[data-with][aria-pressed="true"]')].map((b) => b.dataset.with)];
    state.roles.push({ id: uid(), title, people: who, status: 'Not started', details: [], links: [] });
    commit();
    view.querySelector(`[data-addrole="${CSS.escape(f.dataset.addrole)}"] input`)?.focus();
  });
  view.querySelectorAll('[data-editrole]').forEach((b) => b.onclick = () => { editingRole = b.dataset.editrole; menuFor = null; team(); view.querySelector('.tc-redit input')?.focus(); });
  view.querySelectorAll('[data-canceledit]').forEach((b) => b.onclick = () => { editingRole = null; team(); });
  view.querySelectorAll('[data-rwith]').forEach((b) => b.onclick = () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')));
  view.querySelectorAll('[data-saverole]').forEach((f) => f.onsubmit = (e) => {
    e.preventDefault();
    const r = state.roles.find((x) => x.id === f.dataset.saverole);
    const title = f.elements.title.value.trim();
    const who = [...f.querySelectorAll('[data-rwith][aria-pressed="true"]')].map((b) => b.dataset.rwith);
    if (!r || !title) return;
    if (!who.length) { toast('Pick at least one person for this role'); return; }
    r.title = title; r.people = who;
    editingRole = null;
    commit();
  });
  view.querySelectorAll('[data-delrole]').forEach((b) => b.onclick = async () => {
    const r = state.roles.find((x) => x.id === b.dataset.delrole);
    if (!r) return;
    if (await confirmDialog({ title: 'Delete this role?', body: `“${r.title}” comes off everyone’s card. This can’t be undone.`, confirmLabel: 'Delete', cancelLabel: 'Keep' })) {
      state.roles = state.roles.filter((x) => x.id !== r.id);
      editingRole = null;
      commit();
    }
  });
  view.querySelectorAll('[data-share]').forEach((b) => b.onclick = () => {
    const panel = b.closest('form').querySelector('.tc-share');
    panel.hidden = !panel.hidden;
    b.setAttribute('aria-expanded', String(!panel.hidden));
  });
  view.querySelectorAll('[data-with]').forEach((b) => b.onclick = () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')));
  // × asks first (inline), then removes with Undo
  view.querySelectorAll('[data-delperson]').forEach((b) => b.onclick = () => { confirmDel = confirmDel === b.dataset.delperson ? null : b.dataset.delperson; menuFor = null; team(); });
  view.querySelector('[data-canceldel]')?.addEventListener('click', () => { confirmDel = null; team(); });
  view.querySelector('[data-confirmdel]')?.addEventListener('click', (e) => {
    const p = P(e.currentTarget.dataset.confirmdel);
    confirmDel = null;
    if (!p) return team();
    undoable(`${p.name} removed`, () => {
      state.people = state.people.filter((x) => x.id !== p.id);
      state.roles = state.roles.filter((r) => { r.people = r.people.filter((x) => x !== p.id); return r.people.length; });
    }, toast);
  });
  // Add someone: name + Enter → a new (neutral) card and a guest
  view.querySelector('#addPerson')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.elements.who.value.trim();
    if (!name) return;
    state.people.push({ id: uid(), name, tag: '', color: 'none', links: [], updates: [] });
    ensureAutoGuests();
    commit();
    toast(`${name} added`);
    view.querySelector('#addPerson input')?.focus();
  });
  if (confirmDel) view.querySelector('.tc-no')?.focus();
  if (menuFor) view.querySelector('.tc-menu .on')?.focus();
}

/* ---------------- Guests ---------------- */
const RSVP = ['Not invited yet', 'Invited', 'Yes', 'Maybe', 'Declined'];
const needsAddress = (g) => !g.street && g.party !== 'couple';
// small map-pin: the row's address & details button
const PIN = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="10" r="2.3" fill="currentColor"/></svg>';
const SIDES = ['Betel', 'Carter', 'Both'];
const MEALS = ['Chicken', 'Beef', 'Fish', 'Vegetarian', 'Vegan', 'Kids meal'];
const DETAIL_FIELDS = [
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

/* One filter menu: status, side, relation, table */
const going = (g) => g.rsvp !== 'Declined';
const GUEST_FILTERS = [
  [['all', 'Everyone', () => true],
   ['action', 'Needs action', (g) => g.party !== 'couple' && going(g) && (g.rsvp === 'Not invited yet' || !g.meal || !g.street || !g.tableId)],
   ['unseated', 'Still to seat', (g) => going(g) && !g.tableId && g.party !== 'couple'],
   ['reception', 'Reception guests', going],
   ['notinvited', 'Not invited yet', (g) => g.rsvp === 'Not invited yet'],
   ['awaiting', 'Awaiting RSVP', (g) => g.rsvp === 'Invited' || g.rsvp === 'Maybe'],
   ['yes', 'Said yes', (g) => g.rsvp === 'Yes'],
   ['declined', 'Declined', (g) => g.rsvp === 'Declined'],
   ['noaddr', 'Need address', needsAddress]],
  [['couple', 'The couple', (g) => g.party === 'couple'],
   ['Betel', 'Betel’s side', (g) => g.side === 'Betel' && g.party !== 'couple'],
   ['Carter', 'Carter’s side', (g) => g.side === 'Carter' && g.party !== 'couple'],
   ['Both', 'Shared', (g) => g.side === 'Both']],
  RELATIONS.map((r) => ['rel:' + r, r === 'Plus-one' ? 'Partner / plus-one' : r, (g) => g.party !== 'couple' && relationOf(g) === r]),
];
const FILTER_HEADS = ['Side', 'Relation', 'Table'];
// tables change, so their group is built fresh each time
const guestFilters = () => [...GUEST_FILTERS, state.tables.map((t) => ['t:' + t.id, t.id === 'head' ? 'Sweetheart' : /^\d+$/.test(t.name) ? `Table ${t.name}` : t.name, (g) => g.tableId === t.id])];
const filterDef = (k) => guestFilters().flat().find((f) => f[0] === k) || GUEST_FILTERS[0][0];
const guestFilterMenu = () => {
  const cur = filterDef(guestFilter);
  return `
    <div class="gfilter" id="gFilter">
      <button class="gf-btn ${guestFilter === 'all' ? '' : 'set'}" aria-haspopup="listbox" aria-expanded="false"><span>${esc(cur[1])}</span><b>${state.guests.filter(cur[2]).length}</b><i aria-hidden="true"></i></button>
      ${guestFilter === 'all' ? '' : '<button class="gf-clear" data-gf="all" aria-label="Show everyone">×</button>'}
      <div class="gf-menu" role="listbox">${guestFilters().map((grp, gi) => `<div class="gf-grp">${gi ? `<div class="gf-h">${FILTER_HEADS[gi - 1]}</div>` : ''}${grp.map(([k, l, fn]) => {
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
  const q = guestQuery.toLowerCase();
  const fil = filterDef(guestFilter)[2];
  const list = state.guests.filter((g) => fil(g)
    && (!q || [g.name, g.city, g.household, relationOf(g)].join(' ').toLowerCase().includes(q)));
  const c = (fn) => state.guests.filter(fn).length;

  view.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Guests</h1>
        <p class="lede">${c((g) => g.rsvp !== 'Declined')} of ${guestCountHTML()} · ${c((g) => g.rsvp === 'Yes')} yes</p>
      </div>
      <div class="head-actions">${guestViewToggle()}<button class="btn line icon-btn" id="csv" aria-label="Export CSV" title="Export CSV"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
    </div>

    <form class="guest-add" id="gForm">
      <input class="input" name="name" placeholder="Add guests" aria-label="Guest name" required/>
      <select class="select" name="side" aria-label="Side">${SIDES.map((s) => `<option>${s}</option>`).join('')}</select>
      <button class="btn moss">Add</button>
      <button type="button" class="btn line icon-btn paste-btn" id="pasteBtn" aria-expanded="false" aria-label="Paste a list" title="Paste a list"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false"><path d="M9 4.5h6v3H9zM15 6h2.5a1 1 0 0 1 1 1v12.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H9M8.5 12h7M8.5 15.5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </form>
    <div id="pasteHost"></div>

    <div class="guest-tools">
      ${guestFilterMenu()}
    </div>

    <section class="card flush">
      ${list.length ? `<div class="table-wrap"><table class="guests"><colgroup><col class="w-name"><col class="w-side"><col class="w-rsvp"><col class="w-meal"><col class="w-act"></colgroup>
        <thead><tr><th>Name</th><th>Side</th><th>RSVP</th><th>Meal</th><th><span class="sr">Details</span></th></tr></thead>
        <tbody>${list.map((g) => `
          <tr class="row" data-id="${g.id}">
            <td class="c-name"><div class="name-cell"><input class="input g-name" data-k="name" value="${esc(g.name)}" aria-label="Name" spellcheck="false"/></div></td>
            <td class="c-side"><select class="select" data-k="side" aria-label="Side">${SIDES.map((s) => `<option ${s === g.side ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
            <td class="c-rsvp"><select class="select rsvp" aria-label="RSVP" data-k="rsvp" data-v="${g.rsvp}">${RSVP.map((s) => `<option ${s === g.rsvp ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
            <td class="c-meal"><select class="select" data-k="meal" data-v="${esc(g.meal || '')}" aria-label="Meal"><option value="">—</option>${[...MEALS, ...(g.meal && !MEALS.includes(g.meal) ? [g.meal] : [])].map((m) => `<option ${m === g.meal ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></td>
            <td class="row-actions">
              <button class="more addr-btn ${needsAddress(g) ? 'warn' : ''} ${openGuests.has(g.id) ? 'open' : ''}" data-open="${g.id}" aria-expanded="${openGuests.has(g.id)}" title="Details" aria-label="Details for ${esc(g.name)}"><svg viewBox="0 0 4 16" width="4" height="16" aria-hidden="true"><circle cx="2" cy="2" r="1.6"/><circle cx="2" cy="8" r="1.6"/><circle cx="2" cy="14" r="1.6"/></svg></button>
              ${g.party === 'couple' ? '<span class="x" aria-hidden="true" style="visibility:hidden">×</span>' : `<button class="x" data-delg="${g.id}" aria-label="Remove ${esc(g.name)}">×</button>`}
            </td>
          </tr>
          ${openGuests.has(g.id) ? `<tr class="detail-row" data-id="${g.id}"><td colspan="5">${detailsHTML(g, { extra: true })}</td></tr>` : ''}`).join('')}</tbody></table></div>
`
      : `<p class="muted" style="margin:0;padding:20px">No guests${guestFilter === 'all' && !q ? ' yet' : ' match'}.</p>`}
    </section>`;

  const add = (name, side = 'Both') => state.guests.push({ id: uid(), name, side, rsvp: 'Not invited yet', diet: '', tableId: null });
  view.querySelector('#csv').onclick = () => guestsCSV();
  wireGuestViewToggle(); wireGuestCount(view);
  const gForm = view.querySelector('#gForm');
  const typing = () => gForm.classList.toggle('typing', !!gForm.name.value.trim());
  gForm.name.addEventListener('input', typing);
  // a multi-name paste into "Add guests" opens the list preview instead of adding blindly
  const pasteHost = view.querySelector('#pasteHost');
  const drawPaste = () => {
    mountPaste(pasteHost, { defaultSide: gForm.side.value });
    const b = view.querySelector('#pasteBtn'); b.classList.toggle('on', pasteIsOpen()); b.setAttribute('aria-expanded', pasteIsOpen());
  };
  gForm.name.addEventListener('paste', (e) => {
    const text = e.clipboardData.getData('text');
    if (!/[\n;,\t]/.test(text.trim())) return;
    e.preventDefault();
    openPaste(text); drawPaste();
  });
  view.querySelector('#pasteBtn').onclick = () => {
    if (pasteIsOpen()) pasteHost.querySelector('[data-paste-cancel]')?.click();
    else { openPaste(gForm.name.value.trim()); gForm.name.value = ''; }
    drawPaste();
  };
  pasteHost.addEventListener('click', (e) => { if (e.target.closest('[data-paste-cancel]')) setTimeout(drawPaste); });
  drawPaste();
  gForm.onsubmit = (e) => {
    e.preventDefault();
    const n = gForm.name.value.trim();
    if (!n) return;
    add(n, gForm.side.value); commit();
    view.querySelector('#gForm [name=name]').focus();
  };
  const wireFilter = () => {
    const gf = view.querySelector('#gFilter');
    gf.querySelector('.gf-btn').onclick = () => { const o = gf.classList.toggle('open'); gf.querySelector('.gf-btn').setAttribute('aria-expanded', o); };
    gf.querySelectorAll('[data-gf]').forEach((b) => b.onclick = () => { guestFilter = b.dataset.gf; guests(); });
  };
  // counts follow quiet edits (relation, table…) without redrawing the list
  const refreshFilter = () => { const old = view.querySelector('#gFilter'); if (!old) return; old.outerHTML = guestFilterMenu(); wireFilter(); };
  wireFilter();
  view.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => {
    const id = b.dataset.open;
    openGuests.has(id) ? openGuests.delete(id) : openGuests.add(id);
    guests();
  });
  view.querySelectorAll('tr.row[data-id]').forEach((tr) => {
    const g = state.guests.find((x) => x.id === tr.dataset.id);
    tr.querySelectorAll('[data-k]').forEach((el) => {
      el.onchange = () => {
        const k = el.dataset.k;
        if (k === 'name' && !el.value.trim()) { el.value = g.name; return; }
        g[k] = el.value || (k === 'tableId' ? null : '');
        if (k === 'rsvp' || k === 'meal') el.dataset.v = el.value;
        if (k === 'relation') el.dataset.v = relationOf(g);
        if (k === 'name') { g.name = el.value.trim(); const p = state.people.find((x) => x.id === g.personId); if (p) p.name = g.name; }
        refreshFilter();
        commit({ silent: !['rsvp', 'side', 'street'].includes(k) });
      };
    });
  });
  // address & details panels (household / plus-one / photo changes redraw the list in place)
  openGuests.forEach((id) => { const g = state.guests.find((x) => x.id === id); if (g) wireDetails(view, g, { onRedraw: () => commit() }); });
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
const ROUTES = { overview, team, seating: () => renderSeating(view), guests, agenda: () => renderAgenda(view) };
function route(opts = {}) {
  const [name, sub] = (location.hash.slice(1) || 'overview').split('/');   // '#seating/ceremony' opens that Seating space
  const fn = ROUTES[name] || overview;
  document.body.dataset.route = ROUTES[name] ? name : 'overview';
  document.querySelectorAll('.mainnav a').forEach((a) => { const on = a.dataset.route === name; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  moveInk();
  // Keep scroll position when re-rendering the same page (e.g. after posting an update)
  const y = window.scrollY;
  fn();
  if (opts.enter && name === 'seating' && sub) view.querySelector(`[data-space="${sub}"]`)?.click();
  refreshGuide();
  if (opts.enter) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); clearTimeout(enterTimer); enterTimer = setTimeout(() => view.classList.remove('enter'), 600); countUp(); }
  else { window.scrollTo(0, y); view.querySelectorAll('.countup').forEach((el) => { el.textContent = el.dataset.to; }); }
}
window.addEventListener('hashchange', () => { route({ enter: true }); window.scrollTo(0, 0); view.focus({ preventScroll: true }); });
subscribe(() => route());

function tickCountdown() { // the header pill is gone (REQ-21); the count lives on the Overview hero
  const el = document.getElementById('countdown');
  if (el) el.innerHTML = `<b>${Math.max(0, daysUntil(WEDDING.date))}</b> days`;
}

mountLive(document.getElementById('liveBtn'));
initSync();
document.getElementById('resetBtn').onclick = async () => {
  if (await confirmDialog({ title: 'Start over?', body: 'This clears everything you’ve planned.', confirmLabel: 'Start over', cancelLabel: 'Cancel' })) undoable('Started fresh', reset, toast);
};
document.addEventListener('storage-full', () => toast('Storage full — remove a few photos'));

// Street autocomplete: picking an address fills street, city, state and ZIP for that guest
enableAddressLookup((k, v, row) => {
  const g = state.guests.find((x) => x.id === row?.dataset.id);
  if (g) { g[k] = v; commit(); }
});
tickCountdown();
setInterval(tickCountdown, 60_000);
initGuide(() => document.body.dataset.route || 'overview');
initHistory();
route({ enter: true });
