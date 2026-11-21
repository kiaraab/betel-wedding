// First-visit welcome + a small "?" per page that runs a short guided tour.
// "Seen" is remembered per device (localStorage); the tour can always be replayed from the "?".
const SEEN_WELCOME = 'bc-welcome-seen';
const seenKey = (r) => `bc-tour-${r}`;
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k) => { try { localStorage.setItem(k, '1'); } catch { /* storage blocked: shows again next time */ } };

/** Steps point at real elements; any that aren't on screen right now are skipped. */
const TOURS = {
  overview: [
    ['.hero .hero-count', 'Days to go.'],
    ['.stats', 'Tap a number to open it.'],
    ['.mtl-add', 'Add a date, like “Mar 3”.'],
  ],
  team: [
    ['#teamFilter', 'Show by status or role.'],
    ['.sdots', 'Tap a dot to set status.'],
    ['.tc-name', 'Tap a name for details.'],
    ['#addPerson', 'Add someone.'],
  ],
  guests: [
    ['.gf-btn', 'Filter.'],
    ['.g-name, [data-person]', 'Tap a name for details.'],
    ['.viewseg', 'See connections.'],
  ],
  agenda: [
    ['#agSuggest', 'Start from a typical day.'],
    ['.ab', 'Drag to move. Pull the bottom edge to resize. Tap to edit.'],
    ['#agAdd', 'Add an event.'],
  ],
  seating: [
    ['.spaces', 'Ceremony, Reception, Hangout spot.'],
    ['.plan-tools', 'Add tables and areas.'],
    ['#planHost', 'Drag to move. Tap for details.'],
    ['.viewseg', 'See it in 3D.'],
  ],
};

let routeNow = () => 'overview';
let btn = null, tour = null;

export function initGuide(getRoute) {
  routeNow = getRoute;
  btn = document.createElement('button');
  btn.className = 'guide-q';
  btn.setAttribute('aria-label', 'Quick tour of this page');
  btn.textContent = '?';
  btn.onclick = () => startTour(routeNow());
  document.body.append(btn);
  refreshGuide();
  if (!read(SEEN_WELCOME)) setTimeout(welcome, 500);
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
      <p class="welcome-p">Made with love by Kiara. A little something to make the lead-up to your day easier: your flow and your wedding plan, in one place. Text me if you need help.</p>
      <div class="welcome-b"><button class="btn line sm" data-w="tour">Quick tour</button><button class="btn moss sm" data-w="go">Let’s go</button></div>
    </section>`;
  document.body.append(scrim);
  const close = (then) => {
    write(SEEN_WELCOME);
    scrim.classList.add('out');
    setTimeout(() => { scrim.remove(); then?.(); }, 260);
  };
  scrim.querySelector('[data-w="go"]').onclick = () => close();
  scrim.querySelector('[data-w="tour"]').onclick = () => close(() => startTour(routeNow()));
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  scrim.querySelector('[data-w="go"]').focus();
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
