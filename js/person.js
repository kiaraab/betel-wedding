// Person card: one popup for any guest or team member. Everything edits the single guest record
// (team members map to their guest by personId), so Team, Guests, Seating and Connections agree.
import { state, commit } from './store.js';
import { RELATIONS, relationOf } from './layout.js';
import { esc } from './util.js';
import { detailsHTML, wireDetails } from './guest-details.js';

const STATUS = ['Not invited yet', 'Invited', 'Yes', 'Maybe', 'Declined'];
const SIDES = ['Betel', 'Carter', 'Both'];
let open = null; // { el, close }

/** Find the guest + team member behind an id, a guest, or a team person. */
function resolve(x) {
  const id = typeof x === 'string' ? x : x?.id;
  let guest = state.guests.find((g) => g.id === id) || null;
  let person = state.people.find((p) => p.id === (guest?.personId || id)) || null;
  if (!guest && person) guest = state.guests.find((g) => g.personId === person.id) || null;
  return { guest, person };
}

const tableName = (t) => (t.id === 'head' ? t.name : /^\d+$/.test(t.name) ? `Table ${t.name}` : t.name);

/** Open #seating on the reception plan and select that table (taps it, so the plan's own popover opens). */
function showOnPlan(tableId) {
  const tap = (tries = 0) => {
    const rec = document.querySelector('[data-space="reception"]:not(.on)');
    if (rec && tries === 0) rec.click();
    const g = document.querySelector(`#planHost [data-id="${CSS.escape(tableId)}"]`);
    if (!g) { if (tries < 30) setTimeout(() => tap(tries + 1), 60); return; }
    g.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => {
      const r = g.getBoundingClientRect(), o = { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerId: 9, isPrimary: true, button: 0 };
      g.dispatchEvent(new PointerEvent('pointerdown', o)); g.dispatchEvent(new PointerEvent('pointerup', o));
    }, 380);
  };
  if (location.hash !== '#seating') location.hash = '#seating';
  setTimeout(tap, 120);
}

export function closePerson() { open?.close(); }

export function openPerson(idOrPerson) {
  open?.close(true);
  const { guest: g, person: p } = resolve(idOrPerson);
  if (!g && !p) return;
  const roles = p ? state.roles.filter((r) => r.people.includes(p.id)).map((r) => r.title) : [];
  const couple = g?.party === 'couple';
  const table = g?.tableId ? state.tables.find((t) => t.id === g.tableId) : null;
  const name = g?.name || p?.name || '';
  const sub = [g ? `${g.side === 'Both' ? 'Shared' : g.side + '’s side'}` : '', couple ? 'The couple' : g ? relationOf(g) : '', p?.tag].filter(Boolean);
  const fld = (k, label, { type = 'text', cls = '', ph = '' } = {}) =>
    `<label class="pp-f ${cls}"><span>${label}</span><input class="pp-in" data-k="${k}" type="${type}" value="${esc(g?.[k])}" placeholder="${ph}" autocomplete="off"/></label>`;

  const scrim = document.createElement('div');
  scrim.className = 'pp-scrim';
  scrim.innerHTML = `
    <section class="pp" role="dialog" aria-modal="true" aria-label="${esc(name)}" tabindex="-1">
      <header class="pp-head">
        ${g?.photo ? `<img class="pp-photo" src="${g.photo}" alt=""/>` : ''}
        <div class="pp-id">
          <input class="pp-name" data-k="name" value="${esc(name)}" aria-label="Name" spellcheck="false"/>
          <div class="pp-sub">${sub.map(esc).join(' · ')}</div>
        </div>
        <button class="x pp-x" aria-label="Close">×</button>
      </header>
      ${g ? `
      <div class="pp-body">
        <div class="pp-row">
          <label class="pp-f"><span>Status</span><select class="pp-in rsvp" data-k="rsvp" data-v="${esc(g.rsvp)}">${STATUS.map((s) => `<option ${s === g.rsvp ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          ${couple ? '' : `<label class="pp-f"><span>Relation</span><select class="pp-in" data-k="relation"><option value="none">—</option>${RELATIONS.map((r) => `<option ${r === relationOf(g) ? 'selected' : ''}>${r}</option>`).join('')}</select></label>`}
        </div>
        <div class="pp-f"><span>Side</span><div class="pp-seg" role="radiogroup" aria-label="Side">${SIDES.map((s) => `<button type="button" role="radio" data-side="${s}" aria-checked="${s === g.side}" class="${s === g.side ? 'on' : ''}">${s === 'Both' ? 'Shared' : s}</button>`).join('')}</div></div>
        ${roles.length ? `<div class="pp-f"><span>Role</span><div class="pp-roles">${roles.map((r) => `<em>${esc(r)}</em>`).join('')}</div></div>` : ''}
        <div class="pp-sec">Details ${g.street ? '' : '<b class="need-addr">Need address</b>'}</div>
        ${detailsHTML(g)}
        <div class="pp-table">
          <span>${table ? esc(tableName(table)) : 'Not seated yet'}</span>
          <button class="linklike" data-plan>${table ? 'Show on plan' : 'Open the plan'} <i aria-hidden="true">→</i></button>
        </div>
      </div>` : `
      <div class="pp-body"><p class="muted small">Not on the guest list.</p></div>`}
    </section>`;
  document.body.append(scrim);
  const card = scrim.querySelector('.pp');
  requestAnimationFrame(() => scrim.classList.add('in'));
  let dirty = false;

  // edits: write straight to the guest (and the team person's name), save quietly, redraw the page on close
  card.querySelectorAll('[data-k]').forEach((el) => {
    if (el.closest('.gd')) return; // the details block wires itself
    const write = () => {
      const k = el.dataset.k;
      const v = el.value;
      if (k === 'name') {
        if (!v.trim()) return;
        if (g) g.name = v.trim();
        if (p) p.name = v.trim();
      } else if (g) {
        g[k] = v;
        if (k === 'rsvp') el.dataset.v = v;
        if (k === 'street') card.querySelector('.pp-sec .need-addr')?.classList.toggle('gone', !!v.trim());
      }
      dirty = true;
      commit({ silent: true });
    };
    el.addEventListener('input', write);
    el.addEventListener('change', write);
    if (el.dataset.k === 'name') el.addEventListener('blur', () => { if (!el.value.trim()) el.value = g?.name || p?.name || ''; });
  });
  card.querySelectorAll('[data-side]').forEach((b) => b.onclick = () => {
    g.side = b.dataset.side; dirty = true; commit({ silent: true });
    card.querySelectorAll('[data-side]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
  });

  // details (address, household, plus-one, dietary, notes, photo): redraw just that block in place
  const wireGd = () => {
    if (!g) return;
    wireDetails(card, g, { onRedraw: () => {
      dirty = true;
      card.querySelector('.gd').outerHTML = detailsHTML(g);
      const head = card.querySelector('.pp-head'), img = head.querySelector('.pp-photo');
      if (g.photo && !img) head.insertAdjacentHTML('afterbegin', `<img class="pp-photo" src="${g.photo}" alt=""/>`);
      else if (img) g.photo ? (img.src = g.photo) : img.remove();
      card.querySelector('.pp-sec .need-addr')?.classList.toggle('gone', !!String(g.street || '').trim());
      wireGd();
    } });
    card.querySelectorAll('.gd [data-k]').forEach((el) => el.addEventListener('input', () => { dirty = true; }));
  };
  wireGd();

  const close = (instant) => {
    if (!scrim.isConnected) return;
    removeEventListener('keydown', onKey, true);
    open = null;
    if (dirty) commit(); // let the page underneath redraw with the edits
    if (instant) return scrim.remove();
    scrim.classList.remove('in'); scrim.classList.add('out');
    setTimeout(() => scrim.remove(), 260);
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  addEventListener('keydown', onKey, true);
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });
  card.querySelector('.pp-x').onclick = () => close();
  card.querySelector('[data-plan]')?.addEventListener('click', () => { const tid = g.tableId; close(true); tid ? showOnPlan(tid) : (location.hash = '#seating'); });
  open = { el: scrim, close };
  card.focus({ preventScroll: true });
}
