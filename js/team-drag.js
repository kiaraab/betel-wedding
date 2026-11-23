// Team page: rearrange cards by dragging (pointer, with a FLIP glide), or with the keyboard.
// Mouse: press the card (anywhere that is not a control) and move. Touch / pen: press and hold ~0.4s, or use the grip.
// Keyboard: Alt+Left / Alt+Right on anything inside a card, or ←/→ on the grip, or the move buttons in the card menu.
// The page owns what "order" means: `save(ids)` gets the visible cards' ids in their new order.

const INTERACTIVE = 'button, a, input, select, textarea, label, form, [contenteditable]';
const EASE = 'cubic-bezier(.2, .7, .2, 1)';

export function wireTeamDrag(grid, { save }) {
  const cards = () => [...grid.querySelectorAll(':scope > .tcard[data-pid]')];
  const ids = () => cards().map((c) => c.dataset.pid);

  /** Run `change()` (which reorders the DOM) and glide every tracked element from where it was to where it is. */
  let lockUntil = 0;   // while cards glide, rects are mid-animation: do not re-detect (that made a held card flicker back and forth)
  const flip = (els, change) => {
    lockUntil = performance.now() + 220;
    const first = new Map(els.map((el) => [el, el.getBoundingClientRect()]));
    change();
    for (const el of els) {
      const a = first.get(el), b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.offsetWidth;
      el.style.transition = `transform 180ms ${EASE}`;
      el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; }, 200);
    }
  };

  /* ----- keyboard / buttons ----- */
  const move = (card, dir) => {
    const list = cards(), i = list.indexOf(card), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return false;
    const had = document.activeElement;
    flip(list, () => { if (dir < 0) grid.insertBefore(card, list[j]); else list[j].after(card); });
    if (had && had !== document.body && !had.isConnected) card.querySelector('.tc-grip')?.focus({ preventScroll: true });
    else had?.focus?.({ preventScroll: true });
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    save(ids());
    return true;
  };
  grid.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('.tcard[data-pid]');
    if (!card || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const grip = !!e.target.closest('.tc-grip');
    if (!e.altKey && !grip) return;
    const dir = e.key === 'ArrowLeft' || (grip && e.key === 'ArrowUp') ? -1 : e.key === 'ArrowRight' || (grip && e.key === 'ArrowDown') ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    move(card, dir);
  });

  /* ----- pointer drag ----- */
  let pending = null, drag = null;

  const cleanupPending = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    removeEventListener('pointermove', onPendingMove, true);
    removeEventListener('pointerup', cleanupPending, true);
    removeEventListener('pointercancel', cleanupPending, true);
    removeEventListener('selectstart', noSelect, true);
    pending = null;
  };
  const noSelect = (e) => e.preventDefault();
  const noScroll = (e) => { if (e.cancelable) e.preventDefault(); };

  grid.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || drag || pending) return;
    const card = e.target.closest('.tcard[data-pid]');
    if (!card) return;
    const grip = !!e.target.closest('.tc-grip');
    if (!grip && e.target.closest(INTERACTIVE)) return;
    const touchy = e.pointerType !== 'mouse';
    pending = { card, x: e.clientX, y: e.clientY, id: e.pointerId, grip, touchy, timer: 0 };
    if (touchy && !grip) pending.timer = setTimeout(() => { const p = pending; if (!p) return; cleanupPending(); navigator.vibrate?.(8); begin(p.card, p.x, p.y, p.id, true); }, 380);
    addEventListener('pointermove', onPendingMove, true);
    addEventListener('pointerup', cleanupPending, true);
    addEventListener('pointercancel', cleanupPending, true);
    addEventListener('selectstart', noSelect, true);
  });

  function onPendingMove(e) {
    if (!pending || e.pointerId !== pending.id) return;
    const d = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
    if (pending.touchy && !pending.grip) { if (d > 10) cleanupPending(); return; } // moved before the hold: it is a scroll
    if (d > (pending.grip ? 3 : 6)) { const p = pending; cleanupPending(); begin(p.card, e.clientX, e.clientY, p.id, false); }
  }

  function begin(card, px, py, pointerId, held) {
    getSelection()?.removeAllRanges();
    const r = card.getBoundingClientRect();
    const ph = document.createElement('div');
    ph.className = 'tcard-ph';
    ph.setAttribute('aria-hidden', 'true');
    card.after(ph);
    drag = { card, ph, ox: px - r.left, oy: py - r.top, px, py, id: pointerId, start: ids(), raf: 0 };
    Object.assign(card.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: '0', zIndex: '60', pointerEvents: 'none', transition: 'none' });
    card.classList.add('dragging');
    grid.classList.add('is-dragging');
    document.body.classList.add('tg-grabbing');
    addEventListener('pointermove', onMove, true);
    addEventListener('pointerup', onUp, true);
    addEventListener('pointercancel', onUp, true);
    addEventListener('keydown', onEsc, true);
    addEventListener('selectstart', noSelect, true);
    addEventListener('touchmove', noScroll, { passive: false, capture: true });
    addEventListener('contextmenu', noSelect, true);
    tick();
  }

  const target = () => {
    const { card, ph, px, py } = drag;
    if (performance.now() < lockUntil) return;
    // only the inner part of a card counts as a hit, so resting on an edge never swaps back and forth
    const over = cards().find((c) => { if (c === card) return false; const r = c.getBoundingClientRect(), ix = r.width * .22, iy = r.height * .22; return px >= r.left + ix && px <= r.right - ix && py >= r.top + iy && py <= r.bottom - iy; });
    if (!over) return;
    const after = ph.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING; // the card sits after the placeholder
    const others = cards().filter((c) => c !== card);
    flip([...others, ph], () => { if (after) over.after(ph); else grid.insertBefore(ph, over); });
  };
  const place = () => {
    const { card, px, py, ox, oy } = drag;
    card.style.left = px - ox + 'px';
    card.style.top = py - oy + 'px';
  };
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.px = e.clientX; drag.py = e.clientY;
    place();   // the hit-test runs from tick() once per frame
  }
  // edge auto-scroll while the card is held near the top / bottom of the window
  function tick() {
    if (!drag) return;
    const { py, px } = drag;
    // hit-test once per frame, but only when the pointer moved >2px since the last test (a resting hand jitters) or a glide just ended
    if (performance.now() < lockUntil) drag.again = true;
    else if (!drag.tx || drag.again || Math.hypot(px - drag.tx.x, py - drag.tx.y) >= 2) { drag.tx = { x: px, y: py }; drag.again = false; target(); }
    if (py < 90) scrollBy(0, -14); else if (py > innerHeight - 100) scrollBy(0, 14);
    drag.raf = requestAnimationFrame(tick);
  }
  function onEsc(e) {
    if (e.key !== 'Escape' || !drag) return;
    e.preventDefault(); e.stopPropagation();
    // back to where it started
    const { start, card, ph } = drag;
    const by = new Map(cards().map((c) => [c.dataset.pid, c]));
    const add = grid.querySelector('.t-add');
    flip([...cards().filter((c) => c !== card), ph], () => {
      for (const id of start) grid.insertBefore(id === card.dataset.pid ? ph : by.get(id), add);
    });
    finish(false);
  }
  function onUp(e) { if (drag && e.pointerId === drag.id) finish(true); }

  function finish(commitOrder) {
    const { card, ph, raf } = drag, was = drag.start.join();
    cancelAnimationFrame(raf);
    drag = null;
    removeEventListener('pointermove', onMove, true);
    removeEventListener('pointerup', onUp, true);
    removeEventListener('pointercancel', onUp, true);
    removeEventListener('keydown', onEsc, true);
    removeEventListener('selectstart', noSelect, true);
    removeEventListener('touchmove', noScroll, { capture: true });
    removeEventListener('contextmenu', noSelect, true);
    // glide into the slot, then become a normal grid item again
    const r = ph.getBoundingClientRect();
    card.style.transition = `left 180ms ${EASE}, top 180ms ${EASE}, box-shadow 180ms`;
    card.style.left = r.left + 'px';
    card.style.top = r.top + 'px';
    card.classList.remove('dragging');
    setTimeout(() => {
      card.removeAttribute('style');
      ph.replaceWith(card);
      grid.classList.remove('is-dragging');
      document.body.classList.remove('tg-grabbing');
      if (commitOrder && ids().join() !== was) save(ids());
    }, 190);
  }

  return { move };
}
