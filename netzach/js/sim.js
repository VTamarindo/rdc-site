/* Netzach · simulação da vila (protótipo)
   Lógica pura: não desenha nada e não toca no DOM.
   Tudo avança em tiques fixos (settings.tickSec). O mesmo código roda ao vivo e
   no recálculo do tempo fora, então assistir e voltar depois dão o mesmo resultado. */
(function (NZ) {
  'use strict';

  // ---------- sorteio com semente (salva no save) ----------
  function rnd(st) {
    var t = (st.seed = (st.seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // '2026-11-6' -> 20261106: as datas das diárias só andam para a frente
  function dayNum(k) { var a = String(k).split('-'); return a[0] * 10000 + a[1] * 100 + +a[2]; }
  function dist(ax, az, bx, bz) { var dx = bx - ax, dz = bz - az; return Math.sqrt(dx * dx + dz * dz); }
  // sorteio fixo pelo índice (sem mexer na semente do save): os bichos das regiões nascem sempre no mesmo lugar
  function sorte(i) { var t = Math.sin(i * 12.9898) * 43758.5453; return t - Math.floor(t); }
  // polígono [[x, z], ...] (o limite e os terrenos de vila.json): o ponto está dentro? E a distância até a borda,
  // positiva dentro e negativa fora (o desenho usa para o degradê entre terrenos e a mata do limite)
  NZ.noPoligono = function (P, x, z) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var xi = P[i][0], zi = P[i][1], xj = P[j][0], zj = P[j][1];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) { c = !c; }
    }
    return c;
  };
  NZ.distSegmento = function (x, z, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L));
    return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
  };
  // distância até um rio (curva aberta), em m
  NZ.distRio = function (R, x, z) {
    var d = 1e9;
    for (var k = 0; k + 1 < R.pts.length; k++) { d = Math.min(d, NZ.distSegmento(x, z, R.pts[k], R.pts[k + 1])); }
    return d;
  };
  // o ponto está numa travessia (ponte ou vau)? ang = direção do rio ali; a passagem corre de través, len de comprimento
  NZ.naTravessia = function (T, x, z) {
    return (T || []).some(function (t) {
      var a = t.ang * Math.PI / 180, dx = x - t.x, dz = z - t.z, ao = dx * Math.cos(a) + dz * Math.sin(a), tr = -dx * Math.sin(a) + dz * Math.cos(a);
      return Math.abs(ao) < t.w / 2 && Math.abs(tr) < t.len / 2;
    });
  };
  NZ.distPoligono = function (P, x, z) {
    var d = 1e9;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var ax = P[j][0], az = P[j][1], dx = P[i][0] - ax, dz = P[i][1] - az, L = dx * dx + dz * dz || 1;
      var t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)), ex = x - ax - t * dx, ez = z - az - t * dz;
      d = Math.min(d, ex * ex + ez * ez);
    }
    d = Math.sqrt(d);
    return NZ.noPoligono(P, x, z) ? d : -d;
  };
  // recurso: o ponto dele mais perto de (x, z). Retalho de plantação é um retângulo; árvore e veio, o centro da célula
  function nodePoint(n, x, z) { var r = n.rect; return r ? { x: Math.max(r.x0, Math.min(r.x1, x)), z: Math.max(r.z0, Math.min(r.z1, z)) } : n; }
  function nodeDist(n, x, z) { var q = nodePoint(n, x, z); return dist(x, z, q.x, q.z); }
  // tempo que falta, para mostrar: '10 min' ou '45 s' (a folga tira o erro de soma de 600,0000001 s virar 11 min)
  function fmtLeft(s) { return s > 90 ? Math.ceil(s / 60 - 1e-6) + ' min' : Math.ceil(s - 1e-6) + ' s'; }

  // ---------- mundo estático (montado a partir de vila.json) ----------
  function World(game, vila) {
    this.game = game; this.vila = vila;
    var B = this.B = vila.bounds, N = this.N = B * 2;
    this.grid = new Uint8Array(N * N);
    var self = this, i;

    // borda do mundo
    for (i = 0; i < N; i++) { this.grid[i] = 1; this.grid[(N - 1) * N + i] = 1; this.grid[i * N] = 1; this.grid[i * N + N - 1] = 1; }
    // limite jogável (vila.json → limite): a borda natural do rascunho; toda célula com o centro fora dela bloqueia
    if (vila.limite) {
      for (var cz = 0; cz < N; cz++) { for (var cx = 0; cx < N; cx++) { if (!NZ.noPoligono(vila.limite, cx - B + 0.5, cz - B + 0.5)) { this.grid[cz * N + cx] = 1; } } }
    }
    // rios (vila.json → rios): a água bloqueia; nas travessias (ponte ou vau) a passagem fica livre
    (vila.rios || []).forEach(function (R) {
      for (var k = 0; k + 1 < R.pts.length; k++) {
        var a = R.pts[k], b = R.pts[k + 1], m = R.w / 2 + 1;
        for (var x = Math.floor(Math.min(a[0], b[0]) - m); x <= Math.max(a[0], b[0]) + m; x++) {
          for (var z = Math.floor(Math.min(a[1], b[1]) - m); z <= Math.max(a[1], b[1]) + m; z++) {
            if (NZ.distSegmento(x + 0.5, z + 0.5, a, b) < R.w / 2 && !NZ.naTravessia(vila.travessias, x + 0.5, z + 0.5)) { self.block(x, z); }
          }
        }
      }
    });

    // a vila não tem mais cerca: só o pasto e o aprisco são cercados, nas células da borda, abertos na porteira
    [vila.pasture].concat(vila.folds || []).forEach(function (P) { self.cercado(P); });
    // os dois mourões do portão, um de cada lado da estrada
    var gt = vila.gate;
    if (gt) { this.block(gt.x - gt.w / 2 - 0.5, gt.z); this.block(gt.x + gt.w / 2 + 0.5, gt.z); }
    // pedras soltas: a pegada inteira bloqueia
    (vila.boulders || []).forEach(function (b) {
      var r = b[2] / 2;
      for (var x = Math.floor(b[0] - r); x < Math.ceil(b[0] + r); x++) { for (var z = Math.floor(b[1] - r); z < Math.ceil(b[1] + r); z++) { self.block(x, z); } }
    });

    // construções (pegada no mundo: troca w/d quando gira 90°)
    this.buildings = vila.buildings.map(function (b) {
      var turned = Math.abs(b.rot) === 90;
      var fw = turned ? b.d : b.w, fd = turned ? b.w : b.d;
      var r = { id: b.id, x0: b.x - fw / 2, x1: b.x + fw / 2, z0: b.z - fd / 2, z1: b.z + fd / 2 };
      for (var x = Math.floor(r.x0); x < Math.ceil(r.x1); x++) {
        for (var z = Math.floor(r.z0); z < Math.ceil(r.z1); z++) { self.block(x, z); }
      }
      return r;
    });
    // construções com interior (vila.json → interiores): a sala por dentro das paredes e o vão da porta voltam a ser livres
    this.sala = new Uint8Array(N * N); this.salas = [];
    vila.buildings.forEach(function (b, k) { var I = (vila.interiores || {})[b.id]; if (I) { self.abreSala(b, I, self.buildings[k]); } });

    // recursos: centralizados na célula, que fica bloqueada
    this.nodes = [];
    vila.trees.forEach(function (p, k) { self.addNode('arvore', 'arv' + k, p); self.nodes[self.nodes.length - 1].s = p[2] || 0; }); // p[2]: escala da figura (0 = a de sempre)
    vila.rocks.forEach(function (p, k) { self.addNode('veio', 'veio' + k, p); });
    (vila.fields || []).forEach(function (f) { self.addCrops(f); });
    this.nodeById = {};
    this.nodes.forEach(function (n) { self.nodeById[n.id] = n; });
    // vacas e ovelhas: passeiam pelo relógio do jogo (st.t), então a simulação (a macro) e o desenho as veem no mesmo lugar
    this.rebanho = []; this.bichoById = {};
    if (vila.cows) { vila.cows.herd.forEach(function (h, i) { self.rebanho.push({ id: 'vaca' + i, img: 'vaca', c: vila.cows, h: h }); }); }
    var nOv = 0;
    (vila.folds || []).forEach(function (f) {
      var F = f.flock; if (!F) { return; }
      // a área do passeio é o aprisco por dentro, longe da cerca
      var c = { ciclo: F.ciclo, anda: F.anda, area: [f.x0 + 1.6, f.z0 + 1.6, f.x1 - 1.6, f.z1 - 1.6] };
      F.herd.forEach(function (h) { self.rebanho.push({ id: 'ovelha' + nOv, img: 'ovelha', c: c, h: h }); nOv++; });
    });
    this.rebanho.forEach(function (b) { self.bichoById[b.id] = b; });
    // pessoa da planta sem ficha em game.json (o alfaiate antes de ganhar loja): entra com uma ficha mínima, sem serviços
    game.npcs = game.npcs || {};
    var PS = game.pessoas || {};
    vila.npcs.forEach(function (n) { if (!game.npcs[n.id]) { game.npcs[n.id] = { name: (PS[n.id] && PS[n.id].name) || n.name || n.id, idle: 'Bom dia.', services: [] }; } });
    this.npcs = vila.npcs.map(function (n) { self.block(n.x, n.z); return { id: n.id, x: n.x, z: n.z }; });
    // gente: os NPCs parados e os moradores que andam, numa lista só, pelo id. Quem é e como luta vem de
    // game.json → pessoas (papel), não de onde a pessoa fica: mudar alguém de trilha para posto fixo não muda nada aqui
    var AL = game.aldeoes || { papeis: {} };
    this.people = []; this.personById = {};
    function person(id, name, fixed, x, z) {
      if (self.personById[id]) { return; }
      var d = PS[id] || {}, q = { id: id, name: name, fixed: fixed, x: x, z: z, papel: AL.papeis[d.papel] ? d.papel : AL.papelPadrao };
      self.people.push(q); self.personById[id] = q;
    }
    vila.npcs.forEach(function (n) { person(n.id, game.npcs[n.id].name, true, n.x, n.z); });
    (vila.walkers || []).forEach(function (wk) { person(wk.id, (PS[wk.id] && PS[wk.id].name) || wk.name || wk.id, false); });

    // objetos fixos do cenário: w x d em metros é a pegada no mundo, centrada em (x, z); h é a altura para o clique
    this.props = (vila.props || []).map(function (p) {
      for (var x = Math.floor(p.x - p.w / 2); x < Math.ceil(p.x + p.w / 2); x++) {
        for (var z = Math.floor(p.z - p.d / 2); z < Math.ceil(p.z + p.d / 2); z++) { self.block(x, z); }
      }
      return { id: p.id, name: p.name, npc: p.npc, x: p.x, z: p.z, w: p.w, d: p.d, h: p.h, rot: p.rot || 0 };
    });
    this.fechaSalas();
    this.plaza = vila.plaza;

    // bichos: os coelhos da planta primeiro (coelho0..9, os ids dos saves antigos), depois os das regiões:
    // cada monstro com 'spot' nasce 'count' vezes em cada ponto marcado com esse tipo, espalhado no raio, sempre no mesmo lugar
    this.spawns = vila.rabbits.map(function (p, i) { return { id: 'coelho' + i, kind: 'coelho', x: p[0] + 0.5, z: p[1] + 0.5 }; });
    keys(game.monsters).forEach(function (k) {
      var M = game.monsters[k], n = 0; if (!M.spot) { return; }
      (vila.regions || []).forEach(function (r) { (r.spots || []).forEach(function (s) {
        if (s.kind !== M.spot) { return; }
        for (var c = 0; c < (M.count || 1); c++, n++) {
          var a = sorte(n * 7.3 + k.length) * Math.PI * 2, rr = (M.count > 1 ? 0.2 + 0.45 * sorte(n * 3.1 + 1) : 0) * s.r;
          var q = self.nearestFree(s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr) || { x: s.x, z: s.z };
          self.spawns.push({ id: k + n, kind: k, x: q.x, z: q.z });
        }
      }); });
    });
    this.spawnById = {};
    this.spawns.forEach(function (s, i) { s.i = i; self.spawnById[s.id] = s; });
  }
  // plantação: cada faixa vira retalhos de ~8 m, recursos que não bloqueiam o chão, cada um com o seu tempo para voltar.
  // Grande o bastante para o save e o desenho ficarem leves (39 retalhos no mapa atual), pequeno para a colheita aparecer no campo
  var RETALHO = 8;
  World.prototype.addCrops = function (f) {
    var self = this, faixas = f.strips || [{ kind: f.kind, z0: f.z0, z1: f.z1 }];
    faixas.forEach(function (s) {
      if (!self.game.nodes[s.kind]) { return; }
      var nx = Math.max(1, Math.round((f.x1 - f.x0) / RETALHO)), nz = Math.max(1, Math.round((s.z1 - s.z0) / RETALHO));
      for (var i = 0; i < nx; i++) {
        for (var j = 0; j < nz; j++) {
          var r = { x0: f.x0 + (f.x1 - f.x0) * i / nx, x1: f.x0 + (f.x1 - f.x0) * (i + 1) / nx, z0: s.z0 + (s.z1 - s.z0) * j / nz, z1: s.z0 + (s.z1 - s.z0) * (j + 1) / nz };
          self.nodes.push({ id: f.id + '_' + s.kind + '_' + i + '_' + j, kind: s.kind, field: f.id, x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, rect: r });
        }
      }
    });
  };
  World.prototype.idx = function (x, z) {
    var ix = Math.floor(x) + this.B, iz = Math.floor(z) + this.B;
    if (ix < 0 || iz < 0 || ix >= this.N || iz >= this.N) { return -1; }
    return iz * this.N + ix;
  };
  // cerca nas células da borda do retângulo; gate = { side: 'north' | 'south' | 'west' | 'east', from, to } é a porteira
  World.prototype.cercado = function (P) {
    var g = P.gate || {}, c;
    function aberto(side, c) { return g.side === side && c >= g.from && c < g.to; }
    for (c = P.x0; c < P.x1; c++) {
      if (!aberto('north', c)) { this.block(c, P.z0); }
      if (!aberto('south', c)) { this.block(c, P.z1 - 1); }
    }
    for (c = P.z0; c < P.z1; c++) {
      if (!aberto('west', c)) { this.block(P.x0, c); }
      if (!aberto('east', c)) { this.block(P.x1 - 1, c); }
    }
  };
  // sala de uma construção, no referencial dela (x ao longo da fachada, z para a porta em +d/2; ver view.js → sala).
  // As faces de dentro das paredes caem em ±(w/2 - 0,5) e ±(d/2 - 0,5), na borda das células: a célula de dentro é livre,
  // a da parede não. A porta abre as células da parede da frente com o centro dentro do vão. Os móveis (menos os 'livre')
  // bloqueiam as células que cobrem, encolhidos um pouco para um banco estreito não fechar duas; o que ficou sem saída
  // para a porta (atrás do balcão, do altar) também fecha, para nenhum caminho nem save cair num canto preso
  World.prototype.abreSala = function (b, I, r) {
    var rot = b.rot * Math.PI / 180, c = Math.round(Math.cos(rot)), s = Math.round(Math.sin(rot));
    var a = b.w / 2 - 0.5, cz = b.d / 2 - 0.5, dw = I.porta[0] / 2, n = this.salas.length + 1, cel = [], fila = [];
    var moveis = (I.moveis || []).filter(function (m) { return !m.livre; }).map(function (m) {
      var sx = Math.min(0.25, m.w / 2 - 0.05), sz = Math.min(0.25, m.d / 2 - 0.05);
      return [m.x - m.w / 2 + sx, m.z - m.d / 2 + sz, m.x + m.w / 2 - sx, m.z + m.d / 2 - sz];
    });
    for (var x = Math.floor(r.x0); x < Math.ceil(r.x1); x++) {
      for (var z = Math.floor(r.z0); z < Math.ceil(r.z1); z++) {
        var dx = x + 0.5 - b.x, dz = z + 0.5 - b.z, lx = c * dx - s * dz, lz = s * dx + c * dz;
        var dentro = Math.abs(lx) < a && Math.abs(lz) < cz, porta = Math.abs(lx) < dw && lz > cz && lz < cz + 1;
        if (!dentro && !porta) { continue; }
        var i = this.idx(x + 0.5, z + 0.5); if (i < 0) { continue; }
        this.sala[i] = n; cel.push(i);
        this.grid[i] = dentro && moveis.some(function (q) { return q[0] < lx + 0.5 && q[2] > lx - 0.5 && q[1] < lz + 0.5 && q[3] > lz - 0.5; }) ? 1 : 0;
        if (porta) { fila.push(i); }
      }
    }
    function mundo(lx, lz) { return { x: b.x + c * lx + s * lz, z: b.z - s * lx + c * lz }; }
    // fora: logo na frente da porta, onde quem sai (ou quem estava preso na parede) fica
    this.salas.push({ id: b.id, n: n, nome: I.nome || b.id, b: b, I: I, mundo: mundo, fora: mundo(0, b.d / 2 + 0.7), cel: cel, portas: fila });
  };
  // depois de pôr os NPCs: fecha as células da sala que não chegam à porta
  World.prototype.fechaSalas = function () {
    var self = this, N = this.N;
    this.salas.forEach(function (S) {
      var fila = S.portas.slice(), viu = {};
      fila.forEach(function (i) { viu[i] = 1; });
      while (fila.length) {
        var k = fila.shift();
        [k + 1, k - 1, k + N, k - N].forEach(function (j) { if (!viu[j] && self.sala[j] === S.n && !self.grid[j]) { viu[j] = 1; fila.push(j); } });
      }
      S.cel.forEach(function (i) { if (!viu[i]) { self.grid[i] = 1; } });
    });
  };
  // id da construção cuja sala (ou vão da porta) contém o ponto; '' fora de qualquer sala
  World.prototype.salaEm = function (x, z) { var i = this.idx(x, z), n = i < 0 ? 0 : this.sala[i]; return n ? this.salas[n - 1].id : ''; };
  World.prototype.salaDe = function (x, z) { var i = this.idx(x, z), n = i < 0 ? 0 : this.sala[i]; return n ? this.salas[n - 1] : null; };
  // terreno do ponto ('floresta', 'rochas', 'campina' ou 'vila'): o último polígono da lista que o contém
  World.prototype.terreno = function (x, z) {
    var R = this.vila.regions || [], k = 'vila';
    for (var i = 0; i < R.length; i++) { if (R[i].poly && R[i].kind !== 'vila' && NZ.noPoligono(R[i].poly, x, z)) { k = R[i].kind; } }
    return k;
  };
  World.prototype.block = function (x, z) { var i = this.idx(x, z); if (i >= 0) { this.grid[i] = 1; } };
  World.prototype.blocked = function (x, z) { var i = this.idx(x, z); return i < 0 || this.grid[i] === 1; };
  World.prototype.addNode = function (kind, id, p) {
    var x = Math.floor(p[0]) + 0.5, z = Math.floor(p[1]) + 0.5;
    this.block(x, z);
    this.nodes.push({ id: id, kind: kind, x: x, z: z });
  };
  // livre para um corpo de raio r?
  World.prototype.free = function (x, z, r) {
    return !this.blocked(x - r, z - r) && !this.blocked(x + r, z - r) && !this.blocked(x - r, z + r) && !this.blocked(x + r, z + r);
  };
  World.prototype.los = function (ax, az, bx, bz) {
    var d = dist(ax, az, bx, bz), n = Math.ceil(d / 0.25);
    for (var i = 1; i <= n; i++) {
      var t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (!this.free(x, z, 0.3)) { return false; }
    }
    return true;
  };
  World.prototype.nearestFree = function (x, z) {
    if (!this.blocked(x, z)) { return { x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5 }; }
    for (var r = 1; r < 8; r++) {
      var best = null, bd = 1e9;
      for (var dx = -r; dx <= r; dx++) {
        for (var dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) { continue; }
          var cx = Math.floor(x) + dx + 0.5, cz = Math.floor(z) + dz + 0.5;
          if (this.blocked(cx, cz)) { continue; }
          var d = dist(x, z, cx, cz);
          if (d < bd) { bd = d; best = { x: cx, z: cz }; }
        }
      }
      if (best) { return best; }
    }
    return null;
  };

  // A* em grade, 8 direções, sem cortar quina
  World.prototype.path = function (sx, sz, tx, tz) {
    var N = this.N, B = this.B, grid = this.grid;
    var goal = this.nearestFree(tx, tz); if (!goal) { return null; }
    var start = this.nearestFree(sx, sz); if (!start) { return null; }
    var s = (Math.floor(start.z) + B) * N + Math.floor(start.x) + B;
    var e = (Math.floor(goal.z) + B) * N + Math.floor(goal.x) + B;
    var gx = e % N, gz = (e / N) | 0;
    var g = new Float32Array(N * N).fill(1e9), from = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
    var heap = [], hf = [];
    function push(i, f) {
      heap.push(i); hf.push(f); var k = heap.length - 1;
      while (k > 0) { var p = (k - 1) >> 1; if (hf[p] <= hf[k]) { break; } var a = heap[p]; heap[p] = heap[k]; heap[k] = a; var b = hf[p]; hf[p] = hf[k]; hf[k] = b; k = p; }
    }
    function pop() {
      var top = heap[0], li = heap.pop(), lf = hf.pop();
      if (heap.length) {
        heap[0] = li; hf[0] = lf; var k = 0;
        for (;;) {
          var l = k * 2 + 1, r = l + 1, m = k;
          if (l < heap.length && hf[l] < hf[m]) { m = l; }
          if (r < heap.length && hf[r] < hf[m]) { m = r; }
          if (m === k) { break; }
          var a = heap[m]; heap[m] = heap[k]; heap[k] = a; var b = hf[m]; hf[m] = hf[k]; hf[k] = b; k = m;
        }
      }
      return top;
    }
    function h(i) { var x = i % N, z = (i / N) | 0, dx = Math.abs(x - gx), dz = Math.abs(z - gz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); }
    g[s] = 0; push(s, h(s));
    var DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    var found = false, guard = 0;
    while (heap.length && guard++ < N * N * 2) { // o teto cobre o mapa inteiro (240 x 240 células): contornar o pasto ou a floresta passa de 150 m
      var cur = pop();
      if (closed[cur]) { continue; }
      if (cur === e) { found = true; break; }
      closed[cur] = 1;
      var cx = cur % N, cz = (cur / N) | 0;
      for (var d = 0; d < 8; d++) {
        var nx = cx + DIRS[d][0], nz = cz + DIRS[d][1];
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) { continue; }
        var ni = nz * N + nx;
        if (grid[ni] || closed[ni]) { continue; }
        if (DIRS[d][0] && DIRS[d][1] && (grid[cz * N + nx] || grid[nz * N + cx])) { continue; }
        var ng = g[cur] + DIRS[d][2];
        if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; push(ni, ng + h(ni)); }
      }
    }
    if (!found) { return null; }
    var pts = [], k = e;
    while (k !== -1) { pts.push({ x: (k % N) - B + 0.5, z: ((k / N) | 0) - B + 0.5 }); k = from[k]; }
    pts.reverse();
    pts[pts.length - 1] = { x: goal.x, z: goal.z };
    // suaviza: pula pontos com linha de visão livre
    var out = [], a = { x: sx, z: sz }, j = 0;
    while (j < pts.length) {
      var far = j;
      for (var q = pts.length - 1; q > j; q--) { if (this.los(a.x, a.z, pts[q].x, pts[q].z)) { far = q; break; } }
      out.push(pts[far]); a = pts[far]; j = far + 1;
    }
    return out;
  };

  // ---------- estado ----------
  function newState(world, seed) {
    var G = world.game, sp = world.vila.spawn;
    var st = {
      v: 1, fmt: NZ.FORMATO_SAVE, mapa: 4, seed: seed | 0, t: 0,
      player: {
        name: '', x: sp.x, z: sp.z, yaw: Math.PI, hp: G.player.hpBase, lv: 1, xp: 0, rep: 0,
        inv: JSON.parse(JSON.stringify(G.player.startItems)), stance: 'ofensiva',
        equip: newEquip(G, G.player.startEquip), attr: newAttr(G), pts: 0, // pts: pontos de atributo ainda por gastar
        potCd: 0, atkCd: 0, combatT: 99, action: null, goto: null,
        mode: 'manual', mapNav: 'caminhada', // mapNav: o que o clique no mapa faz por padrão ('caminhada' ou 'macro')
        macro: { area: null, on: false, phase: 'idle', stop: '', path: null, goal: null, repath: 0 }
      },
      rules: G.macro.defaultOrder.map(function (id) { return { id: id, on: true, val: G.macro.rules[id].val }; }),
      nodes: {}, mobs: [], farm: {},
      stats: { kills: 0, items: {}, potions: 0, xp: 0, retreats: 0, faints: 0 },
      quests: {}, qkills: {}, flags: {}, daily: { day: '', q: {} },
      gente: {}, hostil: null, // gente[id]: vida, desmaio e, com a vila em armas, a posição de quem anda; hostil: o incidente em curso
      mortos: {}, nomes: {}, // mortos[id]: { volta: st.t em que chega o substituto, 0 = ninguém vem }; nomes[id]: nome de quem substituiu
      log: []
    };
    world.nodes.forEach(function (n) { st.nodes[n.id] = { alive: true, left: 0 }; });
    world.spawns.forEach(function (s) { st.mobs.push(newMob(G, s)); });
    NZ.aplicaNomes(world, st);
    return st;
  }
  function newMob(G, s) {
    return { id: s.id, kind: s.kind, sp: s.i, x: s.x, z: s.z, hp: G.monsters[s.kind].hp, alive: true, left: 0,
      fight: false, wx: s.x, wz: s.z, wait: 0, atkCd: 0, face: 0 };
  }

  // ---------- equipamento e atributos ----------
  // chaves de game.json que começam com _ são notas, não dados
  function keys(o) { return Object.keys(o).filter(function (k) { return k.charAt(0) !== '_'; }); }
  function newEquip(G, from) { var e = {}; keys(G.equipSlots).forEach(function (s) { e[s] = (from && from[s]) || null; }); return e; }
  function newAttr(G) { var a = {}; keys(G.attributes).forEach(function (k) { a[k] = 0; }); return a; }

  // ---------- contas derivadas ----------
  // tudo o que o personagem é em combate e fora dele sai daqui: atributos + itens vestidos + arma.
  // O perfil de ataque e defesa (min, max, interval, reach, crit, critMult, def) é o mesmo dos bichos (mobStats),
  // então o mesmo golpe (Sim.strike) serve para os dois lados.
  function stats(w, p) {
    var G = w.game, P = G.player, I = G.items, A = G.attributes, b = {}, gby = {}, k, id;
    function add(key, v) { b[key] = (b[key] || 0) + v; }
    keys(A).forEach(function (a) { var n = (p.attr && p.attr[a]) || 0; for (var e in A[a].per) { add(e, n * A[a].per[e]); } });
    for (var s in p.equip) {
      var it = p.equip[s] && I[p.equip[s]]; if (!it) { continue; }
      if (it.def) { add('def', it.def); }
      for (k in (it.bonus || {})) { add(k, it.bonus[k]); }
      for (k in (it.gather || {})) { gby[k] = (gby[k] || 0) + it.gather[k]; }
    }
    keys(A).forEach(function (a) { for (var c in (A[a].cap || {})) { if (b[c] > A[a].cap[c]) { b[c] = A[a].cap[c]; } } });
    // arco sem flecha na casa de munição não atira: luta de mãos nuas
    var wp = p.equip.arma && I[p.equip.arma], cls = wp ? G.weaponClasses[wp.class] : null;
    var noAmmo = !!(cls && cls.ammo && !(p.equip.municao === cls.ammo && p.inv[cls.ammo] > 0));
    var W = wp && !noAmmo ? wp : P.unarmed, C = W === wp ? cls : null, ranged = !!(C && C.ranged);
    var mul = 1 + (b[C ? C.scale : 'melee'] || 0);
    for (id in G.nodes) { gby[id] = 1 + (b.gather || 0) + (gby[id] || 0); }
    return {
      hp: P.hpBase + (p.lv - 1) * P.hpPerLv + Math.round(b.hp || 0),
      weapon: W === wp ? p.equip.arma : null, cls: C ? wp.class : null, noAmmo: noAmmo,
      min: W.dmg[0] * mul, max: W.dmg[1] * mul, interval: W.interval / (1 + (b.haste || 0)), reach: W.reach,
      ranged: ranged, ammo: C && C.ammo ? C.ammo : null,
      crit: Math.min(1, P.critBase + (b.crit || 0)), critMult: P.critMult + (b.critMult || 0), def: P.defBase + (b.def || 0),
      move: 1 + (b.move || 0), regen: 1 + (b.regen || 0), xp: 1 + (b.xp || 0), potion: 1 + (b.potion || 0),
      gather: gby, buy: 1 - (b.discount || 0), sell: 1 + (b.markup || 0), rep: 1 + (b.rep || 0),
      bag: G.settings.bagCapacity + Math.floor((b.bag || 0) + 1e-9)
    };
  }
  // bicho (e, depois, aldeão hostil): o perfil vem direto de game.json
  function mobStats(def) {
    var d = def.dmg || [0, 0]; // quem não luta (aldeão que foge) não tem golpe, mas apanha com o mesmo perfil
    return { min: d[0], max: d[1], interval: def.interval, reach: def.reach, crit: def.crit || 0, critMult: def.critMult || 1.5, def: def.def || 0 };
  }
  // fração da armadura: def / (def + armorK); nunca chega a 100%
  function armorCut(w, def) { return def > 0 ? def / (def + w.game.combat.armorK) : 0; }
  function maxHp(w, p) { return stats(w, p).hp; }
  function potionHeal(w, p) { return Math.round(w.game.player.potionHeal * stats(w, p).potion); }
  function gatherSec(w, p, kind) { return w.game.nodes[kind].gatherSec / stats(w, p).gather[kind]; }
  function bagCap(w, p) { return stats(w, p).bag; }
  function bagCount(w, p) {
    var n = 0; for (var k in p.inv) { if (!(w.game.items[k] && w.game.items[k].noBag)) { n += p.inv[k]; } } return n;
  }
  // preços com carisma, arredondados no total (vender 10 madeiras rende o carisma das 10, não 10 vezes o arredondamento de uma).
  // Revender nunca dá lucro: o mercador paga cerca de 40% de buy, e os dois limites de carisma são de 30%
  function buyPrice(w, p, item, n) { var it = w.game.items[item]; return Math.max(1, Math.round((it.buy || it.price) * (n || 1) * stats(w, p).buy + 1e-9)); }
  function sellPrice(w, p, item, n) { return Math.round(w.game.items[item].price * (n || 1) * stats(w, p).sell + 1e-9); }

  // ---------- simulação ----------
  function Sim(world) { this.w = world; this.events = []; this.quiet = false; }

  Sim.prototype.emit = function (st, e) { if (!this.quiet) { this.events.push(e); } };
  Sim.prototype.log = function (st, text) {
    st.log.push({ t: st.t, text: text });
    if (st.log.length > 40) { st.log.shift(); }
    this.emit(st, { type: 'log', text: text });
  };

  Sim.prototype.give = function (st, item, n) {
    var w = this.w, p = st.player, def = w.game.items[item];
    if (!(def && def.noBag) && bagCount(w, p) + n > bagCap(w, p)) {
      this.log(st, 'Bolsa cheia: ' + def.name + ' ficou para trás.');
      return false;
    }
    p.inv[item] = (p.inv[item] || 0) + n;
    st.stats.items[item] = (st.stats.items[item] || 0) + n;
    this.emit(st, { type: 'gain', item: item, n: n });
    return true;
  };
  Sim.prototype.rollDrops = function (st, drops) {
    for (var i = 0; i < drops.length; i++) {
      if (rnd(st) < drops[i].chance) { this.give(st, drops[i].item, drops[i].n); }
    }
  };

  // a inteligência multiplica toda experiência ganha (luta, missão e diária); ready = n já vem multiplicado
  Sim.prototype.gainXp = function (st, n, ready) {
    var w = this.w, p = st.player; if (!ready) { n = Math.round(n * stats(w, p).xp); } p.xp += n; st.stats.xp += n;
    var need = p.lv * w.game.player.xpPerLevel;
    while (p.xp >= need) {
      p.xp -= need; var before = maxHp(w, p); p.lv++;
      p.hp += maxHp(w, p) - before; p.pts += w.game.player.pointsPerLevel;
      this.log(st, 'Subiu para o nível ' + p.lv + ': ' + w.game.player.pointsPerLevel + ' pontos de atributo para gastar.');
      this.emit(st, { type: 'level' });
      need = p.lv * w.game.player.xpPerLevel;
    }
  };

  Sim.prototype.drink = function (st) {
    var w = this.w, p = st.player;
    if (!(p.inv.pocao > 0) || p.potCd > 0) { return false; }
    var mh = maxHp(w, p);
    if (p.hp >= mh && !p.poison) { return false; }
    p.inv.pocao--; p.potCd = w.game.player.potionCooldown; p.poison = null; // a poção também corta o veneno
    p.hp = Math.min(mh, p.hp + potionHeal(w, p));
    st.stats.potions++;
    this.log(st, 'Bebeu uma poção.');
    this.emit(st, { type: 'potion' });
    return true;
  };

  Sim.prototype.faint = function (st) {
    var w = this.w, p = st.player, pl = w.plaza;
    p.x = pl.x; p.z = pl.z + 1; p.hp = Math.round(maxHp(w, p) * w.game.player.faintHpFrac);
    p.action = null; p.goto = null; p.poison = null; st.stats.faints++;
    st.mobs.forEach(function (m) { m.fight = false; });
    this.stopMacro(st, 'Você desmaiou e foi levado à praça.');
    this.log(st, 'Você desmaiou e acordou na praça.');
    this.emit(st, { type: 'faint' });
    // desmaiar com a vila em armas é ser preso: multa e fim do incidente
    if (st.hostil) {
      var A = w.game.aldeoes, c = p.inv.moeda || 0, fine = Math.min(c, Math.max(A.multa.min, Math.round(c * A.multa.frac)));
      p.inv.moeda = c - fine;
      this.calm(st, A.textos.fimDesmaio.replace('{multa}', fine + ' moeda' + (fine === 1 ? '' : 's')));
    }
  };

  // ---------- gente da vila: conversa, briga e desmaio ----------
  // st.gente[id] só existe para quem apanhou, desmaiou ou está em luta; sem entrada = vida cheia, na rotina
  Sim.prototype.papel = function (id) {
    var A = this.w.game.aldeoes, q = this.w.personById[id];
    return A.papeis[q && q.papel] || A.papeis[A.papelPadrao];
  };
  Sim.prototype.gente = function (st, id) { return st.gente[id] || (st.gente[id] = { hp: this.papel(id).hp, ko: 0, atkCd: 0 }); };
  // fora de ação: desmaiado (saves antigos) ou morto, com o corpo no chão ou já levado
  Sim.prototype.isKo = function (st, id) { var g = st.gente[id]; return !!((g && g.ko > 0) || (st.mortos && st.mortos[id])); };
  Sim.prototype.isMorto = function (st, id) { return !!(st.mortos && st.mortos[id]); };
  // onde a pessoa está para a simulação: os parados no posto; quem anda, só com a vila em armas (fora disso, a trilha é do desenho)
  Sim.prototype.personPos = function (st, id) {
    var q = this.w.personById[id], g = st.gente[id];
    if (!q) { return null; }
    if (g && g.x !== undefined) { return g; } // na briga (ou voltando ao posto depois dela), onde estiver
    return q.fixed ? q : null;
  };
  Sim.prototype.hostileTo = function (st, id) { return !!(st.hostil && this.w.personById[id] && this.papel(id).luta && !this.isKo(st, id)); };
  // o primeiro golpe numa pessoa: a vila inteira entra em armas. pos = { id: [x, z] } de quem anda, tirada do desenho
  // (a simulação não sabe onde a trilha leva cada um). A reputação cai uma vez por incidente: revidar os guardas não
  // custa de novo. Devolve false se já havia briga
  Sim.prototype.provoke = function (st, id, pos) {
    var w = this.w, A = w.game.aldeoes, p = st.player, self = this;
    if (st.hostil || !w.personById[id]) { return false; }
    st.hostil = { by: id, fora: 0 };
    p.rep += A.repPorIncidente;
    w.people.forEach(function (q) {
      if (self.isMorto(st, q.id)) { return; }
      var g = self.gente(st, q.id); g.atkCd = 0.4 + rnd(st) * 0.8; g.repath = rnd(st); g.path = null; g.volta = false;
      if (q.fixed) { // quem tem posto (lojistas, o escudeiro) também larga o balcão: sai da célula do posto para a livre mais perto
        if (g.x === undefined) { var c0 = w.nearestFree(q.x, q.z) || { x: q.x, z: q.z }; g.x = c0.x; g.z = c0.z; g.face = 0; }
        return;
      }
      var c = pos && pos[q.id], f = c && w.free(c[0], c[1], 0.15) ? { x: c[0], z: c[1] } : c ? w.nearestFree(c[0], c[1]) : null;
      f = f || w.nearestFree(w.plaza.x, w.plaza.z + 2) || { x: w.plaza.x, z: w.plaza.z };
      g.x = f.x; g.z = f.z; g.face = 0;
    });
    var was = p.mode === 'macro' && p.macro.on;
    this.stopMacro(st); if (was) { p.macro.stop = A.textos.macro; }
    var text = A.textos.inicio.replace('{alvo}', w.personById[id].name);
    this.log(st, text);
    this.emit(st, { type: 'alert', text: text }); this.emit(st, { type: 'hostil', on: true });
    return true;
  };
  // fim do incidente: quem está de pé volta inteiro à rotina; quem desmaiou segue no chão até a hora dele
  Sim.prototype.calm = function (st, text) {
    var p = st.player, self = this;
    st.hostil = null;
    this.w.people.forEach(function (q) {
      var g = st.gente[q.id]; if (!g) { return; }
      if (st.mortos && st.mortos[q.id]) { g.path = null; return; } // o corpo fica onde caiu
      if (g.ko > 0) { delete g.x; delete g.z; g.path = null; }
      else if (q.fixed && g.x !== undefined) { g.volta = true; g.path = null; g.hp = self.papel(q.id).hp; } // volta andando ao posto
      else { delete st.gente[q.id]; }
    });
    if (p.action && p.action.type === 'luta') { p.action = null; }
    if (p.macro.stop === this.w.game.aldeoes.textos.macro) { p.macro.stop = ''; } // o aviso da macro já não vale
    this.log(st, text);
    this.emit(st, { type: 'alert', text: text }); this.emit(st, { type: 'hostil', on: false });
  };
  // golpe do jogador numa pessoa (o mesmo strike dos bichos); sem XP nem saque, para a vila não virar caça
  Sim.prototype.swingPerson = function (st, id) {
    var w = this.w, G = w.game, A = G.aldeoes, p = st.player, s = stats(w, p), def = this.papel(id), g = this.gente(st, id), pos = this.personPos(st, id);
    var h = this.strike(st, s, mobStats(def), G.stances[p.stance].dmg);
    this.useAmmo(st, s);
    g.hp -= h.n; p.atkCd = s.interval; p.combatT = 0;
    this.emit(st, { type: 'hit', who: 'gente', id: id, x: pos.x, z: pos.z, n: h.n, crit: h.crit, ranged: s.ranged });
    if (g.hp <= 0) {
      // a morte é definitiva: o corpo fica no chão corpoSeg e some; lojistas e guardas ganham um substituto depois (repoeTick)
      var M = A.morte, sub = M.substitutos[id];
      g.hp = 0; g.ko = M.corpoSeg; g.morto = true; g.path = null;
      st.mortos = st.mortos || {}; st.mortos[id] = { volta: sub ? st.t + (def.combatente ? M.guardaSeg : M.lojistaSeg) : 0 };
      this.log(st, A.textos.ko.replace('{alvo}', w.personById[id].name));
      this.emit(st, { type: 'ko', id: id });
      if (p.action && p.action.id === id) { p.action = null; }
      // cada morte pesa, mesmo no meio da briga: o inocente (repPorInocente) e também o soldado, porque a briga
      // com a vila sempre foi o jogador quem começou (repPorSoldado)
      var perda = def.combatente ? A.repPorSoldado : A.repPorInocente;
      if (perda) {
        p.rep += perda;
        var txt = A.textos[def.combatente ? 'soldado' : 'inocente'].replace('{alvo}', w.personById[id].name).replace('{rp}', String(-perda));
        this.log(st, txt); this.emit(st, { type: 'alert', text: txt });
      }
    }
  };
  Sim.prototype.useAmmo = function (st, s) {
    var p = st.player; if (!s.ammo) { return; }
    p.inv[s.ammo]--;
    if (!(p.inv[s.ammo] > 0)) { p.inv[s.ammo] = 0; this.log(st, 'Acabaram as flechas: agora é de mãos nuas.'); this.emit(st, { type: 'alert', text: 'Acabaram as flechas. O Ferreiro vende mais.' }); }
  };
  // um passo com colisão deslizante: se o caminho reto bate, tenta só um dos eixos
  Sim.prototype.nudge = function (e, dx, dz, r) {
    var w = this.w;
    if (w.free(e.x + dx, e.z + dz, r)) { e.x += dx; e.z += dz; return true; }
    if (dx && w.free(e.x + dx, e.z, r)) { e.x += dx; return true; }
    if (dz && w.free(e.x, e.z + dz, r)) { e.z += dz; return true; }
    return false;
  };
  // o golpe de quem persegue o jogador: bicho ou aldeão, o mesmo código
  Sim.prototype.hitPlayer = function (st, e, def) {
    var w = this.w, G = w.game, p = st.player;
    var h = this.strike(st, mobStats(def), stats(w, p), G.stances[p.stance].taken);
    p.hp -= h.n; p.combatT = 0; e.atkCd = def.interval;
    // veneno: dano por segundo que a armadura não corta; a picada nova renova o tempo, não soma
    if (def.poison && !(p.poison && p.poison.t > def.poison.sec)) {
      if (!p.poison) { this.log(st, 'Envenenado! A poção ou o padre curam.'); }
      p.poison = { dps: Math.max(def.poison.dps, (p.poison && p.poison.dps) || 0), t: def.poison.sec };
    }
    e.face = Math.atan2(p.x - e.x, p.z - e.z);
    this.emit(st, { type: 'hit', who: 'player', n: h.n, crit: h.crit });
    if (p.hp <= 0) { this.faint(st); }
  };
  // persegue e bate. smart: sem linha livre até o jogador, segue o A* (refeito a cada 1,5 s), para contornar as casas
  Sim.prototype.chase = function (st, e, def, dt, smart) {
    var w = this.w, p = st.player, d = dist(e.x, e.z, p.x, p.z);
    if (d <= def.reach) { e.path = null; if (e.atkCd <= 0) { this.hitPlayer(st, e, def); } return; }
    var tx = p.x, tz = p.z, direct = true;
    if (smart && !w.los(e.x, e.z, p.x, p.z)) {
      e.repath = (e.repath || 0) - dt;
      if (!e.path || e.repath <= 0) { e.path = w.path(e.x, e.z, p.x, p.z); e.repath = 1.5; }
      while (e.path && e.path.length && dist(e.x, e.z, e.path[0].x, e.path[0].z) < 0.3) { e.path.shift(); }
      if (e.path && e.path.length) { tx = e.path[0].x; tz = e.path[0].z; direct = false; }
    } else if (smart) { e.path = null; }
    var dd = dist(e.x, e.z, tx, tz), step = Math.min(def.speed * dt, direct ? d - def.reach * 0.9 : dd);
    if (dd > 0.001 && step > 0) {
      if (smart) { this.nudge(e, (tx - e.x) / dd * step, (tz - e.z) / dd * step, 0.15); }
      else { this.passo(e, Math.atan2(tx - e.x, tz - e.z), step, 0.15, CERCO); } // bicho contorna árvore e pedra no caminho
    }
    e.face = Math.atan2(p.x - e.x, p.z - e.z);
  };
  // morador fugindo: escolhe um refúgio longe do jogador (e não atrás dele) e vai pelo caminho calculado, contornando
  // casas e cercas; refaz a escolha a cada 1,5 s ou quando o jogador chega perto do refúgio. Sem caminho, foge em linha
  Sim.prototype.foge = function (st, g, def, dt, raio) {
    var w = this.w, p = st.player, d = dist(g.x, g.z, p.x, p.z), s = def.speed * dt;
    g.rt = (g.rt || 0) - dt;
    if (g.rt <= 0 || (g.ref && g.rt < 1.2 && dist(g.ref.x, g.ref.z, p.x, p.z) < raio * 0.5)) { // no máximo um caminho a cada 0,3 s
      var ax = (g.x - p.x) / d, az = (g.z - p.z) / d, best = null, bs = -1e9;
      for (var k = 0; k < 16; k++) {
        var a = k / 16 * Math.PI * 2, ux = Math.sin(a), uz = Math.cos(a);
        if (ux * -ax + uz * -az > 0.4) { continue; } // na direção do jogador, não
        [7, 13].forEach(function (r) {
          var cx = g.x + ux * r, cz = g.z + uz * r; if (!w.free(cx, cz, 0.3)) { return; }
          var sc = dist(cx, cz, p.x, p.z) + (ux * ax + uz * az) * 2 + (w.los(g.x, g.z, cx, cz) ? 3 : 0);
          if (sc > bs) { bs = sc; best = { x: cx, z: cz }; }
        });
      }
      g.ref = best; g.rt = 1.5;
      g.path = best ? (w.los(g.x, g.z, best.x, best.z) ? [best] : w.path(g.x, g.z, best.x, best.z)) : null;
    }
    while (g.path && g.path.length && dist(g.x, g.z, g.path[0].x, g.path[0].z) < 0.3) { g.path.shift(); }
    if (g.path && g.path.length) {
      var wp = g.path[0], dw = dist(g.x, g.z, wp.x, wp.z), st2 = Math.min(s, dw);
      if (this.nudge(g, (wp.x - g.x) / dw * st2, (wp.z - g.z) / dw * st2, 0.15)) { g.face = Math.atan2(wp.x - g.x, wp.z - g.z); return; }
      g.path = null; // preso no caminho: escolhe outro no próximo tique
    }
    var dx = (g.x - p.x) / d * s, dz = (g.z - p.z) / d * s;
    if (!this.nudge(g, dx, dz, 0.15) && !this.nudge(g, -dz, dx, 0.15)) { this.nudge(g, dz, -dx, 0.15); }
    g.face = Math.atan2(g.x - p.x, g.z - p.z);
  };
  // quem anda na briga não ocupa o lugar de outro nem o do jogador: a menos de 0,8 m, dá um passo para o lado
  Sim.prototype.afasta = function (st, id, g) {
    var w = this.w, p = st.player, self = this, eu = w.people.indexOf(w.personById[id]);
    function longe(ox, oz, k0) {
      var d = dist(g.x, g.z, ox, oz); if (d >= 0.8) { return; }
      var k = (0.8 - d) * k0, a = eu * 2.4; // juntos no mesmo ponto: cada um sai para um lado
      var ux = d > 0.01 ? (g.x - ox) / d : Math.cos(a), uz = d > 0.01 ? (g.z - oz) / d : Math.sin(a);
      // e um pouco de lado (cada um para o seu), para cercar o jogador em vez de fazer fila atrás do primeiro
      var lado = eu % 2 ? 1 : -1, tx = -uz * lado, tz = ux * lado;
      self.nudge(g, (ux + tx) * k, (uz + tz) * k, 0.15);
    }
    for (var j = 0; j < w.people.length; j++) {
      var o = w.people[j]; if (o.id === id) { continue; }
      var h = st.gente[o.id]; if (!o.fixed && !h) { continue; } // morador fora da briga: está na trilha, não na simulação
      longe(h && h.x !== undefined ? h.x : o.x, h && h.z !== undefined ? h.z : o.z, 0.8);
    }
    longe(p.x, p.z, 1);
  };
  Sim.prototype.genteTick = function (st, dt) {
    var w = this.w, A = w.game.aldeoes, p = st.player, H = st.hostil, pl = w.plaza;
    var inVila = dist(p.x, p.z, pl.x, pl.z) <= A.raio;
    for (var i = 0; i < w.people.length; i++) {
      var q = w.people[i], g = st.gente[q.id]; if (!g) { continue; }
      var def = this.papel(q.id);
      if (this.isMorto(st, q.id)) { // o corpo fica no chão um tempo e depois é levado
        if (g.ko > 0) { g.ko -= dt; if (g.ko <= 0) { delete st.gente[q.id]; this.emit(st, { type: 'up', id: q.id }); } }
        continue;
      }
      if (g.ko > 0) {
        g.ko -= dt;
        if (g.ko <= 0) {
          this.log(st, A.textos.levanta.replace('{alvo}', q.name));
          if (st.hostil) { g.ko = 0; g.hp = def.hp; } else { delete st.gente[q.id]; }
          this.emit(st, { type: 'up', id: q.id });
        }
        continue;
      }
      if (!H) { if (g.volta) { this.voltaPosto(st, q, g, def, dt); } continue; }
      g.atkCd -= dt;
      if (def.luta) {
        if (!inVila) { continue; } // na borda da vila os guardas desistem e esperam
        // posto sem posição (save de antes de os lojistas andarem): bate só de onde está, como antes
        if (q.fixed && g.x === undefined) { if (dist(q.x, q.z, p.x, p.z) <= def.reach + 0.6 && g.atkCd <= 0) { var e = { x: q.x, z: q.z }; this.hitPlayer(st, e, def); g.atkCd = e.atkCd; } }
        else { this.chase(st, g, def, dt, true); this.afasta(st, q.id, g); }
        if (st.hostil !== H) { return; } // o jogador desmaiou: o incidente acabou no meio da volta
      } else if (g.x !== undefined) {
        var d = dist(g.x, g.z, p.x, p.z);
        if (d < A.fugaDist && d > 0.01) { this.foge(st, g, def, dt, A.fugaDist); this.afasta(st, q.id, g); }
        else { g.ref = null; g.path = null; }
      }
    }
    // a vila se acalma depois de calmaSeg seguidos com o jogador longe
    if (!H) { return; }
    if (inVila) { H.fora = 0; }
    else { H.fora += dt; if (H.fora >= A.calmaSeg) { this.calm(st, A.textos.fimFuga); } }
  };

  // depois da briga, quem tem posto volta a ele andando, pelo caminho; chegando (ou sem caminho, ou preso mais de 40 s),
  // a simulação o devolve ao posto e ele volta a atender
  Sim.prototype.voltaPosto = function (st, q, g, def, dt) {
    var w = this.w, alvo = w.nearestFree(q.x, q.z) || { x: q.x, z: q.z };
    g.vt = (g.vt || 0) + dt;
    if (!g.path) { g.path = w.los(g.x, g.z, alvo.x, alvo.z) ? [alvo] : w.path(g.x, g.z, alvo.x, alvo.z); }
    while (g.path && g.path.length && dist(g.x, g.z, g.path[0].x, g.path[0].z) < 0.3) { g.path.shift(); }
    if (!g.path || !g.path.length || g.vt > 40 || dist(g.x, g.z, alvo.x, alvo.z) < 0.4) { delete st.gente[q.id]; this.emit(st, { type: 'posto', id: q.id }); return; }
    var wp = g.path[0], d = dist(g.x, g.z, wp.x, wp.z), s = Math.min(def.speed * 0.45 * dt, d); // sem pressa: a briga acabou
    g.x += (wp.x - g.x) / d * s; g.z += (wp.z - g.z) / d * s; g.face = Math.atan2(wp.x - g.x, wp.z - g.z);
  };
  // substitutos: passado o tempo (e com a vila em paz), chega outra pessoa para a loja ou o posto de quem morreu.
  // Os nomes vêm em ordem de aldeoes.morte.substitutos[id]; acabando a lista, o último ganha um número
  Sim.prototype.repoeTick = function (st) {
    if (!st.mortos || st.hostil) { return; }
    var w = this.w, M = w.game.aldeoes.morte, self = this;
    Object.keys(st.mortos).forEach(function (id) {
      var m = st.mortos[id], q = w.personById[id], L = M.substitutos[id];
      if (!q) { delete st.mortos[id]; return; }
      if (!m.volta || st.t < m.volta || !L) { return; }
      st.trocas = st.trocas || {}; var k = st.trocas[id] = (st.trocas[id] || 0) + 1;
      var antigo = q.name, novo = L[Math.min(k, L.length) - 1] + (k > L.length ? ' ' + (k - L.length + 1) : '');
      delete st.mortos[id]; delete st.gente[id];
      st.nomes = st.nomes || {}; st.nomes[id] = novo; NZ.aplicaNomes(w, st);
      var txt = M.textos.chegou.replace('{novo}', novo).replace('{antigo}', antigo);
      self.log(st, txt); self.emit(st, { type: 'alert', text: txt }); self.emit(st, { type: 'up', id: id });
    });
  };

  Sim.prototype.stopMacro = function (st, reason) {
    var m = st.player.macro;
    if (st.player.mode === 'macro') { st.player.mode = 'manual'; }
    m.on = false; m.phase = 'idle'; m.stop = reason || ''; m.path = null; m.goal = null; st.player.goto = null;
    if (reason) { this.emit(st, { type: 'alert', text: reason }); }
  };
  Sim.prototype.startMacro = function (st, area) {
    var p = st.player, m = p.macro;
    if (area) {
      var c = this.w.nearestFree(area.x, area.z) || area;
      m.area = { x: c.x, z: c.z, r: this.w.game.settings.macroRadius };
    }
    if (!m.area) { return false; }
    if (st.hostil) { m.stop = this.w.game.aldeoes.textos.macro; return false; } // a macro não trabalha (nem luta) no meio da briga
    p.mode = 'macro'; m.on = true; m.phase = 'run'; m.stop = ''; m.path = null; m.goal = null; p.action = null; p.goto = null;
    return true;
  };
  // o jogador assumiu o controle: a macro fica pausada (área guardada)
  Sim.prototype.takeControl = function (st) {
    var p = st.player;
    if (p.mode === 'macro') {
      p.mode = 'manual'; p.macro.on = false; p.macro.phase = 'idle'; p.macro.path = null; p.macro.goal = null; p.action = null;
      p.macro.stop = 'Macro pausada: você assumiu o controle.';
      return true;
    }
    return false;
  };

  // um golpe, de quem for em quem for: a = perfil de quem bate, d = de quem apanha (stats ou mobStats);
  // mul junta as posturas dos dois lados. Devolve o dano já inteiro e se foi crítico
  Sim.prototype.strike = function (st, a, d, mul) {
    var raw = (a.min + (a.max - a.min) * rnd(st)) * (mul || 1), crit = rnd(st) < a.crit;
    if (crit) { raw *= a.critMult; }
    raw *= 1 - armorCut(this.w, d.def);
    return { n: Math.max(1, Math.round(raw)), crit: crit };
  };
  // golpe do jogador; o arco gasta uma flecha por tiro
  Sim.prototype.swing = function (st, m) {
    var w = this.w, p = st.player, G = w.game, def = G.monsters[m.kind], s = stats(w, p);
    var h = this.strike(st, s, mobStats(def), G.stances[p.stance].dmg);
    this.useAmmo(st, s);
    m.hp -= h.n; m.fight = true; p.atkCd = s.interval; p.combatT = 0;
    this.emit(st, { type: 'hit', who: 'mob', id: m.id, x: m.x, z: m.z, n: h.n, crit: h.crit, ranged: s.ranged });
    if (m.hp <= 0) {
      m.alive = false; m.fight = false; m.left = def.respawn;
      st.stats.kills++;
      for (var q in st.quests) { if (st.quests[q] === 'active') { st.qkills[q] = st.qkills[q] || {}; st.qkills[q][m.kind] = (st.qkills[q][m.kind] || 0) + 1; } }
      this.log(st, def.name + ' abatido.');
      this.emit(st, { type: 'kill', id: m.id });
      this.gainXp(st, def.xp);
      this.rollDrops(st, def.drops);
      if (p.action && p.action.id === m.id) { p.action = null; }
    }
  };

  Sim.prototype.finishGather = function (st, n) {
    var G = this.w.game, def = G.nodes[n.kind], ns = st.nodes[n.id];
    ns.alive = false; ns.left = def.respawn;
    this.log(st, def.name + (n.rect ? ': colheita concluída.' : ': coleta concluída.'));
    this.emit(st, { type: 'gathered', id: n.id });
    this.rollDrops(st, def.drops);
  };

  // movimento manual (chamado a cada quadro pela interface; colisão deslizante)
  Sim.prototype.walk = function (st, dx, dz) {
    var w = this.w, p = st.player, r = 0.3;
    if (p.goto) { p.goto = null; p.macro.path = null; p.macro.goal = null; }
    var nx = p.x + dx, nz = p.z + dz, moved = false;
    if (w.free(nx, p.z, r) && !this.hitsNode(nx, p.z)) { p.x = nx; moved = true; }
    if (w.free(p.x, nz, r) && !this.hitsNode(p.x, nz)) { p.z = nz; moved = true; }
    if (moved && p.action && p.action.type === 'gather') { p.action = null; this.emit(st, { type: 'log', text: 'Coleta interrompida.' }); }
    return moved;
  };
  Sim.prototype.hitsNode = function () { return false; }; // recursos já bloqueiam a célula

  // segue o caminho; devolve true ao chegar a menos de 'near' do destino
  Sim.prototype.moveTo = function (st, tx, tz, near, dt, key) {
    var w = this.w, p = st.player, m = p.macro, spd = w.game.player.moveSpeed * stats(w, p).move;
    if (dist(p.x, p.z, tx, tz) <= near) { m.path = null; return true; }
    m.repath -= dt;
    var stale = !m.path || !m.goal || m.goal.key !== key || (m.repath <= 0 && dist(m.goal.x, m.goal.z, tx, tz) > 1);
    if (stale) {
      m.path = w.los(p.x, p.z, tx, tz) ? [{ x: tx, z: tz }] : w.path(p.x, p.z, tx, tz);
      m.goal = { key: key, x: tx, z: tz }; m.repath = 1;
      if (!m.path) { return false; }
    }
    var step = spd * dt;
    while (step > 0 && m.path.length) {
      var wp = m.path[0], d = dist(p.x, p.z, wp.x, wp.z);
      if (d <= step) { p.x = wp.x; p.z = wp.z; step -= d; m.path.shift(); }
      else {
        p.yaw = Math.atan2(wp.x - p.x, wp.z - p.z);
        p.x += (wp.x - p.x) / d * step; p.z += (wp.z - p.z) / d * step; step = 0;
      }
      if (dist(p.x, p.z, tx, tz) <= near) { m.path = null; return true; }
    }
    if (!m.path || !m.path.length) { m.path = null; }
    return dist(p.x, p.z, tx, tz) <= near;
  };
  Sim.prototype.face = function (st, x, z) { var p = st.player; p.yaw = Math.atan2(x - p.x, z - p.z); };

  // clique no mapa sem macro: o personagem vai até o ponto pelo caminho calculado
  Sim.prototype.goTo = function (st, x, z) {
    var p = st.player, c = this.w.nearestFree(x, z);
    if (!c) { return false; }
    this.takeControl(st);
    p.macro.stop = ''; p.action = null;
    p.goto = { x: c.x, z: c.z }; p.macro.path = null; p.macro.goal = null;
    return true;
  };

  // ---------- regras da macro ----------
  Sim.prototype.inArea = function (st, x, z) {
    var a = st.player.macro.area; return a && dist(a.x, a.z, x, z) <= a.r;
  };
  Sim.prototype.nearestMob = function (st) {
    var p = st.player, best = null, bd = 1e9, self = this;
    st.mobs.forEach(function (m) {
      if (!m.alive) { return; }
      if (!(m.fight || self.inArea(st, m.x, m.z))) { return; }
      var d = dist(p.x, p.z, m.x, m.z); if (d < bd) { bd = d; best = m; }
    });
    return best;
  };
  Sim.prototype.nearestNode = function (st, kinds) {
    var p = st.player, best = null, bd = 1e9, self = this;
    this.w.nodes.forEach(function (n) {
      if (kinds.indexOf(n.kind) < 0 || !st.nodes[n.id].alive || !self.inArea(st, n.x, n.z)) { return; }
      var d = nodeDist(n, p.x, p.z); if (d < bd) { bd = d; best = n; }
    });
    return best;
  };
  // vaca ou ovelha pronta (com a ferramenta na bolsa) dentro da área, a mais perto
  Sim.prototype.nearestFarm = function (st) {
    var p = st.player, w = this.w, G = w.game, best = null, bd = 1e9, self = this;
    if (bagCount(w, p) >= bagCap(w, p)) { return null; } // bolsa cheia: nem tenta (com a regra da bolsa desligada, não fica preso)
    w.rebanho.forEach(function (b) {
      var F = G.farm[b.img]; if (!F || (F.tool && !(p.inv[F.tool] > 0)) || self.farmLeft(st, b.id) > 0) { return; }
      var q = w.bichoEm(b.id, st.t); if (!self.inArea(st, q.x, q.z)) { return; }
      var d = dist(p.x, p.z, q.x, q.z); if (d < bd) { bd = d; best = b; }
    });
    return best;
  };

  // escolhe o que fazer: a primeira regra ligada e verdadeira manda
  Sim.prototype.decide = function (st) {
    var w = this.w, G = w.game, p = st.player, hpPct = p.hp / maxHp(w, p) * 100;
    for (var i = 0; i < st.rules.length; i++) {
      var r = st.rules[i]; if (!r.on) { continue; }
      var def = G.macro.rules[r.id];
      switch (def.cond) {
        case 'hp_below_has_potion':
          if (hpPct < r.val && p.inv.pocao > 0) { if (p.potCd <= 0) { return { act: 'drink' }; } continue; }
          break;
        case 'hp_below': if (hpPct < r.val) { return { act: 'retreat_rest' }; } break;
        case 'bag_full': if (bagCount(w, p) >= bagCap(w, p)) { return { act: 'retreat_stop' }; } break;
        case 'mob_in_area': {
          var cur = p.action && p.action.type === 'attack' ? this.mobById(st, p.action.id) : null;
          var mob = (cur && cur.alive) ? cur : this.nearestMob(st);
          if (mob) { return { act: 'attack', id: mob.id }; }
          break;
        }
        case 'node_in_area': {
          var ks = def.kinds || [def.kind]; // kinds: uma regra para vários recursos (as quatro plantações)
          var c = p.action && p.action.type === 'gather' ? w.nodeById[p.action.id] : null;
          if (c && ks.indexOf(c.kind) >= 0 && st.nodes[c.id].alive) { return { act: 'gather', id: c.id }; }
          var n = this.nearestNode(st, ks);
          if (n) { return { act: 'gather', id: n.id }; }
          break;
        }
        case 'farm_in_area': {
          var fa = this.nearestFarm(st);
          if (fa) { return { act: 'farm', id: fa.id }; }
          break;
        }
      }
    }
    return { act: 'wait' };
  };
  Sim.prototype.mobById = function (st, id) { for (var i = 0; i < st.mobs.length; i++) { if (st.mobs[i].id === id) { return st.mobs[i]; } } return null; };

  Sim.prototype.macroTick = function (st, dt) {
    var w = this.w, G = w.game, p = st.player, m = p.macro, pl = w.plaza;

    if (m.phase === 'rest') {
      p.hp = Math.min(maxHp(w, p), p.hp + G.player.restRegenPerSec * dt);
      p.action = { type: 'rest' };
      if (p.hp >= maxHp(w, p)) { m.phase = 'run'; p.action = null; this.log(st, 'Descansado. Voltando à área.'); }
      return;
    }
    if (m.phase === 'retreat' || m.phase === 'full') {
      p.action = { type: 'travel', label: 'voltando à praça' };
      if (this.moveTo(st, pl.x, pl.z + 1.5, 1.2, dt, 'praca')) {
        if (m.phase === 'full') { this.stopMacro(st, 'Bolsa cheia: venda na vila e retome a macro.'); p.action = null; }
        else { m.phase = 'rest'; }
      }
      return;
    }

    var d = this.decide(st);
    switch (d.act) {
      case 'drink': this.drink(st); return;
      case 'retreat_rest':
        m.phase = 'retreat'; st.stats.retreats++; this.log(st, 'Vida baixa: recuando para a praça.'); return;
      case 'retreat_stop':
        m.phase = 'full'; this.log(st, 'Bolsa cheia: voltando à praça.'); return;
      case 'attack': {
        var mob = this.mobById(st, d.id);
        p.action = { type: 'attack', id: mob.id };
        // o arco atira de longe, mas só com a linha livre; sem ela, chega perto como quem luta corpo a corpo
        var s = stats(w, p), near = s.reach * 0.9;
        if (s.ranged && !w.los(p.x, p.z, mob.x, mob.z)) { near = Math.min(near, 1.5); }
        if (this.moveTo(st, mob.x, mob.z, near, dt, mob.id)) {
          this.face(st, mob.x, mob.z);
          if (p.atkCd <= 0) { this.swing(st, mob); }
        }
        return;
      }
      case 'gather': {
        var n = w.nodeById[d.id];
        if (!p.action || p.action.type !== 'gather' || p.action.id !== n.id) { p.action = { type: 'gather', id: n.id, prog: 0 }; }
        var q = nodePoint(n, p.x, p.z); // plantação: a borda mais perto do retalho basta
        if (this.moveTo(st, q.x, q.z, n.rect ? 0.6 : 1.5, dt, n.id)) {
          this.face(st, n.x, n.z);
          p.action.prog += dt;
          if (p.action.prog >= gatherSec(w, p, n.kind)) { this.finishGather(st, n); p.action = null; }
        }
        return;
      }
      case 'farm': {
        var fk = this.farmKind(d.id), F = G.farm[fk], b = w.bichoEm(d.id, st.t);
        p.action = { type: 'travel', label: fk === 'ovelha' ? 'indo tosquiar' : 'indo tirar leite' };
        if (this.moveTo(st, b.x, b.z, F.range - 0.6, dt, d.id)) {
          this.face(st, b.x, b.z);
          this.farmUse(st, d.id);
          p.action = null;
        }
        return;
      }
      default: {
        // nada para fazer: espera no centro da área
        var a = m.area;
        if (dist(p.x, p.z, a.x, a.z) > 2) { p.action = { type: 'travel', label: 'indo para a área' }; this.moveTo(st, a.x, a.z, 1.5, dt, 'area'); }
        else { p.action = { type: 'wait' }; }
      }
    }
  };

  // ação manual (clique): coletar ou atacar o que está ao alcance
  Sim.prototype.manualTick = function (st, dt) {
    var w = this.w, G = w.game, p = st.player, a = p.action;
    if (p.goto) {
      if (this.moveTo(st, p.goto.x, p.goto.z, 0.4, dt, 'goto')) { p.goto = null; }
      else if (!p.macro.path) { p.goto = null; this.log(st, 'Não há caminho até lá.'); }
      return;
    }
    if (!a) { return; }
    if (a.type === 'gather') {
      var n = w.nodeById[a.id];
      if (!st.nodes[n.id].alive) { p.action = null; return; }
      if (nodeDist(n, p.x, p.z) > G.player.gatherReach) { p.action = null; this.log(st, 'Longe demais para coletar.'); return; }
      a.prog += dt;
      if (a.prog >= gatherSec(w, p, n.kind)) { this.finishGather(st, n); p.action = null; }
    } else if (a.type === 'attack') {
      var m = this.mobById(st, a.id);
      if (!m || !m.alive) { p.action = null; return; }
      var d = dist(p.x, p.z, m.x, m.z), s = stats(w, p);
      if (d > Math.max(14, s.reach + 4)) { p.action = null; return; }
      if (d <= s.reach && p.atkCd <= 0 && (!s.ranged || w.los(p.x, p.z, m.x, m.z))) { this.swing(st, m); }
    } else if (a.type === 'luta') { // uma pessoa da vila, só com a vila em armas
      var e = this.personPos(st, a.id);
      if (!st.hostil || !e || this.isKo(st, a.id)) { p.action = null; return; }
      if (this.offline) { return; } // a briga está congelada no tempo fora: ninguém bate em quem não se mexe
      var de = dist(p.x, p.z, e.x, e.z), se = stats(w, p);
      if (de > Math.max(20, se.reach + 4)) { p.action = null; return; }
      if (de <= se.reach && p.atkCd <= 0 && (!se.ranged || w.los(p.x, p.z, e.x, e.z))) { this.swingPerson(st, a.id); }
    } else {
      p.action = null; // descanso/espera/viagem só existem dentro da macro
    }
  };

  Sim.prototype.mobTick = function (st, m, dt) {
    // sp: o ponto de nascer; combatente sem ponto na planta (de outro sistema) usa o lugar onde está
    var w = this.w, G = w.game, def = G.monsters[m.kind], p = st.player, sp = w.spawnById[m.id] || m;
    if (!m.alive) {
      m.left -= dt;
      if (m.left <= 0) {
        var ang = rnd(st) * Math.PI * 2, rr = rnd(st) * 2;
        var pos = w.nearestFree(sp.x + Math.cos(ang) * rr, sp.z + Math.sin(ang) * rr) || sp;
        m.x = pos.x; m.z = pos.z; m.hp = def.hp; m.alive = true; m.fight = false; m.wx = m.x; m.wz = m.z; m.wait = 1;
        this.emit(st, { type: 'spawn', id: m.id });
      }
      return;
    }
    m.atkCd -= dt;
    if (m.calm > 0) { m.calm -= dt; }
    var step, d, dx, dz;
    if (def.flee && this.flee(st, m, def, sp, dt)) { return; }
    // bicho bravo (aggro = raio em m): ataca quem chega perto, mas só dentro da sua área (leash) e não logo depois de desistir,
    // senão ficaria preso entre atacar e voltar para casa
    if (!m.fight && def.aggro && !(m.calm > 0) && dist(m.x, m.z, p.x, p.z) <= def.aggro && dist(p.x, p.z, sp.x, sp.z) <= def.leash) { m.fight = true; m.wait = 0; }
    if (m.fight) {
      if (dist(m.x, m.z, sp.x, sp.z) > def.leash || dist(m.x, m.z, p.x, p.z) > def.leash) {
        m.fight = false; m.hp = def.hp; m.wx = sp.x; m.wz = sp.z; m.calm = 6; return;
      }
      this.chase(st, m, def, dt, false); // o mesmo perseguir-e-bater dos aldeões em armas
      return;
    }
    // passeio
    if (m.wait > 0) { m.wait -= dt; return; }
    d = dist(m.x, m.z, m.wx, m.wz);
    if (d < 0.1) {
      m.wait = 1 + rnd(st) * 3;
      var a2 = rnd(st) * Math.PI * 2, r2 = rnd(st) * def.wanderRadius;
      var tx = sp.x + Math.cos(a2) * r2, tz = sp.z + Math.sin(a2) * r2;
      if (w.free(tx, tz, 0.2)) { m.wx = tx; m.wz = tz; }
      return;
    }
    step = Math.min(def.wanderSpeed * dt, d);
    dx = (m.wx - m.x) / d * step; dz = (m.wz - m.z) / d * step;
    if (w.free(m.x + dx, m.z + dz, 0.15)) { m.x += dx; m.z += dz; m.face = Math.atan2(dx, dz); }
    else { m.wx = m.x; m.wz = m.z; }
  };
  // presa que foge (veado): corre de quem chega a menos de 'flee' m (ferida, de mais longe). O fôlego (sta, em s de corrida)
  // acaba e ela fica lenta (tiredSpeed) até descansar longe de quem caça: a caçada é uma perseguição, não um passeio.
  // Longe de casa, a fuga puxa de volta para o ponto de nascer. Devolve true quando fugiu neste tique
  // um passo na direção a (radianos, como face); bloqueado, tenta os desvios da lista, do menor para o maior
  var CERCO = [0, 0.6, -0.6, 1.2, -1.2], FUGA = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3];
  Sim.prototype.passo = function (m, a, step, r, desvios) {
    for (var i = 0; i < desvios.length; i++) {
      var b = a + desvios[i], dx = Math.sin(b) * step, dz = Math.cos(b) * step;
      if (this.w.free(m.x + dx, m.z + dz, r)) { m.x += dx; m.z += dz; return b; }
    }
    return null;
  };
  Sim.prototype.flee = function (st, m, def, sp, dt) {
    var p = st.player, dp = dist(m.x, m.z, p.x, p.z);
    if (typeof m.sta !== 'number') { m.sta = def.stamina; }
    if (!(dp < def.flee || (m.fight && dp < def.flee * 1.6))) {
      m.fight = false; m.sta = Math.min(def.stamina, m.sta + dt * def.rest); return false;
    }
    var spd = m.sta > 0 ? def.speed : def.tiredSpeed, step = spd * dt; m.sta = Math.max(0, m.sta - dt);
    var ax = (m.x - p.x) / (dp || 1), az = (m.z - p.z) / (dp || 1), dh = dist(m.x, m.z, sp.x, sp.z), k = Math.max(0, dh / def.leash - 0.5) * 2;
    if (dh > 0.1) { ax += (sp.x - m.x) / dh * k; az += (sp.z - m.z) / dh * k; }
    var a = this.passo(m, Math.atan2(ax, az), step, 0.25, FUGA);
    if (a !== null) { m.face = a; }
    m.wx = m.x; m.wz = m.z; m.wait = 1.5;
    return true;
  };

  // ---------- curral: tirar leite e tosquiar ----------
  // passeio de cada bicho: anda um pedaço da curva (anda = fração do ciclo), para e pasta; u avança 3 por ciclo
  function ease(t) { return t * t * (3 - 2 * t); }
  function bichoU(c, h, seg) {
    var q = seg / c.ciclo + h[8], k = Math.floor(q), f = q - k, e = f < c.anda ? ease(f / c.anda) : 1;
    return { u: (k + e) * 3, anda: f < c.anda };
  }
  function bichoXZ(c, h, u) {
    var A = c.area;
    return [Math.max(A[0], Math.min(A[2], h[0] + h[2] * Math.sin(u * h[4] + h[6]))), Math.max(A[1], Math.min(A[3], h[1] + h[3] * Math.sin(u * h[5] + h[7])))];
  }
  World.prototype.bichoEm = function (id, t) {
    var b = this.bichoById[id]; if (!b) { return null; }
    var m = bichoU(b.c, b.h, t), p = bichoXZ(b.c, b.h, m.u);
    return { x: p[0], z: p[1], u: m.u, anda: m.anda };
  };
  World.prototype.bichoXZ = function (id, u) { var b = this.bichoById[id]; return b ? bichoXZ(b.c, b.h, u) : null; };
  // vacas e ovelhas só existem no desenho (andam pelo relógio, como os moradores). A simulação guarda só quando cada uma
  // fica pronta de novo (st.farm[id] = st.t em que volta, então o tempo fora também conta); quem chama confere a distância
  Sim.prototype.farmKind = function (id) { var k = String(id).replace(/\d+$/, ''); return this.w.game.farm[k] ? k : null; };
  Sim.prototype.farmLeft = function (st, id) { return Math.max(0, ((st.farm && st.farm[id]) || 0) - st.t); };
  Sim.prototype.farmUse = function (st, id) {
    var F = this.w.game.farm[this.farmKind(id)], p = st.player;
    if (!F) { return ''; }
    if (F.tool && !(p.inv[F.tool] > 0)) { return F.noTool; }
    var left = this.farmLeft(st, id);
    if (left > 0) { return F.wait.replace('{t}', fmtLeft(left)); }
    if (!this.give(st, F.item, F.n)) { return 'Bolsa cheia: libere espaço antes.'; }
    st.farm = st.farm || {}; st.farm[id] = st.t + F.cooldown;
    this.log(st, F.done);
    return F.done;
  };

  Sim.prototype.tick = function (st) {
    var w = this.w, G = w.game, dt = G.settings.tickSec, p = st.player;
    st.t += dt;
    p.potCd = Math.max(0, p.potCd - dt);
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.combatT += dt;
    if (p.poison) { // envenenado não se recupera sozinho
      p.hp -= p.poison.dps * dt; p.poison.t -= dt; p.combatT = 0;
      if (p.poison.t <= 0) { p.poison = null; this.log(st, 'O veneno passou.'); }
      if (p.hp <= 0) { this.faint(st); }
    }
    if (p.combatT > G.player.regenDelaySec && p.hp < maxHp(w, p)) { var s = stats(w, p); p.hp = Math.min(s.hp, p.hp + G.player.regenPerSec * s.regen * dt); }

    // recursos voltam
    // pela lista fixa do mundo, não por for-in no save: com centenas de árvores, o recálculo do tempo fora pesa.
    // Campanha: o campo do capítulo (st.camp.semVolta) só volta a crescer depois do fim dele, para "termine o campo" ser o campo todo
    var semVolta = st.camp && !st.camp.fim ? st.camp.semVolta : null;
    for (var k = 0, nd = w.nodes; k < nd.length; k++) {
      var ns = st.nodes[nd[k].id];
      if (!ns.alive && (!semVolta || nd[k].field !== semVolta)) { ns.left -= dt; if (ns.left <= 0) { ns.alive = true; this.emit(st, { type: 'regrow', id: nd[k].id }); } }
    }
    for (var i = 0; i < st.mobs.length; i++) { this.mobTick(st, st.mobs[i], dt); }
    // tempo fora: a briga e os desmaios ficam congelados até o jogador voltar (ninguém é preso ou foge sem estar olhando)
    if (!this.offline) { this.genteTick(st, dt); }
    this.repoeTick(st);

    if (p.mode === 'macro' && p.macro.on) { this.macroTick(st, dt); }
    else { this.manualTick(st, dt); }
  };

  // avança 'sec' segundos em silêncio (tempo fora). Devolve quantos segundos rodou.
  Sim.prototype.advance = function (st, sec) {
    var dt = this.w.game.settings.tickSec, n = Math.floor(sec / dt);
    var was = this.quiet, off = this.offline; this.quiet = true; this.offline = true;
    for (var i = 0; i < n; i++) { this.tick(st); }
    this.quiet = was; this.offline = off;
    return n * dt;
  };

  // ---------- serviços da vila (ações do jogador) ----------
  Sim.prototype.nearNpc = function (st, id) {
    // além das pessoas, objetos fixos abrem a mesma janela (props com o campo npc)
    // e no mesmo lugar: quem está dentro de uma sala só fala com quem está nela (as paredes não deixam passar a voz)
    var p = st.player, w = this.w, r = w.game.settings.interactRange + 0.5, aqui = w.salaEm(p.x, p.z);
    return w.npcs.concat(w.props).some(function (x) { return (x.id === id || x.npc === id) && dist(p.x, p.z, x.x, x.z) <= r && w.salaEm(x.x, x.z) === aqui; });
  };
  // perto, mas com uma parede no meio: diz para entrar (ou sair) pela porta. '' quando não é esse o caso
  Sim.prototype.paredeEntre = function (st, id) {
    var p = st.player, w = this.w, r = w.game.settings.interactRange + 0.5, aqui = w.salaDe(p.x, p.z), msg = '';
    w.npcs.concat(w.props).some(function (x) {
      if ((x.id !== id && x.npc !== id) || dist(p.x, p.z, x.x, x.z) > r) { return false; }
      var la = w.salaDe(x.x, x.z); if (la === aqui) { return false; }
      var nome = (w.personById[id] && w.personById[id].name) || x.name || 'quem você procura';
      msg = la ? nome + ' está dentro: entre na ' + la.nome.toLowerCase() + ' pela porta.'
        : 'Saia da ' + aqui.nome.toLowerCase() + ' para falar com ' + nome + '.';
      return true;
    });
    return msg;
  };
  Sim.prototype.service = function (st, npc, s, arg) {
    var w = this.w, G = w.game, p = st.player;
    if (!this.nearNpc(st, npc)) { return this.paredeEntre(st, npc) || 'Aproxime-se primeiro.'; }
    // o quadro e o baú são objetos e seguem abertos; as pessoas não atendem no meio da briga nem desacordadas
    var q = w.personById[npc];
    if (q && this.isKo(st, npc)) { return G.aldeoes.textos.desacordado.replace('{alvo}', q.name); }
    if (q && st.hostil) { return (G.pessoas[npc] && G.pessoas[npc].recusa) || G.aldeoes.textos.recusa; }
    if (q && st.gente[npc] && st.gente[npc].volta) { return G.aldeoes.textos.voltando.replace('{alvo}', q.name); }
    if (s.type === 'heal') {
      var ven = !!p.poison; p.hp = maxHp(w, p); p.poison = null; return ven ? 'Vida restaurada e veneno curado.' : 'Vida restaurada.';
    }
    if (s.type === 'buy') {
      var price = buyPrice(w, p, s.item);
      if ((p.inv.moeda || 0) < price) { return 'Moedas insuficientes.'; }
      p.inv.moeda -= price; p.inv[s.item] = (p.inv[s.item] || 0) + 1; return 'Comprou ' + G.items[s.item].name.toLowerCase() + '.';
    }
    if (s.type === 'shop') { return this.buyItem(st, s, arg.item, arg.n, arg.equip); }
    if (s.type === 'sell' && arg && arg.item) { return this.sellItem(st, s, arg.item, arg.n); }
    if (s.type === 'deliver') { return this.dailyPut(st, arg.item, arg.n); }
    if (s.type === 'sell') {
      var total = 0;
      var self = this, kept = 0;
      s.items.forEach(function (k) {
        var keep = Math.min(p.inv[k] || 0, self.reserved(st, k)), n = (p.inv[k] || 0) - keep;
        kept += keep;
        if (n > 0) { total += sellPrice(w, p, k, n); p.inv[k] = keep; }
      });
      if (!total) { return kept ? 'Nada para vender: o que você tem está guardado para missões.' : 'Nada para vender aqui.'; }
      if (kept) { p.inv.moeda = (p.inv.moeda || 0) + total; return 'Vendeu por ' + total + ' moedas (guardou o que as missões pedem).'; }
      p.inv.moeda = (p.inv.moeda || 0) + total; return 'Vendeu tudo por ' + total + ' moedas.';
    }
    return '';
  };
  // loja: n = quantos feixes (s.lots[item] unidades cada; sem feixe, 1). equip: já veste o que comprou
  Sim.prototype.buyItem = function (st, s, item, n, equip) {
    var w = this.w, G = w.game, p = st.player, def = G.items[item];
    if (!def || s.items.indexOf(item) < 0) { return 'Isso não se compra aqui.'; }
    if (def.tool && p.inv[item] > 0) { return 'Você já tem ' + def.name.toLowerCase() + ': uma basta.'; } // ferramenta não gasta
    n = Math.floor(+n || 0);
    if (n < 1) { return 'Escolha quantos comprar.'; }
    var lot = (s.lots && s.lots[item]) || 1, units = n * lot, cost = buyPrice(w, p, item, units);
    if ((p.inv.moeda || 0) < cost) { return 'Moedas insuficientes: custa ' + cost + '.'; }
    // o que vai direto para o corpo não ocupa a bolsa, a não ser a peça que sai para dar lugar
    var slot = equip ? this.slotFor(st, item) : null, swap = slot && p.equip[slot] && !G.items[p.equip[slot]].stack ? 1 : 0;
    var room = def.noBag ? 1e9 : bagCap(w, p) - bagCount(w, p) - swap + (equip ? 1 : 0);
    if (units > room) { return 'Bolsa cheia: libere espaço antes de comprar.'; }
    p.inv.moeda -= cost; p.inv[item] = (p.inv[item] || 0) + units;
    var msg = 'Comprou ' + (units === 1 ? def.name : units + ' ' + (def.plural || def.name)).toLowerCase() + ' por ' + cost + ' moeda' + (cost === 1 ? '' : 's') + '.';
    // munição comprada com o arco na mão e a casa vazia já vai para a aljava
    if (def.stack && !p.equip[def.slot] && p.equip.arma && (G.weaponClasses[G.items[p.equip.arma].class] || {}).ammo === item) { p.equip[def.slot] = item; }
    if (equip) { msg += ' ' + this.equip(st, item); }
    return msg;
  };

  // ---------- equipamento ----------
  // a casa em que o item entra: a vazia do tipo dele, ou a primeira desse tipo (troca)
  Sim.prototype.slotFor = function (st, item) {
    var G = this.w.game, def = G.items[item], first = null, free = null;
    if (!def || !def.slot) { return null; }
    keys(G.equipSlots).forEach(function (s) {
      if (G.equipSlots[s].type !== def.slot) { return; }
      if (!first) { first = s; }
      if (!free && !st.player.equip[s]) { free = s; }
    });
    return free || first;
  };
  // veste um item da bolsa; o que estava na casa volta para a bolsa. Item de pilha (flechas) fica no inventário:
  // a casa só aponta para ele, e cada tiro gasta do monte
  Sim.prototype.equip = function (st, item, slot) {
    var w = this.w, G = w.game, p = st.player, def = G.items[item];
    if (!def || !def.slot) { return 'Isso não se veste.'; }
    if (!(p.inv[item] > 0)) { return 'Você não tem ' + def.name.toLowerCase() + '.'; }
    if (!slot || !G.equipSlots[slot] || G.equipSlots[slot].type !== def.slot) { slot = this.slotFor(st, item); }
    var old = p.equip[slot];
    if (old === item && def.stack) { return def.name + ' já está em uso.'; }
    if (def.stack) { p.equip[slot] = item; }
    else {
      p.inv[item]--; p.equip[slot] = item;
      if (old && !G.items[old].stack) { p.inv[old] = (p.inv[old] || 0) + 1; }
    }
    // arco novo com flechas na bolsa e a munição vazia: já põe as flechas
    var cls = def.class && G.weaponClasses[def.class];
    if (cls && cls.ammo && p.inv[cls.ammo] > 0) {
      keys(G.equipSlots).forEach(function (s) { if (G.equipSlots[s].type === G.items[cls.ammo].slot && !p.equip[s]) { p.equip[s] = cls.ammo; } });
    }
    p.hp = Math.min(p.hp, maxHp(w, p));
    return 'Equipou: ' + def.name.toLowerCase() + (old && old !== item && !G.items[old].stack ? ' (' + G.items[old].name.toLowerCase() + ' foi para a bolsa).' : '.');
  };
  Sim.prototype.unequip = function (st, slot) {
    var w = this.w, G = w.game, p = st.player, item = p.equip[slot], def = item && G.items[item];
    if (!def) { return 'A casa já está vazia.'; }
    if (!def.stack && !def.noBag && bagCount(w, p) + 1 > bagCap(w, p)) { return 'Bolsa cheia: não há onde guardar ' + def.name.toLowerCase() + '.'; }
    p.equip[slot] = null;
    if (!def.stack) { p.inv[item] = (p.inv[item] || 0) + 1; }
    p.hp = Math.min(p.hp, maxHp(w, p));
    return 'Tirou: ' + def.name.toLowerCase() + '.';
  };

  // ---------- atributos ----------
  // add = { forca: 2, ... }: gasta de uma vez os pontos escolhidos na tela (a soma não passa de p.pts).
  // A vida máxima que a constituição soma entra cheia, como ao subir de nível
  Sim.prototype.spend = function (st, add) {
    var w = this.w, p = st.player, total = 0, k, ids = keys(w.game.attributes);
    for (k in add) {
      if (ids.indexOf(k) < 0 || !(add[k] >= 0) || add[k] !== Math.floor(add[k])) { return false; }
      total += add[k];
    }
    if (!total || total > p.pts) { return false; }
    var before = maxHp(w, p);
    for (k in add) { p.attr[k] = (p.attr[k] || 0) + add[k]; }
    p.pts -= total; p.hp += maxHp(w, p) - before;
    this.log(st, 'Distribuiu ' + total + ' ponto' + (total === 1 ? '' : 's') + ' de atributo.');
    return true;
  };
  // quanto deste item dá para vender (o que as missões ativas pedem fica guardado)
  Sim.prototype.sellable = function (st, item) {
    var n = st.player.inv[item] || 0;
    return Math.max(0, n - Math.min(n, this.reserved(st, item)));
  };
  // ---------- missões diárias (dados em game.json → daily) ----------
  // estado salvo: st.daily = { day, closed, q: { id: { state: 'active' | 'done', got } } }; sem entrada = disponível
  // closed: da meia-noite até o reinício as missões ficam encerradas, para ninguém entregar sem receber
  // day vem de fora: a simulação não olha o relógio, senão o recálculo do tempo fora mudaria de resultado
  Sim.prototype.dailyCheck = function (st, day) {
    var first = !st.daily.day;
    if (!first && dayNum(day) <= dayNum(st.daily.day)) { return false; }
    st.daily = { day: day, q: {} };
    if (!first) { this.log(st, 'As missões diárias foram renovadas.'); }
    return true;
  };
  // meia-noite: paga o que foi entregue nas missões incompletas e encerra o dia. date = data de hoje no relógio de quem joga
  Sim.prototype.dailySettle = function (st, date) {
    if (!st.daily.day || st.daily.closed || dayNum(date) <= dayNum(st.daily.day)) { return false; }
    var self = this, Q = this.w.game.daily.quests, p = st.player;
    this.dailyActive(st).forEach(function (id) {
      var got = self.dailyGot(st, id); if (!got) { return; }
      var r = self.dailyReward(id, got, st);
      p.inv.moeda = (p.inv.moeda || 0) + r.moedas; p.rep += r.rp;
      self.gainXp(st, r.xp, true);
      var text = Q[id].title + ': o dia acabou e ' + got + ' de ' + Q[id].n + ' renderam +' + r.moedas + ' moedas, +' + r.xp + ' XP e +' + r.rp + ' rp.';
      self.log(st, text); self.emit(st, { type: 'alert', text: text });
    });
    st.daily.closed = true;
    return true;
  };
  Sim.prototype.dailyState = function (st, id) {
    var q = st.daily.q[id];
    if (st.daily.closed && !(q && q.state === 'done')) { return 'closed'; }
    return q ? q.state : 'available';
  };
  Sim.prototype.dailyAccept = function (st, id) {
    if (this.dailyState(st, id) !== 'available') { return false; }
    st.daily.q[id] = { state: 'active', got: 0 };
    this.log(st, 'Nova missão diária: ' + this.w.game.daily.quests[id].title + '.');
    return true;
  };
  Sim.prototype.dailyActive = function (st) {
    var self = this;
    return Object.keys(this.w.game.daily.quests).filter(function (id) { return self.dailyState(st, id) === 'active'; });
  };
  Sim.prototype.dailyGot = function (st, id) { var q = st.daily.q[id]; return (q && q.got) || 0; };
  // recompensa de n peças da missão, arredondada; sem n, a da missão inteira, que é a que o quadro mostra.
  // Com st, já vem com a inteligência (XP) e o carisma (rp) de quem joga: o quadro mostra o que vai pagar
  Sim.prototype.dailyReward = function (id, n, st) {
    var D = this.w.game.daily, Q = D.quests[id], W = D.reward, s = st ? stats(this.w, st.player) : { xp: 1, rep: 1 }; n = n || Q.n;
    return { moedas: Math.round(n * W.ouroPorPeca[Q.item]), xp: Math.round(n * W.xpPorPeca * s.xp), rp: Math.round(n * W.rpPorPeca * s.rep) };
  };
  // o que o baú aceita agora: só o material das missões diárias em andamento
  Sim.prototype.dailyItems = function (st) {
    var Q = this.w.game.daily.quests, out = [];
    this.dailyActive(st).forEach(function (id) { if (out.indexOf(Q[id].item) < 0) { out.push(Q[id].item); } });
    return out;
  };
  Sim.prototype.dailyFor = function (st, item) {
    var Q = this.w.game.daily.quests;
    return this.dailyActive(st).filter(function (id) { return Q[id].item === item; })[0] || null;
  };
  Sim.prototype.dailyNeed = function (st, item) { var id = this.dailyFor(st, item); return id ? this.w.game.daily.quests[id].n - this.dailyGot(st, id) : 0; };
  Sim.prototype.dailyMax = function (st, item) { return Math.min(this.sellable(st, item), this.dailyNeed(st, item)); };
  // o material entra aos poucos, mas a recompensa só sai quando a missão fica completa
  Sim.prototype.dailyPut = function (st, item, n) {
    var G = this.w.game, p = st.player, def = G.items[item], id = this.dailyFor(st, item);
    n = Math.min(n, this.dailyMax(st, item));
    if (!(n > 0)) { return 'O baú só aceita o material que a vila pediu.'; }
    var Q = G.daily.quests[id], q = st.daily.q[id], put = 'Colocou ' + n + ' ' + (n === 1 ? def.name : (def.plural || def.name)).toLowerCase() + ' no baú.';
    p.inv[item] -= n; q.got = this.dailyGot(st, id) + n;
    if (q.got < Q.n) { return put + ' Faltam ' + (Q.n - q.got) + '.'; }
    var r = this.dailyReward(id, 0, st);
    q.state = 'done'; p.inv.moeda = (p.inv.moeda || 0) + r.moedas; p.rep += r.rp;
    this.gainXp(st, r.xp, true);
    this.log(st, 'Missão diária concluída: ' + Q.title + '.');
    this.emit(st, { type: 'quest', id: id });
    return put + ' Missão concluída: +' + r.moedas + ' moedas, +' + r.xp + ' XP e +' + r.rp + ' rp.';
  };

  // vende exatamente n unidades de um item que este serviço compra
  Sim.prototype.sellItem = function (st, s, item, n) {
    var G = this.w.game, p = st.player, def = G.items[item];
    if (!def || s.items.indexOf(item) < 0) { return 'Isso não se vende aqui.'; }
    n = Math.floor(+n || 0);
    if (n < 1) { return 'Escolha quantas unidades vender.'; }
    var can = this.sellable(st, item);
    if (!can) { return (p.inv[item] || 0) > 0 ? 'Não dá para vender: o que você tem de ' + def.name.toLowerCase() + ' está guardado para uma missão.' : 'Você não tem ' + (def.plural || def.name).toLowerCase() + '.'; }
    if (n > can) { n = can; }
    var total = sellPrice(this.w, p, item, n);
    p.inv[item] -= n; p.inv.moeda = (p.inv.moeda || 0) + total;
    return 'Vendeu ' + n + ' ' + (n === 1 ? def.name : (def.plural || def.name)).toLowerCase() + ' por ' + total + ' moeda' + (total === 1 ? '' : 's') + '.';
  };

  // ---------- missões (dados em game.json → quests) ----------
  // estado salvo: st.quests[id] = 'active' | 'done'; o resto é calculado
  Sim.prototype.questState = function (st, id) {
    var q = this.w.game.quests[id], s = st.quests[id];
    if (s === 'done') { return 'done'; }
    if (s === 'active') { return this.questReady(st, id) ? 'ready' : 'active'; }
    if (q.requires && st.quests[q.requires] !== 'done') { return 'locked'; }
    return 'available';
  };
  Sim.prototype.objProgress = function (st, id, o) {
    if (o.type === 'collect') { return Math.min(o.n, st.player.inv[o.item] || 0); }
    if (o.type === 'kill') { return Math.min(o.n, (st.qkills[id] && st.qkills[id][o.target]) || 0); }
    return 0;
  };
  Sim.prototype.questReady = function (st, id) {
    var self = this;
    return this.w.game.quests[id].objectives.every(function (o) { return self.objProgress(st, id, o) >= o.n; });
  };
  Sim.prototype.acceptQuest = function (st, id) {
    if (this.questState(st, id) !== 'available') { return false; }
    st.quests[id] = 'active'; st.qkills[id] = {};
    this.log(st, 'Nova missão: ' + this.w.game.quests[id].title + '.');
    return true;
  };
  Sim.prototype.turnInQuest = function (st, id) {
    var G = this.w.game, q = G.quests[id], p = st.player;
    if (this.questState(st, id) !== 'ready') { return false; }
    q.objectives.forEach(function (o) { if (o.type === 'collect') { p.inv[o.item] -= o.n; } });
    st.quests[id] = 'done'; delete st.qkills[id];
    var r = q.reward || {};
    for (var k in (r.items || {})) { p.inv[k] = (p.inv[k] || 0) + r.items[k]; }
    if (r.xp) { this.gainXp(st, r.xp); }
    this.log(st, 'Missão concluída: ' + q.title + '.');
    this.emit(st, { type: 'quest', id: id });
    return true;
  };
  // quanto de um item as missões ativas ainda pedem (não se vende)
  Sim.prototype.reserved = function (st, item) {
    var G = this.w.game, n = 0;
    for (var id in st.quests) {
      if (st.quests[id] !== 'active') { continue; }
      G.quests[id].objectives.forEach(function (o) { if (o.type === 'collect' && o.item === item) { n += o.n; } });
    }
    return n;
  };
  // a missão que este NPC tem para oferecer ou receber agora (uma por vez)
  Sim.prototype.npcQuest = function (st, npc) {
    var Q = this.w.game.quests, pick = null, self = this;
    Object.keys(Q).forEach(function (id) {
      if (Q[id].giver !== npc || pick) { return; }
      var s = self.questState(st, id);
      if (s === 'available' || s === 'active' || s === 'ready') { pick = { id: id, state: s }; }
    });
    return pick;
  };
  // ---------- formato do save ----------
  // FORMATO_SAVE é o número do formato atual (fica em st.fmt). Mudou o jeito de guardar algo (renomeou um campo, trocou
  // uma lista por um mapa...)? Aumente FORMATO_SAVE e escreva a conversão em MIGRACOES: MIGRACOES[n] leva um save do
  // formato n para o n + 1, e os saves velhos passam por todas, em ordem, ao abrir. Assim ninguém perde o progresso.
  // Campo novo com valor padrão não precisa de formato novo: basta o padrão em NZ.migrate (abaixo) ou em NZ.settle.
  // (O recomeço do zero por SAVE_VER, em js/ui.js, só vale com game.json → settings.resetSaveOnNewVersion, para emergência.)
  var FORMATO_SAVE = 1;
  var MIGRACOES = {
    // exemplo: 1: function (st) { st.player.bolsa = st.player.inv; delete st.player.inv; }
  };
  NZ.FORMATO_SAVE = FORMATO_SAVE;
  // saves antigos ganham os campos novos
  NZ.migrate = function (st) {
    var f = st.fmt || 1;
    if (f > FORMATO_SAVE) { throw new Error('Save de uma versão mais nova do jogo (formato ' + f + ').'); }
    for (; f < FORMATO_SAVE; f++) { MIGRACOES[f](st); }
    st.fmt = FORMATO_SAVE;
    st.quests = st.quests || {}; st.qkills = st.qkills || {}; st.flags = st.flags || {};
    st.daily = st.daily || { day: '', q: {} };
    st.farm = st.farm || {};
    if (typeof st.player.rep !== 'number') { st.player.rep = 0; }
    if (typeof st.player.name !== 'string') { st.player.name = ''; }
    if (st.player.goto === undefined) { st.player.goto = null; }
    if (st.player.mapNav !== 'macro') { st.player.mapNav = 'caminhada'; }
    if (!st.gente || typeof st.gente !== 'object') { st.gente = {}; }
    if (st.hostil === undefined) { st.hostil = null; }
    return st;
  };
  // saves de antes do equipamento: a espada da melhoria (p.weapon 0, 1 ou 2) vira a espada equivalente (legacyWeapons),
  // e os níveis já ganhos dão os pontos de atributo que teriam dado. Precisa de game.json, por isso roda em settle
  NZ.migrateGear = function (G, st) {
    var p = st.player, k;
    if (!p.equip) {
      var L = G.legacyWeapons, i = Math.max(0, Math.min(L.length - 1, p.weapon | 0));
      p.equip = newEquip(G, { arma: L[i] });
      p.pts = (p.lv - 1) * G.player.pointsPerLevel;
    }
    delete p.weapon;
    var e = newEquip(G); for (k in e) { if (p.equip[k] === undefined || (p.equip[k] && !G.items[p.equip[k]])) { p.equip[k] = null; } } // casa nova ou item que saiu do jogo
    if (!p.attr) { p.attr = {}; }
    keys(G.attributes).forEach(function (a) { if (typeof p.attr[a] !== 'number') { p.attr[a] = 0; } });
    if (typeof p.pts !== 'number') { p.pts = 0; }
    return st;
  };

  // acerta um save com o mapa atual (st.mapa: 2 = a cidade cercada, 3 = a vila aberta com floresta, pedregal e campina, 4 = a planta do rascunho de 10/11).
  // Recursos e coelhos seguem a lista da planta: o que é novo nasce vivo, o que sumiu sai do save. Save de mapa antigo:
  // coelhos voltam à toca e a área da macro, se não tiver mais nada para colher, vai para o recurso mais perto.
  // Em qualquer save, quem parou dentro de algo sai para a célula livre mais perto.
  NZ.settle = function (world, st) {
    NZ.migrateGear(world.game, st);
    var p = st.player, m = p.macro, G = world.game, ids = {};
    world.nodes.forEach(function (n) { ids[n.id] = 1; if (!st.nodes[n.id]) { st.nodes[n.id] = { alive: true, left: 0 }; } });
    Object.keys(st.nodes).forEach(function (id) { if (!ids[id]) { delete st.nodes[id]; } });
    if (p.action && p.action.type === 'gather' && !ids[p.action.id]) { p.action = null; }
    // bichos seguem a planta pelo id: o que é novo (lobos, veados... em save antigo) nasce, o que sumiu sai.
    // Combatente sem ponto de nascer, de outro sistema, fica como está
    function fauna(b) { return b.kind === 'coelho' || !!(G.monsters[b.kind] && G.monsters[b.kind].spot); }
    st.mobs = st.mobs.filter(function (b) { return G.monsters[b.kind] && (!fauna(b) || world.spawnById[b.id]); });
    world.spawns.forEach(function (s) {
      var b = st.mobs.filter(function (x) { return x.id === s.id; })[0];
      if (b) { b.sp = s.i; } else { st.mobs.push(newMob(G, s)); }
    });
    // regra de macro nova entra no fim da lista do jogador; regra que saiu do jogo sai
    st.rules = st.rules.filter(function (r) { return G.macro.rules[r.id]; });
    G.macro.defaultOrder.forEach(function (id) {
      if (!st.rules.some(function (r) { return r.id === id; })) { st.rules.push({ id: id, on: true, val: G.macro.rules[id].val }); }
    });
    if (p.poison && !(p.poison.t > 0)) { p.poison = null; }
    if (!(st.mapa >= 4)) {
      st.mapa = 4;
      // a planta foi refeita (mapa 4, 10/11/2026): quem estava no mundo volta para a praça; no meio da campanha, para o começo do trigo
      var ini = st.modo === 'campanha' && st.camp && !st.camp.fim && G.campanha ? G.campanha.inicio : world.vila.spawn;
      if (ini) { p.x = ini.x; p.z = ini.z; }
      st.mobs.forEach(function (b) { var s = world.spawns[b.sp]; if (s) { b.x = b.wx = s.x; b.z = b.wz = s.z; b.fight = false; } });
      var a = m.area;
      if (a && !world.nodes.some(function (n) { return dist(a.x, a.z, n.x, n.z) <= a.r; })) {
        var best = null, bd = 1e9;
        world.nodes.forEach(function (n) { var d = dist(a.x, a.z, n.x, n.z); if (d < bd) { best = n; bd = d; } });
        var c = (best && world.nearestFree(best.x, best.z)) || { x: a.x, z: a.z };
        m.area = { x: c.x, z: c.z, r: a.r };
      }
      m.path = null; m.goal = null; p.goto = null;
      if (p.action && (p.action.type === 'gather' || p.action.type === 'attack')) { p.action = null; }
    }
    // a briga com os moradores saiu do jogo: save gravado no meio de uma termina aqui, como em Sim.calm (os mortos
    // ficam mortos, quem está desacordado segue no chão até a hora dele, o resto volta à rotina)
    if (st.hostil) {
      st.hostil = null;
      if (p.action && p.action.type === 'luta') { p.action = null; }
      if (G.aldeoes && m.stop === G.aldeoes.textos.macro) { m.stop = ''; }
      Object.keys(st.gente).forEach(function (id) {
        var g = st.gente[id];
        if (st.mortos && st.mortos[id]) { g.path = null; }
        else if (g.ko > 0) { delete g.x; delete g.z; g.path = null; }
        else { delete st.gente[id]; }
      });
    }
    // gente: quem saiu da planta sai do save; com a vila em armas, quem anda e ficou sem posição (passou de parado a
    // morador, por exemplo) começa na praça; quem virou parado perde a posição de andante
    Object.keys(st.gente).forEach(function (id) {
      var q = world.personById[id], g = st.gente[id];
      if (!q) { delete st.gente[id]; return; }
      if (q.fixed && !st.hostil && !(st.mortos && st.mortos[id])) { delete st.gente[id]; return; } // fora da briga, no posto
      if (q.fixed) { g.path = null; if (g.x === undefined && !(g.ko > 0)) { var c1 = world.nearestFree(q.x, q.z) || q; g.x = c1.x; g.z = c1.z; } }
      else if (st.hostil && g.x === undefined && !(g.ko > 0)) { var c = world.nearestFree(world.plaza.x, world.plaza.z + 2); g.x = c.x; g.z = c.z; }
    });
    if (st.hostil) { world.people.forEach(function (q) {
      if (q.fixed || st.gente[q.id] || (st.mortos && st.mortos[q.id])) { return; }
      var c = world.nearestFree(world.plaza.x, world.plaza.z + 2), A = G.aldeoes;
      st.gente[q.id] = { hp: (A.papeis[q.papel] || A.papeis[A.papelPadrao]).hp, ko: 0, atkCd: 1, x: c.x, z: c.z };
    }); }
    if (!world.free(p.x, p.z, 0.3)) {
      var f = world.nearestFree(p.x, p.z) || { x: world.plaza.x, z: world.plaza.z + 1 }, S = world.salaDe(f.x, f.z);
      // preso numa parede de construção com sala (a planta mudou): sai pela porta, em vez de aparecer lá dentro
      if (S && !world.salaEm(p.x, p.z)) { f = world.nearestFree(S.fora.x, S.fora.z) || f; }
      p.x = f.x; p.z = f.z; m.path = null; m.goal = null;
    }
    st.mortos = st.mortos || {}; st.nomes = st.nomes || {};
    Object.keys(st.mortos).forEach(function (id) { if (!world.personById[id]) { delete st.mortos[id]; } });
    NZ.aplicaNomes(world, st);
    return st;
  };
  // o mundo é um só para os três saves: o nome de cada pessoa é o original ou o do substituto deste save
  NZ.aplicaNomes = function (world, st) {
    var G = world.game;
    world.people.forEach(function (q) {
      if (q.nome0 === undefined) { q.nome0 = q.name; q.npc0 = G.npcs[q.id] && G.npcs[q.id].name; }
      var n = st.nomes && st.nomes[q.id];
      q.name = n || q.nome0;
      if (G.npcs[q.id]) { G.npcs[q.id].name = n || q.npc0; }
    });
  };

  NZ.World = World;
  NZ.Sim = Sim;
  NZ.newState = newState;
  NZ.calc = { maxHp: maxHp, stats: stats, mobStats: mobStats, armorCut: armorCut, bagCount: bagCount, bagCap: bagCap, buyPrice: buyPrice, sellPrice: sellPrice,
    potionHeal: potionHeal, gatherSec: gatherSec, keys: keys, dist: dist, nodePoint: nodePoint, nodeDist: nodeDist, fmtLeft: fmtLeft };
})(window.NZ = window.NZ || {});
