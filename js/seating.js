import { state, commit as baseCommit, uid, undoable, exportJSON, importJSON, isSeated } from './store.js';
import { MOODS, headTable, AREA_PRESETS, SPACES, seedSpaces } from './data.js';
import { TABLE_STYLES, relationOf, seatCount, tableR, rectDims, chairPositions, suggestTables, autoSeat, findFreeSpot, footprint, openingRect, blockers, clearanceIssues } from './layout.js';
import { esc, toast, heartLoaderHTML } from './util.js';
import { photosForSpace, photoById } from './venue-map.js';
import { spaceToolsHTML, wireSpaceTools, partySVG, suggestHangout } from './spaces.js';
import { renderVenueMap, MAP_PHOTO } from './venue-map.js';
import { lookHTML, syncLook, withPick, resolveStyle, groupsFor, toggleLookGroup } from './style-options.js';
import { hexOfPerson } from './team-colors.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const M = 3; // margin around the room (ft)
let sel = null;          // { kind: 'table' | 'area', id }
// Header Undo: a short stack of plan snapshots (taken after every edit made on this page)
const hist = [];
const stamp = () => JSON.stringify({ ...state, updatedAt: 0 });
const syncUndo = () => { const b = document.getElementById('hdrUndo'); if (b) b.disabled = hist.length < 2; };
const histPush = () => { const s = stamp(); if (hist[hist.length - 1] !== s) { hist.push(s); if (hist.length > 30) hist.shift(); } syncUndo(); };
function commit(o) { baseCommit(o); histPush(); }
let cleanup = null;      // AbortController for document listeners of the current render
let view = null;         // current viewBox { x, y, w, h } — persists across re-renders
let mode = '3d';         // 'plan' | '3d' (reception opens on the 3D hero)
let space = 'reception'; // 'ceremony' | 'indoor' | 'cocktail' | 'reception' — tabs above the plan
let inkFrom = null;       // where the tab underline glides from after a space switch ({ x, y, w })
/** The space being edited: the reception lives at the top of the plan (room/tables), the others in state.spaces. */
function SP() {
  if (space === 'reception') return state;
  return state.spaces?.[space] || seedSpaces()[space]; // store.healSeats() fills missing spaces at load; this is only a safety net
}
const spaceInfo = () => ({ ...SPACES.find((x) => x.id === space), label: SPACE_LABEL[space] || SPACES.find((x) => x.id === space).label });
const TAB_ORDER = ['reception', 'ceremony', 'cocktail', 'tasting']; // Reception is the big row (full 3D + the 360 tour); the rest sit smaller beneath
const SPACE_LABEL = { cocktail: 'Hangout spot', indoor: 'Ceremony', tasting: 'Tasting room' };  // data keys stay 'cocktail' / 'indoor'
/** One Ceremony tab, two variants with their own saved chairs: 'ceremony' = outdoor pergola, 'indoor' = indoor bay (data keys unchanged, so saved plans keep working). */
const CER_VARIANTS = [['ceremony', 'Outdoor pergola'], ['indoor', 'Indoor bay']];
let cerVariant = 'ceremony';
const tabOn = (id) => id === space || (id === 'ceremony' && space === 'indoor');
const kindOf = () => SPACES.find((x) => x.id === space)?.kind || space; // 'ceremony' | 'cocktail' | 'reception'
const tabList = () => TAB_ORDER.map((id) => SPACES.find((x) => x.id === id)).filter(Boolean).map((x) => ({ ...x, label: SPACE_LABEL[x.id] || x.label }));
/** One quiet line under the tabs */
function spaceLede() {
  const ts = SP().tables, seats = ts.reduce((n, t) => n + seatCount(t), 0);
  if (kindOf() === 'ceremony') return `${seats} seats · ${new Set(ts.map((t) => t.y)).size} rows`; // rows = lines of chairs (left + right halves count once)
  if (kindOf() === 'cocktail') return SP().room.bistro ? `${ts.length} bistro tables · ${seats} seats` : `${ts.length} high-tops · ${seats} stools`;
  return `${state.guests.filter((g) => isSeated(g) && g.rsvp !== 'Declined').length} of ${going().length} seated · ${ts.length} tables`;
}
let units = 'ft'; // feet only: one unit keeps things simple (no metres switch) // plan dimension units (display only; data stays in feet)
let showPhotos = false;  // plan toolbar 'Photos': seated guests with a picture show it in their seat
let vsTab = 'layout';     // reception sidebar tab: 'layout' | 'guests' | 'look'
let refTab = 'ideas';    // side panel tab: 'ideas' | 'venue'
let flip = null;         // Map tableId -> {x,y} of the plan before a layout change: tables glide from there
let partySel = null;     // ceremony: the wedding-party dot that was tapped (just highlights it)
// Come back to the floor plan each time Seating is opened; 3D only loads when its tab is clicked
addEventListener('hashchange', () => { if (location.hash !== '#seating') { mode = '3d'; sel = null; partySel = null; clearBackdrop(); } });
let modeAnim = false;    // the plan <-> 3D switch just happened: the stage eases in
let enterAnim = false;   // play the "tables glide in" animation on next draw
const lastFilled = new Map(); // tableId -> seated count last drawn (for the seat "pop")

const guestsAt = (tid) => state.guests.filter((g) => (space === 'reception' ? g.tableId : g.cRow?.[space]) === tid); // ceremony seats live in g.cRow
const going = () => state.guests.filter((g) => g.rsvp !== 'Declined');
const listFor = (kind) => (kind === 'area' ? SP().room.areas : SP().tables);
const findItem = (s) => s && listFor(s.kind).find((x) => x.id === s.id);
// The stage bay sits OUTSIDE the hall (left long wall in the ballroom, top wall in the indoor ceremony): the view makes room for it
const bayOut = () => { const st = SP().room.fixed?.stage; return st ? (st.d || 15) : 0; };
const baseView = () => { const st = SP().room.fixed?.stage, b = bayOut(), top = st?.wall === 'top'; return { x: -M - (st && !top ? b : 0), y: -M - (top ? b : 0), w: SP().room.w + M * 2 + (st && !top ? b : 0), h: SP().room.h + M * 2 + (top ? b : 0) }; };
const moodNow = () => MOODS.find((m) => m.id === state.mood) || MOODS[0];
const areaTransform = (a) => `translate(${a.x} ${a.y}) rotate(${a.rot || 0} ${a.w / 2} ${a.h / 2})`;
// Little rotate knob on a stalk, shown on the selected item
const rotHandle = (x, y, x0, y0) => `<line class="rot-stalk" x1="${x0}" y1="${y0}" x2="${x}" y2="${y}"/><circle class="rot-knob" cx="${x}" cy="${y}" r=".9" data-rotate="1"><title>Drag to rotate</title></circle>`;
const ROT_STEP = 15;

/* ---------------- seat colours: by side or by relation ---------------- */
const SIDE_COLOR = { Betel: '#6e1f2e', Carter: '#4f6a45', Both: '#e3a5ae' };
const REL_COLOR = { Parent: '#8a2a3c', 'Close relative': '#c2566b', Relative: '#e3a5ae', Bridesmaid: '#4f6a45', Groomsman: '#2f4a5e', 'Close friend': '#b88a3e', Friend: '#9bb08a', Colleague: '#7a6a8a', 'Plus-one': '#a89a8c', '': '#c9bfae' };
let colorBy = 'side';    // 'side' | 'relation' | 'off'
const seatKey = (g) => (colorBy === 'side' ? (SIDE_COLOR[g.side] ? g.side : 'Both') : colorBy === 'relation' ? (relationOf(g) in REL_COLOR ? relationOf(g) : '') : null);
const seatColor = (g) => (g && colorBy !== 'off' ? (colorBy === 'side' ? SIDE_COLOR : REL_COLOR)[seatKey(g)] : null);
function legendHTML() {
  if (colorBy === 'off' || space !== 'reception') return '';
  const used = new Set(state.guests.filter((g) => isSeated(g) && g.rsvp !== 'Declined').map(seatKey));
  const pal = colorBy === 'side' ? SIDE_COLOR : REL_COLOR;
  return Object.keys(pal).filter((k) => used.has(k)).map((k) => `<span><i style="background:${pal[k]}"></i>${esc(k || 'No relation')}</span>`).join('');
}

/** Toolbar icons: plain 24px line glyphs (functional, not decorative). Buttons carry aria-label + title. */
const ICONS = {
  round: '<circle cx="12" cy="12" r="7"/>', rect: '<rect x="4" y="7" width="16" height="10" rx="1"/>', row: '<path d="M4 8h16M4 12h16M4 16h16"/>',
  high: '<circle cx="12" cy="9" r="4"/><path d="M12 13v7M8 20h8"/>', area: '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 3"/>',
  photo: '<rect x="3" y="6" width="18" height="13" rx="1.5"/><circle cx="12" cy="12.5" r="3"/>', fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  evening: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', walk: '<circle cx="12" cy="5" r="2"/><path d="M12 8v6l-3 6M12 14l3 6M8 11l4-2 4 2"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  light: '<path d="M12 3v3M5 6l2 2M19 6l-2 2"/><circle cx="12" cy="13" r="4"/><path d="M10 19h4"/>',
};
const toolIcon = (k, label, attrs = '') => `<button class="tool icon" ${attrs} aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg></button>`;

/** Layout ideas: real reference photos, each mapped to the closest suggestion style (see VENUE.md). */
const IDEAS = [
  { key: 'round8', src: 'assets/refs/owner-ref-r5-13.png' },
  { key: 'round10', src: 'assets/venue/site/morais-vineyards-wedding-photo-191-scaled.jpg' },
  { key: 'family', src: 'assets/refs/owner-ref-r5-11.webp' },
  { key: 'banquet', src: 'assets/refs/owner-ref-r5-10.webp' },
  { key: 'headlong', src: 'assets/refs/owner-ref-r5-12.webp' },
  { key: 'stage', src: 'assets/refs/owner-ref-5.png' },
  { key: 'open', src: 'assets/refs/owner-ref-6.webp' },
];

/* ---------------- backdrop: a soft blurred photo of the space being planned (real photos only), crossfading when the space changes ---------------- */
const BACKDROP = { reception: 'assets/venue/ballroom.jpg', ceremony: 'assets/venue/knot/022_60ec6619.jpg', indoor: 'assets/venue/site/ceremony-locations-indoor-ceremony-1.jpg', cocktail: 'assets/venue/knot/056_229129c2.jpg', tasting: 'assets/venue/tasting-room.jpg' };
let bgEl = null;
function setBackdrop(src) {
  if (!bgEl || !bgEl.isConnected) { bgEl = document.createElement('div'); bgEl.className = 'seat-bg'; bgEl.setAttribute('aria-hidden', 'true'); document.body.prepend(bgEl); }
  document.body.classList.add('seat-on');
  if (bgEl.dataset.src === src) return;
  bgEl.dataset.src = src;
  const img = document.createElement('div'); img.className = 'seat-bg-img'; img.style.backgroundImage = `url("${src}")`;
  bgEl.append(img);
  requestAnimationFrame(() => requestAnimationFrame(() => img.classList.add('on')));
  const old = [...bgEl.querySelectorAll('.seat-bg-img')].slice(0, -1);
  setTimeout(() => old.forEach((o) => o.remove()), 900);
}
function clearBackdrop() { document.body.classList.remove('seat-on'); bgEl?.remove(); bgEl = null; }

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
  const seated = guestsAt(t.id);
  const chairs = chairPositions(t).map(([x, y], k) => {
    const ph = showPhotos && space === 'reception' ? seated[k]?.photo : null, col = k < n ? seatColor(seated[k]) : null;
    const st = [col && `fill:${col}`, k < n && k >= before && enterAnim && `animation-delay:${delay(k)}ms`].filter(Boolean).join(';');
    return `<circle class="chair${k < n ? ' filled' : ''}${k < n && k >= before ? ' pop' : ''}" cx="${x}" cy="${y}" r=".75"${st ? ` style="${st}"` : ''}/>`
      + (ph ? `<g transform="translate(${x} ${y}) rotate(${-rot})" class="seat-photo"><clipPath id="cp-${t.id}-${k}"><circle r=".75"/></clipPath><image href="${esc(ph)}" x="-.75" y="-.75" width="1.5" height="1.5" preserveAspectRatio="xMidYMid slice" clip-path="url(#cp-${t.id}-${k})"/></g>` : '');
  }).join('');
  const [bloom, leaf] = [mood.swatches[3], mood.swatches[1]];
  let top, room;
  if (t.shape === 'row') {
    const L = t.seats * 2;
    room = 0;
    top = `<rect class="row-hit" x="${-L / 2}" y="-1.1" width="${L}" height="2.2" rx="1.1"/>`;
  } else if (t.shape === 'round') {
    const r = tableR(t);
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
  const turnedHead = isHead && t.shape === 'rect' && !!(rot % 180);
  const roundHead = isHead && t.shape === 'round' && !!t.arc; // sweetheart table on the stage: name in two short lines on the top
  const ly = t.shape === 'round' ? fs * 0.35 : row ? 0 : turnedHead ? rectDims(t).L / 2 + 2 : (rot % 180 ? 0 : rectDims(t).D / 2 + (t.sides.bottom ? 3.6 : 1.6));
  const D0 = row ? 1.8 : t.shape === 'round' ? (t.arc ? tableR(t) * 2 : 0) : rectDims(t).D;
  const knob = sel?.id === t.id && (t.shape !== 'round' || t.arc) ? `<g transform="rotate(${rot})">${rotHandle(0, -(D0 / 2 + 4.2), 0, -D0 / 2)}</g>` : '';
  const inner = `<g transform="rotate(${rot})">${chairs}${top}</g>
    ${row ? '' : roundHead ? `<text class="head-label" y="-.2" style="font-size:.95px">${esc(t.name).replace(/^(.*?\S)\s+(\S+)$/, '<tspan x="0">$1</tspan><tspan x="0" dy="1.1">$2</tspan>')}</text>` : turnedHead ? `<text class="head-label" y="${ly}" style="font-size:1.3px">${esc(t.name).replace(/^(.*?\S)\s+(\S+)$/, '<tspan x="0">$1</tspan><tspan x="0" dy="1.5">$2</tspan>')}</text>` : `<text class="${isHead ? 'head-label' : 'num'}" y="${ly}" style="font-size:${isHead ? 1.5 : fs}px">${esc(t.name)}</text>`}${knob}`;
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

/** Who stands at the altar comes from the Relationship category on the Guests page: Bridesmaid on the left, Groomsman on the right.
 *  A team member keeps their team id as the key, so a saved order survives. Set someone to "—" (e.g. Layout & Flow helpers) and they leave the party. */
function partyPool() {
  const ok = (g) => g.rsvp !== 'Declined' && g.party !== 'couple';
  const pick = (rel, side) => state.guests.filter((g) => ok(g) && relationOf(g) === rel).map((g) => ({ id: g.personId || g.id, name: g.name, side }));
  return [...pick('Bridesmaid', 'b'), ...pick('Groomsman', 'g')];
}

function fixedSVG() {
  const { w, h, fixed } = SP().room;
  let s = '';
  // Balcony overhead (dashed — it's floor space underneath)
  if (fixed.balcony) {
    const d = fixed.balcony.depth;
    s += `<rect class="balcony" x="0" y="${h - d}" width="${w}" height="${d}"/><text class="fixed-label" x="${w / 2}" y="${h - d + 2.2}">Balcony above</text>`;
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
    } else if (d.kind === 'pergola') {
      s += `<rect class="dc-pergola" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}"/>`;
      [[0, 0], [1, 0], [0, 1], [1, 1], [1 / 3, 0], [2 / 3, 0], [1 / 3, 1], [2 / 3, 1]].forEach(([fx, fy]) => { s += `<rect class="dc-col" x="${d.x + fx * d.w - 0.5}" y="${d.y + fy * d.h - 0.5}" width="1" height="1"/>`; });
      s += `<text class="fixed-label" x="${mx}" y="${d.y + d.h - 1}">${esc(d.label || '')}</text>`;
    } else if (d.kind === 'balustrade') s += `<rect class="dc-stone" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}"/>${d.label ? `<text class="fixed-label" x="${mx}" y="${d.y + d.h + 1.6}">${esc(d.label)}</text>` : ''}`;
    else if (d.kind === 'building') s += `<rect class="dc-building" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}"/>${d.label ? `<text class="fixed-label" x="${mx}" y="${my + .5}">${esc(d.label)}</text>` : ''}`;
    else if (d.kind === 'fountain') s += `<circle class="dc-fountain" cx="${mx}" cy="${my}" r="${d.w / 2}"/><circle class="dc-fountain-in" cx="${mx}" cy="${my}" r="${d.w * 0.2}"/><text class="fixed-label" x="${mx}" y="${my + d.w / 2 + 1.6}">${esc(d.label || '')}</text>`;
    else if (d.kind === 'tree') s += `<circle class="dc-tree" cx="${mx}" cy="${my}" r="${d.w / 2}"/>${d.label ? `<text class="fixed-label" x="${mx}" y="${my + .5}">${esc(d.label)}</text>` : ''}`;
    else if (d.kind === 'bar') s += `<rect class="dc-bar" x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" rx="1.1"/><text class="fixed-label" x="${mx}" y="${d.y + d.h + 1.6}">Bar</text>`;
  });
  if (kindOf() === 'ceremony') s += partySVG(SP().room, partyPool(), enterAnim, partySel, (id) => hexOfPerson(state.people, id)); // wedding party dots
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
      if (o.kind === 'entrance' && o.wall === 'bottom') s += `<text class="fixed-label entrance" x="${o.at}" y="${h - 1.6}">Entrance</text>`;
    }
  });
  if (fixed.stage) s += stageSVG(fixed.stage);
  return s;
}

/**
 * The stage: a domed octagonal bay with columns, OUTSIDE the hall (u = along the wall, v = out of the hall), 3 curved tile-faced steps that reach
 * only ~4.5 ft in (photos #031, #061, #100, Matterport). Drawn after the walls so it reads as an opening in the wall.
 */
function stageSVG(st) {
  const top = st.wall === 'top', d = st.d || 15, r = st.r, k = d / 15, steps = st.steps || 3, reach = st.stepD ?? 4.5;
  const P = (u, v) => (top ? [st.cx + u, -v] : [-v, st.cy + u]);
  const poly = (pts, cls) => `<polygon class="${cls}" points="${pts.map(([u, v]) => P(u, v).map((n) => +n.toFixed(2)).join(',')).join(' ')}"/>`;
  const half = [[-r, 0], [-r, 5 * k], [-6.5, 11 * k], [-3, d]]; // left half, then mirrored
  let s = poly([...half, ...half.slice().reverse().map(([u, v]) => [-u, v])], 'stage-bay');
  for (let i = 0; i < steps; i++) { // outermost step is the lowest and widest
    const e = reach * (1 - i / steps), hw = r - i * 0.7, pts = [];
    for (let a = 0; a <= 16; a++) { const th = (a / 16) * Math.PI; pts.push([hw * Math.cos(th), -e * Math.sin(th)]); }
    s += poly(pts, `stage s${i}`);
  }
  [-r, r].forEach((u) => { const [x, y] = P(u, 0); s += `<circle class="stage-col" cx="${x}" cy="${y}" r=".8"/>`; });
  const [lx, ly] = P(0, d - 1.8);
  return s + `<text class="fixed-label" x="${lx}" y="${ly + .4}">Stage</text>`;
}

function planSVG() {
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
  const floorFill = { pavers: 'url(#pavers)', tile: 'url(#tile)', lawn: '#dde6cb', concrete: '#e8e4d8' }[SP().room.floor]; // flat colors only
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
    let nx = Math.min(Math.max(snap(p.x - drag.dx), x0), x1);
    let ny = Math.min(Math.max(snap(p.y - drag.dy), y0), y1);
    // The sweetheart table and the cake table may go up into the stage bay (left long wall, outside the hall); there they stay on the platform
    const st = SP().room.fixed?.stage;
    if (st && st.wall !== 'top' && (area ? it.preset === 'cake' : it.id === 'head')) {
      const hw = area ? it.w / 2 : fpd.hw - 1.2, hh = area ? it.h / 2 : fpd.hh - 1.2, d = st.d || 15;
      const wantX = snap(p.x - drag.dx) + (area ? it.w / 2 : 0), wantY = snap(p.y - drag.dy) + (area ? it.h / 2 : 0);
      if (wantX - hw < 0 && wantY > st.cy - st.r - 0.5 && wantY < st.cy + st.r + 0.5) {
        const cx = Math.max(-d + hw + 1.5, wantX), cy = Math.min(Math.max(wantY, st.cy - st.r + hh + 0.5), st.cy + st.r - hh - 0.5);
        nx = area ? cx - it.w / 2 : cx; ny = area ? cy - it.h / 2 : cy;
      }
    }
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
        ? `<li class="taken" style="--i:${i}"><i aria-label="Seat ${i + 1}">${i + 1}</i><span>${esc(g.name)}</span>${g.party === 'couple' ? '' : `<button class="x" data-unseat="${g.id}" aria-label="Remove ${esc(g.name)}">×</button>`}</li>`
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

/** The layout as one picture: the plan in the middle, Betel's Pinterest photos shuffled in a frame around it (a different mix every save). Shared via the phone share sheet when possible. */
async function sharePicture(source) {
  const mood = moodNow();
  let plan;
  if (source.kind === 'svg') plan = await planPicture(source.el);
  else { const img = await loadImg(source.el.toDataURL('image/png')); plan = { img, W: 1500, H: Math.round(1500 * img.height / img.width) }; }
  const pool = (await Promise.all(state.inspo.map((p) => loadImg(p.src).catch(() => null)))).filter(Boolean);
  const T = 290, gap = 14, M = T + gap;
  const W = plan.W + M * 2, H = plan.H + M * 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#f7f3ea'; x.fillRect(0, 0, W, H);
  await document.fonts.ready;
  // shuffled photos, cycling when there are fewer than frame spots
  const order = []; const shuffle = () => { const a = pool.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const next = () => { if (!order.length) order.push(...shuffle()); return order.pop(); };
  const tile = (rx, ry, rw, rh) => {
    const im = pool.length ? next() : null;
    x.save(); x.beginPath(); x.roundRect(rx, ry, rw, rh, 12); x.clip();
    if (im) { const k = Math.max(rw / im.width, rh / im.height), cw = rw / k, ch = rh / k; x.drawImage(im, (im.width - cw) / 2, (im.height - ch) / 2, cw, ch, rx, ry, rw, rh); }
    else { x.fillStyle = '#e6dccb'; x.fillRect(rx, ry, rw, rh); }
    x.restore();
  };
  const cols = Math.max(3, Math.round((W + gap) / (T + gap))), tw = (W - gap * (cols - 1)) / cols;
  const rows = Math.max(2, Math.round((plan.H + gap) / (T + gap))), th = (plan.H - gap * (rows - 1)) / rows;
  const titleAt = 0;   // the name card takes the top-left spot
  for (let i = 0; i < cols; i++) {
    if (i === titleAt) continue;
    tile(i * (tw + gap), 0, tw, T);
  }
  for (let i = 0; i < cols; i++) tile(i * (tw + gap), H - T, tw, T);
  for (let r = 0; r < rows; r++) { tile(0, M + r * (th + gap), T, th); tile(W - T, M + r * (th + gap), T, th); }
  // name card
  x.fillStyle = '#6e1f2e'; x.beginPath(); x.roundRect(0, 0, tw, T, 12); x.fill();
  x.fillStyle = '#f6eee3'; x.textBaseline = 'alphabetic';
  x.font = '500 46px Cinzel, Georgia, serif';
  x.fillText('BETEL &', 34, 120); x.fillText('CARTER', 34, 176);
  x.font = '400 22px "Pinyon Script", "Cormorant Garamond", Georgia, serif';
  x.fillText('are getting married', 34, 220);
  x.font = '500 17px Inter, Helvetica, sans-serif';
  x.fillText('JUNE 17, 2027', 34, T - 52);
  x.fillText('MORAIS VINEYARDS', 34, T - 26);
  // the plan
  x.save(); x.shadowColor = 'rgba(40,20,24,.3)'; x.shadowBlur = 28; x.shadowOffsetY = 8;
  x.fillStyle = '#fff'; x.beginPath(); x.roundRect(M, M, plan.W, plan.H, 10); x.fill(); x.restore();
  x.save(); x.beginPath(); x.roundRect(M, M, plan.W, plan.H, 10); x.clip(); x.drawImage(plan.img, M, M, plan.W, plan.H); x.restore();
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

/* ---------------- page ---------------- */
/** Older plans may have tables under the balcony rail: move those to the nearest free spot (seats move with the table). */
function clearBalcony() {
  const bal = state.room?.fixed?.balcony; if (!bal) return;
  const edge = state.room.h - bal.depth;
  const under = (t) => t.id !== 'head' && t.y + footprint(t).hh > edge + 0.01;
  const moved = state.tables.filter(under);
  moved.forEach((t) => {
    const rest = state.tables.filter((o) => o !== t);
    Object.assign(t, findFreeSpot(state.room, rest, t));
  });
  if (moved.length) commit({ silent: true });
}
/** The first Hangout-spot seed had tables 0.4 ft apart (every one but two flagged). A saved plan that still holds exactly that seed gets the conflict-free one; anything she moved is left alone. */
const OLD_HANGOUT = '13,9|27,9|41,9|10.5,17|10.5,27|49,17|41,30|49,31';
function healHangout() {
  let changed = false;
  for (const id of ['cocktail', 'tasting']) {
    const sp = state.spaces?.[id]; if (!sp?.tables?.length || sp.healed10) continue;
    sp.healed10 = true; changed = true; // once only: later hand-placed tables are never moved
    if (id === 'cocktail' && sp.tables.map((t) => t.x + ',' + t.y).join('|') === OLD_HANGOUT) { sp.tables = seedSpaces().cocktail.tables; changed = true; continue; }
    // a layout the old Suggest left with tables too close (nobody sits at hangout tables, so nothing is lost): lay it out again without conflicts, only when that fits
    if (clearanceIssues(sp.room, sp.tables, 1.5).items.length) { for (let k = sp.tables.length; k >= 2; k--) { const r = suggestHangout(structuredClone(sp.room), k * (sp.room.bistro ? 7.5 : 10)); if (r.fits) { sp.tables = r.tables; changed = true; break; } } }
  }
  if (changed) commit({ silent: true });
}
const SPACE_IDS = ['reception', 'ceremony', 'indoor', 'cocktail', 'tasting'];
const THREE_SPACES = ['reception', 'ceremony', 'cocktail', 'tasting'];
export function renderSeating(root) {
  // '#seating' = the venue map (entry view); '#seating/<space>' = that space's editor
  const sub = location.hash.slice(1).split('/')[1];
  if (!SPACE_IDS.includes(sub)) {
    cleanup?.abort(); cleanup = new AbortController();
    { const c = cleanup; addEventListener('hashchange', () => c.abort(), { once: true }); } // leaving the map drops its listeners and lightbox
    threeInst?.dispose(); threeInst = null;
    document.querySelectorAll('.pop-backdrop').forEach((b) => b.remove());
    setBackdrop(MAP_PHOTO);
    renderVenueMap(root, { signal: cleanup.signal });
    return;
  }
  if (sub !== space) { // arrived by URL (map, agenda link, back/forward): open that space fresh
    space = sub; sel = null; view = null; enterAnim = true; lastFilled.clear(); partySel = null;
    if (sub === 'ceremony' || sub === 'indoor') cerVariant = sub;
    mode = sub === 'reception' ? '3d' : 'plan';
  }
  clearBalcony(); healHangout();
  const rec = space === 'reception';
  setBackdrop(BACKDROP[space] || BACKDROP.reception);
  if (!THREE_SPACES.includes(space)) mode = 'plan'; // 3D: the ballroom, the ceremony lawn, the courtyard and the tasting room (not the indoor bay yet)
  const info = spaceInfo();
  const vow = rec;
  const PLANFILE = `<div class="plan-file"><span>Plan file</span><button class="linkbtn" id="exportBtn">Export</button><button class="linkbtn" id="importBtn">Import</button><input type="file" id="importFile" accept="application/json" hidden/></div>`;
  if (vow && mode === 'plan' && vsTab !== 'guests') refTab = vsTab === 'look' ? 'venue' : 'ideas';
  const toolsHTML = `
          ${THREE_SPACES.includes(space) ? `<div class="viewseg tool-seg view-fixed" role="tablist" aria-label="View"><button type="button" role="tab" data-mode="3d" aria-selected="${mode === '3d'}" class="${mode === '3d' ? 'on' : ''}">3D</button><button type="button" role="tab" data-mode="plan" aria-selected="${mode === 'plan'}" class="${mode === 'plan' ? 'on' : ''}">Plan</button></div>` : ''}
          <div class="plan-tools">
            ${mode === 'plan' ? `
              ${info.add === 'row' ? toolIcon('row', 'Add row', 'data-add="row"')
                : info.add === 'high' ? toolIcon('high', 'Add high-top', 'data-add="high"')
                : toolIcon('round', 'Add round table', 'data-add="round"') + toolIcon('rect', 'Add rectangle table', 'data-add="rect"')}
              <span class="tool-wrap">${toolIcon('area', 'Add area', 'id="areaBtn" aria-expanded="false"')}
                <div class="chipmenu" id="areaMenu" hidden>${Object.entries(AREA_PRESETS).filter(([k]) => info.areas.includes(k)).filter(([k]) => !['dance', 'altar', 'aisle'].includes(k) || !SP().room.areas.some((a) => a.preset === k)).map(([k, p]) => `<button data-preset="${k}">${k === 'custom' ? '+ Custom' : esc(p.label)}</button>`).join('')}</div>
              </span>
              ${rec && state.guests.some((g) => g.photo) ? `${toolIcon('photo', 'Show guest photos', `id="photosBtn" aria-pressed="${showPhotos}"`).replace('class="tool icon"', `class="tool icon${showPhotos ? ' on' : ''}"`)}` : ''}
              ${rec ? `<label class="colorby">Color by<select id="colorBy" aria-label="Color seats by">${[['side', 'Side'], ['relation', 'Relation'], ['off', 'Off']].map(([k, l]) => `<option value="${k}"${colorBy === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
              <span class="spacer"></span>
              <span class="zoom"><button class="tool icon" id="zOut" aria-label="Zoom out">−</button><button class="tool icon" id="zIn" aria-label="Zoom in">+</button>${toolIcon('fit', 'Fit to view', 'id="zFit"')}</span>
              ${rec ? `<span class="tool-wrap" id="sugWrap"><button class="tool" id="sugBtn" aria-expanded="false" aria-haspopup="dialog">Suggest</button>
                <div class="glass-pop" id="sugPop" role="dialog" aria-label="Suggest or auto-add" hidden>
                  <label class="sg-count">Guests<input class="input" id="sCount" type="number" min="2" max="300" value="${state.guestTarget}"/></label>
                  <div class="sg-styles" role="radiogroup" aria-label="Layout style">${Object.entries(TABLE_STYLES).map(([k, st]) => `<button type="button" role="radio" data-style="${k}" aria-checked="false">${st.label}</button>`).join('')}</div>
                  <p class="sg-prev" id="sPreview"></p>
                  <div class="sg-acts"><button class="btn moss sm" id="sGo">Suggest floor plan</button><button class="btn sm ghost" id="sSeat">Auto-seat guests</button></div>
                </div></span>` : ''}`
            : `${toolIcon('walk', 'Walk through', 'id="walk" aria-pressed="false"')}
               ${toolIcon('light', 'Candlelight', 'id="light"')}
               ${vow ? toolIcon('eye', 'Experience the evening', 'id="evening"') : ''}
               ${document.fullscreenEnabled ? toolIcon('fit', 'Full screen', 'id="full3"') : ''}`}
            <button class="tool" id="hdrUndo" type="button" disabled>Undo</button>
            <button class="btn moss sm icon-btn" id="share" aria-label="Save the layout as a picture" title="Save the layout as a picture"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </div>
`;
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="sr-only">${esc(info.label)}</h1>

        <div class="spaces" role="tablist" aria-label="Spaces">
          ${(() => { const tb = (x, c) => `<button role="tab" data-space="${x.id}" aria-selected="${tabOn(x.id)}" class="${c}${tabOn(x.id) ? ' on' : ''}">${x.label}</button>`, l = tabList(); return `<div class="sp-row sp-row-sub">${l.map((x) => tb(x, 'sp-sub')).join('')}</div>`; })()}
          <span class="spaces-ink" aria-hidden="true"></span>
        </div>
        ${kindOf() === 'ceremony' ? `<div class="viewseg cer-seg" role="tablist" aria-label="Ceremony setting">${CER_VARIANTS.map(([id, l]) => `<button role="tab" data-variant="${id}" aria-selected="${space === id}" class="${space === id ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
        <p class="lede" id="lede"></p>
        ${kindOf() === 'cocktail' ? `<p class="space-note">Optional · ${SP().room.name === 'Tasting room' ? 'wine tasting and mingling' : 'just for mingling'}</p>` : ''}
      </div>

      <div class="ph-right"><nav class="vm-crumb" aria-label="Breadcrumb"><a href="#seating" title="Back to the venue map"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Morais map</a><span aria-hidden="true">/</span><b aria-current="page">${esc(info.label)}</b></nav>
        ${rec ? '<a class="tour-link" href="https://my.matterport.com/show/?m=K76R3QeJThF&brand=0" target="_blank" rel="noopener">Venue 360° tour ↗</a>' : ''}</div>
    </div>
    <div class="seat-layout${vow ? ' vow' : mode === 'plan' ? ' is-plan' : ''}" data-mode="${mode}">
      ${vow ? `<aside class="side-panel vow-side" data-tab="${vsTab}">${vowSideHTML(info)}</aside>` : ''}
      <div class="plan-col">
        <div class="card plan-card">
          ${vow ? '' : toolsHTML}
          <div class="stage-wrap" id="stageWrap">
            ${vow ? toolsHTML : ''}
            ${mode === 'plan' ? '<div class="plan-meta" id="planMeta"><span class="pm-dim"><span id="pmDim"></span></span><button type="button" class="pm-clear" id="pmClear" aria-haspopup="true" aria-expanded="false" aria-controls="pmClearList"></button><div class="pm-clear-list" id="pmClearList" role="group" aria-label="Clearance conflicts" hidden></div></div>' : ''}
            <div id="planHost"></div>
            <div class="color-legend" id="legend"${rec && mode === 'plan' && legendHTML() ? '' : ' hidden'}>${rec ? legendHTML() : ''}</div>
            <div class="pop" id="pop" role="dialog" aria-label="Details" hidden></div>
            ${vow && mode === '3d' ? `<p class="hero-stats" id="heroStats">${statsText()}</p>` : ''}
          </div>
        </div>
      </div>
      ${vow ? '' : `<aside class="side-panel">
        ${rec ? '' : spaceToolsHTML(kindOf(), { state, SP, pool: partyPool })}
        ${groupsFor(space).length ? `<section class="card look-card" aria-label="Look"><h3>Look</h3>${lookHTML(space, state.style)}</section>` : ''}
        ${refHTML(rec)}
      </aside>`}
      ${vow ? '' : PLANFILE}
    </div>
    ${venueStripHTML()}
    ${vow ? PLANFILE : ''}`;

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
  const sugBtn = root.querySelector('#sugBtn'), sugPop = root.querySelector('#sugPop');
  const closeSug = () => { if (sugPop && !sugPop.hidden) { sugPop.hidden = true; sugBtn.setAttribute('aria-expanded', 'false'); } };

  cleanup?.abort();
  cleanup = new AbortController();
  const { signal } = cleanup;
  threeInst?.dispose(); threeInst = null;
  let three = null;
  wireMorais(root, signal);

  /* ---- spaces: ceremony · cocktail · reception ---- */
  const tabs = root.querySelector('.spaces'), ink = tabs.querySelector('.spaces-ink');
  const moveInk = (b) => { ink.style.setProperty('--x', b.offsetLeft + 'px'); ink.style.setProperty('--y', b.offsetTop + b.offsetHeight - 2 + 'px'); ink.style.setProperty('--w', b.offsetWidth + 'px'); };
  if (inkFrom) { // glide the underline from the tab that was just left
    ink.style.transition = 'none'; ink.style.setProperty('--x', inkFrom.x + 'px'); ink.style.setProperty('--y', inkFrom.y + 'px'); ink.style.setProperty('--w', inkFrom.w + 'px');
    void ink.offsetWidth; ink.style.transition = ''; inkFrom = null;
  }
  moveInk(tabs.querySelector('.on'));
  document.fonts?.ready.then(() => tabs.isConnected && moveInk(tabs.querySelector('.on')));
  const goSpace = (id, from) => {
    if (id === space) return;
    if (id === 'ceremony' || id === 'indoor') cerVariant = id;
    space = id; sel = null; view = null; enterAnim = true; lastFilled.clear();
    if (space === 'reception') mode = '3d';
    history.replaceState(null, '', `#seating/${id}`); // the URL follows the tab (no hashchange, so no page reload)
    const was = tabs.querySelector('.on');
    inkFrom = { x: was.offsetLeft, y: was.offsetTop + was.offsetHeight - 2, w: was.offsetWidth };
    renderSeating(root);
  };
  tabs.querySelectorAll('[data-space]').forEach((b) => b.onclick = () => goSpace(b.dataset.space === 'ceremony' ? cerVariant : b.dataset.space));
  root.querySelectorAll('[data-variant]').forEach((b) => b.onclick = () => goSpace(b.dataset.variant));

  let inspect = () => {};
  /* ---- reception sidebar (Layout / Seat guests / Look), units, "In your plan" inspector ---- */
  if (rec) {
    const side = root.querySelector('.vow-side');
    const applyVs = (k, click = true) => {
      vsTab = k; side.dataset.tab = k;
      side.querySelectorAll('[data-vs]').forEach((b) => { b.classList.toggle('on', b.dataset.vs === k); b.setAttribute('aria-selected', String(b.dataset.vs === k)); });
      if (click && mode === 'plan' && k !== 'guests') side.querySelector(`[data-ref="${k === 'look' ? 'venue' : 'ideas'}"]`)?.click();
    };
    side.querySelectorAll('[data-vs]').forEach((b) => b.onclick = () => applyVs(b.dataset.vs));
    applyVs(vsTab, false);
    root.querySelectorAll('[data-units]').forEach((b) => b.onclick = () => setUnits(b.dataset.units));
    root.querySelectorAll('.vs-add[data-preset]').forEach((b) => b.onclick = () => root.querySelector(`#areaMenu [data-preset="${b.dataset.preset}"]`)?.click());
    const body = root.querySelector('#inspBody');
    if (body) {
      const L = (v) => fmtLen(v);
      const field = (key, label, val, step = 0.5) => `<label class="insp-f"><span>${label} (${unitLbl()})</span><input class="input" data-k="${key}" type="number" step="${units === 'm' ? 0.05 : step}" value="${L(val)}"/></label>`;
      inspect = () => {
        const it = findItem(sel);
        if (!it) { body.innerHTML = '<p class="vs-note">Tap a table or area on the plan to edit it here.</p>'; return; }
        const area = sel.kind === 'area', name = area ? it.label : it.id === 'head' ? it.name : `Table ${it.name}`;
        const cx = area ? it.x + it.w / 2 : it.x, cy = area ? it.y + it.h / 2 : it.y;
        body.innerHTML = `<h4 class="insp-title">${esc(name)}</h4>
          <div class="insp-grid">${area ? field('w', 'Width', it.w) + field('h', 'Depth', it.h) : it.shape === 'rect' ? field('tw', 'Width', rectDims(it).L) + field('td', 'Depth', rectDims(it).D) : ''}${field('x', 'Across', cx)}${field('y', 'Along', cy)}
            <label class="insp-f"><span>Rotation (deg)</span><input class="input" data-k="rot" type="number" step="15" value="${Math.round(it.rot || 0)}"/></label></div>
          <div class="insp-acts"><button type="button" class="btn sm ghost" id="inRot">Rotate 90°</button><button type="button" class="btn sm ghost" id="inDel">Remove</button></div>`;
        const apply = (k, raw) => {
          const v = +raw; if (!Number.isFinite(v)) return inspect();
          const r = SP().room, before = { x: it.x, y: it.y, w: it.w, h: it.h, rot: it.rot }, prev = { len: it.len, dep: it.dep };
          if (k === 'rot') it.rot = ((Math.round(v) % 360) + 360) % 360;
          else if (k === 'tw' || k === 'td') { const f = fromLen(v); if (k === 'tw') it.len = Math.max(3, Math.min(30, f)); else it.dep = Math.max(2.6, Math.min(12, f)); before.len = prev.len; before.dep = prev.dep; }
          else if (area) {
            const f = fromLen(v);
            if (k === 'w') it.w = Math.max(2, Math.min(r.w, f)); else if (k === 'h') it.h = Math.max(2, Math.min(r.h, f));
            if (k === 'x') it.x = f - it.w / 2; if (k === 'y') it.y = f - it.h / 2;
            it.x = Math.max(0, Math.min(r.w - it.w, it.x)); it.y = Math.max(0, Math.min(r.h - it.h, it.y));
          } else {
            const f = fromLen(v); if (k === 'x') it.x = Math.max(0, Math.min(r.w, f)); if (k === 'y') it.y = Math.max(0, Math.min(r.h, f));
          }
          if (!area && collides(it)) { Object.assign(it, before); toast(space === 'reception' ? 'Needs a little more room there' : 'That spot overlaps the building, fountain or another table'); }
          commit({ silent: true }); drawPlan();
        };
        body.querySelectorAll('input[data-k]').forEach((i) => i.onchange = () => apply(i.dataset.k, i.value));
        body.querySelector('#inRot').onclick = () => apply('rot', (it.rot || 0) + 90);
        body.querySelector('#inDel').onclick = () => {
          const id = it.id; sel = null; closePop();
          if (area) leave(host.querySelector(`.area[data-id="${CSS.escape(id)}"]`), () => localUndo(`${it.label} removed`, () => { SP().room.areas = SP().room.areas.filter((x) => x.id !== id); }));
          else leave(host.querySelector(`.tbl[data-id="${CSS.escape(id)}"]`), () => localUndo(`${/^\d+$/.test(it.name) ? 'Table ' + it.name : it.name} removed`, () => { state.guests.forEach((g) => { if (g.tableId === id) g.tableId = null; }); SP().tables = SP().tables.filter((x) => x.id !== id); }));
        };
      };
      inspect();
    }
  }

  /* ---- view mode ---- */
  root.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => {
    if (mode === b.dataset.mode || wrap.classList.contains('leaving')) return;
    const go = () => { mode = b.dataset.mode; sel = null; modeAnim = true; renderSeating(root); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return go();
    closePop(true); wrap.classList.add('leaving'); setTimeout(go, 200);
  });
  if (modeAnim) { modeAnim = false; wrap.classList.add('mode-in'); wrap.addEventListener('animationend', () => wrap.classList.remove('mode-in'), { once: true }); }

  /* ---- 2D plan ---- */
  const legend = root.querySelector('#legend');
  // Dimensions (Feet / Metres toggle) and the clearance check: chairs closer than 3.5 ft, stage steps, doors and the balcony rail
  const setUnits = (v) => {
    units = v; try { localStorage.setItem('seat-units', units); } catch { /* ignore */ }
    planMeta(); inspect();
    root.querySelectorAll('[data-units]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.units === units)));
    const r = SP().room, W = root.querySelector('#vsW'), L = root.querySelector('#vsL');
    if (W) W.textContent = `${fmtLen(r.w)} ${unitLbl()}`; if (L) L.textContent = `${fmtLen(r.h)} ${unitLbl()}`;
  };
  const planMeta = () => {
    const dimEl = root.querySelector('#pmDim'), clr = root.querySelector('#pmClear');
    if (!dimEl) return;
    const r = SP().room, m = units === 'm', f = (v) => (m ? (v * 0.3048).toFixed(2) : String(Math.round(v * 10) / 10));
    dimEl.textContent = `${f(r.w)} × ${f(r.h)} ${m ? 'm' : 'ft'}${r.approx || space === 'reception' ? ' · estimate' : ''}`;
    const c = clearanceIssues(r, SP().tables, kindOf() === 'cocktail' ? 1.5 : 3.5); // standing high-tops need less aisle than seated rounds
    clr.textContent = c.items.length ? `Clearance: ${c.items.length} conflict${c.items.length > 1 ? 's' : ''}` : 'Clearance: no conflicts';
    clr.classList.toggle('bad', c.items.length > 0);
    clr.removeAttribute('title');
    const list = root.querySelector('#pmClearList');
    if (list) {
      list.innerHTML = c.items.length ? c.items.map((it, k) => `<button type="button" class="pm-item" data-ci="${k}">${esc(it.short)}</button>`).join('') : '<p>Every table has room to walk around it.</p>';
      list.querySelectorAll('.pm-item').forEach((b) => b.onclick = () => {
        const it = c.items[+b.dataset.ci]; if (!it) return;
        partySel = null; sel = { kind: 'table', id: it.ids[0] }; drawPlan();
        it.ids.forEach((id) => host.querySelector(`.tbl[data-id="${CSS.escape(id)}"]`)?.classList.add('clash-pick'));
        const l2 = root.querySelector('#pmClearList'); if (l2) l2.hidden = false;
        root.querySelector('#pmClear')?.setAttribute('aria-expanded', 'true');
        root.querySelector(`#pmClearList [data-ci="${b.dataset.ci}"]`)?.focus();
      });
      clr.onclick = () => { const o = list.hidden; list.hidden = !o; clr.setAttribute('aria-expanded', String(o)); };
      list.onkeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); list.hidden = true; clr.setAttribute('aria-expanded', 'false'); clr.focus(); } };
    }
    host.querySelectorAll('.tbl').forEach((g) => {
      if (!c.ids.has(g.dataset.id)) return;
      const t = SP().tables.find((x) => x.id === g.dataset.id), fp = t && footprint(t);
      if (!fp) return;
      const ring = document.createElementNS(SVGNS, 'rect');
      ring.setAttribute('class', 'clash-ring'); ring.setAttribute('x', -fp.hw); ring.setAttribute('y', -fp.hh); ring.setAttribute('width', fp.hw * 2); ring.setAttribute('height', fp.hh * 2); ring.setAttribute('rx', 0.6);
      g.prepend(ring);
      const tri = document.createElementNS(SVGNS, 'g'); tri.setAttribute('class', 'clash-tri'); tri.setAttribute('transform', `translate(${fp.hw - 1.1} ${-fp.hh + 1.1})`);
      tri.innerHTML = '<title>Needs more room</title><path class="tri" d="M0 -1 L1 .8 L-1 .8 Z"/><path class="bang" d="M0 -.35 V.2 M0 .5 V.55"/>';
      g.append(tri);
    });
  };
  let wantLookUp = false; // a ceiling pick: glide up to the ceiling once the new scene is in
  let sceneStyle = ''; // the Look choices the current 3D scene was built with
  let pending3d = false; // a pick made while the scene is still being swapped in: swap once more when it lands
  let open3d = null; // (re)opens the 3D scene; set where the 3D view is built
  const drawPlan = () => {
    if (mode === '3d' && !rec && threeInst && open3d) { const old = threeInst; threeInst = null; open3d({ view: old.getView(), old }); return; } // an edit in the side panel: swap the scene in place
    if (mode === '3d' && !rec && !threeInst && open3d) { pending3d = true; return; }
    if (mode !== 'plan') return;
    host.replaceChildren(planSVG());
    planMeta(); inspect();
    if (legend) { const l = legendHTML(); legend.innerHTML = l; legend.hidden = !l; }
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
          toast(space === 'reception' ? 'Needs a little more room there' : 'That spot overlaps the building, fountain or another table');
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
    return blockers(SP().room, others, { areaPad: 0.5, noStage: t.id === 'head', soft: space !== 'reception' }).some((z) => me.x1 < z.x2 && me.x2 > z.x1 && me.y1 < z.y2 && me.y2 > z.y1);
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
    // the reception's 3D scene is not rebuilt by plan edits, but a Look change (pick or undo) must show up: swap it in place
    if (mode === '3d' && open3d && JSON.stringify(state.style || {}) !== sceneStyle) { if (threeInst) { const old = threeInst; threeInst = null; open3d({ view: old.getView(), old }); } else pending3d = true; }
    root.querySelectorAll('#sCount,#hCount').forEach((i) => { i.value = state.guestTarget; });
    root.querySelectorAll('#cCount').forEach((i) => { i.value = SP().room.chairs ?? state.guestTarget; });
    preview(); seatPanelRefresh(); syncLook(root, state.style);
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
  const histUndo = () => {
    if (hist.length < 2) return;
    hist.pop();
    const from = tablePos();
    Object.keys(state).forEach((k) => delete state[k]); Object.assign(state, JSON.parse(hist[hist.length - 1]));
    if (mode === 'plan') { resync(from); toast('Undone'); } else { commit(); renderSeating(root); }
    syncUndo();
  };
  { const u = root.querySelector('#hdrUndo'); if (u) u.onclick = histUndo; }
  if (hist[hist.length - 1] !== stamp()) { hist.length = 0; hist.push(stamp()); } // changed elsewhere: start a fresh stack
  syncUndo();
  const refresh = () => { commit({ silent: true }); drawPlan(); openPop(); lede(); };
  const lede = () => {
    root.querySelector('#lede').textContent = spaceLede();
    if (rec) root.querySelectorAll('#heroStats, #vsStats').forEach((el) => { el.textContent = statsText(); });
  };

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
        items = going().filter((g) => !isSeated(g) && (!q || g.name.toLowerCase().includes(q)))
          .sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name)).slice(0, 30);
        at = -1;
        if (!items.length) return hide();
        if (!list) { list = document.createElement('ul'); list.className = 'suggest'; list.setAttribute('role', 'listbox'); document.body.append(list); }
        list.innerHTML = items.map((g, i) => `<li role="option" data-i="${i}"><span>${esc(g.name)}</span></li>`).join('');
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
        let g = going().find((x) => !isSeated(x) && x.name.toLowerCase() === n.toLowerCase());
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
    if (e.key === 'Escape') closeSug();
    // Delete / Backspace removes the selected table, row or area while its popover is open
    if ((e.key === 'Delete' || e.key === 'Backspace') && !pop.hidden && !e.target.closest?.('input, textarea, select, [contenteditable]')) { e.preventDefault(); pop.querySelector('#tDel, #aDel')?.click(); }
  }, { signal });
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !wrap.contains(e.target) && !pop.contains(e.target)) closePop();
    if (!e.target.closest('#sugWrap')) closeSug();
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

    root.querySelector('#colorBy')?.addEventListener('change', (e) => { colorBy = e.target.value; drawPlan(); });
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
    // 3D view (loaded on demand); a quiet loader fades in until the scene is ready
    open3d = (soft = null) => { // soft = { view, old }: a design change replaces the scene in place (no loader, same camera)
    sceneStyle = JSON.stringify(state.style || {});
    if (!soft) host.innerHTML = `<div class="three-loading">${heartLoaderHTML('Opening the venue…')}</div>`;
    import('./three-view.js').then(async (m) => {
      if (mode !== '3d' || !host.isConnected) return;
      three = host.__three = threeInst = await m.mount(host, state, moodNow(), {
        style: resolveStyle(state.style), resume: soft?.view || null,
        ...(rec ? {} : { sp: { id: space, room: SP().room, tables: SP().tables }, countAt: (t) => guestsAt(t.id).length, pool: partyPool() }),
        unseated: () => going().filter((g) => !isSeated(g)),
        // Seat someone from the 3D view (an existing unseated guest, or a new name)
        onSeat: (tableId, name) => {
          const t = SP().tables.find((x) => x.id === tableId);
          if (!t || guestsAt(tableId).length >= seatCount(t)) { toast('Table is full'); return false; }
          let g = going().find((x) => !isSeated(x) && x.name.toLowerCase() === name.toLowerCase());
          if (!g) { g = { id: uid(), name, side: 'Both', rsvp: 'Not invited yet', diet: '', tableId: null }; state.guests.push(g); }
          g.tableId = tableId;
          commit({ silent: true }); lede();
          toast(`${g.name} · ${tableId === 'head' ? t.name : 'Table ' + t.name}`);
          return true;
        },
      });
      soft?.old?.dispose();
      if (wantLookUp) { wantLookUp = false; three.lookUp?.(); }
      if (pending3d && mode === '3d') { pending3d = false; const o = threeInst; threeInst = null; open3d({ view: o.getView(), old: o }); return; }
      if (mode !== '3d' || !host.isConnected) { three.dispose(); threeInst = null; return; }
      const setLbl = (b, t) => { b.setAttribute('aria-label', t); b.title = t; };
      const walk = root.querySelector('#walk');
      walk.onclick = () => { const on = three.walk(); walk.setAttribute('aria-pressed', String(on)); walk.classList.toggle('on', on); setLbl(walk, on ? 'Exit walk' : 'Walk through'); };
      const light = root.querySelector('#light');
      light.onclick = () => { const evening = three.toggleLight(); setLbl(light, evening ? 'Afternoon light' : 'Candlelight'); light.classList.toggle('on', evening); };
      const full3 = root.querySelector('#full3'); if (full3) full3.onclick = () => { const w = root.querySelector('#stageWrap'); if (document.fullscreenElement) document.exitFullscreen(); else w.requestFullscreen?.(); };
      const evening = root.querySelector('#evening');
      if (evening) evening.onclick = () => { three.experience(); setLbl(light, 'Afternoon light'); light.classList.add('on'); const w = root.querySelector('#walk'); setLbl(w, 'Walk through'); w.classList.remove('on'); };
    }).catch((err) => { console.error(err); host.innerHTML = '<p class="muted" style="padding:24px">3D view needs an internet connection.</p>'; });
    };
    open3d();
  }

  // Look pickers (reception sidebar tab, ceremony / hangout side panels): one pick saves, then the 3D scene rebuilds (it eases in again). In the plan view it just saves.
  root.querySelectorAll('.look-pick').forEach((pick) => pick.addEventListener('click', (e) => {
    const hd = e.target.closest('.lk-head');
    if (hd) { toggleLookGroup(hd); return; }
    const b = e.target.closest('.lk-chip');
    if (!b) return;
    if (b.dataset.lk === 'ceiling') wantLookUp = true;
    localUndo(`Look: ${b.textContent.trim()}`, () => { state.style = withPick(state.style, b.dataset.lk, b.dataset.v); }); // saves, swaps the scene in place, and the toast offers Undo
  }));

  root.querySelector('#share').onclick = async (e) => {
    const btn = e.currentTarget;
    const label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '…';
    const prevSel = sel; sel = null; closePop(true);
    try {
      let source;
      if (mode === '3d' && three) source = { kind: 'canvas', el: three.snapshot() };
      else { drawPlan(); source = { kind: 'svg', el: host.querySelector('svg') }; }
      const r = await sharePicture(source);
      if (r === 'saved') toast('Picture saved');
    } catch (err) { console.error(err); toast('Could not make the picture'); }
    sel = prevSel; drawPlan();
    btn.disabled = false; btn.innerHTML = label;
  };

  /* ---- reference panel: layout ideas + venue photos ---- */
  const ideasGrid = root.querySelector('#ideasGrid'), venueGrid = root.querySelector('.morais-grid');
  root.querySelectorAll('[data-ref]').forEach((b) => b.onclick = () => {
    refTab = b.dataset.ref;
    root.querySelectorAll('[data-ref]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
    if (ideasGrid) ideasGrid.hidden = refTab !== 'ideas';
    venueGrid.hidden = refTab === 'ideas' && !!ideasGrid;
  });

  /* ---- suggest (reception only) ---- */
  let preview = () => {}, seatPanelRefresh = () => {};
  if (rec && mode === 'plan') {
  const count = root.querySelector('#sCount'), prev = root.querySelector('#sPreview');
  const style = { value: TABLE_STYLES[state.lastStyle] ? state.lastStyle : 'round8' };
  const markStyle = () => root.querySelectorAll('[data-style]').forEach((b) => { const on = b.dataset.style === style.value; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  const plan = () => {
    const n = Math.max(2, +count.value || 2);
    const head = SP().tables.find((t) => t.id === 'head') || headTable();
    const room = structuredClone(SP().room);
    // (the dance floor's size and spot are chosen by suggestTables: ~20 x 20 mid-hall, smaller only when the tables need the room)
    const s = suggestTables(room, n, style.value, head);
    // this style can't seat everyone: find the style that can (the one with the most seats), so a big guest list isn't a dead end
    let alt = null;
    if (!s.fits) for (const st of Object.keys(TABLE_STYLES)) {
      if (st === style.value) continue;
      const r2 = structuredClone(SP().room), s2 = suggestTables(r2, n, st, head);
      if (s2.fits && (!alt || seatsOf(s2) > seatsOf(alt.s))) alt = { style: st, s: s2, room: r2 };
    }
    // nothing seats everyone: use the style that seats the MOST (laid out without conflicts), and say how many it holds
    if (!s.fits && !alt) {
      let best = { style: style.value, s, room };
      for (const st of Object.keys(TABLE_STYLES)) {
        if (st === style.value) continue;
        const r2 = structuredClone(SP().room), s2 = suggestTables(r2, n, st, head);
        if (seatsOf(s2) > seatsOf(best.s)) best = { style: st, s: s2, room: r2 };
      }
      alt = { ...best, partial: true };
    }
    return { n, head, room, s, alt };
  };
  const seatsOf = (s) => s.tables.reduce((a, t) => a + seatCount(t), 0);
  preview = () => {
    const { n, s, alt } = plan();
    prev.innerHTML = s.fits ? `${s.needed} tables + sweetheart`
      : alt?.partial ? `Most this room seats: <b>${seatsOf(alt.s)} of ${n}</b> (${TABLE_STYLES[alt.style].label})`
      : alt ? `${TABLE_STYLES[style.value].label} seat ${seatsOf(s)} of ${n} here · <b>${TABLE_STYLES[alt.style].label} fit all ${n}</b>`
      : `${s.needed} tables + sweetheart · <b>needs a bigger room for ${n}</b>`;
  };
  count.oninput = preview;
  // the one guest-count control: edits state.guestTarget (also set from Overview) and re-lays out
  count.onchange = () => { const n = Math.max(2, Math.min(300, +count.value || 2)); count.value = n; if (n !== state.guestTarget) suggest(); };
  markStyle();
  sugBtn.onclick = () => { const open = sugPop.hidden; sugPop.hidden = !open; sugBtn.setAttribute('aria-expanded', String(open)); if (open) preview(); };
  root.querySelectorAll('[data-style]').forEach((b) => b.onclick = () => { style.value = b.dataset.style; markStyle(); preview(); });
  // One code path for the popover and the Layout ideas cards. In 3D the scene is rebuilt (it eases in) instead of redrawing the plan.
  const suggest = () => {
    let { n, head, room, s, alt } = plan();
    closePop(); closeSug();
    let note = '';
    if (!s.fits) {
      if (!alt) { toast(`Needs a bigger room for ${n}`); return; } // never lay out a plan with conflicts
      note = alt.partial ? ` · most this room seats is ${seatsOf(alt.s)} of ${n} (${TABLE_STYLES[alt.style].label})` : ` · ${TABLE_STYLES[style.value].label} seat only ${seatsOf(s)} of ${n}, so I used ${TABLE_STYLES[alt.style].label}`;
      style.value = alt.style; markStyle(); ({ room, s } = alt);
    }
    localUndo(`${s.tables.length} tables laid out${note}`, () => {
      state.guestTarget = n; state.lastStyle = style.value;
      SP().room.areas = room.areas;
      SP().tables = [s.head || head, ...s.tables];
      state.guests.forEach((g) => { if (g.party !== 'couple') g.tableId = null; });
      autoSeat(state.guests, SP().tables, { links: state.links || [] });
    });
  };
  root.querySelector('#sGo').onclick = suggest;
  root.querySelector('#sSeat').onclick = () => {
    closeSug();
    const r = autoSeat(state.guests, SP().tables, { links: state.links || [] });
    commit({ silent: true }); drawPlan(); lede();
    toast(r.seated || r.left ? `${r.seated} seated${r.left ? ` · ${r.left} need a seat` : ''}` : 'Everyone has a seat');
  };
  root.querySelectorAll('[data-idea]').forEach((b) => b.onclick = () => { style.value = b.dataset.idea; markStyle(); suggest(); });

  /* ---- Seat guests panel: search, drag a name onto a table (or pick a table), Unseated (N) ---- */
  const sp = root.querySelector('#seatPanel'), spList = sp.querySelector('.sp-list'), spQ = sp.querySelector('.sp-q');
  const seatAt = (g, tid) => {
    const t = SP().tables.find((x) => x.id === tid);
    if (!t || guestsAt(tid).length >= seatCount(t)) { toast('Table is full'); return; }
    g.tableId = tid; commit({ silent: true }); drawPlan(); lede(); seatPanelRefresh();
    toast(`${g.name} · ${tid === 'head' ? t.name : 'Table ' + t.name}`);
  };
  seatPanelRefresh = () => {
    const q = spQ.value.trim().toLowerCase();
    const un = going().filter((g) => !isSeated(g) && g.party !== 'couple');
    sp.querySelector('.sp-count').textContent = `Unseated (${un.length})`;
    const open = SP().tables.filter((t) => guestsAt(t.id).length < seatCount(t));
    spList.innerHTML = un.filter((g) => !q || g.name.toLowerCase().includes(q)).map((g) => `<li data-gid="${esc(g.id)}"><span>${esc(g.name)}</span><select aria-label="Seat ${esc(g.name)} at"><option value="">Seat at…</option>${open.map((t) => `<option value="${esc(t.id)}">${t.id === 'head' ? esc(t.name) : 'Table ' + esc(t.name)}</option>`).join('')}</select></li>`).join('') || `<li class="empty">${un.length ? 'No match' : 'Everyone has a seat'}</li>`;
  };
  spQ.oninput = seatPanelRefresh;
  spList.addEventListener('change', (e) => { const li = e.target.closest('li[data-gid]'); if (li && e.target.value) seatAt(state.guests.find((g) => g.id === li.dataset.gid), e.target.value); });
  let sdrag = null;
  const clearDrop = () => host.querySelectorAll('.tbl.drop').forEach((n) => n.classList.remove('drop'));
  const tblAt = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.tbl[data-id]');
  spList.addEventListener('pointerdown', (e) => { const li = e.target.closest('li[data-gid]'); if (!li || e.target.closest('select') || e.button > 0) return; sdrag = { li, x: e.clientX, y: e.clientY, on: false }; li.setPointerCapture(e.pointerId); });
  spList.addEventListener('pointermove', (e) => {
    if (!sdrag) return;
    if (!sdrag.on && Math.hypot(e.clientX - sdrag.x, e.clientY - sdrag.y) > 5) { sdrag.on = true; sdrag.li.classList.add('dragging'); }
    if (sdrag.on) { clearDrop(); tblAt(e)?.classList.add('drop'); }
  });
  spList.addEventListener('pointerup', (e) => {
    if (!sdrag) return;
    const { li, on } = sdrag; sdrag = null; li.classList.remove('dragging'); clearDrop();
    const tb = on && tblAt(e);
    if (tb) seatAt(state.guests.find((g) => g.id === li.dataset.gid), tb.dataset.id);
  });
  seatPanelRefresh();
  }

  if (!rec) wireSpaceTools(root, kindOf(), { space, state, SP, commit, toast, pool: partyPool, draw: () => drawPlan(), lede: () => lede(),
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
  drawPlan();
}
let threeInst = null; // live 3D scene, disposed on re-render / leaving the page

/* ---- Morais' photos beside the 3D view: drag to rearrange (saved), tap to see the whole photo ---- */
function moraisOrder(sp = space) {
  const ids = photosForSpace(sp === 'indoor' ? 'ceremony' : sp).map((p) => p.id); // only the photos tagged to this space on the map
  const saved = (Array.isArray(state.morais) ? state.morais : []).filter((id) => ids.includes(id));
  return [...saved, ...ids.filter((id) => !saved.includes(id))].map((id) => photoById(id));
}
/** One quiet panel for the photos: Layout ideas (copy a layout in one tap) and Venue photos (the Morais photos: drag to reorder, tap for the full photo). */
/* ---------------- Vow-style reception layout: cream sidebar + hero ---------------- */
const fmtLen = (v) => (units === 'm' ? (v * 0.3048).toFixed(2) : String(Math.round(v * 10) / 10));
const unitLbl = () => (units === 'm' ? 'm' : 'ft');
const fromLen = (v) => (units === 'm' ? v / 0.3048 : v);
/** 'N tables · S seats · U unseated' for the reception. */
function statsText() {
  const ts = state.tables, seats = ts.reduce((n, t) => n + seatCount(t), 0);
  const un = going().filter((g) => !isSeated(g) && g.party !== 'couple').length;
  return `${ts.length} tables · ${seats} seats · ${un} unseated`;
}
const VS_TABS = [['layout', 'Layout', '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>'], ['guests', 'Seat guests', '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3.5 3-5 5.5-5s5 1.5 5.5 5M16 6.5a2.6 2.6 0 0 1 0 5M17.5 14.5c2 .5 3 2 3.3 4.5"/>'], ['look', 'Look', '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10.5" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>']];
function planHeroHTML() {
  return `<div class="plan-hero"><div><p class="eyebrow">Make room for your evening</p><h2 class="ph-title">Your venue, thoughtfully arranged.</h2></div>
    <div class="ph-acts"><button class="btn sm ghost" type="button" data-mode="3d">Inspect in 3D</button><button class="btn sm moss" type="button" data-mode="3d">See in 3D <span aria-hidden="true">↗</span></button></div></div>`;
}
function vowSideHTML(info) {
  const plan = mode === 'plan', r = SP().room;
  const addItems = plan ? [['round', 'Round table'], ['rect', 'Rectangle table']].map(([k, l]) => `<li><button type="button" class="vs-add" data-add="${k}">+ ${l}</button></li>`)
    .concat(Object.entries(AREA_PRESETS).filter(([k]) => info.areas.includes(k)).filter(([k]) => !['dance', 'altar', 'aisle'].includes(k) || !r.areas.some((a) => a.preset === k)).map(([k, pr]) => `<li><button type="button" class="vs-add" data-preset="${k}">+ ${esc(pr.label)}</button></li>`)) : [];
  // the first few stay in view; the rest tuck behind "More" (fewer choices at once)
  const adds = addItems.slice(0, 4).join('') + (addItems.length > 4 ? `<li class="vs-moreli"><details class="vs-moreadd"><summary>More (${addItems.length - 4})</summary><ul class="vs-addlist">${addItems.slice(4).join('')}</ul></details></li>` : '');
  return `<div class="vs-head"><p class="eyebrow">Your reception</p><h2 class="vs-title">The ballroom</h2><p class="vs-stats" id="vsStats">${statsText()}</p></div>
    <div class="vs-tabs" role="tablist" aria-label="Sidebar">${VS_TABS.map(([k, l, ic]) => `<button role="tab" data-vs="${k}" aria-selected="${vsTab === k}" class="${vsTab === k ? 'on' : ''}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic}</svg>${l}</button>`).join('')}</div>
    <div class="vs-body">
      <section class="vs-pane" data-pane="layout">${plan ? `
        <div class="vs-sec"><h3 class="caps">Room &amp; measurements</h3>
          <dl class="vs-dims"><div><dt>Width</dt><dd id="vsW">${fmtLen(r.w)} ${unitLbl()}</dd></div><div><dt>Length</dt><dd id="vsL">${fmtLen(r.h)} ${unitLbl()}</dd></div></dl>
          <p class="vs-note">Estimate from the Matterport tour (±5 ft); the floor plan from Morais will replace it.</p></div>
        <div class="vs-sec"><h3 class="caps">Add to your reception</h3><ul class="vs-addlist">${adds}</ul></div>
        <div class="vs-sec" id="inspector"><h3 class="caps">In your plan</h3><div id="inspBody"></div></div>` : `
        <div class="vs-sec"><h3 class="caps">Set the scene</h3><p class="vs-note">Drag to look around, scroll to zoom. Tap a chair to seat someone.</p>
          <button type="button" class="btn moss sm" data-mode="plan">Edit the floor plan</button></div>`}</section>
      <section class="vs-pane" data-pane="guests">${plan ? seatPanelHTML() : `<div class="vs-sec"><h3 class="caps">Seat guests</h3><p class="vs-note" id="vsUn">${(() => { const n = going().filter((g) => !isSeated(g) && g.party !== 'couple').length; return n ? `${n} guest${n > 1 ? 's' : ''} still need${n > 1 ? '' : 's'} a seat.` : 'Everyone has a seat.'; })()}</p><button type="button" class="btn moss sm" data-mode="plan">Seat in the floor plan</button></div>`}</section>
      <section class="vs-pane vs-look" data-pane="look"><div class="vs-sec"><h3 class="caps">Style the scene</h3>${lookHTML('reception', state.style)}</div></section>
      <section class="vs-pane vs-ref" data-pane="ref">${refHTML(true)}</section>
    </div>`;
}
function seatPanelHTML() {
  return `<section class="card seat-panel" id="seatPanel" aria-label="Seat guests"><h3>Seat guests</h3>
    <input class="input sp-q" type="search" placeholder="Search guests" aria-label="Search guests"/>
    <b class="muted small sp-count">Unseated</b>
    <ul class="sp-list"></ul><p class="muted small">Drag a name onto a table, or pick one</p></section>`;
}
function refHTML(rec) {
  // Side panel: layout ideas only (the venue photos live in their own larger section under the plan: venueStripHTML)
  if (!(rec && mode === 'plan')) return rec ? `<section class="card ref" aria-label="Layout ideas"><p class="vs-note">Layout ideas are in the floor plan.</p><button type="button" class="btn moss sm" data-mode="plan">Open the floor plan</button></section>` : '';
  return `<section class="card ref" aria-label="Layout ideas">
    <div class="ref-head"><h3>Layout ideas</h3></div>
    <div class="idea-grid" id="ideasGrid">${IDEAS.map((d) => `<figure class="idea"><img src="${d.src}" alt="${esc(TABLE_STYLES[d.key].label)}" loading="lazy" draggable="false"/><figcaption><b>${esc(TABLE_STYLES[d.key].label)}</b><button type="button" class="idea-use" data-idea="${d.key}">Use this layout</button></figcaption></figure>`).join('')}</div>
  </section>`;
}
/** The venue photos for this space: a wide, larger gallery under the plan; tap one to see it big. */
function venueStripHTML() {
  const list = moraisOrder(space);
  if (!list.length) return '';
  // photos are secondary to seating: on a phone the strip starts folded (the choice is remembered on this device)
  let open = !matchMedia('(max-width: 760px)').matches;
  try { const v = localStorage.getItem('bc-vstrip-open'); if (v !== null) open = v === '1'; } catch { /* storage blocked: use the default */ }
  return `<section class="card venue-strip${open ? '' : ' closed'}" aria-label="Venue photos"><button type="button" class="vstrip-head" aria-expanded="${open}"><h3>Venue photos</h3><span class="vstrip-n">${list.length}</span><i class="vstrip-chev" aria-hidden="true"></i></button>
    <div class="ref-grid morais-grid vstrip-grid">
      ${list.map((p, i) => `<button class="morais-th" data-ph="${p.id}" style="--i:${i}" aria-label="${esc(p.name)}, open larger"><img src="${p.src}" alt="${esc(p.name)}" draggable="false" loading="lazy" decoding="async"/><span class="morais-cap">${esc(p.name)}</span></button>`).join('')}
    </div></section>`;
}
function wireMorais(root, signal) {
  const grid = root.querySelector('.morais-grid');
  if (!grid) return;
  const strip = root.querySelector('.venue-strip'), sh = strip?.querySelector('.vstrip-head');
  if (sh) sh.addEventListener('click', () => { const closed = strip.classList.toggle('closed'); sh.setAttribute('aria-expanded', String(!closed)); try { localStorage.setItem('bc-vstrip-open', closed ? '0' : '1'); } catch { /* not remembered */ } }, { signal });
  const thumbs = () => [...grid.querySelectorAll('.morais-th')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveOrder = () => { const vis = thumbs().map((t) => t.dataset.ph); state.morais = [...vis, ...(Array.isArray(state.morais) ? state.morais : []).filter((id) => !vis.includes(id))]; commit({ silent: true }); }; // other spaces' photos keep their saved order

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
    if (!th || e.button > 0 || e.pointerType === 'touch') return;   // touch swipes scroll the page; reorder is mouse / keyboard only
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
  lb.setAttribute('aria-label', 'Venue photo');
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
    const p = photoById(id);
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
    else if (e.key === 'Tab') { // focus trap: Close / Previous / Next only
      const f = [...lb.querySelectorAll('button')], i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
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
