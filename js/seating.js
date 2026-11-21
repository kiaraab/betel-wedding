import { state, commit, uid, undoable, exportJSON, importJSON } from './store.js';
import { MOODS, headTable, AREA_PRESETS, SPACES, seedSpaces, MORAIS_PHOTOS } from './data.js';
import { TABLE_STYLES, relationOf, seatCount, roundRadius, rectDims, chairPositions, suggestTables, autoSeat, findFreeSpot, footprint, openingRect, blockers } from './layout.js';
import { esc, toast } from './util.js';
import { spaceToolsHTML, wireSpaceTools, partySVG } from './spaces.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const M = 3; // margin around the room (ft)
let sel = null;          // { kind: 'table' | 'area', id }
let cleanup = null;      // AbortController for document listeners of the current render
let view = null;         // current viewBox { x, y, w, h } — persists across re-renders
let mode = 'plan';       // 'plan' | '3d'
let space = 'reception'; // 'ceremony' | 'cocktail' | 'reception' — tabs above the plan
let inkFrom = null;       // where the tab underline glides from after a space switch
/** The space being edited: the reception lives at the top of the plan (room/tables), the others in state.spaces. */
function SP() {
  if (space === 'reception') return state;
  state.spaces ||= {};
  state.spaces[space] ||= seedSpaces()[space];
  return state.spaces[space];
}
const spaceInfo = () => ({ ...SPACES.find((x) => x.id === space), label: SPACE_LABEL[space] || SPACES.find((x) => x.id === space).label });
const TAB_ORDER = ['ceremony', 'reception', 'cocktail'];            // Hangout spot last
const SPACE_LABEL = { cocktail: 'Hangout spot' };                  // data key stays 'cocktail'
const tabList = () => TAB_ORDER.map((id) => SPACES.find((x) => x.id === id)).filter(Boolean).map((x) => ({ ...x, label: SPACE_LABEL[x.id] || x.label }));
/** One quiet line under the tabs */
function spaceLede() {
  const ts = SP().tables, seats = ts.reduce((n, t) => n + seatCount(t), 0);
  if (space === 'ceremony') return `${seats} seats · ${new Set(ts.map((t) => t.y)).size} rows`; // rows = lines of chairs (left + right halves count once)
  if (space === 'cocktail') return `${ts.length} high-tops · ${seats} stools`;
  return `${state.guests.filter((g) => g.tableId && g.rsvp !== 'Declined').length} of ${going().length} seated · ${ts.length} tables`;
}
let showPhotos = false;  // plan toolbar 'Photos': seated guests with a picture show it in their seat
let refTab = 'inspo';    // Reference panel tab
let flip = null;         // Map tableId -> {x,y} of the plan before a layout change: tables glide from there
let partySel = null;     // ceremony: the wedding-party dot that was tapped (just highlights it)
// Come back to the floor plan each time Seating is opened; 3D only loads when its tab is clicked
addEventListener('hashchange', () => { if (location.hash !== '#seating') { mode = 'plan'; sel = null; partySel = null; } });
let enterAnim = false;   // play the "tables glide in" animation on next draw
const lastFilled = new Map(); // tableId -> seated count last drawn (for the seat "pop")

const guestsAt = (tid) => state.guests.filter((g) => (space === 'reception' ? g.tableId : g.cRow) === tid); // ceremony seats live in g.cRow
const going = () => state.guests.filter((g) => g.rsvp !== 'Declined');
const listFor = (kind) => (kind === 'area' ? SP().room.areas : SP().tables);
const findItem = (s) => s && listFor(s.kind).find((x) => x.id === s.id);
const baseView = () => ({ x: -M, y: -M, w: SP().room.w + M * 2, h: SP().room.h + M * 2 });
const moodNow = () => MOODS.find((m) => m.id === state.mood) || MOODS[0];
const areaTransform = (a) => `translate(${a.x} ${a.y}) rotate(${a.rot || 0} ${a.w / 2} ${a.h / 2})`;
// Little rotate knob on a stalk, shown on the selected item
const rotHandle = (x, y, x0, y0) => `<line class="rot-stalk" x1="${x0}" y1="${y0}" x2="${x}" y2="${y}"/><circle class="rot-knob" cx="${x}" cy="${y}" r=".9" data-rotate="1"><title>Drag to rotate</title></circle>`;
const ROT_STEP = 15;

/* ---------------- each space's own real photo behind the plan (clear, flat light overlay; drawn as a data URL so Share PNG gets it too) ---------------- */
const SPACE_PHOTO = { reception: 'assets/venue/ballroom.jpg', cocktail: 'assets/venue/tasting-room.jpg', ceremony: 'assets/venue/courtyard.jpg' };
const bgPhotos = {}, bgAspects = {};
function spacePhoto(sp) {
  const src = SPACE_PHOTO[sp];
  if (!src) return Promise.resolve(null);
  bgPhotos[sp] ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.88);
      bgAspects[url] = c.width / c.height;
      resolve(url);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  return bgPhotos[sp];
}

/** The photo, cover-fitted around the room outline: centered on the room, never distorted, large enough that it fills the margins at normal zoom. */
function bgImage(bg, w, h) {
  const bgAspect = bgAspects[bg] || 0.75;
  let iw = Math.max(w * 3.4, h * 1.5 * bgAspect), ih = iw / bgAspect; // wide enough to fill the stage area on landscape screens
  if (ih < h * 1.5) { ih = h * 1.5; iw = ih * bgAspect; }
  return `<image class="bg" href="${bg}" x="${w / 2 - iw / 2}" y="${h / 2 - ih / 2}" width="${iw}" height="${ih}" preserveAspectRatio="xMidYMid meet"/>`;
}

/* ---------------- drawing ---------------- */
function tableSVG(t, mood, i) {
  const g = document.createElementNS(SVGNS, 'g');
  g.classList.add('tbl');
  if (sel?.id === t.id) g.classList.add('sel');
  g.dataset.kind = 'table';
  g.dataset.id = t.id;
  g.setAttribute('transform', `translate(${t.x} ${t.y})`);
  const n = guestsAt(t.id).length;
  const before = enterAnim ? 0 : (lastFilled.get(t.id) ?? n);
  lastFilled.set(t.id, n);
  const rot = t.rot || 0;
  const delay = (k) => (enterAnim ? i * 45 + 380 + k * 55 : 0);
  const seated = showPhotos && space === 'reception' ? guestsAt(t.id) : [];
  const chairs = chairPositions(t).map(([x, y], k) => {
    const ph = seated[k]?.photo;
    return `<circle class="chair${k < n ? ' filled' : ''}${k < n && k >= before ? ' pop' : ''}" cx="${x}" cy="${y}" r=".75"${k < n && k >= before && enterAnim ? ` style="animation-delay:${delay(k)}ms"` : ''}/>`
      + (ph ? `<g transform="translate(${x} ${y}) rotate(${-rot})" class="seat-photo"><clipPath id="cp-${t.id}-${k}"><circle r=".75"/></clipPath><image href="${esc(ph)}" x="-.75" y="-.75" width="1.5" height="1.5" preserveAspectRatio="xMidYMid slice" clip-path="url(#cp-${t.id}-${k})"/></g>` : '');
  }).join('');
  const [bloom, leaf] = [mood.swatches[3], mood.swatches[1]];
  let top, room;
  if (t.shape === 'row') {
    const L = t.seats * 2;
    room = 0;
    top = `<rect class="row-hit" x="${-L / 2}" y="-1.1" width="${L}" height="2.2" rx="1.1"/>`;
  } else if (t.shape === 'round') {
    const r = roundRadius(t.seats);
    room = r * 1.7;
    top = `<circle class="top${t.high ? ' high' : ''}" r="${r}"/><circle cx="0" cy="${-r + .75}" r=".42" fill="${bloom}"/><circle cx=".55" cy="${-r + .95}" r=".26" fill="${leaf}"/><circle cx="-.55" cy="${-r + .95}" r=".24" fill="${leaf}"/>`;
  } else {
    const { L, D } = rectDims(t);
    room = (rot ? D : L) * 0.95;
    top = `<rect class="top" x="${-L / 2}" y="${-D / 2}" width="${L}" height="${D}" rx=".3"/><rect x="${-L / 2 + .4}" y="-.22" width="${L - .8}" height=".44" rx=".22" fill="${leaf}" opacity=".75"/>`;
  }
  // Long names shrink to fit instead of being cut off
  const fs = Math.max(0.9, Math.min(1.7, room / Math.max(1, t.name.length * 0.58)));
  const isHead = t.id === 'head';
  const row = t.shape === 'row';
  const ly = t.shape === 'round' ? fs * 0.35 : row ? 0 : (rot % 180 ? 0 : rectDims(t).D / 2 + (t.sides.bottom ? 3.6 : 1.6));
  const D0 = row ? 1.8 : t.shape === 'round' ? 0 : rectDims(t).D;
  const knob = sel?.id === t.id && t.shape !== 'round' ? `<g transform="rotate(${rot})">${rotHandle(0, -(D0 / 2 + 4.2), 0, -D0 / 2)}</g>` : '';
  const inner = `<g transform="rotate(${rot})">${chairs}${top}</g>
    ${row ? '' : `<text class="${isHead ? 'head-label' : 'num'}" y="${ly}" style="font-size:${isHead ? 1.5 : fs}px">${esc(t.name)}</text>`}${knob}`;
  // Fly in from the entrance doors when a layout is suggested (inner group animates; outer keeps its position)
  const was = flip?.get(t.id);
  if (was && (was.x !== t.x || was.y !== t.y)) { g.dataset.fromx = was.x; g.dataset.fromy = was.y; }
  const flyIn = !isHead && (enterAnim || (flip && !was));
  g.innerHTML = flyIn
    ? `<g class="fly" style="--fx:${(SP().room.w / 2 - t.x).toFixed(1)}px;--fy:${(SP().room.h - t.y).toFixed(1)}px;animation-delay:${enterAnim ? i * 45 : 120 + i * 20}ms">${inner}</g>`
    : inner;
  return g;
}

/** Area titles: one line if it fits, else two balanced lines; the type shrinks until the whole label sits inside the rect. */
function fitLabel(label, w, h) {
  const text = String(label).trim(), cw = 0.56, maxW = Math.max(1, w - 1), maxH = Math.max(1, h - 0.6);
  const words = text.split(/\s+/);
  let split = null;
  if (words.length > 1) { // most even break
    let best = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), d = Math.max(a.length, b.length);
      if (d < best) { best = d; split = [a, b]; }
    }
  }
  for (let fs = 1.5; fs >= 0.7; fs -= 0.05) {
    if (text.length * cw * fs <= maxW && fs <= maxH) return { fs, lines: [text] };
    if (split && Math.max(split[0].length, split[1].length) * cw * fs <= maxW && fs * 2.2 <= maxH) return { fs, lines: split };
  }
  const fs = 0.7, per = Math.max(3, Math.floor(maxW / (cw * fs)));
  return { fs, lines: split ? split.map((l) => (l.length > per ? l.slice(0, per - 1) + '…' : l)) : [text.length > per ? text.slice(0, per - 1) + '…' : text] };
}

function areaSVG(a) {
  const g = document.createElementNS(SVGNS, 'g');
  g.classList.add('area', `p-${a.preset || 'custom'}`);
  if (sel?.id === a.id) g.classList.add('sel');
  g.dataset.kind = 'area';
  g.dataset.id = a.id;
  g.setAttribute('transform', areaTransform(a));
  const { fs, lines } = fitLabel(a.label, a.w, a.h);
  const lh = fs * 1.12, y0 = a.h / 2 - ((lines.length - 1) * lh) / 2 + fs * 0.35;
  g.innerHTML = `<title>${esc(a.label)}</title><rect width="${a.w}" height="${a.h}" rx=".5"/>
    <text x="${a.w / 2}" y="${y0}" style="font-size:${fs}px">${lines.map((l, i) => `<tspan x="${a.w / 2}"${i ? ` dy="${lh}"` : ''}>${esc(l)}</tspan>`).join('')}</text>
    ${sel?.id === a.id ? `<circle class="grip" cx="${a.w}" cy="${a.h}" r=".9" data-grip="1"/>${rotHandle(a.w / 2, -2.6, a.w / 2, 0)}` : ''}`;
  return g;
}

/** Everyone who can stand in the wedding party: the team (left by default) and any guest marked Groomsman (right by default). */
function partyPool() {
  return [...state.people.map((x) => ({ id: x.id, name: x.name, side: 'b' })),
    ...state.guests.filter((g) => g.rsvp !== 'Declined' && relationOf(g) === 'Groomsman').map((g) => ({ id: g.id, name: g.name, side: 'g' }))];
}

function fixedSVG() {
  const { w, h, fixed } = SP().room;
  let s = '';
  // Balcony overhead (dashed — it's floor space underneath)
  if (fixed.balcony) {
    const d = fixed.balcony.depth;
    s += `<rect class="balcony" x="0" y="${h - d}" width="${w}" height="${d}"/><text class="fixed-label" x="${w / 2}" y="${h - d + 2.2}">Balcony above</text>`;
  }
  // Round tiered stage against the left wall
  if (fixed.stage) {
    const { cx, cy, r, steps } = fixed.stage;
    for (let i = 0; i < steps; i++) {
      const rr = r - i * (r / (steps + 1));
      s += `<path class="stage" d="M ${cx} ${cy - rr} A ${rr} ${rr} 0 0 1 ${cx} ${cy + rr} Z"/>`;
    }
    s += `<text class="fixed-label" x="${cx + r * 0.42}" y="${cy + .5}">Stage</text>`;
  }
  // Courtyard / tasting-room features (fixed, drawn from VENUE.md facts only)
  (fixed.decor || []).forEach((d) => {
    const mx = d.x + d.w / 2, my = d.y + d.h / 2;
    if (d.kind === 'cypress') s += `<circle class="dc-cypress" cx="${mx}" cy="${my}" r="${d.w / 2}"/><circle class="dc-cypress-in" cx="${mx - d.w * 0.12}" cy="${my - d.w * 0.12}" r="${d.w / 4}"/>`;
    else if (d.kind === 'hedge') s += `<rect class="dc-hedge" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="${Math.min(d.w, d.h) / 2}"/>`;
    else if (d.kind === 'statue') s += `<rect class="dc-plinth" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx=".2"/><circle class="dc-statue" cx="${mx}" cy="${my}" r="${d.w * 0.28}"/>`;
    else if (d.kind === 'fireplace') s += `<rect class="dc-stone" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx=".3"/><rect class="dc-fire" x="${d.x + d.w - 0.9}" y="${my - 1.4}" width=".9" height="2.8" rx=".3"/><text class="fixed-label" x="${d.x + 0.4}" y="${d.y + d.h + 1.8}" style="text-anchor:start">${esc(d.label)}</text>`;
    else if (d.kind === 'wine') { s += `<rect class="dc-wine" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}"/>`; for (let x = d.x + 1; x < d.x + d.w; x += 1) s += `<line class="dc-wine-cell" x1="${x}" y1="${d.y}" x2="${x}" y2="${d.y + d.h}"/>`; }
    else if (d.kind === 'sunroom') {
      const c = Math.min(d.w, d.h) * 0.29; // octagon corner cut
      const pts = [[d.x + c, d.y], [d.x + d.w - c, d.y], [d.x + d.w, d.y + c], [d.x + d.w, d.y + d.h - c], [d.x + d.w - c, d.y + d.h], [d.x + c, d.y + d.h], [d.x, d.y + d.h - c], [d.x, d.y + c]];
      s += `<polygon class="dc-sunroom" points="${pts.map((p) => p.join(',')).join(' ')}"/><circle class="dc-skylight" cx="${mx}" cy="${my}" r="${c}"/>`;
    } else if (d.kind === 'bar') s += `<rect class="dc-bar" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="1.1"/><text class="fixed-label" x="${mx}" y="${d.y + d.h + 1.6}">Bar</text>`;
  });
  if (space === 'ceremony') s += partySVG(SP().room, partyPool(), enterAnim, partySel); // wedding party dots
  // Walls with openings cut in
  s += `<rect class="wall" x="0" y="0" width="${w}" height="${h}"/>`;
  fixed.openings.forEach((o) => {
    const r = openingRect(SP().room, o, 0.9);
    const horiz = o.wall === 'top' || o.wall === 'bottom';
    s += `<rect class="gap" x="${r.x - (horiz ? 0 : .15)}" y="${r.y - (horiz ? .15 : 0)}" width="${horiz ? r.w : 1.2}" height="${horiz ? 1.2 : r.h}"/>`;
    if (o.kind === 'window') {
      s += `<rect class="win" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`;
    } else {
      // door swing arc(s), drawn into the room
      const half = o.w / 2;
      const sweep = (px, py, dx, dy, ex, ey, flag) => `<path class="door" d="M ${px} ${py} L ${px + dx} ${py + dy} A ${half} ${half} 0 0 ${flag} ${ex} ${ey}"/>`;
      if (o.wall === 'top') s += sweep(o.at - half, 0, 0, half, o.at, 0, 0) + sweep(o.at + half, 0, 0, half, o.at, 0, 1);
      if (o.wall === 'bottom') s += sweep(o.at - half, h, 0, -half, o.at, h, 1) + sweep(o.at + half, h, 0, -half, o.at, h, 0);
      if (o.wall === 'left') s += sweep(0, o.at - half, half, 0, 0, o.at, 1) + sweep(0, o.at + half, half, 0, 0, o.at, 0);
      if (o.wall === 'right') s += sweep(w, o.at - half, -half, 0, w, o.at, 0) + sweep(w, o.at + half, -half, 0, w, o.at, 1);
      if (o.kind === 'entrance') s += `<text class="fixed-label entrance" x="${o.at}" y="${h - 1.6}">Entrance</text>`;
    }
  });
  return s;
}

function planSVG(bg) {
  const { w, h } = SP().room;
  const mood = moodNow();
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.classList.add('plan');
  svg.dataset.floor = SP().room.floor || '';
  const v = view || baseView();
  svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${SP().room.name || 'Reception'} floor plan`);
  const floorFill = { pavers: 'url(#pavers)', tile: 'url(#tile)' }[SP().room.floor];
  let grid = '';
  for (let x = 10; x < w; x += 10) grid += `<line class="grid-line" x1="${x}" y1="0" x2="${x}" y2="${h}"/>`;
  for (let y = 10; y < h; y += 10) grid += `<line class="grid-line" x1="0" y1="${y}" x2="${w}" y2="${y}"/>`;
  svg.innerHTML = `
    <defs>
      <pattern id="boards" width="2" height="${h}" patternUnits="userSpaceOnUse">
        <rect width="2" height="${h}" fill="#f4ead6"/><line x1="2" y1="0" x2="2" y2="${h}" stroke="#e6d6b6" stroke-width=".06"/>
      </pattern>
      <pattern id="pavers" width="2" height="2" patternUnits="userSpaceOnUse">
        <rect width="2" height="2" fill="#dfe3cf"/><rect x=".18" y=".18" width="1.64" height="1.64" rx=".2" fill="#eceadf"/><circle cx="1" cy="1" r=".35" fill="#cfd7b8"/>
      </pattern>
      <pattern id="tile" width="3" height="3" patternUnits="userSpaceOnUse">
        <rect width="3" height="3" fill="#efe6d6"/><path d="M0 0H3V3" fill="none" stroke="#e0d3bc" stroke-width=".07"/>
      </pattern>
      <clipPath id="roomClip"><rect x="0" y="0" width="${w}" height="${h}"/></clipPath>
    </defs>
    ${bg ? bgImage(bg, w, h) : ''}
    <rect class="tint" x="${-w}" y="${-h * 0.5}" width="${w * 3}" height="${h * 2}"/>
    <rect class="floor" x="0" y="0" width="${w}" height="${h}"${floorFill ? ` style="fill:${floorFill}"` : ''}/>
    ${grid}`;
  const fixedG = document.createElementNS(SVGNS, 'g');
  fixedG.classList.add('fixed');
  fixedG.innerHTML = fixedSVG();
  svg.appendChild(fixedG);
  SP().room.areas.filter((a) => a.id !== sel?.id).forEach((a) => svg.appendChild(areaSVG(a)));
  SP().tables.forEach((t, i) => svg.appendChild(tableSVG(t, mood, i)));
  const selArea = SP().room.areas.find((a) => a.id === sel?.id);
  if (selArea) svg.appendChild(areaSVG(selArea));
  enterAnim = false;
  return svg;
}

/* ---------------- pointer: drag items, pan + pinch the view ---------------- */
function attachPointers(svg, { onTap, onMove, onDrop, onView }) {
  const pointers = new Map();
  let drag = null, pan = null, pinch = null;
  const pt = (x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const setView = (v) => { view = clampView(v); svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); svg.style.touchAction = isZoomed() ? 'none' : 'pan-y'; onView(); };
  svg.style.touchAction = isZoomed() ? 'none' : 'pan-y';

  svg.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { svg.setPointerCapture(e.pointerId); } catch { /* released already */ }
    if (pointers.size === 2) { // second finger: cancel any drag, start pinch
      if (drag) { drag.g.classList.remove('dragging'); Object.assign(drag.item, drag.start); drag.g.setAttribute('transform', `translate(${drag.start.x} ${drag.start.y})`); drag = null; }
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), v: { ...(view || baseView()) }, mid: pt((a.x + b.x) / 2, (a.y + b.y) / 2) };
      pan = null;
      return;
    }
    const grip = e.target.closest('[data-grip]');
    const rotKnob = e.target.closest('[data-rotate]');
    const g = e.target.closest('[data-kind]');
    if (!g) { pan = { x: e.clientX, y: e.clientY, v: { ...(view || baseView()) }, moved: false, pd: e.target.closest('.party-dot')?.dataset.pkey ?? null }; return; }
    const item = listFor(g.dataset.kind).find((x) => x.id === g.dataset.id);
    const p = pt(e.clientX, e.clientY);
    drag = { kind: g.dataset.kind, item, g, grip: !!grip, rotate: !!rotKnob, start: { x: item.x, y: item.y, w: item.w, h: item.h }, dx: p.x - item.x, dy: p.y - item.y, moved: false, t: performance.now() };
    e.preventDefault();
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const k = pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
      const w = pinch.v.w * k, h = pinch.v.h * k;
      setView({ x: pinch.mid.x - (pinch.mid.x - pinch.v.x) * k, y: pinch.mid.y - (pinch.mid.y - pinch.v.y) * k, w, h });
      return;
    }
    if (pan) {
      const ctm = svg.getScreenCTM();
      const dx = (e.clientX - pan.x) / ctm.a, dy = (e.clientY - pan.y) / ctm.d;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) pan.moved = true;
      if (isZoomed()) setView({ ...pan.v, x: pan.v.x - dx, y: pan.v.y - dy });
      return;
    }
    if (!drag) return;
    const p = pt(e.clientX, e.clientY);
    const snap = (v) => Math.round(v * 2) / 2;
    const { w, h } = SP().room;
    const it = drag.item;
    if (drag.rotate) { // spin around the item's center, snapping to 15 degrees
      const cx = drag.kind === 'area' ? it.x + it.w / 2 : it.x, cy = drag.kind === 'area' ? it.y + it.h / 2 : it.y;
      const deg = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      const snapped = ((Math.round(deg / ROT_STEP) * ROT_STEP) % 360 + 360) % 360;
      if (snapped !== (it.rot || 0)) { it.rot = snapped; drag.moved = true; onMove(true, drag); }
      return;
    }
    if (drag.grip) { // resize an area from its corner, measured in its own rotated frame
      const local = svg.createSVGPoint(); local.x = e.clientX; local.y = e.clientY;
      const lp = local.matrixTransform(drag.g.getScreenCTM().inverse());
      it.w = Math.max(2, Math.min(40, snap(lp.x)));
      it.h = Math.max(2, Math.min(40, snap(lp.y)));
      drag.moved = true;
      onMove(true, drag);
      return;
    }
    const area = drag.kind === 'area';
    const fpd = area ? null : footprint(it);
    const [x0, x1, y0, y1] = area ? [0, w - it.w, 0, h - it.h] : [fpd.hw, w - fpd.hw, fpd.hh, h - fpd.hh];
    const nx = Math.min(Math.max(snap(p.x - drag.dx), x0), x1);
    const ny = Math.min(Math.max(snap(p.y - drag.dy), y0), y1);
    if (nx === it.x && ny === it.y) return;
    if (!drag.moved) { drag.moved = true; drag.g.classList.add('dragging'); onMove(false); }
    it.x = nx; it.y = ny;
    drag.g.setAttribute('transform', area ? areaTransform(it) : `translate(${nx} ${ny})`);
  });

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    if (pan) { const tapped = !pan.moved, pd = pan.pd; pan = null; if (tapped) onTap(null, pd); return; }
    if (!drag) return;
    const d = drag; drag = null;
    d.g.classList.remove('dragging');
    d.moved ? onDrop(d) : onTap(d);
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  svg.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey && !isZoomed()) return; // let the page scroll
    e.preventDefault();
    const v = view || baseView();
    const k = Math.exp(e.deltaY * 0.0015);
    const p = pt(e.clientX, e.clientY);
    setView({ x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, w: v.w * k, h: v.h * k });
  }, { passive: false });
}

const isZoomed = () => view && view.w < baseView().w - 0.5;
function clampView(v) {
  const b = baseView();
  const k = Math.min(1, Math.max(0.25, v.w / b.w)); // between 4x zoom and fit
  const w = b.w * k, h = b.h * k;
  // zoomed in, the view may drift past the walls a little so any table can sit in the clear part beside its popover
  const mx = (b.w - w) * 1.1, my = (b.h - h) * 1.1;
  return { w, h, x: Math.min(Math.max(v.x, b.x - mx), b.x + b.w - w + mx), y: Math.min(Math.max(v.y, b.y - my), b.y + b.h - h + my) };
}

/* ---------------- popover ---------------- */
const stepBtns = (key, label, v, min = 0, max = 20) => `<div><button type="button" data-step="${key}" data-d="-1" ${v <= min ? 'disabled' : ''} aria-label="Less ${label}">−</button><b>${v}</b><button type="button" data-step="${key}" data-d="1" ${v >= max ? 'disabled' : ''} aria-label="More ${label}">+</button></div>`;
const stepper = (key, label, v, min = 0, max = 20) => `<div class="stepper"><span>${label}</span>${stepBtns(key, label, v, min, max)}</div>`;
const SIDES = ['Betel', 'Both', 'Carter'];
const rotateRow = (deg) => `
  <div class="stepper"><span>Rotate</span>
    <div><button type="button" data-turn="-${ROT_STEP}" aria-label="Rotate left">&#8634;</button><b>${deg}&deg;</b><button type="button" data-turn="${ROT_STEP}" aria-label="Rotate right">&#8635;</button></div>
  </div>`;
const wireTurn = (pop, item, refresh) => pop.querySelectorAll('[data-turn]').forEach((b) => b.onclick = () => {
  item.rot = (((item.rot || 0) + +b.dataset.turn) % 360 + 360) % 360; refresh();
});

function tablePop(t) {
  const here = guestsAt(t.id);
  const total = seatCount(t);
  const round = t.shape === 'round';
  const ctl = round ? '' : `<div class="pop-ctl compact">${stepper('top', 'Far side', t.sides.top)}${stepper('bottom', 'Near side', t.sides.bottom)}${stepper('left', 'Left end', t.sides.left, 0, 6)}${stepper('right', 'Right end', t.sides.right, 0, 6)}${rotateRow(t.rot || 0)}</div>`;
  return `
    <div class="pop-head">
      ${SP().tables.length > 1 ? '<button class="pop-nav" data-nav="-1" aria-label="Previous table">‹</button>' : ''}
      <label class="rename"><input class="pop-title" id="tName" value="${esc(t.name)}" aria-label="Table name" spellcheck="false" style="font-size:${t.name.length > 16 ? 15 : t.name.length > 11 ? 17 : 21}px"/><span aria-hidden="true">✎</span></label>
      ${SP().tables.length > 1 ? '<button class="pop-nav" data-nav="1" aria-label="Next table">›</button>' : ''}
      <button class="x" data-close aria-label="Close">×</button>
    </div>
    <div class="pop-top"><div class="pop-count"><span>${here.length} of ${total} seats</span>${round ? `<span class="stepper mini">${stepBtns('seats', 'Seats', t.seats, 1, 16)}</span>` : ''}</div>${ctl}</div>
    <ol class="seat-list seat-slots">${Array.from({ length: Math.max(total, here.length) }, (_, i) => {
      const g = here[i];
      return g
        ? `<li class="taken" style="--i:${i}"><i aria-label="Seat ${i + 1}">${i + 1}</i><span>${esc(g.name)}</span>${g.party === 'couple' ? '' : `<button class="side-tag" data-side="${g.id}" title="Change side">${esc(g.side)}</button>`}${g.party === 'couple' ? '' : `<button class="x" data-unseat="${g.id}" aria-label="Remove ${esc(g.name)}">×</button>`}</li>`
        : `<li class="empty" style="--i:${i}"><i aria-hidden="true">${i + 1}</i><button class="slot-add" data-slot="${i}" aria-label="Seat ${i + 1}: add a guest"><span>+</span></button></li>`;
    }).join('')}</ol>
    ${t.id === 'head' ? '' : '<button class="linklike danger" id="tDel">Remove table</button>'}`;
}

function areaPop(a) {
  return `
    <div class="pop-head">
      <label class="rename"><input class="pop-title" id="aName" value="${esc(a.label)}" aria-label="Area name" spellcheck="false" style="font-size:${a.label.length > 22 ? 14 : a.label.length > 15 ? 16 : 21}px"/><span aria-hidden="true">✎</span></label>
      <button class="x" data-close aria-label="Close">×</button>
    </div>
    <div class="pop-ctl">${stepper('w', 'Width', a.w, 2, 40)}${stepper('h', 'Length', a.h, 2, 40)}${rotateRow(a.rot || 0)}</div>
    <p class="hint">Drag the corner dot to resize, the top knob to rotate</p>
    <button class="linklike danger" id="aDel">Remove</button>`;
}

/** Ceremony row or cocktail high-top: name, size, turn, remove — no guest seating outside the reception. */
function itemPop(t) {
  const row = t.shape === 'row';
  return `
    <div class="pop-head">
      <label class="rename"><input class="pop-title" id="tName" value="${esc(t.name)}" aria-label="${row ? 'Row' : 'High-top'} name" spellcheck="false"/><span aria-hidden="true">✎</span></label>
      <button class="x" data-close aria-label="Close">×</button>
    </div>
    <div class="pop-ctl">${stepper('seats', row ? 'Chairs' : 'Stools', t.seats, 1, row ? 16 : 8)}${row ? rotateRow(t.rot || 0) : ''}</div>
    <button class="linklike danger" id="tDel">Remove</button>`;
}

/* ---------------- save / share the plan as a picture ---------------- */
const STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'paint-order', 'stroke-linejoin', 'letter-spacing'];
const EXPORT_FONT = { display: 'Georgia, serif', sans: 'Helvetica, Arial, sans-serif' };

async function toDataURL(src) {
  if (src.startsWith('data:')) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
}
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

async function planPicture(svg) {
  const clone = svg.cloneNode(true);
  const src = svg.querySelectorAll('*'), dst = clone.querySelectorAll('*');
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const fam = /Fraunces/.test(cs.fontFamily) ? EXPORT_FONT.display : EXPORT_FONT.sans;
    dst[i].setAttribute('style', STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';') + `;font-family:${fam};animation:none`);
  });
  await Promise.all([...clone.querySelectorAll('image')].map(async (im) => im.setAttribute('href', await toDataURL(im.getAttribute('href')))));
  const b = baseView();
  clone.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
  const W = 1500, H = Math.round(W * b.h / b.w);
  clone.setAttribute('width', W); clone.setAttribute('height', H);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  const img = await loadImg(url);
  URL.revokeObjectURL(url);
  return { img, W, H };
}

/** Plan + inspo strip + names, as one PNG. Shared via the phone share sheet when possible. */
async function sharePicture(source) {
  const mood = moodNow();
  const pad = 70, stripH = 210, titleH = 120;
  let plan;
  if (source.kind === 'svg') plan = await planPicture(source.el);
  else { const img = await loadImg(source.el.toDataURL('image/png')); plan = { img, W: 1500, H: Math.round(1500 * img.height / img.width) }; }
  const inspo = await Promise.all(state.inspo.slice(0, 8).map((p) => loadImg(p.src).catch(() => null)));
  const c = document.createElement('canvas');
  c.width = plan.W + pad * 2; c.height = titleH + plan.H + stripH + pad * 1.5;
  const x = c.getContext('2d');
  x.fillStyle = '#f7f3ea'; x.fillRect(0, 0, c.width, c.height);
  await document.fonts.ready;
  x.fillStyle = mood.swatches[0] === '#f7f3ea' ? '#2f3823' : mood.swatches[0];
  x.font = '400 64px Fraunces, Georgia, serif'; x.textBaseline = 'alphabetic';
  x.fillText('Betel & Carter', pad, 92);
  x.font = '500 26px "DM Sans", Helvetica, sans-serif'; x.fillStyle = '#6e705f';
  const sub = 'June 17, 2027 · Morais Vineyards';
  x.fillText(sub, c.width - pad - x.measureText(sub).width, 92);
  x.drawImage(plan.img, pad, titleH, plan.W, plan.H);
  // inspo strip
  const shots = inspo.filter(Boolean);
  const gap = 14, sw = (plan.W - gap * (shots.length - 1)) / Math.max(1, shots.length), sy = titleH + plan.H + 40, sh = stripH - 30;
  shots.forEach((im, i) => {
    const sx = pad + i * (sw + gap);
    const k = Math.max(sw / im.width, sh / im.height);
    const cw = sw / k, ch = sh / k;
    x.save(); x.beginPath(); x.roundRect(sx, sy, sw, sh, 14); x.clip();
    x.drawImage(im, (im.width - cw) / 2, (im.height - ch) / 2, cw, ch, sx, sy, sw, sh);
    x.restore();
  });
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  const file = new File([blob], 'griffin-reception.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Our reception' }); return 'shared'; }
    catch (err) { if (err?.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return 'saved';
}

/* ---------------- images (inspo strip uploads) ---------------- */
function readImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 520 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve({ src: c.toDataURL('image/jpeg', 0.8), ratio: img.width / img.height });
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}

/* ---------------- page ---------------- */
export function renderSeating(root) {
  const rec = space === 'reception';
  if (!rec) mode = 'plan'; // 3D is the ballroom only (for now)
  const info = spaceInfo();
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="sr-only">${esc(info.label)}</h1>
        <div class="spaces" role="tablist" aria-label="Spaces">
          ${tabList().map((x) => `<button role="tab" data-space="${x.id}" aria-selected="${x.id === space}" class="${x.id === space ? 'on' : ''}">${x.label}</button>`).join('')}
          <span class="spaces-ink" aria-hidden="true"></span>
        </div>
        <p class="lede" id="lede"></p>
        ${space === 'cocktail' ? '<p class="space-note">Optional · just for mingling</p>' : ''}
      </div>
      ${rec ? `<div class="viewseg" role="tablist" aria-label="View">
        <button role="tab" data-mode="plan" aria-selected="${mode === 'plan'}" class="${mode === 'plan' ? 'on' : ''}">Floor plan</button>
        <button role="tab" data-mode="3d" aria-selected="${mode === '3d'}" class="${mode === '3d' ? 'on' : ''}">3D</button>
      </div>` : ''}
    </div>
    <div class="seat-layout${mode === 'plan' ? ' is-plan' : ''}">
      <div class="plan-col">
        <div class="card plan-card">
          <div class="plan-tools">
            ${mode === 'plan' ? `
              ${info.add === 'row' ? '<button class="tool" data-add="row">Row</button>'
                : info.add === 'high' ? '<button class="tool" data-add="high">High-top</button>'
                : '<button class="tool" data-add="round">Round</button><button class="tool" data-add="rect">Rectangle</button>'}
              <span class="tool-wrap"><button class="tool" id="areaBtn" aria-expanded="false">Area</button>
                <div class="chipmenu" id="areaMenu" hidden>${Object.entries(AREA_PRESETS).filter(([k]) => info.areas.includes(k)).filter(([k]) => !['dance', 'altar', 'aisle'].includes(k) || !SP().room.areas.some((a) => a.preset === k)).map(([k, p]) => `<button data-preset="${k}">${k === 'custom' ? '+ Custom' : esc(p.label)}</button>`).join('')}</div>
              </span>
              ${rec ? `<button class="tool${showPhotos ? ' on' : ''}" id="photosBtn" aria-pressed="${showPhotos}">Photos</button>` : ''}
              <span class="spacer"></span>
              <span class="zoom"><button class="tool icon" id="zOut" aria-label="Zoom out">−</button><button class="tool icon" id="zIn" aria-label="Zoom in">+</button><button class="tool" id="zFit">Fit</button></span>`
            : `<button class="tool" id="evening">Experience the evening</button>
               <button class="tool" id="walk" aria-pressed="false">Walk</button>
               <button class="tool" id="light">Candlelight</button>
               <span class="spacer"></span>
               <span class="tool-hint">Tap a chair to seat someone</span>`}
            <button class="btn moss sm" id="share">Share</button>
          </div>
          <div class="stage-wrap" id="stageWrap">
            <div id="planHost"></div>
            <div class="pop" id="pop" role="dialog" aria-label="Details" hidden></div>
          </div>
        </div>
      </div>
      <aside class="side-panel">
        ${rec ? `<section class="card">
          <h3>Plan tools</h3>
          <div class="field-row">
            <label class="field">Guests<input class="input" id="sCount" type="number" min="2" max="300" value="${state.guestTarget}"/></label>
            <label class="field">Tables<select class="select" id="sStyle">${Object.entries(TABLE_STYLES).map(([k, s]) => `<option value="${k}" ${state.lastStyle === k ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label>
          </div>
          <p class="muted small" id="sPreview"></p>
          <div class="acts">
            <div class="act"><button class="btn moss sm" id="sGo">Suggest floor plan</button><span class="tip" tabindex="0" role="note" data-tip="Lays out tables for this guest count and style. Moves tables, then seats guests.">ⓘ</span></div>
            <div class="act"><button class="btn gold sm" id="sSeat">Auto-seat guests</button><span class="tip" tabindex="0" role="note" data-tip="Seats guests at the current tables, keeping linked and related people together.">ⓘ</span></div>
          </div>
        </section>` : spaceToolsHTML(space, { state, SP, pool: partyPool })}
        ${refHTML()}
      </aside>
      <div class="plan-file"><span>Plan file</span><button class="linkbtn" id="exportBtn">Export</button><button class="linkbtn" id="importBtn">Import</button><input type="file" id="importFile" accept="application/json" hidden/></div>
    </div>`;

  const host = root.querySelector('#planHost');
  const pop = root.querySelector('#pop');
  const wrap = root.querySelector('#stageWrap');
  root.querySelector('#lede').textContent = spaceLede();

  document.querySelectorAll('.pop-backdrop').forEach((b) => b.remove());
  const backdrop = document.createElement('div');
  backdrop.className = 'pop-backdrop';
  backdrop.onclick = () => closePop();
  document.body.append(backdrop);
  let popPinned = null;

  cleanup?.abort();
  cleanup = new AbortController();
  const { signal } = cleanup;
  threeInst?.dispose(); threeInst = null;
  let three = null;
  wireMorais(root, signal);

  /* ---- spaces: ceremony · cocktail · reception ---- */
  const tabs = root.querySelector('.spaces'), ink = tabs.querySelector('.spaces-ink');
  const moveInk = (b) => { ink.style.setProperty('--x', b.offsetLeft + 'px'); ink.style.setProperty('--w', b.offsetWidth + 'px'); };
  if (inkFrom) { // glide the underline from the tab that was just left
    ink.style.transition = 'none'; ink.style.setProperty('--x', inkFrom.x + 'px'); ink.style.setProperty('--w', inkFrom.w + 'px');
    void ink.offsetWidth; ink.style.transition = ''; inkFrom = null;
  }
  moveInk(tabs.querySelector('.on'));
  document.fonts?.ready.then(() => tabs.isConnected && moveInk(tabs.querySelector('.on')));
  tabs.querySelectorAll('[data-space]').forEach((b) => b.onclick = () => {
    if (b.dataset.space === space) return;
    space = b.dataset.space; sel = null; view = null; enterAnim = true; lastFilled.clear();
    const was = tabs.querySelector('.on');
    inkFrom = { x: was.offsetLeft, w: was.offsetWidth };
    renderSeating(root);
  });

  /* ---- view mode ---- */
  root.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { if (mode !== b.dataset.mode) { mode = b.dataset.mode; sel = null; renderSeating(root); } });

  /* ---- 2D plan ---- */
  let bg = null;
  const drawPlan = () => {
    if (mode !== 'plan') return;
    host.replaceChildren(planSVG(bg));
    // tables that moved glide from where they were
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) host.querySelectorAll('.tbl[data-fromx]').forEach((g) => {
      const [nx, ny] = g.getAttribute('transform').match(/-?[\d.]+/g);
      g.animate([{ transform: `translate(${g.dataset.fromx}px, ${g.dataset.fromy}px)` }, { transform: `translate(${nx}px, ${ny}px)` }], { duration: 560, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    attachPointers(host.firstChild, {
      onTap: (d, pd) => {
        if (pd != null && !d) { partySel = partySel === pd ? null : pd; sel = null; if (!pop.hidden) closePop(); drawPlan(); markChips(); return; } // a party dot: just highlight it
        partySel = null; sel = d ? { kind: d.kind, id: d.item.id } : null; drawPlan(); openPop(); markChips(); if (d?.kind === 'table') zoomToTable(d.item);
      },
      // Rotating / resizing: redraw just that item so the drag keeps going smoothly
      onMove: (live, d) => {
        if (!live) return closePop(true);
        const fresh = d.kind === 'area' ? areaSVG(d.item) : tableSVG(d.item, moodNow(), 0);
        d.g.innerHTML = fresh.innerHTML;
        d.g.setAttribute('transform', fresh.getAttribute('transform'));
      },
      onDrop: (d) => {
        if (d.kind === 'table' && !d.grip && !d.rotate && collides(d.item)) {
          Object.assign(d.item, { x: d.start.x, y: d.start.y });
          d.g.classList.add('settle-back');
          d.g.setAttribute('transform', `translate(${d.item.x} ${d.item.y})`);
          toast('Needs a little more room there');
          setTimeout(drawPlan, 320);
          return;
        }
        commit({ silent: true });
        if (d.grip || d.rotate) { drawPlan(); openPop(); }
      },
      onView: () => { if (popPinned) popPinned.view = true; if (!pop.hidden) placePop(); },
    });
  };

  // Click a table: glide in on it (remembering where we were); closing glides back out
  let zoomTo = () => {}, zoomBack = null;
  function zoomToTable(t, locked = false) {
    navLock = locked ? t.id : null;
    if (!zoomBack) zoomBack = { ...(view || baseView()) };
    const b = baseView(), phone = matchMedia('(max-width: 760px)').matches;
    // The popover sits beside the table: zoom just far enough that both fit side by side, with the table centred in the free part
    const cr = wrap.getBoundingClientRect(), svg = host.querySelector('svg'), sr = svg ? svg.getBoundingClientRect() : cr;
    const W = cr.width || 600, pw = phone ? 0 : (pop.offsetWidth || 300) + 24;
    // the drawing is letterboxed inside the svg element: work in the drawn area so the table really lands where intended
    const Weff = Math.min(sr.width, (sr.height * b.w) / b.h), Heff = (Weff * b.h) / b.w;
    let free = Math.max(120, W - pw), cx = free / 2; // screen x (px in the card) to centre the table on
    const fp = footprint(t), onLeftHalf = t.x < b.x + b.w / 2; // table in the left half: popover to its right, else to its left
    if (!onLeftHalf) cx = W - free / 2;
    if (locked && !phone) { // popover already open and pinned (stepping): centre in whatever it leaves clear, on its far side
      const pl = parseFloat(pop.style.left) || 0, pr = pl + pop.offsetWidth, onLeft = pl + pop.offsetWidth / 2 < W / 2;
      free = Math.max(120, onLeft ? W - pr - 12 : pl - 12);
      cx = onLeft ? (pr + 12 + W) / 2 : (pl - 12) / 2;
    }
    if (phone) cx = W / 2;
    const cy = phone ? cr.height * 0.3 : cr.height / 2;
    const w = Math.min(b.w * 0.8, Math.max(b.w * 0.42, (fp.hw * 2.05 * Weff) / free)), h = w * (b.h / b.w);
    const fx = (cx - (sr.left - cr.left) - (sr.width - Weff) / 2) / Weff, fy = (cy - (sr.top - cr.top) - (sr.height - Heff) / 2) / Heff;
    zoomTo({ x: t.x - w * fx, y: t.y - h * fy, w, h });
  }
  function zoomOut() { if (!zoomBack) return; const v = zoomBack; zoomBack = null; zoomTo(v); }

  // Would this table sit on the stage, a door path, an area or another table?
  function collides(t) {
    const fp = footprint(t);
    const others = SP().tables.filter((o) => o.id !== t.id);
    const me = { x1: t.x - fp.hw, x2: t.x + fp.hw, y1: t.y - fp.hh, y2: t.y + fp.hh };
    return blockers(SP().room, others, { areaPad: 0.5 }).some((z) => me.x1 < z.x2 && me.x2 > z.x1 && me.y1 < z.y2 && me.y2 > z.y1);
  }

  let navLock = null; // stepping with ‹ ›: the popover stays exactly where it is while the plan glides underneath
  function placePop() {
    if (navLock && navLock === sel?.id && popPinned) return;
    const g = host.querySelector(`[data-id="${CSS.escape(sel.id)}"]`);
    if (!g) return;
    const r = g.getBoundingClientRect(), c = wrap.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 12;
    const onRight = r.right - c.left + gap, onLeft = r.left - c.left - pw - gap;
    let left = onRight + pw <= c.width - 8 ? onRight : onLeft >= 8 ? onLeft : (c.width - (r.right - c.left) > r.left - c.left ? onRight : onLeft);
    left = Math.max(8, Math.min(left, c.width - pw - 8));
    let top = r.top - c.top + r.height / 2 - ph / 2;
    if (popPinned?.id === sel.id && !popPinned.view) { left = popPinned.left; top = popPinned.top; }
    top = Math.max(8, Math.min(top, c.height - ph - 8));
    popPinned = { id: sel.id, left, top };
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }
  function openPop() {
    const item = findItem(sel);
    if (!item) return closePop();
    pop.innerHTML = sel.kind === 'area' ? areaPop(item) : rec ? tablePop(item) : itemPop(item);
    pop.hidden = false;
    backdrop.classList.add('on');
    if (popPinned?.id !== sel.id) { pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in'); }
    placePop();
    sel.kind === 'area' ? wireArea(item) : rec ? wireTable(item) : wireItem(item);
    // Phones: the sheet covers the bottom of the screen, so bring the item up into view
    if (matchMedia('(max-width: 760px)').matches) {
      const g = host.querySelector(`[data-id="${CSS.escape(sel.id)}"]`);
      if (g) { const r = g.getBoundingClientRect(); const target = innerHeight * 0.3; if (r.top > innerHeight * 0.55 || r.bottom < 80) scrollBy({ top: r.top - target, behavior: 'smooth' }); }
    }
  }
  function closePop(keepSel) {
    pop.hidden = true;
    navLock = null;
    popPinned = null;
    backdrop.classList.remove('on');
    if (!keepSel) zoomOut();
    if (!keepSel && sel) { sel = null; drawPlan(); }
  }
  const markChips = () => root.querySelectorAll('.pchip[data-id]').forEach((c) => c.classList.toggle('sel', c.dataset.id === partySel));
  // Change the plan without redrawing the page: tables glide to their new spots, Undo puts everything back the same way
  const tablePos = () => new Map(SP().tables.map((t) => [t.id, { x: t.x, y: t.y }]));
  function resync(from) {
    if (!host.isConnected) { commit(); return; } // left the page meanwhile: let the router draw it
    commit({ silent: true });
    sel = null; if (!pop.hidden) closePop(true);
    flip = from; drawPlan(); flip = null; lede();
    root.querySelectorAll('#sCount,#cCount,#hCount').forEach((i) => { i.value = state.guestTarget; });
    preview();
  }
  function localUndo(message, mutate) {
    const snap = JSON.stringify(state), from = tablePos();
    mutate();
    resync(from);
    toast(message, { undo: () => {
      const now = host.isConnected ? tablePos() : null;
      Object.keys(state).forEach((k) => delete state[k]); Object.assign(state, JSON.parse(snap));
      resync(now);
    } });
  }
  const refresh = () => { commit({ silent: true }); drawPlan(); openPop(); lede(); };
  const lede = () => { root.querySelector('#lede').textContent = spaceLede(); };

  function wireRename(input, get, set) {
    const fallback = get();
    input.oninput = () => { if (input.value.trim()) { set(input.value.trim()); commit({ silent: true }); drawPlan(); } };
    input.onblur = () => { if (!input.value.trim()) { set(fallback); input.value = fallback; commit({ silent: true }); drawPlan(); } };
    input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
  }

  function wireTable(t) {
    wireRename(pop.querySelector('#tName'), () => t.name, (v) => { t.name = v; });
    // long names (e.g. the sweetheart table) step the type down until they fit
    const tName = pop.querySelector('#tName');
    const fitTitle = () => { let fs = 21; tName.style.fontSize = fs + 'px'; while (tName.scrollWidth > tName.clientWidth + 1 && fs > 13) tName.style.fontSize = --fs + 'px'; };
    fitTitle(); tName.addEventListener('input', fitTitle);
    pop.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
      const d = +b.dataset.d, k = b.dataset.step;
      if (k === 'seats') t.seats = Math.max(1, Math.min(16, t.seats + d));
      else t.sides[k] = Math.max(0, t.sides[k] + d);
      if (seatCount(t) < 1) { t.sides[k] -= d; return; }
      const here = guestsAt(t.id);
      if (here.length > seatCount(t)) { const g = here.at(-1); g.tableId = null; toast(`${g.name} moved to unseated`); }
      refresh();
    });
    wireTurn(pop, t, refresh);
    pop.querySelectorAll('[data-unseat]').forEach((b) => b.onclick = () => { state.guests.find((g) => g.id === b.dataset.unseat).tableId = null; refresh(); });
    pop.querySelectorAll('[data-side]').forEach((b) => b.onclick = () => {
      const g = state.guests.find((x) => x.id === b.dataset.side);
      g.side = SIDES[(SIDES.indexOf(g.side) + 1) % SIDES.length];
      refresh();
    });
    // Empty seat: tap the + to type a name right in that slot; Enter seats them and opens the next slot
    const openSlot = (b) => {
      const li = b.closest('li');
      li.classList.add('typing');
      b.outerHTML = '<form class="add-seat slot-form" id="addSeat"><input class="input" name="name" placeholder="Name" autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-label="Guest name"/></form>';
      const form = li.querySelector('form'), input = form.name;
      input.focus();
      // Custom suggestions, anchored right under the field (fixed to the page so the popover's scroll never clips it)
      let list = null, items = [], at = -1;
      const hide = () => { list?.remove(); list = null; items = []; at = -1; input.setAttribute('aria-expanded', 'false'); };
      const pick = (g) => { input.value = g.name; hide(); form.requestSubmit(); };
      const mark = () => list?.querySelectorAll('li').forEach((el, i) => { el.classList.toggle('on', i === at); if (i === at) el.scrollIntoView({ block: 'nearest' }); });
      const show = () => {
        const q = input.value.trim().toLowerCase();
        items = going().filter((g) => !g.tableId && (!q || g.name.toLowerCase().includes(q)))
          .sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name)).slice(0, 30);
        at = -1;
        if (!items.length) return hide();
        if (!list) { list = document.createElement('ul'); list.className = 'suggest'; list.setAttribute('role', 'listbox'); document.body.append(list); }
        list.innerHTML = items.map((g, i) => `<li role="option" data-i="${i}"><span>${esc(g.name)}</span><em>${esc([g.side, relationOf(g)].filter((x) => x && x !== 'none').join(' · '))}</em></li>`).join('');
        const r = li.getBoundingClientRect();
        Object.assign(list.style, { left: r.left + 'px', top: r.bottom + 2 + 'px', width: r.width + 'px' });
        list.onpointerdown = (e) => { e.preventDefault(); const o = e.target.closest('li'); if (o) pick(items[+o.dataset.i]); };
        list.onpointermove = (e) => { const o = e.target.closest('li'); if (o && +o.dataset.i !== at) { at = +o.dataset.i; mark(); } };
        input.setAttribute('aria-expanded', 'true');
      };
      input.oninput = show; input.onfocus = show;
      input.onkeydown = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); if (list) return hide(); input.onblur = null; openPop(); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!list) show(); if (list) { at = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; mark(); } }
        else if (e.key === 'Enter' && list && at >= 0) { e.preventDefault(); pick(items[at]); }
      };
      input.onblur = () => { hide(); setTimeout(() => { if (!input.value.trim() && pop.contains(input) && document.activeElement !== input) openPop(); }, 150); };
      show();
      form.onsubmit = (e) => {
        e.preventDefault(); hide();
        const n = input.value.trim();
        if (!n) return;
        if (guestsAt(t.id).length >= seatCount(t)) return toast('Table is full');
        let g = going().find((x) => !x.tableId && x.name.toLowerCase() === n.toLowerCase());
        if (!g) { g = { id: uid(), name: n, side: 'Both', rsvp: 'Not invited yet', diet: '', tableId: null }; state.guests.push(g); toast(`${n} added to guests`); }
        g.tableId = t.id; input.onblur = null; refresh();
        const next = pop.querySelector('.slot-add');
        if (next) next.click();
      };
    };
    pop.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => openSlot(b));
    // ‹ › step through the tables; the popover glides over to the next one
    pop.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => {
      const order = [...SP().tables].sort((x, y) => (x.id === 'head' ? -1 : y.id === 'head' ? 1 : (x.o ?? 0) - (y.o ?? 0)));
      const i = order.findIndex((x) => x.id === t.id);
      const next = order[(i + +b.dataset.nav + order.length) % order.length];
      // the popover stays put (arrows don't jump under the cursor); only its content slides to the next table
      const keep = { left: parseFloat(pop.style.left) || 0, top: parseFloat(pop.style.top) || 0 };
      sel = { kind: 'table', id: next.id };
      popPinned = { id: next.id, ...keep };
      drawPlan(); openPop(); zoomToTable(next, true);
      pop.style.setProperty('--swap-x', +b.dataset.nav > 0 ? '10px' : '-10px');
      pop.classList.remove('in', 'swap'); void pop.offsetWidth; pop.classList.add('swap');
      clearTimeout(pop._glide); pop._glide = setTimeout(() => pop.classList.remove('swap'), 420);
      pop.querySelector(`[data-nav="${b.dataset.nav}"]`)?.focus({ preventScroll: true });
    });
    const del = pop.querySelector('#tDel');
    if (del) del.onclick = () => {
      sel = null; closePop();
      leave(host.querySelector(`.tbl[data-id="${CSS.escape(t.id)}"]`), () => localUndo(`${/^\d+$/.test(t.name) ? 'Table ' + t.name : t.name} removed`, () => {
        state.guests.forEach((g) => { if (g.tableId === t.id) g.tableId = null; });
        SP().tables = SP().tables.filter((x) => x.id !== t.id);
      }));
    };
    pop.querySelector('[data-close]').onclick = () => closePop();
  }

  function wireItem(t) {
    wireRename(pop.querySelector('#tName'), () => t.name, (v) => { t.name = v; });
    pop.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
      t.seats = Math.max(1, Math.min(t.shape === 'row' ? 16 : 8, t.seats + +b.dataset.d));
      refresh();
    });
    wireTurn(pop, t, refresh);
    pop.querySelector('#tDel').onclick = () => {
      sel = null; closePop();
      leave(host.querySelector(`.tbl[data-id="${CSS.escape(t.id)}"]`), () => localUndo(`${t.shape === 'row' ? 'Row' : 'High-top'} ${t.name} removed`, () => { SP().tables = SP().tables.filter((x) => x.id !== t.id); }));
    };
    pop.querySelector('[data-close]').onclick = () => closePop();
  }

  function wireArea(a) {
    wireRename(pop.querySelector('#aName'), () => a.label, (v) => { a.label = v; });
    pop.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
      const k = b.dataset.step, max = k === 'w' ? SP().room.w - a.x : SP().room.h - a.y;
      a[k] = Math.max(2, Math.min(max, a[k] + +b.dataset.d));
      refresh();
    });
    wireTurn(pop, a, refresh);
    pop.querySelector('#aDel').onclick = () => {
      sel = null; closePop();
      leave(host.querySelector(`.area[data-id="${CSS.escape(a.id)}"]`), () => localUndo(`${a.label} removed`, () => { SP().room.areas = SP().room.areas.filter((x) => x.id !== a.id); }));
    };
    pop.querySelector('[data-close]').onclick = () => closePop();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) closePop();
    // Delete / Backspace removes the selected table, row or area while its popover is open
    if ((e.key === 'Delete' || e.key === 'Backspace') && !pop.hidden && !e.target.closest?.('input, textarea, select, [contenteditable]')) { e.preventDefault(); pop.querySelector('#tDel, #aDel')?.click(); }
  }, { signal });
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !wrap.contains(e.target) && !pop.contains(e.target)) closePop();
    const menu = root.querySelector('#areaMenu');
    if (menu && !menu.hidden && !e.target.closest('.tool-wrap')) { menu.hidden = true; root.querySelector('#areaBtn').setAttribute('aria-expanded', 'false'); }
  }, { signal });
  window.addEventListener('hashchange', () => { sel = null; cleanup?.abort(); backdrop.remove(); three?.dispose(); }, { signal, once: true });

  /* ---- toolbar ---- */
  if (mode === 'plan') {
    // Glide the view (viewBox can't be CSS-animated, so tween it)
    let tweenId = 0;
    const tweenTo = (target) => {
      if (!host.querySelector('svg')) return;
      const from = { ...(view || baseView()) }, to = clampView(target), t0 = performance.now(), id = ++tweenId;
      const step = (now) => {
        const svg = host.querySelector('svg'); if (!svg || id !== tweenId) return;
        const k = Math.min(1, (now - t0) / 320), e = 1 - Math.pow(1 - k, 3);
        view = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e };
        svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
        svg.style.touchAction = isZoomed() ? 'none' : 'pan-y';
        if (popPinned) popPinned.view = true;
        if (!pop.hidden) placePop();
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    zoomTo = tweenTo;
    const zoomBy = (k) => {
      const v = view || baseView();
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      tweenTo({ x: cx - (v.w * k) / 2, y: cy - (v.h * k) / 2, w: v.w * k, h: v.h * k });
    };
    root.querySelector('#zIn').onclick = () => { zoomBack = null; zoomBy(0.7); };
    root.querySelector('#zOut').onclick = () => { zoomBack = null; zoomBy(1 / 0.7); };
    root.querySelector('#zFit').onclick = () => { zoomBack = null; tweenTo(baseView()); };
    const photosBtn = root.querySelector('#photosBtn');
    if (photosBtn) photosBtn.onclick = () => { showPhotos = !showPhotos; photosBtn.classList.toggle('on', showPhotos); photosBtn.setAttribute('aria-pressed', String(showPhotos)); drawPlan(); };

    root.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => {
      const kind = b.dataset.add;
      const n = SP().tables.filter((t) => t.id !== 'head').length + 1;
      const t = { id: uid(), name: String(n), rot: 0, o: Date.now(),
        ...(kind === 'round' ? { shape: 'round', seats: 8 }
          : kind === 'row' ? { shape: 'row', seats: 5 }
          : kind === 'high' ? { shape: 'round', seats: 4, high: true }
          : { shape: 'rect', sides: { top: 4, bottom: 4, left: 1, right: 1 } }) };
      Object.assign(t, findFreeSpot(SP().room, SP().tables, t));
      SP().tables.push(t); sel = { kind: 'table', id: t.id };
      commit({ silent: true }); drawPlan(); openPop(); lede();
      pop.querySelector('#tName')?.select();
    });

    const areaBtn = root.querySelector('#areaBtn'), menu = root.querySelector('#areaMenu');
    areaBtn.onclick = () => { menu.hidden = !menu.hidden; areaBtn.setAttribute('aria-expanded', String(!menu.hidden)); };
    menu.querySelectorAll('[data-preset]').forEach((b) => b.onclick = () => {
      const p = AREA_PRESETS[b.dataset.preset];
      const a = { id: uid(), preset: b.dataset.preset, label: p.label, w: p.w, h: p.h, x: 0, y: 0 };
      const spot = findFreeSpot(SP().room, SP().tables, { box: { hw: a.w / 2 + 1, hh: a.h / 2 + 1 } });
      a.x = Math.max(0, Math.min(SP().room.w - a.w, Math.round(spot.x - a.w / 2)));
      a.y = Math.max(0, Math.min(SP().room.h - a.h, Math.round(spot.y - a.h / 2)));
      SP().room.areas.push(a); sel = { kind: 'area', id: a.id };
      menu.hidden = true;
      commit({ silent: true }); drawPlan(); openPop();
      if (b.dataset.preset === 'custom') pop.querySelector('#aName')?.select();
    });
  } else {
    // 3D view (loaded on demand)
    import('./three-view.js').then(async (m) => {
      if (mode !== '3d' || !host.isConnected) return;
      three = threeInst = await m.mount(host, state, moodNow(), {
        unseated: () => going().filter((g) => !g.tableId),
        // Seat someone from the 3D view (an existing unseated guest, or a new name)
        onSeat: (tableId, name) => {
          const t = SP().tables.find((x) => x.id === tableId);
          if (!t || guestsAt(tableId).length >= seatCount(t)) { toast('Table is full'); return false; }
          let g = going().find((x) => !x.tableId && x.name.toLowerCase() === name.toLowerCase());
          if (!g) { g = { id: uid(), name, side: 'Both', rsvp: 'Not invited yet', diet: '', tableId: null }; state.guests.push(g); }
          g.tableId = tableId;
          commit({ silent: true }); lede();
          toast(`${g.name} · ${tableId === 'head' ? t.name : 'Table ' + t.name}`);
          return true;
        },
      });
      if (mode !== '3d' || !host.isConnected) { three.dispose(); threeInst = null; return; }
      const walk = root.querySelector('#walk');
      walk.onclick = () => { const on = three.walk(); walk.setAttribute('aria-pressed', String(on)); walk.classList.toggle('on', on); walk.textContent = on ? 'Exit walk' : 'Walk'; };
      const light = root.querySelector('#light');
      light.onclick = () => { const evening = three.toggleLight(); light.textContent = evening ? 'Afternoon' : 'Candlelight'; };
      root.querySelector('#evening').onclick = () => { three.experience(); light.textContent = 'Afternoon'; const w = root.querySelector('#walk'); w.textContent = 'Walk'; w.classList.remove('on'); };
    }).catch((err) => { console.error(err); host.innerHTML = '<p class="muted" style="padding:24px">3D view needs an internet connection.</p>'; });
  }

  root.querySelector('#share').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = '…';
    const prevSel = sel; sel = null; closePop(true);
    try {
      let source;
      if (mode === '3d' && three) source = { kind: 'canvas', el: three.snapshot() };
      else { drawPlan(); source = { kind: 'svg', el: host.querySelector('svg') }; }
      const r = await sharePicture(source);
      if (r === 'saved') toast('Picture saved');
    } catch (err) { console.error(err); toast('Could not make the picture'); }
    sel = prevSel; drawPlan();
    btn.disabled = false; btn.textContent = 'Share';
  };

  /* ---- reference panel: inspiration photos (add / remove) + the venue photos ---- */
  const inspoGrid = root.querySelector('#inspoGrid'), venueGrid = root.querySelector('.morais-grid');
  const wireInspo = () => {
    inspoGrid.innerHTML = inspoTiles();
    const fileIn = root.querySelector('#pinFile');
    root.querySelector('#addPin').onclick = () => fileIn.click();
    inspoGrid.querySelectorAll('[data-unpin]').forEach((b) => b.onclick = () => {
      leave(b.closest('.ref-tile'), () => localUndo('Photo removed', () => { state.inspo = state.inspo.filter((p) => p.id !== b.dataset.unpin); }));
    });
  };
  root.querySelector('#pinFile').onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const f of files) {
      try { state.inspo.push({ id: uid(), ...(await readImage(f)), caption: '' }); } catch (err) { toast(err.message); }
    }
    commit({ silent: true }); wireInspo();
  };
  root.querySelectorAll('[data-ref]').forEach((b) => b.onclick = () => {
    refTab = b.dataset.ref;
    root.querySelectorAll('[data-ref]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
    inspoGrid.hidden = refTab !== 'inspo'; venueGrid.hidden = refTab !== 'venue';
  });
  wireInspo();

  /* ---- suggest (reception only) ---- */
  let preview = () => {};
  if (rec) {
  const count = root.querySelector('#sCount'), style = root.querySelector('#sStyle'), prev = root.querySelector('#sPreview');
  const plan = () => {
    const n = Math.max(2, +count.value || 2);
    const head = SP().tables.find((t) => t.id === 'head') || headTable();
    const room = structuredClone(SP().room);
    // Family rows run the long way, so the dance floor moves toward the lounge end
    const dance = room.areas.find((a) => a.preset === 'dance');
    if (style.value === 'family' && dance) { dance.x = (room.w - dance.w) / 2; dance.y = room.h - (room.fixed.balcony?.depth || 0) - 10 - dance.h - 1; }
    if (style.value !== 'family' && !['open', 'stage', 'banquet', 'headlong'].includes(style.value) && dance) { dance.x = (room.w - dance.w) / 2; dance.y = 13; }
    return { n, head, room, s: suggestTables(room, n, style.value, head) };
  };
  preview = () => { const { s } = plan(); prev.innerHTML = `${s.needed} tables + sweetheart${s.fits ? '' : ` · <b style="color:var(--wine)">only ${s.tables.length} fit</b>`}`; };
  count.oninput = preview; style.onchange = preview;
  root.querySelector('#sGo').onclick = () => {
    const { n, head, room, s } = plan();
    closePop();
    localUndo(s.fits ? `${s.tables.length} tables laid out` : `Only ${s.tables.length} of ${s.needed} tables fit`, () => {
      state.guestTarget = n; state.lastStyle = style.value;
      SP().room.areas = room.areas;
      SP().tables = [s.head || head, ...s.tables];
      state.guests.forEach((g) => { if (g.party !== 'couple') g.tableId = null; });
      autoSeat(state.guests, SP().tables, { links: state.links || [] });
    });
  };
  root.querySelector('#sSeat').onclick = () => {
    const r = autoSeat(state.guests, SP().tables, { links: state.links || [] });
    commit({ silent: true }); drawPlan(); lede();
    toast(r.seated || r.left ? `${r.seated} seated${r.left ? ` · ${r.left} need a seat` : ''}` : 'Everyone has a seat');
  };

  }

  if (!rec) wireSpaceTools(root, space, { state, SP, commit, toast, pool: partyPool, draw: () => drawPlan(), lede: () => lede(),
    undoable: (msg, fn) => localUndo(msg, fn), animate: () => { closePop(); view = null; zoomBack = null; },
    selectParty: (key) => { partySel = partySel === key ? null : key; drawPlan(); markChips(); }, partySel: () => partySel });

  /* ---- plan file ---- */
  root.querySelector('#exportBtn').onclick = () => { exportJSON(); toast('Plan file downloaded'); };
  const imp = root.querySelector('#importFile');
  root.querySelector('#importBtn').onclick = () => imp.click();
  imp.onchange = async () => {
    const f = imp.files[0];
    if (!f) return;
    const snap = JSON.stringify(state);
    try {
      await importJSON(f);
      toast('Plan loaded', { undo: () => { const s = JSON.parse(snap); Object.keys(state).forEach((k) => delete state[k]); Object.assign(state, s); commit(); } });
    } catch (err) { toast(err.message); }
  };

  preview();
  // Draw once this space's photo is ready (cached after the first visit)
  if (mode === 'plan') spacePhoto(space).then((d) => { bg = d; drawPlan(); });
}
let threeInst = null; // live 3D scene, disposed on re-render / leaving the page

/* ---- Morais' photos beside the 3D view: drag to rearrange (saved), tap to see the whole photo ---- */
function moraisOrder() {
  const ids = MORAIS_PHOTOS.map((p) => p.id);
  const saved = (Array.isArray(state.morais) ? state.morais : []).filter((id) => ids.includes(id));
  return [...saved, ...ids.filter((id) => !saved.includes(id))].map((id) => MORAIS_PHOTOS.find((p) => p.id === id));
}
const inspoTiles = () => `${state.inspo.map((p) => `<figure class="ref-tile"><img src="${p.src}" alt="${esc(p.caption || '')}" loading="lazy"/><button class="ref-x" data-unpin="${p.id}" aria-label="Remove photo">×</button></figure>`).join('')}<button class="ref-add" id="addPin" aria-label="Add photo">+</button>`;
/** One quiet panel for the photos: Inspiration (add / remove) and Venue (the Morais photos: drag to reorder, tap for the full photo). */
function refHTML() {
  return `<section class="card ref" aria-label="Reference">
    <div class="ref-head"><h3>Reference</h3>
      <div class="ref-tabs" role="tablist"><button role="tab" data-ref="inspo" aria-selected="${refTab === 'inspo'}" class="${refTab === 'inspo' ? 'on' : ''}">Inspiration</button><button role="tab" data-ref="venue" aria-selected="${refTab === 'venue'}" class="${refTab === 'venue' ? 'on' : ''}">Venue</button></div></div>
    <div class="ref-grid" id="inspoGrid"${refTab === 'inspo' ? '' : ' hidden'}></div>
    <div class="ref-grid morais-grid"${refTab === 'venue' ? '' : ' hidden'}>
      ${moraisOrder().map((p, i) => `<button class="morais-th" data-ph="${p.id}" style="--i:${i}" aria-label="${p.name}"><img src="${p.src}" alt="" draggable="false" loading="lazy"/></button>`).join('')}
    </div>
    <input type="file" id="pinFile" accept="image/*" multiple hidden/>
  </section>`;
}
function wireMorais(root, signal) {
  const grid = root.querySelector('.morais-grid');
  if (!grid) return;
  const thumbs = () => [...grid.querySelectorAll('.morais-th')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveOrder = () => { state.morais = thumbs().map((t) => t.dataset.ph); commit({ silent: true }); };

  /* --- rearrange: drag a photo, the others glide out of its way --- */
  const flip = (moveDom) => {
    const others = thumbs(), before = new Map(others.map((t) => [t, t.getBoundingClientRect()]));
    moveDom();
    if (reduce) return;
    others.forEach((t) => {
      if (t.classList.contains('dragging')) return;
      const a = before.get(t), b = t.getBoundingClientRect();
      if (a.left !== b.left || a.top !== b.top) t.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  };
  let drag = null, justDragged = false;
  grid.addEventListener('pointerdown', (e) => {
    const th = e.target.closest('.morais-th');
    if (!th || e.button > 0) return;
    const r = th.getBoundingClientRect();
    drag = { th, id: e.pointerId, x: e.clientX, y: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, on: false, order: thumbs().map((t) => t.dataset.ph).join() };
  }, { signal });
  const place = (e) => {
    const g = grid.getBoundingClientRect();
    drag.th.style.transform = `translate(${e.clientX - g.left - drag.ox - drag.th.offsetLeft}px, ${e.clientY - g.top - drag.oy - drag.th.offsetTop}px) scale(1.06)`;
  };
  // Hit-test against layout slots (offsets ignore the glide transforms, so photos don't flicker back and forth)
  const hit = (t, e) => {
    const g = grid.getBoundingClientRect(), x = e.clientX - g.left, y = e.clientY - g.top;
    return x > t.offsetLeft && x < t.offsetLeft + t.offsetWidth && y > t.offsetTop && y < t.offsetTop + t.offsetHeight;
  };
  addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return; // a tap that wobbles a little is still a tap
      drag.on = true; drag.th.classList.add('dragging');
    }
    e.preventDefault();
    const over = thumbs().find((t) => t !== drag.th && hit(t, e));
    if (over) {
      const list = thumbs(), from = list.indexOf(drag.th), to = list.indexOf(over);
      flip(() => over[from < to ? 'after' : 'before'](drag.th));
    }
    place(e);
  }, { signal, passive: false });
  const drop = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.on) return;
    // Only a real rearrange (or a long drag) swallows the click; a small wobble still opens the photo
    const moved = thumbs().map((t) => t.dataset.ph).join() !== d.order || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 24;
    if (moved) { justDragged = true; setTimeout(() => { justDragged = false; }, 0); }
    d.th.classList.remove('dragging');
    const from = d.th.style.transform;
    d.th.style.transform = '';
    if (!reduce) d.th.animate([{ transform: from }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    saveOrder();
  };
  addEventListener('pointerup', drop, { signal });
  addEventListener('pointercancel', drop, { signal });
  // Keyboard: arrows move the focused photo
  grid.addEventListener('keydown', (e) => {
    const th = e.target.closest('.morais-th');
    if (!th || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const sib = e.key === 'ArrowLeft' ? th.previousElementSibling : th.nextElementSibling;
    if (!sib) return;
    flip(() => sib[e.key === 'ArrowLeft' ? 'before' : 'after'](th));
    th.focus();
    saveOrder();
  }, { signal });

  /* --- full view: the whole photo (no crop), zooming out of its thumbnail --- */
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.hidden = true;
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.innerHTML = `<img class="lb-img" alt=""/><span class="lb-name"></span>
    <button class="lb-nav prev" aria-label="Previous">‹</button><button class="lb-nav next" aria-label="Next">›</button>
    <button class="lb-x" aria-label="Close">×</button>`;
  root.append(lb);
  const img = lb.querySelector('.lb-img'), name = lb.querySelector('.lb-name');
  let at = null, busy = false, closeTimer;
  const cur = () => grid.querySelector(`[data-ph="${CSS.escape(at)}"]`);
  // Largest box with the photo's own shape: viewport height on desktop, full width on phones
  const target = () => {
    const im = cur()?.querySelector('img');
    const ratio = im?.naturalWidth ? im.naturalWidth / im.naturalHeight : 3 / 4;
    const phone = innerWidth < 760;
    const maxW = innerWidth * (phone ? 1 : 0.86), maxH = innerHeight * (phone ? 0.82 : 0.9);
    let w = maxW, h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    return { left: (innerWidth - w) / 2, top: (innerHeight - h) / 2, width: w, height: h };
  };
  const put = (r) => Object.assign(img.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  const fromThumb = (el, r) => {
    const t = el.getBoundingClientRect();
    return `translate(${t.left - r.left}px, ${t.top - r.top}px) scale(${t.width / r.width}, ${t.height / r.height})`;
  };
  const show = (id) => {
    at = id;
    const p = MORAIS_PHOTOS.find((x) => x.id === id);
    img.src = p.src; img.alt = p.name; name.textContent = p.name;
    thumbs().forEach((t) => t.classList.toggle('lifted', t.dataset.ph === id)); // the open photo 'leaves' its thumbnail
  };
  function open(id) {
    clearTimeout(closeTimer); busy = false; // reopening cancels a close in progress
    show(id);
    const r = target();
    put(r);
    lb.hidden = false;
    if (reduce) { lb.classList.add('on'); return; }
    img.style.transition = 'none';
    img.style.transform = fromThumb(cur(), r);
    void img.offsetWidth;
    img.style.transition = '';
    lb.classList.add('on'); img.style.transform = 'none';
    lb.querySelector('.lb-x').focus({ preventScroll: true });
  }
  function close() {
    if (lb.hidden || busy) return;
    const el = cur();
    lb.classList.remove('on');
    const done = () => thumbs().forEach((t) => t.classList.remove('lifted'));
    if (reduce) { lb.hidden = true; done(); return; }
    busy = true;
    img.style.transform = fromThumb(el, target());
    closeTimer = setTimeout(() => { lb.hidden = true; busy = false; done(); el.focus({ preventScroll: true }); }, 380);
  }
  function step(d) {
    if (busy) return;
    const ids = thumbs().map((t) => t.dataset.ph);
    const next = ids[(ids.indexOf(at) + d + ids.length) % ids.length];
    img.classList.add('swap');
    setTimeout(() => { show(next); put(target()); img.classList.remove('swap'); }, 160);
  }
  grid.addEventListener('click', (e) => {
    const th = e.target.closest('.morais-th');
    if (th && !justDragged) open(th.dataset.ph);
  }, { signal });
  lb.onclick = (e) => {
    if (e.target.closest('.lb-nav')) { e.stopPropagation(); step(e.target.closest('.prev') ? -1 : 1); return; }
    close();
  };
  addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  }, { signal });
  addEventListener('resize', () => { if (!lb.hidden) put(target()); }, { signal });
  let sx = null;
  lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 50) { e.preventDefault(); step(dx < 0 ? 1 : -1); }
  });
}

/** QA-20: quick fade + shrink before something is removed; `done` then changes the plan (Undo re-enters normally). */
function leave(el, done) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }
  let target = el;
  if (el instanceof SVGElement) {
    // SVG groups carry their position in the transform attribute — animate a wrapper inside instead
    const w = document.createElementNS(SVGNS, 'g');
    while (el.firstChild) w.append(el.firstChild);
    el.append(w);
    w.style.transformBox = 'fill-box';
    w.style.transformOrigin = 'center';
    target = w;
  } else el.style.transformOrigin = 'center';
  el.style.pointerEvents = 'none';
  const anim = target.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.82)' }], { duration: 200, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
  let fired = false;
  const go = () => { if (!fired) { fired = true; done(); } };
  anim.onfinish = go;
  setTimeout(go, 280); // in case animations are paused (background tab)
}
