// Ceremony + hangout-spot helpers: suggest layouts, auto-seat the ceremony, the wedding party dots, and their side-panel tools.
// Units: feet. Sizes of the garden courtyard / tasting room are NOT venue facts (see VENUE.md) — these are working layouts.
import { togetherGroups, relationOf, blockers, footprint } from './layout.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DOT_STEP = 2.8, DOT_X0 = 4.4, DOT_Y0 = 6.4, DOT_R = 1.25; // the wedding party stands in ONE lateral row per side of the 5 ft aisle (1 = nearest the altar/aisle)

/* ---------------- wedding party ---------------- */
/**
 * The wedding party: two lists, left and right of the altar (order.b = left, order.g = right), each an ordered list of keys.
 * `pool` = [{ id, name, side }] of everyone who can stand (team on the left, groomsman guests on the right by default);
 * 'g1'.. are unnamed groomsmen she adds with the stepper. Anyone new joins their default side; nobody is in both lists.
 */
export function ensureParty(room, pool) {
  const p = (room.party ||= { grooms: 0, order: { b: [], g: [] } });
  p.order ||= { b: [], g: [] };
  p.order.g = p.order.g.map((x) => (typeof x === 'number' ? 'g' + x : x)); // older saves numbered the groomsmen
  p.grooms = Math.max(0, Math.min(10, p.grooms | 0));
  const holders = Array.from({ length: p.grooms }, (_, i) => 'g' + (i + 1));
  const keys = [...pool.map((x) => x.id), ...holders];
  const seen = new Set();
  const clean = (list) => list.filter((k) => keys.includes(k) && !seen.has(k) && seen.add(k));
  p.order.b = clean(p.order.b);
  p.order.g = clean(p.order.g);
  pool.forEach((x) => { if (!seen.has(x.id)) { seen.add(x.id); p.order[x.side === 'g' ? 'g' : 'b'].push(x.id); } });
  holders.forEach((k) => { if (!seen.has(k)) { seen.add(k); p.order.g.push(k); } });
  return p;
}
const partyName = (pool, key) => pool.find((x) => x.id === key)?.name || (/^g\d+$/.test(key) ? `Groomsman ${key.slice(1)}` : '');
export const partyDots = (room, pool) => {
  const p = ensureParty(room, pool), cx = room.cx ?? room.w / 2;
  const step = (k) => Math.min(DOT_STEP, k > 1 ? (cx - DOT_X0 - 2) / (k - 1) : DOT_STEP); // squeeze evenly if a long line would hit the wall
  const at = (side, i, k) => ({ x: cx + side * (DOT_X0 + i * step(k)), y: DOT_Y0 });
  return [
    ...p.order.b.map((id, i) => ({ side: 'b', n: i + 1, label: partyName(pool, id), id, ...at(-1, i, p.order.b.length) })),
    ...p.order.g.map((id, i) => ({ side: 'g', n: i + 1, label: partyName(pool, id), id, ...at(1, i, p.order.g.length) })),
  ];
};
/** SVG for the dots (drawn with the fixed features). `anim` makes them pop in one after another; a tapped dot shows its name right beside it (no popover). */
export function partySVG(room, pool, anim, selKey) {
  return partyDots(room, pool).map((d, k) => `<g class="party-dot ${d.side}${selKey === d.id ? ' sel' : ''}" data-pkey="${esc(d.id)}" transform="translate(${d.x} ${d.y})"><title>${esc(d.label)}</title><g class="pd-in"${anim ? ` style="animation-delay:${k * 40}ms"` : ''}><circle r="${DOT_R}"/><text y=".48">${d.n}</text></g>${selKey === d.id ? `<text class="pd-label" y="-1.9">${esc(d.label)}</text>` : ''}<text class="pd-label pd-hover" y="-1.9">${esc(d.label)}</text></g>`).join('');
}
/** Lowest y a row of chairs may start at so it clears the standing party. */
export function partyBottom(room, pool) {
  const d = partyDots(room, pool);
  return d.length ? Math.max(...d.map((x) => x.y)) + 4 : 0;
}

/* ---------------- ceremony ---------------- */
const sid = (p, i) => `${p}${i + 1}`;
/** Rows of chairs with a center aisle for `n` guests (the wedding party stands, so they're not counted). */
export function suggestCeremony(room, n, pool) {
  const aisle = 6, pitch = 3, cx = room.cx ?? room.w / 2; // ≈6 ft gravel aisle (photos #099, #022, #081)
  const y0 = Math.max(room.minRow ?? 15, Math.ceil(partyBottom(room, pool)));
  const yMax = room.h - 8;
  const perSide = Math.ceil(n / 2);
  let perRow = 5;
  const maxRow = Math.floor((Math.min(cx, room.w - cx) - aisle / 2 - 4) / 2);
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
  return { tables, fits, rows, aisle: aisleA && { x: cx - aisle / 2, y: y0 - 1.5, w: aisle, h: Math.min(room.h - 2 - (y0 - 1.5), (rows - 1) * pitch + 3) } };
}

const REL_RANK = { Parent: 0, 'Close relative': 1, Relative: 3, 'Close friend': 4, Friend: 5, '': 6, 'Plus-one': 6, Colleague: 7 };
/** Seat ceremony guests by side (Betel left, Carter right), family nearest the front, 'together' groups side by side.
 *  Stored per space as g.cRow[spaceId] (so seating the rain plan never wipes the outdoor seating). */
export const setCSeat = (g, spaceId, rowId) => { if (rowId) g.cRow = { ...(typeof g.cRow === 'object' && g.cRow ? g.cRow : {}), [spaceId]: rowId }; else if (g.cRow && typeof g.cRow === 'object') { delete g.cRow[spaceId]; } };
export function seatCeremony(guests, rows, links = [], spaceId = 'ceremony') {
  const eligible = guests.filter((g) => g.rsvp !== 'Declined' && g.party !== 'couple' && g.party !== 'team' && !['Bridesmaid', 'Groomsman'].includes(relationOf(g)));
  eligible.forEach((g) => setCSeat(g, spaceId, null));
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
      if (free[k].length) { setCSeat(g, spaceId, free[k].shift()); seated++; } else left++;
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
  const bist = !!room.bistro; // courtyard: 3-seat bistro tables; tasting room: 4-stool high-tops
  const count = Math.max(2, Math.min(12, Math.ceil(n / (bist ? 7.5 : 10))));
  const t0 = bist ? { shape: 'round', seats: 3, rot: 0 } : { shape: 'round', seats: 4, high: true, rot: 0 };
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
      && !base.some((z) => overlap(b, z)) && !(queue && overlap(b, queue)) && picked.every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) >= fp.hw * 2 + 1.7); // chair rings >= 1.5 ft apart (the standing clearance), measured the way the check does (box gap, not centre distance)
  };
  const lounge = room.areas.find((a) => a.preset === 'lounge');
  const mid = { x: bist ? room.w / 2 : (lounge ? lounge.x + lounge.w : 12) + (room.w - 14) / 2, y: room.h * 0.45 };
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
  return { fits: picked.length >= count, needed: count, tables: picked.map((p, i) => ({ id: sid('ht', i) + Math.random().toString(36).slice(2, 5), name: String(i + 1), shape: 'round', seats: t0.seats, ...(t0.high && { high: true }), x: p.x, y: p.y, rot: 0, o: i })) };
}

/* ---------------- side-panel tools ---------------- */
const stepHTML = (key, label, v, min, max, note = '') => `<div class="stepper"><span>${label}${note ? ` <i class="muted">${note}</i>` : ''}</span><div><button type="button" data-pstep="${key}" data-d="-1" ${v <= min ? 'disabled' : ''} aria-label="Fewer ${label}">−</button><b>${v}</b><button type="button" data-pstep="${key}" data-d="1" ${v >= max ? 'disabled' : ''} aria-label="More ${label}">+</button></div></div>`;
function partyHTML(room, pool, selKey) {
  const d = partyDots(room, pool), p = room.party;
  const chips = (side) => d.filter((x) => x.side === side).map((x) => `<li class="pchip ${side}${selKey === x.id ? ' sel' : ''}" data-id="${esc(x.id)}"><i>${x.n}</i><span>${esc(x.label)}</span></li>`).join('');
  return `${stepHTML('grooms', 'Extra groomsmen', p.grooms, 0, 10)}
    <p class="muted small" style="margin:8px 0 4px">Drag names to reorder or across · 1 stands nearest the altar</p>
    <div class="party-cols"><div><b class="muted small">Left · ${p.order.b.length}</b><ol class="plist" data-side="b">${chips('b')}</ol></div><div><b class="muted small">Right · ${p.order.g.length}</b><ol class="plist" data-side="g">${chips('g')}</ol></div></div>`;
}
/** "Chairs per row": a − / + for each half of each row (tapping a row on a phone is too small a target). */
function rowsHTML(tables) {
  const rows = new Map();
  tables.filter((t) => t.shape === 'row').forEach((t) => { const m = /^(\d+)([LR])/i.exec(t.name || ''); const n = m ? +m[1] : t.name; (rows.get(n) || rows.set(n, {}).get(n))[m ? m[2].toUpperCase() : t.id] = t; });
  const half = (t, label) => t ? `<span class="rowhalf"><i>${label}</i><button type="button" data-rstep="${esc(t.id)}" data-d="-1" ${t.seats <= 1 ? 'disabled' : ''} aria-label="Fewer chairs, row ${esc(t.name)}">−</button><b>${t.seats}</b><button type="button" data-rstep="${esc(t.id)}" data-d="1" ${t.seats >= 16 ? 'disabled' : ''} aria-label="More chairs, row ${esc(t.name)}">+</button></span>` : '<span class="rowhalf"></span>';
  return `<details class="rowsbox"><summary>Chairs per row · ${rows.size}</summary>${[...rows].map(([n, r]) => `<div class="rowstep"><span>Row ${esc(n)}</span>${half(r.L, 'L')}${half(r.R, 'R')}</div>`).join('')}</details>`;
}
export function spaceToolsHTML(space, ctx) { // `space` = the kind: 'ceremony' | 'cocktail'
  if (space === 'ceremony') {
    const room = ctx.SP().room;
    return `<section class="card" id="spTools"><h3>Plan tools</h3>
      <div class="field-row"><label class="field">Guests<input class="input" id="cCount" type="number" min="2" max="300" value="${room.chairs ?? ctx.state.guestTarget}"/></label></div>
      <div id="partyBox">${partyHTML(room, ctx.pool(), ctx.partySel?.())}</div>
      <div id="rowsBox">${rowsHTML(ctx.SP().tables)}</div>
      <div class="acts">
        <div class="act"><button class="btn moss sm" id="cGo">Suggest ceremony</button><span class="tip" tabindex="0" role="note" data-tip="Rows of chairs with a center aisle for this many guests; grows the room if they don't fit. The wedding party stands either side of the altar.">ⓘ</span></div>
        <div class="act"><button class="btn gold sm" id="cSeat">Auto-seat guests</button><span class="tip" tabindex="0" role="note" data-tip="Betel's side on the left, Carter's on the right, parents and close family up front.">ⓘ</span></div>
      </div></section>`;
  }
  if (space === 'cocktail') {
    return `<section class="card" id="spTools"><h3>Plan tools</h3>
      <div class="field-row"><label class="field">Guests<input class="input" id="hCount" type="number" min="2" max="300" value="${ctx.state.guestTarget}"/></label></div>
      <div class="acts"><div class="act"><button class="btn moss sm" id="hGo">Suggest hangout</button><span class="tip" tabindex="0" role="note" data-tip="Tables spread through the open middle, clear of the fountain, building and entrance.">ⓘ</span></div></div></section>`;
  }
  return '';
}

/** ctx: { state, SP, commit, undoable, toast, draw, lede, animate } */
export function wireSpaceTools(root, space, ctx) {
  const { state, SP } = ctx;
  if (space === 'ceremony') {
    const room = () => SP().room, box = root.querySelector('#partyBox');
    const redraw = () => { ctx.commit({ silent: true }); ctx.draw(); ctx.lede(); };
    const pool = () => ctx.pool();
    const wireParty = () => {
      box.innerHTML = partyHTML(room(), pool(), ctx.partySel?.());
      box.querySelectorAll('[data-pstep]').forEach((b) => b.onclick = () => {
        const p = ensureParty(room(), pool());
        p.grooms = Math.max(0, Math.min(10, p.grooms + +b.dataset.d));
        ensureParty(room(), pool()); wireParty(); redraw();
      });
      sortable(box, (changed, tapped) => {
        if (tapped) { ctx.selectParty?.(tapped); wireParty(); return; }
        const p = ensureParty(room(), pool());
        p.order.b = [...box.querySelectorAll('.plist[data-side="b"] .pchip[data-id]')].map((li) => li.dataset.id);
        p.order.g = [...box.querySelectorAll('.plist[data-side="g"] .pchip[data-id]')].map((li) => li.dataset.id);
        wireParty(); redraw();
      });
    };
    const rowsBox = root.querySelector('#rowsBox');
    const wireRows = () => {
      const was = rowsBox.querySelector('details')?.open;
      rowsBox.innerHTML = rowsHTML(SP().tables);
      if (was) rowsBox.querySelector('details').open = true;
      rowsBox.querySelectorAll('[data-rstep]').forEach((b) => b.onclick = () => {
        const t = SP().tables.find((x) => x.id === b.dataset.rstep); if (!t) return;
        t.seats = Math.max(1, Math.min(16, t.seats + +b.dataset.d));
        wireRows(); redraw();
      });
    };
    wireRows();
    ensureParty(room(), pool());
    { // an older saved ceremony has rows right where the party now stands: slide them back (nothing else changes)
      const rows = SP().tables, top = Math.min(...rows.map((t) => t.y)), need = partyBottom(room(), pool()) - top;
      if (rows.length && need > 0 && Math.max(...rows.map((t) => t.y)) + need <= room().h - 8) { rows.forEach((t) => { t.y += need; }); const a = room().areas.find((x) => x.preset === 'aisle'); if (a) { a.y += need; a.h = Math.max(4, a.h - need); } ctx.commit({ silent: true }); }
    }
    wireParty();
    root.querySelector('#cGo').onclick = () => {
      const n = Math.max(2, +root.querySelector('#cCount').value || 2);
      // the room grows (in 5 ft steps) until every chair fits
      const probe = structuredClone(room());
      let s = suggestCeremony(probe, n, pool());
      while (!s.fits && probe.h < 150) { probe.h += 5; s = suggestCeremony(probe, n, pool()); }
      const grew = probe.h - room().h;
      if (!s.fits) { ctx.toast(`Needs a bigger room for ${n}`); return; }
      ctx.animate();
      ctx.undoable(`${n} chairs · ${s.rows} rows${grew ? ' · room grown' : ''}`, () => {
        room().chairs = n; // chairs for THIS space only; the headcount (state.guestTarget) is not touched
        room().h = probe.h;
        SP().tables = s.tables;
        const a = room().areas.find((x) => x.preset === 'aisle');
        if (a && s.aisle) Object.assign(a, s.aisle);
        state.guests.forEach((g) => setCSeat(g, ctx.space, null));
        seatCeremony(state.guests, SP().tables, state.links || [], ctx.space);
      }, ctx.toast);
    };
    root.querySelector('#cSeat').onclick = () => {
      const r = seatCeremony(state.guests, SP().tables, state.links || [], ctx.space);
      redraw();
      ctx.toast(r.seated || r.left ? `${r.seated} seated${r.left ? ` · ${r.left} need a chair` : ''}` : 'Everyone has a chair');
    };
  }
  if (space === 'cocktail') {
    root.querySelector('#hGo').onclick = () => {
      const n = Math.max(2, +root.querySelector('#hCount').value || 2);
      const s = suggestHangout(SP().room, n);
      if (!s.fits) { ctx.toast(`Needs a bigger room for ${n}`); return; } // never place tables that would conflict
      ctx.animate();
      ctx.undoable(`${s.tables.length} tables placed`, () => { SP().tables = s.tables; }, ctx.toast);
    };
  }
}

/** Drag names within a column or across to the other one (empty columns accept a drop). `done(changed, tappedKey)` fires on release; a tap with no movement reports the tapped key. */
function sortable(box, done) {
  let drag = null;
  const renumber = () => box.querySelectorAll('.plist').forEach((ol) => [...ol.querySelectorAll('.pchip[data-id] i')].forEach((el, i) => { el.textContent = i + 1; }));
  box.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('.pchip[data-id]');
    if (!li || e.button > 0) return;
    drag = { li, moved: false, x: e.clientX, y: e.clientY };
    li.setPointerCapture(e.pointerId); e.preventDefault();
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    drag.li.classList.add('lift');
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const over = el?.closest?.('.pchip[data-id]'), col = el?.closest?.('.plist') || el?.closest?.('.party-cols > div')?.querySelector('.plist');
    if (over && over !== drag.li) {
      const r = over.getBoundingClientRect();
      over.parentNode.insertBefore(drag.li, e.clientY < r.top + r.height / 2 ? over : over.nextSibling);
      drag.moved = true; renumber();
    } else if (!over && col && col !== drag.li.parentNode) { col.append(drag.li); drag.moved = true; renumber(); }
  });
  const end = () => { if (!drag) return; const d = drag; drag = null; d.li.classList.remove('lift'); if (d.moved) done(true); else done(false, d.li.dataset.id); };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
}
