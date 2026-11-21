export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
/** Small message at the bottom. Pass { undo } to show an Undo button (kept up a little longer). */
export function toast(msg, { undo } = {}) {
  const el = document.getElementById('toast');
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
  toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 6000 : 2400);
}

export function daysUntil(iso) {
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}

export const fmtDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
