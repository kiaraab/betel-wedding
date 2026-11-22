/*
 * Live shared editing (Firebase). Everything is lazy: nothing loads until someone opens the Live panel
 * or was already signed in. Sign-in is a link sent to the email (no passwords). Only editors can read or write
 * the plan (enforced by Firestore rules, see FIRESTORE-RULES.txt); the config below is public by design.
 *
 *  - First time a browser connects: if the shared plan exists it wins (this browser's copy is backed up first);
 *    if there is none yet, this browser's plan becomes the shared one. So whoever holds the real plan signs in first.
 *  - After that every save is pushed (debounced); remote changes are merged part by part (store.mergeRemote).
 */
import { onSave, mergeRemote, snapshot } from './store.js';
import { esc, toast } from './util.js';

const CONFIG = {
  apiKey: 'AIzaSyC40htk19028Tz86iJni_CPeHrBiZeCkjk',
  authDomain: 'betel-s-wedding.firebaseapp.com',
  projectId: 'betel-s-wedding',
  appId: '1:951045103210:web:239557121e1af9239f3413',
};
const OWNER = 'raabkiara2@gmail.com';
const V = '10.12.2';
const CDN = (m) => `https://www.gstatic.com/firebasejs/${V}/firebase-${m}.js`;
const EMAIL_KEY = 'betel-signin-email';
const SYNCED_KEY = 'betel-synced-once';
const ON_KEY = 'betel-sync-on';
const CLIENT = Math.random().toString(36).slice(2, 10);
const MAX_BYTES = 900_000; // a Firestore document tops out at 1 MB

let fb = null;          // { auth, db, A, F } once loaded
let user = null;
let role = 'out';       // out | pending (signed in, not approved) | editor | owner
let status = 'Offline';
let unsub = null, pushTimer = null, lastPushed = '', applying = false;
const watchers = new Set();
const store = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const fetchKey = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const onSyncChange = (fn) => { watchers.add(fn); return () => watchers.delete(fn); };
export const info = () => ({ role, status, email: user?.email || '', live: role === 'editor' || role === 'owner' });
const emit = () => watchers.forEach((fn) => { try { fn(info()); } catch { /* a watcher must not break sync */ } });

async function load() {
  if (fb) return fb;
  const [{ initializeApp }, A, F] = await Promise.all([import(CDN('app')), import(CDN('auth')), import(CDN('firestore'))]);
  const app = initializeApp(CONFIG);
  fb = { auth: A.getAuth(app), db: F.getFirestore(app), A, F };
  return fb;
}
const planRef = () => fb.F.doc(fb.db, 'plans', 'main');
const isEditor = () => role === 'editor' || role === 'owner';

async function checkRole() {
  if (user.email === OWNER) return 'owner';
  try { await fb.F.getDoc(planRef()); return 'editor'; } catch { return 'pending'; } // the rules deny people who are not approved
}

function take(d) {
  try {
    applying = true;
    lastPushed = d.data;
    mergeRemote(JSON.parse(d.data));
  } catch { /* corrupt remote copy: ignore */ } finally { applying = false; }
}

async function startLive() {
  const first = await fb.F.getDoc(planRef());
  if (first.exists()) {
    if (fetchKey(SYNCED_KEY) !== '1') store('betel-carter-atelier-before-sync', JSON.stringify(snapshot()));
    take(first.data());
  } else {
    await push(true);
  }
  store(SYNCED_KEY, '1');
  unsub?.();
  unsub = fb.F.onSnapshot(planRef(), (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const d = snap.data();
    if (d.by === CLIENT) return; // my own write coming back
    take(d);
  }, () => { status = 'Reconnecting…'; emit(); });
  status = 'Live';
  emit();
}

async function push(force = false) {
  if (!fb || !user || !isEditor()) return;
  const data = JSON.stringify(snapshot());
  if (!force && data === lastPushed) return;
  if (data.length > MAX_BYTES) { status = 'Too big to sync'; emit(); toast('The plan is too large to sync (probably photos). Remove a few photos.'); return; }
  try {
    await fb.F.setDoc(planRef(), { data, by: CLIENT, who: user.email, at: fb.F.serverTimestamp() });
    lastPushed = data;
    status = 'Live';
  } catch { status = 'Not saved, retrying'; setTimeout(() => push(), 4000); }
  emit();
}

onSave(() => {
  if (applying || !fb || !isEditor()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(), 700);
});

async function onUser(u) {
  user = u;
  unsub?.(); unsub = null;
  if (!u) { role = 'out'; status = 'Offline'; emit(); return; }
  status = 'Connecting…'; emit();
  role = await checkRole();
  if (isEditor()) await startLive();
  else { status = 'Needs approval'; emit(); }
}

/** Boot: finish an email-link sign-in if the URL is one, resume a previous session. Does nothing (and loads nothing) otherwise. */
export async function initSync() {
  const isLink = /[?&]oobCode=/.test(location.search);
  if (fetchKey(ON_KEY) !== '1' && !isLink) return;
  const { auth, A } = await load();
  if (A.isSignInWithEmailLink(auth, location.href)) {
    let email = fetchKey(EMAIL_KEY) || '';
    if (!email) email = window.prompt('Confirm your email to finish signing in') || '';
    try { await A.signInWithEmailLink(auth, email.trim().toLowerCase(), location.href); store(ON_KEY, '1'); toast('Signed in'); }
    catch { toast('That sign-in link did not work. Send a new one.'); }
    history.replaceState(null, '', location.pathname + (location.hash || '#overview'));
  }
  A.onAuthStateChanged(auth, onUser);
}

export async function sendLink(email) {
  const { auth, A } = await load();
  email = email.trim().toLowerCase();
  await A.sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
  store(EMAIL_KEY, email); store(ON_KEY, '1');
}
async function signOutLive() {
  if (fb) await fb.A.signOut(fb.auth);
  store(ON_KEY, null); store(SYNCED_KEY, null);
}
async function requestAccess() {
  await fb.F.setDoc(fb.F.doc(fb.db, 'requests', user.email), { email: user.email, at: fb.F.serverTimestamp() });
}
async function listRequests() {
  if (role !== 'owner') return [];
  const s = await fb.F.getDocs(fb.F.collection(fb.db, 'requests'));
  return s.docs.map((d) => d.data().email);
}
async function approve(email) {
  await fb.F.setDoc(fb.F.doc(fb.db, 'editors', email), { email });
  await fb.F.deleteDoc(fb.F.doc(fb.db, 'requests', email));
}

/* ---------- Live panel: glass popover opened from the footer button ---------- */
export function mountLive(btn) {
  const dot = btn.querySelector('.live-dot');
  const paint = () => { const i = info(); btn.title = `Edit together · ${i.status}`; dot?.setAttribute('data-s', i.live ? 'on' : i.role === 'pending' ? 'wait' : 'off'); };
  onSyncChange(paint); paint();
  btn.onclick = async () => {
    if (document.querySelector('.live-pop')) { document.querySelector('.live-pop').remove(); return; }
    const pop = document.createElement('div');
    pop.className = 'live-pop';
    document.body.appendChild(pop);
    const draw = async () => {
      const i = info();
      if (i.role === 'out') {
        pop.innerHTML = `<h3>Edit together</h3><p>Sign in to share changes live. We email you a link.</p>
          <form class="live-form"><input type="email" required placeholder="you@email.com" aria-label="Email"/><button class="btn">Send link</button></form><p class="live-note" aria-live="polite"></p>`;
        pop.querySelector('form').onsubmit = async (e) => {
          e.preventDefault();
          const note = pop.querySelector('.live-note');
          note.textContent = 'Sending…';
          try { await sendLink(e.target.querySelector('input').value); note.textContent = 'Link sent. Open it on this device.'; }
          catch { note.textContent = 'Could not send. Check the email and try again.'; }
        };
      } else if (i.role === 'pending') {
        pop.innerHTML = `<h3>${esc(i.email)}</h3><p>You are signed in but not approved yet.</p><button class="btn" data-ask>Ask for access</button> <button class="btn" data-out>Sign out</button><p class="live-note" aria-live="polite"></p>`;
        pop.querySelector('[data-ask]').onclick = async () => {
          const note = pop.querySelector('.live-note');
          try { await requestAccess(); note.textContent = 'Asked. Kiara will approve you.'; } catch { note.textContent = 'Could not send the request.'; }
        };
      } else {
        const reqs = await listRequests().catch(() => []);
        pop.innerHTML = `<h3>${esc(i.status)}</h3><p>${esc(i.email)}</p>
          ${reqs.length ? `<ul class="live-reqs">${reqs.map((r) => `<li>${esc(r)} <button class="btn" data-ok="${esc(r)}">Approve</button></li>`).join('')}</ul>` : ''}
          <button class="btn" data-out>Sign out</button>`;
        pop.querySelectorAll('[data-ok]').forEach((b) => { b.onclick = async () => { await approve(b.dataset.ok); toast(`${b.dataset.ok} can edit now`); draw(); }; });
      }
      pop.querySelector('[data-out]')?.addEventListener('click', async () => { await signOutLive(); pop.remove(); });
    };
    await draw();
    const off = (e) => { if (!pop.contains(e.target) && !btn.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', off, true); } };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
  };
}
