// Run: node --test tests/guest-parse.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGuestList } from '../js/guest-parse.js';

const names = (t) => parseGuestList(t).map((g) => g.name);
const one = (t) => { const r = parseGuestList(t); assert.equal(r.length, 1, `expected one guest from ${JSON.stringify(t)}, got ${JSON.stringify(r)}`); return r[0]; };

test('Mike, coworker +1 → one guest with hints', () => {
  const g = one('Mike, coworker +1');
  assert.equal(g.name, 'Mike');
  assert.equal(g.relation, 'Colleague');
  assert.equal(g.plusOne, true);
});

test('hint after a comma belongs to the name before it', () => {
  assert.deepEqual(parseGuestList('Ana, friend').map((g) => [g.name, g.relation]), [['Ana', 'Friend']]);
  assert.deepEqual(parseGuestList('Lia Park, bridesmaid, Betel').map((g) => [g.name, g.relation, g.side]), [['Lia Park', 'Bridesmaid', 'Betel']]);
  assert.deepEqual(parseGuestList('Tom, plus one').map((g) => [g.name, g.plusOne]), [['Tom', true]]);
  assert.deepEqual(parseGuestList('Rae, family').map((g) => [g.name, g.relation]), [['Rae', 'Relative']]);
});

test('Jane Doe (Betel), John Smith; Carter side', () => {
  const r = parseGuestList('Jane Doe (Betel), John Smith; Carter side');
  assert.deepEqual(r.map((g) => [g.name, g.side]), [['Jane Doe', 'Betel'], ['John Smith', 'Carter']]);
});

test('Aunt Rose - family keeps the title, drops the tag', () => {
  const g = one('Aunt Rose - family');
  assert.equal(g.name, 'Aunt Rose');
  assert.equal(g.relation, 'Relative');
});

test('numbered lines', () => {
  assert.deepEqual(names('1. Sam\n2. Priya Patel\n3) Lee'), ['Sam', 'Priya Patel', 'Lee']);
  assert.deepEqual(names('- Ana\n• Bo\n* Cy'), ['Ana', 'Bo', 'Cy']);
});

test('Jane & John Doe → both Does', () => {
  assert.deepEqual(names('Jane & John Doe'), ['Jane Doe', 'John Doe']);
  assert.deepEqual(names('Tom and Ana Silva'), ['Tom Silva', 'Ana Silva']);
});

test('earlier cases still hold', () => {
  const r = parseGuestList('Mia Lopez - bridesmaid\nSam Lee + 1\nMom\nCarter Jones\nkyle o\'neil!!');
  assert.deepEqual(r.map((g) => g.name), ['Mia Lopez', 'Sam Lee', 'Mom', 'Carter Jones', "Kyle O'Neil"]);
  assert.equal(r[0].relation, 'Bridesmaid');
  assert.equal(r[1].plusOne, true);
  assert.equal(r[2].relation, 'Parent');
  assert.equal(r[3].side, null); // a bare "Carter" at the start of a line is a name, not a side
  assert.deepEqual(names('dave smith, Priya (Betel side), emily@x.com Emily Chen'), ['Dave Smith', 'Priya', 'Emily Chen']);
});

test('a hint with nobody before it on the line is not a guest', () => {
  assert.deepEqual(names('coworker\nBo'), ['Bo']);
});

test('QA-26: side headings, totals, dates, work, kids, numbered names', () => {
  const r = parseGuestList("Carter's side:\n- Uncle Dawit & Aunt Hiwot Bekele (+ their 2 kids, Liya and Nahom)\n- Mike from work, bringing a date\nBetel side: Grandma Almaz; cousin Ruth T.\nTotal: 8");
  const by = (n) => r.find((g) => g.name === n);
  assert.deepEqual(r.map((g) => g.name), ['Uncle Dawit', 'Hiwot Bekele', 'Liya', 'Nahom', 'Mike', 'Grandma Almaz', 'cousin Ruth T']);
  assert.equal(by('Uncle Dawit').side, 'Carter');
  assert.equal(by('Nahom').side, 'Carter');
  assert.equal(by('Mike').side, 'Carter');
  assert.equal(by('Mike').relation, 'Colleague');
  assert.equal(by('Mike').plusOne, true);
  assert.equal(by('Grandma Almaz').side, 'Betel');
  assert.equal(by('cousin Ruth T').side, 'Betel');
  assert.deepEqual(names('Guest 1\nGuest 2\nRose Tadesse'), ['Guest 1', 'Guest 2', 'Rose Tadesse']);
  assert.equal(one('Betel: Selam Haile').side, 'Betel');
});
