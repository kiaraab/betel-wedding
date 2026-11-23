// One "address & details" editor for a guest, shared by the Guests list (row details) and the person card.
// Household + plus-one are picked from the guest list and create 'together' links automatically.
import { state, commit, uid } from './store.js';
import { togetherGroups, seatCount, RELATIONS, relationOf } from './layout.js';
import { esc, toast } from './util.js';
import { FEATURES } from './features.js';

export const DIETS = ['Gluten free', 'Vegetarian', 'Vegan', 'Dairy free', 'Nut allergy', 'Shellfish allergy', 'Halal', 'Kosher', 'Pescatarian', 'Limit alcohol'];
const key = (a, b) => [a, b].sort().join('|');
const dietList = (g) => String(g.diet || '').split(/\s*[,;]\s*/).filter(Boolean);
export const households = () => [...new Set(state.guests.map((g) => String(g.household || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const lastName = (n) => String(n || '').trim().split(/\s+/).slice(1).join(' ');

/* ---------- links ---------- */
/** Add a 'together' link unless they're already grouped or marked apart. `auto` remembers why it was made. */
export function linkTogether(a, b, auto) {
  if (!a || !b || a === b) return false;
  state.links ||= [];
  if (state.links.some((l) => key(l.a, l.b) === key(a, b))) return false;
  if (togetherGroups(state.guests, state.links).some((m) => m.some((x) => x.id === a) && m.some((x) => x.id === b))) return false;
  state.links.push({ a, b, type: 'together', ...(auto && { auto }) });
  return true;
}
const dropAutoLinks = (id, auto) => { state.links = (state.links || []).filter((l) => !(l.auto === auto && (l.a === id || l.b === id))); };

/** Seat `g` at `tableId` if it has room. */
function seatWith(g, tableId) {
  const t = tableId && state.tables.find((x) => x.id === tableId);
  if (!t || g.tableId) return;
  if (state.guests.filter((x) => x.tableId === t.id).length < seatCount(t)) g.tableId = t.id;
}

/** The one Household control: pick an existing household, "—" for none, or add a new one. */
export const householdSelectHTML = (g, extra = '') => {
  const cur = String(g.household || '').trim(), hh = households();
  if (cur && !hh.includes(cur)) hh.push(cur);
  return `<select class="select" data-hh ${extra} aria-label="Household"><option value="">—</option>${hh.map((h) => `<option ${h === cur ? 'selected' : ''}>${esc(h)}</option>`).join('')}<option value="__new">+ New household</option></select>`;
};
export function wireHouseholdSelect(sel, g, redraw) {
  sel.onchange = () => {
    if (sel.value !== '__new') { const n = setHousehold(g, sel.value); if (n) toast(`Linked with ${n} in ${g.household}`); return redraw(); }
    const input = document.createElement('input');
    input.className = 'input'; input.placeholder = 'Household name'; input.setAttribute('aria-label', 'New household name');
    input.value = lastName(g.name) ? `${lastName(g.name)} household` : '';
    const pretty = sel.nextElementSibling?.classList?.contains('bs-btn') ? sel.nextElementSibling : null; // the glass button that fronts a bubbly select
    pretty?.remove(); sel.replaceWith(input); input.focus(); input.select();
    let done = false;
    const finish = (save) => { if (done) return; done = true; if (save && input.value.trim()) setHousehold(g, input.value); redraw(); };
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') { e.stopPropagation(); finish(false); } };
    input.onblur = () => finish(true);
  };
}

export function setHousehold(g, name) {
  name = String(name || '').trim();
  name = households().find((h) => h.toLowerCase() === name.toLowerCase()) || name; // same household, same spelling
  g.household = name;
  dropAutoLinks(g.id, 'household');
  if (!name) return 0;
  const mates = state.guests.filter((x) => x.id !== g.id && String(x.household || '').trim().toLowerCase() === name.toLowerCase());
  return mates.reduce((n, m) => n + (linkTogether(g.id, m.id, 'household') ? 1 : 0), 0);
}

export function setPlusOne(g, otherId) {
  dropAutoLinks(g.id, 'plusone');
  const other = state.guests.find((x) => x.id === otherId);
  g.plusOneId = other ? other.id : '';
  g.plusOne = other ? other.name : '';
  if (!other) return;
  linkTogether(g.id, other.id, 'plusone');
  seatWith(other, g.tableId); seatWith(g, other.tableId);
}

/** Creates "Sam's plus-one" next to Sam: same side + household, not invited yet, seated with them if there's room. */
export function addPlusOne(g) {
  const p = { id: uid(), name: `${g.name.split(' ')[0]}’s plus-one`, side: g.side, relation: 'Plus-one', rsvp: 'Not invited yet', diet: '', tableId: null, ...(g.household && { household: g.household }) };
  state.guests.push(p);
  setPlusOne(g, p.id);
  return p;
}

/* ---------- photo: small square JPEG, kept tiny for local storage ---------- */
export function photoFromFile(file, max = 7_000) {   // ~7 KB each, so 60 guests with photos stay well under the 900 KB shared-plan limit
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      let px = 128, q = 0.8, url = '';
      for (let i = 0; i < 8; i++) {
        const c = document.createElement('canvas'); c.width = c.height = px;
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, px, px);
        url = c.toDataURL('image/jpeg', q);
        if (url.length * 0.75 <= max) break;
        if (q > 0.5) q -= 0.12; else px = Math.round(px * 0.8);
      }
      URL.revokeObjectURL(img.src);
      resolve(url);
    };
    img.onerror = () => reject(new Error('Not an image'));
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- markup ---------- */
const field = (g, k, label, cls = '') => `<label class="gd-f ${cls}"><span>${label}</span><input class="input${k === 'street' ? ' addr-street' : ''}" data-k="${k}" value="${esc(g[k])}" autocomplete="${k === 'street' ? 'street-address' : 'off'}"/></label>`;

/** extra: also show Relation + Table (the Guests list keeps only Side, RSVP and Meal in the row). */
export function detailsHTML(g, { extra = false } = {}) {
  const hh = households();
  const cur = String(g.household || '').trim();
  const others = state.guests.filter((x) => x.id !== g.id && x.party !== 'couple').sort((a, b) => a.name.localeCompare(b.name));
  const diets = dietList(g);
  const custom = [...new Set(state.guests.flatMap(dietList))].filter((d) => !DIETS.includes(d));
  const unnamedPlus = g.plusOne && !g.plusOneId;
  return `
    <div class="gd${FEATURES.address ? '' : ' gd-noaddr'}" data-gid="${g.id}">
      <div class="gd-photo">
        ${g.photo ? `<img src="${g.photo}" alt=""/><button class="linklike" data-photo-del>Remove</button>` : '<button class="gd-photo-add" data-photo-add>Add photo</button>'}
        <input type="file" accept="image/*" hidden data-photo-file/>
      </div>
      ${FEATURES.address ? `<div class="gd-addr">
        ${field(g, 'street', 'Street', 'c4')}${field(g, 'street2', 'Apt / suite', 'c2')}
        ${field(g, 'city', 'City', 'c3')}${field(g, 'state', 'State', 'c1')}${field(g, 'zip', 'ZIP', 'c2')}
      </div>` : ''}
      <div class="gd-rel">
        ${extra ? `${g.party === 'couple' ? '' : `<label class="gd-f"><span>Relation</span><select class="select" data-k="relation"><option value="none">—</option>${RELATIONS.map((r) => `<option ${r === relationOf(g) ? 'selected' : ''}>${r}</option>`).join('')}</select></label>`}
        <label class="gd-f"><span>Table</span><select class="select" data-tbl><option value="">—</option>${state.tables.map((t) => `<option value="${t.id}" ${t.id === g.tableId ? 'selected' : ''}>${esc(t.id === 'head' ? 'Sweetheart' : t.name)}</option>`).join('')}</select></label>` : ''}
        <label class="gd-f"><span>Household</span>${householdSelectHTML(g)}</label>
        <label class="gd-f"><span>Plus-one</span>
          <select class="select" data-plus>
            <option value="">—</option>
            ${unnamedPlus ? `<option value="__unnamed" selected>${esc(g.plusOne)} (unnamed)</option>` : ''}
            ${others.map((o) => `<option value="${o.id}" ${o.id === g.plusOneId ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}
            <option value="__new">+ Add a plus-one</option>
          </select>
        </label>
        <div class="gd-f"><span>Dietary</span>
          <div class="gd-diet">
            <button type="button" class="select gd-diet-btn" aria-haspopup="true" aria-expanded="false">${diets.length ? esc(diets.join(', ')) : '—'}</button>
            <div class="gd-diet-menu" hidden>
              ${[...DIETS, ...custom].map((d) => `<label><input type="checkbox" value="${esc(d)}" ${diets.includes(d) ? 'checked' : ''}/>${esc(d)}</label>`).join('')}
              <input class="input gd-diet-own" placeholder="Add your own" aria-label="Add your own dietary need"/>
            </div>
          </div>
        </div>
      </div>
      <label class="gd-f gd-notes"><span>Notes</span><textarea class="input" data-k="notes" rows="1">${esc(g.notes)}</textarea></label>
    </div>`;
}

/* ---------- wiring ---------- */
const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; };

/** onRedraw: called after changes that affect other rows (household, plus-one, photo). */
export function wireDetails(root, g, { onRedraw } = {}) {
  const box = root.querySelector(`.gd[data-gid="${CSS.escape(g.id)}"]`);
  if (!box) return;
  const redraw = () => { commit({ silent: true }); onRedraw?.(); };
  box.querySelectorAll('[data-k]').forEach((el) => {
    el.addEventListener('input', () => { g[el.dataset.k] = el.value; commit({ silent: true }); if (el.tagName === 'TEXTAREA') grow(el); });
    el.addEventListener('change', () => { if (el.dataset.k === 'street') onRedraw?.(); });
  });
  box.querySelectorAll('textarea').forEach(grow);

  const tbl = box.querySelector('[data-tbl]');
  if (tbl) tbl.onchange = () => {
    const t = state.tables.find((x) => x.id === tbl.value);
    if (t && state.guests.filter((x) => x.tableId === t.id && x.id !== g.id).length >= seatCount(t)) { toast('That table is full'); tbl.value = g.tableId || ''; return; }
    g.tableId = t ? t.id : null; commit({ silent: true });
  };

  // household: pick a group, or add a new one (shared with the guest table)
  wireHouseholdSelect(box.querySelector('[data-hh]'), g, redraw);

  // plus-one: someone on the list, or a new "X's plus-one" guest
  const plus = box.querySelector('[data-plus]');
  plus.onchange = () => {
    if (plus.value === '__unnamed') return;
    if (plus.value === '__new') { const p = addPlusOne(g); toast(`${p.name} added`); return redraw(); }
    setPlusOne(g, plus.value);
    redraw();
  };

  // dietary: multi-select + your own
  const dBtn = box.querySelector('.gd-diet-btn'), dMenu = box.querySelector('.gd-diet-menu');
  const writeDiet = () => {
    const vals = [...dMenu.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value);
    g.diet = vals.join(', '); dBtn.textContent = vals.length ? g.diet : '—'; commit({ silent: true });
  };
  dBtn.onclick = () => { const open = dMenu.hidden; dMenu.hidden = !open; dBtn.setAttribute('aria-expanded', open); };
  dMenu.querySelectorAll('input[type=checkbox]').forEach((c) => c.onchange = writeDiet);
  const own = dMenu.querySelector('.gd-diet-own');
  own.onkeydown = (e) => {
    if (e.key !== 'Enter' || !own.value.trim()) return;
    e.preventDefault();
    const v = own.value.trim().replace(/^\w/, (c) => c.toUpperCase());
    if (![...dMenu.querySelectorAll('input[type=checkbox]')].some((c) => c.value.toLowerCase() === v.toLowerCase())) {
      const l = document.createElement('label'); l.innerHTML = `<input type="checkbox" value="${esc(v)}" checked/>${esc(v)}`;
      own.before(l); l.querySelector('input').onchange = writeDiet;
    }
    own.value = ''; writeDiet();
  };
  document.addEventListener('pointerdown', function off(e) {
    if (!box.isConnected) return document.removeEventListener('pointerdown', off);
    if (!dMenu.hidden && !e.target.closest('.gd-diet')) { dMenu.hidden = true; dBtn.setAttribute('aria-expanded', 'false'); }
  });

  // photo (optional)
  const file = box.querySelector('[data-photo-file]');
  box.querySelector('[data-photo-add]')?.addEventListener('click', () => file.click());
  box.querySelector('[data-photo-del]')?.addEventListener('click', () => { delete g.photo; redraw(); });
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    try { g.photo = await photoFromFile(f); redraw(); } catch { toast('That file isn’t a photo'); }
  };
}
