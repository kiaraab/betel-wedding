// First-visit welcome + a small "?" per page that runs a short guided tour.
// "Seen" is remembered per device (localStorage); the tour can always be replayed from the "?".
import { trapFocus } from './util.js';
const SEEN_WELCOME = 'bc-welcome-seen';
const SEEN_UPDATE = 'bc-update-guide-1123'; // the "what got easier" guide, shown once per device
const seenKey = (r) => `bc-tour-${r}`;
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k) => { try { localStorage.setItem(k, '1'); } catch { /* storage blocked: shows again next time */ } };

/** Steps point at real elements; any that aren't on screen right now are skipped. */
const TOURS = {
  overview: [
    ['.banner-date', 'Your countdown to June 17.'],
    ['.stats', 'Tap a number to jump to that page.'],
    ['.mtl-add', 'Add a milestone: type a date like “Mar 3”, then a name.'],
    ['.glance', 'Everyone’s tasks at a glance.'],
    ['#liveBtn', 'Sign in here so your changes are saved and shared with everyone.'],
  ],
  team: [
    ['#tFilter', 'Filter by status. The number is how many.'],
    ['.tcard .stbtn', 'Tap a status to change it: not started, in progress, waiting on bride, done.'],
    ['.tcard .tc-grip', 'Drag a card to rearrange. Or use Alt and the arrow keys.'],
    ['[data-menu]', 'Change a card’s colour or position.'],
    ['#addPerson', 'Add someone.'],
  ],
  guests: [
    ['#gForm', 'Type a name and press Add. Pick a side once you start typing.'],
    ['#pasteBtn', 'Paste a whole list, or a photo of one.'],
    ['.gf-btn', 'Filter the list.'],
    ['.gcols-btn', 'Choose which columns to show. Drag a column’s edge to resize it.'],
    ['.addr-btn', 'Tap ⋮ for details. A dot on it means no seat yet.'],
    ['.viewseg', 'Connections: link people who should sit together.'],
    ['#csv', 'Download the list.'],
  ],
  agenda: [
    ['#agSuggest', 'Start from a typical wedding day, or describe yours.'],
    ['.ab', 'Drag to move. Pull the bottom edge to resize. Tap to edit.'],
    ['#agAdd', 'Add an event.'],
    ['#agToday', 'Jump to the current time.'],
  ],
  seating: [
    ['#vmTitle', 'Tap Morais Vineyards to show the areas you can plan seats in.'],
    ['.vm-label.edit', 'Tap an area to see its photos. The pencil ones have seats you can edit.'],
    ['.vm-viewicons', 'Switch between the aerial photo and a satellite map.'],
    ['#vmAll', 'Every venue photo, mixed together. Filter by place.'],
    ['.spaces', 'Switch between Reception, Ceremony, Hangout spot and Tasting room.'],
    ['.vm-crumb', 'Back to the map.'],
    ['.viewseg', 'Switch between the 3D view and the floor plan.'],
    ['.vs-tabs', 'Layout, seat guests, and layout ideas.'],
    ['#planHost', 'Drag tables to move them. Tap one for details.'],
    ['#sugBtn', 'Suggest a layout that fits your guest count.'],
    ['.venue-strip', 'Photos of this space. Tap one to see it big.'],
  ],
};

let routeNow = () => 'overview';
let btn = null, tour = null;

export function initGuide(getRoute) {
  routeNow = getRoute;
  btn = document.createElement('button');
  btn.className = 'guide-q';
  btn.setAttribute('aria-label', 'Quick tour of this page');
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M9.2 9.3a2.9 2.9 0 1 1 4.4 2.5c-.9.6-1.6 1.1-1.6 2.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.05" fill="currentColor"/></svg>';
  btn.onclick = () => startTour(routeNow());
  document.body.append(btn);
  refreshGuide();
  if (!read(SEEN_WELCOME)) setTimeout(welcome, 500);
  else if (!read(SEEN_UPDATE)) setTimeout(updateGuide, 900);
}

/** Call after each page render: the "?" breathes gently until that page's tour has been seen. */
export function refreshGuide() {
  if (!btn) return;
  btn.classList.toggle('new', !read(seenKey(routeNow())));
  if (tour) endTour();
}

function welcome() {
  const scrim = document.createElement('div');
  scrim.className = 'welcome-scrim';
  scrim.innerHTML = `
    <section class="welcome" role="dialog" aria-modal="true" aria-labelledby="welcomeT">
      <p class="welcome-k" id="welcomeT">Welcome</p>
      <p class="welcome-p">Made with love by Kiara. A little something to make the lead-up to your day easier: your flow and your wedding plan, in one place. Sign in with the people icon at the bottom right so your changes are saved and shared. Text me if you need help.</p>
      <div class="welcome-b"><button class="btn line sm" data-w="tour">Quick tour</button><button class="btn moss sm" data-w="go">Let’s go</button></div>
    </section>`;
  document.body.append(scrim);
  const release = trapFocus(scrim.querySelector('.welcome'));
  const close = (then) => {
    write(SEEN_WELCOME);
    release();
    scrim.classList.add('out');
    setTimeout(() => { scrim.remove(); then?.(); }, 260);
  };
  scrim.querySelector('[data-w="go"]').onclick = () => close();
  scrim.querySelector('[data-w="tour"]').onclick = () => close(() => startTour(routeNow()));
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  scrim.querySelector('[data-w="go"]').focus();
}

/** One-time "what got easier" guide: one thing per step, skippable any time (built for an ADHD brain: no wall of text). */
const UPDATE_STEPS = [
  ['Next up', 'The Overview now starts with the one to three things worth doing next. Tap one to go there.', '#overview'],
  ['It saves. You can undo.', 'A small check in the footer shows when your changes are saved. Changed your mind? Tap Undo on the message.', null],
  ['Pick your look', 'Seating, then Reception, then Look. Choose table linens, candles, ceiling and more. The 3D view changes as you pick, and each space has its own looks.', '#seating/reception'],
  ['One switch for 3D and Plan', 'On every space, 3D and Plan sit first in the toolbar. Same place, same switch.', '#seating/ceremony'],
  ['Bell and people icon', 'The bell shows what is new. The people icon is where you sign in and send feedback.', null],
];
function updateGuide() {
  if (document.querySelector('.welcome-scrim')) return;
  let i = 0;
  const scrim = document.createElement('div');
  scrim.className = 'welcome-scrim';
  scrim.innerHTML = '<section class="welcome ug" role="dialog" aria-modal="true" aria-labelledby="ugT"><p class="welcome-k" id="ugT"></p><p class="welcome-p ug-p"></p><div class="ug-dots" aria-hidden="true"></div><div class="welcome-b"><button class="btn line sm" data-u="skip">Skip</button><button class="btn line sm" data-u="go" hidden></button><button class="btn moss sm" data-u="next"></button></div></section>';
  document.body.append(scrim);
  const dlg = scrim.querySelector('.welcome'), release = trapFocus(dlg);
  const $ = (q) => scrim.querySelector(q);
  const close = () => { write(SEEN_UPDATE); release(); scrim.classList.add('out'); setTimeout(() => scrim.remove(), 260); };
  const draw = () => {
    const [t, p, go] = UPDATE_STEPS[i];
    $('#ugT').textContent = `${i + 1} of ${UPDATE_STEPS.length} · ${t}`;
    $('.ug-p').textContent = p;
    $('.ug-dots').innerHTML = UPDATE_STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    const g = $('[data-u="go"]'); g.hidden = !go; g.textContent = 'Show me'; g.dataset.to = go || '';
    $('[data-u="next"]').textContent = i === UPDATE_STEPS.length - 1 ? 'Done' : 'Next';
    $('[data-u="skip"]').hidden = i === UPDATE_STEPS.length - 1;
  };
  $('[data-u="next"]').onclick = () => { if (i >= UPDATE_STEPS.length - 1) close(); else { i++; draw(); } };
  $('[data-u="skip"]').onclick = close;
  $('[data-u="go"]').onclick = (e) => { const to = e.currentTarget.dataset.to; close(); if (to) location.hash = to; };
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  draw();
  $('[data-u="next"]').focus();
}

export function startTour(route) {
  endTour();
  const steps = (TOURS[route] || []).map(([sel, text]) => ({ el: [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length), text })).filter((s) => s.el);
  if (!steps.length) return;
  const ring = document.createElement('div');
  ring.className = 'tour-ring';
  const tip = document.createElement('div');
  tip.className = 'tour-tip';
  tip.setAttribute('role', 'dialog');
  tip.setAttribute('aria-live', 'polite');
  const catcher = document.createElement('div');
  catcher.className = 'tour-catch'; // swallows clicks on the page while touring
  document.body.append(catcher, ring, tip);
  tour = { steps, i: 0, ring, tip, catcher, route };
  catcher.onclick = () => endTour(true);
  addEventListener('resize', place);
  addEventListener('scroll', place, true);
  addEventListener('keydown', onKey);
  go(0);
}

function onKey(e) {
  if (!tour) return;
  if (e.key === 'Escape') endTour(true);
  else if (e.key === 'ArrowRight' || e.key === 'Enter') go(tour.i + 1);
  else if (e.key === 'ArrowLeft') go(tour.i - 1);
}

function go(i) {
  if (!tour) return;
  if (i >= tour.steps.length) return endTour(true);
  tour.i = Math.max(0, i);
  const { el, text } = tour.steps[tour.i];
  const n = tour.steps.length;
  tour.tip.innerHTML = `
    <p>${text}</p>
    <div class="tt-foot">
      <span class="tt-dots">${tour.steps.map((_, k) => `<i class="${k === tour.i ? 'on' : ''}"></i>`).join('')}</span>
      ${tour.i ? '<button class="tt-back" aria-label="Back">‹</button>' : ''}
      <button class="tt-next">${tour.i === n - 1 ? 'Done' : 'Next'}</button>
    </div>`;
  tour.tip.querySelector('.tt-next').onclick = () => tour && go(tour.i + 1);
  tour.tip.querySelector('.tt-back')?.addEventListener('click', () => tour && go(tour.i - 1));
  tour.tip.classList.remove('in'); void tour.tip.offsetWidth; tour.tip.classList.add('in');
  const r = el.getBoundingClientRect();
  if (r.top < 80 || r.bottom > innerHeight - 140) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(place, 380); }
  place();
  tour.tip.querySelector('.tt-next').focus({ preventScroll: true });
}

function place() {
  if (!tour) return;
  const { el } = tour.steps[tour.i];
  const r = el.getBoundingClientRect(), pad = 6;
  Object.assign(tour.ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
  const tw = tour.tip.offsetWidth, th = tour.tip.offsetHeight, gap = 12;
  const below = r.bottom + pad + gap + th < innerHeight - 8;
  const top = below ? r.bottom + pad + gap : Math.max(8, r.top - pad - gap - th);
  const left = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), innerWidth - tw - 8);
  Object.assign(tour.tip.style, { left: left + 'px', top: top + 'px' });
  tour.tip.dataset.side = below ? 'below' : 'above';
}

function endTour(markSeen) {
  if (!tour) return;
  const t = tour; tour = null;
  if (markSeen) { write(seenKey(t.route)); btn?.classList.remove('new'); }
  removeEventListener('resize', place);
  removeEventListener('scroll', place, true);
  removeEventListener('keydown', onKey);
  t.ring.classList.add('out'); t.tip.classList.add('out');
  t.catcher.remove();
  setTimeout(() => { t.ring.remove(); t.tip.remove(); }, 220);
}
