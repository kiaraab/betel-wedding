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
    yes.focus();
  });
}

/** Put focus back where it was (or on the footer people button when that element is gone). */
export function restoreFocus(prev) {
  const t = prev && prev.isConnected && prev !== document.body ? prev : document.getElementById('liveBtn');
  t?.focus?.({ preventScroll: true });
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
