// Seed data — pulled from Betel's planning sheet. Everything here is editable in the app.
import { suggestTables } from './layout.js';
export const WEDDING = {
  couple: ['Betel', 'Carter'],
  surname: 'Griffin',
  date: '2027-06-17T15:00:00-04:00', // ceremony at 3 PM (from the invitation site)
  venue: 'Morais Vineyards & Winery',
  venueTown: 'Bealeton, Virginia',
  board: 'https://www.pinterest.com/bm202834/wedding-day/',
  // Drop a photo at betel-wedding/assets/hero.jpg and it shows on the overview.
  heroImage: 'assets/hero.jpg',
};

export const STATUSES = ['Not started', 'In progress', 'Waiting on bride', 'Done'];

export const SEED_PEOPLE = [
  { id: 'eden', name: 'Eden', tag: 'Maid of honor' },
  { id: 'noemi', name: 'Noemi', tag: '' },
  { id: 'morgan', name: 'Morgan', tag: '' },
  { id: 'isabele', name: 'Isabele', tag: '' },
  { id: 'noella', name: 'Noella', tag: '' },
  { id: 'ashlyn', name: 'Ashlyn', tag: '' },
  { id: 'kiara', name: 'Kiara', tag: '' },
  { id: 'monica', name: 'Monica', tag: '' },
].map((p) => ({ links: [], updates: [], ...p }));

const pin = (label, url) => ({ label, url });

export const SEED_ROLES = [
  {
    id: 'photo', title: 'Photo Director', people: ['isabele'], status: 'Not started',
    details: ['Review the bride’s Pinterest inspo', 'Find a photographer who can do similar styles', 'Track the shots wanted for both events; help direct people & poses'],
    links: [pin('Pictures board', 'https://pin.it/53dGCTZHj')],
  },
  {
    id: 'music', title: 'Music Hunter', people: ['isabele'], status: 'Not started',
    details: ['Quotes for a string quartet or live band — ceremony + cocktail hour', 'Prefers a string quartet; a jazz band is welcome too', 'Bridgerton style: modern songs played by a quartet'],
    links: [pin('Spotify playlist', 'https://open.spotify.com/playlist/2gZlGJj54JSfjKxpM0PgV4')],
  },
  {
    id: 'mua', title: 'MUA Talent Scout', people: ['noella'], status: 'Not started',
    details: ['Makeup artist who can travel to Morais Vineyards (or a nearby Airbnb)', 'Bride + mother of the bride', 'Glowy, glossy, easy to reapply. No strong brows or over-lined lips. Under-eyes snatched'],
    links: [pin('Makeup looks board', 'https://pin.it/2xGK8WYmn')],
  },
  {
    id: 'hair', title: 'Curl Hairstylist (potential)', people: ['noella'], status: 'Not started',
    details: ['Stylist for natural hair, maybe with a curly extension', 'Goal: curly hair down her back'],
    links: [pin('Wedding hair board', 'https://pin.it/2cKxaLoTd')],
  },
  {
    id: 'floral', title: 'Floral Design Lead', people: ['ashlyn'], with: 'the bride', status: 'In progress',
    details: ['Alibaba floral ordering, quantities and design schemes', 'Back-and-forth with the bride on the Pinterest board', 'Get a sample sent before the end of the year'],
    links: [pin('Wedding flowers board', 'https://pin.it/L9yzEhgD5')],
  },
  {
    id: 'decor', title: 'Decor', people: ['ashlyn', 'morgan'], status: 'Not started',
    details: ['Florals are decided — pick the bride’s brain on the overall look of the place'],
    links: [pin('Wedding vibes board', 'https://pin.it/6QSc0JMBO')],
  },
  {
    id: 'layout', title: 'Layout & Flow', people: ['kiara', 'monica'], status: 'In progress',
    details: ['Venue layout renders (the Seating tab)', 'Smooth guest movement and flow', 'Operations flow for the rehearsal', 'Floral placement with Ashlyn and the bride'],
    links: [pin('Inspo', 'https://pin.it/6qivksiFp')],
  },
  {
    id: 'reception-dress', title: 'Reception Dress Stylist', people: ['eden'], status: 'Not started',
    details: ['Help the bride find the reception dress', 'Budget ceiling: $300 (can move for something special)'],
    links: [pin('Reception dress board', 'https://pin.it/6QSc0JMBO')],
  },
  {
    id: 'dancer', title: 'Bridgerton Aerial Dancer?', people: ['morgan'], status: 'Not started',
    details: ['Explore an aerial / Bridgerton-style dance performer'], links: [],
  },
  {
    id: 'bach', title: 'Bachelorette Planners', people: ['eden', 'noemi'], status: 'Done',
    details: ['PA Ren Faire getaway, Oct 2–4 2026'], links: [],
  },
  {
    id: 'airbnb', title: 'Airbnb Coordinator', people: ['noemi'], status: 'Done',
    details: ['Bachelorette Airbnb under $160/night'], links: [],
  },
  {
    id: 'renfaire', title: 'Ren Faire Wardrobe Stylist', people: ['morgan'], status: 'Done',
    details: ['Bachelorette outfits & accessories'], links: [pin('Inspo', 'https://pin.it/5xKxIebOE')],
  },
];

// Only dates that are sourced: Betel's planning sheet or confirmed. Saved with the plan (state.milestones) so they can be edited.
export const MILESTONES = [
  { id: 'engaged', date: '2026-04-10', label: 'Engaged' },                     // Kiara: proposal April 10
  { id: 'bachelorette', date: '2026-10-02', label: 'Bachelorette weekend' },  // sheet: PA Ren Faire, Oct 2–4 2026
  { id: 'floral-sample', date: '2026-12-31', label: 'Floral sample in hand' }, // sheet: sample before the end of the year
  { id: 'wedding', date: '2027-06-17', label: 'The wedding' },                 // confirmed
];

// Palettes read from the "Wedding day" board.
export const MOODS = [
  {
    id: 'vineyard-dusk', name: 'Vineyard at dusk',
    blurb: 'The main read of the board: deep moss, ivory paper, a pour of wine.',
    swatches: ['#2f3823', '#5b6b3c', '#efe7d4', '#6b1f2a', '#b08d57'],
    flowers: 'Burgundy dahlias, ranunculus, white garden roses, trailing greenery',
    table: 'Ivory linen, moss runner, tapered candles',
    vessels: 'Green pressed-glass goblets, antique brass',
  },
  {
    id: 'wine-cellar', name: 'Wine cellar',
    blurb: 'Moodier — candlelight, oxblood and dark chocolate tones.',
    swatches: ['#2a1a17', '#4a1520', '#7a2c35', '#c9b48a', '#e8dcc4'],
    flowers: 'Black-red calla lilies, plum anthurium, olive branches',
    table: 'Chocolate velvet runner on ivory, clustered pillar candles',
    vessels: 'Smoked glass, aged gold',
  },
  {
    id: 'chiffon-forest', name: 'Chiffon forest',
    blurb: 'From “venue vibes”: sheer sage chiffon draped overhead, cascading greenery, a misty mirror aisle.',
    swatches: ['#8a9a6b', '#c3cba8', '#f4efe3', '#4a3a2c', '#6b1f2a'],
    flowers: 'Hanging amaranthus, white roses, green hydrangea, one wine accent bloom',
    table: 'Chocolate linen, sage velvet menus, scalloped place cards',
    vessels: 'Clear bud vases, mirrors along the aisle',
  },
  {
    id: 'habesha-gold', name: 'Habesha gold',
    blurb: 'Nod to the Ethiopian wedding vibes section — white & gold tibeb.',
    swatches: ['#f7f3ea', '#d4b46a', '#9c7a3c', '#2f3823', '#6b1f2a'],
    flowers: 'White blooms with gilded accents',
    table: 'White linen with a woven tibeb-border runner',
    vessels: 'Gold-rimmed glassware, mesob centerpiece accents',
  },
];

/* ---------- Reception floor plan (units: feet) ----------
   Morais ballroom (the Palacio hall), drawn the way guests see it walking in: the balcony-end doors at the bottom,
   5 arched French doors on the far wall at the top, the domed columned stage bay in the LEFT LONG WALL (outside the hall; only its ~3 steps reach in).
   PUBLISHED: ~4,000 sq ft, Palladian windows, a columned stage with painted tile, six chandeliers, hardwood.
   MEASURED (Matterport, ±5 ft): hall ≈ 50 × 75 ft; bay ≈ 20 wide × 15 deep, centered ≈ 34 ft from the balcony end.
   OBSERVED (Knot photos, VENUE-PHOTOS.md): 5 arched doors far wall; steps reach only ≈4-5 ft into the hall; two white double doors + two corner doors under the balcony; two rows of three chandeliers.
   ESTIMATE: door pitch/widths, window positions, balcony depth 12 ft.
   Fixed features are locked; areas are Betel's to place. See VENUE.md. */
const opening = (wall, at, kind, w = 4, style, approx) => ({ wall, at, kind, w, ...(style && { style }), ...(approx && { approx: true }) });
export function seedRoom() {
  // MEASURED from the Matterport floor plan on The Knot (m=K76R3QeJThF), calibrated to the published 4,000 sq ft: main hall ≈ 50 × 75 ft.
  // The stage is the domed bay with columns, centered on the long left wall ≈ 34 ft from the balcony end (y = 75 − 34 = 41). See VENUE.md.
  const w = 50, h = 75;
  // OBSERVED: 5 arched French doors, evenly pitched, centered on the far wall. ESTIMATE: ~9 ft pitch, ~5 ft wide (from the balcony photo vs 5 ft round tables)
  const far = [-2, -1, 0, 1, 2].map((i) => opening('top', w / 2 + i * 9, 'french', 5));
  // Long walls as the balcony photo shows them (far → near). They differ: left has a square-top door + one
  // Palladian window; right has a plain window, one arched French door, then two Palladian windows.
  const sides = [
    opening('left', 6, 'french', 3.5, 'rect'), opening('left', 26, 'window', 6, 'palladian'),
    opening('right', 8, 'window', 4, 'plain'), opening('right', 20, 'french', 4.5),
    opening('right', 34, 'window', 7, 'palladian'), opening('right', 50, 'window', 7, 'palladian'),
  ];
  // Balcony-end wall (Knot photo #143): two white paneled ~5 ft double doors ≈15 ft apart (x ≈ 16 and 31) with a blank wall between,
  // plus a single ~3 ft door near each corner. x positions are APPROXIMATE (±3 ft, wide-angle lens) until Morais sends the floor plan.
  const near = [opening('bottom', 16, 'entrance', 5, 'double', true), opening('bottom', 31, 'entrance', 5, 'double', true), opening('bottom', 4, 'french', 3, 'single', true), opening('bottom', 46, 'french', 3, 'single', true)];
  return {
    name: 'Ballroom', w, h,
    fixed: {
      openings: [...far, ...sides, ...near],
      // Columned, domed bay on the left long wall; cy = 41 (≈34 ft from the balcony end). r = half the arch width (20 ft wide), d = bay depth outside the hall (15 ft),
      // steps = 3 curved tile-faced steps that reach stepD ≈ 4.5 ft INTO the hall; keep = tables stay ≥ 8 ft from the wall.
      stage: { cx: 0, cy: 41, r: 10, d: 15, steps: 3, stepD: 4.5, keep: 8 },
      balcony: { depth: 12, bow: 25 },                 // overhead mezzanine across the near wall; the railing bows out ~25 ft in the middle (photo #143; side sections uncertain)
    },
    areas: [
      // (no dance floor by default: it took too much of the room; "+ Dance floor" adds one back)
      { id: 'cake', preset: 'cake', label: 'Cake', x: 36.5, y: 3, w: 4, h: 4 },                // ~4 ft table beside the sweetheart table (in the bay for 'Head on stage')
      { id: 'dj', preset: 'dj', label: 'DJ', x: 0.5, y: 17, w: 4, h: 8 },                    // ~8 × 4 ft on the stage-side long wall, not in the bay
      { id: 'bar', preset: 'bar', label: 'Bar', x: 34.5, y: 71, w: 9, h: 3.5 },             // ~9 × 3.5 ft in the balcony-end wall corner beside the right corner door
    ],
  };
}

// Tap-to-add areas (feet). Betel can resize these; the room, doors and stage can't be changed.
export const AREA_PRESETS = {
  dance: { label: 'Dance floor', w: 20, h: 20 },
  bar: { label: 'Bar', w: 10, h: 4 },
  dj: { label: 'DJ', w: 8, h: 4 },
  cake: { label: 'Cake', w: 4, h: 4 },
  gifts: { label: 'Gifts & cards', w: 6, h: 3 },
  escort: { label: 'Escort cards & guest book', w: 8, h: 3 },
  coffee: { label: 'Coffee ceremony', w: 8, h: 8 },
  lounge: { label: 'Lounge', w: 12, h: 10 },
  booth: { label: 'Photo booth', w: 8, h: 8 },
  altar: { label: 'Altar', w: 10, h: 5 },
  aisle: { label: 'Aisle', w: 6, h: 20 },
  highbar: { label: 'Bar', w: 8, h: 3 },
  custom: { label: 'New area', w: 8, h: 6 },
};

/* ---------- Spaces: ceremony → cocktail hour → reception ----------
   Reception = the ballroom above (state.room / state.tables, unchanged so the 3D view, guests and auto-seat keep working).
   Ceremony + cocktail live in state.spaces. Seeded from the Knot photos (VENUE-PHOTOS.md): the ceremony is on the LAWN at the pergola (rain plan: indoors at the
   stage bay), cocktail hour in the courtyard / terrace. Their overall sizes are NOT known — every w/h/x/y below is an APPROXIMATE working layout until Morais shares a floor plan.
   Saved plans keep whatever space they already have; only fresh plans (or a missing space) get these seeds.
   \`kind\` says which tools a space uses (ceremony rows + wedding party, or cocktail tables). */
export const SPACES = [
  { id: 'ceremony', kind: 'ceremony', label: 'Ceremony', areas: ['altar', 'aisle', 'escort', 'custom'], add: 'row' },
  { id: 'indoor', kind: 'ceremony', label: 'Indoor', areas: ['aisle', 'escort', 'custom'], add: 'row' },
  { id: 'cocktail', kind: 'cocktail', label: 'Cocktail', areas: ['lounge', 'highbar', 'escort', 'custom'], add: 'high' },
  { id: 'tasting', kind: 'cocktail', label: 'Tasting room', areas: ['lounge', 'highbar', 'escort', 'custom'], add: 'high' },
  { id: 'reception', kind: 'reception', label: 'Reception', areas: ['dance', 'bar', 'dj', 'cake', 'gifts', 'escort', 'coffee', 'lounge', 'booth', 'custom'], add: 'tables' },
];

const sid = (p, i) => `${p}${i + 1}`;
/** Ceremony rows for 100: 10 rows a side × 5 chairs, 3 ft row pitch; `axis` = x of the aisle, `y0` = first row. */
function ceremonyRows(axis, aisle, y0, perRow = 5, rows = 10, pitch = 3) {
  const half = (perRow * 2) / 2 + 0.5;                 // row half-width (2 ft per chair) + a little air
  const xs = [axis - aisle / 2 - half, axis + aisle / 2 + half];
  const tables = [];
  for (let r = 0; r < rows; r++) xs.forEach((x, k) => tables.push({ id: sid(k ? 'cr' : 'cl', r), name: `${r + 1}${k ? 'R' : 'L'}`, shape: 'row', seats: perRow, x, y: y0 + r * pitch, rot: 0, o: r * 2 + k }));
  return tables;
}
const teamParty = () => ({ grooms: 0, order: { b: SEED_PEOPLE.map((p) => p.id), g: [] } }); // bridesmaids = the team
/**
 * Pergola on the lawn (Knot photos #022, #099, #107): white pergola ≈ 36 × 15 ft on columns with a stone balustrade and the pond behind it, a ~6 ft pea-gravel aisle,
 * ~150 white resin chairs on grass in two blocks, row pitch ≈ 3 ft. The wedding party stands in ONE line each side of the couple. Distance from the building (≈100+ ft) is unknown.
 */
export function seedCeremony() {
  const w = 44, h = 64, cx = w / 2, aisle = 6, y0 = 20; // rows start below the pergola and the standing wedding party
  return {
    room: {
      name: 'Pergola lawn', w, h, approx: true, floor: 'lawn', minRow: y0,
      party: teamParty(),
      fixed: {
        openings: [],
        decor: [
          { kind: 'balustrade', x: 0, y: 0, w, h: 1.4, block: true, label: 'Pond · balustrade' },
          { kind: 'pergola', x: cx - 18, y: 2.5, w: 36, h: 15, block: true, label: 'Pergola' },
        ],
      },
      areas: [
        { id: 'altar', preset: 'altar', label: 'Altar', x: cx - 3, y: 4, w: 6, h: 5 },
        { id: 'aisle', preset: 'aisle', label: 'Gravel aisle', x: cx - aisle / 2, y: 17.5, w: aisle, h: h - 17.5 - 2 },
      ],
    },
    tables: ceremonyRows(cx, aisle, y0),
  };
}
/**
 * Rain plan: the ballroom turned so the stage bay is at the top (Knot photos #100, #061, #104): aisle runs across the room toward the bay,
 * rows parallel to the stage wall, the wedding party stands on the floor at the foot of the steps, the couple on the platform. APPROXIMATE (±3 ft).
 */
function seedIndoor() {
  const w = 75, h = 50, cx = 34, aisle = 6, y0 = 13; // bay center ≈ 34 ft from the balcony end (left); first row ≈ 6 ft past the party
  const door = (wall, at, kind, dw, style) => ({ wall, at, kind, w: dw, style, approx: true });
  return {
    room: {
      name: 'Indoor ceremony', w, h, approx: true, cx, minRow: y0,
      party: teamParty(),
      fixed: {
        openings: [
          ...[7, 16, 25, 34, 43].map((at) => door('right', at, 'french', 5)),                 // the 5 arched doors (far wall of the hall)
          door('left', 16, 'entrance', 5, 'double'), door('left', 31, 'entrance', 5, 'double'), door('left', 4, 'french', 3, 'single'), door('left', 46, 'french', 3, 'single'),
        ],
        stage: { wall: 'top', cx, cy: 0, r: 10, d: 15, steps: 3, stepD: 4.5, keep: 8 },
      },
      areas: [{ id: 'aisle', preset: 'aisle', label: 'Aisle', x: cx - aisle / 2, y: 9, w: aisle, h: h - 11 }],
    },
    tables: ceremonyRows(cx, aisle, y0),
  };
}
/**
 * Cocktail hour in the front courtyard (Knot photos #056, #101, #001): U-shaped building, light concrete paving, a round stone fountain left of center (≈13 ft),
 * a big tree, black wrought-iron bistro tables (2-4 seats) along the building edges and under the tree. Overall size is an estimate.
 */
export function seedCocktail() {
  const w = 60, h = 50;
  // every pair >= 1.5 ft between chair rings (centres >= 9.1 ft apart on one axis), clear of the building wings, fountain keep-out and the entrance edge
  const bistro = [[13, 10], [23.5, 10], [34, 10], [44.5, 10], [10.5, 22], [10.5, 34], [49.5, 22], [49.5, 34]].map(([x, y], i) => ({ id: sid('ht', i), name: String(i + 1), shape: 'round', seats: 3, x, y, rot: 0, o: i }));
  return {
    room: {
      name: 'Courtyard', w, h, approx: true, floor: 'concrete', bistro: true,
      fixed: {
        openings: [],
        decor: [
          { kind: 'building', x: 0, y: 0, w, h: 5, block: true, label: 'Building' },
          { kind: 'building', x: 0, y: 5, w: 6, h: 30, block: true },
          { kind: 'building', x: w - 6, y: 5, w: 6, h: 30, block: true },
          { kind: 'fountain', x: 17.5, y: 17, w: 13, h: 13, block: true, pad: 3, label: 'Fountain' },   // keep-out ring around the basin
          { kind: 'tree', x: 40, y: 24, w: 11, h: 11, label: 'Tree' },                                  // canopy only: tables may sit under it
        ],
      },
      areas: [],
    },
    tables: bistro,
  };
}
/** Tasting room as a second hangout option (rain / evening): high-tops + leather lounge by the fireplace; carved bar in the octagonal sunroom (Morais album, VENUE.md). Sizes are estimates. */
function seedTasting() {
  const w = 44, h = 34;
  const high = [[18.5, 8], [28, 8], [21, 19], [32, 19], [26, 29]].map(([x, y], i) => ({ id: sid('ht', i), name: String(i + 1), shape: 'round', seats: 4, high: true, x, y, rot: 0, o: i }));
  return {
    room: {
      name: 'Tasting room', w, h, approx: true, floor: 'tile',
      fixed: {
        openings: [{ wall: 'bottom', at: 14, kind: 'entrance', w: 6 }],
        decor: [
          { kind: 'fireplace', x: 0, y: 11, w: 2.5, h: 8, block: true, label: 'Fireplace' },
          { kind: 'wine', x: 6, y: 0, w: 22, h: 1.4, block: true },
          { kind: 'sunroom', x: 32, y: 0, w: 12, h: 14, label: 'Bar' },
          { kind: 'bar', x: 35, y: 3.5, w: 6, h: 2.2, block: true },
        ],
      },
      areas: [{ id: 'lounge', preset: 'lounge', label: 'Lounge', x: 5, y: 9, w: 9, h: 10 }],
    },
    tables: high,
  };
}
export const seedSpaces = () => ({ ceremony: seedCeremony(), indoor: seedIndoor(), cocktail: seedCocktail(), tasting: seedTasting() });

/* ---------- Morais' own album (shown beside the 3D view; order is Betel's, saved as state.morais) ---------- */
/* Each photo says which space it shows (for: reception | ceremony | cocktail (Hangout spot) | tasting); the Venue photos panel lists only the current space's. People-heavy shots are left out. */
export const MORAIS_PHOTOS = [
  { id: 'ballroom', src: 'assets/venue/ballroom.jpg', name: 'Ballroom', w: 1050, h: 1400, for: ['reception'] },
  { id: 'knot-ballroom-rounds', src: 'assets/venue/knot/028_bf7b0fcf.jpg', name: 'Ballroom, rounds', w: 600, h: 400, for: ['reception'] },
  { id: 'site-ballroom-rounds', src: 'assets/venue/site/morais-vineyards-wedding-photo-191-scaled.jpg', name: 'Ballroom, balcony and rounds', w: 2048, h: 1366, for: ['reception'] },
  { id: 'knot-lawn', src: 'assets/venue/knot/022_60ec6619.jpg', name: 'Ceremony lawn', w: 600, h: 400, for: ['ceremony'] },
  { id: 'site-pergola', src: 'assets/venue/courtyard-ceremony.png', name: 'Pergola and chairs', w: 675, h: 375, for: ['ceremony'] },
  { id: 'site-pergola-path', src: 'assets/venue/site/ceremony-locations-pergola-1-2Blog-Images-0043.jpg', name: 'Pergola path', w: 1000, h: 667, for: ['ceremony'] },
  { id: 'knot-ballroom-rows', src: 'assets/venue/knot/029_e524b771.jpg', name: 'Indoor ceremony, rows', w: 600, h: 399, for: ['ceremony'] },
  { id: 'site-chapel', src: 'assets/venue/site/ceremony-locations-chapel-1-1.jpg', name: 'Chapel', w: 450, h: 675, for: ['ceremony'] },
  { id: 'courtyard', src: 'assets/venue/courtyard.jpg', name: 'Courtyard pavers', w: 1200, h: 2133, for: ['cocktail'] },
  { id: 'knot-fountain', src: 'assets/venue/knot/056_229129c2.jpg', name: 'Fountain courtyard', w: 1400, h: 940, for: ['cocktail'] },
  { id: 'knot-fountain-2', src: 'assets/venue/knot/055_331a1877.jpg', name: 'Fountain courtyard', w: 1280, h: 854, for: ['cocktail'] },
  { id: 'knot-courtyard-glass', src: 'assets/venue/knot/026_a783fc6d.jpg', name: 'Courtyard, cocktail hour', w: 400, h: 600, for: ['cocktail'] },
  { id: 'site-courtyard-dusk', src: 'assets/venue/site/the-palacio-package-the-palacio-new-1.jpg', name: 'Courtyard fountain at dusk', w: 1000, h: 667, for: ['cocktail'] },
  { id: 'knot-dusk', src: 'assets/venue/knot/023_4efb749d.jpg', name: 'Palacio at dusk', w: 600, h: 400, for: ['cocktail'] },
  { id: 'knot-greenhouse', src: 'assets/venue/knot/020_96c1cd2b.jpg', name: 'Greenhouse', w: 1400, h: 940, for: ['cocktail'] },
  { id: 'tasting-room', src: 'assets/venue/tasting-room.jpg', name: 'Tasting room', w: 1050, h: 1400, for: ['tasting'] },
  { id: 'tasting-room-2', src: 'assets/venue/tasting-room-2.jpg', name: 'Tasting room', w: 1050, h: 1400, for: ['tasting'] },
  { id: 'site-tasting-hall', src: 'assets/venue/site/A7409521-edit-scaled.jpg', name: 'Tasting room, fireplace', w: 2560, h: 1707, for: ['tasting'] },
  { id: 'site-redondo', src: 'assets/venue/site/redondo-room-RedondoRoom-TJBStudios-51.jpg', name: 'Redondo Room', w: 1000, h: 666, for: ['tasting'] },
  { id: 'knot-wine-wall', src: 'assets/venue/knot/057_0d23a108.jpg', name: 'Wine wall', w: 1280, h: 853, for: ['tasting'] },
];

export const headTable = () => ({ id: 'head', name: 'Mr. & Mrs. Griffin', shape: 'rect', x: 25, y: 7, sides: { top: 2, bottom: 0, left: 0, right: 0 }, rot: 0, o: 0 });

// Starting layout for the 100-guest norm: sweetheart table at the arched doors, dance floor in front, rounds in a U. Rounds of 8 seat about 76 in this hall (Suggest offers long family rows for all 100); she edits from here.
export function seedTables() {
  const head = headTable();
  return [head, ...suggestTables(seedRoom(), 100, 'round8', head).tables];
}

// Cropped from Betel's "Wedding day" board (private planning reference — credit belongs to the original pinners)
const I = (name, caption, ratio) => ({ src: `assets/inspo/${name}.jpg`, caption, ratio });
export const INSPO = [
  I('chiffon-floral-arch', 'Chiffon & floral arch', 380 / 469),
  I('sheer-hanging-greenery', 'Sheer drapes overhead', 380 / 418),
  I('mirror-aisle', 'Mirror aisle', 380 / 520),
  I('green-chiffon-sculptures', 'Sculpted green chiffon', 380 / 701),
  I('greenery-stair-arch', 'Greenery entrance arch', 380 / 466),
  I('moss-stage', 'Moss & wood stage', 380 / 374),
  I('olive-drape-long-tables', 'Olive drape long tables', 380 / 376),
  I('villa-olive-velvet-tables', 'Olive velvet + tapers', 380 / 537),
  I('flower-covered-table', 'Flower-covered table', 380 / 522),
  I('sage-gold-place-setting', 'Sage & gold place setting', 380 / 455),
  I('chocolate-table-florals', 'Chocolate silk + florals', 380 / 709),
  I('chocolate-drape-candles', 'Chocolate drape & candles', 380 / 210),
  I('velvet-menu', 'Sage velvet menu', 380 / 592),
  I('dessert-table', 'Woodland dessert table', 380 / 517),
  I('drunk-in-love-bar', '“Drunk in Love” bar', 380 / 583),
  I('wine-olive-palette', 'Wine & olive palette', 380 / 709),
];

// Inspo strip under the reception plan (also in the saved picture)
export const seedInspoStrip = () => ['moss-stage', 'chiffon-floral-arch', 'sheer-hanging-greenery', 'olive-drape-long-tables', 'sage-gold-place-setting', 'dessert-table', 'drunk-in-love-bar', 'velvet-menu']
  .map((n) => ({ id: 'pin-' + n, ...INSPO.find((i) => i.src.includes(n)) }));
