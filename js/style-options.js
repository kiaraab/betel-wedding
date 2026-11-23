// "Look": the style choices for the 3D scenes, built from Betel's Pinterest themes. Pure data + picker HTML (no DOM access, no three.js).
// The plan keeps only what was picked: state.style = { canopy: 'ivory', extras: ['skee'], ... }. A missing key means the default, which is today's look.
import { esc } from './util.js';

/** Which spaces a group shows in: 'ceremony' = the outdoor pergola lawn, 'reception' = the ballroom, 'cocktail' = the courtyard, 'tasting' = the tasting room. */
const CER = ['ceremony'], REC = ['reception'], HANG = ['cocktail', 'tasting'];
export const STYLE_GROUPS = [
  { id: 'canopy', label: 'Canopy', in: CER, def: 'sage', opts: [['sage', 'Sage Chiffon'], ['ivory', 'Ivory Chiffon'], ['wine', 'Wine-and-Sage Swag']] },
  { id: 'aisle', label: 'Aisle', in: CER, def: 'mirror', opts: [['mirror', 'Mirror Pool'], ['runner', 'Cream Runner'], ['petals', 'Petal Path']] },
  { id: 'backdrop', label: 'Backdrop', in: CER, def: 'open', opts: [['open', 'Open lawn'], ['willow', 'Willow Tunnel'], ['vine', 'Vine Curtain'], ['moss', 'Moss Portal']] },
  { id: 'arch', label: 'Arch florals', in: CER, def: 'garden', opts: [['garden', 'Garden mix'], ['tulip', 'White Tulip Cascade'], ['dahlia', 'Wine Dahlia Asymmetric'], ['calla', 'Calla Column Pair']] },
  { id: 'table', label: 'Table dressing', in: REC, def: 'choc', opts: [['choc', 'Chocolate Ruched'], ['olive', 'Olive Satin'], ['linen', 'White Linen + Garland']] },
  { id: 'candles', label: 'Candles', in: REC, def: 'taper', opts: [['taper', 'Brass Tapers'], ['glass', 'Glass Pillars on Moss'], ['candelabra', 'Candelabra + Fruit']] },
  { id: 'ceiling', label: 'Ceiling', in: REC, def: 'lights', opts: [['drape', 'Radiating Sage Drape'], ['greenery', 'Hanging Greenery Cloud'], ['lights', 'String Lights Only']] },
  { id: 'centers', label: 'Centerpieces', in: REC, def: 'wine', opts: [['wine', 'Wine + Olive + Fig'], ['white', 'All-White Tulip/Hydrangea'], ['amaranthus', 'Cascading Amaranthus']] },
  { id: 'station', label: 'Station', in: HANG, def: 'none', opts: [['none', 'None'], ['grazing', 'Produce Grazing Table'], ['bar', 'Branded Round Bar'], ['drinks', 'Signature Drinks Station']] },
  { id: 'extras', label: 'Guest extras', in: HANG, multi: true, def: [], opts: [['skee', 'Skee-ball + Bumper Cars'], ['polaroid', 'Polaroid + Vinyl Guestbook'], ['lanterns', 'Sky Lanterns']] },
];
const BY_ID = new Map(STYLE_GROUPS.map((g) => [g.id, g]));

/** The groups that apply to a space ('reception' | 'ceremony' | 'cocktail' | 'tasting'); the indoor bay has no 3D scene, so none. */
export const groupsFor = (spaceId) => STYLE_GROUPS.filter((g) => g.in.includes(spaceId));

/** Every group resolved to a valid option (anything missing or unknown falls back to the default = today's look). */
export function resolveStyle(raw) {
  const s = raw && typeof raw === 'object' ? raw : {}, out = {};
  STYLE_GROUPS.forEach((g) => {
    const ids = g.opts.map((o) => o[0]);
    if (g.multi) out[g.id] = Array.isArray(s[g.id]) ? ids.filter((id) => s[g.id].includes(id)) : [];
    else out[g.id] = ids.includes(s[g.id]) ? s[g.id] : g.def;
  });
  return out;
}
/** The style object after one pick (a multi group toggles the option). Returns a new object holding only non-default choices. */
export function withPick(raw, groupId, optId) {
  const g = BY_ID.get(groupId);
  if (!g || !g.opts.some((o) => o[0] === optId)) return raw && typeof raw === 'object' ? raw : {};
  const cur = resolveStyle(raw);
  if (g.multi) cur[groupId] = g.opts.map((o) => o[0]).filter((id) => (id === optId ? !cur[groupId].includes(id) : cur[groupId].includes(id)));
  else cur[groupId] = optId;
  const out = {};
  STYLE_GROUPS.forEach((x) => { const v = cur[x.id]; if (x.multi ? v.length : v !== x.def) out[x.id] = v; });
  return out;
}
const isOn = (g, cur, id) => (g.multi ? cur[g.id].includes(id) : cur[g.id] === id);

/** One flat chip row per group (44px targets on touch). `data-lk` = group, `data-v` = option. */
export function lookHTML(spaceId, raw) {
  const groups = groupsFor(spaceId);
  if (!groups.length) return '';
  const cur = resolveStyle(raw);
  return `<div class="look-pick" data-look="${esc(spaceId)}">${groups.map((g) => `<div class="lk-row" role="group" aria-label="${esc(g.label)}"><span class="lk-lab">${esc(g.label)}</span><div class="lk-chips">${g.opts.map(([id, l]) => `<button type="button" class="lk-chip${isOn(g, cur, id) ? ' on' : ''}" data-lk="${g.id}" data-v="${id}" aria-pressed="${isOn(g, cur, id)}">${esc(l)}</button>`).join('')}</div></div>`).join('')}</div>`;
}
/** Update the chips of every picker under `root` in place (no re-render, so focus stays). */
export function syncLook(root, raw) {
  const cur = resolveStyle(raw);
  root.querySelectorAll('.lk-chip').forEach((b) => {
    const g = BY_ID.get(b.dataset.lk), on = !!g && isOn(g, cur, b.dataset.v);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  });
}
