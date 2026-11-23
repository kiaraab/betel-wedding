// Agenda (REQ-52): the wedding day as a calendar day view. Blocks can be dragged to move, dragged at the bottom
// edge to resize (15-minute snap), and clicked to edit in a side panel. Saved as state.agenda:
// { id, start: 'HH:MM', end: 'HH:MM', title, place, responsible (team person id), notes, suggested }
import { state, commit, uid, undoable } from './store.js';
import { WEDDING } from './data.js';
import { esc, toast, heartLoaderHTML } from './util.js';
import { aiAvailable, askGemini, aiLinkHTML, wireAiLink } from './ai.js';

const PLACES = ['Ceremony', 'Reception', 'Hangout spot', 'Other'];
// Real Morais spaces (VENUE.md); `sp` = the Seating tab that shows it
const VENUES = [['Chapel', 'ceremony'], ['Pergola', 'ceremony'], ['Indoor ceremony', 'ceremony'], ['Courtyard', 'cocktail'], ['Ballroom', 'reception'], ['Balcony', 'cocktail'], ['Bar room', 'cocktail'], ['Foyer', 'cocktail'], ['Bridal suite', ''], ['Groom suite', ''], ['Redondo Room', 'reception']];
const venueSp = (v) => (VENUES.find((x) => x[0] === v) || [])[1] || 'reception';
const DAY = 1440;
const placeKey = (p) => (PLACES.includes(p) ? p : 'Other').toLowerCase().replace(/\s+/g, '-');
const PX = 1.6; // pixels per minute (96 px an hour, so a 10-minute block still reads)
const SNAP = 15;
const PREFS = [['firstlook', 'First look'], ['dinner', 'Longer dinner'], ['dancing', 'More dancing']];

let selId = null;        // block open in the side panel
let suggesting = false;  // side panel shows the "suggest" form
let prefs = new Set();
let sug = { from: '', to: '22:00', want: '' }; // the suggest form's values survive redraws
let aiPrev = null;      // events the AI proposed, waiting to be accepted
let thinking = false;
let reviewing = false;   // side panel lists overlapping suggested events
const NOTE_KEY = 'betel-agenda-overlap-dismissed';
const seen = (k) => { try { return sessionStorage.getItem(NOTE_KEY) === k; } catch { return false; } };
const markSeen = (k) => { try { sessionStorage.setItem(NOTE_KEY, k); } catch { /* fine */ } };

const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const toTime = (min) => { const m = ((Math.round(min) % DAY) + DAY) % DAY; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const fmt = (t) => { const m = toMin(t), h = Math.floor(m / 60), mm = m % 60; return `${(h % 12) || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''}${h >= 12 ? 'pm' : 'am'}`; };
// Minutes from midnight of the wedding day; a block may run past midnight (end <= start) or start after it (day2)
const S = (a) => toMin(a.start) + (a.day2 ? DAY : 0);
const E = (a) => { let e = toMin(a.end) + (a.day2 ? DAY : 0); if (e <= S(a)) e += DAY; return e; };
const setTimes = (a, s, e) => { a.start = toTime(s); a.end = toTime(e); a.day2 = s >= DAY; };
const snap = (m) => Math.round(m / SNAP) * SNAP;
const ceremonyMin = () => { const r = WEDDING.date.match(/T(\d{2}):(\d{2})/); return r ? +r[1] * 60 + +r[2] : 16 * 60; };
const kindOf = (a) => { const k = a.venue ? venueSp(a.venue) : ''; if (k === 'ceremony' || (!k && a.place === 'Ceremony')) return 'ceremony'; if (k === 'reception' || (!a.venue && a.place === 'Reception')) return 'reception'; if (k === 'cocktail' || a.place === 'Hangout spot') return 'hangout'; return 'other'; };
const dayParts = () => { const m = String(WEDDING.date).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? [+m[1], +m[2] - 1, +m[3]] : [2027, 5, 17]; };
const dayDate = (plus = 0) => { const [y, mo, d] = dayParts(); return new Date(y, mo, d + plus); };
const dayText = (plus, o) => dayDate(plus).toLocaleDateString('en-US', o);
const IC = (d) => `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  cal: IC('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  clock: IC('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
  pin: IC('<path d="M12 21s6-5.5 6-10a6 6 0 0 0-12 0c0 4.5 6 10 6 10z"/><circle cx="12" cy="11" r="2"/>'),
  who: IC('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5"/>'),
  note: IC('<path d="M5 7h14M5 12h14M5 17h9"/>'),
  plus: IC('<path d="M12 5v14M5 12h14"/>'),
  today: IC('<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>'),
};
// minutes since midnight of the wedding day, only while it is that day (drives the live "now" line)
const nowMin = () => { const n = new Date(), [y, mo, d] = dayParts(); const days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(y, mo, d)) / 864e5); return days === 0 || days === 1 ? days * DAY + n.getHours() * 60 + n.getMinutes() : null; };
let nowTimer = null;
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
    const blk = { id: uid(), title, place, venue: '', responsible: '', notes: '', suggested: true }; setTimes(blk, start, end); return blk;
  });
}

/** Words in the free-text box nudge the built-in plan when there is no AI. */
const prefsFromText = (t) => new Set([/first look/i.test(t) && 'firstlook', /dinner|dining|feast/i.test(t) && 'dinner', /danc|party|music/i.test(t) && 'dancing'].filter(Boolean));
const placeFor = (venue) => ({ ceremony: 'Ceremony', reception: 'Reception', cocktail: 'Hangout spot' }[(VENUES.find((v) => v[0] === venue) || [])[1]] || 'Other');
const clash = (a, b) => S(a) < E(b) && S(b) < E(a);

/** Turn the AI's JSON into blocks inside [from, to]; anything unreadable or outside the window is dropped. */
function blocksFromAi(data, from, to) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : [];
  const ok = /^\d{1,2}:\d{2}$/;
  return list.filter((e) => e && ok.test(String(e.start)) && ok.test(String(e.end))).map((e) => {
    let s = toMin(e.start); if (s < from) s += DAY;
    let en = toMin(e.end); if (en <= s) en += DAY;
    const venue = VENUES.some((v) => v[0] === e.venue) ? e.venue : '';
    const b = { id: uid(), title: String(e.title || '').slice(0, 60), place: placeFor(venue), venue, responsible: '', notes: String(e.notes || '').slice(0, 200), suggested: true };
    setTimes(b, s, Math.min(en, to)); b.title ||= 'Event';
    return b;
  }).filter((b) => S(b) >= from && S(b) < to && E(b) > S(b)).sort((a, b) => S(a) - S(b));
}

/** Replace earlier suggestions with `fresh`, skipping any that overlap your own events or each other. */
function addSuggested(fresh) {
  const kept = state.agenda.filter((a) => !a.suggested), out = [];
  fresh.forEach((b) => { if (![...kept, ...out].some((x) => clash(x, b))) out.push(b); });
  const skipped = fresh.length - out.length;
  if (!out.length) { toast('Everything overlaps events you already have'); return; }
  undoable(`${out.length} events added${skipped ? `, ${skipped} skipped (overlap)` : ''}`, () => {
    state.agenda.filter((a) => a.suggested).forEach(dropNote);
    state.agenda = [...kept, ...out];
  }, toast);
}

/** Suggested events that overlap your own events or an earlier suggestion (stray duplicates). Your own events are never listed. */
function overlappingSuggested() {
  const kept = state.agenda.filter((a) => !a.suggested), out = [], bad = [];
  state.agenda.filter((a) => a.suggested).sort((a, b) => S(a) - S(b) || E(a) - E(b)).forEach((b) => {
    (([...kept, ...out].some((x) => clash(x, b))) ? bad : out).push(b);
  });
  return bad;
}
function removeSuggested(list, label) {
  const ids = new Set(list.map((b) => b.id));
  undoable(label, () => { state.agenda.filter((a) => ids.has(a.id)).forEach(dropNote); state.agenda = state.agenda.filter((a) => !ids.has(a.id)); }, toast);
}

/** Events the team entered themselves are fixed: the AI plans around them (internal context, never shown as suggestions). */
function fixedNote() {
  const own = state.agenda.filter((a) => !a.suggested && a.title);
  if (!own.length) return '';
  return 'Fixed events already on the day (do not move, rename, duplicate or overlap them; plan the rest of the day around them): ' + own.map((a) => `${toTime(S(a))}-${toTime(E(a))} ${a.title}`).join('; ') + '.';
}

const AI_SYSTEM = `You plan a wedding-day timeline at Morais Vineyards. Reply with JSON only: an array of {"title","start","end","venue","notes"}. start/end are 24h "HH:MM" and a time past midnight is fine. Events must be in order, must not overlap, and must fit inside the window given. venue must be exactly one of: ${VENUES.map((v) => v[0]).join(', ')} (or ""). Notes are short. The first event starts exactly at the window start.`;

/* ---------- layout ---------- */
function range() {
  const ms = state.agenda.flatMap((a) => [S(a), E(a)]);
  const lo = Math.min(12 * 60, ...ms), hi = Math.max(23 * 60, ...ms);
  const late = hi > DAY;   // past midnight: show at least until 2am of the next day
  return { from: Math.floor(lo / 60) * 60, to: Math.min(30 * 60, Math.max(late ? 26 * 60 : 0, Math.ceil(hi / 60) * 60)) };
}
/** Side-by-side lanes for blocks that overlap in time. */
function lanes(list) {
  const sorted = list.slice().sort((a, b) => S(a) - S(b) || E(b) - E(a));
  const out = new Map();
  let cluster = [], clusterEnd = -1;
  const flush = () => { const n = Math.max(...cluster.map((c) => out.get(c.id).lane)) + 1; cluster.forEach((c) => { out.get(c.id).of = n; }); cluster = []; };
  sorted.forEach((a) => {
    const s = S(a), e = E(a);
    if (cluster.length && s >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => E(c) > s).map((c) => out.get(c.id).lane));
    let lane = 0; while (used.has(lane)) lane++;
    out.set(a.id, { lane, of: 1 });
    cluster.push(a); clusterEnd = Math.max(clusterEnd, e);
  });
  if (cluster.length) flush();
  return out;
}

function blockHTML(a, r, ln) {
  const top = (S(a) - r.from) * PX, h = Math.max(SNAP * PX, (E(a) - S(a)) * PX);
  const l = ln.get(a.id) || { lane: 0, of: 1 };
  const short = h < 34, tall = h >= 74;
  const where = a.venue ? `<a class="ab-v" href="#seating/${venueSp(a.venue)}" data-venue>${esc(a.venue)}</a>` : a.place ? `<span class="ab-v">${esc(a.place)}</span>` : '';
  const who = a.responsible ? esc(personName(a.responsible)) : '';
  return `
    <div class="ab k-${kindOf(a)}${a.id === selId ? ' sel' : ''}${short ? ' short' : ''}" data-id="${a.id}" tabindex="0" role="button"
      aria-label="${esc(a.title || 'Event')} ${fmt(a.start)} to ${fmt(a.end)}"
      style="top:${top}px;height:${h}px;left:calc(${(l.lane / l.of) * 100}% + 2px);width:calc(${100 / l.of}% - 4px)">
      <div class="ab-t">${a.title ? esc(a.title) : '<em>New event</em>'}${short ? ` <span class="ab-time">${fmt(a.start)}</span>` : ''}</div>
      ${short ? '' : `<div class="ab-m"><span class="ab-time">${fmt(a.start)}–${fmt(a.end)}</span>${where}${tall ? '' : who ? `<span class="ab-who">${who}</span>` : ''}</div>`}
      ${tall && who ? `<div class="ab-w">${who}</div>` : ''}
      ${a.suggested && !short ? '<div class="ab-s">Suggested</div>' : ''}
      <div class="ab-r" data-resize aria-hidden="true"></div>
    </div>`;
}

function panelHTML() {
  if (reviewing) {
    const bad = overlappingSuggested();
    return `
      <div class="ap" id="agReview">
        <div class="ap-head"><h2>Overlapping suggestions</h2><button type="button" class="x" data-closepanel aria-label="Close">×</button></div>
        ${bad.length ? `<ul class="ap-prev">${bad.map((b) => `<li data-pid="${b.id}"><b>${fmt(b.start)}–${fmt(b.end)}</b> ${esc(b.title || 'Event')}<button type="button" class="x" data-rmsug aria-label="Remove ${esc(b.title || 'event')}">×</button></li>`).join('')}</ul>
        <p class="ap-note">Only suggested events are listed. Your own events stay.</p>
        <div class="ap-foot"><span></span><button type="button" class="btn moss sm" data-rmall>Remove suggested duplicates</button></div>` : '<p class="ap-note">No overlaps left.</p>'}
      </div>`;
  }
  if (suggesting) {
    if (!sug.from) sug.from = toTime(ceremonyMin() - (prefs.has('firstlook') ? 20 : 0));
    const ai = aiAvailable();
    return `
      <form class="ap" id="agSuggestForm">
        <div class="ap-head"><h2>Suggest</h2><button type="button" class="x" data-closepanel aria-label="Close">×</button></div>
        <label class="ap-f"><span>What do you want?</span><textarea name="want" rows="2" placeholder="e.g. lots of dancing, dinner around 7">${esc(sug.want)}</textarea></label>
        <div class="ap-row2">
          <label class="ap-f"><span>Start</span><input type="time" name="from" value="${sug.from}" step="900"/></label>
          <label class="ap-f"><span>End</span><input type="time" name="to" value="${sug.to}" step="900"/></label>
        </div>
        ${ai ? '' : `<div class="ap-chips" role="group" aria-label="Preferences">
          ${PREFS.map(([k, l]) => `<button type="button" class="chip${prefs.has(k) ? ' on' : ''}" data-pref="${k}" aria-pressed="${prefs.has(k)}">${l}</button>`).join('')}
        </div>`}
        ${aiPrev ? `<ul class="ap-prev">${aiPrev.map((b) => `<li data-pid="${b.id}"><b>${fmt(b.start)}–${fmt(b.end)}</b> ${esc(b.title)}${b.venue ? ` <em>${esc(b.venue)}</em>` : ''}<button type="button" class="x" data-prevx aria-label="Remove ${esc(b.title)}">×</button></li>`).join('')}</ul>` : ''}
        ${thinking ? `<div class="ap-think">${heartLoaderHTML('Thinking')}</div>` : '<p class="ap-note">Replaces earlier suggestions. Your own events stay.</p>'}
        <div class="ap-foot">
          ${aiLinkHTML()}
          ${aiPrev ? '<button type="button" class="btn moss sm" data-addprev>Add all</button>' : `<button class="btn moss sm"${thinking ? ' disabled' : ''}>${ai && sug.want.trim() ? 'Ask AI' : 'Fill the day'}</button>`}
        </div>
      </form>`;
  }
  const a = state.agenda.find((x) => x.id === selId);
  if (!a) return '';
  const row = (ic, label, body, cls = '') => `<label class="pn-r ${cls}"><span class="pn-l">${ICONS[ic]}<span>${label}</span></span><span class="pn-v">${body}</span></label>`;
  return `
    <div class="ap pn" data-edit="${a.id}">
      <div class="ap-head"><input class="pn-title" data-k="title" placeholder="Name this event" aria-label="Title" value="${esc(a.title)}" autocomplete="off"/><button type="button" class="x" data-closepanel aria-label="Close" title="Close">×</button></div>
      <div class="pn-props">
        <div class="pn-r"><span class="pn-l">${ICONS.cal}<span>Date</span></span><span class="pn-v pn-static">${dayText(a.day2 ? 1 : 0, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
        <div class="pn-r"><span class="pn-l">${ICONS.clock}<span>Time</span></span><span class="pn-v pn-time"><input type="time" data-k="start" aria-label="Start" value="${esc(a.start)}" step="900"/><i>–</i><input type="time" data-k="end" aria-label="End" value="${esc(a.end)}" step="900"/></span></div>
        ${row('pin', 'Where', `<select data-k="where" aria-label="Where">
          <optgroup label="At Morais">${VENUES.map(([v]) => `<option value="v:${v}" ${v === a.venue ? 'selected' : ''}>${v}</option>`).join('')}</optgroup>
          <optgroup label="General">${PLACES.map((p) => `<option value="p:${p}" ${!a.venue && p === (PLACES.includes(a.place) ? a.place : 'Other') ? 'selected' : ''}>${p}</option>`).join('')}</optgroup>
        </select>`)}
        ${a.venue ? `<div class="pn-r pn-sub"><span class="pn-l"></span><a class="ap-link" href="#seating/${venueSp(a.venue)}">View ${esc(a.venue)} in Seating</a></div>` : ''}
        ${row('who', 'Who', `<select data-k="responsible" aria-label="Responsible"><option value="">Nobody yet</option>${state.people.map((p) => `<option value="${p.id}" ${p.id === a.responsible ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`)}
        ${row('note', 'Notes', `<textarea data-k="notes" rows="3" placeholder="Add a note" aria-label="Notes">${esc(a.notes)}</textarea>`, 'pn-top')}
      </div>
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
  const open = suggesting || reviewing || !!selId;
  const overlap = overlappingSuggested(), sig = overlap.map((b) => b.id).join(',');
  const showNote = overlap.length && !reviewing && !seen(sig);
  const firstDraw = !view.querySelector('#agCal');
  const nm = nowMin();
  view.innerHTML = `
    <div class="ag-bar">
      <div class="ag-title"><span class="ag-kicker">Agenda</span><h1>${dayText(0, { weekday: 'long', month: 'long', day: 'numeric' })}</h1></div>
      <div class="ag-tools" role="toolbar" aria-label="Agenda tools">
        <button type="button" class="ag-tb ag-jump" id="agToday" aria-label="Jump to now" title="Scroll to the current time">${ICONS.today}<span>Now</span></button>
        <button type="button" class="ag-ib" id="agAdd" aria-label="Add event" title="Add event">${ICONS.plus}</button>
        <button type="button" class="ag-tb" id="agSuggest" aria-label="Suggest an agenda" title="Suggest an agenda" aria-pressed="${suggesting}">Suggest</button>
      </div>
    </div>
    ${showNote ? `<div class="ag-note" role="status"><span>${overlap.length} overlapping suggested event${overlap.length > 1 ? 's' : ''}</span><button type="button" class="linklike" data-review>Review</button><button type="button" class="x" data-dismissnote aria-label="Dismiss" title="Dismiss">×</button></div>` : ''}
    <div class="ag-wrap${open ? ' with-panel' : ''}${firstDraw ? ' ag-first' : ''}">
      <div class="ag-cal" id="agCal">
        <div class="ag-body" style="height:${(r.to - r.from) * PX}px">
          <div class="ag-hours">${hours.map((m) => `<div class="ag-h" style="top:${(m - r.from) * PX}px"><span>${fmt(toTime(m))}${m === DAY ? ' <em>next day</em>' : ''}</span></div>`).join('')}</div>
          <div class="ag-col" id="agCol">
            ${r.to > DAY ? `<div class="ag-midnight" style="top:${(DAY - r.from) * PX}px"><span>Next day</span></div>` : ''}
            ${hours.map((m) => `<div class="ag-line" style="top:${(m - r.from) * PX}px"></div>`).join('')}
            ${state.agenda.map((a) => blockHTML(a, r, ln)).join('')}
            ${nm != null && nm >= r.from && nm <= r.to ? `<div class="ag-now" id="agNow" style="top:${(nm - r.from) * PX}px" aria-hidden="true"></div>` : ''}
            ${state.agenda.length ? '' : '<div class="ag-empty"><p>Nothing planned yet.</p><button type="button" class="ag-tb solid" data-addempty>Add the first event</button></div>'}
          </div>
        </div>
      </div>
      ${open ? `<aside class="ag-panel">${panelHTML()}</aside>` : ''}
    </div>`;
  if (firstDraw) setTimeout(() => view.querySelector('.ag-first')?.classList.remove('ag-first'), 700);
  clearInterval(nowTimer);
  nowTimer = setInterval(() => {
    const el = document.getElementById('agNow'), n = nowMin();
    if (!el) return clearInterval(nowTimer);
    if (n != null) el.style.top = (n - r.from) * PX + 'px';
  }, 30000);

  const rerender = () => renderAgenda(view);
  const cal = view.querySelector('#agCal'), col = view.querySelector('#agCol');
  // Opening the page: start an hour before the ceremony (or at the first event)
  if (keepScroll != null) cal.scrollTop = keepScroll;
  else {
    const first = Math.min(ceremonyMin() - 60, ...state.agenda.map((a) => S(a)));
    cal.scrollTop = Math.max(0, (first - r.from) * PX - 20);
  }

  const addEvent = () => {
    const last = state.agenda.slice().sort((a, b) => E(b) - E(a))[0];
    const s = last ? E(last) : ceremonyMin();
    const a = { id: uid(), title: '', place: 'Reception', venue: '', responsible: '', notes: '', suggested: false };
    setTimes(a, s, s + 30);
    state.agenda.push(a);
    selId = a.id; suggesting = false; reviewing = false;
    commit({ silent: true });
    rerender();
    view.querySelector('.ap [data-k="title"]')?.focus();
  };
  view.querySelector('#agAdd').onclick = addEvent;
  view.onkeydown = (e) => { if (e.key === 'Escape' && view.querySelector('.ag-panel')) { e.stopPropagation(); (view.querySelector('.ag-panel [data-closepanel]') || view.querySelector('#agSuggest[aria-pressed="true"]'))?.click(); } };
  view.querySelector('[data-addempty]')?.addEventListener('click', addEvent);
  view.querySelector('#agToday').onclick = () => {
    const n = nowMin(), at = n != null ? n : ceremonyMin();
    cal.scrollTo({ top: Math.max(0, (at - r.from) * PX - cal.clientHeight / 3), behavior: 'smooth' });
  };
  view.querySelector('#agSuggest').onclick = () => { suggesting = !suggesting; selId = null; reviewing = false; aiPrev = null; rerender(); };
  view.querySelector('[data-review]')?.addEventListener('click', () => { reviewing = true; suggesting = false; selId = null; rerender(); });
  view.querySelector('[data-dismissnote]')?.addEventListener('click', () => { markSeen(sig); rerender(); });

  // Double-click empty time = new event there
  col.addEventListener('dblclick', (e) => {
    if (e.target.closest('.ab')) return;
    const y = e.clientY - col.getBoundingClientRect().top;
    const s = snap(r.from + y / PX - SNAP / 2);
    const a = { id: uid(), title: '', place: 'Reception', venue: '', responsible: '', notes: '', suggested: false };
    setTimes(a, s, s + 30);
    state.agenda.push(a);
    selId = a.id; suggesting = false; reviewing = false;
    commit({ silent: true });
    rerender();
    view.querySelector('.ap [data-k="title"]')?.focus();
  });

  /* drag to move, bottom edge to resize, click to edit */
  let drag = null;
  col.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.ab');
    if (!el || e.button > 0 || e.target.closest('[data-venue]')) return;
    const a = state.agenda.find((x) => x.id === el.dataset.id);
    drag = { el, a, y0: e.clientY, s0: S(a), e0: E(a), resize: !!e.target.closest('[data-resize]'), moved: false };
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
    const t = drag.el.querySelector('.ab-time');
    if (t) t.textContent = drag.el.querySelector('.ab-m') ? `${fmt(toTime(s))}–${fmt(toTime(en))}` : fmt(toTime(s));
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) { selId = d.a.id; suggesting = false; reviewing = false; return rerender(); }
    setTimes(d.a, d.s, d.e);
    if (d.a.noteLine) { dropNote(d.a); addNote(d.a); }
    commit({ silent: true });
    rerender();
  };
  col.addEventListener('pointerup', end);
  col.addEventListener('pointercancel', end);
  col.addEventListener('keydown', (e) => {
    const el = e.target.closest('.ab');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selId = el.dataset.id; suggesting = false; reviewing = false; rerender(); }
  });

  /* side panel */
  const panel = view.querySelector('.ag-panel');
  if (!panel) return;
  panel.querySelector('[data-closepanel]').onclick = () => { selId = null; suggesting = false; reviewing = false; rerender(); };
  if (reviewing) {
    panel.querySelectorAll('[data-rmsug]').forEach((b) => b.onclick = () => { const id = b.closest('li').dataset.pid; removeSuggested(overlap.filter((x) => x.id === id), 'Suggested event removed'); });
    panel.querySelector('[data-rmall]')?.addEventListener('click', () => { removeSuggested(overlap, `${overlap.length} suggested duplicates removed`); reviewing = false; });
    return;
  }
  const form = panel.querySelector('#agSuggestForm');
  if (form) {
    wireAiLink(form, rerender);
    const read = () => { sug = { from: form.elements.from.value, to: form.elements.to.value, want: form.elements.want.value }; };
    form.querySelectorAll('input,textarea').forEach((el) => el.addEventListener('input', read));
    form.querySelectorAll('[data-pref]').forEach((b) => b.onclick = () => {
      prefs.has(b.dataset.pref) ? prefs.delete(b.dataset.pref) : prefs.add(b.dataset.pref);
      b.classList.toggle('on'); b.setAttribute('aria-pressed', String(prefs.has(b.dataset.pref)));
    });
    form.querySelectorAll('[data-prevx]').forEach((b) => b.onclick = () => { aiPrev = aiPrev.filter((x) => x.id !== b.closest('li').dataset.pid); if (!aiPrev.length) aiPrev = null; rerender(); });
    form.querySelector('[data-addprev]')?.addEventListener('click', () => { const list = aiPrev; aiPrev = null; suggesting = false; addSuggested(list); });
    form.querySelectorAll('input,textarea').forEach((el) => el.addEventListener('change', () => { if (aiPrev) { aiPrev = null; rerender(); } }));
    form.onsubmit = async (e) => {
      e.preventDefault();
      read();
      const from = toMin(sug.from);
      let to = toMin(sug.to);
      if (to <= from) to += DAY;                 // an end like 2am means the next morning
      if (to - from < 60) { toast('The event needs to run at least an hour'); return; }
      if (aiAvailable() && sug.want.trim()) {
        thinking = true; aiPrev = null; rerender();
        try {
          const data = await askGemini({ system: AI_SYSTEM, json: true, prompt: `Window: ${sug.from} to ${sug.to}. ${fixedNote()} Ceremony time on the invitation: ${toTime(ceremonyMin())}. Guests: ${state.guestTarget}. Request: ${sug.want}` });
          const list = blocksFromAi(data, from, to);
          if (!list.length) throw new Error('The AI plan did not fit the window.');
          aiPrev = list;
        } catch (err) { toast(`${err.message || 'AI failed.'} Using the basic plan.`); aiPrev = null; thinking = false; suggesting = false; return addSuggested(suggestBlocks(from, to)); }
        thinking = false; return rerender();
      }
      const own = prefs; prefs = new Set([...prefs, ...prefsFromText(sug.want)]);
      const fresh = suggestBlocks(from, to);   // may run past midnight: the day view extends
      prefs = own;
      suggesting = false;
      addSuggested(fresh);
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
      if (k === 'where') { const [t, v] = [el.value[0], el.value.slice(2)]; if (t === 'v') { a.venue = v; a.place = placeFor(v); } else { a.venue = ''; a.place = v; } }
      else if (k === 'responsible') { dropNote(a); a.responsible = el.value; addNote(a); }
      else if (k === 'start' || k === 'end') {
        const len = E(a) - S(a);
        if (k === 'start') { setTimes(a, toMin(el.value) + (a.day2 ? DAY : 0), toMin(el.value) + (a.day2 ? DAY : 0) + len); panel.querySelector('[data-k="end"]').value = a.end; }
        else a.end = el.value;   // an end at or before the start means the next morning
        if (a.noteLine) { dropNote(a); addNote(a); }
      } else {
        a[k] = el.value;
        if (k === 'title' && a.noteLine) { dropNote(a); addNote(a); }
      }
      commit({ silent: true });
      // times/place can change the grid's range or lanes → redraw; text edits update just the block
      if (k === 'start' || k === 'end' || k === 'where') rerender(); else refreshBlock();
    };
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'time' ? 'change' : 'input', apply);
  });
  panel.querySelector('[data-unsuggest]')?.addEventListener('click', () => { a.suggested = false; commit({ silent: true }); rerender(); });
  panel.querySelector('[data-delblock]').onclick = () => {
    selId = null;
    undoable(`${a.title || 'Event'} deleted`, () => { dropNote(a); state.agenda = state.agenda.filter((x) => x.id !== a.id); }, toast);
  };
}
