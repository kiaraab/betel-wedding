// "Add to Home Screen": short steps for iPhone and Android. Kiara can edit the text below.
import { trapFocus } from './util.js';

const STEPS = {
  iPhone: ['Open the site in Safari.', 'Tap the Share button (the square with an arrow).', 'Scroll down and tap Add to Home Screen.', 'Tap Add.'],
  Android: ['Open the site in Chrome.', 'Tap the three dots at the top right.', 'Tap Add to Home screen (or Install app).', 'Tap Add.'],
};

export function openHomeScreen() {
  document.getElementById('hsDlg')?.remove();
  const d = document.createElement('div');
  d.id = 'hsDlg'; d.className = 'ai-dlg';
  d.innerHTML = `
    <div class="ai-card" role="dialog" aria-modal="true" aria-label="Add to Home Screen">
      <h2>Add to Home Screen</h2>
      ${Object.entries(STEPS).map(([k, list]) => `<section class="hs-sec"><h3>${k}</h3><ol>${list.map((x) => `<li>${x}</li>`).join('')}</ol></section>`).join('')}
      <div class="ai-foot"><span class="spacer"></span><button type="button" class="btn moss sm" data-x>Done</button></div>
    </div>`;
  document.body.append(d);
  const opener = document.activeElement, release = trapFocus(d);
  const close = () => { release(); d.remove(); (opener?.isConnected ? opener : document.getElementById('bellBtn'))?.focus?.({ preventScroll: true }); };
  d.querySelector('[data-x]').onclick = close;
  d.addEventListener('pointerdown', (e) => { if (e.target === d) close(); });
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  d.querySelector('[data-x]').focus();
}
