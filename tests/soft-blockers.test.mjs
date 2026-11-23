// Outside the Reception, dropping a table only bounces on real overlaps (not the fountain's keep-out ring or a 2 ft walkway).
// Run: node tests/soft-blockers.test.mjs
import assert from 'node:assert/strict';
import { seedSpaces } from '../js/data.js';
import { blockers, footprint } from '../js/layout.js';

const room = seedSpaces().cocktail.room;
const hits = (t, soft, others = []) => {
  const fp = footprint(t), me = { x1: t.x - fp.hw, x2: t.x + fp.hw, y1: t.y - fp.hh, y2: t.y + fp.hh };
  return blockers(room, others, { areaPad: 0.5, soft }).some((z) => me.x1 < z.x2 && me.x2 > z.x1 && me.y1 < z.y2 && me.y2 > z.y1);
};
const bistro = (x, y) => ({ id: 'x', shape: 'round', seats: 3, rot: 0, x, y });
// the fountain basin is x 17.5..30.5, y 17..30 with a 3 ft keep-out ring in the strict check
assert.equal(hits(bistro(35, 23.5), false), true, 'strict: inside the keep-out ring');
assert.equal(hits(bistro(35, 23.5), true), false, 'soft: next to the basin is fine');
assert.equal(hits(bistro(26, 23.5), true), true, 'soft: on the basin still bounces');
// two standing tables 1.6 ft apart are fine in soft mode (the chip allows 1.5), too close in strict mode
const fp = footprint(bistro(0, 0)), gapX = fp.hw * 2 + 1.6;
const other = bistro(40, 40);
assert.equal(hits(bistro(40 + gapX, 40), false, [other]), true, 'strict: 2 ft walkway');
assert.equal(hits(bistro(40 + gapX, 40), true, [other]), false, 'soft: 1 ft pad');
console.log('soft-blockers: ok');
