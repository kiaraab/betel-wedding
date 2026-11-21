// "Who knows who" — a force-directed graph of guests. Links feed auto-seating:
// 'together' links keep people at the same table, 'apart' links keep them at different tables.
import { state, commit, undoable } from './store.js';
import { esc, toast } from './util.js';
import { relationOf } from './layout.js';
import { openPerson } from './person.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const SIDE_COLOR = { Betel: '#6b1f2a', Carter: '#3e4a2e', Both: '#b08d57' };
let raf = null;
let positions = new Map(); // guestId -> {x,y,vx,vy} kept between visits so the graph doesn't reshuffle

const initials = (n) => n.trim().split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
const key = (a, b) => [a, b].sort().join('|');
// Where each relation settles: distance out from the couple (0..1 of half-width) and height (−up / +down)
const REL_SPOT = { Parent: [0.14, -0.16], 'Close relative': [0.28, -0.24], Relative: [0.46, -0.3], Bridesmaid: [0.3, 0.26], Groomsman: [0.3, 0.26], 'Close friend': [0.55, 0.02], Friend: [0.72, 0.12], Colleague: [0.86, 0.3], 'Plus-one': [0.62, 0.05], '': [0.62, 0.05] };
const SIDE_DIR = { Betel: -1, Carter: 1, Both: 0 };
const relKey = (r) => (r || 'none').toLowerCase().replace(/[^a-z]+/g, '-');

const GROUP_CAP = 10; // a table's worth: bigger wedding parties are suggested as several groups

/**
 * Obvious 'together' suggestions not already covered by existing links:
 * the bridesmaids (and groomsmen) as ONE group each, plus household, plus-one and parent↔couple pairs.
 * Each item: { ids, why, pairs: [[a, b]…] } — pairs are the links it would add (a group = a star of links).
 */
export function suggestLinks(guests) {
  // union-find over current 'together' links, so people already grouped aren't suggested again
  const parent = new Map(guests.map((g) => [g.id, g.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const join = (a, b) => parent.set(find(a), find(b));
  (state.links || []).filter((l) => l.type === 'together' && parent.has(l.a) && parent.has(l.b)).forEach((l) => join(l.a, l.b));
  const apart = new Set((state.links || []).filter((l) => l.type === 'apart').map((l) => key(l.a, l.b)));
  const out = [];
  const suggest = (members, why) => {
    const m = members.filter(Boolean);
    if (m.length < 2) return;
    const hub = m[0], pairs = [];
    m.slice(1).forEach((g) => { if (find(g.id) !== find(hub.id) && !apart.has(key(hub.id, g.id))) { pairs.push([hub.id, g.id]); join(hub.id, g.id); } });
    if (pairs.length) out.push({ ids: m.map((g) => g.id), why, pairs });
  };
  // wedding party first: they all know each other
  [['Bridesmaid', 'Bridesmaids'], ['Groomsman', 'Groomsmen']].forEach(([rel, why]) => {
    const party = guests.filter((g) => g.party !== 'couple' && relationOf(g) === rel);
    for (let i = 0; i < party.length; i += GROUP_CAP) suggest(party.slice(i, i + GROUP_CAP), why);
  });
  const norm = (s) => String(s || '').trim().toLowerCase();
  const homes = new Map();
  guests.filter((g) => norm(g.household)).forEach((g) => { const h = norm(g.household); if (!homes.has(h)) homes.set(h, []); homes.get(h).push(g); });
  homes.forEach((m) => suggest(m.slice(0, GROUP_CAP), 'Household'));
  guests.filter((g) => norm(g.plusOne) && norm(g.plusOne) !== '+1').forEach((g) => {
    const p = norm(g.plusOne);
    suggest([g, guests.find((o) => o.id !== g.id && (norm(o.name) === p || norm(o.name).split(' ')[0] === p))], 'Plus-one');
  });
  const bride = guests.find((g) => g.personId === 'bride'), groom = guests.find((g) => g.personId === 'groom');
  guests.filter((g) => relationOf(g) === 'Parent').forEach((g) => {
    if (g.side !== 'Carter') suggest([g, bride], 'Parent');
    if (g.side !== 'Betel') suggest([g, groom], 'Parent');
  });
  return out;
}

export function linkFor(a, b) { return (state.links || []).find((l) => key(l.a, l.b) === key(a, b)); }

export { togetherGroups } from './layout.js';

export function renderConnections(host) {
  cancelAnimationFrame(raf);
  state.links ||= [];
  const guests = state.guests.filter((g) => g.rsvp !== 'Declined');
  const W = Math.max(320, host.clientWidth || 900), H = Math.min(640, Math.max(420, Math.round(W * 0.62)));
  host.innerHTML = `
    <div class="graph-wrap">
      <svg class="graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Guest connections"></svg>
      <div class="graph-choose" hidden></div>
      <div class="graph-suggest" hidden></div>
      <div class="graph-legend">
        <span><i style="background:${SIDE_COLOR.Betel}"></i>Betel</span><span><i style="background:${SIDE_COLOR.Carter}"></i>Carter</span><span><i style="background:${SIDE_COLOR.Both}"></i>Both</span>
        <span class="lg-ln"><span class="ln together"></span>Together</span><span class="lg-ln"><span class="ln apart"></span>Apart</span>
        <span class="legend-tip">Drop one person on another to link · tap a line to edit</span>
        <button class="btn line sm suggest-btn" id="suggestBtn">Suggest links</button>
      </div>
      <ul class="link-list"></ul>
    </div>`;
  const svg = host.querySelector('svg');
  const chooser = host.querySelector('.graph-choose');
  const wrap = host.querySelector('.graph-wrap');

  // nodes (keep old positions; new people start near their side + relation, fanned out on a small ring per group)
  const clusterOf = (g) => (g.party === 'couple' ? 'couple' : relationOf(g) + '|' + g.side);
  const clusterSize = new Map(), clusterSeen = new Map();
  guests.forEach((g) => { const c = clusterOf(g); clusterSize.set(c, (clusterSize.get(c) || 0) + 1); });
  const nodes = guests.map((g) => {
    let p = positions.get(g.id);
    const couple = g.party === 'couple';
    const [d, dy] = REL_SPOT[relationOf(g)] || REL_SPOT[''];
    const dir = SIDE_DIR[g.side] ?? 0;
    // shared guests have no side to lean on: they sit below / above the couple instead
    const home = couple ? { x: W / 2 + (g.side === 'Carter' ? 26 : -26), y: H / 2 } : { x: W / 2 + dir * d * W * 0.46, y: H / 2 + (dir ? dy : (dy < 0 ? -0.2 - d * 0.2 : 0.16 + d * 0.25)) * H };
    if (!p) {
      const c = clusterOf(g), k = clusterSize.get(c), i = clusterSeen.get(c) || 0;
      clusterSeen.set(c, i + 1);
      const r = k > 1 ? Math.max(36, (42 * k) / (2 * Math.PI)) : 0, a = (i / k) * Math.PI * 2 - Math.PI / 2;
      p = { x: Math.max(24, Math.min(W - 24, home.x + Math.cos(a) * r)), y: Math.max(24, Math.min(H - 34, home.y + Math.sin(a) * r)), vx: 0, vy: 0 };
      positions.set(g.id, p);
    }
    return { g, p, couple, home, rel: couple ? '' : relationOf(g) };
  });
  const byId = new Map(nodes.map((n) => [n.g.id, n]));
  const edges = () => state.links.filter((l) => byId.has(l.a) && byId.has(l.b));

  // draw
  const edgeLayer = document.createElementNS(SVGNS, 'g');
  const nodeLayer = document.createElementNS(SVGNS, 'g');
  svg.append(edgeLayer, nodeLayer);
  let picked = null;
  // Built once; later calls only update classes, so a tap or drop never re-inserts (and re-fades) the bubbles
  function drawNodes() {
    if (nodeLayer.firstElementChild) {
      nodeLayer.querySelectorAll('.node').forEach((el) => el.classList.toggle('picked', el.dataset.id === picked));
      return;
    }
    nodeLayer.innerHTML = nodes.map((n, i) => `
      <g class="node${picked === n.g.id ? ' picked' : ''}${n.couple ? ' couple' : ''} rel-${relKey(n.rel)}" data-id="${n.g.id}" style="animation-delay:${Math.min(i, 40) * 15}ms">
        ${n.rel ? `<circle class="ring" r="${n.couple ? 25 : 20}"/>` : ''}
        <circle class="dot" r="${n.couple ? 20 : 15}" fill="${SIDE_COLOR[n.g.side] || SIDE_COLOR.Both}"/>
        <text class="ini" dy=".35em">${esc(initials(n.g.name))}</text>
        <text class="nm" y="${n.couple ? 34 : 30}">${esc(n.g.name.split(' ')[0])}</text>
        ${n.rel ? `<text class="rl" y="${n.couple ? 47 : 43}">${esc(n.rel)}</text>` : ''}
      </g>`).join('');
  }
  function drawEdges() {
    edgeLayer.innerHTML = edges().map((l) => `<line class="edge-hit" data-a="${l.a}" data-b="${l.b}"/><line class="edge ${l.type}" data-a="${l.a}" data-b="${l.b}"/>`).join('');
    drawList();
  }
  // Every link, with a one-tap remove
  function drawList() {
    const list = host.querySelector('.link-list');
    if (!list) return;
    const ls = edges();
    const listed = new Set([...list.querySelectorAll('[data-k]')].map((li) => li.dataset.k));
    const first = (id) => byId.get(id).g.name.split(' ')[0];
    list.innerHTML = ls.length
      ? ls.map((l, i) => `<li data-k="${key(l.a, l.b)}" class="${listed.has(key(l.a, l.b)) ? 'old' : ''}"><span class="dot-${l.type}"></span>${esc(first(l.a))} &amp; ${esc(first(l.b))}<em>${l.type === 'together' ? 'together' : 'apart'}</em><button class="x" data-unlink="${i}" aria-label="Remove link">×</button></li>`).join('')
      : '<li class="empty">No links yet</li>';
    list.querySelectorAll('[data-unlink]').forEach((b) => b.onclick = () => {
      const l = ls[+b.dataset.unlink];
      removeLink(l.a, l.b);
    });
  }
  function removeLink(a, b) {
    const before = state.links.slice();
    state.links = state.links.filter((l) => key(l.a, l.b) !== key(a, b));
    commit({ silent: true });
    drawEdges(); render(); reheat();
    toast('Link removed', { undo: () => { state.links = before; commit({ silent: true }); drawEdges(); render(); } });
  }
  drawNodes(); drawEdges();

  // tiny force simulation
  let alpha = 1;
  function tick() {
    const k = alpha;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i].p;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j].p;
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy || 1;
        if (d2 > 220 * 220) continue;
        const f = (1400 / d2) * k;
        const d = Math.sqrt(d2); dx /= d; dy /= d;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
    }
    edges().forEach((l) => {
      const a = byId.get(l.a).p, b = byId.get(l.b).p;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const rest = l.type === 'together' ? 60 : 200, str = l.type === 'together' ? 0.05 : 0.012;
      const f = (d - rest) * str * k;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    });
    nodes.forEach((n) => {
      const p = n.p;
      p.vx += (n.home.x - p.x) * (n.couple ? 0.02 : 0.005) * k; p.vy += (n.home.y - p.y) * (n.couple ? 0.02 : 0.006) * k;
      if (n === dragging) return;
      p.vx *= 0.82; p.vy *= 0.82;
      p.x = Math.max(24, Math.min(W - 24, p.x + p.vx)); p.y = Math.max(24, Math.min(H - 34, p.y + p.vy));
    });
    alpha = Math.max(0.02, alpha * 0.985);
    render();
    raf = requestAnimationFrame(tick);
  }
  function render() {
    nodeLayer.querySelectorAll('.node').forEach((el) => { const p = byId.get(el.dataset.id).p; el.setAttribute('transform', `translate(${p.x} ${p.y})`); });
    edgeLayer.querySelectorAll('.edge, .edge-hit').forEach((el) => {
      const a = byId.get(el.dataset.a).p, b = byId.get(el.dataset.b).p;
      el.setAttribute('x1', a.x); el.setAttribute('y1', a.y); el.setAttribute('x2', b.x); el.setAttribute('y2', b.y);
    });
  }
  const reheat = () => { alpha = Math.max(alpha, 0.6); };
  // interaction: drag to move, tap two people to link them
  let dragging = null, downAt = null;
  tick();
  const toSvg = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  svg.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.node');
    downAt = { x: e.clientX, y: e.clientY, el };
    if (!el) return;
    dragging = byId.get(el.dataset.id);
    try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  // Drop one person onto another to link them: the target glows while you hover it
  let dropTarget = null;
  const setDropTarget = (n) => {
    if (n === dropTarget) return;
    if (dropTarget) nodeLayer.querySelector(`[data-id="${CSS.escape(dropTarget.g.id)}"]`)?.classList.remove('drop-target');
    dropTarget = n;
    if (n) nodeLayer.querySelector(`[data-id="${CSS.escape(n.g.id)}"]`)?.classList.add('drop-target');
    nodeLayer.querySelector(`[data-id="${CSS.escape(dragging?.g.id || '')}"]`)?.classList.toggle('carrying', !!n);
  };
  // double-click / double-tap a bubble to open that person's card
  svg.addEventListener('dblclick', (e) => { const el = e.target.closest('.node'); if (el) { chooser.hidden = true; picked = null; drawNodes(); openPerson(el.dataset.id); } });
  svg.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = toSvg(e);
    dragging.p.x = p.x; dragging.p.y = p.y; dragging.p.vx = dragging.p.vy = 0;
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) {
      let best = null, bd = Infinity;
      nodes.forEach((n) => { if (n === dragging) return; const d = Math.hypot(n.p.x - p.x, n.p.y - p.y); if (d < (n.couple ? 30 : 25) && d < bd) { best = n; bd = d; } });
      setDropTarget(best);
    }
    reheat();
  });
  svg.addEventListener('pointerup', (e) => {
    const moved = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5;
    const el = downAt?.el, carried = dragging, target = dropTarget;
    setDropTarget(null);
    nodeLayer.querySelector('.carrying')?.classList.remove('carrying');
    dragging = null; downAt = null;
    if (moved && carried && target) {
      // ease the dropped bubble off its target so both stay visible, then ask how they relate
      const dx = carried.p.x - target.p.x, dy = carried.p.y - target.p.y, d = Math.hypot(dx, dy) || 1;
      carried.p.vx = (dx / d) * 6; carried.p.vy = (dy / d) * 6 || -6;
      reheat();
      picked = null; drawNodes(); render();
      return openChooser(carried.g.id, target.g.id, e);
    }
    if (moved) return;
    const edgeEl = e.target.closest('.edge, .edge-hit');
    if (!el && edgeEl) { picked = null; drawNodes(); render(); openChooser(edgeEl.dataset.a, edgeEl.dataset.b, e); return; }
    if (!el) { picked = null; chooser.hidden = true; drawNodes(); render(); return; }
    const id = el.dataset.id;
    if (!picked || picked === id) { picked = picked === id ? null : id; chooser.hidden = true; drawNodes(); render(); return; }
    openChooser(picked, id, e);
  });

  function openChooser(a, b, e) {
    const A = byId.get(a).g, B = byId.get(b).g;
    const existing = linkFor(a, b);
    chooser.innerHTML = `
      <div class="gc-names">${esc(A.name.split(' ')[0])} &amp; ${esc(B.name.split(' ')[0])}</div>
      <div class="gc-btns">
        <button data-type="together" class="${existing?.type === 'together' ? 'on' : ''}">Sit together</button>
        <button data-type="apart" class="${existing?.type === 'apart' ? 'on' : ''}">Keep apart</button>
        ${existing ? '<button data-type="none">Remove link</button>' : ''}
      </div>`;
    const r = wrap.getBoundingClientRect();
    chooser.style.left = Math.min(e.clientX - r.left, r.width - 254) + 'px';
    chooser.style.top = Math.max(8, e.clientY - r.top - 90) + 'px';
    chooser.hidden = false;
    chooser.querySelectorAll('[data-type]').forEach((btn) => btn.onclick = () => {
      const type = btn.dataset.type;
      if (type === 'none') { chooser.hidden = true; picked = null; drawNodes(); return removeLink(a, b); }
      state.links = state.links.filter((l) => key(l.a, l.b) !== key(a, b));
      if (type !== 'none') state.links.push({ a, b, type });
      commit({ silent: true });
      picked = null; chooser.hidden = true;
      drawNodes(); drawEdges(); render(); reheat();
      toast(type === 'none' ? 'Unlinked' : type === 'together' ? `${A.name.split(' ')[0]} & ${B.name.split(' ')[0]} sit together` : `${A.name.split(' ')[0]} & ${B.name.split(' ')[0]} kept apart`);
    });
  }

  // Suggested links: review first, then add the ones you keep
  const sug = host.querySelector('.graph-suggest');
  host.querySelector('#suggestBtn').onclick = () => {
    const list = suggestLinks(guests);
    if (!list.length) { sug.hidden = true; return toast('Nothing new to suggest'); }
    const first = (id) => esc(byId.get(id).g.name.split(' ')[0]);
    const who = (s) => (s.ids.length === 2 ? `${esc(byId.get(s.ids[0]).g.name)} &amp; ${esc(byId.get(s.ids[1]).g.name)}`
      : `${s.ids.slice(0, 3).map(first).join(', ')}${s.ids.length > 3 ? ` +${s.ids.length - 3}` : ''}`);
    const total = (items) => items.reduce((n, s) => n + s.pairs.length, 0);
    const addLabel = (items) => { const n = total(items); return n ? `Add ${n} link${n === 1 ? '' : 's'}` : 'Add'; };
    sug.innerHTML = `
      <div class="gs-head"><b>Sit together?</b><button class="x" data-gs-close aria-label="Close">×</button></div>
      <ul>${list.map((s, i) => `<li style="animation-delay:${Math.min(i, 12) * 30}ms"><label${s.ids.length > 2 ? ' class="grp"' : ''}><input type="checkbox" checked data-i="${i}"/><span>${who(s)}</span><em>${s.ids.length > 2 ? `${s.why} · ${s.ids.length}` : s.why}</em></label></li>`).join('')}</ul>
      <div class="gs-btns"><button class="btn moss sm" data-gs-add>${addLabel(list)}</button><button class="btn line sm" data-gs-close>Not now</button></div>`;
    sug.hidden = false;
    sug.classList.remove('in'); void sug.offsetWidth; sug.classList.add('in');
    const addBtn = sug.querySelector('[data-gs-add]');
    const picks = () => [...sug.querySelectorAll('input:checked')].map((c) => list[+c.dataset.i]);
    sug.querySelectorAll('input').forEach((c) => c.onchange = () => { const p = picks(); addBtn.textContent = addLabel(p); addBtn.disabled = !p.length; });
    sug.querySelectorAll('[data-gs-close]').forEach((b) => b.onclick = () => { sug.hidden = true; });
    addBtn.onclick = () => {
      const chosen = picks().flatMap((s) => s.pairs.map(([a, b]) => ({ a, b })));
      if (!chosen.length) return;
      const before = state.links.slice();
      chosen.forEach((l) => state.links.push({ a: l.a, b: l.b, type: 'together' }));
      commit({ silent: true });
      sug.hidden = true;
      drawEdges(); render(); reheat();
      toast(`${chosen.length} link${chosen.length === 1 ? '' : 's'} added`, { undo: () => { state.links = before; commit({ silent: true }); drawEdges(); render(); } });
    };
  };

  // stop animating when the page changes
  addEventListener('hashchange', () => cancelAnimationFrame(raf), { once: true });
  return { clearAll: () => undoable('Connections cleared', () => { state.links = []; }, toast) };
}

export function stopConnections() { cancelAnimationFrame(raf); }
