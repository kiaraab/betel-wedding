// Agenda: the wedding-day flow. Rows = time · what · where · who. Saved as state.agenda (in Betel's order).
import { state, commit, uid, undoable } from './store.js';
import { WEDDING } from './data.js';
import { esc, toast } from './util.js';

const WHERE = ['Ceremony', 'Hangout spot', 'Reception', 'Other'];
const whereKey = (w) => (WHERE.includes(w) ? w : 'Other').toLowerCase().replace(/\s+/g, '-');
let freshId = null;

const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const toTime = (min) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
/** Ceremony start from WEDDING.date (a placeholder 4:00pm until confirmed). */
const ceremonyMin = () => { const r = WEDDING.date.match(/T(\d{2}):(\d{2})/); return r ? +r[1] * 60 + +r[2] : 16 * 60; };

/**
 * A typical day, built around the ceremony time. Common planner guidance:
 * guests arrive ~30 min early, ~30 min ceremony, ~60 min cocktail hour, then entrance → dinner → toasts → first dance,
 * cake about two hours into the reception, send-off at the end (~5 hours of reception).
 */
function suggested() {
  const c = ceremonyMin();
  return [
    [-30, 'Guests arrive', 'Ceremony', 'Ushers'],
    [0, 'Ceremony', 'Ceremony', 'Officiant'],
    [30, 'Cocktail hour', 'Hangout spot', ''],
    [90, 'Grand entrance', 'Reception', 'DJ / MC'],
    [100, 'Dinner', 'Reception', 'Caterer'],
    [150, 'Toasts', 'Reception', 'Maid of honor, best man'],
    [170, 'First dance', 'Reception', ''],
    [180, 'Dancing opens', 'Reception', 'DJ'],
    [240, 'Cake cutting', 'Reception', ''],
    [345, 'Last dance', 'Reception', 'DJ'],
    [360, 'Send-off', 'Other', 'Everyone'],
  ].map(([d, what, where, who]) => ({ id: uid(), time: toTime(c + d), what, where, who, suggested: true }));
}

const fmt12 = (t) => { const m = toMin(t), h = Math.floor(m / 60), mm = m % 60; return `${(h % 12) || 12}:${String(mm).padStart(2, '0')}`; };
const ampm = (t) => (toMin(t) >= 720 ? 'pm' : 'am');

function rowHTML(a, i) {
  return `
    <li class="ag-row w-${whereKey(a.where)}${a.id === freshId ? ' fresh' : ''}${a.suggested ? ' sugg' : ''}" data-id="${a.id}" style="--i:${i}">
      <button class="ag-grip" aria-label="Drag to reorder" title="Drag to reorder"><i></i><i></i><i></i></button>
      <label class="ag-time"><span class="ag-t">${fmt12(a.time)}<small>${ampm(a.time)}</small></span><input type="time" data-k="time" value="${esc(a.time)}" aria-label="Time"/></label>
      <span class="ag-dot" aria-hidden="true"></span>
      <input class="ag-what" data-k="what" value="${esc(a.what)}" placeholder="What" aria-label="What"/>
      <label class="ag-where"><select data-k="where" aria-label="Where">${WHERE.map((w) => `<option ${w === (WHERE.includes(a.where) ? a.where : 'Other') ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
      <input class="ag-who" data-k="who" value="${esc(a.who)}" placeholder="Who" aria-label="Who"/>
      ${a.suggested ? '<span class="ag-sugg" title="Suggested — edit to make it yours">suggested</span>' : '<span></span>'}
      <button class="x ag-x" data-del aria-label="Remove ${esc(a.what || 'row')}">×</button>
    </li>`;
}

export function renderAgenda(view) {
  if (!Array.isArray(state.agenda)) state.agenda = [];
  const list = state.agenda;
  view.innerHTML = `
    <div class="page-head ag-head">
      <h1>Agenda</h1>
      <div class="head-actions">
        <button class="btn line sm" id="agSuggest">Suggest an agenda</button>
        <button class="btn moss sm" id="agAdd">+ Add</button>
      </div>
    </div>
    ${list.length ? '' : '<p class="ag-empty paper"><i class="dove" aria-hidden="true"></i><span>The day, hour by hour.</span></p>'}
    <ol class="ag-list">${list.map(rowHTML).join('')}</ol>`;
  freshId = null;
  const ol = view.querySelector('.ag-list');
  const find = (el) => state.agenda.find((a) => a.id === el.closest('.ag-row').dataset.id);

  // Edits save in place (no re-render, so typing isn't interrupted)
  ol.querySelectorAll('[data-k]').forEach((el) => {
    const save = () => {
      const a = find(el); if (!a) return;
      a[el.dataset.k] = el.value;
      if (a.suggested) { a.suggested = false; el.closest('.ag-row').classList.remove('sugg'); el.closest('.ag-row').querySelector('.ag-sugg')?.replaceWith(document.createElement('span')); }
      if (el.dataset.k === 'time') el.closest('.ag-row').querySelector('.ag-t').innerHTML = `${fmt12(a.time)}<small>${ampm(a.time)}</small>`;
      if (el.dataset.k === 'where') el.closest('.ag-row').className = el.closest('.ag-row').className.replace(/w-[\w-]+/, `w-${whereKey(a.where)}`);
      commit({ silent: true });
    };
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'time' ? 'change' : 'input', save);
    if (el.tagName === 'INPUT' && el.type !== 'time') el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
  });
  ol.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
    const row = b.closest('.ag-row'), a = find(b);
    row.classList.add('leaving');
    setTimeout(() => undoable(`${a.what || 'Row'} removed`, () => { state.agenda = state.agenda.filter((x) => x.id !== a.id); }, toast), 200);
  });

  view.querySelector('#agAdd').onclick = () => {
    const last = state.agenda.at(-1);
    const a = { id: uid(), time: last ? toTime(toMin(last.time) + 30) : toTime(ceremonyMin()), what: '', where: last?.where || 'Reception', who: '' };
    state.agenda.push(a);
    freshId = a.id;
    commit();
    view.querySelector(`.ag-row[data-id="${a.id}"] .ag-what`)?.focus();
  };
  view.querySelector('#agSuggest').onclick = () => {
    // Adds the suggested moments that aren't on the agenda yet, in time order around what's there
    const have = new Set(state.agenda.map((a) => a.what.trim().toLowerCase()));
    const add = suggested().filter((s) => !have.has(s.what.toLowerCase()));
    if (!add.length) { toast('Already has every suggestion'); return; }
    undoable(`${add.length} suggestions added`, () => {
      state.agenda = [...state.agenda, ...add].sort((x, y) => toMin(x.time) - toMin(y.time));
    }, toast);
  };

  /* drag to reorder: rows glide out of the way, order saved on drop */
  const rows = () => [...ol.querySelectorAll('.ag-row')];
  const flip = (move) => {
    const before = new Map(rows().map((r) => [r, r.getBoundingClientRect().top]));
    move();
    rows().forEach((r) => {
      if (r.classList.contains('dragging')) return;
      const d = before.get(r) - r.getBoundingClientRect().top;
      if (d) r.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  };
  let drag = null;
  ol.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.ag-grip');
    if (!g) return;
    e.preventDefault();
    const row = g.closest('.ag-row');
    drag = { row, id: e.pointerId, y0: e.clientY, top0: row.offsetTop };
    row.classList.add('dragging');
    try { g.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  });
  ol.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const y = e.clientY - ol.getBoundingClientRect().top;
    const over = rows().find((r) => r !== drag.row && y > r.offsetTop && y < r.offsetTop + r.offsetHeight);
    if (over) {
      const after = rows().indexOf(over) > rows().indexOf(drag.row);
      flip(() => over[after ? 'after' : 'before'](drag.row));
    }
    drag.row.style.transform = `translateY(${e.clientY - drag.y0 - (drag.row.offsetTop - drag.top0)}px)`;
  });
  const drop = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { row } = drag; drag = null;
    const from = row.style.transform;
    row.style.transform = '';
    row.classList.remove('dragging');
    row.animate([{ transform: from }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
    const order = rows().map((r) => r.dataset.id);
    state.agenda.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    commit({ silent: true });
  };
  ol.addEventListener('pointerup', drop);
  ol.addEventListener('pointercancel', drop);
  // keyboard: ↑/↓ on the focused grip moves its row
  ol.addEventListener('keydown', (e) => {
    const g = e.target.closest('.ag-grip');
    if (!g || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const row = g.closest('.ag-row'), sib = e.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
    if (!sib) return;
    flip(() => sib[e.key === 'ArrowUp' ? 'before' : 'after'](row));
    g.focus();
    const order = rows().map((r) => r.dataset.id);
    state.agenda.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    commit({ silent: true });
  });
}
