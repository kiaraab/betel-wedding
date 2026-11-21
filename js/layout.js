// Table geometry, the "suggest a layout" and "auto-seat" helpers. Units: feet.

/** How a guest is related to the couple. Team members count as bridesmaids unless set. */
export const RELATIONS = ['Parent', 'Close relative', 'Relative', 'Bridesmaid', 'Groomsman', 'Close friend', 'Friend', 'Colleague', 'Plus-one'];
export const relationOf = (g) => g.relation || (g.party === 'team' ? 'Bridesmaid' : '');

export const TABLE_STYLES = {
  round8: { label: 'Rounds · 8', shape: 'round', size: 8 },
  round10: { label: 'Rounds · 10', shape: 'round', size: 10 },
  family: { label: 'Family rows · 20', shape: 'rect', size: 20, rot: 90 },
};

export const seatCount = (t) => (t.shape === 'round' ? t.seats : Object.values(t.sides).reduce((a, b) => a + b, 0));

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
  const { L, D } = rectDims(t);
  const { top, bottom, left, right } = t.sides;
  const hw = L / 2 + (left || right ? 2 : 0.3);
  const hh = D / 2 + (top || bottom ? 2 : 0.3);
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
    const R = roundRadius(t.seats) + 1.15;
    for (let i = 0; i < t.seats; i++) {
      const a = (i / t.seats) * Math.PI * 2 - Math.PI / 2;
      pts.push([Math.cos(a) * R, Math.sin(a) * R]);
    }
    return pts;
  }
  const { L, D } = rectDims(t);
  const along = (n, len) => Array.from({ length: n }, (_, i) => -len / 2 + (len / n) * (i + 0.5));
  const top = along(t.sides.top, L).map((x) => [x, -(D / 2 + 1.05)]);
  const bottom = along(t.sides.bottom, L).map((x) => [x, D / 2 + 1.05]);
  for (let i = 0; i < Math.max(top.length, bottom.length); i++) {
    if (top[i]) pts.push(top[i]);
    if (bottom[i]) pts.push(bottom[i]);
  }
  along(t.sides.left, D).forEach((y) => pts.push([-(L / 2 + 1.05), y]));
  along(t.sides.right, D).forEach((y) => pts.push([L / 2 + 1.05, y]));
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
export function blockers(room, tables = [], { areaPad = 4 } = {}) {
  const b = [];
  const st = room.fixed?.stage;
  if (st) b.push({ x1: st.cx - st.r - 3, x2: st.cx + st.r + 3, y1: st.cy - st.r - 3, y2: st.cy + st.r + 3 });
  (room.fixed?.openings || []).forEach((o) => {
    if (o.kind === 'window') return;
    const clear = o.kind === 'entrance' ? 14 : 4; // 44" in front of exits; a real aisle in from the entrance
    const r = openingRect(room, o, clear);
    b.push(rbox(r, o.kind === 'entrance' ? 0 : 0.5));
  });
  (room.areas || []).forEach((a) => {
    const r = rotatedHalf(a.w / 2, a.h / 2, a.rot || 0);
    b.push(box(a.x + a.w / 2, a.y + a.h / 2, r.hw, r.hh, areaPad));
  });
  tables.forEach((t) => { const f = footprint(t); b.push(box(t.x, t.y, f.hw, f.hh, 2)); });
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
  const s = TABLE_STYLES[style];
  const needed = Math.max(1, Math.ceil(Math.max(0, guestCount - 2) / s.size));
  const fp = footprint(makeTable(style, 0, 0));
  const aisle = s.shape === 'round' ? 5 : 5;
  const sx = fp.hw * 2 + aisle, sy = fp.hh * 2 + aisle;
  const wallGap = 3;
  const lounge = room.fixed?.balcony ? room.fixed.balcony.depth + 10 : 0; // near end stays an arrival lounge
  const blocked = blockers(room, head ? [head] : [], { areaPad: 2 }); // chairs already in the footprint; +2 ft walkway
  const dance = (room.areas || []).find((a) => a.preset === 'dance');
  // Fill outward from the sweetheart table so the U wraps the dance floor from the top down
  const anchor = head || (dance ? { x: dance.x + dance.w / 2, y: dance.y } : { x: room.w / 2, y: room.h / 3 });
  const cx = room.w / 2;
  const fits = (p) => !blocked.some((z) => overlap(box(p.x, p.y, fp.hw, fp.hh), z));
  // 1-ft candidate grid inside the dinner zone, left half only (we mirror for symmetry)
  const cands = [];
  for (let y = Math.ceil(fp.hh + wallGap); y + fp.hh <= room.h - lounge; y++) {
    for (let x = cx; x - fp.hw >= wallGap; x -= 1) {
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
      const left = needed - picked.length;
      if (left <= 0) break;
      if (!clear(c)) continue;
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
  picked.sort((a, b) => a.y - b.y || a.x - b.x);
  return {
    fits: picked.length >= needed,
    needed,
    tables: picked.map((p, i) => ({ ...makeTable(style, p.x, p.y), id: 't' + Math.random().toString(36).slice(2, 9), name: String(i + 1), o: i + 1 })),
  };
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
  links.filter((l) => l.type === 'together' && parent.has(l.a) && parent.has(l.b)).forEach((l) => parent.set(find(l.a), find(l.b)));
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
  const groups = togetherGroups(going.filter((g) => !g.tableId), links)
    .map((m) => ({ m, r: Math.min(...m.map(rank)) }))
    .sort((a, b) => a.r - b.r || b.m.length - a.m.length);
  let seated = 0, left = 0;
  for (const { m } of groups) {
    // whole group at one table if possible
    const whole = others.find((t) => free(t) >= m.length && m.every((g) => !clash(g, t)));
    if (whole) { m.forEach((g) => { g.tableId = whole.id; seated++; }); continue; }
    // otherwise fill neighbouring tables in order, still respecting "apart"
    for (const g of m) {
      const t = others.find((x) => free(x) > 0 && !clash(g, x));
      if (t) { g.tableId = t.id; seated++; } else left++;
    }
  }
  return { seated, left };
}
