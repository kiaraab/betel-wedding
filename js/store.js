import { suggestTables } from './layout.js';
import { SEED_PEOPLE, SEED_ROLES, seedTables, seedRoom, headTable, seedInspoStrip, MILESTONES, seedSpaces, seedCeremony, seedCocktail, MORAIS_PHOTOS } from './data.js';

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
    guestTarget: 100,        // expected headcount (Betel's list is about 100), drives the layout suggestion
    tables: seedTables(),
    inspo: seedInspoStrip(),
    links: [],               // guest connections: { a, b, type: 'love' | 'like' | 'apart' (older 'together' = like) }
    room: seedRoom(),
    mood: 'vineyard-dusk',
    style: {},               // 3D Look choices (js/style-options.js): only what was picked; a missing key = the default look
    milestones: structuredClone(MILESTONES), // sourced dates only; editable on the overview
    morais: MORAIS_PHOTOS.map((p) => p.id), // Morais photo order beside the 3D view (drag to rearrange)
    spaces: seedSpaces(),    // ceremony + cocktail plans; the reception stays in room/tables (older plans get these on load)
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
  // Doors/windows, the stage bay (+ its steps / keep-out) and the balcony are venue facts (locked), so saved plans always pick up the latest survey of them
  // (room size, the two double doors + corner doors, the bay). Saved tables, areas and spaces are the user's and are NEVER moved or deleted here.
  if (data.version === VERSION) return { ...fresh(), ...data, room: { ...seedRoom(), ...data.room, w: seedRoom().w, h: seedRoom().h, fixed: { ...seedRoom().fixed, ...data.room?.fixed, openings: seedRoom().fixed.openings, stage: seedRoom().fixed.stage, balcony: seedRoom().fixed.balcony } }, tables: (data.tables || []).map((t) => (t.y > seedRoom().h - 3 ? { ...t, y: seedRoom().h - 3 } : t)) };
  if (data.version < VERSION) {
    try { localStorage.setItem(`${KEY}-backup-v${data.version}`, saved.raw); } catch { /* storage full */ }
    return migrate(data);
  }
  // Saved by a newer version of the site: keep it untouched, work on a copy
  return { ...fresh(), ...data };
}

export const state = load();

/*
 * Self-healing (never moves or deletes her tables or guests):
 *  - a guest whose tableId / cRow points at a table that no longer exists is set back to "unseated";
 *  - cRow (ceremony chair) is now per space: { ceremony: 'cl1', indoor: 'cr2' }; an older plain string is the outdoor one;
 *  - every space key exists, and a ceremony / cocktail space that still equals the OLD seed (Garden courtyard 40x60,
 *    Tasting room 44x34 used as the hangout) is swapped for the current seed. Edited spaces are left alone.
 * Returns true when something changed.
 */
export function healSeats() {
  let changed = false;
  const sp = state.spaces && typeof state.spaces === 'object' ? state.spaces : null;
  if (sp) {
    const seeds = seedSpaces();
    Object.keys(seeds).forEach((k) => { if (!sp[k]) { sp[k] = seeds[k]; changed = true; } });
    const c = sp.ceremony?.room, h = sp.cocktail?.room;
    if (c && c.name === 'Garden courtyard' && c.w === 40 && c.h === 60) {
      const next = seedCeremony();
      if (c.party) next.room.party = c.party; // keep her wedding-party order
      sp.ceremony = next; changed = true;
    }
    // ceremonies seeded for 60 (6 rows a side, untouched) grow to the 100-guest norm: 4 more rows a side, same pitch
    ['ceremony', 'indoor'].forEach((key) => {
      const ts = sp[key]?.tables;
      if (!Array.isArray(ts) || ts.length !== 12 || !ts.every((t) => t.shape === 'row' && t.seats === 5 && !t.rot && /^c[lr]\d$/.test(t.id))) return;
      const l1 = ts.find((t) => t.id === 'cl1'), r1 = ts.find((t) => t.id === 'cr1'), l2 = ts.find((t) => t.id === 'cl2');
      if (!l1 || !r1 || !l2 || ts.some((t) => !/^c[lr][1-6]$/.test(t.id))) return;
      const pitch = l2.y - l1.y;
      for (let r = 6; r < 10; r++) [[l1, 'cl', 'L', 0], [r1, 'cr', 'R', 1]].forEach(([b, pre, side, k2]) => ts.push({ id: `${pre}${r + 1}`, name: `${r + 1}${side}`, shape: 'row', seats: 5, x: b.x, y: b.y + r * pitch, rot: 0, o: r * 2 + k2 }));
      changed = true;
    });
    if (h && h.name === 'Tasting room' && h.w === 44 && h.h === 34 && !h.bistro) { sp.cocktail = seedCocktail(); changed = true; }
  }
  // The reception that still equals the ORIGINAL 60-guest starting layout (table positions untouched) moves to the 100-guest default (rounds of 8).
  // Existing table ids stay (so seats and guests keep their tables); extra tables get fixed ids so two devices never create duplicates. Anything she edited is left alone.
  if (Array.isArray(state.tables) && state.tables.length) {
    const head = headTable(), old = suggestTables(seedRoom(), 60, 'round8', head).tables;
    const cur = state.tables.filter((t) => t.id !== 'head');
    const key = (t) => `${t.shape}:${Math.round(t.x * 10)}:${Math.round(t.y * 10)}:${t.rot || 0}`;
    const hd = state.tables.find((t) => t.id === 'head');
    if (hd && cur.length === old.length && key(hd) === key(head) && [...cur.map(key)].sort().join('|') === [...old.map(key)].sort().join('|')) {
      const next = suggestTables(seedRoom(), 100, 'round8', head).tables;
      if (next.length !== old.length || next.some((t, i) => key(t) !== key(old[i]))) {
        const sortedCur = cur.slice().sort((a, b) => (a.o ?? 0) - (b.o ?? 0));
        state.tables = [hd, ...next.map((t, i) => ({ ...t, id: sortedCur[i]?.id || `tr${i + 1}`, name: sortedCur[i]?.name ?? t.name }))];
        changed = true;
      }
    }
  }
  if (Array.isArray(state.guests) && Array.isArray(state.tables)) {
    const real = new Set(state.tables.map((t) => t.id));
    state.guests.forEach((g) => {
      if (g.tableId && !real.has(g.tableId)) { g.tableId = null; changed = true; }
      if (typeof g.cRow === 'string') { g.cRow = { ceremony: g.cRow }; changed = true; }
      if (g.cRow && typeof g.cRow === 'object') {
        Object.keys(g.cRow).forEach((k) => {
          if (!g.cRow[k] || !(sp?.[k]?.tables || []).some((t) => t.id === g.cRow[k])) { delete g.cRow[k]; changed = true; }
        });
      } else if (g.cRow === null) { delete g.cRow; changed = true; }
    });
  }
  return changed;
}
/** Seated = assigned to a table that really exists. */
export const isSeated = (g) => !!g.tableId && Array.isArray(state.tables) && state.tables.some((t) => t.id === g.tableId);
let healedAtLoad = false;
{
  const saved = readSaved();
  const spacesBefore = JSON.stringify(state.spaces || null);
  healedAtLoad = healSeats();
  if (saved && saved.k === KEY && JSON.stringify(state.spaces || null) !== spacesBefore) {
    // spaces were replaced by the current seeds: keep the untouched original first
    try { const k = `${KEY}-backup-v${saved.data?.version}`; localStorage.setItem(localStorage.getItem(k) ? `${k}-spaces` : k, saved.raw); } catch { /* storage full */ }
  }
}

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
  state.guests.forEach((g) => { if (g.party === 'couple' && g.rsvp !== 'Yes') g.rsvp = 'Yes'; }); // the couple is always coming
}
ensureAutoGuests();

let saveTimer;
let dirty = false; // this tab has changes not yet written
let replaceAll = false; // Start fresh / import: the next save replaces the plan instead of merging

/*
 * Stale-tab protection (DATA-02). `base` is the plan as this tab last loaded, adopted or wrote it:
 * its updatedAt and each top-level part as JSON. On save we re-read storage first:
 *  - someone else wrote since, and this tab has no edits → adopt theirs, write nothing;
 *  - someone else wrote since, and this tab has edits → keep their version of every part this tab didn't touch;
 *  - always keep parts that exist in storage but not in this tab (newer code's keys, e.g. agenda, spaces).
 */
let base = { stamp: null, parts: {} };
function snapBase() {
  base = { stamp: state.updatedAt || null, parts: Object.fromEntries(Object.keys(state).map((k) => [k, JSON.stringify(state[k])])) };
}
import { MERGE_KEYS, mergeById, mergeFlat } from './merge-items.js';
const META = new Set(['updatedAt', 'version']);
/** What to do with one part of the plan when someone else saved a newer copy. Returns { value } to take, or null to keep ours.
 *  Untouched here: take theirs. Untouched there: keep ours. Both changed a list of items: merge item by item (js/merge-items.js). */
function mergePart(k, localVal, remoteVal) {
  const baseJson = base.parts[k], localJson = JSON.stringify(localVal), remoteJson = JSON.stringify(remoteVal);
  if (localJson === baseJson) return remoteJson !== baseJson ? { value: remoteVal } : null;
  if (remoteJson === baseJson) return null;
  if (MERGE_KEYS.has(k)) {
    let b = null; try { b = JSON.parse(baseJson); } catch { /* no base: fall through */ }
    const merged = mergeById(b, localVal, remoteVal);
    if (merged) return { value: merged };
  }
  if (k === 'style') { // the 3D Look choices: every group is its own pick
    let b = {}; try { b = JSON.parse(baseJson) || {}; } catch { /* no base: treat as empty */ }
    const merged = mergeFlat(b, localVal, remoteVal);
    if (merged) return { value: merged };
  }
  return null; // both changed something we can't merge by item: keep ours (as before)
}
const scratch = (k) => k.startsWith('__'); // __keys are throwaway (tests/debug): never saved, never merged
const persisted = () => Object.fromEntries(Object.entries(state).filter(([k]) => !scratch(k)));
function readStored() {
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && d.version === VERSION ? d : null; } catch { return null; }
}
const isNewer = (stored) => !!stored?.updatedAt && (!base.stamp || stored.updatedAt > base.stamp);

/** Take another tab's copy. Parts this tab has that the copy lacks are kept (older code must not drop them). */
function adopt(next) {
  clearTimeout(saveTimer);
  dirty = false;
  const keep = {};
  Object.keys(state).forEach((k) => { if (!(k in next) && !scratch(k)) keep[k] = state[k]; });
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, next, keep);
  healSeats();
  ensureAutoGuests();
  snapBase();
  base.stamp = next.updatedAt || null;
  listeners.forEach((fn) => fn());
}

function save() {
  clearTimeout(saveTimer);
  const hadEdits = dirty;
  dirty = false;
  let took = false;
  const stored = replaceAll ? null : readStored();
  if (stored && isNewer(stored)) {
    if (!hadEdits) { adopt(stored); return; } // this tab is just stale: never overwrite newer data
    Object.keys(stored).forEach((k) => {
      if (META.has(k) || scratch(k)) return;
      const r = mergePart(k, state[k], stored[k]);
      if (r) { state[k] = r.value; took = true; }
    });
  } else if (stored) {
    Object.keys(stored).forEach((k) => { if (!META.has(k) && !scratch(k) && !(k in state)) { state[k] = stored[k]; took = true; } });
  }
  replaceAll = false;
  try { localStorage.setItem(KEY, JSON.stringify(persisted())); }
  catch { document.dispatchEvent(new CustomEvent('storage-full')); }
  snapBase();
  if (took) { healSeats(); ensureAutoGuests(); listeners.forEach((fn) => fn()); }
  saveHooks.forEach((fn) => { try { fn(state); } catch { /* a hook must never break saving */ } });
}
/** Run after every save (revision history snapshots, js/history.js). */
const saveHooks = new Set();
export const onSave = (fn) => { saveHooks.add(fn); return () => saveHooks.delete(fn); };
export function commit(opts = {}) {
  state.updatedAt = new Date().toISOString();
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 150);
  if (!opts.silent) listeners.forEach((fn) => fn());
}
snapBase();
if (healedAtLoad) { state.updatedAt = new Date().toISOString(); dirty = true; saveTimer = setTimeout(save, 150); } // persist the repaired plan (and push it once when live)
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
    // Mid-edit here: the pending save merges theirs with ours (instead of throwing our edit away)
    if (dirty) { clearTimeout(saveTimer); save(); return; }
    adopt(next);
  } catch { /* ignore bad data */ }
});

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Run a destructive change with an Undo toast instead of a confirm() popup. */
export function undoable(message, mutate, toastFn) {
  const snap = JSON.stringify(state);
  mutate();
  commit();
  toastFn(message, { undo: () => { const s = JSON.parse(snap); Object.keys(state).forEach((k) => delete state[k]); Object.assign(state, s); healSeats(); commit(); } });
}

export function reset() {
  try { localStorage.setItem(KEY + '-backup', JSON.stringify(state)); } catch {}
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, fresh());
  ensureAutoGuests();
  replaceAll = true; // a fresh start must not merge the old parts back in
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
  healSeats();
  ensureAutoGuests();
  replaceAll = true; // the imported file is the whole plan
  commit();
}

/** Live sync (js/sync.js): fold a copy from the shared database into this tab. Parts this tab is mid-edit on are kept. */
export function mergeRemote(next) {
  if (!next || typeof next !== 'object' || next.version !== VERSION) return false;
  if (!dirty) { adopt(next); return true; }
  Object.keys(next).forEach((k) => {
    if (META.has(k) || scratch(k)) return;
    const r = mergePart(k, state[k], next[k]);
    if (r) state[k] = r.value;
  });
  healSeats();
  ensureAutoGuests();
  listeners.forEach((fn) => fn());
  return true;
}
/** The plan as it would be saved (no throwaway __keys). */
export const snapshot = () => persisted();
