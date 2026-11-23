// "What's new": the bell in the footer. Keep it SHORT. Only add an entry when the owner asks (she says Betel and the team don't want detail).
// Write it for them: short, plain, what they can now do. { id (unique, never reuse), date (YYYY-MM-DD), title, items: [..] }
// The bell shows a dot for entries a person has not opened yet (remembered per device).
import { esc, trapFocus } from './util.js';

export const ENTRIES = [
  { id: 'u1124b', date: '2026-11-23', title: 'Easier to use', items: ['Overview now shows what to do next.', 'A check shows when changes save, and Look opens one group at a time.'] },
  { id: 'u1124', date: '2026-11-23', title: 'New', items: ['3D has a new evening look.', 'Pick your decor in Look: canopy, aisle, tables, candles and more.'] },
  { id: 'u1123', date: '2026-11-23', title: 'New', items: ['Seating: 3D view for Ceremony, Hangout and Tasting.'] },
  { id: 'bell', date: '2026-11-23', title: 'What’s new', items: ['Tap the bell any time to see updates.'] },
];

const KEY = 'bc-seen-updates';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (ids) => { try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* storage blocked: the dot shows again next time */ } };
const DKEY = 'bc-dismissed-updates'; // entries this person x-ed out (remembered per browser)
const readD = () => { try { return JSON.parse(localStorage.getItem(DKEY) || '[]'); } catch { return []; } };
const writeD = (ids) => { try { localStorage.setItem(DKEY, JSON.stringify(ids)); } catch { /* storage blocked: they come back next visit */ } };
const shown = () => { const d = new Set(readD()); return ENTRIES.filter((e) => !d.has(e.id)); };
const unread = () => { const seen = new Set(read()); return shown().filter((e) => !seen.has(e.id)); };
const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function mountBell(btn) {
  if (!btn) return;
  const dot = btn.querySelector('.bell-dot');
  const paint = () => { const n = unread().length; if (dot) dot.hidden = !n; btn.setAttribute('aria-label', n ? `What’s new, ${n} new` : 'What’s new'); btn.title = 'What’s new'; };
  paint();
  let pop = null, release = null, ro = null;
  const close = (focusBack = true) => {
    if (!pop) return;
    ro?.disconnect(); document.body.classList.remove('live-open');
    release?.(); pop.remove(); pop = null; btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (focusBack) btn.focus({ preventScroll: true });
  };
  const outside = (e) => { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(false); };
  btn.addEventListener('click', () => {
    if (pop) return close();
    const fresh = new Set(unread().map((e) => e.id));
    pop = document.createElement('div');
    pop.className = 'live-pop bell-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'What’s new');
    const list = shown();
    pop.innerHTML = `<h3>What’s new</h3>${list.length ? list.map((e) => `
      <section class="bell-e${fresh.has(e.id) ? ' new' : ''}" data-id="${esc(e.id)}"><div class="bell-h"><b>${esc(e.title)}</b><span>${esc(fmt(e.date))}</span><button type="button" class="bell-x" data-dismiss="${esc(e.id)}" aria-label="Dismiss ${esc(e.title)}" title="Dismiss">×</button></div>
        <ul>${e.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></section>`).join('') : '<p class="muted small" style="margin:6px 0 10px">Nothing new</p>'}`;
    document.body.append(pop);
    btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('live-open'); // the help button rides above the panel (styles.css)
    const lift = () => document.body.style.setProperty('--live-up', pop.offsetHeight + 6 + 'px');
    ro = typeof ResizeObserver === 'function' ? new ResizeObserver(lift) : null; ro?.observe(pop); lift();
    release = trapFocus(pop);
    pop.tabIndex = -1; pop.focus({ preventScroll: true });
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    document.addEventListener('pointerdown', outside, true);
    pop.querySelectorAll('[data-dismiss]').forEach((x) => x.onclick = () => {
      writeD([...new Set([...readD(), x.dataset.dismiss])]);
      x.closest('.bell-e').remove(); paint();
      if (!pop.querySelector('.bell-e')) pop.querySelector('h3').insertAdjacentHTML('afterend', '<p class="muted small" style="margin:6px 0 10px">Nothing new</p>');
    });
    write([...new Set([...read(), ...ENTRIES.map((e) => e.id)])]); paint();
  });
}
