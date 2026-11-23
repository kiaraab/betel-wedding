export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
/** Small message at the bottom. Pass { undo } to show an Undo button (kept up a little longer). */
export function toast(msg, { undo } = {}) {
  const el = document.getElementById('toast');
  const bad = /could not|too large|too big|failed|did not work|error|full/i.test(String(msg));
  el.setAttribute('role', bad ? 'alert' : 'status'); // errors announce right away, the rest politely
  el.setAttribute('aria-atomic', 'true');
  el.innerHTML = '';
  el.append(msg);
  if (undo) {
    const b = document.createElement('button');
    b.textContent = 'Undo';
    b.onclick = () => { el.classList.remove('show'); undo(); };
    el.append(b);
  }
  el.classList.toggle('has-action', !!undo);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 6000 : bad ? 7000 : 3600);
}

export function daysUntil(iso) {
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}

export const fmtDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Friendly in-page confirm (glass modal). Resolves true on Confirm, false on Cancel / Esc / click outside. */
export function confirmDialog({ title = 'Are you sure?', body = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const scrim = document.createElement('div');
    scrim.className = 'cd-scrim';
    scrim.innerHTML = `<section class="cd" role="alertdialog" aria-modal="true" aria-labelledby="cdT" ${body ? 'aria-describedby="cdB"' : ''}>
      <h2 id="cdT">${esc(title)}</h2>${body ? `<p id="cdB">${esc(body)}</p>` : ''}
      <div class="cd-acts"><button type="button" class="cd-no">${esc(cancelLabel)}</button><button type="button" class="cd-yes">${esc(confirmLabel)}</button></div>
    </section>`;
    document.body.append(scrim);
    requestAnimationFrame(() => scrim.classList.add('in'));
    const yes = scrim.querySelector('.cd-yes'), no = scrim.querySelector('.cd-no');
    const done = (v) => {
      removeEventListener('keydown', onKey, true);
      scrim.classList.remove('in');
      setTimeout(() => scrim.remove(), 160);
      restoreFocus(prev);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); done(false); }
      else if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === yes ? no : yes).focus(); }
    };
    addEventListener('keydown', onKey, true);
    yes.onclick = () => done(true);
    no.onclick = () => done(false);
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) done(false); });
    no.focus(); // the safe choice has focus first, so a stray Enter never confirms a deletion
  });
}

/** In-page text prompt (same glass dialog as confirmDialog). Resolves the typed value, or '' on Cancel / Esc / click outside. */
export function promptDialog({ title = '', label = '', type = 'text', confirmLabel = 'Continue', cancelLabel = 'Cancel', value = '' } = {}) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const scrim = document.createElement('div');
    scrim.className = 'cd-scrim';
    scrim.innerHTML = `<form class="cd" role="dialog" aria-modal="true" aria-labelledby="pdT">
      <h2 id="pdT">${esc(title)}</h2>
      <label class="cd-field"><span>${esc(label)}</span><input class="input" type="${esc(type)}" value="${esc(value)}" required autocomplete="${type === 'email' ? 'email' : 'off'}"/></label>
      <div class="cd-acts"><button type="button" class="cd-no">${esc(cancelLabel)}</button><button type="submit" class="cd-yes">${esc(confirmLabel)}</button></div>
    </form>`;
    document.body.append(scrim);
    requestAnimationFrame(() => scrim.classList.add('in'));
    const form = scrim.querySelector('form'), input = scrim.querySelector('input'), no = scrim.querySelector('.cd-no'), yes = scrim.querySelector('.cd-yes');
    const done = (v) => {
      removeEventListener('keydown', onKey, true);
      scrim.classList.remove('in');
      setTimeout(() => scrim.remove(), 160);
      restoreFocus(prev);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); done(''); }
      else if (e.key === 'Tab') {
        const f = [input, no, yes];
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    };
    addEventListener('keydown', onKey, true);
    form.onsubmit = (e) => { e.preventDefault(); if (input.value.trim()) done(input.value.trim()); };
    no.onclick = () => done('');
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) done(''); });
    input.focus();
  });
}

/** Put focus back where it was (or on the footer people button when that element is gone). */
export function restoreFocus(prev) {
  const t = prev && prev.isConnected && prev !== document.body ? prev : document.getElementById('liveBtn');
  t?.focus?.({ preventScroll: true });
}

/** A selector that finds "the same" control again after a re-render (first data-* attribute, else the id). */
const sameAs = (el) => {
  const a = [...el.attributes].find((x) => x.name.startsWith('data-'));
  if (a) return `[role="tab"][${a.name}="${String(a.value).replace(/["\\]/g, '\\$&')}"]`;
  return el.id ? `#${CSS.escape(el.id)}` : null;
};

/** ARIA tabs (APG): one tab stop per tablist (roving tabindex), Left/Right (Up/Down when vertical), Home/End.
 *  Automatic activation (the tab is clicked as focus moves), except tablists that load something heavy
 *  (`.spaces`, the 3D/plan `.view-pill`): there arrows only move focus and Enter/Space activates. Call once. */
export function initTablists() {
  const sync = () => {
    for (const list of document.querySelectorAll('[role="tablist"]')) {
      const tabs = [...list.querySelectorAll('[role="tab"]')];
      if (!tabs.length) continue;
      const sel = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
      const cur = tabs.includes(document.activeElement) ? document.activeElement : sel;
      for (const t of tabs) t.tabIndex = t === cur ? 0 : -1;
    }
  };
  let queued = 0;
  new MutationObserver(() => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; sync(); }); })
    .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected'] });
  sync();
  document.addEventListener('keydown', (e) => {
    const tab = e.target.closest?.('[role="tab"]');
    const list = tab?.closest('[role="tablist"]');
    if (!list || e.altKey || e.ctrlKey || e.metaKey) return;
    const tabs = [...list.querySelectorAll('[role="tab"]')].filter((t) => !t.disabled && t.getClientRects().length);
    const vertical = list.getAttribute('aria-orientation') === 'vertical';
    const step = { ArrowRight: vertical ? 0 : 1, ArrowLeft: vertical ? 0 : -1, ArrowDown: vertical ? 1 : 0, ArrowUp: vertical ? -1 : 0 }[e.key];
    const i = tabs.indexOf(tab);
    const to = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : step ? tabs[(i + step + tabs.length) % tabs.length] : null;
    if (!to) return;
    e.preventDefault();
    for (const t of tabs) t.tabIndex = t === to ? 0 : -1;
    to.focus();
    if (list.matches('.spaces, .view-pill')) return; // manual activation
    const key = sameAs(to);
    to.click();
    // the click may re-render the tablist: put focus back on the same tab in the new markup
    requestAnimationFrame(() => { if (!to.isConnected && key) document.querySelector(key)?.focus(); });
  });
}

/** Modal focus handling: Tab stays inside `box`, focus returns to the opener on release. */
export function trapFocus(box) {
  const prev = document.activeElement;
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const f = [...box.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && !x.hidden && x.getClientRects().length);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  return (restore = true) => { document.removeEventListener('keydown', onKey, true); if (restore) restoreFocus(prev); };
}

/** A small wine pill / underline that slides to the active item of segmented controls and tab lists.
 *  Purely visual: the buttons keep their own state; without this the selected button paints its own fill. */
const SLIDE = '.viewseg, .vs-units, .pp-seg, .vs-tabs, .ref-tabs';
const ACTIVE = '.on, [aria-selected="true"], [aria-pressed="true"], [aria-checked="true"]';
export function initSlideInk() {
  let raf = 0;
  const sync = () => {
    raf = 0;
    document.querySelectorAll(SLIDE).forEach((box) => {
      const on = [...box.children].find((b) => b.tagName === 'BUTTON' && b.matches(ACTIVE));
      let ink = box.querySelector(':scope > .seg-ink');
      if (!on || !on.offsetWidth) { if (ink) { ink.remove(); box.classList.remove('has-ink'); } return; }
      const fresh = !ink;
      if (fresh) {
        ink = document.createElement('i');
        ink.className = 'seg-ink still';
        ink.setAttribute('aria-hidden', 'true');
        box.prepend(ink);
        box.classList.add('has-ink');
        if (box.matches('.vs-tabs, .ref-tabs')) ink.classList.add('line');
      }
      const line = ink.classList.contains('line');
      ink.style.setProperty('--ix', on.offsetLeft + 'px');
      ink.style.setProperty('--iw', on.offsetWidth + 'px');
      ink.style.setProperty('--iy', (line ? on.offsetTop + on.offsetHeight - 2 : on.offsetTop) + 'px');
      ink.style.setProperty('--ih', (line ? 2 : on.offsetHeight) + 'px');
      if (fresh) requestAnimationFrame(() => requestAnimationFrame(() => ink.classList.remove('still')));
    });
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(sync); };
  new MutationObserver(queue).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-pressed', 'aria-checked', 'hidden'] });
  addEventListener('resize', queue);
  document.fonts?.ready.then(queue);
  queue();
}

/** Cute loader: only the outline of a pixel heart, dots lighting up one after another around the border. el.innerHTML = heartLoaderHTML('Opening the venue…'). */
export function heartLoaderHTML(label = '', { sm = false } = {}) {
  const S = 3.6, R = 8, inside = (gx, gy) => { const x = gx / 7.4, y = -gy / 7.4 + 0.12; return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0; };
  const edge = [];
  for (let gy = -R; gy <= R; gy++) for (let gx = -R - 1; gx <= R + 1; gx++) {
    if (!inside(gx, gy)) continue;
    if (!inside(gx - 1, gy) || !inside(gx + 1, gy) || !inside(gx, gy - 1) || !inside(gx, gy + 1)) edge.push([gx, gy]);
  }
  // walk around the border clockwise from the top notch
  edge.sort((a, b) => ((Math.atan2(a[0], -(a[1] - 0.6)) + 6.2832) % 6.2832) - ((Math.atan2(b[0], -(b[1] - 0.6)) + 6.2832) % 6.2832));
  const W = (2 * R + 3) * S, H = (2 * R + 1) * S, n = edge.length, T = 2.2;
  const px = edge.map(([gx, gy], i) => `<rect class="hl-dot" x="${((gx + R + 1.5) * S - S * 0.34).toFixed(2)}" y="${((gy + R + 0.5) * S - S * 0.34).toFixed(2)}" width="${(S * 0.68).toFixed(2)}" height="${(S * 0.68).toFixed(2)}" style="animation-delay:${(-(i / n) * T).toFixed(3)}s;animation-duration:${T}s"/>`).join('');
  return `<div class="heart-loader${sm ? ' sm' : ''}" role="status" aria-live="polite"><svg viewBox="0 0 ${W} ${H}" width="${W * 1.6}" height="${H * 1.6}" aria-hidden="true">${px}</svg>${label ? `<span class="hl-label">${label}</span>` : ''}</div>`;
}

/* ---------- bubbly selects: a native <select data-bub> keeps the value; a button + floating glass menu is what you see ---------- */
const BS_CHEV = '<svg class="bs-chev" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M3 5.2l4 3.8 4-3.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const BS_CHECK = '<svg class="bs-ck" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const G = (d, extra = '') => `<svg class="bs-gl" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</g>${extra}</svg>`;
/** Small line glyphs for a select's values (data-bub="rsvp"). The label stays as tooltip + aria-label. */
export const GLYPHS = {
  rsvp: {
    'Not invited yet': G('<circle cx="8" cy="8" r="5.6" stroke-dasharray="2 2.3"/>'),
    'Invited': G('<rect x="2.4" y="3.9" width="11.2" height="8.2" rx="1.6"/><path d="M3 5l5 4 5-4"/>'),
    'Yes': G('<circle cx="8" cy="8" r="5.6"/><path d="M5.5 8.2l1.8 1.8 3.2-3.6"/>'),
    'Maybe': G('<circle cx="8" cy="8" r="5.6"/><path d="M6.6 6.5a1.5 1.5 0 1 1 2.2 1.3c-.5.3-.8.6-.8 1.2"/>', '<circle cx="8" cy="11.2" r=".9" fill="currentColor"/>'),
    'Declined': G('<circle cx="8" cy="8" r="5.6"/><path d="M6 6l4 4M10 6l-4 4"/>'),
  },
};
let bs = null; // the one open menu: { menu, btn, off }

function closeBS(restore) {
  if (!bs) return;
  const { menu, btn, off } = bs; bs = null;
  btn.setAttribute('aria-expanded', 'false');
  menu.classList.add('out');
  setTimeout(() => menu.remove(), 120);
  for (const [t, f, o] of off) removeEventListener(t, f, o);
  if (restore) btn.focus({ preventScroll: true });
}

function openBS(sel, btn, glyphs) {
  closeBS();
  const menu = document.createElement('div');
  menu.className = 'bs-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', sel.getAttribute('aria-label') || '');
  menu.innerHTML = [...sel.options].map((o) => `<button type="button" role="option" tabindex="-1" data-v="${esc(o.value)}" aria-selected="${o.value === sel.value}" class="${o.value === sel.value ? 'on' : ''}"${o.disabled ? ' disabled' : ''}>${glyphs?.[o.value] || ''}<span class="bs-ol">${esc(o.textContent)}</span>${BS_CHECK}</button>`).join('');
  document.body.append(menu);
  const place = () => {
    const r = btn.getBoundingClientRect();
    menu.style.minWidth = Math.max(r.width, glyphs ? 190 : 176) + 'px';
    const mh = menu.offsetHeight, mw = menu.offsetWidth;
    const below = innerHeight - r.bottom - 12, above = r.top - 12;
    const up = mh > below && above > below;
    menu.style.maxHeight = Math.max(160, up ? above : below) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - mw - 8)) + 'px';
    menu.style.top = (up ? Math.max(8, r.top - 8 - menu.offsetHeight) : r.bottom + 8) + 'px';
  };
  place();
  btn.setAttribute('aria-expanded', 'true');
  const items = () => [...menu.querySelectorAll('[role="option"]:not(:disabled)')];
  const pick = (o) => { sel.value = o.dataset.v; sel.dispatchEvent(new Event('change', { bubbles: true })); closeBS(true); };
  const onKey = (e) => {
    const list = items(), i = list.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); e.stopPropagation(); list[(n + list.length) % list.length]?.focus(); };
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeBS(true); }
    else if (e.key === 'Tab') closeBS(false);
    else if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) { e.preventDefault(); e.stopPropagation(); pick(list[i]); }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase(), hit = [...list.slice(i + 1), ...list.slice(0, i + 1)].find((o) => o.textContent.trim().toLowerCase().startsWith(k));
      if (hit) { e.preventDefault(); hit.focus(); }
    }
  };
  const onDown = (e) => { if (!menu.contains(e.target) && !btn.contains(e.target)) closeBS(false); };
  const onScroll = (e) => { if (!menu.contains(e.target)) closeBS(false); };
  const off = [['keydown', onKey, true], ['pointerdown', onDown, true], ['scroll', onScroll, true], ['resize', () => closeBS(false), false]];
  for (const [t, f, o] of off) addEventListener(t, f, o);
  menu.addEventListener('click', (e) => { const o = e.target.closest('[role="option"]'); if (o) pick(o); });
  bs = { menu, btn, off };
  (items().find((o) => o.classList.contains('on')) || items()[0])?.focus({ preventScroll: true });
}

/** Turn every `select[data-bub]` under root into a bubbly button + menu. Safe to call after every render.
 *  The select stays in the DOM (hidden) and still gets its `change` event, so existing handlers keep working. */
export function bubbleSelects(root = document) {
  root.querySelectorAll('select[data-bub]:not([data-bub-on])').forEach((sel) => {
    sel.dataset.bubOn = '1';
    sel.style.display = 'none';
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    const glyphs = GLYPHS[sel.dataset.bub];
    const name = sel.getAttribute('aria-label') || '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bs-btn' + (glyphs ? ' bs-ic' : '');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    const paint = () => {
      const o = sel.selectedOptions[0] || sel.options[0];
      const label = o ? o.textContent.trim() : '';
      btn.dataset.v = sel.value;
      btn.title = glyphs ? `${name ? name + ': ' : ''}${label}` : name;
      btn.setAttribute('aria-label', `${name ? name + ': ' : ''}${label}`);
      btn.innerHTML = (glyphs ? (glyphs[sel.value] || '') + `<span class="bs-gt">${esc(label)}</span>` : `<span class="bs-l">${esc(label)}</span>`) + BS_CHEV; // glyph selects (RSVP) also carry their word; CSS shows it only where there is room
    };
    paint();
    sel.addEventListener('change', paint);
    btn.onclick = () => { if (bs?.btn === btn) closeBS(true); else openBS(sel, btn, glyphs); };
    btn.onkeydown = (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openBS(sel, btn, glyphs); } };
    sel.after(btn);
  });
}
