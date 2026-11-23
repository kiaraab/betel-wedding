// Catering list: everyone who is coming, with meal needs and contact details, ready to print or send to the caterer.
// The caterer's own contact (name, phone, email, notes) is kept in the plan as state.catering.
import { state, commit } from './store.js';
import { esc, trapFocus } from './util.js';
import { FEATURES } from './features.js';

const going = (g) => g.rsvp !== 'Declined';
const LIMIT = 'Limit alcohol';
const dietList = (g) => String(g.diet || '').split(/\s*[,;]\s*/).filter(Boolean);
const tableName = (g) => { const t = state.tables.find((x) => x.id === g.tableId); return t ? (t.id === 'head' ? 'Sweetheart' : /^\d+$/.test(t.name) ? `Table ${t.name}` : t.name) : ''; };
const address = (g) => [g.street, g.street2, [g.city, g.state].filter(Boolean).join(', '), g.zip].filter(Boolean).join(' ');

function rows() {
  return state.guests.filter(going).map((g) => ({
    name: g.name, table: tableName(g), diet: dietList(g).join(', '), plus: g.plusOne || '', household: g.household || '',
    rsvp: g.party === 'couple' ? 'Couple' : g.rsvp, address: address(g), notes: g.notes || '',
  })).sort((a, b) => (a.table || '~').localeCompare(b.table || '~', undefined, { numeric: true }) || a.name.localeCompare(b.name));
}

function csv() {
  const c = state.catering || {};
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cols = [['Name', 'name'], ['Table', 'table'], ['Dietary needs', 'diet'], ['Plus-one', 'plus'], ['Household', 'household'], ...(FEATURES.rsvp ? [['RSVP', 'rsvp']] : []), ...(FEATURES.address ? [['Address', 'address']] : []), ['Notes', 'notes']];
  const lines = [
    ['Caterer', c.name || '', 'Phone', c.phone || '', 'Email', c.email || ''].map(q).join(','),
    ['Guests going', rows().length].map(q).join(','),
    ['Limit alcohol (bar staff)', rows().filter((r) => r.diet.includes(LIMIT)).map((r) => r.name).join('; ') || 'none'].map(q).join(','),
    '',
    cols.map(([h]) => q(h)).join(','),
    ...rows().map((r) => cols.map(([, k]) => q(r[k])).join(',')),
  ];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
  a.download = 'griffin-wedding-catering-list.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function openCatering() {
  document.getElementById('catDlg')?.remove();
  const list = rows();
  const counts = {};
  list.forEach((r) => r.diet.split(/\s*,\s*/).filter(Boolean).forEach((d) => { counts[d] = (counts[d] || 0) + 1; }));
  const c = state.catering || {};
  const d = document.createElement('div');
  d.id = 'catDlg'; d.className = 'cat-dlg';
  d.innerHTML = `
    <section class="cat-card" role="dialog" aria-modal="true" aria-label="Catering list">
      <header class="cat-head"><h2>Catering list</h2><button type="button" class="cat-x" data-x aria-label="Close">×</button></header>
      <div class="cat-body">
        <div class="cat-contact" aria-label="Caterer contact">
          <label>Caterer<input class="input" name="name" value="${esc(c.name || '')}" placeholder="Company or contact" autocomplete="off"/></label>
          <label>Phone<input class="input" name="phone" type="tel" value="${esc(c.phone || '')}" placeholder="(555) 555-5555" autocomplete="off"/></label>
          <label>Email<input class="input" name="email" type="email" value="${esc(c.email || '')}" placeholder="name@caterer.com" autocomplete="off"/></label>
        </div>
        ${list.some((r) => r.diet.includes(LIMIT)) ? `<div class="cat-limit" role="note"><b>Limit alcohol</b> (let bar staff know quietly): ${list.filter((r) => r.diet.includes(LIMIT)).map((r) => esc(r.name)).join(', ')}</div>` : ''}
        <div class="cat-sum"><b>${list.length}</b> guests going${Object.keys(counts).length ? ' · ' + Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k)} <b>${n}</b>`).join(' · ') : ''}</div>
        <div class="cat-wrap"><table class="cat-table">
          <thead><tr><th>Name</th><th>Table</th><th>Dietary needs</th><th>Plus-one</th>${FEATURES.address ? '<th>Address</th>' : ''}</tr></thead>
          <tbody>${list.map((r) => `<tr${r.diet.includes(LIMIT) ? ' class="lim"' : ''}><td>${esc(r.name)}</td><td>${esc(r.table)}</td><td>${esc(r.diet) || '—'}</td><td>${esc(r.plus)}</td>${FEATURES.address ? `<td>${esc(r.address)}</td>` : ''}</tr>`).join('')}</tbody>
        </table></div>
      </div>
      <footer class="cat-foot"><button type="button" class="btn line sm" data-print>Print</button><span class="spacer"></span><button type="button" class="btn line sm" data-x>Close</button><button type="button" class="btn moss sm" data-csv>Download CSV</button></footer>
    </section>`;
  document.body.append(d);
  const opener = document.activeElement;
  const release = trapFocus(d.querySelector('.cat-card'));
  const close = () => { release(); d.remove(); opener?.isConnected && opener.focus?.({ preventScroll: true }); };
  d.querySelectorAll('[data-x]').forEach((b) => { b.onclick = close; });
  d.addEventListener('pointerdown', (e) => { if (e.target === d) close(); });
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  d.querySelector('[data-csv]').onclick = csv;
  d.querySelector('[data-print]').onclick = () => { document.body.classList.add('printing-cat'); window.print(); setTimeout(() => document.body.classList.remove('printing-cat'), 500); };
  // caterer contact saves as you type
  d.querySelector('.cat-contact').addEventListener('change', (e) => {
    const f = e.target.closest('input'); if (!f) return;
    state.catering = { ...(state.catering || {}), [f.name]: f.value.trim() };
    commit({ silent: true });
  });
  d.querySelector('input').focus({ preventScroll: true });
}
