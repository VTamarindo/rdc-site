/* Motor 2.5D (raycasting) leve: paredes texturizadas + sprites de imagem única.
   Resolução interna baixa; tudo desenhado direto num buffer de pixels. */
(function (ZG) {
  'use strict';

  var W = 320, H = 200, TS = 64;
  var FOV_K = 0.66;                 // tamanho do plano da câmera (campo de visão ~66 graus)

  function packRGB(r, g, b) { return (255 << 24) | (b << 16) | (g << 8) | r; }

  function fillRange(buf, v, a, b) {
    if (buf.fill) { buf.fill(v, a, b); return; }
    for (var i = a; i < b; i++) { buf[i] = v; }
  }

  // Corta o atlas em texturas de 64x64 (Uint32Array, mesmo formato do buffer da tela)
  function sliceAtlas(img, count) {
    var c = document.createElement('canvas');
    c.width = TS * count; c.height = TS;
    var cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    var full = new Uint32Array(cx.getImageData(0, 0, c.width, c.height).data.buffer);
    var out = [];
    for (var i = 0; i < count; i++) {
      var t = new Uint32Array(TS * TS);
      for (var y = 0; y < TS; y++) {
        for (var x = 0; x < TS; x++) { t[y * TS + x] = full[y * c.width + i * TS + x]; }
      }
      out.push(t);
    }
    return out;
  }

  function Engine(canvas, wallsImg, spritesImg, atlas) {
    canvas.width = W; canvas.height = H;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.zbuf = new Float32Array(W);
    this.walls = sliceAtlas(wallsImg, atlas.walls.length);
    this.sprites = sliceAtlas(spritesImg, atlas.sprites.length);
    this.spriteIndex = {};
    for (var i = 0; i < atlas.sprites.length; i++) { this.spriteIndex[atlas.sprites[i]] = i; }

    // teto e chão: degradê pré-calculado por linha (sem textura, para ser leve)
    this.rows = new Uint32Array(H);
    var half = H / 2;
    for (var y = 0; y < H; y++) {
      if (y < half) {
        var t = (half - y) / half;             // 0 no horizonte, 1 no topo
        var k = 0.22 + 0.5 * t;
        this.rows[y] = packRGB((42 * k) | 0, (38 * k) | 0, (52 * k) | 0);
      } else {
        var u = (y - half) / half;             // 0 no horizonte, 1 embaixo
        var m = 0.2 + 0.7 * u;
        this.rows[y] = packRGB((74 * m) | 0, (62 * m) | 0, (48 * m) | 0);
      }
    }
  }

  function shade(c, f) {                       // f de 0 a 256
    var r = ((c & 255) * f) >> 8;
    var g = (((c >> 8) & 255) * f) >> 8;
    var b = (((c >> 16) & 255) * f) >> 8;
    return (255 << 24) | (b << 16) | (g << 8) | r;
  }

  function fog(dist) {
    var f = (256 / (1 + dist * 0.38)) | 0;
    return f < 16 ? 16 : f;
  }

  /* map: {w,h,grid:Uint8Array}; list: [{x,y,tex,scale,flash}] */
  Engine.prototype.render = function (px, py, ang, map, list) {
    var buf = this.buf, zbuf = this.zbuf, walls = this.walls;
    var mw = map.w, mh = map.h, grid = map.grid;
    var dirX = Math.cos(ang), dirY = Math.sin(ang);
    var plX = -dirY * FOV_K, plY = dirX * FOV_K;
    var x, y;
    this.cam = { x: px, y: py, dirX: dirX, dirY: dirY, plX: plX, plY: plY };
    var hits = this.hits = [];

    for (y = 0; y < H; y++) { fillRange(buf, this.rows[y], y * W, y * W + W); }

    for (x = 0; x < W; x++) {
      var camX = 2 * x / W - 1;
      var rdx = dirX + plX * camX, rdy = dirY + plY * camX;
      var mapX = px | 0, mapY = py | 0;
      var ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
      var ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      var stepX, stepY, sdx, sdy;
      if (rdx < 0) { stepX = -1; sdx = (px - mapX) * ddx; } else { stepX = 1; sdx = (mapX + 1 - px) * ddx; }
      if (rdy < 0) { stepY = -1; sdy = (py - mapY) * ddy; } else { stepY = 1; sdy = (mapY + 1 - py) * ddy; }
      var side = 0, hit = 0, guard = 0;
      while (hit === 0 && guard++ < 80) {
        if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; } else { sdy += ddy; mapY += stepY; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= mw || mapY >= mh) { hit = 1; }
        else if (grid[mapY * mw + mapX] > 0) { hit = grid[mapY * mw + mapX]; }
      }
      var perp = side === 0 ? sdx - ddx : sdy - ddy;
      if (perp < 0.05) { perp = 0.05; }
      zbuf[x] = perp;

      var wx = side === 0 ? py + perp * rdy : px + perp * rdx;
      wx -= Math.floor(wx);
      var tx = (wx * TS) | 0;
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) { tx = TS - 1 - tx; }

      var tex = walls[hit - 1] || walls[0];
      var lineH = (H / perp) | 0;
      var y0 = (H - lineH) >> 1;
      var ds = y0 < 0 ? 0 : y0;
      var de = y0 + lineH > H ? H : y0 + lineH;
      var step = TS / lineH;
      var tpos = (ds - y0) * step;
      var f = fog(perp);
      if (side === 1) { f = (f * 0.75) | 0; }
      for (y = ds; y < de; y++) {
        var ty = tpos | 0;
        if (ty > TS - 1) { ty = TS - 1; }
        tpos += step;
        buf[y * W + x] = shade(tex[(ty << 6) + tx], f);
      }
    }

    // sprites: do mais longe para o mais perto
    var vis = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var dx = s.x - px, dy = s.y - py;
      var depth = dx * dirX + dy * dirY;
      if (depth < 0.2) { continue; }
      vis.push({ s: s, depth: depth, lat: dx * -dirY + dy * dirX });
    }
    vis.sort(function (a, b) { return b.depth - a.depth; });

    for (i = 0; i < vis.length; i++) {
      var v = vis[i], sp = v.s, tex2 = this.sprites[sp.tex];
      if (!tex2) { continue; }
      var full = H / v.depth;
      var sh = full * (sp.scale || 1);
      var sx = (W / 2) * (1 + v.lat / (FOV_K * v.depth));
      var top = H / 2 + full / 2 - sh;
      var left = sx - sh / 2;
      var xa = Math.max(0, Math.floor(left)), xb = Math.min(W - 1, Math.floor(left + sh));
      var ya = Math.max(0, Math.floor(top)), yb = Math.min(H - 1, Math.floor(top + sh));
      var ff = fog(v.depth);
      var fl = sp.flash ? ((sp.flash * 200) | 0) : 0;
      var inv = TS / sh, seen = false;
      for (x = xa; x <= xb; x++) {
        if (v.depth >= zbuf[x]) { continue; }
        seen = true;
        var stx = ((x - left) * inv) | 0;
        if (stx < 0) { stx = 0; } else if (stx > TS - 1) { stx = TS - 1; }
        for (y = ya; y <= yb; y++) {
          var sty = ((y - top) * inv) | 0;
          if (sty < 0) { sty = 0; } else if (sty > TS - 1) { sty = TS - 1; }
          var c = tex2[(sty << 6) + stx];
          if ((c >>> 24) < 128) { continue; }
          if (fl) {
            var cr = c & 255, cg = (c >> 8) & 255, cb = (c >> 16) & 255;
            cr += ((255 - cr) * fl) >> 8; cg += ((255 - cg) * fl) >> 8; cb += ((255 - cb) * fl) >> 8;
            c = (255 << 24) | (cb << 16) | (cg << 8) | cr;
          }
          buf[y * W + x] = shade(c, ff);
        }
      }
      if (seen && sp.ref) { hits.push({ ref: sp.ref, tex: tex2, left: left, top: top, size: sh, depth: v.depth }); }
    }
    this.ctx.putImageData(this.img, 0, 0);
  };

  // O que está sob o ponto (sx, sy) da tela interna 320x200: uma entidade (pelo pixel do sprite) ou nada
  Engine.prototype.pick = function (sx, sy) {
    var hits = this.hits || [];
    for (var i = hits.length - 1; i >= 0; i--) {
      var h = hits[i], x = sx | 0;
      if (sx < h.left || sx >= h.left + h.size || sy < h.top || sy >= h.top + h.size) { continue; }
      if (x < 0 || x >= W || h.depth >= this.zbuf[x]) { continue; }
      var tx = Math.min(TS - 1, ((sx - h.left) * TS / h.size) | 0), ty = Math.min(TS - 1, ((sy - h.top) * TS / h.size) | 0);
      var pad = 0, ok = false;
      // aceita um clique perto do desenho (sprites pequenos são difíceis de acertar)
      for (var oy = -2; oy <= 2 && !ok; oy++) {
        for (var ox = -2; ox <= 2 && !ok; ox++) {
          var u = tx + ox * 3, w = ty + oy * 3;
          if (u < 0 || w < 0 || u >= TS || w >= TS) { continue; }
          if ((h.tex[(w << 6) + u] >>> 24) >= 128) { ok = true; }
        }
      }
      if (ok || pad) { return h.ref; }
    }
    return null;
  };
  // Casa do chão sob o ponto (sx, sy), se o chão estiver visível ali
  Engine.prototype.floorAt = function (sx, sy) {
    var c = this.cam;
    if (!c || sy <= H / 2 + 1) { return null; }
    var d = H / (2 * sy - H);
    var x = Math.max(0, Math.min(W - 1, sx | 0));
    if (d > this.zbuf[x] + 0.05) { return null; }
    var camX = 2 * sx / W - 1;
    var wx = c.x + (c.dirX + c.plX * camX) * d, wy = c.y + (c.dirY + c.plY * camX) * d;
    return { x: Math.floor(wx), y: Math.floor(wy) };
  };

  ZG.Engine = Engine;
  ZG.SCREEN = { w: W, h: H };
})(window.ZG = window.ZG || {});
