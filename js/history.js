// Revision history: the plan is snapshotted after saves (edits within a few minutes fold into one version),
// the last 100 kept (named versions are never dropped). Compact: each top-level part (guests, tables, roles…) is stored once and shared by every
// version where it didn't change. Photos (data: images) are never copied — restoring leaves them as they are.
import { state, onSave, undoable } from './store.js';
import { esc, toast, trapFocus } from './util.js';

const HKEY = 'betel-carter-history';
const KEEP = 100;
const WINDOW = 3 * 60 * 1000; // edits closer together than this become one version
const SKIP = new Set(['updatedAt', 'version']);
const LABEL = {
  guests: 'Guests', links: 'Guests', guestTarget: 'Guests', autoGuests: 'Guests', guestCols: 'Guests', guestColW: 'Guests', teamOrder: 'Team',
  tables: 'Seating', room: 'Seating', spaces: 'Seating', lastStyle: 'Seating', morais: 'Seating',
  people: 'Team', roles: 'Team', milestones: 'Milestones', agenda: 'Agenda', mood: 'Colors',
};

function hash(str) { // FNV-1a, enough to share identical parts
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + str.length.toString(36);
}
function load() {
  try { const h = JSON.parse(localStorage.getItem(HKEY)); if (h && Array.isArray(h.v) && h.pool) return h; } catch { /* corrupt → start over */ }
  return { v: [], pool: {} };
}
/** Drop the oldest unnamed versions (named ones are kept). */
function trim(h, drop) {
  for (let i = 0; i < h.v.length && drop > 0;) { if (h.v[i].name) i++; else { h.v.splice(i, 1); drop--; } }
}
let syncInfo = null; // filled in lazily from sync.js, so history never depends on it at load time
const author = () => { try { const i = syncInfo?.(); return i?.live && i.email ? i.email : ''; } catch { return ''; } };
const who = (e) => { const n = String(e || '').split('@')[0].split(/[._+-]/)[0]; return n ? n[0].toUpperCase() + n.slice(1) : ''; };

function store(h) {
  // drop parts nobody points at any more
  const used = new Set(h.v.flatMap((v) => Object.values(v.parts)));
  Object.keys(h.pool).forEach((k) => { if (!used.has(k)) delete h.pool[k]; });
  try { localStorage.setItem(HKEY, JSON.stringify(h)); return true; }
  catch { // storage full: give up the oldest versions rather than the plan
    while (h.v.length > 3) { trim(h, 1); try { localStorage.setItem(HKEY, JSON.stringify(h)); return true; } catch { /* keep trimming */ } }
    return false;
  }
}

/** Split the plan into parts; anything holding photos is left out. */
function parts(s) {
  const out = {};
  Object.keys(s).forEach((k) => {
    if (SKIP.has(k)) return;
    const j = JSON.stringify(s[k]);
    if (j === undefined || j.includes('"data:')) return;
    out[k] = j;
  });
  return out;
}

function snapshot(s, o = {}) {
  const h = load();
  const p = parts(s), refs = {};
  Object.entries(p).forEach(([k, j]) => { const id = hash(j); h.pool[id] ??= j; refs[k] = id; });
  const last = h.v.at(-1);
  const same = last && Object.keys(refs).length === Object.keys(last.parts).length && Object.entries(refs).every(([k, id]) => last.parts[k] === id);
  if (same) return;
  const now = Date.now();
  const fold = !o.fresh && last && now - last.at < WINDOW;
  const prev = fold ? h.v[h.v.length - 2] : last; // what this version changed, vs the one before
  const changed = [...new Set(Object.keys(refs).filter((k) => !prev || prev.parts[k] !== refs[k]).map((k) => LABEL[k] || 'Plan'))];
  const entry = { at: now, parts: refs, what: changed.slice(0, 3) };
  const by = o.by || author();
  if (by) entry.by = by;
  if (fold) {
    entry.what = [...new Set([...(last.what || []), ...entry.what])].slice(0, 3);
    if (last.name) entry.name = last.name;
    if (!by && last.by) entry.by = last.by;
    h.v[h.v.length - 1] = entry;
  } else h.v.push(entry);
  if (h.v.length > KEEP) trim(h, h.v.length - KEEP);
  store(h);
}

/** Rebuild a version (photo parts come from the current plan). */
function rebuild(v, h) {
  const s = {};
  Object.entries(v.parts).forEach(([k, id]) => { if (h.pool[id] !== undefined) s[k] = JSON.parse(h.pool[id]); });
  return s;
}

const GAP = 30 * 60 * 1000; // a longer pause starts a new session
const DAY = 86400000;
const startOf = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const clock = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const range = (a, b) => {
  const x = clock(a), y = clock(b);
  if (x === y) return x;
  const sx = x.match(/\s*[AP]M$/)?.[0], sy = y.match(/\s*[AP]M$/)?.[0];
  return `${sx === sy ? x.slice(0, -sx.length) : x} – ${y}`;
};
const dayLabel = (t) => {
  const n = Math.round((startOf(Date.now()) - startOf(t)) / DAY);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  const d = new Date(t);
  if (n < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
};
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${dayLabel(t)} ${clock(t)}`.toLowerCase();
};
const count = (s) => ({
  Guests: (s.guests || []).length,
  Tables: (s.tables || []).length,
  Done: (s.roles || []).filter((r) => r.status === 'Done').length,
  Agenda: (s.agenda || []).length,
  Dates: (s.milestones || []).length,
});
const COUNT_NOTE = { Guests: 'Guests', Tables: 'Tables', Done: 'Roles done', Agenda: 'Agenda events', Dates: 'Dates' };
const COUNT_AREA = { Guests: 'Guests', Tables: 'Seating', Done: 'Team', Agenda: 'Agenda', Dates: 'Milestones' };

/** Newest-first versions → [{label, sessions:[{key, items:[v…newest first]}]}] */
function group(vs) {
  const days = [];
  vs.forEach((v) => {
    const label = dayLabel(v.at), day = startOf(v.at);
    let d = days.at(-1);
    if (!d || d.day !== day) days.push(d = { day, label, sessions: [] });
    const s = d.sessions.at(-1);
    if (s && s.items.at(-1).at - v.at <= GAP) s.items.push(v);
    else d.sessions.push({ key: v.at, items: [v] });
  });
  return days;
}
const summary = (items) => {
  const all = [...new Set(items.flatMap((v) => v.what || []))];
  return (all.slice(0, 3).join(', ') || 'Plan') + (all.length > 3 ? ` +${all.length - 3}` : '');
};
const byline = (items) => { const w = [...new Set(items.map((v) => who(v.by)).filter(Boolean))]; return w.join(', '); };

/** What would change if this version were restored (current → version). */
function diff(old) {
  const a = count(old), c = count(state), lines = [], seen = new Set();
  Object.keys(a).forEach((k) => { if (a[k] !== c[k]) { lines.push(`${COUNT_NOTE[k]} ${c[k]} → ${a[k]}`); seen.add(COUNT_AREA[k]); } });
  const areas = new Set();
  Object.keys(old).forEach((k) => { if (JSON.stringify(old[k]) !== JSON.stringify(state[k])) areas.add(LABEL[k] || 'Plan'); });
  [...areas].filter((x) => !seen.has(x)).forEach((x) => lines.push(`${x} edited`));
  return lines;
}

const CHEV = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

function openPanel() {
  document.querySelector('.hist-scrim')?.remove();
  let h = load();
  const versions = () => h.v.slice().reverse();
  const open = new Set();
  let all = false, sel = null;
  const first = versions()[0];
  if (first) open.add(first.at); // the newest session starts open (its key is its newest version's time)
  const scrim = document.createElement('div');
  scrim.className = 'hist-scrim';
  scrim.innerHTML = `
    <aside class="hist hg" role="dialog" aria-modal="true" aria-labelledby="hgT">
      <header><h2 id="hgT">Version history</h2><button class="x" data-close aria-label="Close">×</button></header>
      <div class="hg-bar"><span id="hgSwL">Show detailed versions</span><button class="hg-sw" role="switch" aria-checked="false" aria-labelledby="hgSwL"><i></i></button></div>
      <div class="hg-scroll"></div>
      <div class="hist-peek hg-peek" hidden></div>
    </aside>`;
  document.body.append(scrim);
  const release = trapFocus(scrim);
  const close = () => { release(); scrim.classList.add('out'); setTimeout(() => scrim.remove(), 240); };
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });
  scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  const scroll = scrim.querySelector('.hg-scroll'), peek = scrim.querySelector('.hg-peek'), sw = scrim.querySelector('.hg-sw');

  const vBtn = (v) => `<button class="hg-v${sel === v.at ? ' on' : ''}" data-at="${v.at}" aria-pressed="${sel === v.at}"><span class="hg-t">${clock(v.at)}</span>${v.name ? `<b>${esc(v.name)}</b>` : ''}<span class="hg-s">${esc((v.what || []).join(', ') || 'Plan')}${v.by ? ` · ${esc(who(v.by))}` : ''}</span></button>`;

  function render() {
    const vs = versions();
    if (vs.length < 2) { scroll.innerHTML = '<p class="hist-empty">Versions appear here as you plan.</p>'; return; }
    let n = 0;
    scroll.innerHTML = `
      <button class="hg-cur${sel === null ? ' on' : ''}" data-cur aria-pressed="${sel === null}"><b>Current version</b><span>${esc(clock(vs[0].at))} · saved automatically</span></button>
      ${group(vs).map((d) => `<section><h3 class="hg-day">${esc(d.label)}</h3><ul class="hg-days">${d.sessions.map((s) => {
        const id = `hgs${n++}`, items = s.items, named = items.filter((v) => v.name);
        const isOpen = all || open.has(s.key), by = byline(items), rg = range(items.at(-1).at, items[0].at);
        if (items.length === 1) return `<li class="hg-sess">${vBtn(items[0])}</li>`;
        return `<li class="hg-sess">
          <div class="hg-row"><button class="hg-chev" aria-expanded="${isOpen}" aria-controls="${id}" data-key="${s.key}" aria-label="${esc(rg)}, ${items.length} edits">${CHEV}</button>
            <div class="hg-sum"><span class="hg-t">${esc(rg)}</span>${named.map((v) => `<b>${esc(v.name)}</b>`).join('')}<span class="hg-s">${esc(summary(items))} · ${items.length} edits${by ? ` · ${esc(by)}` : ''}</span></div></div>
          <ul class="hg-det" id="${id}"${isOpen ? '' : ' hidden'}>${items.map((v) => `<li>${vBtn(v)}</li>`).join('')}</ul></li>`;
      }).join('')}</ul></section>`).join('')}`;
  }
  function showPeek() {
    const v = h.v.find((x) => x.at === sel);
    if (!v) { peek.hidden = true; return; }
    const old = rebuild(v, h), lines = diff(old);
    peek.hidden = false;
    peek.innerHTML = `
      <p class="hg-when">${esc(dayLabel(v.at))}, ${esc(clock(v.at))}${v.by ? ` · ${esc(who(v.by))}` : ''}</p>
      <ul class="hg-diff">${lines.length ? lines.map((l) => `<li>${esc(l)}</li>`).join('') : '<li>Same as the current version</li>'}</ul>
      <form class="hg-name"><label for="hgN">Name this version</label><div><input id="hgN" maxlength="60" value="${esc(v.name || '')}" placeholder="e.g. Sent to venue"><button class="hg-sec" type="submit">Save</button></div></form>
      <button class="hg-restore" data-restore>Restore this version</button>`;
    peek.classList.remove('in'); void peek.offsetWidth; peek.classList.add('in');
    peek.querySelector('.hg-name').onsubmit = (e) => {
      e.preventDefault();
      const fresh = load(), t = fresh.v.find((x) => x.at === v.at);
      if (!t) return;
      const nm = peek.querySelector('#hgN').value.trim();
      if (nm) t.name = nm; else delete t.name;
      store(fresh); h = load(); render(); showPeek();
      scroll.querySelector(`.hg-v[data-at="${v.at}"]`)?.focus();
    };
    peek.querySelector('[data-restore]').onclick = () => {
      close();
      snapshot(state); // never lose what is current: it is a version before we replace it
      undoable(`Restored · ${ago(v.at)}`, () => {
        // Parts in the version replace the current ones; photos (not in history) stay as they are
        Object.keys(old).forEach((k) => { state[k] = old[k]; });
      }, toast);
    };
  }
  scroll.addEventListener('click', (e) => {
    const ch = e.target.closest('.hg-chev');
    if (ch) {
      const on = ch.getAttribute('aria-expanded') !== 'true';
      ch.setAttribute('aria-expanded', on);
      document.getElementById(ch.getAttribute('aria-controls')).hidden = !on;
      if (on) open.add(+ch.dataset.key); else open.delete(+ch.dataset.key);
      return;
    }
    const b = e.target.closest('.hg-v, .hg-cur');
    if (!b) return;
    sel = b.matches('.hg-cur') ? null : +b.dataset.at;
    scroll.querySelectorAll('.hg-v, .hg-cur').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
    showPeek();
  });
  sw.onclick = () => {
    all = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', all);
    scroll.querySelectorAll('.hg-chev').forEach((c) => { const on = all || open.has(+c.dataset.key); c.setAttribute('aria-expanded', on); document.getElementById(c.getAttribute('aria-controls')).hidden = !on; });
  };
  render();
  (scroll.querySelector('.hg-cur') || scrim.querySelector('[data-close]')).focus();
}

/** Changes adopted from another editor get their own version, credited to them (the next local save will not fold into it). */
export const recordAdopted = (who) => snapshot(state, { by: who, fresh: true });

export function initHistory() {
  import('./sync.js').then((m) => { syncInfo = m.info; }).catch(() => { /* offline or blocked: versions just have no author */ });
  onSave((s) => snapshot(s));
  if (!load().v.length) snapshot(state); // a starting point
  document.getElementById('historyBtn')?.addEventListener('click', openPanel);
}
