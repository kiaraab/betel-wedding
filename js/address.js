// Street autocomplete for guest addresses, using Google's Places API (New).
// Needs a Google Maps Platform key with "Maps JavaScript API" and "Places API (New)" enabled, restricted to this site's address
// (https://kiaraab.github.io/*). A web key is public by design; the restriction is what protects it.
// The key can be replaced from "AI & map keys" (saved in that browser only).
const BUILT_IN_KEY = 'AIzaSyCgWQNhQh8kBZNGDvaBfHhB73o6t8wGJrw';
const mapsKey = () => { try { return localStorage.getItem('betel-maps-key') || BUILT_IN_KEY; } catch { return BUILT_IN_KEY; } };

let loading = null;
function loadPlaces() {
  if (!mapsKey()) return Promise.resolve(false);
  if (window.google?.maps?.importLibrary) return Promise.resolve(true);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey()}&loading=async&callback=__placesReady`;
    window.__placesReady = () => resolve(true);
    s.onerror = () => { loading = null; reject(new Error('Address lookup could not load')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** Fill street/city/state/zip from one picked place. `save(field, value, row)` writes it to the guest. */
function fillFrom(place, row, save) {
  const comps = place.addressComponents || [];
  const part = (type, short) => { const c = comps.find((x) => x.types.includes(type)); return c ? (short ? c.shortText : c.longText) : ''; };
  const street = [part('street_number'), part('route')].filter(Boolean).join(' ');
  const values = { street: street || place.displayName || '', street2: part('subpremise'), city: part('locality') || part('postal_town') || part('sublocality'), state: part('administrative_area_level_1', true), zip: part('postal_code') };
  Object.entries(values).forEach(([k, v]) => {
    const input = row.querySelector(`[data-k="${k}"]`);
    if (input && v) { input.value = v; save(k, v, row); }
  });
}

const attached = new WeakSet();
function attach(input, save) {
  let list = null, items = [], at = -1, timer = 0, token = null, seq = 0;
  const close = () => { list?.remove(); list = null; items = []; at = -1; };
  const mark = () => list?.querySelectorAll('li').forEach((li, i) => li.classList.toggle('on', i === at));
  const open = () => {
    if (!list) { list = document.createElement('ul'); list.className = 'suggest'; list.setAttribute('role', 'listbox'); document.body.append(list); }
    const r = input.getBoundingClientRect();
    Object.assign(list.style, { left: r.left + 'px', top: r.bottom + 4 + 'px', minWidth: Math.max(240, r.width) + 'px' });
    list.innerHTML = items.map((it, i) => `<li role="option" data-i="${i}"><span>${it.main}</span><em>${it.sub}</em></li>`).join('');
    list.onmousedown = (e) => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pick(+li.dataset.i); } };
  };
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function pick(i) {
    const it = items[i]; if (!it) return;
    close();
    try {
      const place = it.pred.toPlace();
      await place.fetchFields({ fields: ['addressComponents', 'displayName'] });
      fillFrom(place, input.closest('tr') || input.closest('form') || document, save);
    } catch { /* lookup failed: the typed text stays */ }
    token = null;
  }
  async function search() {
    const q = input.value.trim(), mine = ++seq;
    if (q.length < 3) return close();
    try {
      await loadPlaces();
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await google.maps.importLibrary('places');
      token ||= new AutocompleteSessionToken();
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: q, includedRegionCodes: ['us'], sessionToken: token });
      if (mine !== seq) return;
      items = suggestions.filter((s) => s.placePrediction).slice(0, 6).map((s) => ({ pred: s.placePrediction, main: esc(s.placePrediction.mainText?.toString() || s.placePrediction.text.toString()), sub: esc(s.placePrediction.secondaryText?.toString() || '') }));
      at = -1;
      items.length ? open() : close();
    } catch { close(); }
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 220); });
  input.addEventListener('keydown', (e) => {
    if (!list) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); at = (at + 1) % items.length; mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = (at - 1 + items.length) % items.length; mark(); }
    else if (e.key === 'Enter' && at >= 0) { e.preventDefault(); pick(at); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
}

/** Attach to every street field as it gets focus. Safe to call repeatedly. */
export function enableAddressLookup(save) {
  document.addEventListener('focusin', (e) => {
    const input = e.target;
    if (!input.matches?.('.addr-street') || attached.has(input)) return;
    attached.add(input);
    attach(input, save);
  });
}
