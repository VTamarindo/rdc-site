// Gera o modelo 3D do monstro (monstro.glb) a partir de um campo de distância
// assinada (SDF): primitivas orgânicas unidas suavemente, poligonizadas com
// "surface nets", coloridas por vértice e gravadas em glTF binário.
//
// Uso:  node gerar.mjs [resolucao_em_metros]   (padrão 0.011)
// Sem dependências. Unidades em metros, Y para cima, frente em +Z, pés em y=0.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const H = parseFloat(process.argv[2] || '0.011');

// ---------------------------------------------------------------- utilidades
let seed = 1337;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const rr = (a, b) => a + (b - a) * rnd();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const norm = (v) => { const l = len(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

// ruído de valor 3D
const PERM = new Uint8Array(512);
{ const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; }
const hv = (x, y, z) => PERM[PERM[PERM[x & 255] + (y & 255)] + (z & 255)] / 255;
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hv(xi, yi, zi), hv(xi + 1, yi, zi), fx), l(hv(xi, yi + 1, zi), hv(xi + 1, yi + 1, zi), fx), fy),
    l(l(hv(xi, yi, zi + 1), hv(xi + 1, yi, zi + 1), fx), l(hv(xi, yi + 1, zi + 1), hv(xi + 1, yi + 1, zi + 1), fx), fy), fz) * 2 - 1;
}
const fbm = (x, y, z, o = 3) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2.03; a *= 0.5; } return s; };

// ------------------------------------------------------------- primitivas SDF
function sdEllipsoid(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const k1 = Math.sqrt((x * x) / (r[0] * r[0]) + (y * y) / (r[1] * r[1]) + (z * z) / (r[2] * r[2]));
  return k1 === 0 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
}
function sdRoundCone(px, py, pz, a, b, r1, r2) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz, rd = r1 - r2, a2 = l2 - rd * rd, il2 = 1 / l2;
  const ax = px - a[0], ay = py - a[1], az = pz - a[2];
  const y = ax * bx + ay * by + az * bz, z = y - l2;
  const qx = ax * l2 - bx * y, qy = ay * l2 - by * y, qz = az * l2 - bz * y;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rd) * rd * rd * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rd) * il2 - r1;
}

const prims = [];
const NAILS = [];   // garras: meshes à parte
const TEETH = [];   // dentes: meshes à parte
function ell(c, r, k, tag) {
  prims.push({ f: (x, y, z) => sdEllipsoid(x, y, z, c, r), c, R: Math.max(...r), k, tag });
}
function cone(a, b, r1, r2, k, tag) {
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  prims.push({ f: (x, y, z) => sdRoundCone(x, y, z, a, b, r1, r2), c, R: len(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2 + Math.max(r1, r2), k, tag });
}
const both = (fn) => { fn(1); fn(-1); }; // espelha para os dois lados (s = +1 direita, -1 esquerda)

// ----------------------------------------------------------------- anatomia
// Cabeça: larga e achatada, de sapo, sem pescoço, afundada entre os trapézios.
const HEAD = { c: [0, 2.18, 0.08], r: [0.43, 0.29, 0.33] };
ell(HEAD.c, HEAD.r, 0.11);
ell([0, 2.08, 0.14], [0.4, 0.17, 0.3], 0.08);           // mandíbula
both((s) => ell([s * 0.22, 2.38, -0.02], [0.18, 0.12, 0.22], 0.08)); // crânio irregular

// Tronco
ell([0, 1.7, -0.03], [0.45, 0.36, 0.3], 0.1);            // caixa torácica
both((s) => ell([s * 0.19, 1.75, 0.17], [0.22, 0.15, 0.13], 0.035)); // peitorais
both((s) => ell([s * 0.34, 2.0, -0.08], [0.3, 0.2, 0.25], 0.09));  // trapézios
both((s) => ell([s * 0.29, 1.6, -0.12], [0.27, 0.36, 0.2], 0.05)); // dorsais
both((s) => ell([s * 0.21, 1.84, -0.25], [0.14, 0.14, 0.08], 0.04)); // escápulas
both((s) => ell([s * 0.08, 1.32, -0.18], [0.08, 0.24, 0.08], 0.04)); // lombares
both((s) => ell([s * 0.34, 1.38, 0.02], [0.13, 0.22, 0.18], 0.06));  // oblíquos
ell([0, 1.3, 0.02], [0.31, 0.3, 0.25], 0.09);            // barriga
for (const y of [1.48, 1.36, 1.24]) both((s) => ell([s * 0.088, y, 0.235], [0.085, 0.058, 0.055], 0.035)); // abdominais
both((s) => { for (let i = 0; i < 3; i++) ell([s * 0.37, 1.62 - i * 0.09, 0.14 - i * 0.01], [0.06, 0.03, 0.05], 0.03); }); // serráteis
ell([0, 0.98, 0.0], [0.36, 0.2, 0.26], 0.1);             // pelve
both((s) => ell([s * 0.15, 0.96, -0.16], [0.18, 0.2, 0.16], 0.06)); // glúteos

// Braços longos e pesados, abertos para os lados
both((s) => {
  const S = [s * 0.66, 1.95, -0.02], E = [s * 1.08, 1.74, 0.0], W = [s * 1.42, 1.5, 0.1];
  ell([s * 0.66, 1.94, 0.0], [0.21, 0.21, 0.21], 0.07);             // deltoide
  cone(S, E, 0.17, 0.13, 0.07);                                     // braço
  ell([s * 0.86, 1.83, 0.08], [0.19, 0.13, 0.13], 0.05);             // bíceps
  ell([s * 0.86, 1.87, -0.08], [0.19, 0.13, 0.13], 0.05);            // tríceps
  cone(E, W, 0.15, 0.085, 0.06);                                    // antebraço
  ell([s * 1.17, 1.68, 0.03], [0.17, 0.12, 0.13], 0.05);             // massa do antebraço
  // mão pendente, palma para trás, dedos caindo
  const P = [s * 1.5, 1.38, 0.13];
  cone(W, P, 0.085, 0.08, 0.04);
  ell([s * 1.52, 1.37, 0.14], [0.075, 0.12, 0.13], 0.04);
  const knuckZ = [0.03, 0.105, 0.18, 0.25];
  knuckZ.forEach((kz, i) => {
    const lenF = [0.92, 1.0, 1.05, 0.95][i];
    const K = [s * 1.54, 1.27, kz];
    const A = add(K, [s * 0.03, -0.13 * lenF, 0.0]);
    const B = add(A, [s * 0.0, -0.11 * lenF, 0.015]);
    const T = add(B, [-s * 0.02, -0.075 * lenF, 0.03]);
    ell(K, [0.04, 0.04, 0.04], 0.015, 'junta');
    cone(K, A, 0.038, 0.034, 0.02);
    ell(A, [0.039, 0.036, 0.039], 0.012, 'junta');
    cone(A, B, 0.034, 0.03, 0.012);
    ell(B, [0.034, 0.032, 0.034], 0.01, 'junta');
    cone(B, T, 0.03, 0.022, 0.01);
    NAILS.push({ tip: T, dir: norm([T[0] - B[0], T[1] - B[1], T[2] - B[2]]), out: [s, 0, 0], w: 0.024, l: 0.06 });
  });
  // polegar
  const T0 = [s * 1.47, 1.36, 0.25], T1 = add(T0, [s * 0.025, -0.09, 0.08]), T2 = add(T1, [s * 0.012, -0.08, 0.04]);
  cone(T0, T1, 0.045, 0.036, 0.03);
  ell(T1, [0.038, 0.038, 0.038], 0.012, 'junta');
  cone(T1, T2, 0.035, 0.025, 0.012);
  NAILS.push({ tip: T2, dir: norm([T2[0] - T1[0], T2[1] - T1[1], T2[2] - T1[2]]), out: norm([s, 0, 0.6]), w: 0.026, l: 0.06 });
});

// Pernas curtas, grossas, arqueadas
both((s) => {
  const Hp = [s * 0.27, 0.95, 0.0], K = [s * 0.42, 0.52, 0.06], A = [s * 0.48, 0.14, -0.01];
  cone(Hp, K, 0.23, 0.16, 0.09);
  ell([s * 0.37, 0.76, 0.09], [0.21, 0.26, 0.19], 0.06);            // quadríceps
  ell([s * 0.28, 0.74, 0.0], [0.12, 0.2, 0.15], 0.06);               // adutor
  ell([s * 0.44, 0.52, 0.12], [0.1, 0.08, 0.08], 0.04);              // joelho
  cone(K, A, 0.15, 0.1, 0.07);
  ell([s * 0.44, 0.37, -0.07], [0.15, 0.19, 0.14], 0.06);            // panturrilha
  // pé largo com cinco dedos em garra
  ell([s * 0.5, 0.09, 0.06], [0.18, 0.095, 0.22], 0.07);
  ell([s * 0.48, 0.07, -0.1], [0.1, 0.07, 0.08], 0.05);              // calcanhar
  const xs = [-0.13, -0.065, 0.0, 0.065, 0.125], ls = [1.1, 1.0, 0.95, 0.88, 0.8], rs = [0.062, 0.055, 0.052, 0.048, 0.044];
  xs.forEach((dx, i) => {
    const x0 = s * 0.5 - s * dx; // dedão do lado de dentro
    const B = [x0, 0.09, 0.17], M = [x0 - s * dx * 0.25, 0.07, 0.17 + 0.11 * ls[i]], T = [x0 - s * dx * 0.4, 0.04, 0.17 + 0.19 * ls[i]];
    cone(B, M, rs[i], rs[i] * 0.85, 0.03);
    ell(M, [rs[i] * 0.95, rs[i] * 0.85, rs[i] * 0.95], 0.012, 'junta');
    cone(M, T, rs[i] * 0.85, rs[i] * 0.65, 0.012);
    NAILS.push({ tip: T, dir: norm([T[0] - M[0], T[1] - M[1] - 0.02, T[2] - M[2]]), out: [0, 1, 0.3], w: rs[i] * 0.8, l: 0.06 + rs[i] * 0.4, foot: true });
  });
});

// ------------------------------------------------------- campo base (união)
function baseSDF(x, y, z, skipTag) {
  let d = 1e9;
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i];
    if (skipTag && p.tag === skipTag) continue;
    const lb = len(x - p.c[0], y - p.c[1], z - p.c[2]) - p.R;
    if (lb - d > p.k) continue;
    d = smin(d, p.f(x, y, z), p.k);
  }
  return d;
}
// acha o ponto da superfície ao longo de um raio (de fora para dentro)
function hitSurface(o, dir) {
  let t = 0;
  for (let i = 0; i < 200; i++) {
    const p = add(o, dir, t), d = baseSDF(p[0], p[1], p[2]);
    if (d < 0.0005) return p;
    t += Math.max(d * 0.8, 0.001);
    if (t > 3) return null;
  }
  return null;
}
function gradBase(p) {
  const e = 0.002;
  return norm([
    baseSDF(p[0] + e, p[1], p[2]) - baseSDF(p[0] - e, p[1], p[2]),
    baseSDF(p[0], p[1] + e, p[2]) - baseSDF(p[0], p[1] - e, p[2]),
    baseSDF(p[0], p[1], p[2] + e) - baseSDF(p[0], p[1], p[2] - e)]);
}

// --------------------------------------------------- olhos, boca e pálpebras
const EYE_R = 0.088;
const EYES = [];
both((s) => {
  const c = [s * 0.285, 2.32, 0.25];
  EYES.push({ c, s, gaze: norm([s * 0.22 + (s > 0 ? 0.05 : -0.12), -0.12, 1]) });
  ell(add(c, [s * 0.01, 0.005, -0.03]), [0.108, 0.104, 0.1], 0.04, 'palpebra'); // órbita saltada
});
const MOUTH = { c: [0, 2.1, 0.36], r: [0.335, 0.104, 0.12] };
both((s) => ell([s * 0.34, 2.1, 0.2], [0.08, 0.12, 0.1], 0.06)); // cantos da boca / bochechas

// chifres no alto da cabeça e espinhos atrás
const hornSpots = [[0.3, 0.95, 0.15, 0.13], [0.14, 1.0, 0.0, 0.07], [0.36, 0.7, -0.4, 0.06]];
both((s) => {
  for (const [hx, hy, hz, hl] of hornSpots) {
    const base = hitSurface([s * hx, 3.0, hz * 0.3 + 0.0], [0, -1, 0]);
    if (!base) continue;
    const n = gradBase(base);
    const dir = norm([n[0] + s * 0.25, n[1] + 0.6, n[2] - 0.15]);
    cone(add(base, n, -0.02), add(base, dir, hl), 0.038 * (hl / 0.1) ** 0.5, 0.006, 0.025, 'chifre');
  }
});

// crista de nódulos ao longo da coluna
for (let i = 0, y = 2.34; y > 1.1; i++) {
  y -= rr(0.06, 0.11);
  const p = hitSurface([0, y, -1.5], [0, 0, 1]);
  if (!p) continue;
  const r = mix(0.022, 0.042, Math.sin(((2.34 - y) / 1.24) * Math.PI)) * rr(0.75, 1.2);
  ell(add(p, [0, 0, 0.006]), [r * 0.9, r * 1.1, r], 0.018, 'coluna');
}
// espinhos ao longo do contorno das costas / ombros
both((s) => {
  for (let i = 0; i < 7; i++) {
    const y = 2.28 - i * 0.1, x = s * (0.16 + 0.03 * Math.sin(i));
    const p = hitSurface([x, y, -1.5], [0, 0, 1]);
    if (!p) continue;
    const n = gradBase(p);
    cone(add(p, n, -0.01), add(p, norm([n[0], n[1] + 0.5, n[2] - 0.3]), rr(0.035, 0.06)), 0.022, 0.004, 0.015, 'chifre');
  }
});
// verrugas e caroços espalhados (cabeça, ombros, braços, costas)
{
  const zonas = [
    { o: HEAD.c, n: 34, up: 0.2, r: [0.012, 0.03] },
    { o: [0.0, 1.8, -0.1], n: 40, up: 0.0, r: [0.01, 0.026] },
    { o: [0.7, 1.95, 0], n: 14, up: 0.3, r: [0.01, 0.022] },
    { o: [-0.7, 1.95, 0], n: 14, up: 0.3, r: [0.01, 0.022] },
    { o: [1.1, 1.72, 0.0], n: 12, up: 0.4, r: [0.008, 0.018] },
    { o: [-1.1, 1.72, 0.0], n: 12, up: 0.4, r: [0.008, 0.018] },
  ];
  for (const zn of zonas) {
    for (let i = 0; i < zn.n; i++) {
      const d = norm([rr(-1, 1), rr(-1, 1) + zn.up, rr(-1, 1)]);
      const o = add(zn.o, d, 1.2);
      const p = hitSurface(o, [-d[0], -d[1], -d[2]]);
      if (!p) continue;
      // nada de verrugas dentro da boca ou sobre os olhos
      if (sdEllipsoid(p[0], p[1], p[2], MOUTH.c, [MOUTH.r[0] + 0.06, MOUTH.r[1] + 0.06, MOUTH.r[2] + 0.06]) < 0) continue;
      if (EYES.some((e) => len(p[0] - e.c[0], p[1] - e.c[1], p[2] - e.c[2]) < EYE_R + 0.05)) continue;
      const r = rr(zn.r[0], zn.r[1]);
      ell(p, [r, r * rr(0.8, 1.1), r], r * 0.9, 'verruga');
    }
  }
}

// ------------------------------------------------------ campo final da pele
const DETAIL_BAND = 0.06;
function skinSDF(x, y, z) {
  let d = baseSDF(x, y, z);
  if (d > DETAIL_BAND + 0.02) return d;
  // boca: cavidade escavada no rosto
  d = smax(d, -sdEllipsoid(x, y, z, MOUTH.c, MOUTH.r), 0.035);
  // olhos: abre espaço para os globos
  for (const e of EYES) d = smax(d, -(len(x - e.c[0], y - e.c[1], z - e.c[2]) - (EYE_R + 0.004)), 0.012);
  if (Math.abs(d) > DETAIL_BAND) return d;
  // pele: caroços grandes + poros
  let n = fbm(x * 9, y * 9, z * 9, 3) * 0.011 + vnoise(x * 55, y * 55, z * 55) * 0.0018;
  // dobras horizontais no tronco (costelas / pele flácida)
  const tor = sstep(0.05, 0.2, z) * sstep(0.2, 0.36, Math.abs(x)) * sstep(0.48, 0.38, Math.abs(x)) * sstep(1.05, 1.15, y) * sstep(1.95, 1.8, y);
  if (tor > 0) n += tor * 0.0018 * Math.sin(y * 85 + fbm(x * 6, y * 3, z * 6) * 3);
  // rugas nos dedos e no dorso das mãos/pés
  const dist = sstep(1.25, 1.45, Math.abs(x)) + sstep(0.2, 0.08, y);
  if (dist > 0) n += Math.min(dist, 1) * 0.0008 * Math.sin((Math.abs(x) > 1 ? y : z) * 260 + vnoise(x * 30, y * 30, z * 30) * 4);
  return d + n;
}
function gradF(f, x, y, z, e = 0.0015) {
  return norm([f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)]);
}

// ---------------------------------------------------------- dentes enormes
function sdRoundBox(x, y, z, b, r) {
  const qx = Math.abs(x) - b[0] + r, qy = Math.abs(y) - b[1] + r, qz = Math.abs(z) - b[2] + r;
  return len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}
function frontZ(x, y) { const p = hitSurface([x, y, 1.2], [0, 0, -1]); return p ? p[2] : 0.3; }
{
  // arco da arcada acompanhando a frente do rosto (antes da cavidade)
  const rows = [{ y0: 2.198, y1: 2.101, n: 8, up: true }, { y0: 2.002, y1: 2.099, n: 8, up: false }];
  for (const row of rows) {
    const W = 0.62, w = W / row.n;
    for (let i = 0; i < row.n; i++) {
      const xc = -W / 2 + w * (i + 0.5) + (row.up ? 0 : w * 0.12);
      const yc = (row.y0 + row.y1) / 2;
      const zf = frontZ(xc, yc) - 0.036;
      const zl = frontZ(xc - 0.02, yc), zr = frontZ(xc + 0.02, yc);
      const ang = Math.atan2(-(zr - zl), 0.04); // rotação em Y para seguir o arco
      const hgt = Math.abs(row.y0 - row.y1) / 2 + 0.014 + rr(-0.003, 0.003);
      const edge = Math.abs(xc) / (W / 2);
      TEETH.push({
        c: [xc, yc + (row.up ? 0.007 : -0.007), zf], ang,
        b: [w * 0.5 - 0.0025, hgt * (1 - 0.12 * edge * edge), 0.03], up: row.up, tilt: rr(-0.05, 0.05),
      });
    }
  }
}
function toothSDF(t, x, y, z) {
  let px = x - t.c[0], py = y - t.c[1], pz = z - t.c[2];
  const ca = Math.cos(t.ang), sa = Math.sin(t.ang);
  [px, pz] = [ca * px - sa * pz, sa * px + ca * pz];
  const ct = Math.cos(t.tilt), st = Math.sin(t.tilt);
  [px, py] = [ct * px - st * py, st * px + ct * py];
  // ponta (borda de corte) levemente mais fina e frente abaulada
  const v = (t.up ? -py : py) / t.b[1]; // -1 na raiz .. +1 na ponta
  const bz = t.b[2] * (1 - 0.35 * clamp(v, 0, 1)) - 0.012 * px * px / (t.b[0] * t.b[0]);
  return sdRoundBox(px, py, pz + 0.004 * v, [t.b[0], t.b[1], Math.max(bz, 0.008)], 0.01);
}

// ------------------------------------------------------------- garras/unhas
function nailSDF(nl, x, y, z) {
  const back = add(nl.tip, nl.dir, -nl.l * 0.55), front = add(nl.tip, nl.dir, nl.l * (nl.foot ? 0.55 : 0.35));
  const o = norm(nl.out), up = add(o, nl.dir, -(o[0] * nl.dir[0] + o[1] * nl.dir[1] + o[2] * nl.dir[2]));
  const lift = nl.foot ? 0.006 : 0.008;
  const a = add(back, up, lift), b = add(add(front, up, lift * 0.2), nl.foot ? [0, -0.015, 0] : [0, 0, 0]);
  return sdRoundCone(x, y, z, a, b, nl.w, nl.w * 0.25);
}

// ------------------------------------------------------- poligonização
// surface nets: um vértice por célula cruzada, quads entre células vizinhas
function polygonize(f, lo, hi, h, block = 8) {
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const V = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  const half = Math.sqrt(3) * block * h * 0.5;
  for (let bk = 0; bk < nz; bk += block) for (let bj = 0; bj < ny; bj += block) for (let bi = 0; bi < nx; bi += block) {
    const cx = lo[0] + (bi + block / 2) * h, cy = lo[1] + (bj + block / 2) * h, cz = lo[2] + (bk + block / 2) * h;
    const dc = f(cx, cy, cz);
    const far = Math.abs(dc) > half * 1.6 + 0.03;
    for (let k = bk; k < Math.min(bk + block + 1, nz); k++) for (let j = bj; j < Math.min(bj + block + 1, ny); j++) for (let i = bi; i < Math.min(bi + block + 1, nx); i++)
      V[id(i, j, k)] = far ? dc : f(lo[0] + i * h, lo[1] + j * h, lo[2] + k * h);
  }
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { cv[c] = V[id(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; if (cv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, m = 0;
    for (const [a, b] of E) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += (a & 1) + t * ((b & 1) - (a & 1)); sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1)); sz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1)); m++;
    }
    cellV[cid(i, j, k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / m) * h, lo[1] + (j + sy / m) * h, lo[2] + (k + sz / m) * h);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = V[id(i, j, k)] < 0;
    if (v0 !== (V[id(i + 1, j, k)] < 0) && i < nx - 1) quad(cellV[cid(i, j - 1, k - 1)], cellV[cid(i, j, k - 1)], cellV[cid(i, j, k)], cellV[cid(i, j - 1, k)], !v0);
    if (v0 !== (V[id(i, j + 1, k)] < 0)) quad(cellV[cid(i - 1, j, k - 1)], cellV[cid(i - 1, j, k)], cellV[cid(i, j, k)], cellV[cid(i, j, k - 1)], !v0);
    if (v0 !== (V[id(i, j, k + 1)] < 0)) quad(cellV[cid(i - 1, j - 1, k)], cellV[cid(i, j - 1, k)], cellV[cid(i, j, k)], cellV[cid(i - 1, j, k)], !v0);
  }
  // projeta na superfície e calcula normais pelo gradiente
  const nrm = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    for (let it = 0; it < 2; it++) {
      const g = gradF(f, pos[v], pos[v + 1], pos[v + 2], h * 0.25), d = f(pos[v], pos[v + 1], pos[v + 2]);
      const s = clamp(d, -h * 0.5, h * 0.5);
      pos[v] -= g[0] * s; pos[v + 1] -= g[1] * s; pos[v + 2] -= g[2] * s;
    }
    const g = gradF(f, pos[v], pos[v + 1], pos[v + 2], h * 0.35);
    nrm[v] = g[0]; nrm[v + 1] = g[1]; nrm[v + 2] = g[2];
  }
  return { pos: new Float32Array(pos), nrm, idx };
}
// garante que as faces apontem para fora (comparando com a normal do SDF)
function fixWinding(m) {
  const { pos, nrm, idx } = m;
  let good = 0, bad = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    (fx * nrm[a] + fy * nrm[a + 1] + fz * nrm[a + 2] >= 0 ? good++ : bad++);
  }
  if (bad > good) for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  return m;
}
function merge(list) {
  let nv = 0, ni = 0; for (const m of list) { nv += m.pos.length; ni += m.idx.length; }
  const pos = new Float32Array(nv), nrm = new Float32Array(nv), idx = [], col = []; let o = 0;
  for (const m of list) { pos.set(m.pos, o); nrm.set(m.nrm, o); for (const i of m.idx) idx.push(i + o / 3); for (const c of m.col) col.push(c); o += m.pos.length; }
  return { pos, nrm, idx, col };
}

// ---------------------------------------------------------------- cores
const srgb = (c) => c.map((v) => Math.pow(clamp(v, 0, 1), 2.2));
const mixC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const nearTag = (tag, x, y, z) => { let d = 1e9; for (const p of prims) if (p.tag === tag && len(x - p.c[0], y - p.c[1], z - p.c[2]) - p.R < 0.02) d = Math.min(d, p.f(x, y, z)); return d; };
function skinColor(x, y, z, nx, ny, nz) {
  let c = [0.53, 0.43, 0.39];
  const b = fbm(x * 4 + 7, y * 4, z * 4, 3), b2 = fbm(x * 14, y * 14 + 3, z * 14, 2);
  c = mixC(c, [0.5, 0.33, 0.3], sstep(0.0, 0.35, b) * 0.85);        // manchas avermelhadas
  c = mixC(c, [0.62, 0.54, 0.47], sstep(0.05, 0.35, -b) * 0.55);   // áreas pálidas
  c = mixC(c, [0.28, 0.17, 0.14], sstep(0.2, 0.42, b2) * 0.6);   // pintas escuras
  // extremidades mais acinzentadas
  c = mixC(c, [0.55, 0.47, 0.43], sstep(1.25, 1.5, Math.abs(x)) * 0.6 + sstep(0.25, 0.05, y) * 0.5);
  // oclusão de cavidades -> vermelho escuro, como carne nas dobras
  let occ = 0;
  for (let i = 1; i <= 4; i++) { const t = i * 0.018; occ += (t - skinSDF(x + nx * t, y + ny * t, z + nz * t)) / t * (1 / i); }
  occ = clamp(occ * 0.55, 0, 1);
  c = mixC(c, [0.36, 0.11, 0.1], sstep(0.12, 0.7, occ));
  // tags
  if (nearTag('coluna', x, y, z) < 0.006) c = mixC([0.5, 0.17, 0.14], [0.35, 0.1, 0.08], sstep(-0.2, 0.3, b2));
  const dv = nearTag('verruga', x, y, z); if (dv < 0.004) c = mixC(c, [0.52, 0.27, 0.22], 0.7);
  const dh = nearTag('chifre', x, y, z); if (dh < 0.004) c = mixC([0.4, 0.26, 0.22], [0.7, 0.6, 0.5], sstep(-0.03, 0.06, -baseSDF(x, y, z, 'chifre')));
  if (nearTag('palpebra', x, y, z) < 0.01) c = mixC(c, [0.6, 0.25, 0.22], 0.55);
  // boca: lábios crus e gengiva escura
  const dm = sdEllipsoid(x, y, z, MOUTH.c, MOUTH.r);
  if (dm < 0.03) c = mixC(c, [0.5, 0.17, 0.14], sstep(0.03, 0.0, dm) * 0.8);
  if (dm < 0.0) c = mixC(c, [0.18, 0.03, 0.03], sstep(0.0, -0.03, dm));
  return c;
}

function toothColor(t, x, y, z) {
  const v = (t.up ? t.c[1] - y : y - t.c[1]) / t.b[1]; // -1 raiz .. 1 ponta
  let c = [0.9, 0.86, 0.76];
  c = mixC(c, [0.78, 0.68, 0.5], sstep(0.2, -0.9, v) * 0.6);
  const blood = sstep(-0.7, -1.05, v + fbm(x * 40, y * 40, z * 40) * 0.5) * 0.85;
  c = mixC(c, [0.45, 0.06, 0.05], blood);
  c = mixC(c, [0.5, 0.42, 0.32], sstep(0.2, 0.5, fbm(x * 60 + 3, y * 60, z * 60, 2)) * 0.35);
  return c;
}
function nailColor(nl, x, y, z) {
  const t = ((x - nl.tip[0]) * nl.dir[0] + (y - nl.tip[1]) * nl.dir[1] + (z - nl.tip[2]) * nl.dir[2]) / nl.l;
  return mixC([0.27, 0.22, 0.18], [0.62, 0.55, 0.45], sstep(-0.1, 0.4, t));
}

// ------------------------------------------------------------------ olhos
function eyeMesh(e) {
  const SEG = 144, RING = 96, pos = [], nrm = [], col = [], idx = [];
  const g = e.gaze, up0 = [0, 1, 0];
  for (let r = 0; r <= RING; r++) for (let sgm = 0; sgm <= SEG; sgm++) {
    const th = (r / RING) * Math.PI, ph = (sgm / SEG) * Math.PI * 2;
    const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    const cosG = n[0] * g[0] + n[1] * g[1] + n[2] * g[2];
    // córnea levemente saltada sobre a íris
    const bump = sstep(0.9, 0.97, cosG) * 0.006;
    pos.push(e.c[0] + n[0] * (EYE_R + bump), e.c[1] + n[1] * (EYE_R + bump), e.c[2] + n[2] * (EYE_R + bump));
    nrm.push(...n);
    const ang = Math.acos(clamp(cosG, -1, 1));
    let c = [0.93, 0.9, 0.84];
    c = mixC(c, [0.85, 0.6, 0.55], sstep(0.6, 1.4, ang) * 0.6);                              // vermelhidão nas bordas
    const vein = Math.abs(Math.sin(Math.atan2(n[1] - g[1], n[0] - g[0]) * 9 + vnoise(n[0] * 8, n[1] * 8, n[2] * 8) * 6));
    c = mixC(c, [0.7, 0.15, 0.12], (1 - sstep(0.0, 0.08, vein)) * sstep(0.5, 1.1, ang) * 0.7);  // veias
    c = mixC(c, [0.38, 0.27, 0.16], sstep(0.33, 0.3, ang));                                   // íris
    c = mixC(c, [0.22, 0.14, 0.08], sstep(0.24, 0.31, ang) * sstep(0.33, 0.3, ang));          // anel da íris
    c = mixC(c, [0.02, 0.02, 0.02], sstep(0.16, 0.14, ang));                                  // pupila
    col.push(...srgb(c));
  }
  for (let r = 0; r < RING; r++) for (let s = 0; s < SEG; s++) {
    const a = r * (SEG + 1) + s, b = a + SEG + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return fixWinding({ pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx, col });
}

// ------------------------------------------------------------- gravar GLB
function writeGLB(meshes, file) {
  const chunks = [], bufferViews = [], accessors = [], gltfMeshes = [], nodes = [], materials = [];
  let off = 0;
  const pushView = (arr, target, byteStride) => {
    const bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    chunks.push(bytes, Buffer.alloc(pad));
    bufferViews.push({ buffer: 0, byteOffset: off, byteLength: bytes.length, target, ...(byteStride ? { byteStride } : {}) });
    off += bytes.length + pad;
    return bufferViews.length - 1;
  };
  for (const m of meshes) {
    const n = m.pos.length / 3;
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], m.pos[i * 3 + a]); mx[a] = Math.max(mx[a], m.pos[i * 3 + a]); }
    const col = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) { for (let a = 0; a < 3; a++) col[i * 4 + a] = Math.round(clamp(m.col[i * 3 + a], 0, 1) * 255); col[i * 4 + 3] = 255; }
    const aP = accessors.push({ bufferView: pushView(m.pos, 34962), componentType: 5126, count: n, type: 'VEC3', min: mn, max: mx }) - 1;
    // normais quantizadas em int8 (KHR_mesh_quantization), 4 bytes por vértice
    const qn = new Int8Array(n * 4);
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) qn[i * 4 + a] = Math.round(clamp(m.nrm[i * 3 + a], -1, 1) * 127);
    const aN = accessors.push({ bufferView: pushView(qn, 34962, 4), componentType: 5120, normalized: true, count: n, type: 'VEC3' }) - 1;
    const aC = accessors.push({ bufferView: pushView(col, 34962), componentType: 5121, normalized: true, count: n, type: 'VEC4' }) - 1;
    const aI = accessors.push({ bufferView: pushView(new Uint32Array(m.idx), 34963), componentType: 5125, count: m.idx.length, type: 'SCALAR' }) - 1;
    materials.push({ name: m.name, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: m.rough } });
    gltfMeshes.push({ name: m.name, primitives: [{ attributes: { POSITION: aP, NORMAL: aN, COLOR_0: aC }, indices: aI, material: materials.length - 1 }] });
    nodes.push({ name: m.name, mesh: gltfMeshes.length - 1 });
  }
  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: '2.0', generator: 'gerar.mjs (Romance de Cavalaria)' },
    extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'],
    scene: 0, scenes: [{ name: 'Monstro', nodes: [nodes.length] }],
    nodes: [...nodes, { name: 'Monstro', children: nodes.map((_, i) => i) }],
    meshes: gltfMeshes, materials, accessors, bufferViews, buffers: [{ byteLength: bin.length }],
  };
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (b, t) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.writeUInt32LE(t, 4); return h; };
  writeFileSync(file, Buffer.concat([head, ch(js, 0x4e4f534a), js, ch(bin, 0x004e4942), bin]));
}

// ------------------------------------------------------------------- main
const t0 = Date.now();
const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

const pele = fixWinding(polygonize(skinSDF, [-1.72, -0.02, -0.5], [1.72, 2.58, 0.6], H));
pele.col = [];
for (let v = 0; v < pele.pos.length; v += 3) pele.col.push(...srgb(skinColor(pele.pos[v], pele.pos[v + 1], pele.pos[v + 2], pele.nrm[v], pele.nrm[v + 1], pele.nrm[v + 2])));
pele.name = 'Pele'; pele.rough = 0.42;
log(`pele: ${pele.pos.length / 3} vértices, ${pele.idx.length / 3} triângulos`);

const dentes = merge(TEETH.map((t) => {
  const R = Math.max(...t.b) + 0.02;
  const m = fixWinding(polygonize((x, y, z) => toothSDF(t, x, y, z), add(t.c, [-R, -R, -R]), add(t.c, [R, R, R]), 0.003, 4));
  m.col = []; for (let v = 0; v < m.pos.length; v += 3) m.col.push(...srgb(toothColor(t, m.pos[v], m.pos[v + 1], m.pos[v + 2])));
  return m;
}));
dentes.name = 'Dentes'; dentes.rough = 0.25;
log(`dentes: ${TEETH.length}`);

const garras = merge(NAILS.map((nl) => {
  const R = nl.l + nl.w + 0.02;
  const m = fixWinding(polygonize((x, y, z) => nailSDF(nl, x, y, z), add(nl.tip, [-R, -R, -R]), add(nl.tip, [R, R, R]), 0.003, 4));
  m.col = []; for (let v = 0; v < m.pos.length; v += 3) m.col.push(...srgb(nailColor(nl, m.pos[v], m.pos[v + 1], m.pos[v + 2])));
  return m;
}));
garras.name = 'Garras'; garras.rough = 0.35;
log(`garras: ${NAILS.length}`);

const olhos = merge(EYES.map(eyeMesh));
olhos.name = 'Olhos'; olhos.rough = 0.08;

writeGLB([pele, dentes, garras, olhos], join(AQUI, 'monstro.glb'));
log('monstro.glb gravado');
