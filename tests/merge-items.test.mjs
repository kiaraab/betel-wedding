// node tests/merge-items.test.mjs
import assert from 'node:assert/strict';
import { mergeById } from '../js/merge-items.js';

const g = (id, name, extra = {}) => ({ id, name, ...extra });
const base = [g('a', 'Ann'), g('b', 'Ben'), g('c', 'Cy')];
const names = (l) => l.map((x) => x.name).join(',');

// two people edit different guests: both edits survive
let m = mergeById(base, [g('a', 'Ann', { rsvp: 'Yes' }), g('b', 'Ben'), g('c', 'Cy')], [g('a', 'Ann'), g('b', 'Ben', { diet: 'Vegan' }), g('c', 'Cy')]);
assert.equal(m.find((x) => x.id === 'a').rsvp, 'Yes');
assert.equal(m.find((x) => x.id === 'b').diet, 'Vegan');
// both add a different guest
m = mergeById(base, [...base, g('d', 'Dee')], [...base, g('e', 'Eve')]);
assert.equal(names(m), 'Ann,Ben,Cy,Eve,Dee');
// they delete a guest we did not touch: gone; we edited it: kept
assert.equal(names(mergeById(base, base, [g('a', 'Ann'), g('c', 'Cy')])), 'Ann,Cy');
assert.equal(names(mergeById(base, [g('a', 'Ann'), g('b', 'Benny'), g('c', 'Cy')], [g('a', 'Ann'), g('c', 'Cy')])), 'Ann,Cy,Benny');
// we delete a guest they did not touch: gone; they edited it: kept
assert.equal(names(mergeById(base, [g('a', 'Ann'), g('c', 'Cy')], base)), 'Ann,Cy');
assert.equal(names(mergeById(base, [g('a', 'Ann'), g('c', 'Cy')], [g('a', 'Ann'), g('b', 'Ben!'), g('c', 'Cy')])), 'Ann,Ben!,Cy');
// same item edited by both: ours wins
m = mergeById(base, [g('a', 'Anna'), g('b', 'Ben'), g('c', 'Cy')], [g('a', 'Annie'), g('b', 'Ben'), g('c', 'Cy')]);
assert.equal(m[0].name, 'Anna');
// items without ids can't be merged by id
assert.equal(mergeById([{ x: 1 }], [{ x: 1 }], [{ x: 2 }]), null);
console.log('merge-items: ok');
