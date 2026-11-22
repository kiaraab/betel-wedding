// "Paste a list": text or a picture of a list -> AI (when a key is saved) or the built-in parser -> an editable review table -> add.
import { state, uid, undoable } from './store.js';
import { RELATIONS } from './layout.js';
import { esc, toast, heartLoaderHTML } from './util.js';
import { parseGuestList, normalizeAiGuests } from './guest-parse.js';
import { addPlusOne } from './guest-details.js';
import { aiAvailable, askGemini, fileToImage, aiLinkHTML, wireAiLink } from './ai.js';

export { parseGuestList };

const SIDES = ['Betel', 'Carter', 'Both'];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-zÀ-ɏ]+/g, ' ').trim();
const AI_SYSTEM = 'You extract wedding guest lists. Return JSON: an array of {"name": full name, "side": "Betel" | "Carter" | "Both" (Betel = bride, Carter = groom, Both when unknown), "household": family/household name or "", "plusOne": true if a plus-one is mentioned, "notes": short note or ""}. One entry per person. Skip headings, totals and anything that is not a guest. Do not invent people.';

/* ---------- panel ---------- */
let panel = { open: false, text: '', edits: new Map(), removed: new Set(), aiRows: null };
export const pasteIsOpen = () => panel.open;
export function openPaste(text = '') { panel = { open: true, text, edits: new Map(), removed: new Set(), aiRows: null, enter: true }; }
export function closePaste() { panel.open = false; }

/** Preview rows: AI result if there is one, else the parsed text; edited, de-duped against the list and itself. */
function previewRows(defaultSide) {
  const have = new Set(state.guests.map((g) => norm(g.name)));
  const seen = new Set();
  let dupes = 0;
  const rows = [];
  (panel.aiRows || parseGuestList(panel.text)).forEach((r) => {
    const key = norm(r.name);
    if (!key || panel.removed.has(key)) return;
    if (have.has(key) || seen.has(key)) { dupes++; return; }
    seen.add(key);
    rows.push({ key, ...r, side: r.side || defaultSide, ...panel.edits.get(key) });
  });
  return { rows, dupes };
}

/** Draws the panel into host. */
export function mountPaste(host, { defaultSide = 'Both' } = {}) {
  if (!panel.open) { host.innerHTML = ''; return; }
  const fresh = panel.enter; panel.enter = false; // animate + focus only when it opens, not on every list redraw
  const redo = () => mountPaste(host, { defaultSide });
  host.innerHTML = `
    <section class="paste${fresh ? ' enter' : ''}" aria-label="Paste a list">
      <textarea class="input paste-text" rows="4" aria-label="Names to add" placeholder="Paste names, one per line or with commas.  “Jane & John Doe (Carter)”, “Mia, bridesmaid”, “Sam + 1”">${esc(panel.text)}</textarea>
      <div class="paste-ai">
        ${aiAvailable() ? '<button type="button" class="btn line sm" data-ai-text>Read with AI</button><button type="button" class="btn line sm" data-ai-img>From a picture</button><input type="file" accept="image/*" hidden data-ai-file/>' : ''}
        <span class="paste-status" aria-live="polite"></span><span class="spacer"></span>${aiLinkHTML()}
      </div>
      <div class="paste-rows" aria-live="polite"></div>
      <div class="paste-foot"><span class="paste-note"></span><span class="spacer"></span>
        <button class="btn line sm" data-paste-cancel>Cancel</button>
        <button class="btn moss sm" data-paste-add disabled>Add</button>
      </div>
    </section>`;
  const ta = host.querySelector('.paste-text'), box = host.querySelector('.paste-rows'), status = host.querySelector('.paste-status');
  const note = host.querySelector('.paste-note'), addBtn = host.querySelector('[data-paste-add]');
  wireAiLink(host, redo);

  const draw = () => {
    const { rows, dupes } = previewRows(defaultSide);
    box.innerHTML = rows.length ? `<table class="paste-table"><thead><tr><th>Name</th><th>Side</th><th>Relation</th><th>Household</th><th>+1</th><th>Notes</th><th></th></tr></thead><tbody>${rows.map((r) => `
      <tr data-key="${esc(r.key)}">
        <td><input class="input" data-f="name" value="${esc(r.name)}" aria-label="Name"/></td>
        <td><select class="select" data-f="side" aria-label="Side">${SIDES.map((s) => `<option ${s === r.side ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td><select class="select" data-f="relation" aria-label="Relation"><option value="">—</option>${RELATIONS.map((x) => `<option ${x === r.relation ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td><input class="input" data-f="household" value="${esc(r.household || '')}" aria-label="Household"/></td>
        <td><input type="checkbox" data-f="plusOne" ${r.plusOne ? 'checked' : ''} aria-label="Plus-one"/></td>
        <td><input class="input" data-f="notes" value="${esc(r.notes || '')}" aria-label="Notes"/></td>
        <td><button type="button" class="pc-x" aria-label="Skip ${esc(r.name)}">×</button></td>
      </tr>`).join('')}</tbody></table>` : '';
    note.textContent = [rows.length ? '' : panel.text.trim() || panel.aiRows ? 'Nothing new to add' : '', dupes ? `${dupes} already on the list` : ''].filter(Boolean).join(' · ');
    addBtn.disabled = !rows.length;
    const n = rows.length + rows.filter((r) => r.plusOne).length; // each +1 becomes its own guest
    addBtn.textContent = n ? `Add ${n} guest${n === 1 ? '' : 's'}` : 'Add';
    box.querySelectorAll('tr[data-key]').forEach((tr) => {
      const key = tr.dataset.key;
      const edit = (patch) => panel.edits.set(key, { ...panel.edits.get(key), ...patch });
      tr.querySelectorAll('[data-f]').forEach((el) => {
        const f = el.dataset.f;
        el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
          edit({ [f]: el.type === 'checkbox' ? el.checked : f === 'relation' ? el.value || null : el.value });
          if (f === 'plusOne') draw();
        });
      });
      tr.querySelector('.pc-x').onclick = () => { panel.removed.add(key); draw(); };
    });
  };
  draw();
  ta.oninput = () => { panel.text = ta.value; panel.aiRows = null; draw(); };
  if (fresh) setTimeout(() => ta.focus(), 30);

  /* AI: text or picture -> rows; any failure falls back to the built-in parser */
  let busy = false;
  const runAi = async (images) => {
    if (busy) return;
    if (!images && !panel.text.trim()) { status.textContent = 'Paste some names first'; return; }
    busy = true; status.innerHTML = heartLoaderHTML('Reading', { sm: true });
    const btns = host.querySelectorAll('[data-ai-text],[data-ai-img]');
    btns.forEach((b) => { b.disabled = true; });
    try {
      const data = await askGemini({ system: AI_SYSTEM, prompt: images ? 'Extract every guest from this image.' : panel.text, images, json: true });
      const rows = normalizeAiGuests(data);
      if (!rows.length) throw new Error('No guests found.');
      panel.aiRows = rows; panel.edits = new Map(); panel.removed = new Set();
      status.textContent = `${rows.length} found, check them below`;
    } catch (e) {
      status.textContent = '';
      toast(`${e.message || 'AI failed.'}${images ? '' : ' Using the basic reader.'}`);
    }
    busy = false;
    btns.forEach((b) => { b.disabled = false; });
    draw();
  };
  host.querySelector('[data-ai-text]')?.addEventListener('click', () => runAi());
  const file = host.querySelector('[data-ai-file]');
  host.querySelector('[data-ai-img]')?.addEventListener('click', () => file.click());
  if (file) file.onchange = async () => {
    const f = file.files[0]; file.value = '';
    if (!f) return;
    try { await runAi([await fileToImage(f)]); } catch (e) { toast(e.message); }
  };

  host.querySelector('[data-paste-cancel]').onclick = () => { closePaste(); mountPaste(host, { defaultSide }); };
  addBtn.onclick = () => {
    const { rows } = previewRows(defaultSide);
    if (!rows.length) return;
    closePaste();
    const n = rows.length + rows.filter((r) => r.plusOne).length;
    undoable(`${n} guest${n === 1 ? '' : 's'} added`, () => {
      rows.forEach((r) => {
        const g = { id: uid(), name: r.name.trim() || r.key, side: r.side, rsvp: 'Not invited yet', diet: '', tableId: null,
          ...(r.relation && { relation: r.relation }), ...(r.household?.trim() && { household: r.household.trim() }), ...(r.notes?.trim() && { notes: r.notes.trim() }) };
        state.guests.push(g);
        if (r.plusOne) addPlusOne(g); // a plus-one becomes a real guest, linked to sit together
      });
    }, toast);
  };
}
