// What a device ADDED before its first sign-in (no DOM, no state) — used by js/sync.js, tested in tests/sync-merge.test.mjs.
// Guests, team, roles, events and milestones that are not in the starter plan and not in the shared plan are kept.
// Edits to existing items are not (that would overwrite other people's work).
import { SEED_PEOPLE, SEED_ROLES, MILESTONES } from './data.js';

const SEED_IDS = {
  guests: new Set(), agenda: new Set(),
  people: new Set(SEED_PEOPLE.map((p) => p.id)), roles: new Set(SEED_ROLES.map((r) => r.id)), milestones: new Set(MILESTONES.map((m) => m.id)),
};
const nameKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** local, remote: whole plans. Returns { guests: [...], roles: [...], ... } with only the parts that have something new. */
export function addedHere(local, remote) {
  const out = {};
  for (const k of Object.keys(SEED_IDS)) {
    const theirs = Array.isArray(remote?.[k]) ? remote[k] : [];
    const ids = new Set(theirs.map((x) => x?.id));
    const names = new Set(theirs.map((x) => nameKey(x?.name)).filter(Boolean));
    const extra = (Array.isArray(local?.[k]) ? local[k] : []).filter((x) => x?.id && !ids.has(x.id) && !SEED_IDS[k].has(x.id)
      && !String(x.id).startsWith('auto-') && !((k === 'guests' || k === 'people') && names.has(nameKey(x.name))));
    // a guest's seat pointed at this device's tables, which are replaced by the shared ones
    if (extra.length) out[k] = k === 'guests' ? extra.map((g) => ({ ...g, tableId: null, cRow: null })) : extra;
  }
  return out;
}
