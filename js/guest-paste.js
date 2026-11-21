// "Paste a list": a very forgiving guest-list parser + a live preview to tidy before adding.
import { state, uid, undoable } from './store.js';
import { RELATIONS } from './layout.js';
import { esc, toast } from './util.js';
import { parseGuestList } from './guest-parse.js';
import { addPlusOne } from './guest-details.js';

export { parseGuestList };

const SIDES = ['Betel', 'Carter', 'Both'];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-zÀ-ɏ]+/g, ' ').trim();

/* ---------- panel ---------- */
let panel = { open: false, text: '', edits: new Map(), removed: new Set() };
export const pasteIsOpen = () => panel.open;
export function openPaste(text = '') { panel = { open: true, text, edits: new Map(), removed: new Set(), enter: true }; }
export function closePaste() { panel.open = false; }

/** Preview rows for the current text: parsed, edited, de-duped against the list and itself. */
function previewRows(defaultSide) {
  const have = new Set(state.guests.map((g) => norm(g.name)));
  const seen = new Set();
  let dupes = 0;
  const rows = [];
  parseGuestList(panel.text).forEach((r) => {
    const key = norm(r.name);
    if (!key || panel.removed.has(key)) return;
    if (have.has(key) || seen.has(key)) { dupes++; return; }
    seen.add(key);
    rows.push({ key, ...r, side: r.side || defaultSide, ...panel.edits.get(key) });
  });
  return { rows, dupes };
}

/** Draws the panel into host. onChange redraws the guest list after adding. */
export function mountPaste(host, { defaultSide = 'Both', onChange }) {
  if (!panel.open) { host.innerHTML = ''; return; }
  const fresh = panel.enter; panel.enter = false; // animate + focus only when it opens, not on every list redraw
  host.innerHTML = `
    <section class="paste${fresh ? ' enter' : ''}" aria-label="Paste a list">
      <textarea class="input paste-text" rows="4" placeholder="Paste names — one per line, or with commas.  “Jane & John Doe (Carter)”, “Mia — bridesmaid”, “Sam + 1”">${esc(panel.text)}</textarea>
      <div class="paste-chips" aria-live="polite"></div>
      <div class="paste-foot"><span class="paste-note"></span><span class="spacer"></span>
        <button class="btn line sm" data-paste-cancel>Cancel</button>
        <button class="btn moss sm" data-paste-add disabled>Add</button>
      </div>
    </section>`;
  const ta = host.querySelector('.paste-text'), chips = host.querySelector('.paste-chips');
  const note = host.querySelector('.paste-note'), addBtn = host.querySelector('[data-paste-add]');
  let shown = new Set();
  const draw = () => {
    const { rows, dupes } = previewRows(defaultSide);
    chips.innerHTML = rows.map((r) => `
      <span class="pchip${shown.has(r.key) ? '' : ' new'}" data-key="${esc(r.key)}">
        <input class="pc-name" value="${esc(r.name)}" aria-label="Name" size="${Math.max(4, r.name.length)}"/>
        <button class="pc-side s-${r.side.toLowerCase()}" title="Side · tap to change">${r.side === 'Both' ? 'Shared' : r.side}</button>
        <select class="pc-rel" aria-label="Relation"><option value="">—</option>${RELATIONS.map((x) => `<option ${x === r.relation ? 'selected' : ''}>${x}</option>`).join('')}</select>
        ${r.plusOne ? '<em class="pc-plus" title="Bringing a plus-one">+1</em>' : ''}
        <button class="pc-x" aria-label="Skip ${esc(r.name)}">×</button>
      </span>`).join('');
    shown = new Set(rows.map((r) => r.key));
    note.textContent = [rows.length ? '' : panel.text.trim() ? 'Nothing new to add' : '', dupes ? `${dupes} already on the list` : ''].filter(Boolean).join(' · ');
    addBtn.disabled = !rows.length;
    const n = rows.length + rows.filter((r) => r.plusOne).length; // each +1 becomes its own guest
    addBtn.textContent = n ? `Add ${n} guest${n === 1 ? '' : 's'}` : 'Add';
    const edit = (key, patch) => panel.edits.set(key, { ...panel.edits.get(key), ...patch });
    chips.querySelectorAll('.pchip').forEach((c) => {
      const key = c.dataset.key, row = rows.find((r) => r.key === key);
      const nm = c.querySelector('.pc-name');
      nm.oninput = () => { nm.size = Math.max(4, nm.value.length); edit(key, { name: nm.value }); };
      c.querySelector('.pc-side').onclick = (e) => {
        const next = SIDES[(SIDES.indexOf(row.side) + 1) % 3]; row.side = next; edit(key, { side: next });
        e.currentTarget.textContent = next === 'Both' ? 'Shared' : next; e.currentTarget.className = `pc-side s-${next.toLowerCase()}`;
      };
      c.querySelector('.pc-rel').onchange = (e) => edit(key, { relation: e.target.value || null });
      c.querySelector('.pc-x').onclick = () => { c.classList.add('gone'); setTimeout(() => { panel.removed.add(key); draw(); }, 180); };
    });
  };
  draw();
  ta.oninput = () => { panel.text = ta.value; draw(); };
  if (fresh) setTimeout(() => ta.focus(), 30);
  host.querySelector('[data-paste-cancel]').onclick = () => { closePaste(); mountPaste(host, { defaultSide, onChange }); };
  addBtn.onclick = () => {
    const { rows } = previewRows(defaultSide);
    if (!rows.length) return;
    closePaste();
    const n = rows.length + rows.filter((r) => r.plusOne).length;
    undoable(`${n} guest${n === 1 ? '' : 's'} added`, () => {
      rows.forEach((r) => {
        const g = { id: uid(), name: r.name.trim() || r.key, side: r.side, rsvp: 'Not invited yet', diet: '', tableId: null, ...(r.relation && { relation: r.relation }) };
        state.guests.push(g);
        if (r.plusOne) addPlusOne(g); // "+1" becomes a real guest ("Sam's plus-one"), linked to sit together
      });
    }, toast);

  };
}
