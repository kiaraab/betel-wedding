// Seating entry view: an overview map of Morais Vineyards (real drone photo + flat outlined areas) and every Morais photo grouped by place.
// EVERYTHING ABOUT WHERE THINGS ARE LIVES IN THIS FILE: the areas on the map (AREAS) and which area each photo shows (PHOTOS[].at).
// Positions are best guesses from the photos and VENUE.md / VENUE-PHOTOS.md, not a survey. Kiara: edit `poly` / `label` / `at` below to correct them.
// A photo moved with its 'Move to' menu is saved in the plan as state.photoTags = { photoId: areaId } and wins over `at`.
import { state, commit } from './store.js';
import { seatCount } from './layout.js';
import { esc, toast } from './util.js';

/** The base photo: drone shot over the front courtyard, looking at the Palacio (2560 × 1440). */
export const MAP_PHOTO = 'assets/venue/site/Tom-Beth-Wedding-Drone-Photos-4-scaled.jpg';

/**
 * Areas on the map. `poly` = outline in percent of the photo ([x, y], 0-100), `label` = where the name sits (percent).
 * `space` = the Seating editor it opens (#seating/<space>); areas without one only filter the photos.
 * `out` = not visible in the drone photo (drawn dashed where it roughly lies).
 */
export const AREAS = [
  { id: 'reception', name: 'Reception', place: 'Ballroom', space: 'reception', color: 'var(--c-pink-fill)',
    poly: [[41, 22], [46.5, 14.5], [55.5, 14.5], [60, 22], [60, 46], [41, 46]], label: [50.5, 31] },          // the Palacio's tall centre block; the hall runs back from its facade
  { id: 'ceremony', name: 'Ceremony', place: 'Pergola lawn · indoor bay', space: 'ceremony', color: 'var(--c-sage)', out: true,
    poly: [[63, 13], [76, 9.5], [92, 11.5], [92, 22], [76, 24.5], [65, 22]], label: [80, 15] },                 // behind the Palacio by the pond (not in view); the indoor bay is in the ballroom
  { id: 'cocktail', name: 'Hangout spot', place: 'Courtyard', space: 'cocktail', color: 'var(--c-pink)',
    poly: [[29, 54], [40, 50], [61, 50], [76, 57], [80, 70], [60, 73], [35, 73], [27, 66]], label: [52, 64] },  // front courtyard with the fountain
  { id: 'tasting', name: 'Tasting room', place: 'Bar · Redondo Room', space: 'tasting', color: 'var(--c-wine)',
    poly: [[27, 40], [29, 33], [37, 31], [40.5, 31], [40.5, 48], [35, 51], [28, 51]], label: [33, 42] },          // left wing (arched French doors onto the courtyard)
  { id: 'bridal', name: 'Bridal suite', place: 'Suite · French garden', poly: [[61, 43], [66, 34], [74.5, 32.5], [75.5, 52], [61, 54]], label: [68.5, 45] }, // right wing: a guess
  { id: 'groom', name: 'Groom suite', place: 'Lounge · bar', poly: [[60, 23], [64.5, 23], [64.5, 38], [60, 38]], label: [72, 27] }, // a guess: no photo shows it
  { id: 'chapel', name: 'Chapel', place: 'Small · 20-30', poly: [[15, 87], [30, 82.5], [44, 85], [47, 100], [12, 100]], label: [28, 92] }, // the domed roof under the drone: a guess
  { id: 'grounds', name: 'Grounds', place: 'Vineyard · gate · conservatory', poly: [[0, 30], [12, 26], [24, 30], [26, 60], [22, 80], [0, 84]], label: [9.5, 52] },
];

/**
 * Every Morais photo in the repo (assets/venue/*), tagged to an area. Knot photos #008-#012 are not Morais and are never listed.
 * `guess: true` = the place is inferred, not certain.
 */
export const PHOTOS = [
  // Reception · ballroom
  { id: 'ballroom', src: 'assets/venue/ballroom.jpg', name: 'Ballroom from the balcony', at: 'reception' },
  { id: 'knot-ballroom-rounds', src: 'assets/venue/knot/028_bf7b0fcf.jpg', name: 'Ballroom, rounds', at: 'reception' },
  { id: 'site-ballroom-rounds', src: 'assets/venue/site/morais-vineyards-wedding-photo-191-scaled.jpg', name: 'Ballroom, balcony and rounds', at: 'reception' },
  { id: 'site-first-dance', src: 'assets/venue/site/julie-andrew-preview-240-scaled.jpg', name: 'First dance', at: 'reception', guess: true },
  // Ceremony · pergola lawn + indoor bay
  { id: 'knot-lawn', src: 'assets/venue/knot/022_60ec6619.jpg', name: 'Ceremony lawn', at: 'ceremony' },
  { id: 'site-pergola', src: 'assets/venue/courtyard-ceremony.png', name: 'Pergola and chairs', at: 'ceremony' },
  { id: 'site-pergola-path', src: 'assets/venue/site/ceremony-locations-pergola-1-2Blog-Images-0043.jpg', name: 'Pergola path', at: 'ceremony' },
  { id: 'site-pergola-guests', src: 'assets/venue/site/5-rhett-caroline-morais-vineyards-bealeton-virginia-wedding-photographer-7-scaled.jpg', name: 'Pergola by the pond', at: 'ceremony' },
  { id: 'knot-pergola-drapes', src: 'assets/venue/knot/gate.jpg', name: 'Pergola, draped', at: 'ceremony' },
  { id: 'knot-ballroom-rows', src: 'assets/venue/knot/029_e524b771.jpg', name: 'Indoor ceremony, rows', at: 'ceremony' },
  { id: 'site-indoor-aisle', src: 'assets/venue/site/ceremony-locations-indoor-ceremony-1.jpg', name: 'Indoor aisle', at: 'ceremony' },
  { id: 'site-indoor-bay', src: 'assets/venue/site/ceremony-locations-indoor-ceremony-4.jpg', name: 'Indoor bay', at: 'ceremony' },
  // Hangout spot · courtyard
  { id: 'site-drone', src: MAP_PHOTO, name: 'Courtyard from above', at: 'cocktail' },
  { id: 'knot-fountain', src: 'assets/venue/knot/056_229129c2.jpg', name: 'Fountain courtyard', at: 'cocktail' },
  { id: 'knot-fountain-2', src: 'assets/venue/knot/055_331a1877.jpg', name: 'Fountain courtyard', at: 'cocktail' },
  { id: 'knot-courtyard-glass', src: 'assets/venue/knot/026_a783fc6d.jpg', name: 'Courtyard, cocktail hour', at: 'cocktail' },
  { id: 'site-courtyard-dusk', src: 'assets/venue/site/the-palacio-package-the-palacio-new-1.jpg', name: 'Courtyard fountain at dusk', at: 'cocktail' },
  { id: 'knot-dusk', src: 'assets/venue/knot/023_4efb749d.jpg', name: 'Palacio at dusk', at: 'cocktail' },
  { id: 'site-courtyard-tree', src: 'assets/venue/site/the-grounds-24.jpg', name: 'Under the courtyard tree', at: 'cocktail', guess: true },
  // Tasting room
  { id: 'tasting-room', src: 'assets/venue/tasting-room.jpg', name: 'Tasting room', at: 'tasting' },
  { id: 'tasting-room-2', src: 'assets/venue/tasting-room-2.jpg', name: 'Tasting room', at: 'tasting' },
  { id: 'site-tasting-hall', src: 'assets/venue/site/A7409521-edit-scaled.jpg', name: 'Tasting room, fireplace', at: 'tasting' },
  { id: 'site-redondo', src: 'assets/venue/site/redondo-room-RedondoRoom-TJBStudios-51.jpg', name: 'Redondo Room', at: 'tasting' },
  { id: 'knot-wine-wall', src: 'assets/venue/knot/057_0d23a108.jpg', name: 'Wine wall', at: 'tasting', guess: true },
  // Bridal suite (the paver garden is from the bridal-suite video, IMG_0762)
  { id: 'courtyard', src: 'assets/venue/courtyard.jpg', name: 'Garden by the bridal suite', at: 'bridal', guess: true },
  // Chapel
  { id: 'site-chapel', src: 'assets/venue/site/ceremony-locations-chapel-1-1.jpg', name: 'Chapel', at: 'chapel' },
  // Grounds
  { id: 'knot-greenhouse', src: 'assets/venue/knot/020_96c1cd2b.jpg', name: 'Conservatory', at: 'grounds' },
  { id: 'site-vineyard-rows', src: 'assets/venue/site/09072019_MikeAndrea_Wedding-20-scaled.jpg', name: 'Vineyard rows', at: 'grounds' },
  { id: 'site-vineyard-drive', src: 'assets/venue/site/the-grounds-10.jpg', name: 'Vineyard drive', at: 'grounds' },
  { id: 'site-gate', src: 'assets/venue/site/the-grounds-5.jpg', name: 'MV gate', at: 'grounds' },
  { id: 'site-garden-bridge', src: 'assets/venue/site/the-grounds-1.jpg', name: 'Garden wall and bridge', at: 'grounds', guess: true },
  { id: 'site-shoes', src: 'assets/venue/site/the-grounds-18.jpg', name: 'Detail shot', at: 'grounds', guess: true },
].filter((p) => !/knot\/0(0[89]|1[012])_/.test(p.src)); // #008-#012 are not Morais: never shown

const areaOf = (p) => { const t = state.photoTags?.[p.id]; return AREAS.some((a) => a.id === t) ? t : p.at; };
const photosIn = (id) => PHOTOS.filter((p) => areaOf(p) === id);

/** Tiny status per editable area: tables/seats, or 'Not started'. */
function statusOf(a) {
  if (!a.space) { const n = photosIn(a.id).length; return n ? `${n} photo${n > 1 ? 's' : ''}` : 'No photos yet'; }
  const sp = a.space === 'reception' ? state : state.spaces?.[a.space];
  const ts = sp?.tables || [], seats = ts.reduce((n, t) => n + seatCount(t), 0);
  if (!ts.length) return 'Not started';
  if (a.id === 'ceremony') return `${seats} chairs`;
  return `${ts.length} table${ts.length > 1 ? 's' : ''} · ${seats} seats`;
}

const ICON = {
  open: '<path d="M9 6l6 6-6 6"/>',
  more: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
const svgIcon = (k, s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const pts = (poly) => poly.map(([x, y]) => `${x},${y}`).join(' ');

function mapHTML() {
  return `<div class="vm-map" id="vmMap">
    <img class="vm-photo" src="${MAP_PHOTO}" alt="Morais Vineyards from above: the Palacio and its courtyard" width="2560" height="1440" draggable="false"/>
    <svg class="vm-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      ${AREAS.map((a) => `<g class="vm-area${a.space ? ' edit' : ''}${a.out ? ' out' : ''}" data-area="${a.id}" style="--a:${a.color || 'var(--c-on-dark)'}">
        <polygon class="vm-halo" points="${pts(a.poly)}" vector-effect="non-scaling-stroke"/><polygon class="vm-poly" points="${pts(a.poly)}" vector-effect="non-scaling-stroke"/></g>`).join('')}
    </svg>
    ${AREAS.map((a) => `<button type="button" class="vm-label${a.space ? ' edit' : ''}" data-area="${a.id}" style="left:${a.label[0]}%;top:${a.label[1]}%;--a:${a.color || 'var(--c-on-dark)'}" title="${esc(a.place)}" aria-label="${esc(`${a.name}, ${a.place}${a.space ? ', open the plan' : ', show photos'}`)}">
      <b><i aria-hidden="true"></i>${esc(a.name)}</b><span class="vm-st" data-st="${a.id}">${esc(statusOf(a))}</span></button>`).join('')}
    <span class="vm-approx" title="Places are best guesses from photos, not a survey">≈ Approximate</span>
  </div>`;
}

function groupHTML(a) {
  const ps = photosIn(a.id);
  return `<section class="vm-grp" data-area="${a.id}" style="--a:${a.color || 'var(--c-on-dark)'}">
    <header class="vm-gh"><h3><i aria-hidden="true"></i>${esc(a.name)} <span class="vm-n">${ps.length}</span></h3>
      <span class="vm-place">${esc(a.place)}</span>
      ${a.space ? `<a class="vm-open" href="#seating/${a.space}" aria-label="Open ${esc(a.name)} plan" title="Open plan">${esc(statusOf(a))}${svgIcon('open', 14)}</a>` : ''}</header>
    ${ps.length ? `<div class="vm-grid">${ps.map((p) => `<div class="vm-cell"><button type="button" class="vm-th" data-ph="${p.id}" aria-label="${esc(p.name)}, open larger"><img src="${p.src}" alt="${esc(p.name)}" loading="lazy" decoding="async" draggable="false"/></button>
      <button type="button" class="vm-more" data-move="${p.id}" aria-label="Move ${esc(p.name)} to another place" aria-haspopup="menu" title="Move to…">${svgIcon('more', 14)}</button></div>`).join('')}</div>` : '<p class="vm-empty">No photos yet</p>'}
  </section>`;
}

/** Draw the map + grouped photos into `root`. `go(space)` opens a space's editor. */
export function renderVenueMap(root, { signal } = {}) {
  root.innerHTML = `
    <div class="page-head vm-head"><h1 class="vm-title">Morais Vineyards</h1></div>
    <div class="vm-wrap">
      <div class="vm-mapcol">${mapHTML()}</div>
      <div class="vm-gallery" id="vmGallery" aria-label="Venue photos by place">${AREAS.map(groupHTML).join('')}</div>
    </div>`;
  const map = root.querySelector('#vmMap'), gal = root.querySelector('#vmGallery');
  const areaById = (id) => AREAS.find((a) => a.id === id);

  /* ---- highlight: an area on the map <-> its photo group ---- */
  let hot = null, pinned = null, scrollT = 0;
  const setHot = (id, { scroll = false } = {}) => {
    hot = id;
    root.querySelectorAll('[data-area]').forEach((el) => el.classList.toggle('hot', el.dataset.area === id));
    gal.classList.toggle('picking', !!id);
    clearTimeout(scrollT);
    if (scroll && id) scrollT = setTimeout(() => {
      const g = gal.querySelector(`.vm-grp[data-area="${id}"]`); if (!g) return;
      if (gal.scrollHeight > gal.clientHeight + 4) gal.scrollTo({ top: g.offsetTop - gal.offsetTop - 8, behavior: 'smooth' }); // desktop: the panel scrolls inside itself
    }, 180);
  };
  const rest = () => setHot(pinned);
  map.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest('[data-area]');
    if (!el) return rest();
    if (el.dataset.area !== hot) setHot(el.dataset.area, { scroll: true });
  }, { signal });
  map.addEventListener('pointerleave', rest, { signal });
  map.addEventListener('focusin', (e) => { const el = e.target.closest('[data-area]'); if (el) setHot(el.dataset.area, { scroll: true }); }, { signal });
  map.addEventListener('focusout', rest, { signal });
  gal.addEventListener('pointerover', (e) => { const g = e.target.closest('.vm-grp'); if (g && e.pointerType !== 'touch' && g.dataset.area !== hot) setHot(g.dataset.area); }, { signal });
  gal.addEventListener('pointerleave', rest, { signal });
  gal.addEventListener('focusin', (e) => { const g = e.target.closest('.vm-grp'); if (g) setHot(g.dataset.area); }, { signal });

  /* ---- click an area: open its editor, or (no editor) pin it and bring its photos up ---- */
  map.addEventListener('click', (e) => {
    const el = e.target.closest('[data-area]'); if (!el) return;
    const a = areaById(el.dataset.area);
    if (a.space) { location.hash = `#seating/${a.space}`; return; }
    pinned = pinned === a.id ? null : a.id; setHot(pinned);
    const g = gal.querySelector(`.vm-grp[data-area="${a.id}"]`);
    if (pinned && g) { if (gal.scrollHeight > gal.clientHeight + 4) gal.scrollTo({ top: g.offsetTop - gal.offsetTop - 8, behavior: 'smooth' }); else g.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }, { signal });
  // a tap on a group heading (phones: no hover) shows where it is on the map
  gal.addEventListener('click', (e) => {
    const h = e.target.closest('.vm-gh'); if (!h || e.target.closest('a')) return;
    const id = h.parentElement.dataset.area; pinned = pinned === id ? null : id; setHot(pinned);
  }, { signal });

  /* ---- lightbox ---- */
  const lb = document.createElement('div');
  lb.className = 'lb vm-lb'; lb.hidden = true;
  lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Venue photo');
  lb.innerHTML = '<img class="vm-lb-img" alt=""/><span class="lb-name"></span><button class="lb-nav prev" aria-label="Previous">‹</button><button class="lb-nav next" aria-label="Next">›</button><button class="lb-x" aria-label="Close">×</button>';
  root.append(lb);
  const lbImg = lb.querySelector('.vm-lb-img'), lbName = lb.querySelector('.lb-name');
  let at = null, from = null;
  const order = () => [...gal.querySelectorAll('.vm-th')].map((b) => b.dataset.ph);
  const show = (id) => {
    at = id; const p = PHOTOS.find((x) => x.id === id), a = areaById(areaOf(p));
    lbImg.src = p.src; lbImg.alt = p.name; lbName.textContent = `${p.name} · ${a.name}`;
  };
  const openLb = (id, btn) => { from = btn; show(id); lb.hidden = false; requestAnimationFrame(() => lb.classList.add('on')); lb.querySelector('.lb-x').focus({ preventScroll: true }); };
  const closeLb = () => { if (lb.hidden) return; lb.classList.remove('on'); lb.hidden = true; from?.isConnected && from.focus({ preventScroll: true }); };
  const step = (d) => { const ids = order(); show(ids[(ids.indexOf(at) + d + ids.length) % ids.length]); };
  lb.addEventListener('click', (e) => {
    if (e.target.closest('.lb-nav')) return step(e.target.closest('.prev') ? -1 : 1);
    if (e.target === lbImg) return;
    closeLb();
  });

  /* ---- 'Move to…' menu: re-tag a photo (saved with the plan) ---- */
  let menu = null;
  const closeMenu = (focus) => { if (!menu) return; const b = menu._btn; menu.remove(); menu = null; b?.setAttribute('aria-expanded', 'false'); if (focus) b?.focus(); };
  const retag = (pid, to) => {
    const p = PHOTOS.find((x) => x.id === pid), was = areaOf(p);
    if (to === was) return;
    const set = (id) => {
      state.photoTags = { ...(state.photoTags || {}) };
      if (id === p.at) delete state.photoTags[pid]; else state.photoTags[pid] = id;
      commit({ silent: true }); refreshGallery();
    };
    set(to);
    toast(`Moved to ${areaById(to).name}`, { undo: () => set(was) });
  };
  const openMenu = (btn) => {
    closeMenu();
    const pid = btn.dataset.move, cur = areaOf(PHOTOS.find((x) => x.id === pid));
    menu = document.createElement('div');
    menu.className = 'vm-menu'; menu.setAttribute('role', 'menu'); menu._btn = btn;
    menu.innerHTML = `<p class="vm-menu-h">Move to</p>${AREAS.map((a) => `<button type="button" role="menuitemradio" aria-checked="${a.id === cur}" data-to="${a.id}" style="--a:${a.color || 'var(--c-on-dark)'}"><i aria-hidden="true"></i>${esc(a.name)}${a.id === cur ? svgIcon('check', 14) : ''}</button>`).join('')}`;
    document.body.append(menu);
    const r = btn.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8)) + 'px';
    menu.style.top = (r.bottom + 4 + mh > innerHeight - 8 ? Math.max(8, r.top - mh - 4) : r.bottom + 4) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    menu.addEventListener('click', (e) => { const b = e.target.closest('[data-to]'); if (b) { closeMenu(); retag(pid, b.dataset.to); } });
    menu.addEventListener('keydown', (e) => {
      const items = [...menu.querySelectorAll('[data-to]')], i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
      if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      if (e.key === 'End') { e.preventDefault(); items.at(-1).focus(); }
      if (e.key === 'Tab') closeMenu();
    });
    (menu.querySelector('[aria-checked="true"]') || menu.querySelector('[data-to]')).focus({ preventScroll: true });
  };

  const wireGallery = () => {
    gal.querySelectorAll('.vm-th').forEach((b) => b.onclick = () => openLb(b.dataset.ph, b));
    gal.querySelectorAll('[data-move]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); if (menu?._btn === b) closeMenu(); else openMenu(b); });
  };
  function refreshGallery() { // counts + groups update in place (no page redraw)
    const y = gal.scrollTop;
    gal.innerHTML = AREAS.map(groupHTML).join('');
    gal.scrollTop = y;
    AREAS.forEach((a) => { const s = map.querySelector(`[data-st="${a.id}"]`); if (s) s.textContent = statusOf(a); });
    wireGallery(); setHot(hot);
  }
  wireGallery();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (menu) { e.stopPropagation(); closeMenu(true); } else if (!lb.hidden) closeLb(); else if (pinned) { pinned = null; setHot(null); } }
    if (!lb.hidden && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) step(e.key === 'ArrowLeft' ? -1 : 1);
  }, { signal });
  document.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target) && !e.target.closest('[data-move]')) closeMenu(); }, { signal });
  signal?.addEventListener('abort', () => { closeMenu(); lb.remove(); });
}
