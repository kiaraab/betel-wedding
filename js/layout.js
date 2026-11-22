// Table geometry, the "suggest a layout" and "auto-seat" helpers. Units: feet.

/** How a guest is related to the couple. Team members count as bridesmaids unless set. */
export const RELATIONS = ['Parent', 'Close relative', 'Relative', 'Bridesmaid', 'Groomsman', 'Close friend', 'Friend', 'Colleague', 'Plus-one'];
export const relationOf = (g) => (g.relation === 'none' ? '' : g.relation || (g.party === 'team' ? 'Bridesmaid' : ''));

export const TABLE_STYLES = {
  round8: { label: 'Rounds · 8', shape: 'round', size: 8 },
  round10: { label: 'Rounds · 10', shape: 'round', size: 10 },
  family: { label: 'Family rows · 20', shape: 'rect', size: 20, rot: 90 },
  open: { label: 'Open floor', shape: 'round', size: 8, open: true }, // big dance floor, rounds on the perimeter, 2 long tables up front
  stage: { label: 'Head on stage', shape: 'round', size: 8, custom: 'stage' },   // sweetheart table up on the round stage
  banquet: { label: 'Long banquet', shape: 'rect', size: 20, custom: 'banquet' }, // two long tables + a cross table in a U around the floor
  headlong: { label: 'Long head table', shape: 'round', size: 8, custom: 'headlong' }, // long head table at the arched doors + rounds
};

export const seatCount = (t) => (t.shape === 'round' || t.shape === 'row' ? t.seats : Object.values(t.sides).reduce((a, b) => a + b, 0));

/** Ceremony row: chairs in a straight line, no table. ~2 ft per chair. */
export const ROW_PITCH = 2;

export function roundRadius(seats) {
  if (seats <= 4) return 1.8;
  if (seats <= 6) return 2.1;
  if (seats <= 8) return 2.5;   // 60" round
  if (seats <= 10) return 3;    // 72" round
  return 3 + (seats - 10) * 0.25;
}

export function rectDims(t) {
  const { top, bottom, left, right } = t.sides;
  return { L: Math.max(Math.max(top, bottom) * 2.1 + 0.6, 3), D: Math.max(Math.max(left, right) * 2.1 + 0.4, 2.6) };
}

/** Footprint incl. chairs, after rotation: half-width / half-height */
export function footprint(t) {
  if (t.box) return t.box; // explicit half-size (used to place areas)
  if (t.shape === 'round') { const r = roundRadius(t.seats) + 2; return { hw: r, hh: r }; }
  if (t.shape === 'row') return rotatedHalf((t.seats * ROW_PITCH) / 2 + 0.3, 0.9, t.rot || 0);
  const { L, D } = rectDims(t);
  const { top, bottom, left, right } = t.sides;
  let hw = L / 2 + (left || right ? 2 : 0.3);
  let hh = D / 2 + (top || bottom ? 2 : 0.3);
  // The sweetheart table's name is drawn under it (1.5 ft type) — keep other tables' chairs off the label
  if (t.id === 'head' && t.name && !((t.rot || 0) % 180)) {
    hw = Math.max(hw, t.name.length * 0.42 + 0.5);
    hh = Math.max(hh, D / 2 + (bottom ? 3.3 : 1.6) + 1);
  }
  return rotatedHalf(hw, hh, t.rot || 0);
}

/** Half-size of the bounding box of a hw x hh box rotated by `deg` degrees. */
export function rotatedHalf(hw, hh, deg) {
  const a = (deg * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return { hw: hw * c + hh * s, hh: hw * s + hh * c };
}

/** Chair centers relative to the table center (before rotation). */
export function chairPositions(t) {
  const pts = [];
  if (t.shape === 'round') {
    const R = roundRadius(t.seats) + 1.4;
    for (let i = 0; i < t.seats; i++) {
      const a = (i / t.seats) * Math.PI * 2 - Math.PI / 2;
      pts.push([Math.cos(a) * R, Math.sin(a) * R]);
    }
    return pts;
  }
  if (t.shape === 'row') return Array.from({ length: t.seats }, (_, i) => [(i - (t.seats - 1) / 2) * ROW_PITCH, 0]);
  const { L, D } = rectDims(t);
  const along = (n, len) => Array.from({ length: n }, (_, i) => -len / 2 + (len / n) * (i + 0.5));
  const top = along(t.sides.top, L).map((x) => [x, -(D / 2 + 1.3)]);
  const bottom = along(t.sides.bottom, L).map((x) => [x, D / 2 + 1.3]);
  for (let i = 0; i < Math.max(top.length, bottom.length); i++) {
    if (top[i]) pts.push(top[i]);
    if (bottom[i]) pts.push(bottom[i]);
  }
  along(t.sides.left, D).forEach((y) => pts.push([-(L / 2 + 1.3), y]));
  along(t.sides.right, D).forEach((y) => pts.push([L / 2 + 1.3, y]));
  return pts;
}

/* ---------- room geometry ---------- */
/** Where a wall opening sits, as a rectangle hugging the wall (for drawing + clearances). */
export function openingRect(room, o, depth = 0.8) {
  const { w, h } = room;
  if (o.wall === 'top') return { x: o.at - o.w / 2, y: 0, w: o.w, h: depth };
  if (o.wall === 'bottom') return { x: o.at - o.w / 2, y: h - depth, w: o.w, h: depth };
  if (o.wall === 'left') return { x: 0, y: o.at - o.w / 2, w: depth, h: o.w };
  return { x: w - depth, y: o.at - o.w / 2, w: depth, h: o.w };
}

const overlap = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
const box = (x, y, hw, hh, pad = 0) => ({ x1: x - hw - pad, x2: x + hw + pad, y1: y - hh - pad, y2: y + hh + pad });
const rbox = (r, pad = 0) => ({ x1: r.x - pad, x2: r.x + r.w + pad, y1: r.y - pad, y2: r.y + r.h + pad });

/** Everything a table must stay clear of: stage, clear paths at doors, the entrance aisle, areas, other tables. */
export function blockers(room, tables = [], { areaPad = 4, noStage = false } = {}) {
  const b = [];
  const st = room.fixed?.stage;
  if (st && !noStage) b.push({ x1: st.cx - st.r - 3, x2: st.cx + st.r + 3, y1: st.cy - st.r - 3, y2: st.cy + st.r + 3 });
  (room.fixed?.openings || []).forEach((o) => {
    if (o.kind === 'window') return;
    const clear = o.kind === 'entrance' ? 14 : 4; // 44" in front of exits; a real aisle in from the entrance
    const r = openingRect(room, o, clear);
    b.push(rbox(r, o.kind === 'entrance' ? 0 : 0.5));
  });
  // Fixed decor that takes floor space (fireplace, bar, hedges, statues, trees)
  (room.fixed?.decor || []).forEach((d) => { if (d.block) b.push(rbox(d, 0.5)); });
  (room.areas || []).forEach((a) => {
    const r = rotatedHalf(a.w / 2, a.h / 2, a.rot || 0);
    b.push(box(a.x + a.w / 2, a.y + a.h / 2, r.hw, r.hh, areaPad));
  });
  // 2 ft walkway around dining tables; ceremony rows sit back to back (the row pitch is the legroom)
  tables.forEach((t) => { const f = footprint(t); b.push(box(t.x, t.y, f.hw, f.hh, t.shape === 'row' ? 0 : 2)); });
  return b;
}

function makeTable(style, x, y) {
  const s = TABLE_STYLES[style];
  if (s.shape === 'round') return { shape: 'round', seats: s.size, x, y, rot: 0 };
  return { shape: 'rect', sides: { top: s.size / 2, bottom: s.size / 2, left: 0, right: 0 }, x, y, rot: s.rot || 0 };
}

/**
 * Tables for `guestCount` people (the couple sits at the sweetheart table), in a U around the dance floor.
 * Planner rules: ~14 ft between round centers, chairs ≥3 ft from walls, door paths and the entrance aisle clear,
 * dinner kept to the far end so 60 people don't feel lost; the near end under the balcony stays an arrival lounge.
 */
export function suggestTables(room, guestCount, style = 'round8', head) {
  // every style starts from the sweetheart table at the arched doors (a previous 'on the stage' suggestion must not stick); the result carries the head table it used
  const home = head && { ...head, shape: 'rect', x: room.w / 2, y: 7, rot: 0, sides: { top: 2, bottom: 0, left: 0, right: 0 } };
  return { ...suggestInner(room, guestCount, style, style === 'stage' || style === 'headlong' ? head : home), ...(head && style !== 'stage' && style !== 'headlong' ? { head: home } : {}) };
}
function suggestInner(room, guestCount, style, head) {
  const s = TABLE_STYLES[style];
  if (s.open) return suggestOpen(room, guestCount, head);
  if (s.custom) return CUSTOM[s.custom](room, guestCount, head);
  const needed = Math.max(1, Math.ceil(Math.max(0, guestCount - 2) / s.size));
  const fp = footprint(makeTable(style, 0, 0));
  const blocked = blockers(room, head ? [head] : [], { areaPad: 2 }); // chairs already in the footprint; +2 ft walkway
  const fits = (p) => !blocked.some((z) => overlap(box(p.x, p.y, fp.hw, fp.hh), z));
  const balcony = room.fixed?.balcony ? room.fixed.balcony.depth + 10 : 0;
  const rows = s.shape === 'rect' && s.rot === 90;
  // Rounds: the U first; plain grid packing only wins when it seats more (big counts)
  const placers = rows ? [(o) => placeGrid({ ...o, wall: 6, gap: 5 })] : [placeRounds, (o) => placeGrid({ ...o, wall: 3, gap: 5 })];
  // Keep the near end as an arrival lounge when there's room; only seat under the balcony when the count needs it.
  // The greedy U depends on odd/even counts, so also try one fewer — whichever places more wins (never fewer for more guests).
  let best = [];
  for (const lounge of [balcony, 0]) {
    for (const target of [needed, needed - 1]) {
      if (target < 1) continue;
      for (const place of placers) {
        const got = place({ room, head, fp, fits, lounge, target });
        if (got.length > best.length) best = got;
      }
      if (best.length >= needed) break;
    }
    if (best.length >= needed) break;
  }
  best.sort((a, b) => a.y - b.y || a.x - b.x);
  return {
    fits: best.length >= needed,
    needed,
    tables: best.map((p, i) => ({ ...makeTable(style, p.x, p.y), id: 't' + Math.random().toString(36).slice(2, 9), name: String(i + 1), o: i + 1 })),
  };
}

/**
 * "Open floor" (from the owner's reference photo at Morais): a big open dance floor mid-room, rounds of 8 hugging the
 * walls and the far (arched doors) side, two long banquet tables at the near end by the dance floor, sweetheart
 * table on the far wall. Mutates room's dance area (callers pass a clone). The near end stays an arrival lounge.
 */
function suggestOpen(room, guestCount, head) {
  const { w, h } = room, cx = w / 2;
  const lounge = room.fixed?.balcony ? room.fixed.balcony.depth + 10 : 0, maxY = h - Math.max(lounge, 3);
  const dance = (room.areas || []).find((a) => a.preset === 'dance');
  const seatsLeft = Math.max(1, guestCount - 2);
  if (dance) { dance.w = seatsLeft > 90 ? 22 : 18; dance.h = seatsLeft > 90 ? 24 : 20; dance.x = cx - dance.w / 2; dance.y = Math.round(Math.min(head ? head.y + 11 : 18, 20)); }
  const longN = seatsLeft >= 36 ? 2 : seatsLeft >= 20 ? 1 : 0, per = 4; // 9 ft long tables (8 seats)
  const longT = () => ({ shape: 'rect', sides: { top: per, bottom: per, left: 0, right: 0 }, rot: 0 });
  const rem = seatsLeft - longN * per * 2;
  const size = guestCount > 110 ? 10 : 8;
  const roundN = Math.max(0, Math.ceil(rem / size));
  const placed = []; // {t,x,y}
  const blockedNow = () => blockers(room, [...(head ? [head] : []), ...placed.map((p) => ({ ...p.t, x: p.x, y: p.y }))], { areaPad: 0.5 }); // chairs may sit right at the dance floor's edge
  // long tables: near end of the dance floor, either side of center
  const lf = footprint(longT());
  const ly0 = dance ? dance.y + dance.h + lf.hh + 3 : h * 0.6;
  for (let i = 0; i < longN; i++) {
    const x = cx + (i ? 1 : -1) * (lf.hw + 2.1), want = longN === 1 ? cx : x;
    let ok = false;
    for (let y = ly0; y <= maxY - lf.hh && !ok; y += 0.5) {
      if (!blockedNow().some((z) => overlap(box(want, y, lf.hw, lf.hh), z))) { placed.push({ t: longT(), x: want, y }); ok = true; }
    }
  }
  // rounds: hug the walls / far side, nearest the wall first, mirrored for symmetry where the stage allows
  const rt = () => ({ shape: 'round', seats: size, rot: 0 });
  const fp = footprint(rt()), sx = fp.hw * 2 + 3.5, sy = fp.hh * 2 + 3.5;
  const cands = [];
  const blocked = blockedNow();
  for (let y = Math.ceil(fp.hh + 2.5); y + fp.hh <= maxY; y++) for (let x = fp.hw + 2; x + fp.hw <= w - 2; x += 0.5) {
    if (!blocked.some((z) => overlap(box(x, y, fp.hw, fp.hh), z))) cands.push({ x, y, d: Math.min(x, w - x, y) });
  }
  cands.sort((a, b) => Math.round(a.d / 3) - Math.round(b.d / 3) || a.y - b.y || a.d - b.d); // wall band first, packed from the far end so rows stay tight
  const rounds = [];
  const clear = (p) => rounds.every((q) => Math.abs(p.x - q.x) >= sx - 0.01 || Math.abs(p.y - q.y) >= sy - 0.01);
  const free = (p) => cands.some((c) => c.x === p.x && c.y === p.y);
  for (const c of cands) {
    const left = roundN - rounds.length;
    if (left <= 0) break;
    if (!clear(c)) continue;
    const m = { x: 2 * cx - c.x, y: c.y };
    rounds.push(c);
    if (left >= 2 && Math.abs(m.x - c.x) >= sx && free(m) && [c].every((q) => Math.abs(m.x - q.x) >= sx - 0.01 || Math.abs(m.y - q.y) >= sy - 0.01) && clear(m)) rounds.push(m);
  }
  const all = [...placed.map((p) => ({ ...p.t, x: p.x, y: p.y })), ...rounds.map((p) => ({ ...rt(), x: p.x, y: p.y }))];
  all.sort((a, b) => a.y - b.y || a.x - b.x);
  const needed = longN + roundN;
  return { fits: all.length >= needed, needed, dance: dance && { x: dance.x, y: dance.y, w: dance.w, h: dance.h }, tables: all.map((t, i) => ({ ...t, id: 't' + Math.random().toString(36).slice(2, 9), name: String(i + 1), o: i + 1 })) };
}

/* ---- reference-photo styles (see VENUE.md "Layout styles" for the photos each is based on) ---- */
const tid = () => 't' + Math.random().toString(36).slice(2, 9);
const finish = (all, needed, extra = {}) => { all.sort((a, b) => a.y - b.y || a.x - b.x); return { fits: all.length >= needed, needed, ...extra, tables: all.map((t, i) => ({ ...t, id: tid(), name: String(i + 1), o: i + 1 })) }; };
/** Greedy: rounds of `size` on free 0.5-ft spots, ordered by `sort`, ≥3.5 ft between chair rings. */
function packRounds(room, placed, roundN, size, sort, maxY, gap = 3.5) {
  const rt = { shape: 'round', seats: size, rot: 0 }, fp = footprint(rt), sx = fp.hw * 2 + gap, sy = fp.hh * 2 + gap;
  const blocked = blockers(room, placed, { areaPad: 0.5 });
  const cands = [];
  for (let y = Math.ceil(fp.hh + 2.5); y + fp.hh <= maxY; y++) for (let x = fp.hw + 2; x + fp.hw <= room.w - 2; x += 0.5) {
    if (!blocked.some((z) => overlap(box(x, y, fp.hw, fp.hh), z))) cands.push({ x, y });
  }
  cands.sort(sort);
  const out = [];
  for (const c of cands) { if (out.length >= roundN) break; if (out.every((q) => Math.abs(c.x - q.x) >= sx - 0.01 || Math.abs(c.y - q.y) >= sy - 0.01)) out.push(c); }
  return out.map((p) => ({ ...rt, x: p.x, y: p.y }));
}
const nearEnd = (room) => room.h - Math.max(room.fixed?.balcony ? room.fixed.balcony.depth + 10 : 0, 3);
const danceOf = (room) => (room.areas || []).find((a) => a.preset === 'dance');
const CUSTOM = {
  /** Sweetheart table on the round stage (near-left corner), couple facing the room; dance floor in front of the stage, rounds around it. */
  stage(room, guestCount, head) {
    const st = room.fixed?.stage, dance = danceOf(room);
    const nh = { ...(head || { id: 'head', name: 'Mr. & Mrs. Griffin', sides: { top: 2, bottom: 0, left: 0, right: 0 }, o: 0 }), shape: 'rect', rot: 90, x: st ? st.cx + st.r * 0.45 : 4.5, y: st ? st.cy : room.h * 0.8 };
    const n = Math.max(1, Math.ceil(Math.max(0, guestCount - 2) / 8));
    // Try roomier plans first; the 50 x 75 ft room is tight with a stage bay, so fall back to a smaller floor, tighter aisles, then the lounge end
    const tries = [{ dw: 18, dh: 20, gap: 3.5, end: nearEnd(room) }, { dw: 16, dh: 18, gap: 2.5, end: nearEnd(room) }, { dw: 14, dh: 16, gap: 2.5, end: nearEnd(room) }, { dw: 14, dh: 16, gap: 2, end: room.h - 3 }];
    let best = null;
    for (const o of tries) {
      if (dance) { dance.w = o.dw; dance.h = o.dh; dance.x = (st ? st.cx + st.r + 3 : 12); dance.y = Math.max(8, (st ? st.cy : room.h * 0.8) - dance.h * 0.5 - 2); }
      const cx = dance ? dance.x + dance.w / 2 : room.w / 2, cy = dance ? dance.y + dance.h / 2 : room.h / 2;
      const d = (p) => Math.min(p.x, room.w - p.x, p.y);
      const rounds = packRounds(room, [nh], n, 8, (a, b) => Math.round(d(a) / 3) - Math.round(d(b) / 3) || Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy), o.end, o.gap);
      if (!best || rounds.length > best.rounds.length) best = { rounds, dance: dance && { x: dance.x, y: dance.y, w: dance.w, h: dance.h } };
      if (rounds.length >= n) break;
    }
    return finish(best.rounds, n, { head: nh, dance: best.dance });
  },
  /** Two long garland tables down the sides + a cross table at the near end (a U around the floor); sweetheart at the far wall. Seats from the Simply Breathe Events photo. */
  banquet(room, guestCount, head) {
    const { w } = room, cx = w / 2, dance = danceOf(room), end = nearEnd(room);
    const left = Math.max(2, guestCount - 2);
    const per = Math.max(2, Math.min(10, Math.ceil(left / 5))); // chairs per long side
    const mk = (n, rot) => ({ shape: 'rect', sides: { top: n, bottom: n, left: 0, right: 0 }, rot });
    const hy = head ? head.y + 7 : 14, placed = [], want = [{ n: per, rot: 90, side: -1 }, { n: per, rot: 90, side: 1 }, { n: Math.max(2, Math.ceil((left - per * 4) / 2)), rot: 0, side: 0 }];
    if (left <= per * 4) want.pop();
    for (const v of want) {
      const t0 = mk(v.n, v.rot), fp = footprint(t0);
      let spot = null;
      if (v.rot === 90) { for (let x = fp.hw + 3; x <= w / 2 - 8 && !spot; x += 0.5) { const px = v.side < 0 ? x : w - x; for (let y = hy + fp.hh; y + fp.hh <= end && !spot; y += 0.5) if (!blockers(room, [...(head ? [head] : []), ...placed], { areaPad: 0.5 }).some((z) => overlap(box(px, y, fp.hw, fp.hh), z))) spot = { x: px, y }; } }
      else { const yv = placed.length ? Math.max(...placed.map((p) => p.y + footprint(p).hh)) + fp.hh + 12 : end - fp.hh; for (let y = Math.min(yv, end - fp.hh); y > hy + 12 && !spot; y -= 0.5) if (!blockers(room, [...(head ? [head] : []), ...placed], { areaPad: 0.5 }).some((z) => overlap(box(cx, y, fp.hw, fp.hh), z))) spot = { x: cx, y }; }
      if (spot) placed.push({ ...t0, ...spot });
    }
    { // the two side tables line up (doors can push one lower): move both to the lower spot when it still fits
      const [L, R] = placed;
      if (L && R && L.rot === 90 && R.rot === 90 && L.y !== R.y) {
        const y = Math.max(L.y, R.y), fp = footprint(L), rest = placed.filter((p) => p !== L && p !== R);
        const bl = blockers(room, [...(head ? [head] : []), ...rest], { areaPad: 0.5 });
        if (y + fp.hh <= end && ![L.x, R.x].some((x) => bl.some((z) => overlap(box(x, y, fp.hw, fp.hh), z)))) { L.y = y; R.y = y; }
      }
    }
    if (dance) { dance.w = 16; dance.h = 18; dance.x = cx - 8; dance.y = placed.length ? Math.max(hy + 5, Math.min(...placed.map((p) => p.y - footprint(p).hh)) + 3) : hy + 5; }
    return finish(placed, want.length, { dance: dance && { x: dance.x, y: dance.y, w: dance.w, h: dance.h } });
  },
  /** Long head table facing the room at the arched doors, rounds in a U around the dance floor. */
  headlong(room, guestCount, head) {
    const seats = 8, dance = danceOf(room);
    const nh = { ...(head || { id: 'head', name: 'Mr. & Mrs. Griffin', o: 0 }), shape: 'rect', sides: { top: seats, bottom: 0, left: 0, right: 0 }, x: room.w / 2, y: 8, rot: 0 };
    if (dance) { dance.x = (room.w - dance.w) / 2; dance.y = 18; }
    const r = suggestInner(room, guestCount - (seats - 2), 'round8', nh);
    return { ...r, head: nh, dance: dance && { x: dance.x, y: dance.y, w: dance.w, h: dance.h } };
  },
};

/** Rounds: a U around the dance floor, filled outward from the sweetheart table, mirrored for symmetry. */
function placeRounds({ room, head, fp, fits, lounge, target }) {
  const aisle = 5, wallGap = 3;
  const sx = fp.hw * 2 + aisle, sy = fp.hh * 2 + aisle;
  const dance = (room.areas || []).find((a) => a.preset === 'dance');
  const anchor = head || (dance ? { x: dance.x + dance.w / 2, y: dance.y } : { x: room.w / 2, y: room.h / 3 });
  const cx = room.w / 2;
  // 1-ft candidate grid inside the dinner zone; the symmetric pass uses the left half and mirrors it,
  // the second pass may use any free spot (the stage makes the room lopsided)
  const cands = [];
  for (let y = Math.ceil(fp.hh + wallGap); y + fp.hh <= room.h - Math.max(lounge, wallGap); y++) {
    for (let x = Math.floor(room.w - wallGap - fp.hw); x - fp.hw >= wallGap; x -= 1) {
      if (x + fp.hw > room.w - wallGap) continue;
      if (fits({ x, y })) cands.push({ x, y });
    }
  }
  const dist = (p) => Math.hypot(p.x - anchor.x, (p.y - anchor.y) * 0.9);
  cands.sort((a, b) => dist(a) - dist(b) || a.y - b.y);
  const picked = [];
  const clear = (p) => picked.every((q) => Math.abs(p.x - q.x) >= sx - 0.01 || Math.abs(p.y - q.y) >= sy - 0.01);
  for (const strict of [true, false]) {
    for (const c of cands) {
      const left = target - picked.length;
      if (left <= 0) break;
      if (!clear(c)) continue;
      if (strict && c.x > cx + 0.01) continue;
      const mirror = { x: 2 * cx - c.x, y: c.y };
      const centered = Math.abs(mirror.x - c.x) < sx;
      if (centered) {
        if (strict && (left % 2 === 0 || Math.abs(c.x - cx) > 0.01)) continue;
        picked.push(c);
      } else if (left >= 2 && clear(mirror) && fits(mirror)) {
        picked.push(c, mirror);
      } else if (!strict) {
        picked.push(c);
      }
    }
  }
  return picked;
}

/**
 * Family rows run the long way. Planner: ~5 ft between rows, ~6 ft from the walls.
 * Columns are centered across the room; rows line up in bands. If aligned bands can't seat everyone,
 * each column fills top-down on its own (more rows, slightly staggered).
 */
function placeGrid({ room, fp, fits, lounge, target, wall, gap }) {
  const sx = fp.hw * 2 + gap, sy = fp.hh * 2 + gap;
  const cx = room.w / 2;
  const k = Math.max(1, Math.floor((room.w - 2 * wall - fp.hw * 2) / sx) + 1);
  const xs = Array.from({ length: k }, (_, i) => cx + (i - (k - 1) / 2) * sx).sort((a, b) => Math.abs(a - cx) - Math.abs(b - cx));
  const minY = wall + fp.hh, maxY = room.h - Math.max(lounge, wall) - fp.hh;
  // aligned bands
  const bands = [];
  let y0 = minY;
  while (bands.length < target && y0 <= maxY) {
    let placed = false;
    for (let want = Math.min(k, target - bands.length); want >= 1 && !placed; want--) {
      for (let y = y0; y <= maxY; y += 0.5) {
        const ok = xs.filter((x) => fits({ x, y }));
        if (ok.length >= want) { ok.slice(0, want).forEach((x) => bands.push({ x, y })); y0 = y + sy; placed = true; break; }
      }
    }
    if (!placed) break;
  }
  if (bands.length >= target) return bands;
  // per column
  const cols = [];
  xs.forEach((x) => { for (let y = minY; y <= maxY;) { if (fits({ x, y })) { cols.push({ x, y }); y += sy; } else y += 0.5; } });
  cols.sort((a, b) => a.y - b.y || Math.abs(a.x - cx) - Math.abs(b.x - cx));
  const per = cols.slice(0, target);
  return per.length > bands.length ? per : bands;
}

/** Nearest open spot for a new table (clear of features, areas and other tables), or room center. */
export function findFreeSpot(room, tables, t) {
  const fp = footprint(t);
  const blocked = blockers(room, tables, { areaPad: 1.5 });
  let best = null;
  for (let y = Math.ceil(fp.hh + 2); y + fp.hh <= room.h - 2; y++) {
    for (let x = Math.ceil(fp.hw + 2); x + fp.hw <= room.w - 2; x++) {
      if (blocked.some((z) => overlap(box(x, y, fp.hw, fp.hh), z))) continue;
      const d = Math.hypot(x - room.w / 2, y - room.h * 0.45);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best ? { x: best.x, y: best.y } : { x: room.w / 2, y: room.h / 2 };
}

/** Groups of guests joined by 'together' links (union-find). */
export function togetherGroups(guests, links = []) {
  const parent = new Map(guests.map((g) => [g.id, g.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  links.filter((l) => ['together', 'like', 'love'].includes(l.type) && parent.has(l.a) && parent.has(l.b)).forEach((l) => parent.set(find(l.a), find(l.b)));
  const groups = new Map();
  guests.forEach((g) => { const r = find(g.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(g); });
  return [...groups.values()];
}

/**
 * Seat guests using the connections chart:
 * - people linked "together" share a table (split across neighbouring tables only if the group is too big)
 * - people linked "apart" never share a table
 * - parents & close relatives nearest the couple, then the wedding party, close friends, friends, colleagues;
 *   within each, Betel's side, both, Carter's side, so friend groups stay together.
 * `onlyUnseated` keeps anyone already placed.
 */
export function autoSeat(guests, tables, { onlyUnseated = true, links = [] } = {}) {
  const head = tables.find((t) => t.id === 'head');
  const others = tables.filter((t) => t.id !== 'head')
    .sort((a, b) => Math.hypot(a.x - (head?.x ?? 0), a.y - (head?.y ?? 0)) - Math.hypot(b.x - (head?.x ?? 0), b.y - (head?.y ?? 0)));
  const going = guests.filter((g) => g.rsvp !== 'Declined' && g.party !== 'couple');
  if (!onlyUnseated) going.forEach((g) => { g.tableId = null; });
  const apart = new Map();
  links.filter((l) => l.type === 'apart').forEach((l) => {
    if (!apart.has(l.a)) apart.set(l.a, new Set());
    if (!apart.has(l.b)) apart.set(l.b, new Set());
    apart.get(l.a).add(l.b); apart.get(l.b).add(l.a);
  });
  const at = (t) => guests.filter((g) => g.tableId === t.id);
  const free = (t) => seatCount(t) - at(t).length;
  const clash = (g, t) => at(t).some((o) => apart.get(g.id)?.has(o.id));
  // family nearest the sweetheart table, then the wedding party, close friends, everyone else
  const REL_RANK = { Parent: 0, 'Close relative': 1, Bridesmaid: 2, Groomsman: 2, Relative: 3, 'Close friend': 4, Friend: 5, '': 6, 'Plus-one': 6, Colleague: 7 };
  const rank = (g) => (REL_RANK[relationOf(g)] ?? 6) * 10 + ({ Betel: 1, Both: 2, Carter: 3 }[g.side] ?? 2);
  // groups include people already seated, so a plus-one / household joins the table their partner is at
  const groups = togetherGroups(going, links)
    .map((all) => ({ m: all.filter((g) => !g.tableId), at: [...new Set(all.filter((g) => g.tableId).map((g) => g.tableId))] }))
    .filter(({ m }) => m.length)
    .map((x) => ({ ...x, r: Math.min(...x.m.map(rank)) }))
    .sort((a, b) => a.r - b.r || b.m.length - a.m.length);
  let seated = 0, left = 0;
  for (const { m, at: partnerTables } of groups) {
    const pref = partnerTables.map((id) => others.find((t) => t.id === id)).filter(Boolean);
    const order = [...pref, ...others.filter((t) => !pref.includes(t))];
    // whole group at one table if possible (their partner's table first)
    const whole = order.find((t) => free(t) >= m.length && m.every((g) => !clash(g, t)));
    if (whole) { m.forEach((g) => { g.tableId = whole.id; seated++; }); continue; }
    // otherwise fill neighbouring tables in order, still respecting "apart"
    for (const g of m) {
      const t = order.find((x) => free(x) > 0 && !clash(g, x));
      if (t) { g.tableId = t.id; seated++; } else left++;
    }
  }
  return { seated, left };
}
