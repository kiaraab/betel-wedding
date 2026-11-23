// Three-way merge of a list of items that have ids (guests, tables, roles, agenda, people, milestones).
// base = the list as this tab last loaded/wrote it, local = what this tab has now, remote = what someone else saved.
// Two people editing DIFFERENT items both keep their edits. Same item edited by both: this tab wins (as before).
// Returns the merged list, or null when the lists can't be merged by id (the caller keeps its old whole-part rule).
export const MERGE_KEYS = new Set(['guests', 'people', 'roles', 'agenda', 'milestones', 'tables']);

export function mergeById(base, local, remote) {
  const ok = (l) => Array.isArray(l) && l.every((x) => x && typeof x === 'object' && x.id != null);
  if (!ok(base) || !ok(local) || !ok(remote)) return null;
  const js = (x) => JSON.stringify(x);
  const B = new Map(base.map((x) => [x.id, js(x)])), L = new Map(local.map((x) => [x.id, x])), R = new Map(remote.map((x) => [x.id, x]));
  const out = [];
  for (const r of remote) {
    const l = L.get(r.id), bj = B.get(r.id), rj = js(r);
    if (!l) { if (bj !== undefined && rj === bj) continue; out.push(r); continue; } // this tab deleted it: gone, unless they changed it meanwhile
    const lj = js(l);
    out.push(bj === undefined || lj !== bj ? l : r); // this tab changed (or added) it: ours; untouched here: theirs
  }
  for (const l of local) {
    if (R.has(l.id)) continue;
    const bj = B.get(l.id);
    if (bj !== undefined && js(l) === bj) continue; // they deleted it and we never touched it: gone
    out.push(l); // added here, or edited here after they deleted it
  }
  return out;
}
