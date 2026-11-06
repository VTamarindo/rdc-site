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
  var FS = 'precision highp float;varying vec3 vn;varying vec3 vw;varying vec2 vu;uniform vec3 eye;uniform sampler2D tex;uniform vec3 col;uniform vec3 emi;uniform float alpha;uniform float unlit;' +
    'uniform vec3 sky;uniform vec3 gnd;uniform vec3 sunDir;uniform vec3 sunCol;uniform vec3 fogCol;uniform vec2 fog;' +
    'void main(){vec4 t=texture2D(tex,vu);if(t.a<0.5)discard;vec3 nn=normalize(vn);' +
    'vec3 l=mix(gnd,sky,nn.y*0.5+0.5)*0.75+max(dot(nn,sunDir),0.0)*sunCol*0.7;vec3 b=col*t.rgb;' +
    'vec3 c=mix(b*l,b,unlit)+emi;float vd=distance(vw,eye);float f=clamp((vd-fog.x)/(fog.y-fog.x),0.0,1.0);gl_FragColor=vec4(mix(c,fogCol,f),alpha);}';

  function Renderer(canvas) {
    var gl = this.gl = canvas.getContext('webgl', { antialias: false, alpha: false }) || canvas.getContext('experimental-webgl');
    if (!gl) { throw new Error('WebGL indisponível'); }
    this.canvas = canvas; this.tex = {};
    function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { throw new Error(gl.getShaderInfoLog(o)); } return o; }
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    var u = this.u = {};
    ['VP', 'M', 'N', 'eye', 'tex', 'col', 'emi', 'alpha', 'unlit', 'sky', 'gnd', 'sunDir', 'sunCol', 'fogCol', 'fog'].forEach(function (k) { u[k] = gl.getUniformLocation(pr, k); });
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
    gl.uniformMatrix4fv(u.VP, false, new Float32Array(cam.vp)); gl.uniform3fv(u.eye, cam.eye);
    gl.uniform3fv(u.sky, env.sky); gl.uniform3fv(u.gnd, env.gnd); gl.uniform3fv(u.sunDir, env.sunDir); gl.uniform3fv(u.sunCol, env.sunCol);
    gl.uniform3fv(u.fogCol, env.fogCol); gl.uniform2fv(u.fog, env.fog);
    var late = [];
    (function walk(n, parentM) {
      if (!n.visible) { return; }
      if (n.sprite) { n.rotY = Math.atan2(cam.eye[0] - n.pos[0], cam.eye[2] - n.pos[2]); } // sempre de frente para a câmera
      var m = parentM ? mul(parentM, local(n)) : local(n);
      n.world = m;
      if (n.geo) { if (n.alpha < 1) { late.push(n); } else { self.mesh(n); } }
      for (var i = 0; i < n.children.length; i++) { walk(n.children[i], m); }
    })(root, null);
    if (late.length) { gl.enable(gl.BLEND); gl.depthMask(false); late.forEach(function (n) { self.mesh(n); }); gl.depthMask(true); gl.disable(gl.BLEND); }
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
  function house(b, wall, wallTile, roof) {
    var g = new Node();
    g.add(box(b.w, b.h, b.d, wall, wallTile, 0, b.h / 2, 0));
    g.add(new Node(roofSlopeUV(gableGeo(b.w + 0.8, b.w * 0.45, b.d + 0.8, 2), b.d), 0xffffff, { tex: roof }).at(0, b.h, 0));
    g.add(box(1.4, 2.2, 0.1, 'porta', 'fit', 0, 1.1, b.d / 2 + 0.05));
    return g;
  }
  function win(g, x, y, z, side) { g.add(side ? box(0.08, 1.0, 1.0, 'janela', 'fit', x, y, z) : box(1.0, 1.0, 0.08, 'janela', 'fit', x, y, z)); }
  function church(b) {
    var g = house(b, 'cal', 2.5, 'telha_escura'), tw = 2.6, th = b.h + 4.5, tz = b.d / 2 - tw / 2 - 0.2;
    g.add(box(tw, th, tw, 'cal', 2.5, 0, th / 2, tz));
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
  function smith(b) {
    var g = house(b, 'pedra', 2, 'palha');
    g.add(box(1, 3, 1, 'pedra', 1, b.w / 2 - 1, b.h + 1.5, -b.d / 4));
    g.add(box(1.6, 1, 1.2, 'pedra', 1, -2, 0.5, b.d / 2 + 1.2));
    var coal = box(1.2, 0.3, 0.9, null, 1, -2, 1.05, b.d / 2 + 1.2, 0xd8581c); coal.unlit = true; g.add(coal);
    g.add(box(0.9, 0.3, 0.4, null, 1, 2, 0.65, b.d / 2 + 1.3, 0x3a3a42)); g.add(box(0.4, 0.5, 0.4, 'tabuas', 1, 2, 0.25, b.d / 2 + 1.3));
    win(g, 2.2, 1.9, b.d / 2 + 0.05);
    placaPendurada(g, 'placa_ferreiro', b.w / 2 + 0.6, b.d / 2 + 0.6);
    return g;
  }
  function bar(b) {
    var g = house(b, 'enxaimel', 2.5, 'telha');
    g.add(box(b.w + 0.1, 0.25, b.d + 0.1, 'tabuas', 1, 0, 2.6, 0, 0x8a7a6a));
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

  // altura em metros do QUADRO de cada figura (o pé fica na base do quadro; a largura segue a proporção do quadro).
  // pessoas: quadro 192px, figura ~185px => ~1,8-1,9 m; coelho ~0,45 m; árvore ~5,5 m; veio ~1,6 m de rocha
  var SIZE = { padre: 1.9, ferreiro: 1.97, taberneiro: 1.92, anselmo: 1.88, coelho: 0.48, arvore: 5.9, toco: 5.9, veio: 2.4, veio_vazio: 2.4 };

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

  function View(canvas, world, art) {
    this.w = world; this.r = new Renderer(canvas); this.art = art;
    var self = this;
    Object.keys(art.walls).forEach(function (k) { self.r.addTexture(k, art.walls[k], true); });
    Object.keys(art.sprites).forEach(function (k) { self.r.addTexture('s:' + k, art.sprites[k], false); });
    this.root = new Node(); this.pick = []; this.objs = {}; this.flash = {};
    this.env = { sky: hex(0xe6ecf5), gnd: hex(0x5a4a32), sunDir: norm([0.45, 0.75, 0.35]), sunCol: hex(0xfff1d6), fogCol: hex(0xa9b9c4), fog: [18, 62] };
    this.buildStatic(); this.buildDynamic(); this.buildAmbient();
    this.areaRing = this.root.add(new Node(ringGeo(0.96, 1, 48), 0xe8c45a, { alpha: 0.6, unlit: true }));
    this.areaRing.visible = false;
    this.yaw = Math.PI; this.pitch = -0.05; this.swing = -1; this.bob = 0; this.shake = 0; this.fov = 70 * Math.PI / 180; this.aspect = 1;
  }

  View.prototype.sprite = function (name, h) {
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

  View.prototype.buildStatic = function () {
    var w = this.w, V = w.vila, R = this.root, self = this;
    R.add(new Node(planeGeo(240, 240, 3), 0xffffff, { tex: 'grama' }));
    R.add(new Node(planeGeo(V.fence.half * 2, V.fence.half * 2, 3), 0xe6eccc, { tex: 'grama' }).at(0, 0.01, 0));
    var rd = V.road; R.add(new Node(planeGeo(rd.w, rd.z1 - rd.z0, 3), 0xffffff, { tex: 'terra' }).at(rd.x, 0.02, (rd.z0 + rd.z1) / 2));
    var pl = V.plaza;
    R.add(cyl(pl.r + 0.35, pl.r + 0.35, 0.06, 40, 'pedra', 1.5, 0, 0x9a9a9a).at(pl.x, 0.03, pl.z));
    R.add(cyl(pl.r, pl.r, 0.1, 40, 'pavimento', 2.5).at(pl.x, 0.05, pl.z));

    var F = V.fence.half - 0.5, g = V.fence.gate;
    function seg(x0, z0, x1, z1) {
      var len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2));
      for (var i = 0; i <= n; i++) { var t = i / n; R.add(box(0.18, 1.3, 0.18, 'tabuas', 1, x0 + (x1 - x0) * t, 0.65, z0 + (z1 - z0) * t)); }
      [0.5, 1.0].forEach(function (y) {
        var b = box(len, 0.1, 0.08, 'tabuas', 1, (x0 + x1) / 2, y, (z0 + z1) / 2); b.rotY = -Math.atan2(z1 - z0, x1 - x0); R.add(b);
      });
    }
    seg(-F, -F, F, -F); seg(-F, -F, -F, F); seg(F, -F, F, F); seg(-F, F, g.from, F); seg(g.to, F, F, F);

    V.buildings.forEach(function (b) {
      var o = b.type === 'igreja' ? church(b) : b.type === 'ferreiro' ? smith(b) : bar(b);
      o.at(b.x, 0, b.z); o.rotY = b.rot * Math.PI / 180; R.add(o);
    });
    w.npcs.forEach(function (n) {
      var p = self.sprite(n.id, SIZE[n.id] || 1.9).at(n.x, 0, n.z);
      p.userData.ref = { type: 'npc', id: n.id }; R.add(p); self.pick.push(p);
    });
    w.props.forEach(function (p) {
      var o = p.id === 'quadro_missoes' ? quadroAvisos() : bauAberto();
      o.at(p.x, 0, p.z); o.rotY = p.rot * Math.PI / 180;
      o.userData.ref = { type: 'prop', id: p.id }; o.userData.box = p;
      R.add(o); self.pick.push(o);
    });
  };
  View.prototype.buildDynamic = function () {
    var self = this, w = this.w;
    w.nodes.forEach(function (n) {
      var tree = n.kind === 'arvore', jit = ((n.x * 7 + n.z * 3) % 5 + 5) % 5 * 0.07;
      var o = self.sprite(tree ? 'arvore' : 'veio', tree ? SIZE.arvore * (0.9 + jit) : SIZE.veio).at(n.x, 0, n.z);
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
  var BLADE = ['espada', 'espada_afiada', 'espada_temperada'];
  View.prototype.swordNodes = function (st, dt, moving) {
    if (!this.art.dims.espada) { return []; }
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
    var w = (st && st.player && st.player.weapon) || 0, tex = 's:' + BLADE[Math.max(0, Math.min(2, w))];
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
    this.ambient(opts.now === undefined ? Date.now() : opts.now);
    this.r.draw(this.root, this.cam, this.env);
    this.r.overlay(this.swordNodes(st, dt, opts.moving));
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
