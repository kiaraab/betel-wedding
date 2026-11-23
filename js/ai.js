// Gemini client for the browser. The key is NEVER in the code: it lives in this browser's localStorage only.
import { esc, toast, trapFocus } from './util.js';

const KEY_NAME = 'betel-ai-key';
// Google retires models often: try the rolling alias first, then named fallbacks when a model is gone (404) or busy (503)
const MODELS = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];
const urlFor = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
const MAX_PER_MIN = 10, TIMEOUT = 25_000;
const calls = [];

let sharedKey = ''; // the key the owner shared with everyone who can edit (js/sync.js loads it after sign-in)
let share = { can: () => false, save: async () => {}, remove: async () => {} };
export const setSharedKey = (k) => { sharedKey = k || ''; };
export const registerShare = (h) => { share = h; };
export const getKey = () => { try { return localStorage.getItem(KEY_NAME) || sharedKey; } catch { return sharedKey; } };
export function setKey(k) {
  try { k = String(k || '').trim(); k ? localStorage.setItem(KEY_NAME, k) : localStorage.removeItem(KEY_NAME); } catch { /* private mode */ }
}
export const aiAvailable = () => !!getKey();

export class AiError extends Error {}

/** Trailing debounce: returns a function that runs fn after `ms` of quiet. */
export function debounce(fn, ms = 600) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function takeSlot() {
  const now = Date.now();
  while (calls.length && now - calls[0] > 60_000) calls.shift();
  if (calls.length >= MAX_PER_MIN) throw new AiError(`Easy there: ${MAX_PER_MIN} AI requests a minute on the free plan. Try again in a moment.`);
  calls.push(now);
}

/** images: [{ mime, data(base64 without prefix) }]. Returns text, or parsed JSON when json:true. Throws AiError. */
export async function askGemini({ system = '', prompt = '', images = [], json = false } = {}) {
  const key = getKey();
  if (!key) throw new AiError('Add an AI key first.');
  takeSlot();
  const body = {
    ...(system && { system_instruction: { parts: [{ text: system }] } }),
    contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } }))] }],
    generationConfig: { temperature: 0.4, ...(json && { responseMimeType: 'application/json' }) },
  };
  let res;
  for (const m of MODELS) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      res = await fetch(`${urlFor(m)}?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    } catch (e) {
      throw new AiError(e.name === 'AbortError' ? 'The AI took too long. Try again.' : 'Could not reach the AI. Check your connection.');
    } finally { clearTimeout(timer); }
    if (res.status !== 404 && res.status !== 503) break; // anything else is final; these two try the next model
  }
  if (res.status === 429) throw new AiError('The free AI quota is used up for now. Try again in a minute, or tomorrow.');
  if (res.status === 400 || res.status === 403) throw new AiError('The AI key was not accepted. Check it in AI settings.');
  if (!res.ok) throw new AiError(`The AI had a problem (${res.status}).`);
  const data = await res.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new AiError('The AI sent nothing back.');
  if (!json) return text;
  try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new AiError('The AI answer was not readable. Try again.'); }
}

/** File -> { mime, data } for askGemini. */
export const fileToImage = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve({ mime: file.type || 'image/jpeg', data: String(r.result).split(',')[1] || '' });
  r.onerror = () => reject(new AiError('Could not read that image.'));
  r.readAsDataURL(file);
});

/* ---------- settings dialog ---------- */
export function openAiSettings(onChange) {
  document.getElementById('aiDlg')?.remove();
  const d = document.createElement('div');
  d.id = 'aiDlg'; d.className = 'ai-dlg';
  d.innerHTML = `
    <form class="ai-card" role="dialog" aria-modal="true" aria-label="AI settings">
      <h2>Keys</h2>
      <label class="ai-f"><span>Gemini API key</span><input class="input" type="password" name="key" autocomplete="off" spellcheck="false" value="${esc(getKey())}"/></label>
      <label class="ai-f"><span>Google Maps key <em>(address autofill, optional)</em></span><input class="input" type="password" name="maps" autocomplete="off" spellcheck="false" placeholder="Uses the built-in key if empty" value="${esc(localStorage.getItem('betel-maps-key') || '')}"/></label>
      ${share.can() ? '<label class="ai-share"><input type="checkbox" name="share" checked/> Share with everyone who can edit (Betel, Carter…)</label><p class="ai-note">Shared keys are readable only by approved editors.</p>' : '<p class="ai-note">Stored in this browser only.</p>'}
      <div class="ai-foot"><button type="button" class="btn line sm" data-rm>Remove</button><span class="spacer"></span><button type="button" class="btn line sm" data-x>Close</button><button class="btn moss sm">Save</button></div>
    </form>`;
  document.body.append(d);
  const opener = document.activeElement;
  const release = trapFocus(d);
  const close = () => { release(); d.remove(); onChange?.(); (opener?.isConnected ? opener : document.querySelector('[data-ai-settings]') || document.getElementById('liveBtn'))?.focus?.({ preventScroll: true }); };
  const f = d.querySelector('form');
  f.key.focus();
  f.onsubmit = async (e) => { e.preventDefault(); try { const m = f.maps.value.trim(); m ? localStorage.setItem('betel-maps-key', m) : localStorage.removeItem('betel-maps-key'); } catch { /* storage blocked */ } setKey(f.key.value); if (f.share?.checked && f.key.value.trim()) { try { await share.save(f.key.value.trim()); } catch { toast('Saved here, but sharing failed'); } } toast(aiAvailable() ? 'AI key saved' : 'AI key removed'); close(); };
  d.querySelector('[data-rm]').onclick = async () => { setKey(''); if (share.can()) { try { await share.remove(); } catch { /* not shared */ } } setSharedKey(''); toast('AI key removed'); close(); };
  d.querySelector('[data-x]').onclick = close;
  d.addEventListener('pointerdown', (e) => { if (e.target === d) close(); });
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

/** Small entry point for panels: "AI on · Settings" or "Add AI key". */
export const aiLinkHTML = () => `<button type="button" class="linklike ai-link" data-ai-settings>${aiAvailable() ? 'AI & map keys' : 'Add keys'}</button>`;
export function wireAiLink(root, onChange) {
  root.querySelectorAll('[data-ai-settings]').forEach((b) => { b.onclick = () => openAiSettings(onChange); });
}
