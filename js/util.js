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
