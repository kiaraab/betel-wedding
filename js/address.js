// Street autocomplete for guest addresses (Google Places). Does nothing until a key is set.
// To turn it on: create a Google Maps Platform key with the "Places API" enabled, restrict it
// to your GitHub Pages address (https://kiaraab.github.io/*) and paste it below.
const BUILT_IN_KEY = 'AIzaSyCgWQNhQh8kBZNGDvaBfHhB73o6t8wGJrw';   // public by design; restricted to the site's address in Google Cloud
const mapsKey = () => { try { return localStorage.getItem('betel-maps-key') || BUILT_IN_KEY; } catch { return BUILT_IN_KEY; } };

let loading = null;
function loadPlaces() {
  if (!mapsKey()) return Promise.resolve(false);
  if (window.google?.maps?.places) return Promise.resolve(true);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey()}&libraries=places&loading=async&callback=__placesReady`;
    window.__placesReady = () => resolve(true);
    s.onerror = () => reject(new Error('Address lookup could not load'));
    document.head.appendChild(s);
  });
  return loading;
}

const attached = new WeakSet();
/** Fill street/city/state/zip from one picked suggestion. `save(field, value)` writes it to the guest. */
function fillFrom(place, form, save) {
  const part = (type, short) => {
    const c = place.address_components?.find((x) => x.types.includes(type));
    return c ? (short ? c.short_name : c.long_name) : '';
  };
  const street = [part('street_number'), part('route')].filter(Boolean).join(' ');
  const values = { street: street || place.name || '', city: part('locality') || part('postal_town'), state: part('administrative_area_level_1', true), zip: part('postal_code') };
  Object.entries(values).forEach(([k, v]) => {
    const input = form.querySelector(`[data-k="${k}"]`);
    if (input && v) { input.value = v; save(k, v, form); }
  });
}

/** Attach to every street field as it gets focus. Safe to call repeatedly. */
export function enableAddressLookup(save) {
  document.addEventListener('focusin', async (e) => {
    const input = e.target;
    if (!input.matches?.('.addr-street') || attached.has(input)) return;
    const ok = await loadPlaces().catch(() => false);
    if (!ok || attached.has(input)) return;
    attached.add(input);
    const ac = new google.maps.places.Autocomplete(input, { types: ['address'], componentRestrictions: { country: 'us' }, fields: ['address_components', 'name'] });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place?.address_components) return;
      const row = input.closest('tr');
      fillFrom(place, row, save);
    });
  });
}
