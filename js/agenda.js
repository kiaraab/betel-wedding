// Agenda (REQ-52): the wedding day as a calendar day view. Blocks can be dragged to move, dragged at the bottom
// edge to resize (15-minute snap), and clicked to edit in a side panel. Saved as state.agenda:
// { id, start: 'HH:MM', end: 'HH:MM', title, place, responsible (team person id), notes, suggested }
import { state, commit, uid, undoable } from './store.js';
import { WEDDING } from './data.js';
import { esc, toast } from './util.js';

const PLACES = ['Ceremony', 'Reception', 'Hangout spot', 'Other'];
const placeKey = (p) => (PLACES.includes(p) ? p : 'Other').toLowerCase().replace(/\s+/g, '-');
const PX = 1.6; // pixels per minute (96 px an hour, so a 10-minute block still reads)
const SNAP = 15;
const PREFS = [['firstlook', 'First look'], ['dinner', 'Longer dinner'], ['dancing', 'More dancing']];

let selId = null;        // block open in the side panel
let suggesting = false;  // side panel shows the "suggest" form
let prefs = new Set();

const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const toTime = (min) => { const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min))); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const fmt = (t) => { const m = toMin(t), h = Math.floor(m / 60), mm = m % 60; return `${(h % 12) || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''}${h >= 12 ? 'pm' : 'am'}`; };
const snap = (m) => Math.round(m / SNAP) * SNAP;
const ceremonyMin = () => { const r = WEDDING.date.match(/T(\d{2}):(\d{2})/); return r ? +r[1] * 60 + +r[2] : 16 * 60; };
const personName = (id) => state.people.find((p) => p.id === id)?.name || '';

/** Older agenda rows (time · what · where · who) become blocks that run until the next row. */
function migrate() {
  if (!Array.isArray(state.agenda)) state.agenda = [];
  if (!state.agenda.some((a) => a.time !== undefined && a.start === undefined)) return;
  const rows = state.agenda.slice().sort((a, b) => toMin(a.time ?? a.start) - toMin(b.time ?? b.start));
  state.agenda = rows.map((a, i) => {
    if (a.start !== undefined) return a;
    const start = toMin(a.time), next = rows[i + 1] ? toMin(rows[i + 1].time ?? rows[i + 1].start) : start + 30;
    return { id: a.id || uid(), start: a.time, end: toTime(Math.max(start + 15, next > start ? next : start + 30)), title: a.what || '', place: PLACES.includes(a.where) ? a.where : 'Other', responsible: '', notes: a.who || '', suggested: !!a.suggested };
  });
  commit({ silent: true });
}

/* ---------- the day, suggested ---------- */
/** A typical sequence; durations are scaled to fit the chosen window. Common planner guidance in the base lengths. */
function suggestBlocks(from, to) {
  const seq = [
    ...(prefs.has('firstlook') ? [['First look', 'Other', 20]] : []),
    ['Guests arrive', 'Ceremony', 30],
    ['Ceremony', 'Ceremony', 30],
    ['Cocktail hour', 'Hangout spot', 60],
    ['Grand entrance', 'Reception', 10],
    ['Dinner', 'Reception', prefs.has('dinner') ? 90 : 60],
    ['Toasts', 'Reception', 20],
    ['First dance', 'Reception', 10],
    ['Dancing', 'Reception', prefs.has('dancing') ? 150 : 90],
    ['Cake cutting', 'Reception', 15],
    ['Last dance', 'Reception', 10],
    ['Send-off', 'Other', 15],
  ];
  const total = seq.reduce((n, s) => n + s[2], 0), span = Math.max(60, to - from), k = span / total;
  let t = from;
  return seq.map(([title, place, len], i) => {
    const start = t, end = i === seq.length - 1 ? to : Math.max(start + 5, Math.round((t + len * k) / 5) * 5);
    t = end;
    return { id: uid(), start: toTime(start), end: toTime(end), title, place, responsible: '', notes: '', suggested: true };
  });
}

/* ---------- layout ---------- */
function range() {
  const ms = state.agenda.flatMap((a) => [toMin(a.start), toMin(a.end)]);
  const lo = Math.min(12 * 60, ...ms), hi = Math.max(23 * 60, ...ms);
  return { from: Math.floor(lo / 60) * 60, to: Math.min(24 * 60, Math.ceil(hi / 60) * 60) };
}
/** Side-by-side lanes for blocks that overlap in time. */
function lanes(list) {
  const sorted = list.slice().sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(b.end) - toMin(a.end));
  const out = new Map();
  let cluster = [], clusterEnd = -1;
  const flush = () => { const n = Math.max(...cluster.map((c) => out.get(c.id).lane)) + 1; cluster.forEach((c) => { out.get(c.id).of = n; }); cluster = []; };
  sorted.forEach((a) => {
    const s = toMin(a.start), e = toMin(a.end);
    if (cluster.length && s >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => toMin(c.end) > s).map((c) => out.get(c.id).lane));
    let lane = 0; while (used.has(lane)) lane++;
    out.set(a.id, { lane, of: 1 });
    cluster.push(a); clusterEnd = Math.max(clusterEnd, e);
  });
  if (cluster.length) flush();
  return out;
}

function blockHTML(a, r, ln) {
  const top = (toMin(a.start) - r.from) * PX, h = Math.max(SNAP * PX, (toMin(a.end) - toMin(a.start)) * PX);
  const l = ln.get(a.id) || { lane: 0, of: 1 };
  const short = h < 34;
  return `
    <div class="ab p-${placeKey(a.place)}${a.id === selId ? ' sel' : ''}${short ? ' short' : ''}" data-id="${a.id}" tabindex="0" role="button"
      aria-label="${esc(a.title || 'Event')} ${fmt(a.start)} to ${fmt(a.end)}"
      style="top:${top}px;height:${h}px;left:calc(${(l.lane / l.of) * 100}% + 2px);width:calc(${100 / l.of}% - 4px)">
      <div class="ab-t">${a.title ? esc(a.title) : '<em>New event</em>'}${short ? ` <span>${fmt(a.start)}</span>` : ''}</div>
      ${short ? '' : `<div class="ab-m">${fmt(a.start)}–${fmt(a.end)}${a.place ? ` · ${esc(a.place)}` : ''}${a.responsible ? ` · ${esc(personName(a.responsible))}` : ''}</div>`}
      ${a.suggested && !short ? '<div class="ab-s">Suggested</div>' : ''}
      <div class="ab-r" data-resize aria-hidden="true"></div>
    </div>`;
}

function panelHTML() {
  if (suggesting) {
    const c = ceremonyMin();
    return `
      <form class="ap" id="agSuggestForm">
        <div class="ap-head"><h2>Suggest</h2><button type="button" class="x" data-closepanel aria-label="Close">×</button></div>
        <div class="ap-row2">
          <label class="ap-f"><span>Start</span><input type="time" name="from" value="${toTime(c - 30 - (prefs.has('firstlook') ? 20 : 0))}" step="900"/></label>
          <label class="ap-f"><span>End</span><input type="time" name="to" value="22:00" step="900"/></label>
        </div>
        <div class="ap-chips" role="group" aria-label="Preferences">
          ${PREFS.map(([k, l]) => `<button type="button" class="chip${prefs.has(k) ? ' on' : ''}" data-pref="${k}" aria-pressed="${prefs.has(k)}">${l}</button>`).join('')}
        </div>
        <p class="ap-note">Replaces earlier suggestions. Your own events stay.</p>
        <button class="btn moss sm">Fill the day</button>
      </form>`;
  }
  const a = state.agenda.find((x) => x.id === selId);
  if (!a) return '';
  return `
    <div class="ap" data-edit="${a.id}">
      <div class="ap-head"><h2>Event</h2><button type="button" class="x" data-closepanel aria-label="Close">×</button></div>
      <label class="ap-f"><span>Title</span><input data-k="title" placeholder="Name this event" value="${esc(a.title)}" autocomplete="off"/></label>
      <div class="ap-row2">
        <label class="ap-f"><span>Start</span><input type="time" data-k="start" value="${esc(a.start)}" step="900"/></label>
        <label class="ap-f"><span>End</span><input type="time" data-k="end" value="${esc(a.end)}" step="900"/></label>
      </div>
      <label class="ap-f"><span>Place</span><select data-k="place">${PLACES.map((p) => `<option ${p === a.place ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
      <label class="ap-f"><span>Responsible</span><select data-k="responsible"><option value="">—</option>${state.people.map((p) => `<option value="${p.id}" ${p.id === a.responsible ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="ap-f"><span>Notes</span><textarea data-k="notes" rows="3">${esc(a.notes)}</textarea></label>
      <div class="ap-foot">
        ${a.suggested ? '<button type="button" class="linklike" data-unsuggest>Clear “suggested”</button>' : '<span></span>'}
        <button type="button" class="linklike danger" data-delblock>Delete</button>
      </div>
    </div>`;
}

/* ---------- responsible → a line in that person's notes (their popup) ---------- */
const noteLine = (a) => `Agenda: ${fmt(a.start)} ${a.title || 'event'}`;
function guestOf(pid) { return state.guests.find((g) => g.personId === pid); }
function dropNote(a) {
  const g = a.responsible && guestOf(a.responsible);
  if (!g || !a.noteLine) return;
  g.notes = String(g.notes || '').split('\n').filter((l) => l !== a.noteLine).join('\n');
}
function addNote(a) {
  const g = a.responsible && guestOf(a.responsible);
  if (!g) { a.noteLine = ''; return; }
  a.noteLine = noteLine(a);
  g.notes = [String(g.notes || '').trim(), a.noteLine].filter(Boolean).join('\n');
}

export function renderAgenda(view) {
  const keepScroll = view.querySelector('#agCal')?.scrollTop; // re-render keeps the day where it was
  migrate();
  if (selId && !state.agenda.some((a) => a.id === selId)) selId = null;
  const r = range(), ln = lanes(state.agenda);
  const hours = [];
  for (let m = r.from; m < r.to; m += 60) hours.push(m);
  const open = suggesting || !!selId;
  view.innerHTML = `
    <div class="page-head ag-head">
      <h1>Agenda</h1>
      <div class="head-actions">
        <button class="btn line sm" id="agSuggest">Suggest an agenda</button>
        <button class="btn moss sm" id="agAdd">+ Event</button>
      </div>
    </div>
    <div class="ag-wrap${open ? ' with-panel' : ''}">
      <div class="ag-cal" id="agCal">
        <div class="ag-colhead"><span></span><span>June 17</span></div>
        <div class="ag-body" style="height:${(r.to - r.from) * PX}px">
          <div class="ag-hours">${hours.map((m) => `<div class="ag-h" style="top:${(m - r.from) * PX}px"><span>${fmt(toTime(m))}</span></div>`).join('')}</div>
          <div class="ag-col" id="agCol">
            ${hours.map((m) => `<div class="ag-line" style="top:${(m - r.from) * PX}px"></div><div class="ag-line half" style="top:${(m - r.from + 30) * PX}px"></div>`).join('')}
            ${state.agenda.map((a) => blockHTML(a, r, ln)).join('')}
          </div>
        </div>
      </div>
      ${open ? `<aside class="ag-panel">${panelHTML()}</aside>` : ''}
    </div>`;

  const rerender = () => renderAgenda(view);
  const cal = view.querySelector('#agCal'), col = view.querySelector('#agCol');
  // Opening the page: start an hour before the ceremony (or at the first event)
  if (keepScroll != null) cal.scrollTop = keepScroll;
  else {
    const first = Math.min(ceremonyMin() - 60, ...state.agenda.map((a) => toMin(a.start)));
    cal.scrollTop = Math.max(0, (first - r.from) * PX - 20);
  }

  view.querySelector('#agAdd').onclick = () => {
    const last = state.agenda.slice().sort((a, b) => toMin(b.end) - toMin(a.end))[0];
    const s = last ? toMin(last.end) : ceremonyMin();
    const a = { id: uid(), start: toTime(s), end: toTime(s + 30), title: '', place: 'Reception', responsible: '', notes: '', suggested: false };
    state.agenda.push(a);
    selId = a.id; suggesting = false;
    commit({ silent: true });
    rerender();
    view.querySelector('.ap [data-k="title"]')?.focus();
  };
  view.querySelector('#agSuggest').onclick = () => { suggesting = !suggesting; selId = null; rerender(); };

  // Double-click empty time = new event there
  col.addEventListener('dblclick', (e) => {
    if (e.target.closest('.ab')) return;
    const y = e.clientY - col.getBoundingClientRect().top;
    const s = snap(r.from + y / PX - SNAP / 2);
    const a = { id: uid(), start: toTime(s), end: toTime(s + 30), title: '', place: 'Reception', responsible: '', notes: '', suggested: false };
    state.agenda.push(a);
    selId = a.id; suggesting = false;
    commit({ silent: true });
    rerender();
    view.querySelector('.ap [data-k="title"]')?.focus();
  });

  /* drag to move, bottom edge to resize, click to edit */
  let drag = null;
  col.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.ab');
    if (!el || e.button > 0) return;
    const a = state.agenda.find((x) => x.id === el.dataset.id);
    drag = { el, a, y0: e.clientY, s0: toMin(a.start), e0: toMin(a.end), resize: !!e.target.closest('[data-resize]'), moved: false };
    try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
    e.preventDefault();
  });
  col.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dm = snap((e.clientY - drag.y0) / PX);
    if (!drag.moved && Math.abs(e.clientY - drag.y0) < 4) return;
    drag.moved = true;
    drag.el.classList.add('dragging');
    let s = drag.s0, en = drag.e0;
    if (drag.resize) en = Math.max(s + SNAP, Math.min(r.to, drag.e0 + dm));
    else { const len = drag.e0 - drag.s0; s = Math.max(r.from, Math.min(r.to - len, drag.s0 + dm)); en = s + len; }
    drag.s = s; drag.e = en;
    drag.el.style.top = (s - r.from) * PX + 'px';
    drag.el.style.height = (en - s) * PX + 'px';
    const t = drag.el.querySelector('.ab-m') || drag.el.querySelector('.ab-t span');
    if (t) t.textContent = drag.el.querySelector('.ab-m') ? `${fmt(toTime(s))}–${fmt(toTime(en))}` : fmt(toTime(s));
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) { selId = d.a.id; suggesting = false; return rerender(); }
    d.a.start = toTime(d.s); d.a.end = toTime(d.e);
    if (d.a.noteLine) { dropNote(d.a); addNote(d.a); }
    commit({ silent: true });
    rerender();
  };
  col.addEventListener('pointerup', end);
  col.addEventListener('pointercancel', end);
  col.addEventListener('keydown', (e) => {
    const el = e.target.closest('.ab');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selId = el.dataset.id; suggesting = false; rerender(); }
  });

  /* side panel */
  const panel = view.querySelector('.ag-panel');
  if (!panel) return;
  panel.querySelector('[data-closepanel]').onclick = () => { selId = null; suggesting = false; rerender(); };
  const form = panel.querySelector('#agSuggestForm');
  if (form) {
    form.querySelectorAll('[data-pref]').forEach((b) => b.onclick = () => {
      prefs.has(b.dataset.pref) ? prefs.delete(b.dataset.pref) : prefs.add(b.dataset.pref);
      b.classList.toggle('on'); b.setAttribute('aria-pressed', String(prefs.has(b.dataset.pref)));
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      const from = toMin(form.elements.from.value), to = toMin(form.elements.to.value);
      if (!(to > from + 60)) { toast('End needs to be at least an hour after the start'); return; }
      const fresh = suggestBlocks(from, to);
      suggesting = false;
      undoable(`${fresh.length} events suggested`, () => {
        state.agenda.filter((a) => a.suggested).forEach(dropNote);
        state.agenda = [...state.agenda.filter((a) => !a.suggested), ...fresh];
      }, toast);
    };
    return;
  }
  const a = state.agenda.find((x) => x.id === selId);
  const refreshBlock = () => {
    const el = col.querySelector(`.ab[data-id="${CSS.escape(a.id)}"]`);
    if (!el) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = blockHTML(a, r, lanes(state.agenda));
    el.replaceWith(tmp.firstElementChild);
  };
  panel.querySelectorAll('[data-k]').forEach((el) => {
    const k = el.dataset.k;
    const apply = () => {
      if (k === 'responsible') { dropNote(a); a.responsible = el.value; addNote(a); }
      else if (k === 'start' || k === 'end') {
        const len = toMin(a.end) - toMin(a.start);
        if (k === 'start') { a.start = el.value; a.end = toTime(toMin(el.value) + len); panel.querySelector('[data-k="end"]').value = a.end; }
        else a.end = toMin(el.value) > toMin(a.start) ? el.value : toTime(toMin(a.start) + SNAP);
        if (a.noteLine) { dropNote(a); addNote(a); }
      } else {
        a[k] = el.value;
        if (k === 'title' && a.noteLine) { dropNote(a); addNote(a); }
      }
      commit({ silent: true });
      // times/place can change the grid's range or lanes → redraw; text edits update just the block
      if (k === 'start' || k === 'end' || k === 'place') rerender(); else refreshBlock();
    };
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'time' ? 'change' : 'input', apply);
  });
  panel.querySelector('[data-unsuggest]')?.addEventListener('click', () => { a.suggested = false; commit({ silent: true }); rerender(); });
  panel.querySelector('[data-delblock]').onclick = () => {
    selId = null;
    undoable(`${a.title || 'Event'} deleted`, () => { dropNote(a); state.agenda = state.agenda.filter((x) => x.id !== a.id); }, toast);
  };
}
