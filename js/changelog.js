// "What's new": the bell in the footer. Each time something changes for Betel & the team, add an entry at the TOP of ENTRIES.
// Write it for them: short, plain, what they can now do. { id (unique, never reuse), date (YYYY-MM-DD), title, items: [..] }
// The bell shows a dot for entries a person has not opened yet (remembered per device).
import { esc, trapFocus, toast } from './util.js';

export const ENTRIES = [
  { id: '2026-11-23-phone-plan', date: '2026-11-23', title: 'Easier on your phone',
    items: ['The Agenda now scrolls with the page. Tap an event to edit it, or press and hold to move it.', 'Ceremony: a new Chairs per row list lets you add or remove chairs from each row.'] },
  { id: '2026-11-23-phone-guests', date: '2026-11-23', title: 'Guest list on your phone',
    items: ['The guest list now has column names.', 'Choosing columns works on your phone: Table, Household, Plus-one and Notes show under each name.', 'The B and C in the logo are centered in their hearts.'] },
  { id: '2026-11-23-look', date: '2026-11-23', title: 'A softer guest list',
    items: ['The guest list now has a lighter, thinner look.', 'Tap the bell any time to see what’s new.'] },
  { id: '2026-11-23-seats', date: '2026-11-23', title: 'Seats and guests',
    items: ['The dot on a guest’s ⋮ now means no seat yet. Addresses are optional.', 'The save-as-picture button on the seating plan is easier to see.'] },
  { id: '2026-11-22-ai', date: '2026-11-22', title: 'Smarter and faster',
    items: ['Reading a guest list with AI is faster and no longer gets stuck.', 'Anything you add before signing in is kept when you sign in.', 'The B C logo has a bigger C.'] },
];

const KEY = 'bc-seen-updates';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (ids) => { try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* storage blocked: the dot shows again next time */ } };
const unread = () => { const seen = new Set(read()); return ENTRIES.filter((e) => !seen.has(e.id)); };
const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const asText = (e) => `${e.title} (${fmt(e.date)})\n${e.items.map((i) => `• ${i}`).join('\n')}`;

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
    pop.innerHTML = `<h3>What’s new</h3>${ENTRIES.map((e) => `
      <section class="bell-e${fresh.has(e.id) ? ' new' : ''}"><div class="bell-h"><b>${esc(e.title)}</b><span>${esc(fmt(e.date))}</span></div>
        <ul>${e.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></section>`).join('')}
      <div class="bell-f"><button type="button" class="linklike" data-copy>Copy latest to send</button></div>`;
    document.body.append(pop);
    btn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('live-open'); // the help button rides above the panel (styles.css)
    const lift = () => document.body.style.setProperty('--live-up', pop.offsetHeight + 6 + 'px');
    ro = typeof ResizeObserver === 'function' ? new ResizeObserver(lift) : null; ro?.observe(pop); lift();
    release = trapFocus(pop);
    pop.tabIndex = -1; pop.focus({ preventScroll: true });
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    pop.querySelector('[data-copy]').onclick = async () => {
      try { await navigator.clipboard.writeText(asText(ENTRIES[0])); toast('Copied. Paste it into a text.'); } catch { toast('Could not copy'); }
    };
    document.addEventListener('pointerdown', outside, true);
    write([...new Set([...read(), ...ENTRIES.map((e) => e.id)])]); paint();
  });
}
