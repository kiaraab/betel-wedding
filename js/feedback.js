// Feedback box: Betel or the team send a bug or a small request in two taps.
// It is saved to Firestore (collection `feedback`, owner reads it). Offline or signed out, it waits in this browser and sends later.
import { toast, trapFocus } from './util.js';
import { sendFeedback, onSyncChange, info } from './sync.js';

const QKEY = 'bc-feedback-queue';
const readQ = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } };
const writeQ = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { /* storage blocked */ } };

let flushing = false;
async function flush() {
  if (flushing || !info().live) return;
  const q = readQ(); if (!q.length) return;
  flushing = true;
  try { while (q.length) { await sendFeedback(q[0]); q.shift(); writeQ(q); } toast('Your feedback was sent'); }
  catch { /* still offline or rule not published: keep the rest queued */ }
  flushing = false;
}
/** Call once: sends anything that was waiting as soon as the site is live. */
export function initFeedback() { onSyncChange(flush); flush(); }

export function openFeedback() {
  document.getElementById('fbDlg')?.remove();
  const d = document.createElement('div');
  d.id = 'fbDlg'; d.className = 'ai-dlg';
  d.innerHTML = `
    <form class="ai-card" role="dialog" aria-modal="true" aria-label="Send feedback">
      <h2>Feedback</h2>
      <div class="fb-type" role="radiogroup" aria-label="Type"><button type="button" role="radio" aria-checked="true" data-t="request">Request</button><button type="button" role="radio" aria-checked="false" data-t="bug">Something broke</button></div>
      <label class="ai-f"><span>What would you like?</span><textarea class="input" name="text" rows="4" maxlength="1500" required placeholder="Type here"></textarea></label>
      <div class="ai-foot"><span class="spacer"></span><button type="button" class="btn line sm" data-x>Cancel</button><button class="btn moss sm">Send</button></div>
    </form>`;
  document.body.append(d);
  const opener = document.activeElement, release = trapFocus(d);
  const f = d.querySelector('form'); let type = 'request';
  const close = () => { release(); d.remove(); (opener?.isConnected ? opener : document.getElementById('bellBtn'))?.focus?.({ preventScroll: true }); };
  d.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { type = b.dataset.t; d.querySelectorAll('[data-t]').forEach((o) => o.setAttribute('aria-checked', String(o === b))); f.text.placeholder = type === 'bug' ? 'What went wrong?' : 'Type here'; });
  f.onsubmit = async (e) => {
    e.preventDefault();
    const text = f.text.value.trim(); if (!text) return;
    const entry = { type, text, page: location.hash.slice(1) || 'overview' };
    close();
    try { await sendFeedback(entry); toast('Thank you, Kiara will see it'); }
    catch { writeQ([...readQ(), entry]); toast('Saved. It will send as soon as it can'); }
  };
  d.querySelector('[data-x]').onclick = close;
  d.addEventListener('pointerdown', (e) => { if (e.target === d) close(); });
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  f.text.focus();
}
