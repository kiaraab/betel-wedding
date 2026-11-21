import { SEED_PEOPLE, SEED_ROLES, seedTables, seedRoom, seedInspoStrip, MILESTONES } from './data.js';

const KEY = 'betel-carter-atelier';     // current plan lives here (versioned inside)
const OLD_KEYS = ['betel-carter-atelier-v2'];
const VERSION = 3;
const listeners = new Set();

export const uid = () => Math.random().toString(36).slice(2, 12);

function fresh() {
  return {
    version: VERSION,
    people: structuredClone(SEED_PEOPLE),
    roles: structuredClone(SEED_ROLES),
    guests: [],
    autoGuests: {},          // personId -> true once added, so a deleted guest isn't re-added
    guestTarget: 60,         // expected headcount, drives the layout suggestion
    tables: seedTables(),
    inspo: seedInspoStrip(),
    links: [],               // guest connections: { a, b, type: 'together' | 'apart' }
    room: seedRoom(),
    mood: 'vineyard-dusk',
    milestones: structuredClone(MILESTONES), // sourced dates only; editable on the overview
    updatedAt: new Date().toISOString(),
  };
}

/** Upgrade an older saved plan step by step. Never throws data away silently. */
function migrate(s) {
  if (s.version === 2) {
    // v3 rebuilt the ballroom to match Morais (portrait 50 × 80, locked doors + stage).
    // People, roles, guests, mood and headcount carry over; the room + tables are re-laid out.
    const keep = fresh();
    s = { ...keep, ...s, version: 3, room: keep.room, tables: keep.tables, inspo: keep.inspo };
    s.guests = (s.guests || []).map((g) => ({ ...g, tableId: g.party === 'couple' ? 'head' : null }));
  }
  return s;
}

function readSaved() {
  for (const k of [KEY, ...OLD_KEYS]) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) return { k, raw, data: JSON.parse(raw) };
    } catch { /* bad JSON or blocked storage — try the next key */ }
  }
  return null;
}

function load() {
  const saved = readSaved();
  if (!saved || !saved.data || typeof saved.data !== 'object') return fresh();
  const { data } = saved;
  if (data.version === VERSION) return { ...fresh(), ...data, room: { ...seedRoom(), ...data.room } };
  if (data.version < VERSION) {
    try { localStorage.setItem(`${KEY}-backup-v${data.version}`, saved.raw); } catch { /* storage full */ }
    return migrate(data);
  }
  // Saved by a newer version of the site: keep it untouched, work on a copy
  return { ...fresh(), ...data };
}

export const state = load();

// Milestones: earlier versions saved invented dates. Drop exactly those (untouched), keep anything else,
// and make sure the sourced dates are there. Runs once — afterwards every milestone has an id.
const INVENTED = ['2026-12-15|Save-the-dates out', '2027-01-15|Dress ordered', '2027-01-31|Photographer, music & MUA booked',
  '2027-03-01|Florals ordered', '2027-04-22|Invitations out', '2027-04-30|Marriage license', '2027-05-20|RSVP deadline',
  '2027-05-27|Final headcount & seating', '2027-06-03|Timeline to vendors'];
if (!Array.isArray(state.milestones)) state.milestones = structuredClone(MILESTONES);
else if (state.milestones.some((m) => !m.id)) {
  const kept = state.milestones.filter((m) => !INVENTED.includes(`${m.date}|${m.label}`))
    .filter((m) => !MILESTONES.some((s) => s.date === m.date && s.label === m.label))
    .map((m) => ({ ...m, id: m.id || uid() }));
  state.milestones = [...structuredClone(MILESTONES), ...kept];
}
// Sourced dates added later (e.g. the engagement) show up in plans saved before they existed
state.seenMilestones ||= state.milestones.filter((m) => MILESTONES.some((s) => s.id === m.id)).map((m) => m.id);
MILESTONES.forEach((s) => {
  if (!state.seenMilestones.includes(s.id)) { state.seenMilestones.push(s.id); if (!state.milestones.some((m) => m.id === s.id)) state.milestones.unshift(structuredClone(s)); }
});

/** Betel, Carter and everyone on the team are guests automatically (stable ids, so they never duplicate). */
export function ensureAutoGuests() {
  const add = (key, name, extra = {}) => {
    // Betel & Carter always exist; everyone else is added once (so a deleted guest isn't re-added)
    if (extra.party === 'couple' ? state.guests.some((g) => g.personId === key) : state.autoGuests[key]) return;
    state.autoGuests[key] = true;
    state.guests.push({ id: 'auto-' + key, name, side: 'Betel', rsvp: 'Invited', diet: '', tableId: null, personId: key, ...extra });
  };
  const head = state.tables.find((t) => t.id === 'head') ? 'head' : null;
  add('bride', 'Betel Griffin', { tableId: head, party: 'couple', rsvp: 'Yes' });
  add('groom', 'Carter Griffin', { side: 'Carter', tableId: head, party: 'couple', rsvp: 'Yes' });
  state.people.forEach((p) => add(p.id, p.name, { party: 'team' }));
}
ensureAutoGuests();

let saveTimer;
let dirty = false; // this tab has changes not yet written
function save() {
  clearTimeout(saveTimer);
  dirty = false;
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { document.dispatchEvent(new CustomEvent('storage-full')); }
}
export function commit(opts = {}) {
  state.updatedAt = new Date().toISOString();
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 150);
  if (!opts.silent) listeners.forEach((fn) => fn());
}
// Don't lose the last edit if the tab closes inside the save delay
// Closing the tab: write only if this tab has unsaved edits (a stale tab must never overwrite newer data)
addEventListener('pagehide', () => { if (dirty) save(); });
// Only write on load when there's nothing saved yet under the current key (first visit / after an upgrade)
try { if (!localStorage.getItem(KEY)) save(); } catch { /* storage blocked */ }

// Another tab changed the plan: adopt it instead of overwriting it later
addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try {
    const next = JSON.parse(e.newValue);
    if (!next || next.version !== VERSION) return;
    clearTimeout(saveTimer);
    dirty = false;
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, next);
    ensureAutoGuests();
    listeners.forEach((fn) => fn());
  } catch { /* ignore bad data */ }
});

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Run a destructive change with an Undo toast instead of a confirm() popup. */
export function undoable(message, mutate, toastFn) {
  const snap = JSON.stringify(state);
  mutate();
  commit();
  toastFn(message, { undo: () => { const s = JSON.parse(snap); Object.keys(state).forEach((k) => delete state[k]); Object.assign(state, s); commit(); } });
}

export function reset() {
  try { localStorage.setItem(KEY + '-backup', JSON.stringify(state)); } catch {}
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, fresh());
  ensureAutoGuests();
  commit();
}

export function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `griffin-wedding-plan-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importJSON(file) {
  let data = JSON.parse(await file.text());
  if (!data || !Array.isArray(data.people) || !(data.version >= 2)) throw new Error('Not a Griffin wedding plan file');
  if (data.version < VERSION) data = migrate(data);
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, fresh(), data);
  commit();
}
