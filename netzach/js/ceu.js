/* Netzach · céu
   Pinta o céu e as montanhas ao abrir o jogo, sem imagem para baixar, e diz as cores de cada hora.
   Só pinta e calcula; quem monta e desenha é o view.js. */
(function (NZ) {
  'use strict';

  function rgb(c) { return [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255]; }
  function sorte(i) { var t = Math.sin(i * 12.9898) * 43758.5453; return t - Math.floor(t); }
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function trama(x, y) { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }
  // ruído suave que emenda nas bordas: px e py são os períodos, em células
  function ruido(x, y, px, py, s) {
    var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    function q(a, b) { return sorte(s + ((a % px) + px) % px * 57.31 + ((b % py) + py) % py * 131.7); }
    var t = q(xi, yi) + (q(xi + 1, yi) - q(xi, yi)) * fx, u = q(xi, yi + 1) + (q(xi + 1, yi + 1) - q(xi, yi + 1)) * fx;
    return t + (u - t) * fy;
  }
  // fn(x, y) devolve 0xRRGGBB, ou -1 para deixar o pixel transparente
  function tela(w, h, fn) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data;
    for (var y = 0; y < h; y++) { for (var x = 0; x < w; x++) {
      var v = fn(x, y), i = (y * w + x) * 4;
      if (v >= 0) { d[i] = v >> 16 & 255; d[i + 1] = v >> 8 & 255; d[i + 2] = v & 255; d[i + 3] = 255; }
    } }
    g.putImageData(im, 0, 0);
    return c;
  }

  // degrau de cinza do horizonte (embaixo, 0) ao zênite (em cima, 1); o view.js troca o cinza pelas cores da hora
  function degrade() {
    var N = 10;
    return tela(256, 256, function (x, y) {
      var q = Math.pow(1 - y / 255, 0.55) * N, f = Math.floor(q);
      if (q - f > trama(x, y)) { f++; }
      var g = Math.round(f / N * 255);
      return g << 16 | g << 8 | g;
    });
  }
  function estrelas() {
    var mapa = {};
    for (var i = 0; i < 520; i++) {
      var x = Math.floor(sorte(i + 0.1) * 512), y = Math.floor(sorte(i + 0.7) * 232);
      mapa[y * 512 + x] = sorte(i + 0.4) > 0.8 ? 0xffffff : sorte(i + 0.2) > 0.5 ? 0xb8c4e0 : 0x8896b8;
    }
    return tela(512, 256, function (x, y) { var v = mapa[y * 512 + x]; return v === undefined ? -1 : v; });
  }
  function sol() {
    return tela(128, 128, function (x, y) {
      var r = Math.hypot(x - 63.5, y - 63.5);
      if (r < 13) { return 0xffffff; }
      if (r < 16 && trama(x, y) < 0.75) { return 0xffffff; }
      var f = 1 - (r - 16) / 34;
      return f > 0 && f * f * 0.42 > trama(x, y) ? 0xf4e8d0 : -1;
    });
  }
  function lua() {
    var M = [[-5, -6, 4], [6, -2, 3], [-2, 6, 5], [8, 8, 2], [-9, 3, 2]];
    return tela(64, 64, function (x, y) {
      var dx = x - 31.5, dy = y - 31.5;
      if (Math.hypot(dx, dy) >= 18) { return -1; }
      for (var i = 0; i < M.length; i++) { if (Math.hypot(dx - M[i][0], dy - M[i][1]) < M[i][2]) { return 0xc4cad8; } }
      return 0xeef0f6;
    });
  }
  function nuvens() {
    function n(x, y) {
      return ruido(x / 64, y / 64, 8, 8, 3.1) * 0.58 + ruido(x / 32, y / 32, 16, 16, 7.7) * 0.28 + ruido(x / 12.8, y / 12.8, 40, 40, 9.3) * 0.14;
    }
    return tela(512, 512, function (x, y) {
      var a = n(x, y), L = 0.6;
      if (a < L - 0.018 || (a < L && (a - L + 0.018) / 0.018 < trama(x, y))) { return -1; }
      return n(x, (y + 7) & 511) < L ? 0xd4dce8 : 0xffffff; // borda de um lado mais escura, para dar volume
    });
  }
  function nevoa() {
    return tela(64, 8, function (x, y) { return Math.pow(y / 7, 1.4) > trama(x, y) ? 0xffffff : -1; });
  }
  // cordilheira que emenda nas pontas. o: seed, base e amp (em pixels), picos, fundo (0 a 1: liso a ondulado),
  // copas (árvores no perfil), neve (altura em pixels, 0 = sem neve) e tons [escuro, médio, claro]
  function serra(o) {
    var W = 1024, H = 128, alt = new Array(W), fase = [], i, k;
    for (k = 1; k <= 24; k++) { fase[k] = sorte(o.seed + k * 3.7) * Math.PI * 2; }
    for (var x = 0; x < W; x++) {
      var u = x / W * Math.PI * 2, s = 0;
      for (k = 1; k <= 24; k++) {
        var f = Math.sin(u * (k + o.picos) + fase[k]) / Math.pow(k, 1.05);
        s += (o.fundo * f + (1 - o.fundo) * (1 - Math.abs(f) * 2) / Math.pow(k, 0.1));
      }
      alt[x] = s;
    }
    var lo = Math.min.apply(null, alt), hi = Math.max.apply(null, alt);
    for (i = 0; i < W; i++) {
      alt[i] = o.base + (alt[i] - lo) / (hi - lo) * o.amp;
      if (o.copas) { alt[i] += Math.abs(Math.sin(i * Math.PI / 8 + ruido(i / 16, 0, 64, 1, o.seed) * 5)) * o.copas; }
    }
    return tela(W, H, function (px, y) {
      var top = H - alt[px]; if (y < top) { return -1; }
      var a = H - y, ang = alt[(px + 2) & 1023] - alt[(px + 1022) & 1023], fim = o.neve + (ruido(px / 8, 0, 128, 1, o.seed + 5) - 0.5) * 14;
      var d = ruido(px / 16 + y / 26, y / 8, 64, 16, o.seed + 2) - 0.5;
      var luz = 0.52 + ang * 0.05 + d * 0.8 - (y - top) / H * 0.5 + (trama(px, y) - 0.5) * 0.24;
      if (o.neve && a > fim) { return luz > 0.42 ? 0xf2f4f8 : 0xb8c4d4; }
      return o.tons[luz < 0.36 ? 0 : luz < 0.62 ? 1 : 2];
    });
  }

  function pinturas() {
    return {
      degrade: degrade(), estrelas: estrelas(), sol: sol(), lua: lua(), nuvens: nuvens(), nevoa: nevoa(),
      serra1: serra({ seed: 11, base: 22, amp: 58, picos: 2, fundo: 0.25, copas: 0, neve: 56, tons: [0x56606e, 0x6e7a8a, 0x8a96a6] }),
      serra2: serra({ seed: 23, base: 18, amp: 42, picos: 3, fundo: 0.5, copas: 0, neve: 0, tons: [0x3e5a4c, 0x4e6e5a, 0x64846c] }),
      serra3: serra({ seed: 37, base: 14, amp: 26, picos: 2, fundo: 0.8, copas: 3, neve: 0, tons: [0x2c5230, 0x3a663a, 0x4c7c46] })
    };
  }

  // ---------- as cores de cada hora: entre duas linhas a cor muda aos poucos ----------
  var NOITE = [0x0a1030, 0x1c2a4e, 0x5a6a98, 0x6e80b0, 0x2a2c40, 0x3a4660, 0x2c3658, 1];
  var DIA = [0x3f86dc, 0xbfdcf0, 0xffffff, 0xe6ecf5, 0x5a4a32, 0xfff1d6, 0xffffff, 0];
  var HORAS = [
    //     zênite    horizonte  figuras   luz alta  luz baixa sol/lua   nuvens   estrelas
    [0].concat(NOITE),
    [4.5].concat(NOITE),
    [5.5, 0x1c2a5c, 0x6a5a78, 0x8088a8, 0x8894b8, 0x3a3640, 0x000000, 0x5a5070, 0.5],
    [6, 0x3a5a9c, 0xe8a070, 0xc0a898, 0xb0a4b0, 0x40363a, 0x000000, 0xe8a080, 0.1],
    [7, 0x4a86d0, 0xf0d4b0, 0xf2e8dc, 0xd8dce4, 0x5a4a32, 0xffd8a8, 0xfff0e0, 0],
    [9].concat(DIA),
    [16].concat(DIA),
    [17, 0x4a7cc8, 0xf4d0a0, 0xf8e4cc, 0xdcd8d8, 0x5a4a32, 0xffc890, 0xffe8cc, 0],
    [18, 0x3a4a90, 0xf09060, 0xc89c8c, 0xa89cb0, 0x40363a, 0x000000, 0xf08868, 0.1],
    [18.75, 0x16204e, 0x6a4a70, 0x8088a8, 0x8894b8, 0x3a3640, 0x000000, 0x4a4068, 0.5],
    [20].concat(NOITE),
    [24].concat(NOITE)
  ];
  var CAMPOS = ['zen', 'hor', 'tint', 'sky', 'gnd', 'sun', 'nuvem'];
  // caminho do sol e da lua: a = 0 nasce, a = pi se põe
  function arco(a) {
    var s = Math.sin(a), v = [Math.cos(a), 0.85 * s, 0.15 + 0.4 * s], l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function momento(h) {
    var i = 0; while (i < HORAS.length - 2 && h >= HORAS[i + 1][0]) { i++; }
    var A = HORAS[i], B = HORAS[i + 1], t = (h - A[0]) / (B[0] - A[0]), m = {};
    CAMPOS.forEach(function (k, j) {
      var a = rgb(A[j + 1]), b = rgb(B[j + 1]);
      m[k] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    });
    m.noite = A[8] + (B[8] - A[8]) * t;
    var aSol = (h - 6) / 12 * Math.PI, aLua = ((h + 6) % 24) / 12 * Math.PI;
    m.solDir = arco(aSol); m.luaDir = arco(aLua);
    m.luz = Math.sin(aSol) > 0 ? m.solDir : m.luaDir; // a luz troca de astro quando as duas estão apagadas, às 6h e às 18h
    var q = Math.max(0, Math.min(1, m.solDir[1] * 3));
    m.solCor = [1, 0.72 + 0.26 * q, 0.5 + 0.42 * q];   // laranja rente ao horizonte, quase branco no alto
    return m;
  }

  NZ.ceu = { pinturas: pinturas, momento: momento };
})(window.NZ = window.NZ || {});
