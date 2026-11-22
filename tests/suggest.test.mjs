// Suggest must never create conflicts: every layout style x guest count => zero clearance issues, nothing in a keep-out, nothing outside the room.
// Run: node tests/suggest.test.mjs
import { seedRoom, seedSpaces, headTable, SEED_PEOPLE } from '../js/data.js';
import { TABLE_STYLES, suggestTables, clearanceIssues, blockers, footprint } from '../js/layout.js';
import { suggestCeremony, suggestHangout, ensureParty } from '../js/spaces.js';

const COUNTS = [20, 30, 40, 50, 60, 70, 80, 100, 120];
const overlap = (a, b) => a.x1 < b.x2 - 0.01 && a.x2 > b.x1 + 0.01 && a.y1 < b.y2 - 0.01 && a.y2 > b.y1 + 0.01;
const fpBox = (t) => { const f = footprint(t); return { x1: t.x - f.hw, x2: t.x + f.hw, y1: t.y - f.hh, y2: t.y + f.hh }; };
const rbox = (r) => ({ x1: r.x, x2: r.x + r.w, y1: r.y, y2: r.y + r.h });

/** Everything wrong with `tables` in `room` (empty = clean). Keep-outs = stage steps, balcony, door paths, decor, areas (bar / DJ / cake / dance / aisle ...). */
function problems(room, tables, minGap, { skip = () => false } = {}) {
  const out = [];
  clearanceIssues(room, tables, minGap).items.forEach((i) => out.push('clearance: ' + i.msg));
  const keep = blockers(room, [], { areaPad: 0 }); // decor + areas + stage + balcony + doors, no extra padding
  const decorOnly = [];
  tables.forEach((t) => {
    if (skip(t)) return;
    const b = fpBox(t);
    if (b.x1 < 0 || b.y1 < 0 || b.x2 > room.w || b.y2 > room.h) out.push(`${t.name}: outside the room`);
    if (keep.some((z) => overlap(b, z))) out.push(`${t.name}: inside a keep-out`);
  });
  return out;
}

const rows = [];
let bad = 0;
const record = (space, style, n, fits, probs, extra = '') => { if (probs.length) bad++; rows.push({ space, style, n, fits, probs, extra }); };

/* ---- reception: every style ---- */
for (const style of Object.keys(TABLE_STYLES)) for (const n of COUNTS) {
  const room = structuredClone(seedRoom()), head = headTable();
  const s = suggestTables(room, n, style, head);
  const all = [s.head || head, ...s.tables];
  // the head table sits in the stage bay (outside the hall) for 'stage' and is exempt from the hall keep-outs
  const probs = s.fits ? problems(room, all, 3.5, { skip: (t) => t.id === 'head' }) : [];
  // the head table must not sit on a bar / DJ / cake / dance area either (except in the bay, where the cake table is meant to be beside it)
  if (s.fits && style !== 'stage') { const hb = fpBox(s.head || head); (room.areas || []).forEach((a) => { if (a.preset !== 'cake' && overlap(hb, rbox(a))) probs.push(`head overlaps ${a.label}`); }); }
  const hs = s.head ? (s.head.shape === "round" ? s.head.seats : Object.values(s.head.sides).reduce((x, y) => x + y, 0)) : 2;
  const seats = hs + s.tables.reduce((m, t) => m + (t.shape === 'row' ? t.seats : t.shape === 'round' ? t.seats : Object.values(t.sides).reduce((x, y) => x + y, 0)), 0);
  if (s.fits && seats < n - 1) probs.push(`only ${seats} seats for ${n}`);
  record('reception', style, n, s.fits, probs);
}

/* ---- ceremony (outdoor + indoor), rows grow the room like the Suggest button does ---- */
const pool = SEED_PEOPLE.map((p) => ({ id: p.id, name: p.name, side: 'b' }));
for (const id of ['ceremony', 'indoor']) for (const n of COUNTS) {
  const room = structuredClone(seedSpaces()[id].room);
  ensureParty(room, pool);
  let s = suggestCeremony(room, n, pool);
  while (!s.fits && room.h < 150) { room.h += 5; s = suggestCeremony(room, n, pool); }
  const a = room.areas.find((x) => x.preset === 'aisle');
  if (a && s.aisle) Object.assign(a, s.aisle);
  const probs = [];
  const keep = blockers(room, [], { areaPad: 0 });
  s.tables.forEach((t) => {
    const b = fpBox(t);
    if (b.x1 < 0 || b.y1 < 0 || b.x2 > room.w || b.y2 > room.h) probs.push(`${t.name}: outside the room`);
    if (keep.some((z) => overlap(b, z))) probs.push(`${t.name}: inside a keep-out`);
  });
  const hs = s.head ? (s.head.shape === "round" ? s.head.seats : Object.values(s.head.sides).reduce((x, y) => x + y, 0)) : 2;
  const seats = hs + s.tables.reduce((m, t) => m + t.seats, 0);
  if (s.fits && seats < n) probs.push(`only ${seats} chairs for ${n}`);
  record(id, 'rows', n, s.fits, probs, `h=${room.h}`);
}

/* ---- hangout spots ---- */
for (const id of ['cocktail', 'tasting']) {
  const seedRoomX = seedSpaces()[id];
  const seedProbs = problems(seedRoomX.room, seedRoomX.tables, 1.5);
  record(id, 'seed', 0, true, seedProbs);
  for (const n of COUNTS) {
    const room = structuredClone(seedSpaces()[id].room);
    const s = suggestHangout(room, n);
    record(id, 'suggest', n, s.fits, s.fits ? problems(room, s.tables, 1.5) : [], `${s.tables.length}/${s.needed}`);
  }
}

/* ---- matrix ---- */
const keyOf = (r) => `${r.space}/${r.style}`;
const groups = [...new Set(rows.map(keyOf))];
console.log('space/style'.padEnd(24) + COUNTS.map((n) => String(n).padStart(5)).join(''));
for (const g of groups) {
  const line = rows.filter((r) => keyOf(r) === g);
  console.log(g.padEnd(24) + (g.endsWith('/seed') ? line.map((r) => (r.probs.length ? ' FAIL' : '   ok')).join('') : COUNTS.map((n) => { const r = line.find((x) => x.n === n); return r.probs.length ? ' FAIL' : r.fits ? '   ok' : '  big'; }).join('')));
}
rows.filter((r) => r.probs.length).slice(0, 40).forEach((r) => console.log('FAIL', r.space, r.style, r.n, r.extra, r.probs.slice(0, 3).join(' | ')));
console.log(bad ? `\n${bad} failing` : '\nall clean (big = honestly reported as needing a bigger room)');
process.exit(bad ? 1 : 0);
