// Seed data — pulled from Betel's planning sheet. Everything here is editable in the app.
import { suggestTables } from './layout.js';
export const WEDDING = {
  couple: ['Betel', 'Carter'],
  surname: 'Griffin',
  date: '2027-06-17T16:00:00-04:00', // ceremony time is a placeholder — edit when confirmed
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

export const BOARD_SECTIONS = [
  'Wedding venues vibes', 'Wedding flowers', 'Ideas', 'Pictures', 'Main dress', 'Reception dress',
  'Wedding hair', 'Makeup looks', 'Bridesmaids', 'Groom', 'Ring', 'Wedding cakes', 'Wedding veils',
  'Wedding nails', 'Henna', 'Ethiopian wedding vibes', 'Ethiopian traditional dress', 'Unique wedding website',
];

/* ---------- Reception floor plan (units: feet) ----------
   Morais ballroom, drawn the way guests see it walking in: entrance under the balcony at the bottom,
   5 arched French doors on the far wall at the top, round tiered stage in the near-left corner.
   Shape and openings come from Morais' album + venue page; exact dimensions are still to be confirmed
   (~4,000 sq ft → 50 × 80 working size). Fixed features are locked; areas are Betel's to place. */
const opening = (wall, at, kind, w = 4) => ({ wall, at, kind, w });
export function seedRoom() {
  const w = 50, h = 80;
  const far = [1, 2, 3, 4, 5].map((i) => opening('top', (w * i) / 6, 'french'));
  const sides = ['left', 'right'].flatMap((wall) => [12, 22, 32, 42, 52].map((y, i) => opening(wall, y, i % 2 ? 'french' : 'window', i % 2 ? 4 : 5)));
  return {
    name: 'Ballroom', w, h,
    fixed: {
      openings: [...far, ...sides, opening('bottom', w / 2, 'entrance', 8)],
      stage: { cx: 0, cy: 64, r: 9, steps: 3 },        // semicircle against the left wall
      balcony: { depth: 12 },                          // overhead mezzanine across the near wall
    },
    areas: [{ id: 'dance', preset: 'dance', label: 'Dance floor', x: 17, y: 13, w: 16, h: 18 }],
  };
}

// Tap-to-add areas (feet). Betel can resize these; the room, doors and stage can't be changed.
export const AREA_PRESETS = {
  dance: { label: 'Dance floor', w: 16, h: 18 },
  bar: { label: 'Bar', w: 10, h: 4 },
  dj: { label: 'DJ', w: 8, h: 4 },
  cake: { label: 'Cake', w: 5, h: 5 },
  gifts: { label: 'Gifts & cards', w: 6, h: 3 },
  escort: { label: 'Escort cards & guest book', w: 8, h: 3 },
  coffee: { label: 'Coffee ceremony', w: 8, h: 8 },
  lounge: { label: 'Lounge', w: 12, h: 10 },
  booth: { label: 'Photo booth', w: 8, h: 8 },
  custom: { label: 'New area', w: 8, h: 6 },
};

export const headTable = () => ({ id: 'head', name: 'Mr. & Mrs. Griffin', shape: 'rect', x: 25, y: 7, sides: { top: 2, bottom: 0, left: 0, right: 0 }, rot: 0, o: 0 });

// Starting layout for ~60 guests: sweetheart table at the arched doors, dance floor in front, rounds in a U
export function seedTables() {
  const head = headTable();
  return [head, ...suggestTables(seedRoom(), 60, 'round8', head).tables];
}

/* ---------- Photos ---------- */
export const US_PHOTOS = [
  { src: 'assets/us/sunset-toast.jpg', caption: 'Engagement toast' },
  { src: 'assets/us/the-ring.jpg', caption: 'The ring!' },
  { src: 'assets/us/the-hike.jpg', caption: 'Trail days' },
  { src: 'assets/us/sunny-selfie.jpg', caption: 'Golden hour' },
  { src: 'assets/us/night-out.jpg', caption: 'Night out' },
];

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
