// node tests/sync-merge.test.mjs
import assert from 'node:assert/strict';
import { addedHere } from '../js/sync-merge.js';

const remote = {
  guests: [{ id: 'auto-bride', name: 'Betel Griffin' }, { id: 'g1', name: 'Rose Tadesse' }],
  people: [{ id: 'eden', name: 'Eden' }], roles: [{ id: 'photo' }], agenda: [], milestones: [{ id: 'engaged' }],
};
const local = {
  guests: [
    { id: 'auto-bride', name: 'Betel Griffin' },            // auto guest: not "added"
    { id: 'g1', name: 'Rose Tadesse' },                     // already shared
    { id: 'x9', name: 'rose  tadesse' },                    // same person under a different id: not duplicated
    { id: 'x1', name: 'Aunt Selam', tableId: 't-old', cRow: 'c1' },
  ],
  people: [{ id: 'eden', name: 'Eden' }, { id: 'p9', name: 'Hana' }],
  roles: [{ id: 'photo' }, { id: 'r-new', title: 'Cake taster' }],
  agenda: [{ id: 'a1', title: 'Coffee ceremony' }],
  milestones: [{ id: 'engaged' }, { id: 'm1', label: 'Dress fitting' }],
};
const out = addedHere(local, remote);
assert.deepEqual(out.guests.map((g) => g.name), ['Aunt Selam']);
assert.equal(out.guests[0].tableId, null);                  // seat belonged to this device's old tables
assert.equal(out.guests[0].cRow, null);
assert.deepEqual(out.people.map((p) => p.id), ['p9']);
assert.deepEqual(out.roles.map((r) => r.id), ['r-new']);
assert.deepEqual(out.agenda.map((a) => a.id), ['a1']);
assert.deepEqual(out.milestones.map((m) => m.id), ['m1']);
assert.deepEqual(addedHere(remote, remote), {});            // nothing new -> nothing kept
assert.deepEqual(addedHere({}, remote), {});
assert.deepEqual(addedHere(local, null).guests.map((g) => g.name).sort(), ['Aunt Selam', 'rose  tadesse', 'Rose Tadesse'].sort());
console.log('sync-merge: ok');
