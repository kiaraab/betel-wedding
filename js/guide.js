// First-visit welcome + a small "?" per page that runs a short guided tour.
// "Seen" is remembered per device (localStorage); the tour can always be replayed from the "?".
import { trapFocus } from './util.js';
const SEEN_WELCOME = 'bc-welcome-seen';
const SEEN_UPDATE = 'bc-update-guide-1125'; // the "what got easier" guide, shown once per device
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
    ['#addPlus', 'Tap + to add one person, or paste a whole list (or a photo of one).'],
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
  else if (!read(SEEN_UPDATE) || /[?&]tour=update/.test(location.search)) setTimeout(startUpdateTour, 1200); // add ?tour=update to the address to replay it
}

/** Call after each page render: the "?" breathes gently until that page's tour has been seen. */
export function refreshGuide() {
  if (!btn) return;
  // the "?" lives at the right end of the page title row (not floating over the content)
  const host = document.querySelector('.vm-titlerow') || document.querySelector('.page-head') || document.querySelector('.banner') || document.querySelector('.ag-bar');
  if (host) { if (getComputedStyle(host).position === 'static') host.style.position = 'relative'; host.append(btn); btn.classList.add('inline'); }
  else { btn.classList.remove('inline'); document.body.append(btn); }
  btn.classList.toggle('new', !read(seenKey(routeNow())));
  if (tour && !tour.multi) endTour();
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

/** One-time "what got easier" tour: the same moving ring + tip as the page tours, but it walks across pages to the real features. */
const UPDATE_STEPS = [
  { route: 'overview', sel: '.nextup', text: 'Next up: the one to three things worth doing now. Tap one to go there.' },
  { route: 'overview', sel: '.dotstat', text: 'Your guests in one picture. The two hearts are you. Filled dots are seated, rings are added but not seated, faint ones are still to add.' },
  { route: 'overview', sel: '#navToggle', text: 'Menu: every page is one tap away.' },
  { route: 'guests', sel: '#addPlus', text: 'Tap + to add one person, or paste a whole list. Guests now fit about 16 to a screen, so scrolling is quick.' },
  { route: 'seating/reception', sel: '.view-fixed', text: '3D and Plan sit in the same spot on every space.' },
  { route: 'seating/reception', sel: '#evening', text: 'The eye takes a candlelit tour of the evening.' },
  { route: 'seating/reception', sel: '.vs-tabs [data-vs="look"]', text: 'Look: pick table linens, candles, ceiling and more. The 3D stays pinned above while you pick.' },
  { route: 'seating/ceremony', sel: '.look-pick .lk-head', text: 'Each space has its own looks. Ceremony: canopy, aisle, backdrop and arch flowers.' },
  { route: 'overview', sel: '.foot-acts', text: 'The bell shows what is new. The people icon is where you sign in, send feedback and see history.' },
];
const waitFor = (sel, ms = 3500) => new Promise((res) => {
  const t0 = performance.now();
  const look = () => { const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length); if (el) res(el); else if (performance.now() - t0 > ms) res(null); else setTimeout(look, 120); };
  look();
});
function startUpdateTour() {
  if (tour || document.querySelector('.welcome-scrim')) return;
  write(SEEN_UPDATE); // once per device, even if she skips
  const ring = document.createElement('div'); ring.className = 'tour-ring';
  const tip = document.createElement('div'); tip.className = 'tour-tip'; tip.setAttribute('role', 'dialog'); tip.setAttribute('aria-live', 'polite');
  const catcher = document.createElement('div'); catcher.className = 'tour-catch';
  document.body.append(catcher, ring, tip);
  tour = { steps: UPDATE_STEPS.map((s) => ({ ...s, el: null })), i: 0, ring, tip, catcher, route: 'update', multi: true };
  catcher.onclick = () => endTour(false);
  addEventListener('resize', place); addEventListener('scroll', place, true); addEventListener('keydown', onKey);
  go(0);
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

async function go(i) {
  if (!tour) return;
  if (i >= tour.steps.length) return endTour(true);
  const t = tour, idx = Math.max(0, i);
  const step = t.steps[idx];
  if (t.multi) {
    t.tip.classList.add('out'); t.ring.classList.add('out');
    const here = location.hash.replace(/^#/, '') || 'overview';
    if (step.route && here !== step.route) { location.hash = '#' + step.route; await new Promise((r) => setTimeout(r, 450)); }
    step.el = await waitFor(step.sel);
    if (tour !== t) return;
    t.tip.classList.remove('out'); t.ring.classList.remove('out');
    if (!step.el) { t.steps.splice(idx, 1); return go(idx); } // not on screen here (e.g. no menu button on desktop): skip
  }
  tour.i = idx;
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
