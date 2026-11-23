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
  { id: 'knot-040', src: 'assets/venue/knot/040_adb39138.jpg', name: 'Sweetheart table in the bay', at: 'reception' },
  { id: 'knot-060', src: 'assets/venue/knot/060_91915a8f.jpg', name: 'Ballroom, rounds', at: 'reception' },
  { id: 'knot-064', src: 'assets/venue/knot/064_07dd8a61.jpg', name: 'Ballroom, head table and rounds', at: 'reception' },
  { id: 'knot-088', src: 'assets/venue/knot/088_7ffd8c81.jpg', name: 'Ballroom windows, centerpieces', at: 'reception', guess: true },
  { id: 'knot-119', src: 'assets/venue/knot/119_becd946b.jpg', name: 'First dance, from above', at: 'reception' },
  { id: 'knot-124', src: 'assets/venue/knot/124_701923cb.jpg', name: 'Dance floor', at: 'reception' },
  { id: 'knot-127', src: 'assets/venue/knot/127_0193519d.jpg', name: 'Long banquet table', at: 'reception' },
  { id: 'knot-135', src: 'assets/venue/knot/135_6c9279ba.jpg', name: 'Sweetheart table on the stage', at: 'reception' },
  { id: 'knot-141', src: 'assets/venue/knot/141_07b58dc9.jpg', name: 'Ballroom, tall windows', at: 'reception' },
  { id: 'knot-143', src: 'assets/venue/knot/143_7ea2e8d2.jpg', name: 'Ballroom, balcony wall', at: 'reception' },
  { id: 'knot-015', src: 'assets/venue/knot/015_aa61f830.jpg', name: 'Pergola and balustrade', at: 'ceremony' },
  { id: 'knot-031', src: 'assets/venue/knot/031_44061951.jpg', name: 'Indoor bay, ceremony set-up', at: 'ceremony' },
  { id: 'knot-048', src: 'assets/venue/knot/048_395961b2.jpg', name: 'Pergola ceremony', at: 'ceremony' },
  { id: 'knot-049', src: 'assets/venue/knot/049_d5aa538c.jpg', name: 'Pergola drapes', at: 'ceremony' },
  { id: 'knot-058', src: 'assets/venue/knot/058_a2eaea2e.jpg', name: 'Indoor bay, canopy', at: 'ceremony' },
  { id: 'knot-061', src: 'assets/venue/knot/061_75941e8e.jpg', name: 'Indoor ceremony, chairs', at: 'ceremony' },
  { id: 'knot-066', src: 'assets/venue/knot/066_7bec764d.jpg', name: 'Pergola vows', at: 'ceremony' },
  { id: 'knot-081', src: 'assets/venue/knot/081_324d79be.jpg', name: 'Ring bearers on the aisle', at: 'ceremony' },
  { id: 'knot-090', src: 'assets/venue/knot/090_cea30e9f.jpg', name: 'Pergola terrace ceremony', at: 'ceremony' },
  { id: 'knot-095', src: 'assets/venue/knot/095_18cecb11.jpg', name: 'Pergola lanterns', at: 'ceremony' },
  { id: 'knot-100', src: 'assets/venue/knot/100_8618c48f.jpg', name: 'Indoor ceremony from the side', at: 'ceremony' },
  { id: 'knot-104', src: 'assets/venue/knot/104_632831f8.jpg', name: 'Indoor ceremony, collage', at: 'ceremony', guess: true },
  { id: 'knot-106', src: 'assets/venue/knot/106_4b0e0ca1.jpg', name: 'Indoor ceremony, collage', at: 'ceremony', guess: true },
  { id: 'knot-107', src: 'assets/venue/knot/107_d7d9dbf1.jpg', name: 'Pergola, wedding party', at: 'ceremony' },
  { id: 'knot-134', src: 'assets/venue/knot/134_37ff2bdc.jpg', name: 'Terrace balustrade by the pond', at: 'ceremony', guess: true },
  { id: 'knot-147', src: 'assets/venue/knot/147_3fb694bb.jpg', name: 'Pergola recessional', at: 'ceremony' },
  { id: 'knot-149', src: 'assets/venue/knot/149_fcd26f04.jpg', name: 'Pergola, lanterns', at: 'ceremony' },
  { id: 'knot-151', src: 'assets/venue/knot/151_0648882d.jpg', name: 'Aisle sign on the lawn', at: 'ceremony', guess: true },
  { id: 'knot-157', src: 'assets/venue/knot/157_e0d7a345.jpg', name: 'Pergola welcome sign', at: 'ceremony', guess: true },
  { id: 'knot-161', src: 'assets/venue/knot/161_9f335b2a.jpg', name: 'Lawn ceremony kiss', at: 'ceremony' },
  { id: 'knot-001', src: 'assets/venue/knot/001_238360b3.jpg', name: 'Courtyard, fountain and tree', at: 'cocktail' },
  { id: 'knot-036', src: 'assets/venue/knot/036_2f73ffca.jpg', name: 'Courtyard portraits', at: 'cocktail', guess: true },
  { id: 'knot-101', src: 'assets/venue/knot/101_f2c27c3b.jpg', name: 'Carriage in the courtyard', at: 'cocktail' },
  { id: 'knot-138', src: 'assets/venue/knot/138_8693a46f.jpg', name: 'Courtyard, arched doors', at: 'cocktail' },
  { id: 'knot-150', src: 'assets/venue/knot/150_8d51d5d8.jpg', name: 'Facade, arched windows', at: 'cocktail' },
  { id: 'knot-153', src: 'assets/venue/knot/153_655ff924.jpg', name: 'Courtyard at dusk', at: 'cocktail' },
  { id: 'knot-024', src: 'assets/venue/knot/024_0a7f196c.jpg', name: 'Barrel cellar', at: 'tasting', guess: true },
  { id: 'knot-042', src: 'assets/venue/knot/042_dccb5ab2.jpg', name: 'Wine wall and barrels', at: 'tasting', guess: true },
  { id: 'knot-129', src: 'assets/venue/knot/129_0270d860.jpg', name: 'Cellar, barrels', at: 'tasting', guess: true },
  { id: 'knot-163', src: 'assets/venue/knot/163_fc5484d1.jpg', name: 'Cellar, wine wall', at: 'tasting', guess: true },
  { id: 'knot-017', src: 'assets/venue/knot/017_f703db92.jpg', name: 'Suite interior', at: 'bridal', guess: true },
  { id: 'knot-018', src: 'assets/venue/knot/018_be401d51.jpg', name: 'Suite, arched window and mirror', at: 'bridal', guess: true },
  { id: 'knot-053', src: 'assets/venue/knot/053_91ffa8fe.jpg', name: 'Dress in the suite', at: 'bridal', guess: true },
  { id: 'knot-082', src: 'assets/venue/knot/082_2f0a995c.jpg', name: 'Spiral staircase', at: 'bridal', guess: true },
  { id: 'knot-005', src: 'assets/venue/knot/005_1042a154.jpg', name: 'Chapel cross', at: 'chapel', guess: true },
  { id: 'knot-016', src: 'assets/venue/knot/016_fa0dace4.jpg', name: 'Chapel exterior', at: 'chapel' },
  { id: 'knot-021', src: 'assets/venue/knot/021_c96495c9.jpg', name: 'Chapel gable', at: 'chapel' },
  { id: 'knot-039', src: 'assets/venue/knot/039_763e4fb9.jpg', name: 'Chapel interior', at: 'chapel' },
  { id: 'knot-041', src: 'assets/venue/knot/041_90b717e8.jpg', name: 'Chapel door', at: 'chapel', guess: true },
  { id: 'knot-079', src: 'assets/venue/knot/079_1ec93f7f.jpg', name: 'Chapel, front', at: 'chapel' },
  { id: 'knot-125', src: 'assets/venue/knot/125_35214d90.jpg', name: 'Chapel at dusk', at: 'chapel' },
  { id: 'knot-132', src: 'assets/venue/knot/132_6fbe8dbb.jpg', name: 'Chapel, small ceremony', at: 'chapel' },
  { id: 'knot-148', src: 'assets/venue/knot/148_a4ec4542.jpg', name: 'Chapel altar', at: 'chapel' },
  { id: 'knot-002', src: 'assets/venue/knot/002_0abd4fb6.jpg', name: 'Conservatory, front', at: 'grounds' },
  { id: 'knot-013', src: 'assets/venue/knot/013_e0b3631e.jpg', name: 'Lawn to the conservatory', at: 'grounds' },
  { id: 'knot-019', src: 'assets/venue/knot/019_74941ea7.jpg', name: 'Garden gate', at: 'grounds', guess: true },
  { id: 'knot-027', src: 'assets/venue/knot/027_5a30da99.jpg', name: 'Vineyard path', at: 'grounds' },
  { id: 'knot-035', src: 'assets/venue/knot/035_37cd2603.jpg', name: 'Stone bridge by the building', at: 'grounds', guess: true },
  { id: 'knot-054', src: 'assets/venue/knot/054_1f3076a8.jpg', name: 'Grape arbor', at: 'grounds', guess: true },
  { id: 'knot-059', src: 'assets/venue/knot/059_08883b58.jpg', name: 'Vineyard walk', at: 'grounds', guess: true },
  { id: 'knot-071', src: 'assets/venue/knot/071_605f7b16.jpg', name: 'Vineyard row', at: 'grounds' },
  { id: 'knot-089', src: 'assets/venue/knot/089_75ccc553.jpg', name: 'LOVE sign, vineyard', at: 'grounds' },
  { id: 'knot-091', src: 'assets/venue/knot/091_fd4455ff.jpg', name: 'Vineyard rows and tree', at: 'grounds' },
  { id: 'knot-105', src: 'assets/venue/knot/105_d7deee83.jpg', name: 'Carriage on the drive', at: 'grounds', guess: true },
  { id: 'knot-116', src: 'assets/venue/knot/116_fef86ceb.jpg', name: 'Vineyard and building', at: 'grounds', guess: true },
  { id: 'knot-162', src: 'assets/venue/knot/162_d36c3135.jpg', name: 'Vineyard, bridal party', at: 'grounds', guess: true },
  { id: 'knot-168', src: 'assets/venue/knot/168_155b6038.jpg', name: 'LOVE sign and building', at: 'grounds' },
  // Kiara's visit photos (Nov 2026), people-free ones only. Tags marked guess are inferred from what is visible.
  { id: 'visit-hydrangeas', src: 'assets/venue/visit/visit-hydrangeas.jpg', name: 'Hydrangea bed and magnolia', at: 'grounds' },
  { id: 'visit-tasting-wide', src: 'assets/venue/visit/visit-tasting-wide.jpg', name: 'Tasting room, tables and fireplace', at: 'tasting' },
  { id: 'visit-tasting-tables', src: 'assets/venue/visit/visit-tasting-tables.jpg', name: 'Tasting room, round tables', at: 'tasting' },
  { id: 'visit-courtyard-facade', src: 'assets/venue/visit/visit-courtyard-facade.jpg', name: 'Courtyard facade', at: 'cocktail' },
  { id: 'visit-courtyard-tree', src: 'assets/venue/visit/visit-courtyard-tree.jpg', name: 'Courtyard tree and door', at: 'cocktail' },
  { id: 'visit-vine-wall', src: 'assets/venue/visit/visit-vine-wall.jpg', name: 'Vine wall and bench', at: 'cocktail' },
  { id: 'visit-foyer', src: 'assets/venue/visit/visit-foyer.jpg', name: 'Foyer and staircase', at: 'reception', guess: true },
  { id: 'visit-cellar', src: 'assets/venue/visit/visit-cellar.jpg', name: 'Wine cellar', at: 'tasting', guess: true },
  { id: 'visit-bridge', src: 'assets/venue/visit/visit-bridge.jpg', name: 'Garden bridge', at: 'grounds', guess: true },
].filter((p) => !/knot\/0(0[89]|1[012])_/.test(p.src)); // #008-#012 are not Morais: never shown

const areaOf = (p) => { const t = state.photoTags?.[p.id]; return AREAS.some((a) => a.id === t) ? t : p.at; };
const photosIn = (id) => PHOTOS.filter((p) => areaOf(p) === id);
/** Photos tagged to a Seating space (the editor's Venue photos panel uses this, so the map's tags are the only ones). */
export const photosForSpace = (space) => photosIn(space);
export const photoById = (id) => PHOTOS.find((p) => p.id === id);

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
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  photo: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><circle cx="9" cy="10.5" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>',
  open: '<path d="M9 6l6 6-6 6"/>',
  aerial: '<path d="M3 15.5l5-5 4 4 3-3 6 6"/><circle cx="16.5" cy="7.5" r="1.8"/><rect x="3" y="4" width="18" height="16" rx="2.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.3 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.3-3.8-8.5S9.4 5.9 12 3.5z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
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
      <b><i aria-hidden="true"></i>${esc(a.name)}<em class="vm-kind" aria-hidden="true">${svgIcon(a.space ? 'edit' : 'photo', 12)}</em></b><span class="vm-st" data-st="${a.id}">${esc(statusOf(a))}</span></button>`).join('')}
    <div class="vm-legend" aria-hidden="true"><span><i class="lg-edit"></i>Plan seats here</span><span><i class="lg-photo"></i>Photos only</span></div><span class="vm-cap" aria-live="polite"></span><span class="vm-approx" title="Places are best guesses from photos, not a survey">≈ Approximate</span>
  </div>`;
}

/** One photo tile (shared by the area pop-up and the all-photos gallery). */
const cellHTML = (p, { chip = false } = {}) => `<div class="vm-cell"><button type="button" class="vm-th" data-ph="${p.id}" aria-label="${esc(p.name)}, open larger"><img src="${p.src}" alt="${esc(p.name)}" loading="lazy" decoding="async" draggable="false"/>${chip ? `<span class="vm-chip">${esc(AREAS.find((a) => a.id === areaOf(p))?.name || '')}</span>` : ''}</button>
  <button type="button" class="vm-more" data-move="${p.id}" aria-label="Move ${esc(p.name)} to another place" aria-haspopup="menu" title="Move to…">${svgIcon('more', 14)}</button></div>`;

/** Two ways to see the property, as icons next to the title: the close aerial (outlined areas) and a satellite map close in on the buildings. */
const OVERVIEW_SRC = 'https://www.google.com/maps?q=Morais+Vineyards,+11409+Marsh+Road,+Bealeton,+VA+22716&t=k&z=18&output=embed';
const VIEWS = [{ id: 'aerial', name: 'Aerial view', icon: 'aerial' }, { id: 'overview', name: 'Overview map', icon: 'globe' }];
const viewIcons = () => `<div class="vm-viewicons" role="tablist" aria-label="Map view">${VIEWS.map((v, i) => `<button type="button" role="tab" class="vm-view${i ? '' : ' on'}" data-view="${v.id}" aria-selected="${!i}" aria-label="${v.name}" title="${v.name}">${svgIcon(v.icon, 20)}</button>`).join('')}</div>`;

/** A fixed, shuffled order (once per visit) so the all-photos gallery mixes places like a camera roll. */
const shuffled = (list) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Draw the map, the area pop-up and the all-photos gallery into `root`. */
export function renderVenueMap(root, { signal } = {}) {
  const editable = AREAS.filter((a) => a.space);
  const order0 = shuffled(PHOTOS.map((p) => p.id));
  let filter = 'all';
  root.innerHTML = `
    <div class="page-head vm-head"><div class="vm-titlerow">
      <h1 class="vm-title" id="vmTitle">Morais Vineyards</h1>
      ${viewIcons()}
    </div></div>
    <div class="vm-mapcol">${mapHTML()}<aside class="vm-pop" id="vmPop" hidden aria-label="Area details"></aside></div>
    <nav class="vm-plan" id="vmPlan" aria-label="Plan seats"><span class="vm-plan-h">Plan seats</span>${editable.map((a) => `<a href="#seating/${a.space}" data-plan="${a.id}" style="--a:${a.color || '#fff'}"><b>${esc(a.name)}</b><small data-planst="${a.id}">${esc(statusOf(a))}</small><i aria-hidden="true">${svgIcon('edit', 16)}</i></a>`).join('')}</nav>
    <section class="vm-all" aria-label="All venue photos">
      <div class="vm-filters" role="group" aria-label="Filter photos by place" id="vmFilters"></div>
      <p class="vm-fhead" id="vmHead" hidden></p>
      <div class="vm-allgrid" id="vmAll"></div>
    </section>`;
  const map = root.querySelector('#vmMap'), pop = root.querySelector('#vmPop'), allGrid = root.querySelector('#vmAll'), filters = root.querySelector('#vmFilters'), head = root.querySelector('#vmHead');
  const areaById = (id) => AREAS.find((a) => a.id === id);
  const byId = (id) => PHOTOS.find((p) => p.id === id);

  /* ---- views: aerial photo with outlines, or the satellite overview ---- */
  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    const over = b.dataset.view === 'overview';
    root.querySelectorAll('[data-view]').forEach((o) => { const on = o === b; o.classList.toggle('on', on); o.setAttribute('aria-selected', on); });
    map.classList.toggle('plain', over);
    if (over) closePop();
    let fr = map.querySelector('.vm-embed');
    if (over && !fr) { fr = document.createElement('iframe'); fr.className = 'vm-embed'; fr.title = 'Satellite map of Morais Vineyards'; fr.loading = 'lazy'; fr.referrerPolicy = 'no-referrer'; fr.src = OVERVIEW_SRC; map.append(fr); }
    if (fr) fr.hidden = !over;
    map.querySelector('.vm-cap').textContent = over ? 'Satellite overview · drag to explore' : '';
    const mcol = root.querySelector('.vm-mapcol'); if (mcol) { mcol.scrollLeft = over ? 0 : Math.max(0, (mcol.scrollWidth - mcol.clientWidth) / 2); } // phones: the satellite fits the screen; the aerial photo is wider and pans
  }, { signal }));

  /* ---- hover: a quiet highlight only ---- */
  let hot = null, open = null;
  const setHot = (id) => { hot = id; const on = open || id || (filter !== 'all' ? filter : null); root.querySelectorAll('.vm-map [data-area]').forEach((el) => el.classList.toggle('hot', el.dataset.area === on)); };
  map.addEventListener('pointerover', (e) => { if (e.pointerType === 'touch') return; const el = e.target.closest('[data-area]'); setHot(el ? el.dataset.area : null); }, { signal });
  map.addEventListener('pointerleave', () => setHot(null), { signal });
  map.addEventListener('focusin', (e) => { const el = e.target.closest('[data-area]'); if (el) setHot(el.dataset.area); }, { signal });
  map.addEventListener('focusout', () => setHot(null), { signal });

  /* ---- click an area: a pop-up with its photos (and, if you can plan seats there, a button to go edit) ---- */
  function drawPop() {
    const a = areaById(open); if (!a) return;
    const ps = photosIn(a.id);
    pop.style.setProperty('--a', a.color || '#fff');
    pop.innerHTML = `<header class="vp-head"><div><h2><i aria-hidden="true"></i>${esc(a.name)}</h2><p>${esc(a.place)} · ${esc(statusOf(a))}</p></div><button type="button" class="vp-x" data-closepop aria-label="Close">${svgIcon('close', 16)}</button></header>
      ${a.space ? `<a class="btn moss sm vp-edit" href="#seating/${a.space}">${svgIcon('edit', 14)} Edit seats</a>` : ''}
      ${ps.length ? `<button type="button" class="btn line sm vp-see" data-seephotos>See ${ps.length} photo${ps.length === 1 ? '' : 's'} below</button>` : '<p class="vm-empty">No photos yet</p>'}`;
  }
  function openPop(id) {
    open = id; setHot(null);
    const a = areaById(id);
    pop.classList.toggle('left', a.label[0] > 52);   // sit on the side away from the area
    pop.hidden = false; drawPop();
    requestAnimationFrame(() => pop.classList.add('on'));
    pop.querySelector('.vp-x')?.focus({ preventScroll: true });
  }
  function closePop() { if (!open) return; const was = open; open = null; pop.classList.remove('on'); pop.hidden = true; setHot(null); map.querySelector(`.vm-label[data-area="${was}"]`)?.focus({ preventScroll: true }); }
  map.addEventListener('click', (e) => {
    const el = e.target.closest('[data-area]');
    if (!el) return;
    const id = el.dataset.area;
    selectFilter(filter === id ? 'all' : id, { fromMap: true });
    if (filter !== 'all') root.querySelector('.vm-all').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, { signal });
  pop.addEventListener('click', (e) => {
    if (e.target.closest('[data-closepop]')) closePop();
    if (e.target.closest('[data-seephotos]')) { closePop(); filters.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  /* ---- all photos, shuffled, filter by place ---- */
  const PAGE = () => (matchMedia('(max-width: 760px)').matches ? 12 : 24);
  let expanded = false; // the gallery starts as one page of photos; "See all" shows every photo for the current place (99 at once made the phone page 6,700 px tall)
  const drawAll = () => {
    const counts = Object.fromEntries(AREAS.map((a) => [a.id, photosIn(a.id).length]));
    filters.innerHTML = `<button type="button" class="vm-f${filter === 'all' ? ' on' : ''}" data-f="all" aria-pressed="${filter === 'all'}">All <b>${PHOTOS.length}</b></button>${AREAS.map((a) => `<button type="button" class="vm-f${filter === a.id ? ' on' : ''}" data-f="${a.id}" aria-pressed="${filter === a.id}" style="--a:${a.color || 'var(--c-wine, #6e1f2e)'}">${esc(a.name)} <b>${counts[a.id]}</b></button>`).join('')}`;
    const onB = filters.querySelector('.on'); if (onB) filters.scrollLeft = Math.max(0, onB.offsetLeft - (filters.clientWidth - onB.offsetWidth) / 2);
    const fa = areaById(filter);
    head.hidden = !fa;
    root.querySelectorAll('[data-plan]').forEach((el) => { el.classList.toggle('on', el.dataset.plan === filter); const st = root.querySelector(`[data-planst="${el.dataset.plan}"]`); const ar = areaById(el.dataset.plan); if (st && ar) st.textContent = statusOf(ar); });
    head.innerHTML = fa ? `<span><b>${esc(fa.name)}</b> · ${esc(fa.place)} · ${esc(statusOf(fa))}</span>` : '';
    const list = order0.map(byId).filter((p) => p && (filter === 'all' || areaOf(p) === filter));
    if (!list.length) { allGrid.innerHTML = '<p class="vm-empty">No photos yet</p>'; AREAS.forEach((a) => { const sEl = map.querySelector(`[data-st="${a.id}"]`); if (sEl) sEl.textContent = statusOf(a); }); return; }
    const shown = expanded ? list.length : PAGE();
    allGrid.innerHTML = list.slice(0, shown).map((p) => cellHTML(p, { chip: filter === 'all' })).join('') + (list.length > PAGE() ? `<button type="button" class="vm-showmore" data-more>${expanded ? 'Show fewer' : `See all ${list.length}`}</button>` : '');
    wireCells(allGrid);
    AREAS.forEach((a) => { const sEl = map.querySelector(`[data-st="${a.id}"]`); if (sEl) sEl.textContent = statusOf(a); });
  };
  allGrid.addEventListener('click', (e) => { if (!e.target.closest('[data-more]')) return; expanded = !expanded; drawAll(); if (!expanded) filters.scrollIntoView({ block: 'start' }); }, { signal });
  function selectFilter(id, { fromMap = false } = {}) {
    filter = id; expanded = false; drawAll(); setHot(null);
    // the map shows which part of the property this filter is about: the rest dims, that area lights up, and a phone pans to it
    map.classList.toggle('filtering', filter !== 'all');
    const a = AREAS.find((x) => x.id === filter), mc = root.querySelector('.vm-mapcol');
    if (!fromMap) {
      if (a && mc && mc.scrollWidth > mc.clientWidth + 4) mc.scrollTo({ left: Math.max(0, (a.label[0] / 100) * mc.scrollWidth - mc.clientWidth / 2), behavior: 'smooth' });
      if (a) map.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  filters.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    selectFilter(b.dataset.f);
    filters.querySelector(`[data-f="${filter}"]`)?.focus({ preventScroll: true });
  }, { signal });

  /* ---- lightbox ---- */
  const lb = document.createElement('div');
  lb.className = 'lb vm-lb'; lb.hidden = true;
  lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Venue photo');
  lb.innerHTML = '<img class="vm-lb-img" alt=""/><span class="lb-name"></span><button class="lb-nav prev" aria-label="Previous">‹</button><button class="lb-nav next" aria-label="Next">›</button><button class="lb-x" aria-label="Close">×</button>';
  root.append(lb);
  const lbImg = lb.querySelector('.vm-lb-img'), lbName = lb.querySelector('.lb-name');
  let at = null, from = null, lbList = [];
  const show = (id) => { at = id; const p = byId(id), a = areaById(areaOf(p)); lbImg.src = p.src; lbImg.alt = p.name; lbName.textContent = `${p.name} · ${a.name}`; };
  const openLb = (id, btn) => { from = btn; lbList = [...btn.closest('.vp-grid, .vm-allgrid').querySelectorAll('.vm-th')].map((b) => b.dataset.ph); show(id); lb.hidden = false; requestAnimationFrame(() => lb.classList.add('on')); lb.querySelector('.lb-x').focus({ preventScroll: true }); };
  const closeLb = () => { if (lb.hidden) return; lb.classList.remove('on'); lb.hidden = true; from?.isConnected && from.focus({ preventScroll: true }); };
  const step = (d) => { show(lbList[(lbList.indexOf(at) + d + lbList.length) % lbList.length]); };
  lb.addEventListener('click', (e) => {
    if (e.target.closest('.lb-nav')) return step(e.target.closest('.prev') ? -1 : 1);
    if (e.target === lbImg) return;
    closeLb();
  });

  /* ---- 'Move to…' menu: re-tag a photo (saved with the plan) ---- */
  let menu = null;
  const closeMenu = (focus) => { if (!menu) return; const b = menu._btn; menu.remove(); menu = null; b?.setAttribute('aria-expanded', 'false'); if (focus) b?.focus(); };
  const retag = (pid, to) => {
    const p = byId(pid), was = areaOf(p);
    if (to === was) return;
    const set = (id) => {
      state.photoTags = { ...(state.photoTags || {}) };
      if (id === p.at) delete state.photoTags[pid]; else state.photoTags[pid] = id;
      commit({ silent: true }); drawAll(); if (open) drawPop();
    };
    set(to);
    toast(`Moved to ${areaById(to).name}`, { undo: () => set(was) });
  };
  const openMenu = (btn) => {
    closeMenu();
    const pid = btn.dataset.move, cur = areaOf(byId(pid));
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
  function wireCells(host) {
    host.querySelectorAll('.vm-th').forEach((b) => b.onclick = () => openLb(b.dataset.ph, b));
    host.querySelectorAll('[data-move]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); if (menu?._btn === b) closeMenu(); else openMenu(b); });
  }
  drawAll();
  // phones: the map is wider than the screen; start centred on the courtyard
  const mc = root.querySelector('.vm-mapcol'); if (mc && mc.scrollWidth > mc.clientWidth + 4) requestAnimationFrame(() => { mc.scrollLeft = (mc.scrollWidth - mc.clientWidth) / 2; });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (menu) { e.stopPropagation(); closeMenu(true); } else if (!lb.hidden) closeLb(); else if (open) closePop(); }
    if (!lb.hidden && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) step(e.key === 'ArrowLeft' ? -1 : 1);
  }, { signal });
  document.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target) && !e.target.closest('[data-move]')) closeMenu(); }, { signal });
  signal?.addEventListener('abort', () => { closeMenu(); lb.remove(); });
}
