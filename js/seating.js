import { state, commit, uid, undoable, exportJSON, importJSON } from './store.js';
import { MOODS, headTable, AREA_PRESETS } from './data.js';
import { TABLE_STYLES, seatCount, roundRadius, rectDims, chairPositions, suggestTables, autoSeat, findFreeSpot, footprint, openingRect, blockers } from './layout.js';
import { esc, toast } from './util.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const M = 3; // margin around the room (ft)
let sel = null;          // { kind: 'table' | 'area', id }
let cleanup = null;      // AbortController for document listeners of the current render
let view = null;         // current viewBox { x, y, w, h } — persists across re-renders
let mode = 'plan';       // 'plan' | '3d'
let enterAnim = false;   // play the "tables glide in" animation on next draw
const lastFilled = new Map(); // tableId -> seated count last drawn (for the seat "pop")

const guestsAt = (tid) => state.guests.filter((g) => g.tableId === tid);
const going = () => state.guests.filter((g) => g.rsvp !== 'Declined');
const listFor = (kind) => (kind === 'area' ? state.room.areas : state.tables);
const findItem = (s) => s && listFor(s.kind).find((x) => x.id === s.id);
const baseView = () => ({ x: -M, y: -M, w: state.room.w + M * 2, h: state.room.h + M * 2 });
const moodNow = () => MOODS.find((m) => m.id === state.mood) || MOODS[0];
const areaTransform = (a) => `translate(${a.x} ${a.y}) rotate(${a.rot || 0} ${a.w / 2} ${a.h / 2})`;
// Little rotate knob on a stalk, shown on the selected item
const rotHandle = (x, y, x0, y0) => `<line class="rot-stalk" x1="${x0}" y1="${y0}" x2="${x}" y2="${y}"/><circle class="rot-knob" cx="${x}" cy="${y}" r=".9" data-rotate="1"><title>Drag to rotate</title></circle>`;
const ROT_STEP = 15;

/* ---------------- blurred venue photo (pre-blurred once, so it also exports) ---------------- */
let blurredBg = null;
function blurredBallroom() {
  blurredBg ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Shrink to a few dozen pixels, then scale back up with smoothing = a soft natural blur
      const small = document.createElement('canvas'); small.width = 110; small.height = Math.round(110 * img.height / img.width); // bigger = less blur
      small.getContext('2d').drawImage(img, 0, 0, small.width, small.height);
      const big = document.createElement('canvas'); big.width = 900; big.height = Math.round(900 * img.height / img.width);
      const g = big.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(small, 0, 0, big.width, big.height);
      resolve(big.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(null);
    img.src = 'assets/venue/ballroom.jpg';
  });
  return blurredBg;
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
  const chairs = chairPositions(t).map(([x, y], k) => `<circle class="chair${k < n ? ' filled' : ''}${k < n && k >= before ? ' pop' : ''}" cx="${x}" cy="${y}" r=".75"${k < n && k >= before && enterAnim ? ` style="animation-delay:${delay(k)}ms"` : ''}/>`).join('');
  const [bloom, leaf] = [mood.swatches[3], mood.swatches[1]];
  let top, room;
  if (t.shape === 'round') {
    const r = roundRadius(t.seats);
    room = r * 1.7;
    top = `<circle class="top" r="${r}"/><circle cx="0" cy="${-r + .75}" r=".42" fill="${bloom}"/><circle cx=".55" cy="${-r + .95}" r=".26" fill="${leaf}"/><circle cx="-.55" cy="${-r + .95}" r=".24" fill="${leaf}"/>`;
  } else {
    const { L, D } = rectDims(t);
    room = (rot ? D : L) * 0.95;
    top = `<rect class="top" x="${-L / 2}" y="${-D / 2}" width="${L}" height="${D}" rx=".3"/><rect x="${-L / 2 + .4}" y="-.22" width="${L - .8}" height=".44" rx=".22" fill="${leaf}" opacity=".75"/>`;
  }
  // Long names shrink to fit instead of being cut off
  const fs = Math.max(0.9, Math.min(1.7, room / Math.max(1, t.name.length * 0.58)));
  const isHead = t.id === 'head';
  const ly = t.shape === 'round' ? fs * 0.35 : (rot % 180 ? 0 : rectDims(t).D / 2 + (t.sides.bottom ? 3.3 : 1.6));
  const knob = sel?.id === t.id && t.shape !== 'round' ? `<g transform="rotate(${rot})">${rotHandle(0, -(rectDims(t).D / 2 + 4.2), 0, -rectDims(t).D / 2)}</g>` : '';
  const inner = `<g transform="rotate(${rot})">${chairs}${top}</g>
    <text class="${isHead ? 'head-label' : 'num'}" y="${ly}" style="font-size:${isHead ? 1.5 : fs}px">${esc(t.name)}</text>${knob}`;
  // Fly in from the entrance doors when a layout is suggested (inner group animates; outer keeps its position)
  g.innerHTML = enterAnim && !isHead
    ? `<g class="fly" style="--fx:${(state.room.w / 2 - t.x).toFixed(1)}px;--fy:${(state.room.h - t.y).toFixed(1)}px;animation-delay:${i * 45}ms">${inner}</g>`
    : inner;
  return g;
}

function areaSVG(a) {
  const g = document.createElementNS(SVGNS, 'g');
  g.classList.add('area', `p-${a.preset || 'custom'}`);
  if (sel?.id === a.id) g.classList.add('sel');
  g.dataset.kind = 'area';
  g.dataset.id = a.id;
  g.setAttribute('transform', areaTransform(a));
  const fs = Math.max(0.9, Math.min(1.5, (a.w * 0.9) / Math.max(1, a.label.length * 0.55)));
  g.innerHTML = `<rect width="${a.w}" height="${a.h}" rx=".5"/>
    <text x="${a.w / 2}" y="${a.h / 2 + fs * 0.35}" style="font-size:${fs}px">${esc(a.label)}</text>
    ${sel?.id === a.id ? `<circle class="grip" cx="${a.w}" cy="${a.h}" r=".9" data-grip="1"/>${rotHandle(a.w / 2, -2.6, a.w / 2, 0)}` : ''}`;
  return g;
}

function fixedSVG() {
  const { w, h, fixed } = state.room;
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
  // Walls with openings cut in
  s += `<rect class="wall" x="0" y="0" width="${w}" height="${h}"/>`;
  fixed.openings.forEach((o) => {
    const r = openingRect(state.room, o, 0.9);
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
  const { w, h } = state.room;
  const mood = moodNow();
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.classList.add('plan');
  const v = view || baseView();
  svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Reception floor plan`);
  let grid = '';
  for (let x = 10; x < w; x += 10) grid += `<line class="grid-line" x1="${x}" y1="0" x2="${x}" y2="${h}"/>`;
  for (let y = 10; y < h; y += 10) grid += `<line class="grid-line" x1="0" y1="${y}" x2="${w}" y2="${y}"/>`;
  svg.innerHTML = `
    <defs>
      <pattern id="boards" width="2" height="${h}" patternUnits="userSpaceOnUse">
        <rect width="2" height="${h}" fill="#f4ead6"/><line x1="2" y1="0" x2="2" y2="${h}" stroke="#e6d6b6" stroke-width=".06"/>
      </pattern>
      <clipPath id="roomClip"><rect x="0" y="0" width="${w}" height="${h}"/></clipPath>
    </defs>
    ${bg ? `<image class="bg" href="${bg}" x="${-w}" y="${-h * 0.5}" width="${w * 3}" height="${h * 2}" preserveAspectRatio="xMidYMid slice"/>` : ''}
    <rect class="tint" x="${-w}" y="${-h * 0.5}" width="${w * 3}" height="${h * 2}"/>
    <rect class="floor" x="0" y="0" width="${w}" height="${h}"/>
    ${grid}`;
  const fixedG = document.createElementNS(SVGNS, 'g');
  fixedG.classList.add('fixed');
  fixedG.innerHTML = fixedSVG();
  svg.appendChild(fixedG);
  state.room.areas.filter((a) => a.id !== sel?.id).forEach((a) => svg.appendChild(areaSVG(a)));
  state.tables.forEach((t, i) => svg.appendChild(tableSVG(t, mood, i)));
  const selArea = state.room.areas.find((a) => a.id === sel?.id);
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
    if (!g) { pan = { x: e.clientX, y: e.clientY, v: { ...(view || baseView()) }, moved: false }; return; }
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
    const { w, h } = state.room;
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
    if (pan) { const tapped = !pan.moved; pan = null; if (tapped) onTap(null); return; }
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
  return { w, h, x: Math.min(Math.max(v.x, b.x), b.x + b.w - w), y: Math.min(Math.max(v.y, b.y), b.y + b.h - h) };
}

/* ---------------- popover ---------------- */
const stepper = (key, label, v, min = 0, max = 20) => `
  <div class="stepper"><span>${label}</span>
    <div><button type="button" data-step="${key}" data-d="-1" ${v <= min ? 'disabled' : ''} aria-label="Less ${label}">−</button><b>${v}</b><button type="button" data-step="${key}" data-d="1" ${v >= max ? 'disabled' : ''} aria-label="More ${label}">+</button></div>
  </div>`;
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
  const unseated = going().filter((g) => !g.tableId);
  const ctl = t.shape === 'round'
    ? stepper('seats', 'Seats', t.seats, 1, 16)
    : `${stepper('top', 'Far side', t.sides.top)}${stepper('bottom', 'Near side', t.sides.bottom)}${stepper('left', 'Left end', t.sides.left, 0, 6)}${stepper('right', 'Right end', t.sides.right, 0, 6)}
       ${rotateRow(t.rot || 0)}`;
  return `
    <div class="pop-head">
      ${state.tables.length > 1 ? '<button class="pop-nav" data-nav="-1" aria-label="Previous table">‹</button>' : ''}
      <label class="rename"><input class="pop-title" id="tName" value="${esc(t.name)}" aria-label="Table name" spellcheck="false"/><span aria-hidden="true">✎</span></label>
      ${state.tables.length > 1 ? '<button class="pop-nav" data-nav="1" aria-label="Next table">›</button>' : ''}
      <button class="x" data-close aria-label="Close">×</button>
    </div>
    <div class="pop-count">${here.length} of ${total} seats</div>
    <ol class="seat-list seat-slots">${Array.from({ length: Math.max(total, here.length) }, (_, i) => {
      const g = here[i];
      return g
        ? `<li class="taken" style="--i:${i}"><i aria-label="Seat ${i + 1}">${i + 1}</i><span>${esc(g.name)}</span>${g.party === 'couple' ? '' : `<button class="side-tag" data-side="${g.id}" title="Change side">${esc(g.side)}</button>`}<button class="x" data-unseat="${g.id}" aria-label="Remove ${esc(g.name)}">×</button></li>`
        : `<li class="empty" style="--i:${i}"><i aria-hidden="true">${i + 1}</i><button class="slot-add" data-slot="${i}" aria-label="Seat ${i + 1}: add a guest"><span>+</span></button></li>`;
    }).join('')}</ol>
    ${here.length < total ? `<datalist id="unseatedList">${unseated.map((g) => `<option value="${esc(g.name)}"></option>`).join('')}</datalist>` : ''}
    <div class="pop-ctl">${ctl}</div>
    ${t.id === 'head' ? '' : '<button class="linklike danger" id="tDel">Remove table</button>'}`;
}

function areaPop(a) {
  return `
    <div class="pop-head">
      <label class="rename"><input class="pop-title" id="aName" value="${esc(a.label)}" aria-label="Area name" spellcheck="false"/><span aria-hidden="true">✎</span></label>
      <button class="x" data-close aria-label="Close">×</button>
    </div>
    <div class="pop-ctl">${stepper('w', 'Width', a.w, 2, 40)}${stepper('h', 'Length', a.h, 2, 40)}${rotateRow(a.rot || 0)}</div>
    <p class="hint">Drag the corner dot to resize, the top knob to rotate</p>
    <button class="linklike danger" id="aDel">Remove</button>`;
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
  const seated = state.guests.filter((g) => g.tableId && g.rsvp !== 'Declined').length;
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Reception</h1>
        <p class="lede" id="lede"></p>
      </div>
      <div class="viewseg" role="tablist" aria-label="View">
        <button role="tab" data-mode="plan" aria-selected="${mode === 'plan'}" class="${mode === 'plan' ? 'on' : ''}">Floor plan</button>
        <button role="tab" data-mode="3d" aria-selected="${mode === '3d'}" class="${mode === '3d' ? 'on' : ''}">3D</button>
      </div>
    </div>
    <div class="seat-layout">
      <div class="plan-col">
        <div class="card plan-card">
          <div class="plan-tools">
            ${mode === 'plan' ? `
              <button class="tool" data-add="round">Round</button>
              <button class="tool" data-add="rect">Rectangle</button>
              <span class="tool-wrap"><button class="tool" id="areaBtn" aria-expanded="false">Area</button>
                <div class="chipmenu" id="areaMenu" hidden>${Object.entries(AREA_PRESETS).filter(([k]) => k !== 'dance' || !state.room.areas.some((a) => a.preset === 'dance')).map(([k, p]) => `<button data-preset="${k}">${k === 'custom' ? '+ Custom' : esc(p.label)}</button>`).join('')}</div>
              </span>
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
        <div class="strip" aria-label="Inspiration">
          ${state.inspo.map((p) => `<figure><img src="${p.src}" alt="${esc(p.caption || '')}" loading="lazy"/><button class="strip-x" data-unpin="${p.id}" aria-label="Remove photo">×</button></figure>`).join('')}
          <button class="strip-add" id="addPin" aria-label="Add inspiration photo">+</button>
          <input type="file" id="pinFile" accept="image/*" multiple hidden/>
        </div>
      </div>
      <aside class="side-panel">
        ${mode === '3d' ? moraisHTML() : ''}
        <section class="card">
          <h3>Suggest a layout</h3>
          <div class="field-row">
            <label class="field">Guests<input class="input" id="sCount" type="number" min="2" max="300" value="${state.guestTarget}"/></label>
            <label class="field">Tables<select class="select" id="sStyle">${Object.entries(TABLE_STYLES).map(([k, s]) => `<option value="${k}" ${state.lastStyle === k ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label>
          </div>
          <p class="muted small" id="sPreview"></p>
          <div class="btn-row">
            <button class="btn moss sm" id="sGo">Suggest</button>
            <button class="btn line sm" id="sSeat">Auto-seat</button>
          </div>
        </section>
        <section class="card">
          <h3>Plan file</h3>
          <div class="btn-row">
            <button class="btn line sm" id="exportBtn">Export</button>
            <button class="btn line sm" id="importBtn">Import</button>
            <input type="file" id="importFile" accept="application/json" hidden/>
          </div>
        </section>
      </aside>
    </div>`;

  const host = root.querySelector('#planHost');
  const pop = root.querySelector('#pop');
  const wrap = root.querySelector('#stageWrap');
  root.querySelector('#lede').textContent = `${seated} of ${going().length} seated · ${state.tables.length} tables`;

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
  if (mode === '3d') wireMorais(root, signal);

  /* ---- view mode ---- */
  root.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { if (mode !== b.dataset.mode) { mode = b.dataset.mode; sel = null; renderSeating(root); } });

  /* ---- 2D plan ---- */
  let bg = null;
  const drawPlan = () => {
    if (mode !== 'plan') return;
    host.replaceChildren(planSVG(bg));
    attachPointers(host.firstChild, {
      onTap: (d) => { sel = d ? { kind: d.kind, id: d.item.id } : null; drawPlan(); openPop(); },
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

  // Would this table sit on the stage, a door path, an area or another table?
  function collides(t) {
    const fp = footprint(t);
    const others = state.tables.filter((o) => o.id !== t.id);
    const me = { x1: t.x - fp.hw, x2: t.x + fp.hw, y1: t.y - fp.hh, y2: t.y + fp.hh };
    return blockers(state.room, others, { areaPad: 0.5 }).some((z) => me.x1 < z.x2 - 0.5 && me.x2 > z.x1 + 0.5 && me.y1 < z.y2 - 0.5 && me.y2 > z.y1 + 0.5);
  }

  function placePop() {
    const g = host.querySelector(`[data-id="${CSS.escape(sel.id)}"]`);
    if (!g) return;
    const r = g.getBoundingClientRect(), c = wrap.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 12;
    let left = r.right - c.left + gap;
    if (left + pw > c.width - 8) left = r.left - c.left - pw - gap;
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
    pop.innerHTML = sel.kind === 'area' ? areaPop(item) : tablePop(item);
    pop.hidden = false;
    backdrop.classList.add('on');
    if (popPinned?.id !== sel.id) { pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in'); }
    placePop();
    sel.kind === 'area' ? wireArea(item) : wireTable(item);
    // Phones: the sheet covers the bottom of the screen, so bring the item up into view
    if (matchMedia('(max-width: 760px)').matches) {
      const g = host.querySelector(`[data-id="${CSS.escape(sel.id)}"]`);
      if (g) { const r = g.getBoundingClientRect(); const target = innerHeight * 0.3; if (r.top > innerHeight * 0.55 || r.bottom < 80) scrollBy({ top: r.top - target, behavior: 'smooth' }); }
    }
  }
  function closePop(keepSel) {
    pop.hidden = true;
    popPinned = null;
    backdrop.classList.remove('on');
    if (!keepSel && sel) { sel = null; drawPlan(); }
  }
  const refresh = () => { commit({ silent: true }); drawPlan(); openPop(); lede(); };
  const lede = () => { root.querySelector('#lede').textContent = `${state.guests.filter((g) => g.tableId && g.rsvp !== 'Declined').length} of ${going().length} seated · ${state.tables.length} tables`; };

  function wireRename(input, get, set) {
    const fallback = get();
    input.oninput = () => { if (input.value.trim()) { set(input.value.trim()); commit({ silent: true }); drawPlan(); } };
    input.onblur = () => { if (!input.value.trim()) { set(fallback); input.value = fallback; commit({ silent: true }); drawPlan(); } };
    input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
  }

  function wireTable(t) {
    wireRename(pop.querySelector('#tName'), () => t.name, (v) => { t.name = v; });
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
      b.outerHTML = '<form class="add-seat slot-form" id="addSeat"><input class="input" name="name" list="unseatedList" placeholder="Name" autocomplete="off" aria-label="Guest name"/></form>';
      const form = li.querySelector('form'), input = form.name;
      input.focus();
      input.onkeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); input.onblur = null; openPop(); } };
      input.onblur = () => setTimeout(() => { if (!input.value.trim() && pop.contains(input) && document.activeElement !== input) openPop(); }, 150);
      form.onsubmit = (e) => {
        e.preventDefault();
        const n = input.value.trim();
        if (!n) return;
        if (guestsAt(t.id).length >= seatCount(t)) return toast('Table is full');
        let g = going().find((x) => !x.tableId && x.name.toLowerCase() === n.toLowerCase());
        if (!g) { g = { id: uid(), name: n, side: 'Both', rsvp: 'Invited', diet: '', tableId: null }; state.guests.push(g); toast(`${n} added to guests`); }
        g.tableId = t.id; input.onblur = null; refresh();
        const next = pop.querySelector('.slot-add');
        if (next) next.click();
      };
    };
    pop.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => openSlot(b));
    // ‹ › step through the tables; the popover glides over to the next one
    pop.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => {
      const order = [...state.tables].sort((x, y) => (x.id === 'head' ? -1 : y.id === 'head' ? 1 : (x.o ?? 0) - (y.o ?? 0)));
      const i = order.findIndex((x) => x.id === t.id);
      const next = order[(i + +b.dataset.nav + order.length) % order.length];
      sel = { kind: 'table', id: next.id };
      popPinned = null;
      pop.classList.add('glide');
      drawPlan(); openPop();
      pop.classList.remove('in', 'swap'); void pop.offsetWidth; pop.classList.add('swap');
      clearTimeout(pop._glide); pop._glide = setTimeout(() => pop.classList.remove('glide', 'swap'), 420);
      pop.querySelector(`[data-nav="${b.dataset.nav}"]`)?.focus({ preventScroll: true });
    });
    const del = pop.querySelector('#tDel');
    if (del) del.onclick = () => {
      sel = null;
      undoable(`${/^\d+$/.test(t.name) ? 'Table ' + t.name : t.name} removed`, () => {
        state.guests.forEach((g) => { if (g.tableId === t.id) g.tableId = null; });
        state.tables = state.tables.filter((x) => x.id !== t.id);
      }, toast);
    };
    pop.querySelector('[data-close]').onclick = () => closePop();
  }

  function wireArea(a) {
    wireRename(pop.querySelector('#aName'), () => a.label, (v) => { a.label = v; });
    pop.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
      const k = b.dataset.step, max = k === 'w' ? state.room.w - a.x : state.room.h - a.y;
      a[k] = Math.max(2, Math.min(max, a[k] + +b.dataset.d));
      refresh();
    });
    wireTurn(pop, a, refresh);
    pop.querySelector('#aDel').onclick = () => {
      sel = null;
      undoable(`${a.label} removed`, () => { state.room.areas = state.room.areas.filter((x) => x.id !== a.id); }, toast);
    };
    pop.querySelector('[data-close]').onclick = () => closePop();
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) closePop(); }, { signal });
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !wrap.contains(e.target) && !pop.contains(e.target)) closePop();
    const menu = root.querySelector('#areaMenu');
    if (menu && !menu.hidden && !e.target.closest('.tool-wrap')) { menu.hidden = true; root.querySelector('#areaBtn').setAttribute('aria-expanded', 'false'); }
  }, { signal });
  window.addEventListener('hashchange', () => { sel = null; cleanup?.abort(); backdrop.remove(); three?.dispose(); }, { signal, once: true });

  /* ---- toolbar ---- */
  if (mode === 'plan') {
    // Glide the view (viewBox can't be CSS-animated, so tween it)
    const tweenTo = (target) => {
      const svg = host.querySelector('svg'); if (!svg) return;
      const from = { ...(view || baseView()) }, to = clampView(target), t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 260), e = 1 - Math.pow(1 - k, 3);
        view = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e };
        svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
        svg.style.touchAction = isZoomed() ? 'none' : 'pan-y';
        if (popPinned) popPinned.view = true;
        if (!pop.hidden) placePop();
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const zoomBy = (k) => {
      const v = view || baseView();
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      tweenTo({ x: cx - (v.w * k) / 2, y: cy - (v.h * k) / 2, w: v.w * k, h: v.h * k });
    };
    root.querySelector('#zIn').onclick = () => zoomBy(0.7);
    root.querySelector('#zOut').onclick = () => zoomBy(1 / 0.7);
    root.querySelector('#zFit').onclick = () => tweenTo(baseView());

    root.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => {
      const round = b.dataset.add === 'round';
      const n = state.tables.filter((t) => t.id !== 'head').length + 1;
      const t = { id: uid(), name: String(n), rot: 0, o: Date.now(),
        ...(round ? { shape: 'round', seats: 8 } : { shape: 'rect', sides: { top: 4, bottom: 4, left: 1, right: 1 } }) };
      Object.assign(t, findFreeSpot(state.room, state.tables, t));
      state.tables.push(t); sel = { kind: 'table', id: t.id };
      commit({ silent: true }); drawPlan(); openPop(); lede();
      pop.querySelector('#tName')?.select();
    });

    const areaBtn = root.querySelector('#areaBtn'), menu = root.querySelector('#areaMenu');
    areaBtn.onclick = () => { menu.hidden = !menu.hidden; areaBtn.setAttribute('aria-expanded', String(!menu.hidden)); };
    menu.querySelectorAll('[data-preset]').forEach((b) => b.onclick = () => {
      const p = AREA_PRESETS[b.dataset.preset];
      const a = { id: uid(), preset: b.dataset.preset, label: p.label, w: p.w, h: p.h, x: 0, y: 0 };
      const spot = findFreeSpot(state.room, state.tables, { box: { hw: a.w / 2 + 1, hh: a.h / 2 + 1 } });
      a.x = Math.max(0, Math.min(state.room.w - a.w, Math.round(spot.x - a.w / 2)));
      a.y = Math.max(0, Math.min(state.room.h - a.h, Math.round(spot.y - a.h / 2)));
      state.room.areas.push(a); sel = { kind: 'area', id: a.id };
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
          const t = state.tables.find((x) => x.id === tableId);
          if (!t || guestsAt(tableId).length >= seatCount(t)) { toast('Table is full'); return false; }
          let g = going().find((x) => !x.tableId && x.name.toLowerCase() === name.toLowerCase());
          if (!g) { g = { id: uid(), name, side: 'Both', rsvp: 'Invited', diet: '', tableId: null }; state.guests.push(g); }
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

  /* ---- inspo strip ---- */
  const fileIn = root.querySelector('#pinFile');
  root.querySelector('#addPin').onclick = () => fileIn.click();
  fileIn.onchange = async () => {
    const files = [...fileIn.files];
    fileIn.value = '';
    for (const f of files) {
      try { state.inspo.push({ id: uid(), ...(await readImage(f)), caption: '' }); } catch (err) { toast(err.message); }
    }
    commit();
  };
  root.querySelectorAll('[data-unpin]').forEach((b) => b.onclick = () => {
    undoable('Photo removed', () => { state.inspo = state.inspo.filter((p) => p.id !== b.dataset.unpin); }, toast);
  });

  /* ---- suggest ---- */
  const count = root.querySelector('#sCount'), style = root.querySelector('#sStyle'), prev = root.querySelector('#sPreview');
  const plan = () => {
    const n = Math.max(2, +count.value || 2);
    const head = state.tables.find((t) => t.id === 'head') || headTable();
    const room = structuredClone(state.room);
    // Family rows run the long way, so the dance floor moves toward the lounge end
    const dance = room.areas.find((a) => a.preset === 'dance');
    if (style.value === 'family' && dance) { dance.x = (room.w - dance.w) / 2; dance.y = room.h - (room.fixed.balcony?.depth || 0) - 10 - dance.h - 1; }
    if (style.value !== 'family' && dance) { dance.x = (room.w - dance.w) / 2; dance.y = 13; }
    return { n, head, room, s: suggestTables(room, n, style.value, head) };
  };
  const preview = () => { const { s } = plan(); prev.innerHTML = `${s.needed} tables + sweetheart${s.fits ? '' : ` · <b style="color:var(--wine)">only ${s.tables.length} fit</b>`}`; };
  count.oninput = preview; style.onchange = preview;
  root.querySelector('#sGo').onclick = () => {
    const { n, head, room, s } = plan();
    sel = null; enterAnim = true; lastFilled.clear();
    undoable(s.fits ? `${s.tables.length} tables laid out` : `Only ${s.tables.length} of ${s.needed} tables fit`, () => {
      state.guestTarget = n; state.lastStyle = style.value;
      state.room.areas = room.areas;
      state.tables = [head, ...s.tables];
      state.guests.forEach((g) => { if (g.party !== 'couple') g.tableId = null; });
      autoSeat(state.guests, state.tables, { links: state.links || [] });
    }, toast);
  };
  root.querySelector('#sSeat').onclick = () => {
    const r = autoSeat(state.guests, state.tables, { links: state.links || [] });
    commit({ silent: true }); drawPlan(); lede();
    toast(r.seated || r.left ? `${r.seated} seated${r.left ? ` · ${r.left} need a seat` : ''}` : 'Everyone has a seat');
  };

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
  // Draw once the soft venue photo is ready (cached after the first visit, so this is instant)
  if (mode === 'plan') {
    if (bgCache !== undefined) { bg = bgCache; drawPlan(); }
    else blurredBallroom().then((d) => { bgCache = bg = d; drawPlan(); });
  }
}
let bgCache;
let threeInst = null; // live 3D scene, disposed on re-render / leaving the page

/* ---- Morais reference photos beside the 3D view (tap to enlarge) ---- */
const MORAIS = [
  { src: 'assets/venue/ballroom.jpg', name: 'Ballroom' },
  { src: 'assets/venue/tasting-room.jpg', name: 'Tasting room' },
  { src: 'assets/venue/tasting-room-2.jpg', name: 'Tasting room' },
];
function moraisHTML() {
  return `
    <section class="card morais" aria-label="Morais photos">
      <h3>Morais</h3>
      <div class="morais-grid">
        ${MORAIS.map((p, i) => `<button class="morais-th" data-ph="${i}" style="--i:${i}" aria-label="${p.name}"><img src="${p.src}" alt="" loading="lazy"/></button>`).join('')}
      </div>
    </section>`;
}
function wireMorais(root, signal) {
  const thumbs = [...root.querySelectorAll('.morais-th')];
  if (!thumbs.length) return;
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
  let at = -1, busy = false, closeTimer;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Largest 4:3 box that fits the screen
  const target = () => {
    const w = Math.min(innerWidth * 0.9, (innerHeight * 0.82) * 4 / 3), h = w * 3 / 4;
    return { left: (innerWidth - w) / 2, top: (innerHeight - h) / 2, width: w, height: h };
  };
  const place = (r) => Object.assign(img.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  // Transform that makes the big image sit exactly on a thumbnail
  const fromThumb = (el, r) => {
    const t = el.getBoundingClientRect();
    return `translate(${t.left - r.left}px, ${t.top - r.top}px) scale(${t.width / r.width}, ${t.height / r.height})`;
  };
  const show = (i) => {
    at = (i + MORAIS.length) % MORAIS.length; img.src = MORAIS[at].src; img.alt = MORAIS[at].name; name.textContent = MORAIS[at].name;
    thumbs.forEach((t, j) => t.classList.toggle('lifted', j === at)); // the open photo 'leaves' its thumbnail
  };
  function open(i) {
    clearTimeout(closeTimer); busy = false; // reopening cancels a close in progress
    show(i);
    const r = target();
    place(r);
    lb.hidden = false;
    if (reduce) { lb.classList.add('on'); return; }
    img.style.transition = 'none';
    img.style.transform = fromThumb(thumbs[at], r);
    void img.offsetWidth;
    img.style.transition = '';
    lb.classList.add('on'); img.style.transform = 'none';
    lb.querySelector('.lb-x').focus({ preventScroll: true });
  }
  function close() {
    if (lb.hidden || busy) return;
    const el = thumbs[at];
    lb.classList.remove('on');
    const done = () => thumbs.forEach((t) => t.classList.remove('lifted'));
    if (reduce) { lb.hidden = true; done(); return; }
    busy = true;
    img.style.transform = fromThumb(el, target());
    closeTimer = setTimeout(() => { lb.hidden = true; busy = false; done(); el.focus({ preventScroll: true }); }, 380);
  }
  function step(d) {
    if (busy) return;
    img.classList.add('swap');
    setTimeout(() => { show(at + d); img.classList.remove('swap'); }, 160);
  }
  thumbs.forEach((b) => b.onclick = () => open(+b.dataset.ph));
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
  addEventListener('resize', () => { if (!lb.hidden) place(target()); }, { signal });
  // Swipe between photos on phones
  let sx = null;
  lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 50) { e.preventDefault(); step(dx < 0 ? 1 : -1); }
  });
}
