// A quiet "Saved" in the footer after every save, so nothing is ever left wondering (ADHD rule: visible feedback).
import { onSave } from './store.js';

export function initSaved() {
  const el = document.getElementById('savedMark');
  if (!el) return;
  const t0 = performance.now();
  let timer = 0;
  onSave(() => {
    if (performance.now() - t0 < 1500) return; // not for the load-time save
    el.textContent = 'Saved';
    el.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('on'), 1800);
  });
}
