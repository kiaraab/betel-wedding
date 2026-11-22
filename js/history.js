// Revision history: the plan is snapshotted after saves (edits within a few minutes fold into one version),
// the last 30 kept. Compact: each top-level part (guests, tables, roles…) is stored once and shared by every
// version where it didn't change. Photos (data: images) are never copied — restoring leaves them as they are.
import { state, onSave, undoable } from './store.js';
import { esc, toast, trapFocus } from './util.js';

const HKEY = 'betel-carter-history';
const KEEP = 30;
const WINDOW = 3 * 60 * 1000; // edits closer together than this become one version
const SKIP = new Set(['updatedAt', 'version']);
const LABEL = {
  guests: 'Guests', links: 'Guests', guestTarget: 'Guests', autoGuests: 'Guests',
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
function store(h) {
  // drop parts nobody points at any more
  const used = new Set(h.v.flatMap((v) => Object.values(v.parts)));
  Object.keys(h.pool).forEach((k) => { if (!used.has(k)) delete h.pool[k]; });
  try { localStorage.setItem(HKEY, JSON.stringify(h)); return true; }
  catch { // storage full: give up the oldest versions rather than the plan
    while (h.v.length > 3) { h.v.shift(); try { localStorage.setItem(HKEY, JSON.stringify(h)); return true; } catch { /* keep trimming */ } }
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

function snapshot(s) {
  const h = load();
  const p = parts(s), refs = {};
  Object.entries(p).forEach(([k, j]) => { const id = hash(j); h.pool[id] ??= j; refs[k] = id; });
  const last = h.v.at(-1);
  const same = last && Object.keys(refs).length === Object.keys(last.parts).length && Object.entries(refs).every(([k, id]) => last.parts[k] === id);
  if (same) return;
  const now = Date.now();
  const prev = last && now - last.at < WINDOW ? h.v[h.v.length - 2] : last; // what this version changed, vs the one before
  const changed = [...new Set(Object.keys(refs).filter((k) => !prev || prev.parts[k] !== refs[k]).map((k) => LABEL[k] || 'Plan'))];
  const entry = { at: now, parts: refs, what: changed.slice(0, 3) };
  if (last && now - last.at < WINDOW) { entry.what = [...new Set([...(last.what || []), ...entry.what])].slice(0, 3); h.v[h.v.length - 1] = entry; }
  else h.v.push(entry);
  while (h.v.length > KEEP) h.v.shift();
  store(h);
}

/** Rebuild a version (photo parts come from the current plan). */
function rebuild(v, h) {
  const s = {};
  Object.entries(v.parts).forEach(([k, id]) => { if (h.pool[id] !== undefined) s[k] = JSON.parse(h.pool[id]); });
  return s;
}

const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
const count = (s) => ({
  Guests: (s.guests || []).length,
  Tables: (s.tables || []).length,
  Done: (s.roles || []).filter((r) => r.status === 'Done').length,
  Agenda: (s.agenda || []).length,
  Dates: (s.milestones || []).length,
});

function openPanel() {
  document.querySelector('.hist-scrim')?.remove();
  const h = load();
  const versions = h.v.slice().reverse();
  const scrim = document.createElement('div');
  scrim.className = 'hist-scrim';
  scrim.innerHTML = `
    <aside class="hist" role="dialog" aria-modal="true" aria-label="History">
      <header><h2>History</h2><button class="x" data-close aria-label="Close">×</button></header>
      ${versions.length > 1 ? `<ol class="hist-list">${versions.map((v, i) => `
        <li><button class="hist-v${i === 0 ? ' now' : ''}" data-at="${v.at}" style="--i:${i}">
          <b>${i === 0 ? 'Now' : ago(v.at)}</b><span>${esc((v.what || []).join(' · ') || 'Plan')}</span>
        </button></li>`).join('')}</ol>` : '<p class="hist-empty">Versions appear here as you plan.</p>'}
      <div class="hist-peek" hidden></div>
    </aside>`;
  document.body.append(scrim);
  const release = trapFocus(scrim);
  const close = () => { release(); scrim.classList.add('out'); setTimeout(() => scrim.remove(), 240); };
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });
  scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  const peek = scrim.querySelector('.hist-peek');
  scrim.querySelectorAll('.hist-v').forEach((b) => b.onclick = () => {
    scrim.querySelectorAll('.hist-v').forEach((x) => x.classList.toggle('on', x === b));
    if (b.classList.contains('now')) { peek.hidden = true; return; }
    const v = h.v.find((x) => x.at === +b.dataset.at), old = rebuild(v, h);
    const a = count(old), c = count(state);
    peek.hidden = false;
    peek.innerHTML = `
      <div class="hp-grid">${Object.keys(a).map((k) => `<div><span>${k}</span><b>${a[k]}</b>${a[k] !== c[k] ? `<small>now ${c[k]}</small>` : ''}</div>`).join('')}</div>
      <button class="btn moss sm" data-restore>Restore this version</button>`;
    peek.classList.remove('in'); void peek.offsetWidth; peek.classList.add('in');
    peek.querySelector('[data-restore]').onclick = () => {
      close();
      undoable(`Restored · ${ago(v.at).toLowerCase()}`, () => {
        // Parts in the version replace the current ones; photos (not in history) stay as they are
        Object.keys(old).forEach((k) => { state[k] = old[k]; });
      }, toast);
    };
  });
  scrim.querySelector('.hist-v')?.focus();
}

export function initHistory() {
  onSave((s) => snapshot(s));
  if (!load().v.length) snapshot(state); // a starting point
  document.getElementById('historyBtn')?.addEventListener('click', openPanel);
}
