import { state, commit, subscribe, reset, uid, ensureAutoGuests, undoable } from './store.js';
import { WEDDING, STATUSES, MILESTONES, MOODS, INSPO } from './data.js';
import { seatCount, RELATIONS, relationOf } from './layout.js';
import { renderSeating } from './seating.js';
import { renderConnections, stopConnections } from './connections.js';
import { enableAddressLookup } from './address.js';
import { esc, toast, daysUntil, fmtDate } from './util.js';
import { openPerson } from './person.js';
import { renderAgenda } from './agenda.js';
import { initGuide, refreshGuide } from './guide.js';
import { initHistory } from './history.js';
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
  if ((r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+r[1], +r[2], +r[3]];
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
            ${p.m.id !== 'wedding' ? `<button class="x mtl-x" data-delms="${esc(p.m.id)}" aria-label="Remove ${esc(p.m.label)}">×</button>` : ''}
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

/**
 * Invitation-style photo: an oval with a lace-doily edge (scallops with eyelet holes, a stitched inner ring).
 * Drawn here, no artwork from the pin. Scallops bloom in one after another.
 */
function laceOval(src) {
  const cx = 150, cy = 200, rx = 118, ry = 165, n = 54;
  let lace = '', holes = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * (rx + 12), y = cy + Math.sin(a) * (ry + 12);
    lace += `<circle class="sc" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" style="--d:${(i * 14) % 700}ms"/>`;
    const hx = cx + Math.cos(a) * (rx + 13), hy = cy + Math.sin(a) * (ry + 13);
    holes += `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="2.1"/>`;
    if (i % 2 === 0) { const px = cx + Math.cos(a) * (rx + 4), py = cy + Math.sin(a) * (ry + 4); holes += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="1.2"/>`; }
  }
  return `<svg class="lace" viewBox="0 0 300 400" role="img" aria-label="Betel and Carter">
    <defs><clipPath id="ovalClip"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath></defs>
    <g class="lace-edge">${lace}<ellipse cx="${cx}" cy="${cy}" rx="${rx + 12}" ry="${ry + 12}" class="lace-fill"/></g>
    <g class="lace-holes">${holes}</g>
    <image href="${esc(src)}" x="${cx - rx}" y="${cy - ry}" width="${rx * 2}" height="${ry * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ovalClip)"/>
    <ellipse class="lace-stitch" cx="${cx}" cy="${cy}" rx="${rx - 5}" ry="${ry - 5}"/>
    <ellipse class="lace-rim" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>
  </svg>`;
}

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
      <section class="hero invite">
        <div class="inv-oval">${laceOval(WEDDING.heroImage)}</div>
        <div class="inv-text">
          <h1 class="inv-names">Betel <span class="amp">&amp;</span> Carter</h1>
          <p class="inv-script">are getting married</p>
          <p class="inv-meta">June 17, 2027 · Morais Vineyards</p>
          <div class="hero-count"><b class="countup" data-to="${days}">0</b><span>days to go</span></div>
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
              <input name="date" required placeholder="Mar 3" aria-label="Date (month and day)" class="mtl-date"/>
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

/* Bridesmaid colors (Betel's groups). New people get the least-used color unless one is set. */
const TEAM_COLORS = { pink: 'Pink', burgundy: 'Burgundy', green: 'Green' };
const COLOR_OF = { kiara: 'pink', monica: 'pink', ashlyn: 'burgundy', eden: 'burgundy', noella: 'burgundy', noemi: 'green', morgan: 'green', isabele: 'green' };
const colorOf = (p) => p.color || COLOR_OF[p.id] || 'green';
const ST_SHORT = { 'Not started': 'To do', 'In progress': 'Doing', 'Waiting on bride': 'Waiting', Done: 'Done' };
let teamColor = 'all', teamStatus = 'all';
let confirmDel = null; // person id showing the inline "Remove X?"
let freshPerson = null;
let teamRO = null;

/** Interleave the color groups so cards of one color don't clump together. */
function spreadByColor(people) {
  const groups = Object.keys(TEAM_COLORS).map((c) => people.filter((p) => colorOf(p) === c)).sort((a, b) => b.length - a.length);
  const out = [];
  for (let i = 0; out.length < people.length; i++) groups.forEach((g) => { if (g[i]) out.push(g[i]); });
  return out;
}

const statusPills = (r) => `
  <div class="stp" role="radiogroup" aria-label="Status for ${esc(r.title)}" data-role="${r.id}">
    ${STATUSES.map((s) => `<button type="button" role="radio" aria-checked="${s === r.status}" class="stp-o ${statusKey(s)}${s === r.status ? ' on' : ''}" data-st="${s}" title="${s}"><i></i><span>${ST_SHORT[s] || s}</span></button>`).join('')}
  </div>`;

function personCard(p) {
  const rs = rolesOf(p.id);
  const doneN = rs.filter((r) => r.status === 'Done').length;
  const asking = confirmDel === p.id;
  return `
    <article class="person tint-${colorOf(p)}${p.id === freshPerson ? ' fresh' : ''}" data-pid="${p.id}" data-color="${colorOf(p)}">
      <header class="p-head">
        <div class="p-id">
          <button class="p-name" data-openperson="${p.id}">${esc(p.name)}</button>
          ${p.tag ? `<span class="p-tag">${esc(p.tag)}</span>` : ''}
        </div>
        ${rs.length ? `<span class="p-count" title="Roles done">${doneN}/${rs.length}</span>` : ''}
        <button class="x p-del" data-delperson="${p.id}" aria-label="Remove ${esc(p.name)}">×</button>
      </header>
      ${asking ? `<div class="p-confirm" role="alertdialog" aria-label="Remove ${esc(p.name)}?">
        <span>Remove ${esc(p.name)}?</span>
        <button class="pc-yes" data-confirmdel="${p.id}">Remove</button><button class="pc-no" data-canceldel>Keep</button>
      </div>` : ''}
      <ul class="roles">
        ${rs.map((r) => `
          <li class="role" data-status="${statusKey(r.status)}">
            <div class="role-title">${esc(r.title)}</div>
            ${r.people.length > 1 || r.with ? `<div class="with">with ${esc([...r.people.filter((x) => x !== p.id).map(personName), r.with].filter(Boolean).join(' & '))}</div>` : ''}
            ${statusPills(r)}
          </li>`).join('')}
      </ul>
      <form class="add-role-inline" data-addrole="${p.id}" autocomplete="off">
        <input name="title" placeholder="+ Role" aria-label="Add a role for ${esc(p.name)}"/>
      </form>
    </article>`;
}

/** Packed masonry: each card drops into the shortest column; positions glide when filters or sizes change. */
function layoutTeam() {
  const box = view.querySelector('.people');
  if (!box) return;
  const cards = [...box.children].filter((c) => !c.classList.contains('gone'));
  const W = box.clientWidth, gap = 14;
  const cols = Math.max(1, Math.floor((W + gap) / (264 + gap)));
  const cw = (W - gap * (cols - 1)) / cols;
  cards.forEach((c) => { c.style.width = cw + 'px'; });
  const hs = Array(cols).fill(0);
  cards.forEach((c) => {
    const k = hs.indexOf(Math.min(...hs));
    c.style.transform = `translate(${(k * (cw + gap)).toFixed(1)}px, ${hs[k]}px)`;
    hs[k] += c.offsetHeight + gap;
  });
  box.style.height = Math.max(0, Math.max(...hs) - gap) + 'px';
  if (!box.classList.contains('ready')) requestAnimationFrame(() => box.classList.add('ready'));
}

function applyTeamFilter() {
  view.querySelectorAll('.people > .person[data-pid]').forEach((c) => {
    const p = state.people.find((x) => x.id === c.dataset.pid);
    const okColor = teamColor === 'all' || colorOf(p) === teamColor;
    const okStatus = teamStatus === 'all' || rolesOf(p.id).some((r) => statusKey(r.status) === teamStatus);
    c.classList.toggle('gone', !(okColor && okStatus));
  });
  view.querySelectorAll('[data-tcolor]').forEach((b) => b.classList.toggle('on', b.dataset.tcolor === teamColor));
  view.querySelectorAll('[data-tstatus]').forEach((b) => b.classList.toggle('on', b.dataset.tstatus === teamStatus));
  layoutTeam();
}

function team() {
  const people = spreadByColor(state.people);
  view.innerHTML = `
    <div class="page-head team-head">
      <h1>Team</h1>
      <div class="team-filters">
        <div class="tf" role="group" aria-label="Color">
          <button data-tcolor="all">All</button>
          ${Object.entries(TEAM_COLORS).map(([k, l]) => `<button data-tcolor="${k}" class="sw-${k}" aria-label="${l}"><i></i></button>`).join('')}
        </div>
        <div class="tf" role="group" aria-label="Status">
          <button data-tstatus="all">Any</button>
          ${STATUSES.map((s) => `<button data-tstatus="${statusKey(s)}" class="${statusKey(s)}" title="${s}"><i></i>${ST_SHORT[s]}</button>`).join('')}
        </div>
      </div>
    </div>
    <div class="people packed">
      ${people.map(personCard).join('')}
      <form class="person add-person" id="addPerson" autocomplete="off">
        <input name="who" placeholder="+ Add someone" aria-label="New team member's name"/>
      </form>
    </div>`;
  freshPerson = null;

  const P = (id) => state.people.find((p) => p.id === id);
  // Status pills: change in place (no re-render) so the highlight can slide
  view.querySelectorAll('.stp-o').forEach((b) => b.onclick = () => {
    const rid = b.closest('.stp').dataset.role, st = b.dataset.st;
    const r = state.roles.find((x) => x.id === rid);
    if (!r || r.status === st) return;
    r.status = st;
    view.querySelectorAll(`.stp[data-role="${CSS.escape(rid)}"]`).forEach((g) => {
      g.querySelectorAll('.stp-o').forEach((o) => { const on = o.dataset.st === st; o.classList.toggle('on', on); o.setAttribute('aria-checked', String(on)); });
      g.closest('.role').dataset.status = statusKey(st);
    });
    view.querySelectorAll('.p-count').forEach((c) => {
      const pid = c.closest('.person').dataset.pid, rs = rolesOf(pid);
      c.textContent = `${rs.filter((x) => x.status === 'Done').length}/${rs.length}`;
    });
    commit({ silent: true });
    if (teamStatus !== 'all') applyTeamFilter();
  });
  view.querySelectorAll('[data-openperson]').forEach((b) => b.onclick = () => openPerson(b.dataset.openperson));
  view.querySelectorAll('[data-addrole]').forEach((f) => f.onsubmit = (e) => {
    e.preventDefault();
    const title = f.elements.title.value.trim();
    if (!title) return;
    state.roles.push({ id: uid(), title, people: [f.dataset.addrole], status: 'Not started', details: [], links: [] });
    commit();
    view.querySelector(`[data-addrole="${CSS.escape(f.dataset.addrole)}"] input`)?.focus();
  });
  // × asks first (inline), then removes with Undo
  view.querySelectorAll('[data-delperson]').forEach((b) => b.onclick = () => { confirmDel = confirmDel === b.dataset.delperson ? null : b.dataset.delperson; team(); });
  view.querySelector('[data-canceldel]')?.addEventListener('click', () => { confirmDel = null; team(); });
  view.querySelector('[data-confirmdel]')?.addEventListener('click', (e) => {
    const p = P(e.currentTarget.dataset.confirmdel);
    confirmDel = null;
    if (!p) return team();
    const card = e.currentTarget.closest('.person');
    card.classList.add('leaving');
    setTimeout(() => undoable(`${p.name} removed`, () => {
      state.people = state.people.filter((x) => x.id !== p.id);
      state.roles = state.roles.filter((r) => { r.people = r.people.filter((x) => x !== p.id); return r.people.length; });
    }, toast), 200);
  });
  // Add someone: name + Enter → a new card (and a guest)
  view.querySelector('#addPerson').onsubmit = (e) => {
    e.preventDefault();
    const name = e.target.elements.who.value.trim();
    if (!name) return;
    const used = (c) => state.people.filter((p) => colorOf(p) === c).length;
    const color = Object.keys(TEAM_COLORS).sort((a, b) => used(a) - used(b))[0];
    const p = { id: uid(), name, tag: '', color, links: [], updates: [] };
    state.people.push(p);
    ensureAutoGuests();
    freshPerson = p.id;
    commit();
    toast(`${name} added`);
    view.querySelector('#addPerson input')?.focus();
  };
  view.querySelectorAll('[data-tcolor]').forEach((b) => b.onclick = () => { teamColor = b.dataset.tcolor; applyTeamFilter(); });
  view.querySelectorAll('[data-tstatus]').forEach((b) => b.onclick = () => { teamStatus = b.dataset.tstatus; applyTeamFilter(); });

  teamRO?.disconnect();
  let raf = 0;
  teamRO = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layoutTeam); });
  const box = view.querySelector('.people');
  teamRO.observe(box);
  [...box.children].forEach((c) => teamRO.observe(c));
  applyTeamFilter();
  if (confirmDel) view.querySelector('.pc-no')?.focus();
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
  const tableOpts = (sel) => `<option value="">—</option>` + state.tables.map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.id === 'head' ? 'Sweetheart' : t.name)}</option>`).join('');
  // phones show "Table 3" in the card; named tables and the sweetheart table read fine alone
  const tableWord = (id) => (/^\d+$/.test(state.tables.find((t) => t.id === id)?.name || '') ? 'Table' : '');
  const q = guestQuery.toLowerCase();
  const fil = filterDef(guestFilter)[2];
  const list = state.guests.filter((g) => fil(g)
    && (!q || [g.name, g.city, g.household, relationOf(g)].join(' ').toLowerCase().includes(q)));
  const relCell = (g) => g.party === 'couple' ? '<span class="rel-fixed">Couple</span>'
    : `<select class="select rel" data-k="relation" data-v="${esc(relationOf(g))}" aria-label="Relation"><option value="none">—</option>${RELATIONS.map((r) => `<option ${r === relationOf(g) ? 'selected' : ''}>${r}</option>`).join('')}</select>`;
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
      <button type="button" class="btn line paste-btn" id="pasteBtn" aria-expanded="false">Paste a list</button>
    </form>
    <div id="pasteHost"></div>

    <div class="guest-tools">
      <input class="input search" id="gSearch" type="search" placeholder="Search" value="${esc(guestQuery)}"/>
      ${guestFilterMenu()}
    </div>

    <section class="card flush">
      ${list.length ? `<div class="table-wrap"><table class="guests">
        <thead><tr><th>Name</th><th>Side</th><th>Relation</th><th>RSVP</th><th>Meal</th><th>Table</th><th><span class="sr">Details</span></th></tr></thead>
        <tbody>${list.map((g) => `
          <tr class="row" data-id="${g.id}">
            <td class="c-name"><div class="name-cell"><button class="g-name" data-person="${g.id}" title="Open ${esc(g.name)}">${esc(g.name)}</button>${needsAddress(g) ? `<button class="need-addr" data-open="${g.id}" title="Add their address">Need address</button>` : ''}</div></td>
            <td class="c-side"><select class="select" data-k="side" aria-label="Side">${SIDES.map((s) => `<option ${s === g.side ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
            <td class="rel-td">${relCell(g)}</td>
            <td class="c-rsvp"><select class="select rsvp" aria-label="RSVP" data-k="rsvp" data-v="${g.rsvp}">${RSVP.map((s) => `<option ${s === g.rsvp ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
            <td class="c-meal"><input class="input" data-k="meal" list="meals" value="${esc(g.meal)}" placeholder="Meal" aria-label="Meal"/></td>
            <td class="c-table" data-t="${tableWord(g.tableId)}"><select class="select" data-k="tableId" aria-label="Table">${tableOpts(g.tableId)}</select></td>
            <td class="row-actions">
              <button class="more addr-btn ${needsAddress(g) ? 'warn' : ''} ${openGuests.has(g.id) ? 'open' : ''}" data-open="${g.id}" aria-expanded="${openGuests.has(g.id)}" title="Address & details" aria-label="Address & details for ${esc(g.name)}">${PIN}</button>
              ${g.party === 'couple' ? '' : `<button class="x" data-delg="${g.id}" aria-label="Remove ${esc(g.name)}">×</button>`}
            </td>
          </tr>
          ${openGuests.has(g.id) ? `<tr class="detail-row" data-id="${g.id}"><td colspan="7"><div class="detail-grid">
            ${DETAIL_FIELDS.map(([k, l, type]) => `<label class="field ${k}">${l}<input class="input${k === 'street' ? ' addr-street' : ''}" data-k="${k}" type="${type}" value="${esc(g[k])}" autocomplete="${k === 'street' ? 'street-address' : 'off'}"/></label>`).join('')}
          </div></td></tr>` : ''}`).join('')}</tbody></table></div>
        <datalist id="meals">${MEALS.map((m) => `<option value="${m}"></option>`).join('')}</datalist>`
      : `<p class="muted" style="margin:0;padding:20px">No guests${guestFilter === 'all' && !q ? ' yet' : ' match'}.</p>`}
    </section>`;

  const add = (name, side = 'Both') => state.guests.push({ id: uid(), name, side, rsvp: 'Not invited yet', diet: '', tableId: null });
  view.querySelector('#csv').onclick = () => guestsCSV();
  wireGuestViewToggle();
  const gForm = view.querySelector('#gForm');
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
  const search = view.querySelector('#gSearch');
  search.oninput = () => { guestQuery = search.value; guests(); const s = view.querySelector('#gSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); };
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
        if (k === 'rsvp') el.dataset.v = el.value;
        if (k === 'relation') el.dataset.v = relationOf(g);
        if (k === 'tableId') el.parentElement.dataset.t = tableWord(g.tableId);
        refreshFilter();
        commit({ silent: !['rsvp', 'side', 'street'].includes(k) });
      };
    });
  });
  view.querySelectorAll('[data-person]').forEach((b) => b.onclick = () => openPerson(b.dataset.person));
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
  const name = location.hash.slice(1) || 'overview';
  const fn = ROUTES[name] || overview;
  document.body.dataset.route = ROUTES[name] ? name : 'overview';
  document.querySelectorAll('.mainnav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  moveInk();
  // Keep scroll position when re-rendering the same page (e.g. after posting an update)
  const y = window.scrollY;
  fn();
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

document.getElementById('resetBtn').onclick = () => {
  undoable('Started fresh', reset, toast);
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
