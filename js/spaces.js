// Ceremony + hangout-spot helpers: suggest layouts, auto-seat the ceremony, the wedding party dots, and their side-panel tools.
// Units: feet. Sizes of the garden courtyard / tasting room are NOT venue facts (see VENUE.md) — these are working layouts.
import { togetherGroups, relationOf, blockers, footprint } from './layout.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PER_COL = 5, DOT_STEP = 2.4, DOT_X0 = 7.2, DOT_Y0 = 6.2;

/* ---------------- wedding party ---------------- */
/** Make sure the ceremony has a party: bridesmaids = team members (in saved order), groomsmen = a count she sets. Newly added team members join the end. */
export function ensureParty(room, people) {
  const p = (room.party ||= { grooms: 0, order: { b: [], g: [] } });
  p.order ||= { b: [], g: [] };
  const ids = people.map((x) => x.id);
  p.order.b = [...p.order.b.filter((id) => ids.includes(id)), ...ids.filter((id) => !p.order.b.includes(id))];
  p.grooms = Math.max(0, Math.min(10, p.grooms | 0));
  const all = Array.from({ length: p.grooms }, (_, i) => i + 1);
  p.order.g = [...p.order.g.filter((n) => n >= 1 && n <= p.grooms), ...all.filter((n) => !p.order.g.includes(n))];
  return p;
}
export const partyDots = (room, people) => {
  const p = ensureParty(room, people), cx = room.w / 2, name = (id) => people.find((x) => x.id === id)?.name || '';
  const at = (side, i) => ({ x: cx + side * (DOT_X0 + Math.floor(i / PER_COL) * DOT_STEP), y: DOT_Y0 + (i % PER_COL) * DOT_STEP });
  return [
    ...p.order.b.map((id, i) => ({ side: 'b', n: i + 1, label: name(id), id, ...at(-1, i) })),
    ...p.order.g.map((n, i) => ({ side: 'g', n: i + 1, label: `Groomsman ${n}`, id: n, ...at(1, i) })),
  ];
};
/** SVG for the dots (drawn with the fixed features). `anim` makes them pop in one after another. */
export function partySVG(room, people, anim) {
  return partyDots(room, people).map((d, k) => `<g class="party-dot ${d.side}" transform="translate(${d.x} ${d.y})"><g class="pd-in"${anim ? ` style="animation-delay:${k * 40}ms"` : ''}><circle r="1"/><text y=".38">${d.n}</text><title>${esc(d.label)}</title></g></g>`).join('');
}
/** Lowest y a row of chairs may start at so it clears the standing party. */
export function partyBottom(room, people) {
  const d = partyDots(room, people);
  return d.length ? Math.max(...d.map((x) => x.y)) + 3.5 : 0;
}

/* ---------------- ceremony ---------------- */
const sid = (p, i) => `${p}${i + 1}`;
/** Rows of chairs with a center aisle for `n` guests (the wedding party stands, so they're not counted). */
export function suggestCeremony(room, n, people) {
  const aisle = 6, pitch = 3, cx = room.w / 2;
  const y0 = Math.max(15, Math.ceil(partyBottom(room, people)));
  const yMax = room.h - 8;
  const perSide = Math.ceil(n / 2);
  let perRow = 5;
  const maxRow = Math.floor((room.w / 2 - aisle / 2 - 4) / 2);
  while (perRow < maxRow && y0 + (Math.ceil(perSide / perRow) - 1) * pitch > yMax) perRow++;
  const rows = Math.ceil(perSide / perRow);
  const tables = [];
  for (let r = 0; r < rows; r++) {
    const left = r === rows - 1 ? perSide - perRow * (rows - 1) : perRow;
    const right = r === rows - 1 ? n - perSide - perRow * (rows - 1) : perRow;
    [[left, -1, 'L'], [Math.max(0, right), 1, 'R']].forEach(([k, dir, tag], i) => {
      if (k < 1) return;
      tables.push({ id: sid(dir < 0 ? 'cl' : 'cr', r), name: `${r + 1}${tag}`, shape: 'row', seats: k, x: cx + dir * (aisle / 2 + k + 0.5), y: y0 + r * pitch, rot: 0, o: r * 2 + i });
    });
  }
  const aisleA = room.areas.find((a) => a.preset === 'aisle');
  const fits = y0 + (rows - 1) * pitch <= yMax;
  return { tables, fits, rows, aisle: aisleA && { x: cx - aisle / 2, y: y0 - 2, w: aisle, h: Math.min(room.h - 2 - (y0 - 2), (rows - 1) * pitch + 4) } };
}

const REL_RANK = { Parent: 0, 'Close relative': 1, Relative: 3, 'Close friend': 4, Friend: 5, '': 6, 'Plus-one': 6, Colleague: 7 };
/** Seat ceremony guests by side (Betel left, Carter right), family nearest the front, 'together' groups side by side. Stored as g.cRow. */
export function seatCeremony(guests, rows, links = []) {
  const eligible = guests.filter((g) => g.rsvp !== 'Declined' && g.party !== 'couple' && g.party !== 'team' && !['Bridesmaid', 'Groomsman'].includes(relationOf(g)));
  eligible.forEach((g) => { g.cRow = null; });
  const sides = { Betel: rows.filter((t) => t.id.startsWith('cl')).sort((a, b) => a.y - b.y), Carter: rows.filter((t) => t.id.startsWith('cr')).sort((a, b) => a.y - b.y) };
  const seats = (k) => sides[k].flatMap((t) => Array.from({ length: t.seats }, () => t.id));
  const free = { Betel: seats('Betel'), Carter: seats('Carter') };
  const rank = (g) => REL_RANK[relationOf(g)] ?? 6;
  const groups = togetherGroups(eligible, links).map((m) => {
    const b = m.filter((g) => g.side === 'Betel').length, c = m.filter((g) => g.side === 'Carter').length;
    return { m, r: Math.min(...m.map(rank)), side: b > c ? 'Betel' : c > b ? 'Carter' : null };
  }).sort((a, b) => a.r - b.r || b.m.length - a.m.length);
  let seated = 0, left = 0;
  for (const { m, side } of groups) {
    for (const g of m) {
      const pref = side || (['Betel', 'Carter'].includes(g.side) ? g.side : free.Betel.length >= free.Carter.length ? 'Betel' : 'Carter');
      const k = free[pref].length ? pref : pref === 'Betel' ? 'Carter' : 'Betel';
      if (free[k].length) { g.cRow = free[k].shift(); seated++; } else left++;
    }
  }
  return { seated, left };
}

/* ---------------- hangout spot (tasting room) ---------------- */
const overlap = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
/**
 * High-tops in the open middle of the tasting room, clear of the fireplace/lounge (left), the wine wall (top),
 * the bar queue in front of the carved bar in the sunroom (top right), and the entrance path.
 */
export function suggestHangout(room, n) {
  const count = Math.max(2, Math.min(12, Math.ceil(n / 10)));
  const t0 = { shape: 'round', seats: 4, high: true, rot: 0 };
  const fp = footprint(t0);
  const sun = (room.fixed?.decor || []).find((d) => d.kind === 'sunroom');
  const queue = sun ? { x1: sun.x - 2.5, x2: room.w, y1: 0, y2: sun.y + sun.h + 4.5 } : null; // the sunroom itself + the bar line in front of it
  const base = blockers(room, [], { areaPad: 1 });
  // extra no-go: a wider walkway in from the entrance, and the printed label under the fireplace
  (room.fixed?.openings || []).filter((o) => o.kind === 'entrance').forEach((o) => base.push({ x1: o.at - o.w / 2 - 2, x2: o.at + o.w / 2 + 2, y1: room.h - 14, y2: room.h }));
  (room.fixed?.decor || []).filter((d) => d.label && d.kind === 'fireplace').forEach((d) => base.push({ x1: d.x, x2: d.x + d.label.length * 0.9 + 1.5, y1: d.y + d.h, y2: d.y + d.h + 4 }));
  const ok = (x, y, picked) => {
    const b = { x1: x - fp.hw, x2: x + fp.hw, y1: y - fp.hh, y2: y + fp.hh };
    return x - fp.hw >= 2 && x + fp.hw <= room.w - 2 && y - fp.hh >= 2 && y + fp.hh <= room.h - 2
      && !base.some((z) => overlap(b, z)) && !(queue && overlap(b, queue)) && picked.every((p) => Math.hypot(p.x - x, p.y - y) >= 9);
  };
  const lounge = room.areas.find((a) => a.preset === 'lounge');
  const mid = { x: (lounge ? lounge.x + lounge.w : 12) + (room.w - 14) / 2, y: room.h * 0.45 };
  const cands = [];
  for (let y = 2; y < room.h; y += 1) for (let x = 2; x < room.w; x += 1) cands.push({ x, y, d: Math.hypot(x - mid.x, (y - mid.y) * 1.2) });
  // greedy under a few orderings; keep whichever seats the most (centered first when they tie)
  const orders = [(a, b) => a.d - b.d, (a, b) => a.y - b.y || a.x - b.x, (a, b) => a.x - b.x || a.y - b.y, (a, b) => b.y - a.y || a.x - b.x, (a, b) => b.x - a.x || a.y - b.y];
  let picked = [];
  for (const ord of orders) {
    const got = [];
    for (const c of [...cands].sort(ord)) { if (got.length >= count) break; if (ok(c.x, c.y, got)) got.push({ x: c.x, y: c.y }); }
    if (got.length > picked.length) picked = got;
  }
  picked.sort((a, b) => a.y - b.y || a.x - b.x);
  return { fits: picked.length >= count, needed: count, tables: picked.map((p, i) => ({ id: sid('ht', i) + Math.random().toString(36).slice(2, 5), name: String(i + 1), shape: 'round', seats: 4, high: true, x: p.x, y: p.y, rot: 0, o: i })) };
}

/* ---------------- side-panel tools ---------------- */
const stepHTML = (key, label, v, min, max, note = '') => `<div class="stepper"><span>${label}${note ? ` <i class="muted">${note}</i>` : ''}</span><div><button type="button" data-pstep="${key}" data-d="-1" ${v <= min ? 'disabled' : ''} aria-label="Fewer ${label}">−</button><b>${v}</b><button type="button" data-pstep="${key}" data-d="1" ${v >= max ? 'disabled' : ''} aria-label="More ${label}">+</button></div></div>`;
function partyHTML(room, people) {
  const d = partyDots(room, people), p = room.party;
  const chips = (side) => d.filter((x) => x.side === side).map((x) => `<li class="pchip ${side}" data-id="${x.id}"><i>${x.n}</i><span>${esc(x.label.replace('Groomsman', 'Groom'))}</span></li>`).join('') || '<li class="pchip none">none</li>';
  return `${stepHTML('grooms', 'Groomsmen', p.grooms, 0, 10)}
    <p class="muted small" style="margin:8px 0 4px">Drag to reorder · 1 stands nearest the altar</p>
    <div class="party-cols"><div><b class="muted small">Betel · ${p.order.b.length}</b><ol class="plist" data-side="b">${chips('b')}</ol></div><div><b class="muted small">Carter · ${p.order.g.length}</b><ol class="plist" data-side="g">${chips('g')}</ol></div></div>`;
}
export function spaceToolsHTML(space, ctx) {
  if (space === 'ceremony') {
    const room = ctx.SP().room;
    return `<section class="card" id="spTools"><h3>Plan tools</h3>
      <div class="field-row"><label class="field">Guests<input class="input" id="cCount" type="number" min="2" max="200" value="${ctx.state.guestTarget}"/></label></div>
      <div id="partyBox">${partyHTML(room, ctx.state.people)}</div>
      <div class="acts">
        <div class="act"><button class="btn moss sm" id="cGo">Suggest ceremony</button><span class="tip" tabindex="0" role="note" data-tip="Rows of chairs with a center aisle for this many guests; the wedding party stands either side of the altar.">ⓘ</span></div>
        <div class="act"><button class="btn gold sm" id="cSeat">Auto-seat guests</button><span class="tip" tabindex="0" role="note" data-tip="Betel's side on the left, Carter's on the right, parents and close family up front.">ⓘ</span></div>
      </div></section>`;
  }
  if (space === 'cocktail') {
    return `<section class="card" id="spTools"><h3>Plan tools</h3>
      <div class="field-row"><label class="field">Guests<input class="input" id="hCount" type="number" min="2" max="200" value="${ctx.state.guestTarget}"/></label></div>
      <div class="acts"><div class="act"><button class="btn moss sm" id="hGo">Suggest hangout</button><span class="tip" tabindex="0" role="note" data-tip="High-tops in the open middle, clear of the lounge, wine wall and bar line.">ⓘ</span></div></div></section>`;
  }
  return '';
}

/** ctx: { state, SP, commit, undoable, toast, draw, lede, animate } */
export function wireSpaceTools(root, space, ctx) {
  const { state, SP } = ctx;
  if (space === 'ceremony') {
    const room = () => SP().room, box = root.querySelector('#partyBox');
    const redraw = () => { ctx.commit({ silent: true }); ctx.draw(); ctx.lede(); };
    const wireParty = () => {
      box.innerHTML = partyHTML(room(), state.people);
      box.querySelectorAll('[data-pstep]').forEach((b) => b.onclick = () => {
        const p = ensureParty(room(), state.people);
        p.grooms = Math.max(0, Math.min(10, p.grooms + +b.dataset.d));
        ensureParty(room(), state.people); wireParty(); redraw();
      });
      box.querySelectorAll('.plist').forEach((ol) => sortable(ol, () => {
        const ids = [...ol.querySelectorAll('.pchip[data-id]')].map((li) => li.dataset.id);
        const p = ensureParty(room(), state.people);
        if (ol.dataset.side === 'b') p.order.b = ids; else { p.order.g = ids.map(Number); }
        wireParty(); redraw();
      }));
    };
    ensureParty(room(), state.people);
    { // an older saved ceremony has rows right where the party now stands: slide them back (nothing else changes)
      const rows = SP().tables, top = Math.min(...rows.map((t) => t.y)), need = partyBottom(room(), state.people) - top;
      if (rows.length && need > 0 && Math.max(...rows.map((t) => t.y)) + need <= room().h - 8) { rows.forEach((t) => { t.y += need; }); const a = room().areas.find((x) => x.preset === 'aisle'); if (a) { a.y += need; a.h = Math.max(4, a.h - need); } ctx.commit({ silent: true }); }
    }
    wireParty();
    root.querySelector('#cGo').onclick = () => {
      const n = Math.max(2, +root.querySelector('#cCount').value || 2);
      const s = suggestCeremony(room(), n, state.people);
      ctx.animate();
      ctx.undoable(s.fits ? `${n} chairs · ${s.rows} rows` : `Only some rows fit`, () => {
        state.guestTarget = n;
        SP().tables = s.tables;
        const a = room().areas.find((x) => x.preset === 'aisle');
        if (a && s.aisle) Object.assign(a, s.aisle);
        state.guests.forEach((g) => { g.cRow = null; });
        seatCeremony(state.guests, SP().tables, state.links || []);
      }, ctx.toast);
    };
    root.querySelector('#cSeat').onclick = () => {
      const r = seatCeremony(state.guests, SP().tables, state.links || []);
      redraw();
      ctx.toast(r.seated || r.left ? `${r.seated} seated${r.left ? ` · ${r.left} need a chair` : ''}` : 'Everyone has a chair');
    };
  }
  if (space === 'cocktail') {
    root.querySelector('#hGo').onclick = () => {
      const n = Math.max(2, +root.querySelector('#hCount').value || 2);
      const s = suggestHangout(SP().room, n);
      ctx.animate();
      ctx.undoable(s.fits ? `${s.tables.length} high-tops placed` : `Only ${s.tables.length} of ${s.needed} high-tops fit`, () => { SP().tables = s.tables; }, ctx.toast);
    };
  }
}

/** Tiny pointer-based sortable list: drag an item over its neighbours; `done` fires on release when the order changed. */
function sortable(ol, done) {
  let drag = null;
  ol.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.pchip[data-id]');
    if (!li) return;
    drag = { li, moved: false, before: [...ol.children].indexOf(li) };
    li.setPointerCapture(e.pointerId); li.classList.add('lift'); e.preventDefault();
  });
  ol.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.pchip[data-id]');
    if (over && over !== drag.li && over.parentNode === ol) {
      const r = over.getBoundingClientRect();
      ol.insertBefore(drag.li, e.clientY < r.top + r.height / 2 ? over : over.nextSibling);
      [...ol.querySelectorAll('.pchip[data-id] i')].forEach((el, i) => { el.textContent = i + 1; });
      drag.moved = true;
    }
  });
  const end = () => { if (!drag) return; const d = drag; drag = null; d.li.classList.remove('lift'); if (d.moved) done(); };
  ol.addEventListener('pointerup', end); ol.addEventListener('pointercancel', end);
}
