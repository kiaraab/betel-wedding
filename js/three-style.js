// The optional looks for the 3D scenes (see js/style-options.js for the choices). All procedural: merged vertex-coloured geometry, instancing,
// a handful of draw calls each. Built from the Pinterest board's palette. Units: feet. Loaded by js/three-view.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const C = {
  moss: '#4F5B2E', mossLt: '#6B7A3A', sage: '#A8B38A', sageLt: '#C9CFAE', wine: '#5A1426', wineLt: '#7A1F36', plum: '#3B1C24',
  choc: '#3E2A22', ivory: '#F1EBDD', cream: '#E8DFCB', brass: '#B8923F', rust: '#8A4A3A', fig: '#5b2a3c', blush: '#D9A3A8', ink: '#14120F',
};
const GREENS = ['#5d6a35', '#6f7a45', '#4b522b', '#7d8a4c', '#8d9a5c'];
const U = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 10), sph: new THREE.SphereGeometry(1, 7, 5), cone: new THREE.ConeGeometry(1, 1, 6) };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
/** A unit primitive, scaled / rotated / moved and painted one colour (same helper as three-view's). */
export function part(kind, color, [x, y, z], [sx, sy, sz], [rx = 0, ry = 0, rz = 0] = []) {
  const g = U[kind].clone();
  g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
  _c.set(color);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const rngOf = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const merged = (parts) => { const g = mergeGeometries(parts); parts.forEach((p) => p.dispose()); return g; };
const vcMat = (rough = 0.85) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough });
const mesh = (parts, rough, shadow = false) => { const m = new THREE.Mesh(merged(parts), vcMat(rough)); m.castShadow = shadow; return m; };

/* ---------- ceremony ---------- */

/** The two chiffon materials the ceremony swags alternate between. */
export function canopyMats(kind) {
  const spec = kind === 'ivory' ? [[C.ivory, '#2a2418'], [C.cream, '#2a2418']] : kind === 'wine' ? [[C.wineLt, '#2a0a12'], [C.sage, '#2a3018']] : [['#a9b38a', '#2a3018'], ['#efe8d4', '#2a3018']];
  return spec.map(([color, emissive], i) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.3, roughness: 0.9, transparent: true, opacity: kind === 'wine' && i === 0 ? 0.5 : 0.62, side: THREE.DoubleSide, depthWrite: false }));
}

/** Aisle: 'runner' = a long cream runner with edge bands; 'petals' = scattered petals. `a` = the aisle area {w, h}; the mesh is centred on the origin of the returned group. */
export function aisleDecor(kind, a) {
  const g = new THREE.Group();
  if (kind === 'runner') {
    const w = a.w * 0.74;
    g.add(mesh([part('box', C.ivory, [0, 0.12, 0], [w, 0.1, a.h]), part('box', C.cream, [-w / 2 + 0.12, 0.17, 0], [0.24, 0.06, a.h]), part('box', C.cream, [w / 2 - 0.12, 0.17, 0], [0.24, 0.06, a.h]),
      part('box', C.brass, [0, 0.17, -a.h / 2 + 0.2], [w, 0.05, 0.14]), part('box', C.brass, [0, 0.17, a.h / 2 - 0.2], [w, 0.05, 0.14])], 0.95));
  } else if (kind === 'petals') {
    const N = Math.round(a.h * 9), inst = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 3), new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
    const rnd = rngOf(31), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(), COL = [C.ivory, C.ivory, C.cream, C.blush, C.wineLt, C.ivory];
    for (let i = 0; i < N; i++) {
      const s = 0.7 + rnd() * 0.6;
      M.compose(P.set((rnd() + rnd() - 1) * a.w * 0.44, 0.1 + rnd() * 0.04, (rnd() - 0.5) * a.h), Q.setFromEuler(E.set((rnd() - 0.5) * 0.5, rnd() * 6.3, (rnd() - 0.5) * 0.5)), S.set(0.22 * s, 0.03, 0.15 * s));
      inst.setMatrixAt(i, M); inst.setColorAt(i, _c.set(COL[Math.floor(rnd() * COL.length)]));
    }
    g.add(inst);
  }
  return g;
}

/** Backdrop behind the altar, inside the pergola. ctx = { X, Z, pg (pergola decor), greenStrands }. Returns a group, or null. */
export function backdrop(kind, ctx) {
  const { X, Z, pg, greenStrands } = ctx, g = new THREE.Group(), cx = X(pg.x + pg.w / 2), rnd = rngOf(kind === 'willow' ? 41 : 43);
  if (kind === 'willow') { // a tunnel of arching willow ribs over the altar, hung with leaves
    const n = 7, rx = 8.6, ry = 9.3, ribs = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.13, 5, 18, Math.PI), new THREE.MeshStandardMaterial({ color: '#4a4426', roughness: 1 }), n);
    const clumps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95 }), n * 11), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), anchors = [];
    let k = 0;
    for (let i = 0; i < n; i++) {
      const z = Z(pg.y + 0.4 + i * ((pg.h - 1) / (n - 1)));
      M.compose(P.set(cx, 0, z), Q.identity(), S.set(rx, ry, 1)); ribs.setMatrixAt(i, M);
      for (let j = 1; j <= 11; j++) {
        const a = (j / 12) * Math.PI, x = cx + Math.cos(a) * rx, y = Math.sin(a) * ry, r = 0.8 + rnd() * 0.7;
        M.compose(P.set(x, y, z + (rnd() - 0.5) * 0.4), Q.identity(), S.set(r, r * 0.7, r)); clumps.setMatrixAt(k, M); clumps.setColorAt(k++, _c.set(pick(rnd, GREENS)));
        if (y > 4.2) anchors.push([x, y - 0.3, z]);
      }
    }
    g.add(ribs, clumps, greenStrands(anchors, 17, 3.8));
  } else if (kind === 'vine') { // a wall of hanging strands from a beam across the back of the pergola
    const zV = Z(Math.max(0.6, pg.y - 0.9)), half = Math.min(pg.w / 2 - 1, 16), anchors = [];
    g.add(mesh([part('box', '#3b3a20', [cx, 14.4, zV], [half * 2 + 1, 0.5, 0.6]), part('cyl', '#3b3a20', [cx - half - 0.4, 7.2, zV], [0.3, 14.4, 0.3]), part('cyl', '#3b3a20', [cx + half + 0.4, 7.2, zV], [0.3, 14.4, 0.3])], 1, true));
    for (let x = -half, i = 0; x <= half; x += 0.7, i++) { anchors.push([cx + x, 14.1, zV + 0.15]); if (i % 2 === 0) anchors.push([cx + x + 0.35, 14.1, zV - 0.2]); }
    g.add(greenStrands(anchors, 29, 11));
  } else if (kind === 'moss') { // a moss-covered oval portal with a few cream blooms, standing behind the arch
    const z = Z(Math.max(0.6, pg.y - 0.9)), rx = 6.4, ry = 5.8, cy = 6.6, parts = [];
    for (let k = 0; k < 130; k++) {
      const a = (k / 130) * Math.PI * 2, r = 0.55 + rnd() * 0.55, j = (rnd() - 0.5) * 0.5;
      parts.push(part('sph', pick(rnd, [C.moss, C.mossLt, '#5d6a35', '#7d8a4c']), [cx + Math.cos(a) * (rx + j), cy + Math.sin(a) * (ry + j), z + (rnd() - 0.5) * 0.7], [r, r * 0.8, r * 0.9]));
      if (k % 9 === 0) parts.push(part('sph', k % 18 ? C.ivory : C.wineLt, [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z + 0.7], [0.26, 0.22, 0.26]));
    }
    [-1, 1].forEach((sd) => { for (let k = 0; k < 7; k++) parts.push(part('sph', pick(rnd, [C.moss, C.mossLt]), [cx + sd * (rx + (rnd() - 0.2) * 1.8), 0.5 + rnd() * 0.5, z + (rnd() - 0.5)], [0.9 + rnd() * 0.5, 0.6, 0.9])); });
    const m = mesh(parts, 1, true);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 36), new THREE.MeshStandardMaterial({ color: '#2c3520', transparent: true, opacity: 0.5, roughness: 1, side: THREE.DoubleSide, depthWrite: false }));
    fill.scale.set(rx, ry, 1); fill.position.set(cx, cy, z - 0.3);
    g.add(m, fill);
  } else return null;
  return g;
}

/** A low mound of blooms for the table centerpieces and arch feet, in the white or the cascading-amaranthus look. Returns parts to merge. */
export function mound(kind, cx, y, cz, R, H, seed) {
  const rnd = rngOf(seed), out = [], WHITES = ['#f6f2e8', C.ivory, '#ebe4d2', '#dfe5d0'];
  if (kind === 'white') { // hydrangea heads + upright tulips
    for (let k = 0; k < 10; k++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R, r = 0.26 + rnd() * 0.16;
      out.push(part('sph', pick(rnd, WHITES), [cx + Math.cos(a) * d, y + H * (1 - d / R) + r * 0.6, cz + Math.sin(a) * d], [r, r * 0.85, r]));
    }
    for (let k = 0; k < 9; k++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * 0.8, r = 0.12 + rnd() * 0.05, top = y + H * (1 - d / R) + 0.55 + rnd() * 0.25;
      out.push(part('cyl', C.mossLt, [cx + Math.cos(a) * d, top - 0.3, cz + Math.sin(a) * d], [0.025, 0.6, 0.025]), part('sph', '#f6f2e8', [cx + Math.cos(a) * d, top, cz + Math.sin(a) * d], [r, r * 1.6, r]));
    }
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + rnd(), d = R * 0.85; out.push(part('cone', k % 2 ? '#7d8a4c' : '#8d9a5c', [cx + Math.cos(a) * d, y + 0.28, cz + Math.sin(a) * d], [0.14, 1.0, 0.14], [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25])); }
  } else { // amaranthus: a leafy base and long wine ropes spilling over the cloth
    for (let k = 0; k < 8; k++) { const a = rnd() * Math.PI * 2, d = rnd() * R * 0.6, r = 0.22 + rnd() * 0.12; out.push(part('sph', pick(rnd, [C.moss, C.mossLt, '#5d6a35']), [cx + Math.cos(a) * d, y + H * 0.5 + rnd() * 0.15, cz + Math.sin(a) * d], [r, r * 0.8, r])); }
    for (let k = 0; k < 5; k++) { const a = rnd() * Math.PI * 2, d = rnd() * R * 0.35; out.push(part('sph', pick(rnd, [C.wine, C.wineLt]), [cx + Math.cos(a) * d, y + H * 0.85, cz + Math.sin(a) * d], [0.18, 0.16, 0.18])); }
    const ropes = 9;
    for (let k = 0; k < ropes; k++) {
      const a = (k / ropes) * Math.PI * 2 + rnd() * 0.4;
      for (let j = 0; j <= 6; j++) {
        const t = j / 6, d = R * 0.35 + t * R * 1.5, r = 0.1 + (1 - t) * 0.04;
        out.push(part('sph', pick(rnd, [C.wine, C.wineLt, C.wine, C.rust]), [cx + Math.cos(a) * d, y + H * 0.85 * (1 - t * t) + 0.1, cz + Math.sin(a) * d], [r, r, r]));
      }
    }
  }
  return out;
}

/** Floral arch in a different style (the default 'garden' mix stays in three-view). Faces +z, centred on x = 0, standing on y = 0. Returns one merged geometry. */
export function archVariant(kind, R, seed) {
  const rnd = rngOf(seed), parts = [], top = R + 1.2, urn = (sd) => parts.push(part('cyl', '#cfc7b4', [sd * R, 1.0, 0], [0.55, 2.0, 0.55]), part('cyl', '#e0d8c4', [sd * R, 2.15, 0], [0.8, 0.3, 0.8]));
  const on = (a, jr, jy) => [Math.cos(a) * (R + jr), 1.4 + Math.sin(a) * (top - 1.4) + jy];
  if (kind === 'tulip') {
    const WH = ['#f6f2e8', C.ivory, '#ebe4d2', '#f6f2e8', '#dfe5d0'];
    for (let k = 0; k < 56; k++) {
      const [x, y] = on((k / 55) * Math.PI, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4);
      parts.push(part('sph', k % 3 ? '#6f7a45' : '#8d9a5c', [x, y, (rnd() - 0.5) * 0.5], [0.34, 0.28, 0.3]));
      if (k % 2 === 0) { const r = 0.17 + rnd() * 0.08; parts.push(part('sph', pick(rnd, WH), [x + (rnd() - 0.5) * 0.3, y + 0.2, 0.3 + rnd() * 0.3], [r * 0.8, r * 1.5, r * 0.8], [0, 0, (rnd() - 0.5) * 0.6])); }
    }
    [[-1, 0.76, 9], [1, 0.28, 6]].forEach(([sd, a, n]) => { // tulips cascading down from the top corners
      const [x0, y0] = on(a * Math.PI, 0, 0);
      for (let j = 0; j < n; j++) {
        const x = x0 + sd * 0.45 + Math.sin(j * 1.3 + a * 5) * 0.35, y = y0 - j * 0.78, r = 0.2 + rnd() * 0.07;
        parts.push(part('sph', pick(rnd, WH), [x, y, 0.45 + rnd() * 0.25], [r * 0.8, r * 1.55, r * 0.8], [0, 0, sd * 0.25]), part('cone', '#7d8a4c', [x + 0.05, y + 0.1, 0.3], [0.08, 0.7, 0.08], [0, 0, -sd * 0.5]));
      }
    });
    [-1, 1].forEach((sd, s) => { urn(sd); parts.push(...mound('white', sd * R, 2.3, 0, 1.5, 1.1, seed + s * 13), ...mound('white', sd * (R + 1.1), 0.1, 0.5, 2.0, 1.2, seed + 40 + s)); });
  } else if (kind === 'dahlia') {
    const DAH = [C.wine, C.wineLt, C.wine, C.plum, '#8c2a3a'], LEAF = [C.mossLt, C.moss, C.rust, '#7d8a4c'];
    for (let k = 0; k < 70; k++) { // sparse foliage all round, the dahlias heavy up the left side and over the top
      const a = (k / 69) * Math.PI, [x, y] = on(a, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5), left = a > Math.PI * 0.45 ? 1 : 0.18;
      if (k % 2 === 0) parts.push(part('sph', pick(rnd, LEAF), [x, y, (rnd() - 0.5) * 0.6], [0.4, 0.3, 0.3]));
      if (rnd() < left * 0.75) { const r = 0.3 + rnd() * 0.24; parts.push(part('sph', pick(rnd, DAH), [x + (rnd() - 0.5) * 0.3, y + 0.2, 0.35 + rnd() * 0.3], [r, r * 0.8, r])); }
    }
    for (let k = 0; k < 12; k++) { const [x, y] = on((0.62 + rnd() * 0.2) * Math.PI, 0.35, (rnd() - 0.5) * 0.7), r = 0.42 + rnd() * 0.26; parts.push(part('sph', pick(rnd, DAH), [x, y, 0.6 + rnd() * 0.3], [r, r * 0.8, r])); }
    urn(-1); urn(1);
    parts.push(...mound('amaranthus', -R, 2.3, 0, 1.5, 1.1, seed), ...mound('amaranthus', -(R + 1.1), 0.1, 0.5, 2.0, 1.2, seed + 40)); // the weight is on the left foot
    for (let k = 0; k < 6; k++) parts.push(part('cone', pick(rnd, LEAF), [R + 0.3 + rnd() * 0.6, 2.5, (rnd() - 0.5) * 0.5], [0.14, 1.2, 0.14], [0, 0, -0.3 - rnd() * 0.5]));
  } else if (kind === 'calla') { // two tall columns of calla lilies, one at each foot
    [-1, 1].forEach((sd, s) => {
      const x0 = sd * R;
      parts.push(part('cyl', C.mossLt, [x0, 4.8, 0], [0.13, 9.2, 0.13]));
      for (let k = 0; k < 24; k++) {
        const t = k / 23, y = 2.0 + t * 7.4, ang = k * 2.2 + s, x = x0 + Math.cos(ang) * 0.38 * (1 - t * 0.4), z = Math.sin(ang) * 0.34;
        parts.push(part('cone', C.ivory, [x, y, z], [0.42 - t * 0.08, 1.1, 0.42 - t * 0.08], [Math.PI + Math.sin(ang) * 0.3, 0, Math.cos(ang) * 0.3]), part('cyl', C.brass, [x, y + 0.3, z], [0.05, 0.3, 0.05]));
      }
      for (let k = 0; k < 9; k++) parts.push(part('cone', pick(rnd, [C.moss, C.mossLt]), [x0 + (rnd() - 0.5) * 1.1, 2.4, (rnd() - 0.5) * 0.9], [0.16, 2.0 + rnd() * 1.4, 0.16], [(rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.9]));
      urn(sd);
      for (let k = 0; k < 9; k++) { const a = rnd() * 6.3, d = rnd() * 1.4; parts.push(part('cone', C.ivory, [x0 + Math.cos(a) * d, 0.55 + rnd() * 0.4, Math.sin(a) * d * 0.7], [0.26, 0.7, 0.26], [Math.PI + (rnd() - 0.5) * 0.7, 0, (rnd() - 0.5) * 0.7]), part('sph', C.mossLt, [x0 + Math.cos(a) * d * 1.2, 0.25, Math.sin(a) * d], [0.5, 0.25, 0.5])); }
    });
  }
  return merged(parts);
}

/* ---------- reception ---------- */

/** Candles in the chosen look. list = [[x, z, height]]; pushes parts + flame tips and the flame positions (for the glow halos). 'taper' is the default and lives in three-view. */
export function candleSet(kind, list, y, parts, tips, tipAt) {
  list.forEach(([x, z, hh]) => {
    if (kind === 'glass') { // a glass pillar on a little bed of moss
      const gh = Math.max(0.5, hh * 0.42), top = y + 0.1 + gh;
      parts.push(part('cyl', C.moss, [x, y + 0.05, z], [0.66, 0.1, 0.66]), part('sph', C.mossLt, [x + 0.3, y + 0.14, z + 0.12], [0.2, 0.12, 0.2]), part('sph', C.mossLt, [x - 0.27, y + 0.13, z - 0.18], [0.22, 0.12, 0.22]),
        part('cyl', '#cddccf', [x, y + 0.1 + gh / 2, z], [0.3, gh, 0.3]), part('cyl', C.ivory, [x, top - 0.02, z], [0.24, 0.05, 0.24]));
      tips.push(part('sph', '#fff', [x, top + 0.1, z], [0.07, 0.14, 0.07])); tipAt.push([x, top + 0.2, z]);
    } else { // brass candelabra with three tapers, fruit at its foot
      const H = hh * 0.75, st = y + 0.1 + H * 0.6;
      parts.push(part('cyl', C.brass, [x, y + 0.05, z], [0.45, 0.1, 0.45]), part('cyl', C.brass, [x, y + 0.1 + H * 0.3, z], [0.07, H * 0.6, 0.07]), part('cyl', C.brass, [x, st, z], [0.34, 0.04, 0.04], [0, 0, Math.PI / 2]));
      [[0, 0.85], [-0.32, 0.6], [0.32, 0.6]].forEach(([dx, th]) => {
        parts.push(part('cyl', C.brass, [x + dx, st + 0.06, z], [0.1, 0.12, 0.1]), part('cyl', C.ivory, [x + dx, st + 0.12 + th / 2, z], [0.065, th, 0.065]));
        tips.push(part('sph', '#fff', [x + dx, st + 0.12 + th + 0.12, z], [0.06, 0.13, 0.06])); tipAt.push([x + dx, st + 0.12 + th + 0.22, z]);
      });
      parts.push(part('sph', C.wine, [x + 0.5, y + 0.2, z + 0.2], [0.2, 0.2, 0.2]), part('sph', C.fig, [x - 0.42, y + 0.17, z + 0.3], [0.17, 0.2, 0.17]), part('sph', '#8a9a4a', [x + 0.1, y + 0.2, z - 0.5], [0.18, 0.26, 0.18]),
        part('sph', '#C27A4A', [x - 0.32, y + 0.14, z - 0.4], [0.15, 0.14, 0.15]), part('sph', C.plum, [x + 0.52, y + 0.09, z - 0.3], [0.08, 0.08, 0.08]), part('sph', C.plum, [x + 0.62, y + 0.09, z - 0.22], [0.08, 0.08, 0.08]));
    }
  });
}

/** White-linen table garland: leaves with a few cream blooms along the edge of a round table (r) or the long edges of a rect one (L x D). */
export function garland(shape, size, y) {
  const rnd = rngOf(97), out = [], leaf = (x, z, ang) => out.push(part('sph', pick(rnd, GREENS), [x, y + 0.06, z], [0.22, 0.07, 0.12], [0, ang, 0]));
  if (shape === 'round') {
    const n = Math.max(18, Math.round(size * 7)), rr = size - 0.3;
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; leaf(Math.cos(a) * rr, Math.sin(a) * rr, -a + Math.PI / 2); if (k % 5 === 0) out.push(part('sph', k % 10 ? C.ivory : C.wineLt, [Math.cos(a) * rr, y + 0.12, Math.sin(a) * rr], [0.13, 0.1, 0.13])); }
  } else {
    const { L, D } = size, n = Math.round(L / 0.6);
    [-1, 1].forEach((sd) => { for (let k = 0; k <= n; k++) { const x = (k / n - 0.5) * (L - 0.6), z = sd * (D / 2 - 0.3); leaf(x, z, rnd() * 3); if (k % 5 === 2) out.push(part('sph', k % 2 ? C.ivory : C.wineLt, [x, y + 0.12, z], [0.13, 0.1, 0.13])); } });
  }
  return out;
}

/** Ceiling treatments for the ballroom (one object, added to the ceiling group so it vanishes when you look from above). ctx = { w, h, Z, WALL_H, greenStrands }. */
export function ceilingDecor(kind, ctx) {
  const { w, h, Z, WALL_H, greenStrands } = ctx, g = new THREE.Group();
  if (kind === 'drape') { // sheer sage chiffon radiating from a rosette over each half of the room
    const mat = new THREE.MeshStandardMaterial({ color: '#8f9d6c', emissive: '#2f3a1c', emissiveIntensity: 0.45, roughness: 0.9, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    [0.27, 0.73].forEach((f) => {
      const cz = Z(h * f), hw = w / 2 - 1.2, hh = h * 0.25 - 0.6, y0 = WALL_H - 0.5, y1 = 16.7, NA = 96, NR = 9, pos = [], idx = [];
      for (let j = 0; j <= NR; j++) for (let i = 0; i <= NA; i++) {
        const th = (i / NA) * Math.PI * 2, dx = Math.cos(th), dz = Math.sin(th), t = Math.min(hw / (Math.abs(dx) || 1e-6), hh / (Math.abs(dz) || 1e-6)), u = j / NR;
        pos.push(dx * t * u, y0 - (y0 - y1) * Math.pow(u, 1.15) + Math.sin(th * 28) * 0.26 * u, cz + dz * t * u);
      }
      for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) { const p = j * (NA + 1) + i; idx.push(p, p + 1, p + NA + 1, p + 1, p + NA + 2, p + NA + 1); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const sheet = new THREE.Mesh(geo, mat); sheet.renderOrder = 3; g.add(sheet);
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.2, 0.5, 20), new THREE.MeshStandardMaterial({ color: C.ivory, roughness: 0.8 })); rose.position.set(0, y0 - 0.1, cz); g.add(rose);
    });
  } else if (kind === 'greenery') { // a cloud of greenery over the whole room with strands hanging below
    const rnd = rngOf(61), N = 210, cloud = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95, emissive: '#3a4a22', emissiveIntensity: 0.55 }), N), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), anchors = [];
    for (let i = 0; i < N; i++) {
      const r = 1.0 + rnd() * 0.9, x = (rnd() - 0.5) * (w - 6), z = (rnd() - 0.5) * (h - 6), y = WALL_H - 1.3 + rnd() * 0.8;
      M.compose(P.set(x, y, z), Q.identity(), S.set(r * 1.2, r * 0.55, r * 1.2)); cloud.setMatrixAt(i, M); cloud.setColorAt(i, _c.set(pick(rnd, GREENS)));
      if (i % 2 === 0) anchors.push([x + (rnd() - 0.5), y - 0.4, z + (rnd() - 0.5)]);
    }
    g.add(cloud, greenStrands(anchors, 67, 3.4));
  } else return null;
  return g;
}

/* ---------- hangout / tasting ---------- */

/** Footprints (ft, half sizes) used to find each piece a clear spot on the plan. */
export const FOOT = { grazing: { hw: 9.5, hh: 3.6 }, bar: { hw: 6, hh: 7.5 }, drinks: { hw: 5.5, hh: 3.4 }, skee: { hw: 2.6, hh: 7 }, cars: { hw: 7.6, hh: 5.6 }, polaroid: { hw: 3.9, hh: 3 } };

const tableBox = (L, hgt, D, color = C.ivory) => { const m = new THREE.Mesh(new THREE.BoxGeometry(L, hgt, D), new THREE.MeshStandardMaterial({ color, roughness: 0.9 })); m.position.y = hgt / 2; m.castShadow = m.receiveShadow = true; return m; };

/** A hangout station, built around the origin facing +z. `label(text, opts)` is three-view's text sprite. */
export function station(kind, label) {
  const g = new THREE.Group(), rnd = rngOf(kind.length * 13 + 5);
  if (kind === 'grazing') {
    g.add(tableBox(16, 2.7, 3.6));
    const p = [], y = 2.7, piles = [['grape', C.plum, 0.15], ['apple', '#9c2a2a', 0.26], ['orange', '#d98a3a', 0.24], ['pear', '#a9b858', 0.24], ['fig', C.fig, 0.2], ['pom', C.wineLt, 0.28], ['grape', '#6b3a5a', 0.15], ['apple', '#c5483a', 0.26]];
    for (let i = 0; i < 8; i++) {
      const [, col, r] = piles[i], cx = -7 + i * 2, cz = i % 2 ? 0.75 : -0.75;
      for (let k = 0; k < 7; k++) { const a = rnd() * 6.3, d = rnd() * 0.65; p.push(part('sph', col, [cx + Math.cos(a) * d, y + r + (k > 4 ? r * 1.2 : 0), cz + Math.sin(a) * d], [r, r, r])); }
      p.push(part('cone', pick(rnd, GREENS), [cx + 0.55, y + 0.3, cz - 0.4], [0.13, 0.9, 0.13], [0.9, 0, 0.9]));
    }
    p.push(part('cyl', '#e6c36b', [-3.2, y + 0.2, -0.1], [0.6, 0.4, 0.6]), part('cyl', '#e6c36b', [4.3, y + 0.2, 0.05], [0.55, 0.4, 0.55]), part('box', '#b4813f', [-0.9, y + 0.2, 1.15], [1.3, 0.4, 0.5], [0, 0.3, 0]), part('box', '#b4813f', [2.3, y + 0.2, -1.2], [1.2, 0.4, 0.5], [0, -0.3, 0]));
    for (let k = 0; k < 22; k++) p.push(part('sph', k % 3 ? C.ivory : C.wineLt, [(rnd() - 0.5) * 15, y + 0.12, (rnd() - 0.5) * 3], [0.15, 0.12, 0.15]));
    for (let k = 0; k < 26; k++) p.push(part('cone', pick(rnd, GREENS), [(rnd() - 0.5) * 15.4, y + 0.1, (rnd() > 0.5 ? 1 : -1) * 1.55], [0.12, 0.9, 0.12], [(rnd() - 0.5) * 2, 0, 1.2 * (rnd() - 0.5)]));
    g.add(mesh(p, 0.8));
    const l = label('Grazing', { size: 1.2 }); l.position.set(0, 6, 0); g.add(l);
  } else if (kind === 'bar') {
    const ringGeo = (pts) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 36);
    const body = new THREE.Mesh(ringGeo([[2.7, 0], [4.2, 0], [4.2, 3.3], [2.7, 3.3]]), new THREE.MeshStandardMaterial({ color: C.moss, roughness: 0.7, side: THREE.DoubleSide }));
    const trim = new THREE.Mesh(ringGeo([[4.2, 1.1], [4.28, 1.1], [4.28, 1.25], [4.2, 1.25]]), new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.6, roughness: 0.4 }));
    const top = new THREE.Mesh(ringGeo([[2.6, 3.3], [4.6, 3.3], [4.6, 3.55], [2.6, 3.55]]), new THREE.MeshStandardMaterial({ color: C.ivory, roughness: 0.4, side: THREE.DoubleSide }));
    body.castShadow = top.castShadow = true; g.add(body, trim, top);
    // an arch of shelves behind the counter
    const sh = new THREE.Shape(), hole = new THREE.Path(), aw = 9.2, ah = 11;
    sh.moveTo(-aw / 2, 0); sh.lineTo(aw / 2, 0); sh.lineTo(aw / 2, ah - aw / 2); sh.absarc(0, ah - aw / 2, aw / 2, 0, Math.PI, false); sh.lineTo(-aw / 2, 0);
    const iw = aw - 1; hole.moveTo(-iw / 2, 0.4); hole.lineTo(-iw / 2, ah - aw / 2); hole.absarc(0, ah - aw / 2, iw / 2, Math.PI, 0, true); hole.lineTo(iw / 2, 0.4); hole.lineTo(-iw / 2, 0.4); sh.holes.push(hole);
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: C.choc, roughness: 0.6 }));
    frame.position.set(0, 0, -6.6); frame.castShadow = true; g.add(frame);
    const back = new THREE.Mesh(new THREE.ShapeGeometry(sh.clone()), new THREE.MeshStandardMaterial({ color: '#2c3520', roughness: 1 })); back.position.set(0, 0, -6.45); g.add(back);
    const p = [];
    [3.4, 6.0, 8.5].forEach((yy, r) => {
      p.push(part('box', C.brass, [0, yy, -6.2], [iw, 0.14, 0.9]));
      for (let k = 0; k < 7; k++) { const x = (k - 3) * (iw / 7.6) * (r === 2 ? 0.6 : 1), col = pick(rnd, [C.wine, C.mossLt, C.ivory, C.brass, C.choc]); p.push(part('cyl', col, [x, yy + 0.55, -6.2], [0.2, 0.8, 0.2]), part('cyl', col, [x, yy + 1.08, -6.2], [0.07, 0.35, 0.07])); }
    });
    g.add(mesh(p, 0.5));
    const l = label('Round bar', { size: 1.2, color: '#5a1426' }); l.position.set(0, 13.5, -6.2); g.add(l);
  } else if (kind === 'drinks') {
    g.add(tableBox(9, 2.7, 2.6));
    const p = [], y = 2.7, tints = ['#f0d98a', C.blush, '#cfd8b0'];
    tints.forEach((tint, i) => {
      const x = -2.6 + i * 2.2;
      p.push(part('cyl', C.brass, [x, y + 0.12, -0.2], [0.7, 0.25, 0.7]), part('cyl', tint, [x, y + 1.15, -0.2], [0.55, 1.8, 0.55]), part('cyl', C.brass, [x, y + 2.1, -0.2], [0.6, 0.12, 0.6]), part('box', C.brass, [x, y + 0.45, 0.4], [0.1, 0.1, 0.35]));
      for (let k = 0; k < 4; k++) p.push(part('cyl', k % 2 ? '#e69b3a' : '#f1d34a', [x + 0.9 + (k % 2) * 0.28, y + 0.04, 0.5 - Math.floor(k / 2) * 0.4], [0.22, 0.06, 0.22]));
    });
    for (let k = 0; k < 12; k++) p.push(part('cyl', '#e8efe6', [1.8 + (k % 6) * 0.42, y + 0.2, 0.75 - Math.floor(k / 6) * 0.45], [0.15, 0.4, 0.15]));
    p.push(part('cyl', C.wineLt, [-4.0, y + 0.3, 0.6], [0.22, 0.6, 0.22]), part('sph', C.wine, [-3.6, y + 0.2, 0.7], [0.2, 0.2, 0.2]));
    // an easel sign for the drinks menu
    p.push(part('box', C.choc, [3.6, y + 1.5, -0.6], [0.1, 3.2, 0.1], [0, 0, 0.18]), part('box', C.choc, [4.5, y + 1.5, -0.6], [0.1, 3.2, 0.1], [0, 0, -0.18]), part('box', C.ivory, [4.05, y + 1.75, -0.45], [1.9, 2.4, 0.1]),
      part('box', C.wineLt, [4.05, y + 2.55, -0.38], [1.5, 0.08, 0.03]), part('box', C.mossLt, [4.05, y + 1.8, -0.38], [1.4, 0.05, 0.03]), part('box', C.mossLt, [4.05, y + 1.4, -0.38], [1.4, 0.05, 0.03]));
    g.add(mesh(p, 0.5));
    const l = label('Signature drinks', { size: 1.1 }); l.position.set(0, 7, 0); g.add(l);
  }
  return g;
}

/** Guest extras, built around the origin facing +z. 'lanterns' needs the room: ctx = { w, h, ceil } -> { group, mat, bob }. */
export function extra(kind, label, ctx = {}) {
  const g = new THREE.Group(), rnd = rngOf(kind.length * 7 + 3), out = { group: g };
  if (kind === 'skee') { // a skee-ball lane: sloped ramp, target board with rings, side rails
    const p = [], ring = (x, y, col, r) => p.push(part('cyl', col, [x, y, -5.45], [r, 0.08, r], [Math.PI / 2, 0, 0]));
    p.push(part('box', '#8a5a3a', [0, 0.65, 0], [2.8, 0.7, 11], [0.1, 0, 0]), part('box', C.ink, [-1.5, 1.05, 0], [0.2, 1.1, 11], [0.1, 0, 0]), part('box', C.ink, [1.5, 1.05, 0], [0.2, 1.1, 11], [0.1, 0, 0]));
    p.push(part('box', '#8a5a3a', [0, 4.6, -5.7], [2.8, 6, 0.4]), part('box', C.ink, [0, 7.8, -5.55], [3.1, 0.5, 0.7]));
    [[-0.8, 5.6, 0.62], [0.8, 5.6, 0.62], [0, 4.0, 0.9], [-0.8, 2.6, 0.5], [0.8, 2.6, 0.5]].forEach(([x, y, r]) => { ring(x, y, '#c0392b', r); ring(x, y + 0.001, C.ivory, r * 0.72); ring(x, y + 0.002, '#2e5fa0', r * 0.46); ring(x, y + 0.003, '#e8a33a', r * 0.2); });
    for (let k = 0; k < 5; k++) p.push(part('sph', k % 2 ? C.ivory : '#c0392b', [(rnd() - 0.5) * 1.8, 1.2, 4 - k * 0.4], [0.2, 0.2, 0.2]));
    g.add(mesh(p, 0.7, true));
    const l = label('Skee-ball', { size: 1.1 }); l.position.set(0, 10, -5); g.add(l);
  } else if (kind === 'cars') { // bumper cars in a low rubber-edged arena
    const p = [];
    p.push(part('box', '#34322e', [0, 0.06, 0], [14.6, 0.12, 10.4]));
    [[0, -5.2, 14.6, 0.5], [0, 5.2, 14.6, 0.5], [-7.3, 0, 0.5, 10.4], [7.3, 0, 0.5, 10.4]].forEach(([x, z, sx, sz]) => p.push(part('box', C.ink, [x, 0.5, z], [sx, 0.9, sz]), part('box', '#c0392b', [x, 0.98, z], [sx + 0.05, 0.08, sz + 0.05])));
    [[-3.4, -1.4, 0.5, '#e07b2a'], [2.8, 1.2, -0.6, '#2f6fb0'], [-0.4, 2.2, 2.4, C.ivory], [3.6, -2.3, 0.2, '#7a1f36']].forEach(([x, z, ry, col]) => {
      p.push(part('cyl', C.ink, [x, 0.45, z], [1.25, 0.4, 1.55], [0, ry, 0]), part('sph', col, [x, 1.15, z], [1.15, 0.7, 1.45], [0, ry, 0]), part('box', C.ink, [x, 1.7, z], [0.7, 0.28, 0.5], [0, ry, 0]));
      p.push(part('cyl', C.ink, [x - Math.sin(ry) * -0.9, 4.5, z + Math.cos(ry) * -0.9], [0.05, 6.5, 0.05]));
    });
    g.add(mesh(p, 0.55, true));
    const l = label('Bumper cars', { size: 1.1 }); l.position.set(0, 6.5, 0); g.add(l);
  } else if (kind === 'polaroid') { // guestbook table: instant camera, a scatter of polaroids, a vinyl record on a stand
    g.add(tableBox(5.4, 2.7, 2.4));
    const p = [], y = 2.7;
    p.push(part('box', C.ivory, [-1.6, y + 0.38, 0.1], [0.95, 0.7, 0.6]), part('cyl', C.ink, [-1.6, y + 0.4, 0.45], [0.2, 0.12, 0.2], [Math.PI / 2, 0, 0]), part('box', C.brass, [-1.6, y + 0.78, 0.1], [0.95, 0.06, 0.62]));
    const SWATCH = [C.mossLt, C.wineLt, C.sage, C.rust, C.fig, C.sageLt];
    for (let k = 0; k < 8; k++) { const x = -0.2 + (k % 4) * 0.78 + (rnd() - 0.5) * 0.15, z = -0.45 + Math.floor(k / 4) * 0.85, ry = (rnd() - 0.5) * 0.7; p.push(part('box', '#fbf8f0', [x, y + 0.03 + k * 0.004, z], [0.6, 0.02, 0.72], [0, ry, 0]), part('box', SWATCH[k % SWATCH.length], [x, y + 0.045 + k * 0.004, z - 0.06], [0.46, 0.02, 0.46], [0, ry, 0])); }
    p.push(part('box', C.brass, [1.7, y + 0.5, -0.3], [0.08, 1.0, 0.08], [0.25, 0, 0.1]), part('box', C.brass, [2.2, y + 0.5, -0.3], [0.08, 1.0, 0.08], [0.25, 0, -0.1]), part('cyl', C.ink, [1.95, y + 1.15, -0.45], [0.85, 0.05, 0.85], [Math.PI / 2 - 0.25, 0, 0]), part('cyl', C.wineLt, [1.95, y + 1.15, -0.4], [0.28, 0.06, 0.28], [Math.PI / 2 - 0.25, 0, 0]));
    p.push(part('cyl', C.ink, [1.0, y + 0.06, 0.8], [0.7, 0.04, 0.7]), part('cyl', C.sage, [1.0, y + 0.09, 0.8], [0.24, 0.05, 0.24]));
    g.add(mesh(p, 0.6));
    const l = label('Guestbook', { size: 1.1 }); l.position.set(0, 6.4, 0); g.add(l);
  } else if (kind === 'lanterns') { // paper sky lanterns drifting overhead; they glow with the evening light
    const N = 36, mat = new THREE.MeshStandardMaterial({ color: '#fff1d2', emissive: '#ffb347', emissiveIntensity: 0.35, roughness: 0.8 });
    const inst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.4, 1.2, 8), mat, N), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
    const lo = ctx.ceil ? 6.5 : 10, hi = ctx.ceil ? ctx.ceil - 1.8 : 36;
    for (let i = 0; i < N; i++) { const s = 0.8 + rnd() * 0.5; M.compose(P.set((rnd() - 0.5) * (ctx.w - 4), lo + rnd() * (hi - lo), (rnd() - 0.5) * (ctx.h - 4)), Q.identity(), S.set(s, s, s)); inst.setMatrixAt(i, M); }
    g.add(inst); out.mat = mat; out.bob = true;
  }
  return out;
}
