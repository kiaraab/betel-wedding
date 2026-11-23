// Forgiving guest-list parser (no DOM, no state) — used by "Paste a list", tested in tests/guest-parse.test.mjs.

// Words that hint at a relation, in priority order.
const REL_HINTS = [
  [/\bmaid of honou?r\b|\bmoh\b|\bbridesmaids?\b/gi, 'Bridesmaid'],
  [/\bbest man\b|\bgroomsm[ae]n\b/gi, 'Groomsman'],
  [/\bclose friends?\b|\bbff\b|\bbest friend\b/gi, 'Close friend'],
  [/\b(mom|mother|mum|dad|father|parents?|step-?(mom|dad|mother|father))\b/gi, 'Parent'],
  [/\b(grand(ma|pa|mother|father|parents?)|nana|papa|sister|brother|sibling|sis|bro)\b/gi, 'Close relative'],
  [/\b(aunt|auntie|uncle|cousin|niece|nephew|relatives?|family)\b/gi, 'Relative'],
  [/\b(?:(?:from|at)\s+)?(co-?workers?|colleagues?|work|boss|office)\b/gi, 'Colleague'],
  [/\bfriends?\b/gi, 'Friend'],
];
// Tags rather than titles: always removed from the name
const TAG_ONLY = new Set(['Bridesmaid', 'Groomsman', 'Close friend', 'Friend', 'Colleague']);
// Family words that can open a name ("Aunt Rose", "Mom") and stay part of it
const TITLE = /^(aunt|auntie|uncle|cousin|grandma|grandpa|grandmother|grandfather|nana|papa|mom|mother|mum|dad|father)$/i;
const SIDE_HINTS = [
  [/\(?\b(betel|bride)('?s)?\b(\s+side)?\)?/i, 'Betel'],
  [/\(?\b(carter|groom)('?s)?\b(\s+side)?\)?/i, 'Carter'],
  [/\(?\b(both|shared|mutual)\b(\s+sides?)?\)?/i, 'Both'],
];
const PLUS_ONE = /\s*(\+\s*1\b|(?:bring(?:ing)?|with|plus)\s+(?:a|an|their|his|her)\s+(?:date|guest|partner|plus[- ]?one)\b|\+\s*one\b|plus\s*(one|1)\b|and guest\b|& guest\b|\+\s*guest\b)\s*/i;

const tidy = (s) => {
  s = s.replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, ' ')                 // emoji
    .replace(/\S+@\S+\.\S+/g, ' ')                                         // emails
    .replace(/[()[\]{}"“”*_~|<>]/g, ' ')
    .replace(/(\s*[-–—:]\s*)+$/, '').replace(/^(\s*[-–—:]\s*)+/, '')
    .replace(/[.,!?]+$/, '').replace(/\s+/g, ' ').trim();
  // Title-case ALL CAPS / all lower names; leave mixed case alone (McKenna, de la Cruz)
  if (s && (s === s.toLowerCase() || s === s.toUpperCase())) s = s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
  return s;
};

/** Pull the hints out of one chunk: { rest (name text), side, relation, plusOne, onlyWord } */
function readHints(raw) {
  let side = null, relation = null, plusOne = false, onlyWord = '';
  if (PLUS_ONE.test(raw)) { plusOne = true; raw = raw.replace(PLUS_ONE, ' '); }
  for (const [re, s] of SIDE_HINTS) {
    // "Betel"/"Carter" only count when marked: (Betel), Betel side, Carter's — a bare "Carter" may be a name
    const m = raw.match(re);
    if (m && (/[()]|side|'s/i.test(m[0]) || !/^(betel|carter)$/i.test(m[1]))) { side = s; raw = raw.replace(m[0], ' '); break; }
  }
  for (const [re, r] of REL_HINTS) {
    raw = raw.replace(re, (word, ...args) => {
      const at = args.at(-2), before = raw.slice(0, at);
      relation ||= r;
      // a family title opening the name stays ("Aunt Rose"); anything tagged on ("- family", "(cousin)") goes
      const opensName = !before.trim() && TITLE.test(word) && !TAG_ONLY.has(r);
      if (opensName) { onlyWord ||= word; return word; }
      return ' ';
    });
  }
  // "guest" is noise next to a side ("Betel's guest"), but "Guest 1" is a name: only strip it when something else is left
  const cleaned = raw.replace(/\b(sides?|guest)\b/gi, ' ');
  return { rest: /\p{L}/u.test(cleaned) ? cleaned : raw, side, relation, plusOne, onlyWord };
}

/** Parse pasted text into [{ name, side, relation, plusOne }] (no de-dupe here). */
export function parseGuestList(text) {
  const out = [];
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let sideNow = null; // set by a heading line such as "Carter's side:" and kept for the lines after it
  for (let line of lines) {
    if (/^\s*(?:total|subtotal|count|headcount|guest count)\b/i.test(line)) continue; // "Total: 8" is not a guest
    const head = /^\s*(?:[-–—*•]\s*)?(betel|bride|carter|groom|both|shared)(?:['’]?s)?(?:\s+side)?\s*:\s*(.*)$/i.exec(line);
    if (head) { sideNow = /^(betel|bride)/i.test(head[1]) ? 'Betel' : /^(carter|groom)/i.test(head[1]) ? 'Carter' : 'Both'; line = head[2]; }
    // "(+ their 2 kids, Liya and Nahom)" → the kids are guests too
    line = line.replace(/\(\s*\+\s*(?:their|his|her)?\s*\d*\s*(?:kids?|children)\s*,?\s*/gi, ' & ');
    let prev = []; // guests from the previous chunk on this line — a hint-only chunk belongs to them
    const chunks = line.split(/;|\t|,(?![^()]*\))|\s[•·▪●◦‣]\s/)
      .map((c) => c.replace(/^\s*(?:[-–—*•·▪●◦‣>]+|\(?\d{1,3}[.)\]:]|\(?[a-z][.)])\s+/i, '').trim())
      .filter(Boolean);
    for (const chunk of chunks) {
      const h = readHints(chunk);
      let parts = h.rest.split(/\s+(?:and|&|\+)\s+|\s*&\s*/i).map(tidy).filter((x) => /\p{L}/u.test(x));
      const bareSide = /^\s*(betel|carter)('?s)?\s*$/i.exec(chunk);
      // "Mike, coworker +1" / "John Smith; Carter side" / "Mike, Carter": hints for the guest just before
      if (prev.length && (!parts.length || bareSide)) {
        const side = h.side || (bareSide ? (/^betel/i.test(bareSide[1]) ? 'Betel' : 'Carter') : null);
        prev.forEach((g) => { g.side ||= side; g.relation ||= h.relation; });
        if (h.plusOne) prev.at(-1).plusOne = true;
        continue;
      }
      // a lone family word with nothing before it is the name itself ("Mom")
      if (!parts.length && h.onlyWord) parts = [tidy(h.onlyWord)];
      if (!parts.length) continue;
      // "Jane and John Doe" / "Jane & John Doe" → two people sharing the last name
      const last = parts.length > 1 && parts.at(-1).split(' ').length > 1 ? parts.at(-1).split(' ').slice(1).join(' ') : '';
      prev = [];
      parts.forEach((n, i) => {
        if (n.length > 60) return;
        const name = last && i < parts.length - 1 && n.split(' ').length === 1 ? `${n} ${last}` : n;
        const g = { name, side: h.side || sideNow, relation: h.relation, plusOne: h.plusOne && i === parts.length - 1 };
        out.push(g); prev.push(g);
      });
    }
  }
  return out;
}

/** Clean up whatever the AI returned into [{ name, side, household, plusOne, notes, relation }]. */
export function normalizeAiGuests(data) {
  const arr = Array.isArray(data) ? data : Array.isArray(data?.guests) ? data.guests : [];
  const side = (s) => { s = String(s || '').toLowerCase(); return /betel|bride/.test(s) ? 'Betel' : /carter|groom/.test(s) ? 'Carter' : /both|shared/.test(s) ? 'Both' : null; };
  return arr.map((r) => ({
    name: tidy(String(r?.name ?? '')),
    side: side(r?.side),
    household: String(r?.household || '').trim(),
    plusOne: r?.plusOne === true || /^(yes|true|\+1)$/i.test(String(r?.plusOne || '')),
    notes: String(r?.notes || '').trim(),
    relation: null,
  })).filter((r) => /\p{L}/u.test(r.name) && r.name.length <= 60);
}
