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

const key = (a, b) => [a, b].sort().join('|');
// Layout: one column per side (Betel · Both · Carter), the couple centred at the top,
// family higher up, friends and colleagues lower down; each group sits on its own small ring.
const COL = { Betel: 0.2, Both: 0.5, Carter: 0.8 };
const TIER = { Parent: 0.3, 'Close relative': 0.38, Relative: 0.46, Bridesmaid: 0.58, Groomsman: 0.58, 'Close friend': 0.66, Friend: 0.74, 'Plus-one': 0.8, '': 0.8, Colleague: 0.88 };
let rejectedLinks = new Set(); // suggestions she said no to (this visit)
const relKey = (r) => (r || 'none').toLowerCase().replace(/[^a-z]+/g, '-');

const GROUP_CAP = 10; // a table's worth: bigger wedding parties are suggested as several groups

/**
 * Obvious 'together' suggestions not already covered by existing links:
 * the bridesmaids (and groomsmen) as ONE group each, plus household, plus-one and parent↔couple pairs.
 * Each item: { ids, why, pairs: [[a, b]…] } — pairs are the links it would add (a group = a ring of links).
 */
export function suggestLinks(guests) {
  // union-find over current 'together' links, so people already grouped aren't suggested again
  const parent = new Map(guests.map((g) => [g.id, g.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const join = (a, b) => parent.set(find(a), find(b));
  (state.links || []).filter((l) => ['together', 'like', 'love'].includes(l.type) && parent.has(l.a) && parent.has(l.b)).forEach((l) => join(l.a, l.b));
  const apart = new Set((state.links || []).filter((l) => l.type === 'apart').map((l) => key(l.a, l.b)));
  const out = [];
  const direct = new Set((state.links || []).map((l) => key(l.a, l.b)));
  const suggest = (members, why) => {
    const m = members.filter(Boolean);
    if (m.length < 2 || m.every((g) => find(g.id) === find(m[0].id))) return;
    const pairs = [];
    const tryPair = (a, b) => { const k = key(a.id, b.id); if (!apart.has(k) && !rejectedLinks.has(k) && !direct.has(k)) { pairs.push([a.id, b.id]); direct.add(k); } };
    // a group is fully connected: everyone is linked to everyone
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) tryPair(m[i], m[j]);
    m.slice(1).forEach((g) => join(m[0].id, g.id));
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
  const hostW = Math.max(320, host.clientWidth || 900), many = guests.length > 25;
  // ~100 people need room: the canvas grows with the list (phones scroll sideways inside the graph) and the people push each other further apart
  const W = many ? Math.max(hostW, Math.min(1100, 320 + guests.length * 6)) : hostW;
  const H = many ? Math.min(1100, Math.max(420, Math.round(W * 0.62), 240 + guests.length * 6.5)) : Math.min(640, Math.max(420, Math.round(W * 0.62)));
  const REP = many ? 1900 : 1100, RANGE = many ? 260 : 220, MINGAP = many ? 34 : 26;
  host.innerHTML = `
    <div class="graph-wrap">
      <div class="graph-legend">
        <span><i style="background:${SIDE_COLOR.Betel}"></i>Betel</span><span><i style="background:${SIDE_COLOR.Carter}"></i>Carter</span><span><i style="background:${SIDE_COLOR.Both}"></i>Both</span>
        <span class="lg-ln"><span class="ln love"></span>Love · next to</span><span class="lg-ln"><span class="ln like"></span>Like · same table</span><span class="lg-ln"><span class="ln apart"></span>Apart</span>
        <span class="legend-tip">Drop one person on another to link · tap a line to edit</span>
        <button class="btn line sm suggest-btn" id="suggestBtn">Suggest links</button>
      </div>
      <div class="graph-scroll"><svg class="graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Guest connections"${W > hostW ? ` style="width:${W}px;max-width:none"` : ''}></svg></div>
      <div class="graph-choose" hidden></div>
      <div class="graph-suggest" hidden></div>

      <ul class="link-list"></ul>
    </div>`;
  const svg = host.querySelector('svg');
  const chooser = host.querySelector('.graph-choose');
  const wrap = host.querySelector('.graph-wrap');

  // nodes: every group (relation + side) gets its own spot and sits on a small ring there
  const clusterOf = (g) => (g.party === 'couple' ? 'couple' : relationOf(g) + '|' + g.side);
  const clusters = new Map();
  guests.forEach((g) => { const c = clusterOf(g); if (!clusters.has(c)) clusters.set(c, []); clusters.get(c).push(g.id); });
  const homeOf = (g) => {
    if (g.party === 'couple') return { x: W / 2 + (g.side === 'Carter' ? 42 : -42), y: H * 0.12 };
    const ids = clusters.get(clusterOf(g)), k = ids.length, i = ids.indexOf(g.id);
    const cx = (COL[g.side] ?? 0.5) * W, cy = (TIER[relationOf(g)] ?? 0.8) * H;
    if (k === 1) return { x: cx, y: cy };
    const r = k === 2 ? 30 : Math.max(44, (34 * k) / Math.PI), a = (i / k) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * (k === 2 ? 0 : 0.8) };
  };
  const nodes = guests.map((g) => {
    const home = homeOf(g);
    home.x = Math.max(40, Math.min(W - 40, home.x)); home.y = Math.max(24, Math.min(H - 34, home.y));
    let p = positions.get(g.id);
    if (!p) { p = { x: home.x, y: home.y, vx: 0, vy: 0 }; positions.set(g.id, p); }
    return { g, p, couple: g.party === 'couple', home, cluster: clusterOf(g), rel: g.party === 'couple' ? '' : relationOf(g) };
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
        <circle class="hit" r="18"/>
        ${n.g.photo ? `<clipPath id="ph-${n.g.id}"><circle r="12"/></clipPath><image class="ph" href="${n.g.photo}" x="-12" y="-12" width="24" height="24" clip-path="url(#ph-${n.g.id})"/>`
          : `<circle class="dot" r="${n.couple ? 8 : 6}" fill="${SIDE_COLOR[n.g.side] || SIDE_COLOR.Both}"/>`}
        <text class="nm" y="${n.g.photo ? 25 : 19}">${esc(n.g.name.split(' ')[0])}</text>
        ${n.rel ? `<text class="rl" y="${n.g.photo ? 37 : 31}">${esc(n.rel)}</text>` : ''}
      </g>`).join('');
  }
  let proposals = []; // suggested links, drawn dashed in the graph until accepted or skipped
  let hulls = [];
  function drawEdges() {
    edgeLayer.innerHTML = edges().map((l) => `<line class="edge-hit" data-a="${l.a}" data-b="${l.b}"/><line class="edge ${l.type}" data-a="${l.a}" data-b="${l.b}"/>${l.type === 'love' ? `<path class="eheart" data-a="${l.a}" data-b="${l.b}" d="M0 4.2C-7.5-.6-6.4-7.4 0-3.6 6.4-7.4 7.5-.6 0 4.2Z"/>` : ''}`).join('')
      + proposals.map((l, i) => `<line class="edge-hit" data-a="${l.a}" data-b="${l.b}" data-prop="${i}"/><line class="edge proposed" data-a="${l.a}" data-b="${l.b}" data-pi="${i}"/>`).join('');
    drawList();
  }
  // Every link, with a one-tap remove
  function drawList() {
    const list = host.querySelector('.link-list');
    if (!list) return;
    const ls = edges();
    const lede = document.querySelector('.page-head .lede'), n = state.links.length; // header counts every link: love, like and apart
    if (lede) lede.textContent = n ? `${n} connection${n === 1 ? '' : 's'} · used by Auto-seat` : 'Tap two people to link them';
    const listed = new Set([...list.querySelectorAll('[data-k]')].map((li) => li.dataset.k));
    const first = (id) => byId.get(id).g.name.split(' ')[0];
    list.innerHTML = ls.length
      ? ls.map((l, i) => `<li data-k="${key(l.a, l.b)}" class="${listed.has(key(l.a, l.b)) ? 'old' : ''}"><span class="dot-${l.type}"></span>${esc(first(l.a))} &amp; ${esc(first(l.b))}<span class="seg" role="group" aria-label="Relationship">${['love', 'like', 'apart'].map((t) => `<button type="button" class="seg-${t}" data-set="${t}" data-i="${i}" aria-pressed="${(l.type === 'together' ? 'like' : l.type) === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</span><button class="x" data-unlink="${i}" aria-label="Remove link">×</button></li>`).join('')
      : '<li class="empty">No links yet</li>';
    list.querySelectorAll('[data-set]').forEach((b) => b.onclick = () => {
      const l = ls[+b.dataset.i], type = b.dataset.set;
      if ((l.type === 'together' ? 'like' : l.type) === type) return;
      const before = state.links.slice();
      state.links = state.links.map((x) => (key(x.a, x.b) === key(l.a, l.b) ? { ...x, type } : x));
      commit({ silent: true });
      drawEdges(); render(); reheat();
      toast(`${first(l.a)} & ${first(l.b)}: ${type}`, { undo: () => { state.links = before; commit({ silent: true }); drawEdges(); render(); reheat(); } });
    });
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
        // nobody sits on top of anybody: a minimum distance (names stay readable)
        if (d2 < MINGAP * MINGAP) {
          const d = Math.sqrt(d2) || 1, push = ((MINGAP - d) / 2) * Math.min(1, k + 0.4);
          const ux = dx || dy ? dx / d : 1, uy = dx || dy ? dy / d : 0;
          a.x += ux * push; a.y += uy * push; b.x -= ux * push; b.y -= uy * push;
        }
        if (d2 > RANGE * RANGE) continue;
        const f = (REP / d2) * k;
        const d = Math.sqrt(d2); dx /= d; dy /= d;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
    }
    edges().forEach((l) => {
      const a = byId.get(l.a).p, b = byId.get(l.b).p;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const apart = l.type === 'apart', rest = apart ? 220 : l.type === 'love' ? 45 : 70, str = apart ? 0.012 : 0.05;
      const f = (d - rest) * str * k;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    });
    nodes.forEach((n) => {
      const p = n.p;
      p.vx += (n.home.x - p.x) * 0.007 * k; p.vy += (n.home.y - p.y) * 0.007 * k;
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
    edgeLayer.querySelectorAll('.grp').forEach((el) => {
      const ps = hulls[+el.dataset.h].ids.map((id) => byId.get(id).p);
      const x0 = Math.min(...ps.map((q) => q.x)) - 26, x1 = Math.max(...ps.map((q) => q.x)) + 26, y0 = Math.min(...ps.map((q) => q.y)) - 22, y1 = Math.max(...ps.map((q) => q.y)) + 34;
      el.setAttribute('x', x0); el.setAttribute('y', y0); el.setAttribute('width', x1 - x0); el.setAttribute('height', y1 - y0);
    });
    edgeLayer.querySelectorAll('.eheart').forEach((el) => {
      const a = byId.get(el.dataset.a).p, b = byId.get(el.dataset.b).p;
      el.setAttribute('transform', `translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2})`);
    });
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
    if (!el && edgeEl?.dataset.prop != null) { picked = null; drawNodes(); return openProposal(+edgeEl.dataset.prop, e); }
    if (!el && edgeEl) { picked = null; drawNodes(); render(); openChooser(edgeEl.dataset.a, edgeEl.dataset.b, e); return; }
    if (!el) { picked = null; chooser.hidden = true; drawNodes(); render(); return; }
    const id = el.dataset.id;
    if (!picked || picked === id) { picked = picked === id ? null : id; chooser.hidden = true; drawNodes(); render(); if (picked) openPicker(picked, e); return; }
    openChooser(picked, id, e);
  });

  // tap a person: pick who to link them with from a list (or tap another bubble)
  function openPicker(a, e) {
    const A = byId.get(a).g;
    chooser.innerHTML = `<div class="gc-names">${esc(A.name.split(' ')[0])} &rarr;</div>
      <select class="gc-pick" aria-label="Link ${esc(A.name)} with"><option value="">Link with…</option>${nodes.filter((n) => n.g.id !== a).map((n) => `<option value="${n.g.id}">${esc(n.g.name)}</option>`).join('')}</select>`;
    place(chooser, e); chooser.hidden = false;
    chooser.querySelector('select').onchange = (ev) => { if (ev.target.value) openChooser(a, ev.target.value, e); };
  }
  function openChooser(a, b, e) {
    const A = byId.get(a).g, B = byId.get(b).g;
    const existing = linkFor(a, b);
    chooser.innerHTML = `
      <div class="gc-names">${esc(A.name.split(' ')[0])} &amp; ${esc(B.name.split(' ')[0])}</div>
      <div class="gc-btns">
        <button data-type="love" class="${existing?.type === 'love' ? 'on' : ''}" title="Sit next to each other">Love</button>
        <button data-type="like" class="${['like', 'together'].includes(existing?.type) ? 'on' : ''}" title="Same table">Like</button>
        <button data-type="apart" class="${existing?.type === 'apart' ? 'on' : ''}" title="Different tables">Apart</button>
        ${existing ? '<button data-type="none">Remove link</button>' : ''}
      </div>`;
    const r = wrap.getBoundingClientRect();
    chooser.style.left = Math.min(e.clientX - r.left, r.width - 254) + 'px';
    chooser.style.top = Math.max(8, e.clientY - r.top - 90) + 'px';
    chooser.hidden = false;
    chooser.querySelectorAll('[data-type]').forEach((btn) => btn.onclick = () => {
      const type = btn.dataset.type;
      if (type === 'none') { chooser.hidden = true; picked = null; drawNodes(); return removeLink(a, b); }
      const before = state.links.slice();
      state.links = state.links.filter((l) => key(l.a, l.b) !== key(a, b));
      if (type !== 'none') state.links.push({ a, b, type });
      commit({ silent: true });
      picked = null; chooser.hidden = true;
      drawNodes(); drawEdges(); render(); reheat();
      toast(`${A.name.split(' ')[0]} & ${B.name.split(' ')[0]}: ${type}`, { undo: () => { state.links = before; commit({ silent: true }); drawEdges(); render(); reheat(); } });
    });
  }

  // Suggested links appear IN the graph as dashed lines; accept or skip each one (or all of them)
  const sug = host.querySelector('.graph-suggest');
  const nm = (id) => esc(byId.get(id).g.name.split(' ')[0]);
  const place = (el, e) => { const r = wrap.getBoundingClientRect(); el.style.left = Math.min(e.clientX - r.left, r.width - 254) + 'px'; el.style.top = Math.max(8, e.clientY - r.top - 90) + 'px'; };
  function drawSuggest() {
    if (!proposals.length) { sug.hidden = true; return; }
    sug.innerHTML = `
      <div class="gs-head"><b>${proposals.length} suggested</b><button class="x" data-gs-close aria-label="Close">×</button></div>
      <ul>${proposals.map((l, i) => `<li data-i="${i}"><span>${nm(l.a)} – ${nm(l.b)}</span><em>${esc(l.why)}</em><button class="gs-ok" data-ok="${i}" aria-label="Add this link" title="Add">✓</button><button class="gs-no" data-no="${i}" aria-label="Skip this link" title="Skip">✕</button></li>`).join('')}</ul>
      <div class="gs-btns"><button class="btn moss sm" data-gs-all>Accept all</button><button class="btn line sm" data-gs-close>Dismiss</button></div>`;
    sug.hidden = false;
    const hl = (i, on) => edgeLayer.querySelector(`[data-pi="${i}"]`)?.classList.toggle('hl', on);
    sug.querySelectorAll('li[data-i]').forEach((li) => { li.onmouseenter = () => hl(li.dataset.i, true); li.onmouseleave = () => hl(li.dataset.i, false); });
    sug.querySelectorAll('[data-ok]').forEach((b) => b.onclick = () => accept(+b.dataset.ok));
    sug.querySelectorAll('[data-no]').forEach((b) => b.onclick = () => skip(+b.dataset.no));
    sug.querySelector('[data-gs-all]').onclick = acceptAll;
    sug.querySelectorAll('[data-gs-close]').forEach((b) => b.onclick = () => { proposals = []; drawEdges(); render(); drawSuggest(); });
  }
  function accept(i) {
    const l = proposals[i]; if (!l) return;
    state.links.push({ a: l.a, b: l.b, type: 'like' });
    proposals.splice(i, 1); commit({ silent: true });
    chooser.hidden = true; drawEdges(); render(); reheat(); drawSuggest();
  }
  function skip(i) {
    const l = proposals[i]; if (!l) return;
    rejectedLinks.add(key(l.a, l.b)); proposals.splice(i, 1);
    chooser.hidden = true; drawEdges(); render(); drawSuggest();
  }
  function acceptAll() {
    const before = state.links.slice(), n = proposals.length;
    proposals.forEach((l) => state.links.push({ a: l.a, b: l.b, type: 'like' }));
    proposals = []; commit({ silent: true });
    drawEdges(); render(); reheat(); drawSuggest();
    toast(`${n} link${n === 1 ? '' : 's'} added`, { undo: () => { state.links = before; commit({ silent: true }); drawEdges(); render(); } });
  }
  function openProposal(i, e) {
    const l = proposals[i]; if (!l) return;
    chooser.innerHTML = `<div class="gc-names">${nm(l.a)} &amp; ${nm(l.b)}</div><div class="gc-why">${esc(l.why)}</div>
      <div class="gc-btns"><button data-acc>Add link</button><button data-skip>Skip</button></div>`;
    place(chooser, e); chooser.hidden = false;
    chooser.querySelector('[data-acc]').onclick = () => accept(i);
    chooser.querySelector('[data-skip]').onclick = () => skip(i);
  }
  host.querySelector('#suggestBtn').onclick = () => {
    proposals = suggestLinks(guests).flatMap((s) => s.pairs.map(([a, b]) => ({ a, b, why: s.why })));
    drawEdges(); render(); drawSuggest();
    if (!proposals.length) toast('Nothing new to suggest');
  };

  // stop animating when the page changes
  addEventListener('hashchange', () => cancelAnimationFrame(raf), { once: true });
  return { clearAll: () => undoable('Connections cleared', () => { state.links = []; }, toast) };
}

export function stopConnections() { cancelAnimationFrame(raf); }
