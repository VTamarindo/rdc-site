/* Netzach · visão em primeira pessoa
   Motor WebGL próprio e mínimo, no padrão dos protótipos: personagens, criaturas e
   recursos são figuras 2D (sprites de 64x64) sempre viradas para a câmera; construções
   e chão são formas 3D simples com texturas 2D. Só desenha o que a simulação decidiu. */
(function (NZ) {
  'use strict';

  // ---------- matemática (matrizes 4x4 em coluna, como o WebGL) ----------
  function local(n) {
    var c = Math.cos(n.rotY), s = Math.sin(n.rotY), sc = n.scale;
    return [c * sc[0], 0, -s * sc[0], 0, 0, sc[1], 0, 0, s * sc[2], 0, c * sc[2], 0, n.pos[0], n.pos[1], n.pos[2], 1];
  }
  function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) { for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    } }
    return o;
  }
  function normalMat(m) { // inversa transposta da 3x3, sem dividir pelo determinante
    var a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    var D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
    var G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
    return [A, D, G, B, E, H, C, F, I];
  }
  function perspective(fov, asp, n, f) {
    var t = 1 / Math.tan(fov / 2), nf = 1 / (n - f);
    return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0];
  }
  function lookAt(e, c) {
    var zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    var xx = zz, xy = 0, xz = -zx; l = Math.hypot(xx, xz) || 1; xx /= l; xz /= l;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1];
  }
  function xform(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  function hex(c) { return [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255]; }

  // ---------- geometria: triângulos soltos, normal por face, UV por projeção ----------
  // map: número = metros por repetição da textura; 'fit' = a textura cobre a face uma vez
  function Geo() { this.t = []; }
  Geo.prototype.tri = function (a, b, c) { this.t.push([a, b, c]); return this; };
  Geo.prototype.quad = function (a, b, c, d) { return this.tri(a, b, c).tri(a, c, d); };
  Geo.prototype.done = function (map) {
    var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], out = [];
    this.t.forEach(function (t) { t.forEach(function (p) { for (var k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } }); });
    var rg = [mx[0] - mn[0] || 1, mx[1] - mn[1] || 1, mx[2] - mn[2] || 1];
    this.t.forEach(function (t) {
      var a = t[0], b = t[1], c = t[2];
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var n = norm([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
      var ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
      t.forEach(function (p) {
        var u, v;
        if (ay >= ax && ay >= az) { // chão/teto
          u = map === 'fit' ? (p[0] - mn[0]) / rg[0] : p[0] / map; v = map === 'fit' ? (p[2] - mn[2]) / rg[2] : p[2] / map;
        } else if (ax >= az) { // face voltada para x
          var s = n[0] > 0 ? -1 : 1;
          u = map === 'fit' ? (s > 0 ? p[2] - mn[2] : mx[2] - p[2]) / rg[2] : s * p[2] / map;
          v = map === 'fit' ? (mx[1] - p[1]) / rg[1] : -p[1] / map;
        } else { // face voltada para z
          var s2 = n[2] > 0 ? 1 : -1;
          u = map === 'fit' ? (s2 > 0 ? p[0] - mn[0] : mx[0] - p[0]) / rg[0] : s2 * p[0] / map;
          v = map === 'fit' ? (mx[1] - p[1]) / rg[1] : -p[1] / map;
        }
        out.push(p[0], p[1], p[2], n[0], n[1], n[2], u, v);
      });
    });
    return { data: new Float32Array(out), count: out.length / 8, min: mn, max: mx };
  };
  function boxGeo(w, h, d, map) {
    var x = w / 2, y = h / 2, z = d / 2, g = new Geo();
    g.quad([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]);
    g.quad([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]);
    g.quad([x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]);
    g.quad([-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]);
    g.quad([-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]);
    g.quad([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]);
    return g.done(map);
  }
  function cylGeo(rt, rb, h, seg, off, map) {
    var g = new Geo(), y = h / 2; off = off || 0;
    for (var i = 0; i < seg; i++) {
      var a0 = off + i / seg * Math.PI * 2, a1 = off + (i + 1) / seg * Math.PI * 2;
      var b0 = [Math.sin(a0) * rb, -y, Math.cos(a0) * rb], b1 = [Math.sin(a1) * rb, -y, Math.cos(a1) * rb];
      var t0 = [Math.sin(a0) * rt, y, Math.cos(a0) * rt], t1 = [Math.sin(a1) * rt, y, Math.cos(a1) * rt];
      if (rt > 0) { g.quad(b0, b1, t1, t0); g.tri([0, y, 0], t0, t1); } else { g.tri(b0, b1, [0, y, 0]); }
      g.tri([0, -y, 0], b1, b0);
    }
    return g.done(map);
  }
  function gableGeo(w, h, d, map) {
    var x = w / 2, z = d / 2, g = new Geo();
    g.tri([-x, 0, z], [x, 0, z], [0, h, z]);
    g.tri([x, 0, -z], [-x, 0, -z], [0, h, -z]);
    g.quad([x, 0, z], [x, 0, -z], [0, h, -z], [0, h, z]);
    g.quad([-x, 0, -z], [-x, 0, z], [0, h, z], [0, h, -z]);
    g.quad([-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]); // face de baixo: o beiral não some visto de baixo
    return g.done(map);
  }
  function roofSlopeUV(geo, d) { // nas águas do telhado, as fileiras de telha correm ao longo da cumeeira
    var v = geo.data;
    for (var i = 0; i < v.length; i += 8) {
      if (Math.abs(v[i + 4]) > 0.2 && Math.abs(v[i + 5]) < 0.5) { v[i + 6] = v[i + 2] / 2; v[i + 7] = -v[i + 1] / 1.2 + (v[i + 3] > 0 ? 0 : 0.5); }
    }
    return geo;
  }
  // gira a peça em torno do eixo x (a tampa aberta, as toras deitadas); os UVs ficam como estavam
  function rotX(geo, a) {
    var v = geo.data, c = Math.cos(a), s = Math.sin(a);
    for (var i = 0; i < v.length; i += 8) {
      for (var k = 0; k < 4; k += 3) {
        var y = v[i + k + 1], z = v[i + k + 2];
        v[i + k + 1] = y * c - z * s; v[i + k + 2] = y * s + z * c;
      }
    }
    return geo;
  }
  function planeGeo(w, d, map) { var x = w / 2, z = d / 2; return new Geo().quad([-x, 0, z], [x, 0, z], [x, 0, -z], [-x, 0, -z]).done(map); }
  function ringGeo(ri, ro, seg) {
    var g = new Geo();
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      g.quad([Math.sin(a0) * ro, 0, Math.cos(a0) * ro], [Math.sin(a1) * ro, 0, Math.cos(a1) * ro], [Math.sin(a1) * ri, 0, Math.cos(a1) * ri], [Math.sin(a0) * ri, 0, Math.cos(a0) * ri]);
    }
    return g.done(1);
  }
  function spriteGeo(w, h) { // plano vertical voltado para +z, pé em y=0; v=0 no topo da figura
    var x = w / 2, d = [-x, 0, 0, 0, 0, 1, 0, 1, x, 0, 0, 0, 0, 1, 1, 1, x, h, 0, 0, 0, 1, 1, 0,
      -x, 0, 0, 0, 0, 1, 0, 1, x, h, 0, 0, 0, 1, 1, 0, -x, h, 0, 0, 0, 1, 0, 0];
    return { data: new Float32Array(d), count: 6, min: [-x, 0, -0.05], max: [x, h, 0.05], w: w, h: h };
  }

  // quadro de tela com o pivô (px, py) em fração do quadro, medido a partir do canto inferior esquerdo; v=0 no topo
  function screenGeo(px, py) {
    var x0 = -px, x1 = 1 - px, y0 = -py, y1 = 1 - py;
    var d = [x0, y0, 0, 0, 0, 1, 0, 1, x1, y0, 0, 0, 0, 1, 1, 1, x1, y1, 0, 0, 0, 1, 1, 0,
      x0, y0, 0, 0, 0, 1, 0, 1, x1, y1, 0, 0, 0, 1, 1, 0, x0, y1, 0, 0, 0, 1, 0, 0];
    return { data: new Float32Array(d), count: 6 };
  }

  // ---------- recorte: só desenha o que pode aparecer ----------
  // os quatro lados da visão, tirados da matriz da câmera; o que passa da névoa é cortado pela distância
  function frustum(m) {
    return [[3, 0, 1], [3, 0, -1], [3, 1, 1], [3, 1, -1]].map(function (k) {
      var p = [0, 4, 8, 12].map(function (c) { return m[c + k[0]] + k[2] * m[c + k[1]]; }), l = Math.hypot(p[0], p[1], p[2]);
      return [p[0] / l, p[1] / l, p[2] / l, p[3] / l];
    });
  }
  // esfera que envolve a malha, medida uma vez
  function bound(g) {
    var d = g.data, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], i, k, r = 0;
    for (i = 0; i < d.length; i += 8) { for (k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], d[i + k]); hi[k] = Math.max(hi[k], d[i + k]); } }
    g.bc = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    for (i = 0; i < d.length; i += 8) { r = Math.max(r, Math.hypot(d[i] - g.bc[0], d[i + 1] - g.bc[1], d[i + 2] - g.bc[2])); }
    g.br = r;
  }
  var FOLGA = 0.5; // metros além da esfera: o balanço de quem anda e o giro das figuras nunca cortam nada à vista
  function seen(g, m, pl, eye, fim) {
    if (!g.bc) { bound(g); }
    var c = xform(m, g.bc[0], g.bc[1], g.bc[2]);
    var r = g.br * Math.sqrt(Math.max(m[0] * m[0] + m[1] * m[1] + m[2] * m[2], m[4] * m[4] + m[5] * m[5] + m[6] * m[6], m[8] * m[8] + m[9] * m[9] + m[10] * m[10])) + FOLGA;
    if (Math.hypot(c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]) - r > fim) { return false; }
    for (var i = 0; i < 4; i++) { var p = pl[i]; if (p[0] * c[0] + p[1] * c[1] + p[2] * c[2] + p[3] < -r) { return false; } }
    return true;
  }

  // ---------- cena ----------
  function Node(geo, color, opt) {
    opt = opt || {};
    this.geo = geo || null; this.color = hex(color === undefined ? 0xffffff : color); this.emissive = [0, 0, 0];
    this.alpha = opt.alpha || 1; this.unlit = !!opt.unlit; this.tex = opt.tex || null; this.sprite = !!opt.sprite;
    this.pos = [0, 0, 0]; this.rotY = 0; this.scale = [1, 1, 1]; this.children = []; this.visible = true; this.userData = {}; this.parent = null;
  }
  Node.prototype.add = function (n) { n.parent = this; this.children.push(n); return n; };
  Node.prototype.at = function (x, y, z) { this.pos = [x, y, z]; return this; };

  var VS = 'attribute vec3 p;attribute vec3 n;attribute vec2 uv;uniform mat4 VP;uniform mat4 M;uniform mat3 N;varying vec3 vn;varying vec3 vw;varying vec2 vu;' +
    'void main(){vec4 w=M*vec4(p,1.0);vn=N*n;vw=w.xyz;vu=uv;gl_Position=VP*w;}';
  var FS = 'precision highp float;varying vec3 vn;varying vec3 vw;varying vec2 vu;uniform vec3 eye;uniform sampler2D tex;uniform vec3 col;uniform vec3 emi;uniform float alpha;uniform float unlit;uniform vec3 tint;' +
    'uniform vec3 sky;uniform vec3 gnd;uniform vec3 sunDir;uniform vec3 sunCol;uniform vec3 fogCol;uniform vec2 fog;' +
    // dentro: peça de interior, iluminada pela luz da casa (ambiente + lareira/velas), não pelo céu, que à noite apagaria a sala
    'uniform float dentro;uniform vec3 amb;uniform vec4 l1;uniform vec3 c1;uniform vec4 l2;uniform vec3 c2;' +
    'vec3 lp(vec4 L,vec3 C,vec3 nn){vec3 d=L.xyz-vw;float r=max(length(d),0.01);float a=clamp(1.0-r/L.w,0.0,1.0);return C*a*a*(0.4+0.6*max(dot(nn,d/r),0.0));}' +
    'void main(){vec4 t=texture2D(tex,vu);if(t.a<0.5)discard;vec3 nn=normalize(vn);' +
    'vec3 l=mix(gnd,sky,nn.y*0.5+0.5)*0.75+max(dot(nn,sunDir),0.0)*sunCol*0.7;vec3 b=col*t.rgb;' +
    'if(dentro>0.5){l=amb*(0.82+0.18*nn.y)+lp(l1,c1,nn)+lp(l2,c2,nn);}' +
    'vec3 c=mix(b*l,b*tint,unlit)+emi;float vd=distance(vw,eye);float f=clamp((vd-fog.x)/(fog.y-fog.x),0.0,1.0);gl_FragColor=vec4(mix(c,fogCol,f),alpha);}';

  function Renderer(canvas) {
    var gl = this.gl = canvas.getContext('webgl', { antialias: false, alpha: false }) || canvas.getContext('experimental-webgl');
    if (!gl) { throw new Error('WebGL indisponível'); }
    this.canvas = canvas; this.tex = {};
    function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { throw new Error(gl.getShaderInfoLog(o)); } return o; }
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    var u = this.u = {};
    ['VP', 'M', 'N', 'eye', 'tex', 'col', 'emi', 'alpha', 'unlit', 'tint', 'sky', 'gnd', 'sunDir', 'sunCol', 'fogCol', 'fog', 'dentro', 'amb', 'l1', 'c1', 'l2', 'c2'].forEach(function (k) { u[k] = gl.getUniformLocation(pr, k); });
    this.aP = gl.getAttribLocation(pr, 'p'); this.aN = gl.getAttribLocation(pr, 'n'); this.aU = gl.getAttribLocation(pr, 'uv');
    gl.enableVertexAttribArray(this.aP); gl.enableVertexAttribArray(this.aN); gl.enableVertexAttribArray(this.aU);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(u.tex, 0);
    var white = document.createElement('canvas'); white.width = white.height = 1;
    var wc = white.getContext('2d'); wc.fillStyle = '#fff'; wc.fillRect(0, 0, 1, 1);
    this.addTexture('_branco', white, false);
  }
  Renderer.prototype.addTexture = function (name, canvas, repeat) {
    var gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    var w = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
    this.tex[name] = t;
  };
  Renderer.prototype.buffer = function (geo) {
    if (!geo.buf) { var gl = this.gl; geo.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, geo.buf); gl.bufferData(gl.ARRAY_BUFFER, geo.data, gl.STATIC_DRAW); }
    return geo.buf;
  };
  Renderer.prototype.setSize = function (w, h) { this.canvas.width = w; this.canvas.height = h; };
  Renderer.prototype.draw = function (root, cam, env) {
    var gl = this.gl, u = this.u, self = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(env.fogCol[0], env.fogCol[1], env.fogCol[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform3fv(u.amb, env.amb || BRANCO); gl.uniform1f(u.dentro, 0); this.envTint = env.tint; this.inT = false;
    gl.uniform3fv(u.fogCol, env.fogCol);
    if (env.ceu) { this.ceu(env.ceu, cam); }
    gl.uniformMatrix4fv(u.VP, false, new Float32Array(cam.vp)); gl.uniform3fv(u.eye, cam.eye); gl.uniform3fv(u.tint, env.tint);
    gl.uniform3fv(u.sky, env.sky); gl.uniform3fv(u.gnd, env.gnd); gl.uniform3fv(u.sunDir, env.sunDir); gl.uniform3fv(u.sunCol, env.sunCol);
    gl.uniform2fv(u.fog, env.fog);
    var late = [], pl = frustum(cam.vp);
    (function walk(n, parentM) {
      if (!n.visible) { return; }
      if (n.sprite) { n.rotY = Math.atan2(cam.eye[0] - n.pos[0], cam.eye[2] - n.pos[2]); } // sempre de frente para a câmera
      var m = parentM ? mul(parentM, local(n)) : local(n);
      n.world = m;
      if (n.geo && seen(n.geo, m, pl, cam.eye, env.fog[1])) { if (n.alpha < 1) { late.push(n); } else { self.mesh(n); } }
      for (var i = 0; i < n.children.length; i++) { walk(n.children[i], m); }
    })(root, null);
    if (late.length) { gl.enable(gl.BLEND); gl.depthMask(false); late.forEach(function (n) { self.mesh(n); }); gl.depthMask(true); gl.disable(gl.BLEND); }
  };
  // fundo: desenhado antes do mundo, sem profundidade, por uma câmera parada na origem; tudo o que vem depois passa por cima
  var SEM_NEVOA = [1e6, 2e6], BRANCO = [1, 1, 1];
  Renderer.prototype.ceu = function (nodes, cam) {
    var gl = this.gl, u = this.u, self = this;
    gl.disable(gl.DEPTH_TEST); gl.uniformMatrix4fv(u.VP, false, new Float32Array(cam.skyVp));
    gl.uniform3fv(u.eye, [0, 0, 0]); gl.uniform3fv(u.tint, BRANCO);
    nodes.forEach(function (n) {
      if (!n.visible) { return; }
      gl.uniform2fv(u.fog, n.userData.fog || SEM_NEVOA);
      if (n.alpha < 1) { gl.enable(gl.BLEND); }
      self.mesh(n);
      if (n.alpha < 1) { gl.disable(gl.BLEND); }
    });
    gl.enable(gl.DEPTH_TEST);
  };
  // sobreposição em espaço de tela (espada em primeira pessoa): sem profundidade, sem neblina, recorte por alfa
  var ID4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  Renderer.prototype.overlay = function (nodes) {
    var gl = this.gl, u = this.u, self = this;
    gl.disable(gl.DEPTH_TEST); gl.uniformMatrix4fv(u.VP, false, ID4); gl.uniform2fv(u.fog, [1e6, 2e6]);
    nodes.forEach(function (n) {
      if (n.alpha < 1) { gl.enable(gl.BLEND); }
      self.mesh(n);
      if (n.alpha < 1) { gl.disable(gl.BLEND); }
    });
    gl.enable(gl.DEPTH_TEST);
  };
  Renderer.prototype.mesh = function (n) {
    var gl = this.gl, u = this.u;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer(n.geo));
    gl.vertexAttribPointer(this.aP, 3, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(this.aN, 3, gl.FLOAT, false, 32, 12); gl.vertexAttribPointer(this.aU, 2, gl.FLOAT, false, 32, 24);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[n.tex] || this.tex._branco);
    gl.uniformMatrix4fv(u.M, false, new Float32Array(n.world)); gl.uniformMatrix3fv(u.N, false, new Float32Array(normalMat(n.world)));
    gl.uniform3fv(u.col, n.color); gl.uniform3fv(u.emi, n.emissive);
    gl.uniform1f(u.alpha, n.alpha); gl.uniform1f(u.unlit, n.unlit ? 1 : 0);
    // peça de interior: as luzes da sala e, nas sem sombra (chamas, figuras), o brilho próprio no lugar da tinta do céu
    if (n.dentro) {
      var S = n.dentro; gl.uniform1f(u.dentro, 1); gl.uniform4fv(u.l1, S.l1); gl.uniform3fv(u.c1, S.c1); gl.uniform4fv(u.l2, S.l2); gl.uniform3fv(u.c2, S.c2);
      gl.uniform3fv(u.tint, n.brilho || BRANCO); this.inT = true;
    } else if (this.inT) { gl.uniform1f(u.dentro, 0); gl.uniform3fv(u.tint, this.envTint || BRANCO); this.inT = false; }
    var noCull = n.alpha < 1 || n.unlit;
    if (noCull) { gl.disable(gl.CULL_FACE); }
    gl.drawArrays(gl.TRIANGLES, 0, n.geo.count);
    if (noCull) { gl.enable(gl.CULL_FACE); }
  };

  // ---------- peças da vila ----------
  var GEO = {};
  function cached(key, fn) { return GEO[key] || (GEO[key] = fn()); }
  // box(w,h,d, textura, metros por repetição | 'fit', x,y,z, cor)
  function box(w, h, d, tex, map, x, y, z, color) {
    return new Node(cached('b' + [w, h, d, map], function () { return boxGeo(w, h, d, map); }), color === undefined ? 0xffffff : color, { tex: tex }).at(x || 0, y || 0, z || 0);
  }
  function cyl(rt, rb, h, seg, tex, map, off, color) {
    return new Node(cached('c' + [rt, rb, h, seg, off, map], function () { return cylGeo(rt, rb, h, seg, off, map); }), color === undefined ? 0xffffff : color, { tex: tex });
  }
  // figura (billboard): h = altura do quadro em metros; a largura sai da proporção do quadro do sprite
  function sGeo(dim, h) {
    var w = h * dim.w / dim.h;
    return cached('s' + w.toFixed(3) + 'x' + h.toFixed(3), function () { return spriteGeo(w, h); });
  }

  // placa de oficina: poste, braço e a placa pendurada à frente do poste, com as duas faces livres
  function placaPendurada(g, tex, x, z) {
    g.add(box(0.12, 3.2, 0.12, 'tabuas', 1, x, 1.6, z));
    g.add(box(0.08, 0.08, 1.2, 'tabuas', 1, x, 3.1, z + 0.6));
    [0.3, 0.9].forEach(function (k) { g.add(box(0.02, 0.16, 0.02, null, 1, x, 2.99, z + k, 0x3a3a42)); });
    g.add(box(0.08, 0.9, 0.9, tex, 'fit', x, 2.47, z + 0.6));
  }
  // I: o interior da construção (vila.json → interiores), ou nada. Com interior, a caixa maciça vira casca oca com o vão
  // da porta aberto, e o lado de dentro (paredes, móveis, porta aberta) é montado em sala()
  function house(b, wall, wallTile, roof, I) {
    var g = new Node();
    if (I) { g.add(cascaFora(b, I, wall, wallTile)); }
    else { g.add(box(b.w, b.h, b.d, wall, wallTile, 0, b.h / 2, 0)); }
    g.add(new Node(roofSlopeUV(gableGeo(b.w + 0.8, b.w * 0.45, b.d + 0.8, 2), b.d), 0xffffff, { tex: roof }).at(0, b.h, 0));
    if (!I) { g.add(box(1.4, 2.2, 0.1, 'porta', 'fit', 0, 1.1, b.d / 2 + 0.05)); }
    return g;
  }
  // JAN: enquanto se monta uma construção com interior, guarda as janelas da fachada para pôr o vidro também do lado de dentro
  var JAN = null;
  function win(g, x, y, z, side) {
    g.add(side ? box(0.08, 1.0, 1.0, 'janela', 'fit', x, y, z) : box(1.0, 1.0, 0.08, 'janela', 'fit', x, y, z));
    if (JAN) { JAN.push([x, y, z, side]); }
  }
  // faixa maciça que dá a volta na construção (embasamento, cinta): com interior, vira moldura de quatro lados, aberta na porta (dw)
  function aro(g, I, W, D, h, y, tex, map, color, dw) {
    if (!I) { g.add(box(W, h, D, tex, map, 0, y, 0, color)); return; }
    var e = 0.3;
    g.add(box(W, h, e, tex, map, 0, y, -D / 2 + e / 2, color));
    [-1, 1].forEach(function (s) { g.add(box(e, h, D - 2 * e, tex, map, s * (W / 2 - e / 2), y, 0, color)); });
    if (!dw) { g.add(box(W, h, e, tex, map, 0, y, D / 2 - e / 2, color)); return; }
    [-1, 1].forEach(function (s) { g.add(box((W - dw) / 2, h, e, tex, map, s * (dw / 2 + (W - dw) / 4), y, D / 2 - e / 2, color)); });
  }
  function church(b, I) {
    var g = house(b, 'cal', 2.5, 'telha_escura', I), tw = 2.6, th = b.h + 4.5, tz = b.d / 2 - tw / 2 - 0.2;
    // a torre nasce dentro da nave: com interior, começa no forro (de fora, a parte de baixo nunca apareceu)
    if (I) { g.add(box(tw, th - b.h + 0.2, tw, 'cal', 2.5, 0, (th + b.h - 0.2) / 2, tz)); } else { g.add(box(tw, th, tw, 'cal', 2.5, 0, th / 2, tz)); }
    g.add(cyl(0, tw * 0.75, 3, 4, 'telha_escura', 1.5, Math.PI / 4).at(0, th + 1.5, tz));
    g.add(box(0.15, 1.2, 0.15, null, 1, 0, th + 3.5, tz, 0x2b2b2b)); g.add(box(0.7, 0.15, 0.15, null, 1, 0, th + 3.7, tz, 0x2b2b2b));
    win(g, 0, th - 2.2, tz + tw / 2 + 0.05);
    // lintel de pedra sobre a porta e cruz dourada, a mesma tinta das placas, com borda de madeira
    var fz = b.d / 2;
    g.add(box(2, 0.24, 0.14, 'pedra', 1, 0, 2.34, fz + 0.07));
    g.add(box(0.36, 1.9, 0.06, 'tabuas', 0.64, 0, 3.6, fz + 0.03)); g.add(box(1.2, 0.36, 0.06, 'tabuas', 0.64, 0, 3.95, fz + 0.03));
    g.add(box(0.2, 1.74, 0.03, null, 1, 0, 3.6, fz + 0.075, 0xd9b24a));
    g.add(box(1.04, 0.2, 0.03, null, 1, 0, 3.95, fz + 0.075, 0xd9b24a));
    for (var i = -1; i <= 1; i++) { win(g, b.w / 2 + 0.05, 2.8, i * 2.6, true); win(g, -b.w / 2 - 0.05, 2.8, i * 2.6, true); }
    return g;
  }
  function smith(b, I) {
    var g = house(b, 'pedra', 2, 'palha', I);
    g.add(box(1, 3, 1, 'pedra', 1, b.w / 2 - 1, b.h + 1.5, -b.d / 4));
    g.add(box(1.6, 1, 1.2, 'pedra', 1, -2, 0.5, b.d / 2 + 1.2));
    var coal = box(1.2, 0.3, 0.9, null, 1, -2, 1.05, b.d / 2 + 1.2, 0xd8581c); coal.unlit = true; g.add(coal);
    g.add(box(0.9, 0.3, 0.4, null, 1, 2, 0.65, b.d / 2 + 1.3, 0x3a3a42)); g.add(box(0.4, 0.5, 0.4, 'tabuas', 1, 2, 0.25, b.d / 2 + 1.3));
    win(g, 2.2, 1.9, b.d / 2 + 0.05);
    placaPendurada(g, 'placa_ferreiro', b.w / 2 + 0.6, b.d / 2 + 0.6);
    return g;
  }
  function bar(b, I) {
    var g = house(b, 'enxaimel', 2.5, 'telha', I);
    aro(g, I, b.w + 0.1, b.d + 0.1, 0.25, 2.6, 'tabuas', 1, 0x8a7a6a, 0);
    win(g, -2.4, 1.6, b.d / 2 + 0.05); win(g, 2.4, 1.6, b.d / 2 + 0.05); win(g, -2.4, 3.8, b.d / 2 + 0.05); win(g, 2.4, 3.8, b.d / 2 + 0.05);
    placaPendurada(g, 'placa', b.w / 2 + 0.6, b.d / 2 + 0.6);
    for (var i = 0; i < 2; i++) { g.add(cyl(0.4, 0.4, 0.9, 8, 'tabuas', 0.8).at(-b.w / 2 + 0.6 + i * 0.9, 0.45, b.d / 2 + 0.7)); }
    return g;
  }

  // objetos fixos do cenário, como as construções e a cerca. PX = metros por repetição de 'tabuas' a 100 px por metro
  var PX = 0.64;
  // peça com a arte pintada: sem sombra do sol, como as figuras, senão some nas faces viradas para o oeste
  function pintura(o) { o.color = hex(0xf2f2f2); o.unlit = true; return o; }
  function quadroAvisos() {
    var g = new Node();
    [-0.66, 0.66].forEach(function (x) { g.add(box(0.14, 2.1, 0.14, 'tabuas', PX, x, 1.05, -0.1)); }); // postes atrás do painel
    g.add(box(1.6, 1.28, 0.06, 'tabuas', PX, 0, 1.36, 0));
    g.add(pintura(box(1.56, 1.24, 0.01, 's:quadro_frente', 'fit', 0, 1.36, 0.036)));
    g.add(new Node(cached('telhadinho', function () { return gableGeo(1.95, 0.42, 0.56, PX); }), 0xc9b8a4, { tex: 'tabuas' }).at(0, 2.03, 0));
    return g;
  }
  function tora(x, y) {
    var r = 0.08, len = 0.46, z = 0.04, t = new Node(cached('tora', function () { return rotX(cylGeo(r, r, len, 8, 0, PX), Math.PI / 2); }), 0x8a6a4a, { tex: 'tabuas' }).at(x, y, z);
    return [t, pintura(box(0.16, 0.16, 0.006, 's:lenha_topo', 'fit', x, y, z + len / 2 + 0.004))];
  }
  function bauAberto() {
    var g = new Node(), W = 1, H = 0.46, D = 0.66, t = 0.05, a = 0.42, L = 0.6;
    g.add(box(W, H, t, 'tabuas', PX, 0, H / 2, D / 2 - t / 2)); g.add(box(W, H, t, 'tabuas', PX, 0, H / 2, -D / 2 + t / 2));
    [-1, 1].forEach(function (s) { g.add(box(t, H, D - 2 * t, 'tabuas', PX, s * (W - t) / 2, H / 2, 0)); });
    g.add(box(W - 2 * t, 0.04, D - 2 * t, 'tabuas', PX, 0, 0.26, 0, 0x6a5444));   // fundo falso: o baú está cheio
    g.add(pintura(box(0.98, 0.45, 0.01, 's:bau_frente', 'fit', 0, 0.225, D / 2 + 0.006)));
    // tampa aberta: dobradiça no alto do fundo, inclinada para trás; o lado de dentro olha para cima e para a frente
    var cy = H + Math.cos(a) * L / 2, cz = -D / 2 - Math.sin(a) * L / 2, ny = Math.sin(a), nz = Math.cos(a);
    g.add(new Node(cached('tampa', function () { return rotX(boxGeo(W, L, 0.04, PX), -a); }), 0xffffff, { tex: 'tabuas' }).at(0, cy, cz));
    g.add(pintura(new Node(cached('tampa_in', function () { return rotX(boxGeo(0.98, 0.6, 0.006, 'fit'), -a); }), 0xffffff, { tex: 's:bau_tampa' }).at(0, cy + ny * 0.024, cz + nz * 0.024)));
    // conteúdo: toras à esquerda, lingotes à direita, couro pendurado na borda
    [[-0.34, 0.36], [-0.17, 0.36], [-0.255, 0.5]].forEach(function (p) { tora(p[0], p[1]).forEach(function (n) { g.add(n); }); });
    [[0.14, 0.32, 0.08], [0.33, 0.32, 0.08], [0.235, 0.32, -0.12], [0.235, 0.41, 0]].forEach(function (p) {
      g.add(box(0.2, 0.08, 0.13, null, 1, p[0], p[1], p[2], 0x8d939e)); g.add(box(0.16, 0.02, 0.09, null, 1, p[0], p[1] + 0.05, p[2], 0xb4bac4));
    });
    g.add(pintura(box(0.48, 0.6, 0.006, 's:bau_couro', 'fit', 0.08, 0.36, D / 2 + 0.016)));
    return g;
  }

  // ---------- a cidade: construções novas ----------
  function casaSenhor(b, I) {
    var g = new Node(), W = b.w, D = b.d, H = b.h, fz = D / 2, tw = 2.8, th = H + 2.6, tx = W / 2 - tw / 2, tz = fz - tw / 2, rh = (W + 0.8) * 0.42;
    if (I) { g.add(cascaFora(b, I, 'pedra', 2)); } else { g.add(box(W - 0.2, H, D - 0.2, 'pedra', 2, 0, H / 2, 0)); }
    aro(g, I, W, D, 0.6, 0.3, 'pedra', 1, 0x8c8880, I && I.porta[0]); // embasamento
    aro(g, I, W, D, 0.2, 3.6, 'pedra', 1, 0xc4c0b4, 0);               // cinta entre os andares
    g.add(new Node(roofSlopeUV(gableGeo(W + 0.8, rh, D + 0.8, 2), D), 0xffffff, { tex: 'telha_escura' }).at(0, H, 0));
    g.add(new Node(cached('empena', function () { return gableGeo(W + 0.5, (W + 0.5) * 0.42, 0.44, 2); }), 0xffffff, { tex: 'pedra' }).at(0, H, fz + 0.2));
    // duas torres na fachada, mais altas que a cumeeira
    [-1, 1].forEach(function (s) {
      var x = s * tx;
      g.add(box(tw, th, tw, 'pedra', 2, x, th / 2, tz));
      g.add(box(tw + 0.2, 0.3, tw + 0.2, 'pedra', 1, x, th - 0.1, tz, 0xc4c0b4));
      g.add(cyl(0, tw * 0.82, 3.6, 4, 'telha_escura', 1.5, Math.PI / 4).at(x, th + 1.9, tz));
      g.add(box(0.1, 1, 0.1, null, 1, x, th + 4.1, tz, 0x2b2b2b));
      g.add(box(0.05, 0.46, 0.7, null, 1, x + 0.01, th + 4.36, tz + 0.38, 0x8a2a26)); // flâmula
      win(g, x, 6.2, fz + 0.05); win(g, x, 8.2, fz + 0.05); win(g, s * (W / 2 + 0.05), 6.2, tz, true);
      // estandarte vermelho com o brasão, um de cada lado da entrada
      g.add(box(1.1, 2.3, 0.05, null, 1, x, 2.5, fz + 0.03, 0x7a2522));
      g.add(box(1.1, 0.12, 0.08, 'tabuas', PX, x, 3.62, fz + 0.03)); g.add(box(1.1, 0.08, 0.06, null, 1, x, 1.38, fz + 0.03, 0xd9b24a));
      g.add(pintura(box(0.8, 0.9, 0.01, 'brasao', 'fit', x, 2.6, fz + 0.06)));
      // as janelas dos lados e a chaminé de cada ala
      [-3.2, 0].forEach(function (z) { win(g, s * (W / 2 - 0.05), 2.2, z, true); win(g, s * (W / 2 - 0.05), 5.2, z, true); });
      g.add(box(1.1, 4.4, 1.1, 'pedra', 1, s * 3, H + 2.2, -2)); g.add(box(1.4, 0.2, 1.4, 'pedra', 1, s * 3, H + 4.4, -2, 0xc4c0b4));
      win(g, s * 3, 2.2, -fz + 0.05); win(g, s * 3, 5.2, -fz + 0.05);
      win(g, s * 1.8, 5.2, fz - 0.05);
      // portal em duas folhas, com ombreiras de pedra
      if (!I) { g.add(box(1.2, 2.7, 0.1, 'porta', 'fit', s * 0.6, 1.35, fz + 0.02)); } // com interior, as folhas ficam abertas por dentro
      g.add(box(0.4, 3, 0.34, 'pedra', 1, s * 1.42, 1.5, fz + 0.1, 0xc4c0b4));
    });
    g.add(box(3.4, 0.46, 0.36, 'pedra', 1, 0, 3.02, fz + 0.1, 0xc4c0b4));
    g.add(box(4, 0.1, 1.1, 'pedra', 1, 0, 0.05, fz + 0.55)); g.add(box(3.2, 0.1, 0.6, 'pedra', 1, 0, 0.15, fz + 0.3));
    win(g, 0, H + 2.5, fz + 0.45);
    g.add(pintura(box(1.5, 1.7, 0.01, 'brasao', 'fit', 0, 5.2, fz - 0.09)));
    return g;
  }
  function padaria(b, I) {
    var g = house(b, 'tijolo', 2, 'telha', I), fz = b.d / 2;
    aro(g, I, b.w + 0.1, b.d + 0.1, 0.5, 0.25, 'pedra', 1, undefined, I && I.porta[0]);
    win(g, -2.4, 1.7, fz + 0.05); win(g, 2.4, 1.7, fz + 0.05); win(g, -b.w / 2 - 0.05, 1.7, 0, true);
    // a chaminé do forno de dentro, larga, sobre a água leste do telhado
    g.add(box(1.5, 4.8, 1.5, 'tijolo', 1.5, b.w / 2 - 1.4, b.h + 2.4, -0.8)); g.add(box(1.9, 0.24, 1.9, 'pedra', 1, b.w / 2 - 1.4, b.h + 4.8, -0.8));
    placaPendurada(g, 'placa_padaria', b.w / 2 + 0.6, fz + 0.6);
    // banca de pães junto à janela
    var tx = -2.4, tz = fz + 0.55;
    g.add(box(2, 0.08, 0.8, 'tabuas', PX, tx, 0.86, tz));
    [-0.9, 0.9].forEach(function (x) { g.add(box(0.1, 0.82, 0.7, 'tabuas', PX, tx + x, 0.41, tz)); });
    for (var i = 0; i < 5; i++) {
      var x = tx - 0.72 + i * 0.36;
      g.add(box(0.3, 0.13, 0.46, null, 1, x, 0.96, tz + (i % 2 ? 0.1 : -0.1), 0xb87a30)); g.add(box(0.22, 0.05, 0.36, null, 1, x, 1.04, tz + (i % 2 ? 0.1 : -0.1), 0xdca85a));
    }
    // sacas de farinha ao lado da porta
    [[1.4, 0.32, 0], [2, 0.32, 0.1], [1.7, 0.86, 0.04]].forEach(function (p) { g.add(box(0.56, 0.6, 0.42, null, 1, p[0], p[1], fz + 0.34 + p[2], 0xd8d0bd)); });
    return g;
  }
  // forno de barro e tijolo, encostado na padaria: base de pedra, abóbada, boca em brasa e o seu próprio cano
  function forno(b) {
    var g = new Node(), fz = b.d / 2;
    g.add(box(b.w, 0.7, b.d, 'pedra', 1, 0, 0.35, 0));
    [[1.1, 0.92, 0.3, 0.85], [0.92, 0.62, 0.3, 1.15], [0.62, 0.2, 0.22, 1.41]].forEach(function (c) { g.add(cyl(c[1], c[0], c[2], 12, 'tijolo', 1).at(0, c[3], -0.05)); });
    g.add(box(1.1, 0.74, 0.3, 'tijolo', 1, 0, 1.07, fz - 0.3));
    g.add(box(1.3, 0.12, 0.4, 'pedra', 1, 0, 1.48, fz - 0.28));
    g.add(box(0.7, 0.5, 0.03, null, 1, 0, 0.98, fz - 0.14, 0x1c1410));
    var brasa = box(0.54, 0.12, 0.02, null, 1, 0, 0.8, fz - 0.12, 0xd8581c); brasa.unlit = true; g.add(brasa);
    g.add(box(0.44, 1.6, 0.44, 'tijolo', 1, 0, 2.2, 0.4)); g.add(box(0.6, 0.1, 0.6, 'pedra', 1, 0, 3, 0.4));
    [[0.1, 0.08], [0.1 + 0.17, 0.08], [0.1 + 0.085, 0.22]].forEach(function (p) {
      tora(p[0], p[1]).forEach(function (n) { n.pos[0] += 0.7; n.pos[2] += fz + 0.24; g.add(n); });
    });
    return g;
  }
  // alfaiate: oficina modesta de enxaimel, com rolos de pano na banca junto à janela e um manequim ao lado da porta
  function alfaiate(b, I) {
    var g = house(b, 'enxaimel', 2.5, 'telha', I), fz = b.d / 2;
    aro(g, I, b.w + 0.1, b.d + 0.1, 0.36, 0.18, 'pedra', 1, undefined, I && I.porta[0]);
    win(g, -1.9, 1.7, fz + 0.05); win(g, 1.9, 1.7, fz + 0.05);
    win(g, b.w / 2 + 0.05, 1.7, 0, true); win(g, -b.w / 2 - 0.05, 1.7, 0, true);
    placaPendurada(g, 'placa_alfaiate', b.w / 2 + 0.6, fz + 0.6);
    var tx = -1.9, tz = fz + 0.5;
    g.add(box(1.7, 0.08, 0.7, 'tabuas', PX, tx, 0.82, tz));
    [-0.75, 0.75].forEach(function (x) { g.add(box(0.1, 0.78, 0.6, 'tabuas', PX, tx + x, 0.39, tz)); });
    [0x7a2522, 0x2c4a7a, 0x5a7a3a, 0xd8c8a0, 0x8a6a9a].forEach(function (c, i) { // rolos de pano deitados
      g.add(box(0.24, 0.22, 0.6, null, 1, tx - 0.6 + i * 0.3, 0.97 + (i === 2 ? 0.2 : 0), tz, c));
    });
    var mx = 1.55, mz = fz + 0.5;                                                   // manequim de costura
    g.add(box(0.36, 0.06, 0.36, 'tabuas', PX, mx, 0.03, mz)); g.add(box(0.07, 0.95, 0.07, 'tabuas', PX, mx, 0.5, mz));
    g.add(box(0.46, 0.62, 0.28, null, 1, mx, 1.28, mz, 0x6a3a5a)); g.add(box(0.36, 0.12, 0.24, null, 1, mx, 1.64, mz, 0x6a3a5a));
    return g;
  }
  // portão da vila: dois mourões altos com travessa e um telhadinho, sem cerca, marcando a entrada pela estrada
  function portao(gt) {
    var g = new Node().at(gt.x, 0, gt.z), x = gt.w / 2 + 0.5;
    [-x, x].forEach(function (s) { g.add(box(0.36, 4.2, 0.36, 'tabuas', 1, s, 2.1, 0)); g.add(box(0.6, 0.5, 0.6, 'pedra', 1, s, 0.25, 0)); });
    g.add(box(x * 2 + 1, 0.3, 0.3, 'tabuas', 1, 0, 3.9, 0));
    g.add(new Node(cached('portao_telhado', function () { return gableGeo(x * 2 + 1.6, 0.7, 1, 1); }), 0xffffff, { tex: 'telha_escura' }).at(0, 4.05, 0));
    return g;
  }
  // pedra solta do pedregal: blocos tortos uns sobre os outros
  function pedra(p, i) {
    var s = p[2], g = new Node().at(p[0], 0, p[1]);
    g.rotY = sorte(i + 0.1) * 6.28;
    g.add(box(s, s * 0.62, s * 0.8, 'pedra', 1.2, 0, s * 0.31, 0, 0xd8d4ca));
    var t = box(s * 0.7, s * 0.5, s * 0.6, 'pedra', 1.2, s * 0.12, s * 0.8, -s * 0.05, 0xe4e0d6); t.rotY = 0.5; g.add(t);
    var u = box(s * 0.5, s * 0.34, s * 0.5, 'pedra', 1.2, -s * 0.45, s * 0.17, s * 0.3, 0xc8c4ba); u.rotY = -0.4; g.add(u);
    return g;
  }
  // moita sem figura própria (até a arte ter 'arbusto'): três bolos de folhagem achatados
  function moita(p, i) {
    var s = p[2], g = new Node().at(p[0], 0, p[1]);
    [[0, 0, 0.62, 0.7], [0.42, 0.18, 0.44, 0.5], [-0.36, -0.2, 0.46, 0.55]].forEach(function (b, k) {
      g.add(cyl(b[2] * 0.7, b[2], b[3], 6, 'grama', 1, sorte(i + k) * 3, 0x6a8a3e).at(b[0], b[3] / 2, b[1]));
    });
    g.scale = [s, s, s];
    return g;
  }
  function moradia(b) {
    var cal = b.wall === 'cal', g = house(b, b.wall, cal ? 2.5 : 1.28, 'palha'), fz = b.d / 2;
    g.add(box(b.w + 0.1, 0.36, b.d + 0.1, 'pedra', 1, 0, 0.18, 0));
    win(g, -1.9, 1.6, fz + 0.05); win(g, 1.9, 1.6, fz + 0.05);
    win(g, b.w / 2 + 0.05, 1.6, 0, true); win(g, -b.w / 2 - 0.05, 1.6, 0, true);
    if (b.chimney) { g.add(box(0.8, 2.6, 0.8, 'pedra', 1, -1.5, b.h + 1.9, -1.2)); }
    // na frente: barril de chuva ou lenha encostada
    if (cal) { g.add(cyl(0.34, 0.34, 0.8, 8, 'tabuas', 0.8).at(2.5, 0.4, fz + 0.4)); }
    else { [[0, 0.08], [0.17, 0.08], [0.085, 0.22]].forEach(function (p) { tora(p[0], p[1]).forEach(function (n) { n.pos[0] += 2.2; n.pos[2] += fz + 0.26; g.add(n); }); }); }
    return g;
  }

  // ---------- interiores (vila.json → interiores) ----------
  // A sala fica dentro da própria construção, com as paredes ocas: a posição do jogador continua sendo a do mundo, então
  // mapa, caminhos, proximidade dos NPCs e saves funcionam sem portal. Medidas em metros, no referencial da construção:
  // x ao longo da fachada, z para a frente (a porta fica em z = +d/2). A face de dentro das paredes cai em
  // ±(w/2 - 0,5), ±(d/2 - 0,5), na borda das células de 1 m de sim.js: o jogador encosta na parede que vê
  function cascaDim(b) { var k = b.type === 'casa_senhor' ? 0.1 : 0; return { hx: b.w / 2 - k, hz: b.d / 2 - k, a: b.w / 2 - 0.5, c: b.d / 2 - 0.5, H: b.h }; }
  function face(g, ax, az, bx, bz, y0, y1) { g.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]); } // normal para (-dz, 0, dx)
  // fora: as quatro faces de fora, com o vão da porta; senão, as de dentro, as ombreiras e a verga. y vai de -H/2 a H/2,
  // como na caixa inteira de antes, para a textura da fachada cair no mesmo lugar
  function casca(C, porta, fora, map) {
    var g = new Geo(), hx = C.hx, hz = C.hz, a = C.a, c = C.c, y0 = -C.H / 2, y1 = C.H / 2, w = porta[0] / 2, t = porta[1] - C.H / 2;
    if (fora) {
      face(g, -hx, hz, -w, hz, y0, y1); face(g, w, hz, hx, hz, y0, y1); face(g, -w, hz, w, hz, t, y1);
      face(g, hx, hz, hx, -hz, y0, y1); face(g, hx, -hz, -hx, -hz, y0, y1); face(g, -hx, -hz, -hx, hz, y0, y1);
    } else {
      face(g, -a, -c, a, -c, y0, y1); face(g, a, -c, a, c, y0, y1); face(g, -a, c, -a, -c, y0, y1);
      face(g, a, c, w, c, y0, y1); face(g, -w, c, -a, c, y0, y1); face(g, w, c, -w, c, t, y1);
      face(g, -w, hz, -w, c, y0, t); face(g, w, c, w, hz, y0, t);
      g.quad([-w, t, c], [w, t, c], [w, t, hz], [-w, t, hz]);
    }
    return g.done(map);
  }
  function cascaFora(b, I, tex, map) { return new Node(casca(cascaDim(b), I.porta, true, map), 0xffffff, { tex: tex }).at(0, b.h / 2, 0); }

  var MAD = 0xd0c0aa, MADE = 0x8a6a4a, FERRO = 0x3a3a42, ACO = 0xa4aab4, VERM = 0x7a2522, OURO = 0xd9b24a, LINHO = 0xe8e0cc, CERA = 0xf0e8d0;
  function acesa(o) { o.unlit = true; return o; } // brasa e chama: brilho próprio, de dia e de noite
  function chama(g, x, y, z, s) { s = s || 1; g.add(acesa(box(0.05 * s, 0.11 * s, 0.05 * s, null, 1, x, y + 0.055 * s, z, 0xffc040))); }
  function pernas(g, W, D, h, t, cor) {
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { g.add(box(t, h, t, 'tabuas', PX, sx * (W / 2 - t / 2 - 0.04), h / 2, sz * (D / 2 - t / 2 - 0.04), cor)); }); });
  }
  function deitado(r, len, x, y, z, cor, tex) { // cilindro deitado ao longo de z (tonel, rolo de pano)
    return new Node(cached('dt' + [r, len], function () { return rotX(cylGeo(r, r, len, 10, 0, 0.8), Math.PI / 2); }), cor, { tex: tex === undefined ? 'tabuas' : tex }).at(x, y, z);
  }
  function estante(g, W, D, H, n) { // estante encostada na parede de trás (-z); devolve a altura de cada prateleira
    [-1, 1].forEach(function (s) { g.add(box(0.06, H, D, 'tabuas', PX, s * (W / 2 - 0.03), H / 2, 0, MADE)); });
    g.add(box(W, H, 0.03, 'tabuas', PX, 0, H / 2, -D / 2 + 0.015, MADE));
    var ys = [];
    for (var i = 0; i < n; i++) { var y = 0.12 + i * (H - 0.2) / (n - 1 || 1); ys.push(y); g.add(box(W - 0.1, 0.04, D - 0.04, 'tabuas', PX, 0, y, 0.01, MAD)); }
    return ys;
  }
  // cada móvel no seu referencial: largura W em x, fundura D em z, frente para +z (o encosto e a parede ficam em -z)
  var MOVEL = {
    banco: function (g, W, D) {
      g.add(box(W, 0.06, D, 'tabuas', PX, 0, 0.45, 0, MAD));
      if (W >= D) { [-1, 1].forEach(function (s) { g.add(box(0.06, 0.42, D * 0.8, 'tabuas', PX, s * (W / 2 - 0.15), 0.21, 0, MADE)); }); }
      else { [-1, 1].forEach(function (s) { g.add(box(W * 0.8, 0.42, 0.06, 'tabuas', PX, 0, 0.21, s * (D / 2 - 0.15), MADE)); }); }
    },
    mesa: function (g, W, D, m) {
      g.add(box(W, 0.07, D, 'tabuas', PX, 0, 0.76, 0, MAD)); pernas(g, W, D, 0.73, 0.08, MADE);
      [[-0.3, -0.2], [0.25, 0.15]].forEach(function (p) { // canecas e uma tigela
        g.add(cyl(0.05, 0.045, 0.13, 6, 'tabuas', PX, 0, MADE).at(p[0] * W, 0.86, p[1] * D));
      });
      g.add(cyl(0.14, 0.08, 0.07, 8, null, 1, 0, 0x9a8a7a).at(0, 0.83, 0));
      if (m.cor) { g.add(box(W * 0.7, 0.01, D * 0.6, null, 1, 0, 0.8, 0, m.cor)); }
    },
    mesa_alta: function (g, W, D) { // mesa do senhor: toalha até o chão na frente e nos lados
      g.add(box(W, 0.07, D, 'tabuas', PX, 0, 0.8, 0, MADE));
      g.add(box(W + 0.04, 0.74, D * 0.7, null, 1, 0, 0.41, D * 0.1, LINHO));
      g.add(box(W + 0.06, 0.03, D + 0.04, null, 1, 0, 0.85, 0, LINHO));
      g.add(box(W + 0.07, 0.28, 0.02, null, 1, 0, 0.66, D * 0.45 + 0.03, VERM)); g.add(box(W + 0.07, 0.05, 0.025, null, 1, 0, 0.5, D * 0.45 + 0.035, OURO));
      for (var x = -W / 2 + 0.6; x < W / 2 - 0.3; x += 1) {
        g.add(cyl(0.16, 0.16, 0.02, 8, null, 1, 0, 0x9aa0aa).at(x, 0.875, -D * 0.15));
        g.add(cyl(0.045, 0.03, 0.18, 6, null, 1, 0, OURO).at(x + 0.3, 0.96, -D * 0.2));
      }
      g.add(box(0.5, 0.16, 0.3, null, 1, 0.4, 0.95, 0.05, 0xb87a30)); g.add(cyl(0.2, 0.15, 0.08, 8, null, 1, 0, 0x9a8a7a).at(-1.1, 0.9, 0.05));
    },
    balcao: function (g, W, D) {
      g.add(box(W, 0.98, D, 'tabuas', PX, 0, 0.49, 0, MADE)); g.add(box(W + 0.08, 0.06, D + 0.12, 'tabuas', PX, 0, 1.01, 0, MAD));
      for (var x = -W / 2 + 0.4; x < W / 2 - 0.2; x += 0.9) { g.add(cyl(0.055, 0.05, 0.14, 6, 'tabuas', PX, 0, MADE).at(x, 1.11, 0.1)); }
      g.add(cyl(0.09, 0.12, 0.3, 8, null, 1, 0, 0x8a6a5a).at(W / 2 - 0.35, 1.19, -0.1));
    },
    barril: function (g, W, D) {
      var r = Math.min(W, D) * 0.4;
      g.add(cyl(r, r, 0.9, 10, 'tabuas', 0.8, 0, MAD).at(0, 0.45, 0));
      [0.18, 0.72].forEach(function (y) { g.add(cyl(r + 0.015, r + 0.015, 0.05, 10, null, 1, 0, FERRO).at(0, y, 0)); });
    },
    tina: function (g, W, D) { MOVEL.barril(g, W, D); var r = Math.min(W, D) * 0.4; g.add(cyl(r - 0.02, r - 0.02, 0.01, 10, null, 1, 0, 0x4a6a7a).at(0, 0.905, 0)); },
    tonel: function (g, W, D) { // toneis deitados na armação, com a torneira virada para a sala
      [-1, 1].forEach(function (s) { g.add(box(W, 0.12, 0.12, 'tabuas', PX, 0, 0.1, s * (D / 2 - 0.15), MADE)); });
      var n = Math.max(1, Math.floor(W / 0.95));
      for (var i = 0; i < n; i++) {
        var x = -W / 2 + (i + 0.5) * W / n;
        g.add(deitado(0.42, D * 0.88, x, 0.58, 0, MAD));
        [-0.3, 0.3].forEach(function (k) { g.add(new Node(cached('aro_tonel', function () { return rotX(cylGeo(0.435, 0.435, 0.05, 10, 0, 1), Math.PI / 2); }), FERRO).at(x, 0.58, k * D)); });
        g.add(box(0.05, 0.05, 0.12, null, 1, x, 0.38, D * 0.44 + 0.06, FERRO));
        if (i % 2 === 0) { g.add(deitado(0.28, D * 0.6, x, 1.27, -0.05, MAD)); }
      }
    },
    lareira: function (g, W, D, m, I) {
      g.add(box(W, 0.15, D, 'pedra', 1, 0, 0.075, 0, 0x9a948a));
      [-1, 1].forEach(function (s) { g.add(box(0.3, 1.3, D, 'pedra', 1, s * (W / 2 - 0.15), 0.8, 0)); });
      g.add(box(W - 0.6, 1.3, 0.1, null, 1, 0, 0.8, -D / 2 + 0.05, 0x2a2420));
      g.add(box(W + 0.2, 0.28, D + 0.1, 'pedra', 1, 0, 1.59, 0.05, 0xc4c0b4));
      g.add(box(W * 0.85, I.teto - 1.73, D * 0.75, 'pedra', 1, 0, (I.teto + 1.73) / 2, -D * 0.125));
      [[-0.12, 0.3], [0.12, -0.3]].forEach(function (p) { var t = box(0.7, 0.1, 0.12, null, 1, 0, 0.22, p[0], MADE); t.rotY = p[1]; g.add(t); });
      g.add(acesa(box(W - 0.8, 0.03, D * 0.6, null, 1, 0, 0.17, 0, 0xd8581c)));
      [[0, 0.42, 0, 0.3, 0xe86a1c], [-0.2, 0.34, 0.06, 0.2, 0xffc040], [0.2, 0.36, -0.04, 0.2, 0xe86a1c], [0.05, 0.6, 0.02, 0.14, 0xffc040]].forEach(function (f) {
        g.add(acesa(box(f[3], f[3] * 1.3, f[3] * 0.7, null, 1, f[0], f[1], f[2], f[4])));
      });
    },
    forja: function (g, W, D, m, I) {
      g.add(box(W, 0.85, D, 'pedra', 1, 0, 0.425, 0));
      g.add(box(W + 0.06, 0.08, D + 0.06, 'pedra', 1, 0, 0.87, 0, 0x8c8880));
      g.add(acesa(box(W * 0.62, 0.05, D * 0.55, null, 1, 0, 0.91, 0.05, 0xd8581c))); g.add(acesa(box(W * 0.3, 0.06, D * 0.25, null, 1, 0.05, 0.93, 0.05, 0xffb040)));
      g.add(cyl(0.3, W * 0.62, 1.1, 4, 'pedra', 1, Math.PI / 4).at(0, 2.05, -D * 0.1));
      g.add(box(0.5, I.teto - 2.6, 0.5, 'pedra', 1, 0, (I.teto + 2.6) / 2, -D * 0.1));
      g.add(box(0.6, 0.03, 0.04, null, 1, W * 0.25, 0.93, D * 0.38, FERRO)); g.add(box(0.5, 0.025, 0.04, null, 1, W * 0.25, 0.95, D * 0.42, FERRO));
    },
    fole: function (g, W, D) { // fole: a ponta (+z) vai para a forja
      g.add(box(W * 0.6, 0.5, D * 0.8, 'tabuas', PX, 0, 0.25, 0, MADE));
      g.add(box(W * 0.55, 0.05, D * 0.7, 'tabuas', PX, 0, 0.53, 0, MAD)); g.add(box(W * 0.5, 0.18, D * 0.6, null, 1, 0, 0.64, -0.02, 0x5a3a26));
      g.add(box(W * 0.55, 0.05, D * 0.7, 'tabuas', PX, 0, 0.75, 0, MAD));
      g.add(box(0.07, 0.07, 0.45, null, 1, 0, 0.62, D * 0.35 + 0.22, FERRO)); g.add(box(0.05, 0.05, 0.4, 'tabuas', PX, 0, 0.8, -D * 0.45, MADE));
    },
    bigorna: function (g) {
      g.add(cyl(0.28, 0.32, 0.5, 8, 'tabuas', PX, 0, MADE).at(0, 0.25, 0));
      g.add(box(0.3, 0.12, 0.22, null, 1, 0, 0.56, 0, FERRO)); g.add(box(0.18, 0.1, 0.14, null, 1, 0, 0.67, 0, FERRO));
      g.add(box(0.56, 0.12, 0.22, null, 1, 0, 0.78, 0, 0x4a4a52)); g.add(box(0.2, 0.08, 0.12, null, 1, 0.36, 0.79, 0, 0x4a4a52));
      g.add(box(0.05, 0.05, 0.26, 'tabuas', PX, -0.1, 0.87, 0.02, MADE)); g.add(box(0.14, 0.07, 0.07, null, 1, -0.1, 0.87, 0.16, FERRO));
    },
    armas: function (g, W, D) { // armeiro de parede: espadas de ponta para cima e machados
      var z = -D / 2 + 0.16;
      [-1, 1].forEach(function (s) { g.add(box(0.08, 1.75, 0.08, 'tabuas', PX, s * (W / 2 - 0.06), 0.875, -D / 2 + 0.08, MADE)); });
      [0.4, 1.45].forEach(function (y) { g.add(box(W, 0.07, 0.07, 'tabuas', PX, 0, y, -D / 2 + 0.1, MADE)); });
      var n = Math.max(2, Math.floor((W - 0.3) / 0.3));
      for (var i = 0; i < n; i++) {
        var x = -W / 2 + 0.3 + i * (W - 0.6) / (n - 1);
        if (i % 3 === 2) { g.add(box(0.045, 1.0, 0.045, 'tabuas', PX, x, 0.62, z, MADE)); g.add(box(0.22, 0.16, 0.03, null, 1, x + 0.08, 1.04, z, ACO)); continue; }
        g.add(box(0.035, 0.18, 0.035, null, 1, x, 0.38, z, 0x5a3a26)); g.add(box(0.22, 0.035, 0.05, null, 1, x, 0.49, z, FERRO));
        g.add(box(0.055, 0.8, 0.015, null, 1, x, 0.9, z, ACO));
      }
    },
    bancada: function (g, W, D) { // bancada com ferramentas e a tábua de ferramentas na parede
      g.add(box(W, 0.1, D, 'tabuas', PX, 0, 0.82, 0, MADE)); pernas(g, W, D, 0.78, 0.1, MADE);
      g.add(box(0.2, 0.18, 0.16, null, 1, W / 2 - 0.2, 0.96, 0, FERRO));
      g.add(box(0.05, 0.04, 0.3, 'tabuas', PX, -0.3, 0.89, 0.1, MADE)); g.add(box(0.12, 0.07, 0.07, null, 1, -0.3, 0.9, 0.27, FERRO));
      g.add(box(W * 0.9, 0.55, 0.03, 'tabuas', PX, 0, 1.6, -D / 2 + 0.015, MADE));
      for (var i = 0; i < 5; i++) { var x = -W * 0.38 + i * W * 0.19; g.add(box(0.04, 0.34, 0.03, null, 1, x, 1.58, -D / 2 + 0.05, i % 2 ? ACO : FERRO)); g.add(box(0.12, 0.06, 0.04, null, 1, x, 1.76, -D / 2 + 0.05, FERRO)); }
    },
    carvao: function (g, W, D) {
      [[-0.2, 0.3, 0.1], [0.22, 0.3, -0.08], [0, 0.82, 0]].forEach(function (p) { g.add(box(W * 0.48, 0.58, D * 0.42, null, 1, p[0] * W, p[1], p[2] * D, 0x5a5048)); });
      g.add(box(W * 0.5, 0.12, D * 0.3, null, 1, 0.1, 0.06, D * 0.32, 0x22201e));
    },
    altar: function (g, W, D) {
      g.add(box(W, 1.0, D, 'pedra', 1, 0, 0.5, 0, 0xd8d4ca)); g.add(box(W + 0.1, 0.08, D + 0.1, 'pedra', 1, 0, 1.04, 0, 0xc4c0b4));
      g.add(box(W + 0.04, 0.02, D * 0.8, null, 1, 0, 1.09, 0, LINHO));
      g.add(box(W * 0.5, 0.7, 0.02, null, 1, 0, 0.55, D / 2 + 0.01, VERM)); g.add(box(W * 0.5, 0.06, 0.025, null, 1, 0, 0.88, D / 2 + 0.015, OURO));
      [-1, 1].forEach(function (s) { g.add(cyl(0.04, 0.04, 0.3, 6, null, 1, 0, CERA).at(s * (W / 2 - 0.25), 1.25, 0)); chama(g, s * (W / 2 - 0.25), 1.4, 0); });
      g.add(box(0.04, 0.34, 0.03, null, 1, 0, 1.27, -D * 0.25, OURO)); g.add(box(0.18, 0.04, 0.03, null, 1, 0, 1.35, -D * 0.25, OURO));
      g.add(box(0.3, 0.05, 0.22, null, 1, 0.35, 1.125, 0.05, VERM));
    },
    tablado: function (g, W, D) { g.add(box(W, 0.12, D, 'tabuas', PX, 0, 0.06, 0, MAD)); },
    cruz: function (g, W, D, m, I) { // na parede: o móvel fica na face da parede, e a peça sai para +z
      var y = Math.min(3.1, I.teto - 1.5);
      g.add(box(0.2, 2.4, 0.08, 'tabuas', PX, 0, y, 0.04, MADE)); g.add(box(1.3, 0.2, 0.08, 'tabuas', PX, 0, y + 0.45, 0.04, MADE));
      g.add(box(0.08, 2.2, 0.02, null, 1, 0, y, 0.09, OURO)); g.add(box(1.1, 0.08, 0.02, null, 1, 0, y + 0.45, 0.09, OURO));
    },
    vela: function (g) { // castiçal de ferro
      g.add(cyl(0.15, 0.18, 0.05, 6, null, 1, 0, FERRO).at(0, 0.025, 0)); g.add(box(0.04, 1.25, 0.04, null, 1, 0, 0.65, 0, FERRO));
      g.add(cyl(0.1, 0.06, 0.04, 6, null, 1, 0, FERRO).at(0, 1.29, 0)); g.add(cyl(0.035, 0.035, 0.22, 6, null, 1, 0, CERA).at(0, 1.42, 0)); chama(g, 0, 1.53, 0);
    },
    pia: function (g) {
      g.add(cyl(0.2, 0.26, 0.7, 8, 'pedra', 1, 0, 0xd8d4ca).at(0, 0.35, 0)); g.add(cyl(0.42, 0.3, 0.25, 8, 'pedra', 1, 0, 0xd8d4ca).at(0, 0.82, 0));
      g.add(cyl(0.36, 0.36, 0.01, 8, null, 1, 0, 0x5a7a8a).at(0, 0.95, 0));
    },
    tapete: function (g, W, D, m) {
      var h = m.h || 0.012;
      g.add(box(W + 0.12, 0.008, D + 0.12, null, 1, 0, 0.04, 0, OURO)); g.add(box(W, h, D, null, 1, 0, 0.04 + h / 2, 0, m.cor || VERM));
    },
    estandarte: function (g, W, D, m, I) { // na parede
      var top = Math.min(I.teto - 0.5, 5);
      g.add(box(W + 0.24, 0.06, 0.06, 'tabuas', PX, 0, top, 0.1, MADE));
      g.add(box(W, 1.9, 0.03, null, 1, 0, top - 1, 0.07, m.cor || VERM)); g.add(box(W, 0.1, 0.035, null, 1, 0, top - 1.9, 0.07, OURO));
      g.add(box(W * 0.7, W * 0.78, 0.01, 'brasao', 'fit', 0, top - 0.85, 0.09));
    },
    escudos: function (g, W, D, m) { // na parede: escudo redondo entre duas lanças
      var y = m.h || 2.8;
      [-1, 1].forEach(function (s) { g.add(box(0.04, 2, 0.04, 'tabuas', PX, s * 0.5, y, 0.05, MADE)); g.add(box(0.08, 0.22, 0.02, null, 1, s * 0.5, y + 1.1, 0.05, ACO)); });
      g.add(new Node(cached('escudo', function () { return rotX(cylGeo(0.36, 0.36, 0.05, 10, 0, 1), Math.PI / 2); }), m.cor || VERM).at(0, y, 0.1));
      g.add(new Node(cached('umbo', function () { return rotX(cylGeo(0.09, 0.11, 0.06, 8, 0, 1), Math.PI / 2); }), OURO).at(0, y, 0.14));
    },
    trono: function (g, W, D) {
      g.add(box(W, 0.1, D * 0.8, 'tabuas', PX, 0, 0.5, 0.05, MADE)); pernas(g, W, D * 0.8, 0.45, 0.08, MADE);
      g.add(box(W, 1.5, 0.1, 'tabuas', PX, 0, 1.25, -D / 2 + 0.08, MADE)); g.add(box(W * 0.7, 1.0, 0.02, null, 1, 0, 1.25, -D / 2 + 0.14, VERM));
      g.add(box(W * 0.8, 0.05, D * 0.6, null, 1, 0, 0.57, 0.05, VERM));
      [-1, 1].forEach(function (s) { g.add(box(0.1, 0.18, 0.1, null, 1, s * (W / 2 - 0.05), 2.06, -D / 2 + 0.08, OURO)); g.add(box(0.08, 0.3, D * 0.7, 'tabuas', PX, s * (W / 2 - 0.04), 0.7, 0.05, MADE)); });
    },
    cadeira: function (g, W, D) {
      g.add(box(W * 0.9, 0.06, D * 0.9, 'tabuas', PX, 0, 0.45, 0, MAD)); pernas(g, W * 0.9, D * 0.9, 0.42, 0.06, MADE);
      g.add(box(W * 0.9, 0.6, 0.06, 'tabuas', PX, 0, 0.78, -D * 0.45 + 0.03, MADE));
    },
    arca: function (g, W, D) {
      g.add(box(W, 0.5, D, 'tabuas', PX, 0, 0.25, 0, MADE)); g.add(box(W + 0.04, 0.08, D + 0.04, 'tabuas', PX, 0, 0.54, 0, MAD));
      [-1, 1].forEach(function (s) { g.add(box(0.06, 0.6, D + 0.05, null, 1, s * W * 0.3, 0.29, 0, FERRO)); });
      g.add(box(0.1, 0.12, 0.03, null, 1, 0, 0.42, D / 2 + 0.02, OURO));
    },
    paes: function (g, W, D, m) {
      var ys = estante(g, W, D, m.h || 1.8, 4);
      ys.forEach(function (y, j) { for (var x = -W / 2 + 0.22; x < W / 2 - 0.15; x += 0.3) {
        g.add(box(0.24, 0.11, D * 0.55, null, 1, x, y + 0.075, 0.02, j % 2 ? 0xb87a30 : 0xc88a3a)); g.add(box(0.17, 0.04, D * 0.42, null, 1, x, y + 0.14, 0.02, 0xdca85a));
      } });
    },
    rolos: function (g, W, D, m) { // rolos de pano deitados nas prateleiras
      var ys = estante(g, W, D, m.h || 2, 4), cores = [0x7a2522, 0x2c4a7a, 0x5a7a3a, 0xd8c8a0, 0x8a6a9a, 0x6a4a2a];
      ys.forEach(function (y, j) { for (var i = 0, x = -W / 2 + 0.2; x < W / 2 - 0.15; x += 0.27, i++) {
        g.add(box(0.22, 0.2, D * 0.8, null, 1, x, y + 0.12, 0.02, cores[(i + j * 2) % cores.length]));
      } });
    },
    sacas: function (g, W, D) {
      [[-0.22, 0.3, 0.08], [0.22, 0.3, -0.06], [0, 0.84, 0.02]].forEach(function (p) { g.add(box(W * 0.46, 0.6, D * 0.44, null, 1, p[0] * W, p[1], p[2] * D, 0xd8d0bd)); });
      g.add(box(W * 0.3, 0.02, D * 0.2, null, 1, -0.1, 0.62, 0.15 * D, 0xf4f0e8));
    },
    lenha: function (g, W, D) {
      for (var r = 0; r < 3; r++) { for (var x = -W / 2 + 0.14 + r * 0.085; x < W / 2 - 0.1 - r * 0.085; x += 0.17) { var t = tora(x, 0.08 + r * 0.145)[0]; t.pos[2] = 0; g.add(t); } }
    },
    forno_pao: function (g, W, D, m, I) { // forno de pão de tijolo, boca acesa virada para a sala
      g.add(box(W, 0.8, D, 'pedra', 1, 0, 0.4, 0));
      [[W * 0.46, W * 0.38, 0.32, 0.96], [W * 0.38, W * 0.26, 0.32, 1.28], [W * 0.26, W * 0.08, 0.24, 1.56]].forEach(function (c) { g.add(cyl(c[1], c[0], c[2], 12, 'tijolo', 1).at(0, c[3], -0.05)); });
      g.add(box(W * 0.5, 0.56, 0.3, 'tijolo', 1, 0, 1.08, D / 2 - 0.2)); g.add(box(W * 0.62, 0.1, 0.34, 'pedra', 1, 0, 1.4, D / 2 - 0.2));
      g.add(box(W * 0.3, 0.34, 0.02, null, 1, 0, 1.02, D / 2 - 0.04, 0x1c1410)); g.add(acesa(box(W * 0.24, 0.09, 0.02, null, 1, 0, 0.9, D / 2 - 0.025, 0xd8581c)));
      g.add(box(W * 0.7, 0.08, 0.3, 'pedra', 1, 0, 0.84, D / 2 + 0.1));
      g.add(box(0.45, I.teto - 1.7, 0.45, 'tijolo', 1, 0, (I.teto + 1.7) / 2, -D * 0.2));
    },
    masseira: function (g, W, D) {
      g.add(box(W, 0.25, D, 'tabuas', PX, 0, 0.72, 0, MAD)); pernas(g, W, D, 0.6, 0.07, MADE);
      g.add(box(W * 0.5, 0.1, D * 0.5, null, 1, 0, 0.88, 0, 0xe8dcc0)); g.add(box(W * 0.2, 0.06, D * 0.2, null, 1, W * 0.3, 0.88, 0.1, 0xe8dcc0));
    },
    mesa_corte: function (g, W, D) {
      g.add(box(W, 0.07, D, 'tabuas', PX, 0, 0.84, 0, MAD)); pernas(g, W, D, 0.81, 0.08, MADE);
      g.add(box(W * 0.62, 0.015, D * 0.8, null, 1, -W * 0.1, 0.885, 0, 0x2c4a7a)); g.add(box(W * 0.25, 0.02, D * 0.5, null, 1, W * 0.3, 0.885, -D * 0.1, 0xd8c8a0));
      [-0.35, 0.35].forEach(function (a) { var t = box(0.26, 0.012, 0.03, null, 1, W * 0.25, 0.9, D * 0.25, ACO); t.rotY = a; g.add(t); });
      g.add(box(0.9, 0.01, 0.04, 'tabuas', PX, -W * 0.1, 0.9, D * 0.4, MADE));
      g.add(cyl(0.05, 0.06, 0.04, 6, null, 1, 0, FERRO).at(W / 2 - 0.15, 0.895, -D / 2 + 0.15)); g.add(cyl(0.035, 0.035, 0.2, 6, null, 1, 0, CERA).at(W / 2 - 0.15, 1.0, -D / 2 + 0.15)); chama(g, W / 2 - 0.15, 1.1, -D / 2 + 0.15);
    },
    cabide: function (g, W, D) { // varal de roupas prontas
      [-1, 1].forEach(function (s) { g.add(box(0.06, 1.75, 0.06, 'tabuas', PX, s * (W / 2 - 0.03), 0.875, 0, MADE)); g.add(box(0.06, 0.06, D, 'tabuas', PX, s * (W / 2 - 0.03), 0.03, 0, MADE)); });
      g.add(box(W, 0.05, 0.05, 'tabuas', PX, 0, 1.68, 0, MADE));
      var cores = [0x6a3a5a, 0x2c4a7a, 0x8a6a4a, 0x5a7a3a, 0x7a2522, 0xd8c8a0];
      for (var i = 0, x = -W / 2 + 0.22; x < W / 2 - 0.15; x += 0.24, i++) { g.add(box(0.07, 0.9 - (i % 3) * 0.12, Math.min(0.5, D * 0.9), null, 1, x, 1.2 + (i % 3) * 0.06, 0, cores[i % cores.length])); }
    },
    manequim: function (g) {
      g.add(box(0.36, 0.06, 0.36, 'tabuas', PX, 0, 0.03, 0)); g.add(box(0.07, 0.95, 0.07, 'tabuas', PX, 0, 0.5, 0));
      g.add(box(0.46, 0.62, 0.28, null, 1, 0, 1.28, 0, 0x2c4a7a)); g.add(box(0.36, 0.12, 0.24, null, 1, 0, 1.64, 0, 0x2c4a7a));
      g.add(box(0.5, 0.36, 0.3, null, 1, 0, 0.9, 0, 0x5a3a26));
    },
    cesto: function (g, W) {
      g.add(cyl(W * 0.42, W * 0.34, 0.36, 8, 'palha', 0.64, 0, 0xc8a870).at(0, 0.18, 0));
      [[-0.08, 0.06, LINHO], [0.1, -0.04, 0xd8c8a0], [0, 0.1, 0x7a2522]].forEach(function (p) { g.add(box(0.16, 0.14, 0.16, null, 1, p[0], 0.38, p[1], p[2])); });
    },
    pilar: function (g, W, D, m, I) { g.add(box(W, I.teto, D, 'pedra', 2, 0, I.teto / 2, 0)); }
  };
  // tudo o que fica do lado de dentro, no referencial da construção (sem a posição no mundo)
  var ALTO = { lareira: 1, forja: 1, forno_pao: 1, pilar: 1, rolos: 1, paes: 1, armas: 1, estante: 1 };
  function sala(b, I, jan) {
    var g = new Node(), C = cascaDim(b), a = C.a, c = C.c, T = I.teto, pw = I.porta[0], ph = I.porta[1];
    g.add(new Node(casca(C, I.porta, false, I.pmap || 2.5), I.pcor === undefined ? 0xffffff : I.pcor, { tex: I.parede }).at(0, C.H / 2, 0));
    g.add(new Node(planeGeo(a * 2, c * 2, I.piso === 'tabuas' ? PX * 2 : 1.5), 0xffffff, { tex: I.piso }).at(0, 0.035, 0));
    g.add(new Node(planeGeo(pw, C.hz - c + 0.2, 1), 0xb4b0a6, { tex: 'pedra' }).at(0, 0.036, (C.hz + c) / 2));       // soleira
    var forro = new Geo().quad([-a, 0, -c], [a, 0, -c], [a, 0, c], [-a, 0, c]).done(PX * 2);                      // teto, visto de baixo
    g.add(new Node(forro, 0xa89478, { tex: 'tabuas' }).at(0, T, 0));
    for (var z = -c + 0.8; z < c - 0.3; z += 1.6) { g.add(box(a * 2, 0.24, 0.22, 'tabuas', PX, 0, T - 0.12, z, MADE)); } // vigas
    // porta aberta, encostada por dentro na parede da frente; a de duas folhas abre para os dois lados
    var lf = pw > 2 ? pw / 2 : pw, lados = pw > 2 ? [-1, 1] : [I.folha || 1];
    lados.forEach(function (s) { g.add(box(lf, ph, 0.07, 'porta', 'fit', s * (pw / 2 + lf / 2), ph / 2, c - 0.04)); });
    // o vidro das janelas também por dentro, menos onde a folha da porta, uma lareira ou uma estante o tapariam
    (jan || []).forEach(function (j) {
      var x = j[0], y = j[1], z = j[2], side = j[3];
      if (y + 0.5 > T - 0.05) { return; }
      if (side) { x = (x > 0 ? 1 : -1) * (a - 0.02); if (Math.abs(z) > c - 0.5) { return; } }
      else { z = (z > 0 ? 1 : -1) * (c - 0.02); if (Math.abs(x) > a - 0.5) { return; } }
      if (!side && z > 0 && lados.some(function (s) { var d = x * s; return d > pw / 2 - 0.5 && d < pw / 2 + lf + 0.5 && y - 0.5 < ph; })) { return; }
      if ((I.moveis || []).some(function (m) { return ALTO[m.k] && Math.abs(x - m.x) < m.w / 2 + 0.5 && Math.abs(z - m.z) < m.d / 2 + 0.5; })) { return; }
      var v = side ? box(0.04, 1.0, 1.0, 'janela', 'fit', x, y, z) : box(1.0, 1.0, 0.04, 'janela', 'fit', x, y, z);
      v.unlit = true; v.modo = 'janela'; g.add(v);
    });
    (I.moveis || []).forEach(function (m) {
      var f = MOVEL[m.k]; if (!f) { return; }
      var r = m.r || 0, vira = Math.abs(r) === 90, o = new Node().at(m.x, 0, m.z);
      o.rotY = r * Math.PI / 180;
      f(o, vira ? m.d : m.w, vira ? m.w : m.d, m, I);
      g.add(o);
    });
    return g;
  }
  // luz de interior num ponto (para as figuras, que não têm sombra): ambiente + lareira e velas, sem a direção da face
  function luzEm(S, amb, x, y, z) {
    var o = [amb[0], amb[1], amb[2]];
    [[S.l1, S.c1], [S.l2, S.c2]].forEach(function (L) {
      var d = Math.hypot(L[0][0] - x, L[0][1] - y, L[0][2] - z), a = Math.max(0, 1 - d / (L[0][3] || 1)); a = a * a * 0.7;
      for (var k = 0; k < 3; k++) { o[k] += L[1][k] * a; }
    });
    return o.map(function (v) { return Math.min(1, v * 1.15); });
  }

  // ---------- peças fundidas ----------
  // cada Node custa uma chamada de desenho por quadro; a cidade tem milhares de peças fixas, então elas viram uma malha por textura
  // em cada setor do mapa: uma malha só atravessaria a cidade inteira e nunca sairia da tela
  var SETOR = 48;
  var CLARO = hex(0xf2f2f2);
  function Lote() { this.fila = {}; }
  // modo: 'janela' = vidro de interior, que brilha com a luz do céu (claro de dia, escuro à noite) e não com a da sala
  Lote.prototype.get = function (tex, color, unlit, modo) {
    var k = [tex, color, unlit, modo || ''].join('|');
    return this.fila[k] || (this.fila[k] = { tex: tex, color: color, unlit: unlit, modo: modo || '', v: [] });
  };
  Lote.prototype.funde = function (n, pai) { // a peça montada com Node, com os filhos, entra no lote na posição em que está
    var m = pai ? mul(pai, local(n)) : local(n);
    if (n.geo) {
      var v = this.get(n.tex, n.color, n.unlit, n.modo).v, d = n.geo.data, q = normalMat(m);
      for (var i = 0; i < d.length; i += 8) {
        var p = xform(m, d[i], d[i + 1], d[i + 2]), a = d[i + 3], b = d[i + 4], c = d[i + 5];
        v.push(p[0], p[1], p[2], q[0] * a + q[3] * b + q[6] * c, q[1] * a + q[4] * b + q[7] * c, q[2] * a + q[5] * b + q[8] * c, d[i + 6], d[i + 7]);
      }
    }
    for (var k = 0; k < n.children.length; k++) { this.funde(n.children[k], m); }
  };
  // plano vertical com a textura inteira, de (ax, az) a (bx, bz), entre as alturas y0 e y1; a normal aponta para cima
  Lote.prototype.plano = function (v, ax, az, bx, bz, y0, y1, u0, u1) {
    v.push(ax, y0, az, 0, 1, 0, u0, 1, bx, y0, bz, 0, 1, 0, u1, 1, bx, y1, bz, 0, 1, 0, u1, 0,
      ax, y0, az, 0, 1, 0, u0, 1, bx, y1, bz, 0, 1, 0, u1, 0, ax, y1, az, 0, 1, 0, u0, 0);
  };
  // pé de planta: dois planos em cruz que se cortam no meio do quadro, onde fica o caule ou o bulbo
  Lote.prototype.pe = function (v, x, z, w, y0, y1, ang, inv) {
    var c = Math.cos(ang) * w / 2, s = Math.sin(ang) * w / 2, u0 = inv ? 1 : 0, u1 = inv ? 0 : 1;
    this.plano(v, x - c, z - s, x + c, z + s, y0, y1, u0, u1);
    this.plano(v, x + s, z - c, x - s, z + c, y0, y1, u0, u1);
  };
  // sala: o lote é o interior de uma construção; as malhas ganham as luzes dela (as janelas, não)
  Lote.prototype.poe = function (R, sala) {
    var f = this.fila;
    Object.keys(f).forEach(function (k) {
      var v = f[k].v, grupos = {};
      for (var i = 0; i < v.length; i += 24) { // 3 vértices de 8 números: o triângulo vai inteiro para o setor do seu centro
        var c = Math.floor((v[i] + v[i + 8] + v[i + 16]) / 3 / SETOR) + ',' + Math.floor((v[i + 2] + v[i + 10] + v[i + 18]) / 3 / SETOR);
        var g = grupos[c] || (grupos[c] = []);
        for (var j = 0; j < 24; j++) { g.push(v[i + j]); }
      }
      Object.keys(grupos).forEach(function (c) {
        var o = new Node({ data: new Float32Array(grupos[c]), count: grupos[c].length / 8 }, 0xffffff, { tex: f[k].tex, unlit: f[k].unlit });
        o.color = f[k].color; R.add(o);
        if (sala && f[k].modo !== 'janela') { o.dentro = sala; }
      });
    });
  };
  function sorte(i) { var t = Math.sin(i * 12.9898) * 43758.5453; return t - Math.floor(t); }
  // retângulo no chão com a textura presa ao mundo: as peças que se cruzam casam, e as fileiras de 'lavoura' caem em z = n + 0,5
  function chao(rs, map) {
    var g = new Geo();
    rs.forEach(function (r) { g.quad([r.x0, 0, r.z1], [r.x1, 0, r.z1], [r.x1, 0, r.z0], [r.x0, 0, r.z0]); });
    return g.done(map);
  }

  // ---------- plantações: fileiras leste-oeste, uma por metro, sobre a terra arada ----------
  // o corpo da planta é peça 3D, para não dobrar nos planos em cruz: perfil = [raio, altura, v] de baixo para cima, u = faixa em 'bulbos'
  var PLANTA = {
    cebola: { w: 0.64, passo: 0.46, u: [0.01, 0.32], perfil: [[0.1, 0, 1], [0.155, 0.075, 0.62], [0.125, 0.15, 0.3], [0.03, 0.2, 0]] },
    nabo: { w: 0.64, passo: 0.56, u: [0.34, 0.65], perfil: [[0.12, 0, 1], [0.165, 0.09, 0.62], [0.13, 0.19, 0.3], [0.04, 0.26, 0]] },
    alho_poro: { w: 0.86, passo: 0.4, u: [0.67, 0.99], perfil: [[0.062, 0, 1], [0.062, 0.2, 0.55], [0.052, 0.4, 0]] }
  };
  function corpo(v, d, x, z, k, giro) {
    var P = d.perfil, n = 5, top = P[P.length - 1][1], R = 0.16;
    function ponto(i, j) {
      var a = giro + j / n * Math.PI * 2, s = Math.sin(a), c = Math.cos(a), r = P[i][0], y = P[i][1];
      var nx = s * r / R, ny = 0.7 + (y - top / 2) / top, nz = c * r / R; // puxada para cima: o lado de sombra não acinzenta o branco
      return [x + s * r * k, y * k, z + c * r * k, nx, ny, nz, d.u[0] + (d.u[1] - d.u[0]) * j / n, P[i][2]];
    }
    for (var i = 0; i + 1 < P.length; i++) {
      for (var j = 0; j < n; j++) {
        var b0 = ponto(i, j), b1 = ponto(i, j + 1), t1 = ponto(i + 1, j + 1), t0 = ponto(i + 1, j);
        v.push.apply(v, b0.concat(b1, t1, b0, t1, t0));
      }
    }
  }
  function trigal(L, f) {
    var caule = L.get('trigo_caule', CLARO, true).v, espiga = L.get('trigo_espiga', CLARO, true).v, n = 0;
    for (var z = f.z0 + 0.5; z < f.z1; z += 1) {
      for (var x = f.x0 + 0.3; x < f.x1 - 0.2; x += 0.34) {
        n++;
        var a = sorte(n) * Math.PI, inv = sorte(n + 0.3) > 0.5, px = x + (sorte(n + 0.5) - 0.5) * 0.14, pz = z + (sorte(n + 0.7) - 0.5) * 0.2, h = 0.6 + sorte(n + 0.9) * 0.1;
        L.pe(caule, px, pz, 0.64, 0, h, a, inv); L.pe(espiga, px, pz, 0.64, h, h + 0.64, a, inv);
      }
    }
  }
  function canteiro(L, s, x0, x1) {
    var d = PLANTA[s.kind], v = L.get(s.kind, CLARO, true).v, b = L.get('bulbos', hex(0xffffff), false).v, n = s.z0 * 977;
    for (var z = s.z0 + 0.5; z < s.z1; z += 1) {
      for (var x = x0 + 0.4; x < x1 - 0.3; x += d.passo) {
        n++;
        var k = 0.92 + sorte(n + 0.2) * 0.16, px = x + (sorte(n) - 0.5) * 0.08, pz = z + (sorte(n + 0.5) - 0.5) * 0.08;
        L.pe(v, px, pz, d.w * k, 0, d.w * k, Math.PI / 4 + (sorte(n + 0.7) - 0.5) * 0.9, sorte(n + 0.3) > 0.5);
        corpo(b, d, px, pz, k, sorte(n + 0.9) * 6);
      }
    }
  }
  function espantalho(x, z) {
    var g = new Node().at(x, 0, z);
    g.add(box(0.1, 2.3, 0.1, 'tabuas', PX, 0, 1.15, 0)); g.add(box(1.5, 0.08, 0.08, 'tabuas', PX, 0, 1.75, 0));
    g.add(box(0.56, 0.74, 0.2, null, 1, 0, 1.55, 0, 0x6a5a48)); g.add(box(1.3, 0.16, 0.14, null, 1, 0, 1.76, 0, 0x7a6854)); // casaco velho
    g.add(box(0.3, 0.32, 0.3, 'palha', 0.64, 0, 2.14, 0, 0xe0d0a0));                                                       // cabeça de palha
    g.add(cyl(0.34, 0.34, 0.03, 8, 'palha', 0.64).at(0, 2.3, 0)); g.add(cyl(0.12, 0.17, 0.2, 8, 'palha', 0.64).at(0, 2.42, 0));
    return g;
  }
  // cocho de tábuas e feno para o pasto
  function cocho(x, z) {
    var g = new Node().at(x, 0, z);
    g.add(box(2.2, 0.08, 0.7, 'tabuas', PX, 0, 0.24, 0));
    [-1, 1].forEach(function (s) { g.add(box(2.2, 0.44, 0.06, 'tabuas', PX, 0, 0.34, s * 0.34)); g.add(box(0.06, 0.44, 0.7, 'tabuas', PX, s * 1.08, 0.34, 0)); g.add(box(0.12, 0.3, 0.8, 'tabuas', PX, s * 0.8, 0.15, 0)); });
    g.add(box(2, 0.1, 0.56, 'palha', 1, 0, 0.5, 0));
    return g;
  }
  function fardo(x, z, y) { return box(1.1, 0.6, 0.7, 'palha', 1, x, 0.3 + (y || 0), z); }
  // porteira do cercado: mourões altos com travessa e as duas folhas abertas, encostadas na cerca pelo lado de dentro.
  // montada como se fosse na face oeste (cerca ao longo de z, dentro = +x) e girada para a face da porteira
  var FACE = { west: 0, east: Math.PI, south: Math.PI / 2, north: -Math.PI / 2 };
  function porteira(p) {
    var sd = p.gate.side, g = new Node(), x = 0, a = p.gate.from - 0.5, c = p.gate.to + 0.5;
    if (sd === 'east' || sd === 'north') { var t = a; a = -c; c = -t; } // nessas faces o eixo da cerca corre ao contrário
    g.rotY = FACE[sd];
    g.pos = sd === 'west' ? [p.x0 + 0.5, 0, 0] : sd === 'east' ? [p.x1 - 0.5, 0, 0] : sd === 'south' ? [0, 0, p.z1 - 0.5] : [0, 0, p.z0 + 0.5];
    [a, c].forEach(function (z) { g.add(box(0.3, 2.8, 0.3, 'tabuas', 1, x, 1.4, z)); });
    g.add(box(0.2, 0.26, c - a + 0.7, 'tabuas', 1, x, 2.72, (a + c) / 2));
    [[a, -1], [c, 1]].forEach(function (f) {
      var s = f[1], m = f[0] + s * 1;
      [0.3, 0.68, 1.06].forEach(function (y) { g.add(box(0.06, 0.13, 2, 'tabuas', PX, x + 0.32, y, m)); });
      [-0.97, 0.97].forEach(function (d) { g.add(box(0.07, 1.04, 0.12, 'tabuas', PX, x + 0.32, 0.68, m + d)); });
      var t = box(0.06, 0.12, 2.1, 'tabuas', PX, x + 0.37, 0.68, m); g.add(t);
    });
    return g;
  }

  // altura em metros do QUADRO de cada figura (o pé fica na base do quadro; a largura segue a proporção do quadro).
  // pessoas: quadro 192px, figura ~185px => ~1,8-1,9 m; coelho ~0,45 m; árvore ~5,5 m; veio ~1,6 m de rocha
  var SIZE = { padre: 1.9, ferreiro: 1.97, taberneiro: 1.92, anselmo: 1.88, alfaiate: 1.86, coelho: 0.48, arvore: 5.9, toco: 5.9, veio: 2.4, veio_vazio: 2.4 };

  // ---------- moradores e vacas: ambiente, só na tela ----------
  // a posição sai do relógio, nunca de tiques: nada disto entra na simulação, nas colisões ou no save
  function trilha(pts) { // fechada: o último ponto liga no primeiro
    var acc = [0];
    pts.forEach(function (a, i) { var b = pts[(i + 1) % pts.length]; acc.push(acc[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); });
    return { pts: pts, acc: acc, len: acc[pts.length] };
  }
  function trilhaEm(T, s) {
    s = (s % T.len + T.len) % T.len;
    var i = 0;
    while (i < T.pts.length - 1 && s > T.acc[i + 1]) { i++; }
    var a = T.pts[i], b = T.pts[(i + 1) % T.pts.length], t = (s - T.acc[i]) / ((T.acc[i + 1] - T.acc[i]) || 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  // s = metros andados; o lado desvia a pessoa da linha da trilha, medido na tangente média para não pular nos cantos
  function passoEm(T, s, lado) {
    var p = trilhaEm(T, s); if (!lado) { return p; }
    var a = trilhaEm(T, s - 0.6), b = trilhaEm(T, s + 0.6), dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return [p[0] - dz / l * lado, p[1] + dx / l * lado];
  }
  // a vaca oscila em volta do seu centro; u só avança na parte do ciclo em que ela anda, então ela para sem saltar
  function vacaU(c, h, seg) {
    var q = seg / c.ciclo + h[8], k = Math.floor(q), f = q - k, e = f < c.anda ? ease(f / c.anda) : 1;
    return { u: (k + e) * 3, anda: f < c.anda };
  }
  function vacaEm(c, h, u) {
    var A = c.area;
    return [Math.max(A[0], Math.min(A[2], h[0] + h[2] * Math.sin(u * h[4] + h[6]))), Math.max(A[1], Math.min(A[3], h[1] + h[3] * Math.sin(u * h[5] + h[7])))];
  }

  // placa do alfaiate enquanto a arte não traz 'placa_alfaiate': tábua com moldura escura e uma tesoura aberta, em pixels
  function placaTesoura(tab) {
    var S = tab.width, c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d'), u = S / 32;
    function px(x, y, w, h, cor) { g.fillStyle = cor; g.fillRect(Math.round(x * u), Math.round(y * u), Math.ceil(w * u), Math.ceil(h * u)); }
    g.drawImage(tab, 0, 0, S, S);
    px(0, 0, 32, 2, '#3a2616'); px(0, 30, 32, 2, '#3a2616'); px(0, 0, 2, 32, '#3a2616'); px(30, 0, 2, 32, '#3a2616');
    for (var i = 0; i < 14; i++) { px(9 + i, 7 + i * 0.86, 2.2, 2.2, '#c9ccd2'); px(21 - i, 7 + i * 0.86, 2.2, 2.2, '#9aa0aa'); } // lâminas cruzadas
    [[8, 22], [20, 22]].forEach(function (a) { px(a[0], a[1], 5, 1.4, '#7a2522'); px(a[0], a[1] + 3.6, 5, 1.4, '#7a2522'); px(a[0], a[1], 1.4, 5, '#7a2522'); px(a[0] + 3.6, a[1], 1.4, 5, '#7a2522'); }); // argolas
    px(15, 13, 2, 2, '#3a3a42');
    return c;
  }

  function View(canvas, world, art) {
    this.w = world; this.r = new Renderer(canvas); this.art = art;
    var self = this;
    if (!art.walls.placa_alfaiate && art.walls.tabuas) { art.walls.placa_alfaiate = placaTesoura(art.walls.tabuas); }
    Object.keys(art.walls).forEach(function (k) { self.r.addTexture(k, art.walls[k], true); });
    Object.keys(art.sprites).forEach(function (k) { self.r.addTexture('s:' + k, art.sprites[k], false); });
    this.root = new Node(); this.pick = []; this.objs = {}; this.flash = {};
    this.env = { sky: hex(0xe6ecf5), gnd: hex(0x5a4a32), sunDir: norm([0.45, 0.75, 0.35]), sunCol: hex(0xfff1d6), fogCol: hex(0xa9b9c4), fog: [45, 150], tint: [1, 1, 1], amb: [0.6, 0.57, 0.52] };
    this.buildStatic(); this.buildDynamic(); this.buildAmbient(); this.buildCeu();
    this.areaRing = this.root.add(new Node(ringGeo(0.96, 1, 48), 0xe8c45a, { alpha: 0.6, unlit: true }));
    this.areaRing.visible = false;
    this.yaw = Math.PI; this.pitch = -0.05; this.swing = -1; this.bob = 0; this.shake = 0; this.fov = 70 * Math.PI / 180; this.aspect = 1;
  }

  // figura que a arte ainda não tem (ex.: o alfaiate antes do atlas novo): usa uma parecida, em vez de um quadro branco
  var SUBSTITUTA = { alfaiate: 'taberneiro' };
  View.prototype.sprite = function (name, h) {
    if (!this.art.sprites[name]) { name = this.art.sprites[SUBSTITUTA[name]] ? SUBSTITUTA[name] : 'anselmo'; }
    var o = new Node(sGeo(this.dim(name), h), 0xf2f2f2, { tex: 's:' + name, sprite: true, unlit: true });
    o.userData.img = name; o.userData.k = h / (SIZE[name] || h);
    return o;
  };
  View.prototype.dim = function (name) { return this.art.dims[name] || { w: 1, h: 1 }; };
  // troca a imagem da figura (ex.: árvore -> toco) e ajusta o quadro ao tamanho/proporção da nova imagem
  View.prototype.setImg = function (o, img) {
    if (o.userData.img === img) { return; }
    o.tex = 's:' + img; o.userData.img = img;
    o.geo = sGeo(this.dim(img), (SIZE[img] || 1.9) * (o.userData.k || 1));
  };

  // chão de cada região: a mesma grama com outra tinta (floresta escura, campina clara) e terra acinzentada no pedregal
  var CHAO = { vila: ['grama', 0xe6eccc], floresta: ['grama', 0xa4bc8c], rochas: ['terra', 0xf0e6d0], campina: ['grama', 0xf4f4c4] };
  View.prototype.buildStatic = function () {
    var w = this.w, V = w.vila, R = this.root, self = this, L = new Lote(), cerca = new Node(), S = (V.bounds + 170) * 2;
    R.add(new Node(planeGeo(S, S, 3), 0xffffff, { tex: 'grama' }));
    (V.regions || []).forEach(function (r) {
      var c = CHAO[r.kind]; if (!c) { return; }
      R.add(new Node(chao(r.rects.map(function (q) { return { x0: q[0], z0: q[1], x1: q[2], z1: q[3] }; }), 3), c[1], { tex: c[0] }).at(0, 0.01, 0));
    });
    var rd = V.road; R.add(new Node(planeGeo(rd.w, rd.z1 - rd.z0, 3), 0xffffff, { tex: 'terra' }).at(rd.x, 0.02, (rd.z0 + rd.z1) / 2));
    R.add(new Node(chao(V.streets, 3), 0xffffff, { tex: 'terra' }).at(0, 0.015, 0));
    // avenida calçada de ponta a ponta, com meio-fio de pedra dos dois lados
    var av = V.avenue;
    if (av) {
      R.add(new Node(chao([av], 2.5), 0xe8e4dc, { tex: 'pavimento' }).at(0, 0.025, 0));
      var mf = new Node(), aw = av.x1 - av.x0;
      [av.z0, av.z1].forEach(function (z) { mf.add(box(aw, 0.12, 0.24, 'pedra', 1, (av.x0 + av.x1) / 2, 0.06, z, 0x9a9a9a)); });
      L.funde(mf);
    }
    var pl = V.plaza;
    R.add(cyl(pl.r + 0.35, pl.r + 0.35, 0.06, 40, 'pedra', 1.5, 0, 0x9a9a9a).at(pl.x, 0.03, pl.z));
    R.add(cyl(pl.r, pl.r, 0.1, 40, 'pavimento', 2.5).at(pl.x, 0.05, pl.z));
    if (V.gate) { L.funde(portao(V.gate)); }

    function seg(x0, z0, x1, z1) {
      var len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2));
      for (var i = 0; i <= n; i++) { var t = i / n; cerca.add(box(0.18, 1.3, 0.18, 'tabuas', 1, x0 + (x1 - x0) * t, 0.65, z0 + (z1 - z0) * t)); }
      [0.5, 1.0].forEach(function (y) {
        var b = box(len, 0.1, 0.08, 'tabuas', 1, (x0 + x1) / 2, y, (z0 + z1) / 2); b.rotY = -Math.atan2(z1 - z0, x1 - x0); cerca.add(b);
      });
    }
    // pasto e aprisco: a cerca fica nas células da borda (como em sim.js) e abre na porteira, em qualquer face
    function cercado(P) {
      var x0 = P.x0 + 0.5, x1 = P.x1 - 0.5, z0 = P.z0 + 0.5, z1 = P.z1 - 0.5, g = P.gate || {};
      R.add(new Node(chao([{ x0: x0, x1: x1, z0: z0, z1: z1 }], 3), 0xc8dc9a, { tex: 'grama' }).at(0, 0.012, 0));
      function lado(side, ax, az, bx, bz, along) { // along: 'x' ou 'z', o eixo que corre ao longo da face
        if (g.side !== side) { seg(ax, az, bx, bz); return; }
        if (along === 'x') { seg(ax, az, g.from - 0.5, az); seg(g.to + 0.5, az, bx, bz); } else { seg(ax, az, ax, g.from - 0.5); seg(ax, g.to + 0.5, bx, bz); }
      }
      lado('north', x0, z0, x1, z0, 'x'); lado('south', x0, z1, x1, z1, 'x'); lado('west', x0, z0, x0, z1, 'z'); lado('east', x1, z0, x1, z1, 'z');
      if (P.gate) { cerca.add(porteira(P)); }
    }
    var P = V.pasture;
    [P].concat(V.folds || []).forEach(cercado);
    cerca.add(cocho(P.x1 - 4, P.z0 + 2.2)); cerca.add(fardo(P.x1 - 2.2, P.z0 + 4.5)); cerca.add(fardo(P.x1 - 3.4, P.z0 + 4.8)); cerca.add(fardo(P.x1 - 2.8, P.z0 + 4.6, 0.6));
    (V.folds || []).forEach(function (f) { cerca.add(cocho(f.x1 - 3, f.z0 + 2)); });
    L.funde(cerca);
    // pedregal: pedras soltas e moitas; com a figura 'arbusto', a moita vira dois planos em cruz no lote
    (V.boulders || []).forEach(function (p, i) { L.funde(pedra(p, i)); });
    var fig = self.art.sprites.arbusto && self.dim('arbusto'), mv = fig && L.get('s:arbusto', CLARO, true).v;
    (V.bushes || []).forEach(function (p, i) {
      if (!fig) { L.funde(moita(p, i)); return; }
      var h = 1.1 * p[2]; L.pe(mv, p[0], p[1], h * fig.w / fig.h, 0, h, sorte(i) * 3, sorte(i + 0.5) > 0.5);
    });

    // plantações
    V.fields.forEach(function (f) {
      var hortas = f.strips || [f];
      R.add(new Node(chao(hortas.map(function (s) { return { x0: f.x0, x1: f.x1, z0: s.z0, z1: s.z1 }; }), 2), f.kind === 'trigo' ? 0xf0e0b0 : 0xffffff, { tex: 'lavoura' }).at(0, 0.025, 0));
      if (f.kind === 'trigo') { trigal(L, f); L.funde(espantalho((f.x0 + f.x1) / 2 + 3, (f.z0 + f.z1) / 2)); return; }
      R.add(new Node(chao([{ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1 }], 3), 0xffffff, { tex: 'terra' }).at(0, 0.02, 0));
      hortas.forEach(function (s) { canteiro(L, s, f.x0, f.x1); }); // sem cercadura: a horta fica aberta
    });

    var PREDIO = { igreja: church, ferreiro: smith, bar: bar, casa_senhor: casaSenhor, padaria: padaria, forno: forno, moradia: moradia, alfaiate: alfaiate };
    this.salas = {};
    V.buildings.forEach(function (b) {
      var I = (V.interiores || {})[b.id], f = PREDIO[b.type] || moradia; // tipo novo sem desenho ainda: vira uma moradia, em vez de travar o jogo
      if (I && f === moradia) { I = null; }
      JAN = I ? [] : null;
      var o = f(b, I), jan = JAN; JAN = null;
      o.at(b.x, 0, b.z); o.rotY = b.rot * Math.PI / 180; L.funde(o);
      if (I) { self.salas[b.id] = self.montaSala(b, I, jan); }
    });
    L.poe(R);
    w.npcs.forEach(function (n) {
      var p = self.sprite(n.id, SIZE[n.id] || n.h || 1.9).at(n.x, n.y || 0, n.z); // y < 0: sentado atrás da mesa
      p.userData.ref = { type: 'npc', id: n.id }; R.add(p); self.pick.push(p);
      var S = self.salas[w.salaEm(n.x, n.z)];
      if (S) { p.dentro = S; S.gente.push(p); }
    });
    w.props.forEach(function (p) {
      var o = p.id === 'quadro_missoes' ? quadroAvisos() : bauAberto();
      o.at(p.x, 0, p.z); o.rotY = p.rot * Math.PI / 180;
      o.userData.ref = { type: 'prop', id: p.id }; o.userData.box = p;
      R.add(o); self.pick.push(o);
    });
  };
  // o interior de uma construção: um lote só dele (para sumir inteiro quando a porta não está à vista) e as luzes no mundo
  View.prototype.montaSala = function (b, I, jan) {
    var o = sala(b, I, jan), rot = b.rot * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot), L = new Lote(), grupo = new Node();
    function mundo(x, y, z) { return [b.x + c * x + s * z, y, b.z - s * x + c * z]; }
    o.at(b.x, 0, b.z); o.rotY = rot; L.funde(o);
    var S = { id: b.id, grupo: grupo, gente: [], l1: [0, 0, 0, 1], c1: [0, 0, 0], l2: [0, 0, 0, 1], c2: [0, 0, 0] };
    (I.luzes || []).slice(0, 2).forEach(function (l, i) {
      var p = mundo(l[0], l[1], l[2]); S['l' + (i + 1)] = [p[0], p[1], p[2], l[3]]; S['c' + (i + 1)] = l[4];
    });
    var pf = mundo(0, 0, b.d / 2); S.porta = [pf[0], pf[2]]; S.n = [s, c]; // centro da porta e a direção para fora
    L.poe(grupo, S); this.root.add(grupo);
    return S;
  };
  // o interior só é desenhado de dentro dele ou de onde a porta aparece (à frente da fachada, até onde a névoa deixa ver);
  // as figuras lá dentro seguem a sala e ganham a luz dela
  View.prototype.salaQuadro = function (eye) {
    var aqui = this.w.salaEm(eye[0], eye[2]), amb = this.env.amb, ids = Object.keys(this.salas), lim = this.env.fog[1] * 0.6;
    for (var i = 0; i < ids.length; i++) {
      var S = this.salas[ids[i]], dx = eye[0] - S.porta[0], dz = eye[2] - S.porta[1];
      S.grupo.visible = aqui === S.id || (dx * S.n[0] + dz * S.n[1] > -0.2 && dx * dx + dz * dz < lim * lim);
      S.gente.forEach(function (p) { p.visible = S.grupo.visible; p.brilho = luzEm(S, amb, p.pos[0], 1.2, p.pos[2]); });
    }
  };
  View.prototype.buildDynamic = function () {
    var self = this, w = this.w;
    w.nodes.forEach(function (n) {
      var tree = n.kind === 'arvore', jit = ((n.x * 7 + n.z * 3) % 5 + 5) % 5 * 0.07;
      var o = self.sprite(tree ? 'arvore' : 'veio', tree ? SIZE.arvore * (n.s || 0.9 + jit) : SIZE.veio).at(n.x, 0, n.z);
      o.userData.ref = { type: 'node', id: n.id }; o.userData.kind = n.kind;
      self.root.add(o); self.pick.push(o); self.objs[n.id] = o;
    });
    w.spawns.forEach(function (s, i) {
      var o = self.sprite('coelho', SIZE.coelho); o.userData.ref = { type: 'mob', id: 'coelho' + i };
      self.root.add(o); self.pick.push(o); self.objs['coelho' + i] = o;
    });
  };

  View.prototype.buildAmbient = function () {
    var self = this, V = this.w.vila, T = {}; this.amb = {}; this.walkers = []; this.cows = [];
    function add(id, img, name, h) {
      var o = self.sprite(img, h); o.userData.ref = { type: 'amb', id: id };
      self.root.add(o); self.pick.push(o); self.amb[id] = { o: o, name: name };
      return o;
    }
    Object.keys(V.trails || {}).forEach(function (k) { T[k] = trilha(V.trails[k]); });
    (V.walkers || []).forEach(function (w) {
      self.walkers.push({ d: w, T: T[w.trail], o: add(w.id, w.id, w.name, w.h), passo: 0.42 * w.h });
    });
    if (V.cows) { V.cows.herd.forEach(function (h, i) { self.cows.push({ h: h, o: add('vaca' + i, 'vaca', V.cows.name, V.cows.h) }); }); }
  };
  View.prototype.ambient = function (ms) {
    var seg = ms / 1000, c = this.w.vila.cows, rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    this.walkers.forEach(function (w) {
      var d = w.d, s = seg * d.speed + d.phase * w.T.len, p = passoEm(w.T, s, d.side), ph = s * Math.PI / w.passo;
      var sway = Math.sin(ph) * 0.014;                         // o corpo pende para o lado do pé de apoio
      w.o.at(p[0] + rx * sway, Math.abs(Math.sin(ph)) * 0.035, p[1] + rz * sway);
    });
    this.cows.forEach(function (v) {
      var m = vacaU(c, v.h, seg), p = vacaEm(c, v.h, m.u), n = vacaEm(c, v.h, m.u + 0.05);
      v.o.at(p[0], m.anda ? Math.abs(Math.sin(m.u * 40)) * 0.02 : 0, p[1]);
      var face = (n[0] - p[0]) * rx + (n[1] - p[1]) * rz;      // o desenho olha para a esquerda: indo para a direita da tela, espelha
      if (face) { v.o.scale[0] = face > 0 ? -1 : 1; }
    });
  };

  // ---------- céu ----------
  // cúpula: v = 0 no zênite; abaixo do horizonte fica a cor do horizonte, a mesma da névoa, e o chão some nela
  function cupula(R, voltas) {
    var v = [], S = 48, E = [-30, 0, 3, 8, 15, 25, 40, 60, 90];
    function p(i, e) {
      var a = i / S * Math.PI * 2, r = e * Math.PI / 180, c = Math.cos(r);
      v.push(Math.sin(a) * c * R, Math.sin(r) * R, Math.cos(a) * c * R, 0, 1, 0, i / S * voltas, e <= 0 ? 0.998 : Math.min(0.998, 1 - e / 90));
    }
    for (var j = 0; j + 1 < E.length; j++) { for (var i = 0; i < S; i++) {
      p(i, E[j]); p(i + 1, E[j]); p(i + 1, E[j + 1]); p(i, E[j]); p(i + 1, E[j + 1]); p(i, E[j + 1]);
    } }
    return { data: new Float32Array(v), count: v.length / 8 };
  }
  // anel de pé em volta do jogador, com a textura repetida 'voltas' vezes
  function anel(R, h, voltas) {
    var v = [], S = 96;
    for (var i = 0; i < S; i++) {
      var a = i / S * Math.PI * 2, b = (i + 1) / S * Math.PI * 2;
      Lote.prototype.plano(v, Math.sin(a) * R, Math.cos(a) * R, Math.sin(b) * R, Math.cos(b) * R, 0, h, i / S * voltas, (i + 1) / S * voltas);
    }
    return { data: new Float32Array(v), count: v.length / 8 };
  }
  View.prototype.buildCeu = function () {
    var self = this, P = NZ.ceu.pinturas(), L = [];
    Object.keys(P).forEach(function (k) { self.r.addTexture('c:' + k, P[k], true); });
    function poe(geo, tex, fog) { var o = new Node(geo, 0xffffff, { tex: 'c:' + tex, unlit: true }); o.userData.fog = fog; L.push(o); return o; }
    var domo = poe(cupula(2000, 6), 'degrade'), est = poe(cupula(1900, 2), 'estrelas');
    var sol = poe(screenGeo(0.5, 0.5), 'sol'), lua = poe(screenGeo(0.5, 0.5), 'lua');
    var nuv = poe(planeGeo(6000, 6000, 1400), 'nuvens', [500, 2700]); nuv.pos[1] = 300;
    // o anel mais perto fica além de tudo o que o jogador alcança, e os outros atrás dele. névoa: quanto cada um se dilui no ar
    var r0 = this.w.vila.bounds * 1.42 + 215;
    var serras = [[3, 2, 22.5, 0.8], [1.7, 3, 15, 0.68], [1, 4, 11.25, 0.55]].map(function (s, i) {
      var R = r0 * s[0];
      return poe(anel(R, R * Math.tan(s[2] * Math.PI / 180), s[1]), 'serra' + (i + 1), [0, R / s[3]]);
    });
    var bruma = poe(anel(250, 250 * Math.tan(3.5 * Math.PI / 180), 12), 'nevoa');
    this.ceuN = { domo: domo, est: est, sol: sol, lua: lua, nuv: nuv, serras: serras, bruma: bruma };
    this.env.ceu = L; this.ceuMs = null;
  };
  // sol e lua: quadro voltado para o centro, a 1500 m na direção d
  function astro(n, d, s) {
    var f = [-d[0], -d[1], -d[2]], r = norm([f[2], 0, -f[0]]), u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    n.world = [r[0] * s, r[1] * s, r[2] * s, 0, u[0] * s, u[1] * s, u[2] * s, 0, f[0], f[1], f[2], 0, d[0] * 1500, d[1] * 1500, d[2] * 1500, 1];
    n.visible = d[1] > -0.12;
  }
  // a hora vem do relógio do jogo, no fuso de quem joga; as cores mudam devagar, então basta recalcular uma vez por segundo
  View.prototype.ceuHora = function (ms) {
    if (this.ceuMs !== null && Math.abs(ms - this.ceuMs) < 1000) { return; }
    this.ceuMs = ms;
    var d = new Date(ms), h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600, m = NZ.ceu.momento(h), E = this.env, C = this.ceuN;
    E.sky = m.sky; E.gnd = m.gnd; E.sunCol = m.sun; E.sunDir = m.luz; E.fogCol = m.hor; E.tint = m.tint;
    // luz de dentro das casas: a das janelas de dia, quase só lareira e velas à noite
    E.amb = [0.6 - 0.45 * m.noite, 0.57 - 0.45 * m.noite, 0.52 - 0.43 * m.noite];
    C.domo.color = [m.zen[0] - m.hor[0], m.zen[1] - m.hor[1], m.zen[2] - m.hor[2]]; C.domo.emissive = m.hor; // cinza 0 vira horizonte; 1, zênite
    C.est.alpha = m.noite; C.est.visible = m.noite > 0.02; C.est.rotY = h / 24 * Math.PI * 2;
    C.nuv.color = m.nuvem; C.bruma.color = m.hor; C.sol.color = m.solCor;
    C.serras.forEach(function (n) { n.color = m.tint; });
    astro(C.sol, m.solDir, 420); astro(C.lua, m.luaDir, 300);
  };
  // as serras ficam no mundo, então o jogador anda em relação a elas (paralaxe); as nuvens correm com o relógio
  View.prototype.ceuQuadro = function (eye, tgt, ms) {
    this.ceuHora(ms);
    var C = this.ceuN;
    C.serras.forEach(function (n) { n.pos[0] = -eye[0]; n.pos[2] = -eye[2]; n.world = local(n); });
    C.nuv.pos[0] = (ms / 1000 * 1.6) % 1400; C.nuv.world = local(C.nuv);
    [C.domo, C.est, C.bruma].forEach(function (n) { n.world = local(n); });
    this.cam.skyVp = mul(perspective(this.fov, this.aspect, 1, 8000), lookAt([0, 0, 0], [tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]]));
  };

  View.prototype.resize = function (wpx, hpx, scale) {
    this.r.setSize(Math.max(1, Math.round(wpx * scale)), Math.max(1, Math.round(hpx * scale)));
    this.aspect = wpx / hpx;
  };
  View.prototype.hit = function (id) {
    this.flash[id] = 0.18;
    if (!(this.swing >= 0) || this.swing > SWING.T * 0.6) { this.swing = 0; } // golpe de espada (não reinicia no meio do corte)
  };

  // ---------- espada em primeira pessoa ----------
  // pose = deslocamento da mão (em unidades do tamanho da espada) e rotação (radianos, anti-horário) ao longo do golpe
  var SWING = { T: 0.36, keys: [ // t (s), dx, dy, rot
    [0.00, 0.00, 0.00, 0.00], [0.08, 0.06, 0.22, -0.50], [0.14, -0.24, 0.14, 0.40], [0.20, -0.56, -0.02, 1.00],
    [0.27, -0.50, -0.06, 0.90], [0.36, 0.00, 0.00, 0.00]] };
  function ease(t) { return t * t * (3 - 2 * t); }
  function swingPose(t) {
    var k = SWING.keys;
    if (!(t >= 0) || t >= SWING.T) { return [0, 0, 0]; }
    for (var i = 1; i < k.length; i++) {
      if (t <= k[i][0]) {
        var a = k[i - 1], b = k[i], e = ease((t - a[0]) / (b[0] - a[0]));
        return [a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e, a[3] + (b[3] - a[3]) * e];
      }
    }
    return [0, 0, 0];
  }
  View.prototype.swordNodes = function (st, dt, moving) {
    // a figura vem do item na mão (items.*.sprite); arma sem figura no atlas ainda usa a espada, e mãos nuas não mostram nada
    var eq = st && st.player && st.player.equip, it = eq && eq.arma && this.w.game.items[eq.arma];
    if (!this.art.dims.espada || !it) { return []; }
    if (!this.sword) {
      var d = this.art.dims.espada;
      // pivô na mão (no quadro 160x160 o punho fechado fica em ~ (120, 124) a partir do topo)
      this.swordGeo = screenGeo(120 / d.w, 1 - 124 / d.h);
      this.sword = [0, 1, 2].map(function (i) { return new Node(null, 0xffffff, { unlit: true, alpha: i ? 0.38 - i * 0.12 : 1 }); });
      this.trail = new Node(screenGeo(0.5, 0.5), 0xffffff, { unlit: true, tex: 's:espada_rastro' });
    }
    if (this.swing >= 0) { this.swing += dt; if (this.swing >= SWING.T) { this.swing = -1; } }
    var asp = this.aspect, U = Math.min(1, asp * 0.95);          // unidade em altura de tela (estreita em telas em pé)
    var size = 1.25 * U;                                          // altura do quadro da espada em unidades de NDC (tela = 2)
    // posição da mão em repouso (NDC): canto inferior direito; em pé, um pouco mais acima/à esquerda (botão Interagir)
    var hx = 1 - 0.22 * size / asp - (asp < 1 ? 0.12 : 0), hy = -1 + 0.23 * size + (asp < 1 ? 0.3 : 0);
    var bx = 0, by = 0;
    if (moving && !(this.swing >= 0)) { bx = Math.cos(this.bob * 0.5) * 0.012 * size; by = -Math.abs(Math.sin(this.bob)) * 0.02 * size; }
    var tex = 's:' + (it.sprite && this.art.dims[it.sprite] ? it.sprite : 'espada');
    var out = [], self = this, t = this.swing;
    function place(n, pose) {
      var c = Math.cos(pose[2]), s = Math.sin(pose[2]), sx = size / asp, sy = size;
      var cx = hx + bx + pose[0] * size / asp, cy = hy + by + pose[1] * size;
      n.world = [c * sx, s * sy, 0, 0, -s * sx, c * sy, 0, 0, 0, 0, 1, 0, cx, cy, 0, 1];
      n.geo = self.swordGeo; n.tex = tex; out.push(n);
    }
    var cutting = t >= 0.12 && t <= 0.27;
    if (cutting) {                                                // rastro do corte e borrão da lâmina
      var tr = this.trail, ts = size * 1.15, ta = this.art.dims.espada_rastro, tw = ts * ta.w / ta.h;
      tr.world = [tw / asp, 0, 0, 0, 0, ts, 0, 0, 0, 0, 1, 0, hx - 0.62 * size / asp, hy + 0.30 * size, 0, 1];
      out.push(tr);
      place(this.sword[2], swingPose(t - 0.05)); place(this.sword[1], swingPose(t - 0.025));
    }
    place(this.sword[0], swingPose(t));
    return out;
  };

  View.prototype.render = function (st, prev, alpha, dt, opts) {
    var self = this, w = this.w, p = st.player;
    w.nodes.forEach(function (n) {
      var o = self.objs[n.id], alive = st.nodes[n.id].alive;
      var img = n.kind === 'arvore' ? (alive ? 'arvore' : 'toco') : (alive ? 'veio' : 'veio_vazio');
      self.setImg(o, img);
    });
    var t = performance.now();
    st.mobs.forEach(function (mb) {
      var o = self.objs[mb.id]; o.visible = mb.alive;
      if (!mb.alive) { return; }
      var pv = prev && prev[mb.id], x = mb.x, z = mb.z;
      if (pv) { x = pv.x + (mb.x - pv.x) * alpha; z = pv.z + (mb.z - pv.z) * alpha; }
      var moving = pv && (Math.abs(mb.x - pv.x) + Math.abs(mb.z - pv.z) > 0.01);
      o.at(x, moving ? Math.abs(Math.sin(t / 110)) * 0.15 : 0, z);
      var f = self.flash[mb.id] || 0;
      o.emissive = f > 0 ? [0.7, 0.05, 0.02] : [0, 0, 0];
      if (f > 0) { self.flash[mb.id] = f - dt; }
    });
    // a marca só aparece com a macro trabalhando ou como padrão; ao só caminhar ela some, e a área fica guardada
    var a = (p.mode === 'macro' && p.macro.on) || p.mapNav === 'macro' ? p.macro.area : null;
    this.areaRing.visible = !!a;
    if (a) { this.areaRing.at(a.x, 0.07, a.z); this.areaRing.scale = [a.r, 1, a.r]; }

    var px = p.x, pz = p.z;
    if (opts.interp && prev && prev.player) { px = prev.player.x + (p.x - prev.player.x) * alpha; pz = prev.player.z + (p.z - prev.player.z) * alpha; }
    if (opts.moving) { this.bob += dt * 9; }
    var by = opts.moving ? Math.sin(this.bob) * 0.05 : 0;
    var sh = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0; this.shake = Math.max(0, this.shake - dt * 0.6);
    var eye = [px, 1.6 + by + sh, pz], cy = Math.cos(this.pitch);
    var tgt = [px + Math.sin(this.yaw) * cy, eye[1] + Math.sin(this.pitch), pz + Math.cos(this.yaw) * cy];
    var vp = mul(perspective(this.fov, this.aspect, 0.1, 200), lookAt(eye, tgt));
    this.cam = { eye: eye, vp: vp, yaw: this.yaw, pitch: this.pitch };
    this.ceuQuadro(eye, tgt, opts.clock === undefined ? Date.now() : opts.clock);
    this.ambient(opts.now === undefined ? Date.now() : opts.now);
    this.salaQuadro(eye);
    this.r.draw(this.root, this.cam, this.env);
    if (!opts.semArma) { this.r.overlay(this.swordNodes(st, dt, opts.moving)); } // a tela inicial mostra só a vila, sem a arma na mão
  };

  // clique: raio da câmera contra as figuras, aceitando só pixels desenhados (com folga).
  // solid: ignora moradores e vacas, que só têm nome ao passar o mouse e não podem tapar o que está atrás
  View.prototype.pickAt = function (nx, ny, solid) {
    var c = this.cam; if (!c) { return null; }
    var cy = Math.cos(c.pitch), f = [Math.sin(c.yaw) * cy, Math.sin(c.pitch), Math.cos(c.yaw) * cy];
    var r = norm([-f[2], 0, f[0]]);
    var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    var th = Math.tan(this.fov / 2), ax = nx * th * this.aspect, ay = ny * th;
    var d = norm([f[0] + r[0] * ax + u[0] * ay, f[1] + r[1] * ax + u[1] * ay, f[2] + r[2] * ax + u[2] * ay]);
    var best = null, bt = 1e9;
    for (var i = 0; i < this.pick.length; i++) {
      var o = this.pick[i]; if (!o.visible || !o.world || (solid && o.userData.ref.type === 'amb')) { continue; }
      var tt = o.userData.box ? this.hitBox(o.userData.box, c.eye, d) : this.hitSprite(o, c.eye, d);
      if (tt !== null && tt < bt) { bt = tt; best = o; }
    }
    return best ? { ref: best.userData.ref, d: bt } : null;
  };
  // objeto fixo: raio contra a caixa da pegada, do chão até a altura h
  View.prototype.hitBox = function (b, e, d) {
    var lo = [b.x - b.w / 2, 0, b.z - b.d / 2], hi = [b.x + b.w / 2, b.h, b.z + b.d / 2], t0 = 0, t1 = 1e9;
    for (var i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (e[i] < lo[i] || e[i] > hi[i]) { return null; } continue; }
      var a = (lo[i] - e[i]) / d[i], c = (hi[i] - e[i]) / d[i];
      t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c));
    }
    return t0 <= t1 ? t0 : null;
  };
  View.prototype.hitSprite = function (o, e, d) {
    var s = Math.sin(o.rotY), co = Math.cos(o.rotY), n = [s, 0, co];
    var den = d[0] * n[0] + d[2] * n[2]; if (Math.abs(den) < 1e-6) { return null; }
    var t = ((o.pos[0] - e[0]) * n[0] + (o.pos[2] - e[2]) * n[2]) / den; if (t <= 0) { return null; }
    var hx = e[0] + d[0] * t, hy = e[1] + d[1] * t, hz = e[2] + d[2] * t;
    var lu = ((hx - o.pos[0]) * co - (hz - o.pos[2]) * s) * (o.scale[0] < 0 ? -1 : 1), lv = hy - o.pos[1];
    var g = o.geo, a = this.art.alpha[o.userData.img];
    if (!a) { return Math.abs(lu) <= g.w / 2 && lv >= 0 && lv <= g.h ? t : null; }
    var W = a.w, H = a.h, px = Math.floor((lu / g.w + 0.5) * W), py = Math.floor((1 - lv / g.h) * H);
    var tol = Math.max(2, Math.round(H / g.h * 0.08)); // folga de ~8 cm em volta dos pixels desenhados
    if (px < -tol || px >= W + tol || py < -tol || py >= H + tol) { return null; }
    for (var oy = -tol; oy <= tol; oy += tol) { for (var ox = -tol; ox <= tol; ox += tol) {
      var x = px + ox, y = py + oy;
      if (x >= 0 && y >= 0 && x < W && y < H && a.data[y * W + x]) { return t; }
    } }
    return null;
  };
  View.prototype.project = function (x, y, z) {
    var m = this.cam && this.cam.vp; if (!m) { return null; }
    var cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.01) { return null; }
    return { x: (cx / cw + 1) / 2, y: (1 - cy / cw) / 2 };
  };

  // carrega art/atlas.json + walls.png + sprites.png. Paredes: quadros quadrados de atlas.size lado a lado.
  // Figuras: cada uma com o seu quadro {name, x, y, w, h}; guarda a máscara de alfa (w*h) para o clique.
  NZ.loadArt = function (base, ver) {
    var q = ver ? '?v=' + ver : '', iq = '?a=8' + (ver ? '-' + ver : '');
    function img(src) { return new Promise(function (ok, bad) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { bad(new Error(src)); }; i.src = src; }); }
    return fetch(base + 'atlas.json' + q, { cache: 'no-cache' }).then(function (r) { if (!r.ok) { throw new Error(base + 'atlas.json'); } return r.json(); }).then(function (atlas) {
      return Promise.all([img(base + 'walls.png' + iq), img(base + 'sprites.png' + iq)]).then(function (ims) {
        var S = atlas.size, art = { walls: {}, sprites: {}, alpha: {}, dims: {} };
        function cut(im, x, y, w, h) {
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(im, x, y, w, h, 0, 0, w, h); return c;
        }
        atlas.walls.forEach(function (n, i) { art.walls[n] = cut(ims[0], i * S, 0, S, S); });
        atlas.sprites.forEach(function (sp) {
          var c = cut(ims[1], sp.x, sp.y, sp.w, sp.h), d = c.getContext('2d').getImageData(0, 0, sp.w, sp.h).data, a = new Uint8Array(sp.w * sp.h);
          for (var k = 0; k < a.length; k++) { a[k] = d[k * 4 + 3] > 127 ? 1 : 0; }
          art.sprites[sp.name] = c; art.dims[sp.name] = { w: sp.w, h: sp.h }; art.alpha[sp.name] = { w: sp.w, h: sp.h, data: a };
        });
        return art;
      });
    });
  };

  NZ.View = View;
})(window.NZ = window.NZ || {});
