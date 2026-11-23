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
    preparaPecas(game);
    var B = this.B = vila.bounds, N = this.N = B * 2;
    this.grid = new Uint8Array(N * N);
    var self = this, i;

    // borda do mundo
    for (i = 0; i < N; i++) { this.grid[i] = 1; this.grid[(N - 1) * N + i] = 1; this.grid[i * N] = 1; this.grid[i * N + N - 1] = 1; }
    // limite jogável (vila.json → limite): a borda natural do rascunho; toda célula com o centro fora dela bloqueia.
    // Por linha: os cruzamentos da linha com o polígono dizem onde é dentro (o mapa de 4 km tem 16 milhões de células)
    if (vila.limite) {
      var LP = vila.limite;
      for (var cz = 0; cz < N; cz++) {
        var zc = cz - B + 0.5, xs = [];
        for (var a = 0, b = LP.length - 1; a < LP.length; b = a++) {
          var za = LP[a][1], zb = LP[b][1];
          if ((za > zc) !== (zb > zc)) { xs.push(LP[a][0] + (LP[b][0] - LP[a][0]) * (zc - za) / (zb - za)); }
        }
        xs.sort(function (p, q) { return p - q; });
        var dentro = false, k = 0;
        for (var cx = 0; cx < N; cx++) {
          var xc = cx - B + 0.5;
          while (k < xs.length && xs[k] <= xc) { dentro = !dentro; k++; }
          if (!dentro) { this.grid[cz * N + cx] = 1; }
        }
      }
    }
    // relevo (data/regiao.json → relevo): a altura do chão em cada ponto; o que fica abaixo da água parada bloqueia
    if (vila.relevo) { this.lerRelevo(vila.relevo); }
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
    // gente: os NPCs parados e os moradores que andam, numa lista só, pelo id
    this.people = []; this.personById = {};
    function person(id, name, fixed, x, z) {
      if (self.personById[id]) { return; }
      var q = { id: id, name: name, fixed: fixed, x: x, z: z };
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
  // ---------- relevo ----------
  // grade n x n de alturas (16 bits entre min e max) a cada 'passo' m a partir de (x0, z0), e a pintura do chão (1 byte por
  // ponto, os índices do editor de mapas). Sem relevo (a vila de 240 m) o chão é plano: alt = 0
  function base64(s) { var b = atob(s), r = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) { r[i] = b.charCodeAt(i); } return r; }
  World.prototype.lerRelevo = function (R) {
    var n = R.n, q = base64(R.alturas), dv = new DataView(q.buffer), h = new Float32Array(n * n), k;
    for (k = 0; k < n * n; k++) { h[k] = R.min + dv.getUint16(k * 2, true) / 65535 * (R.max - R.min); }
    this.rel = { n: n, passo: R.lado / (n - 1), x0: R.x0, z0: R.z0, h: h, pintura: base64(R.pintura), nivel: R.nivel };
    // água parada: cada quadrado da grade com o meio abaixo do nível bloqueia (as pontes e vaus ficam livres)
    var P = this.rel.passo, T = this.vila.travessias, self = this;
    for (var j = 0; j + 1 < n; j++) {
      for (var i = 0; i + 1 < n; i++) {
        var m = (h[j * n + i] + h[j * n + i + 1] + h[(j + 1) * n + i] + h[(j + 1) * n + i + 1]) / 4;
        if (m >= R.nivel - 0.15) { continue; }
        var x0 = R.x0 + i * P, z0 = R.z0 + j * P;
        if (NZ.naTravessia(T, x0 + P / 2, z0 + P / 2)) { continue; }
        for (var dz = 0; dz < P; dz++) { for (var dx = 0; dx < P; dx++) { self.block(x0 + dx + 0.5, z0 + dz + 0.5); } }
      }
    }
  };
  World.prototype.alt = function (x, z) {
    var R = this.rel; if (!R) { return 0; }
    var fx = Math.min(R.n - 1.001, Math.max(0, (x - R.x0) / R.passo)), fz = Math.min(R.n - 1.001, Math.max(0, (z - R.z0) / R.passo));
    var i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, n = R.n, h = R.h, k = j * n + i;
    return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + n] * (1 - u) + h[k + n + 1] * u) * v;
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
    var NG = this.N, B = this.B, G0 = this.grid;
    var goal = this.nearestFree(tx, tz); if (!goal) { return null; }
    var start = this.nearestFree(sx, sz); if (!start) { return null; }
    // a busca roda numa janela em volta da origem e do destino (com folga para contornar), não na grade inteira:
    // no mapa de 4 km a grade tem 16 milhões de células. Na vila de 240 m a janela é o mapa todo, como antes
    var F = 160, MAXJ = 1400;
    var ax = Math.max(0, Math.floor(Math.min(start.x, goal.x)) + B - F), bx = Math.min(NG - 1, Math.floor(Math.max(start.x, goal.x)) + B + F);
    var az = Math.max(0, Math.floor(Math.min(start.z, goal.z)) + B - F), bz = Math.min(NG - 1, Math.floor(Math.max(start.z, goal.z)) + B + F);
    if (bx - ax > MAXJ || bz - az > MAXJ) { return null; } // longe demais para uma busca só
    var N = Math.max(bx - ax, bz - az) + 1, grid = new Uint8Array(N * N);
    for (var gz0 = 0; gz0 < N; gz0++) {
      var zz = az + gz0;
      for (var gx0 = 0; gx0 < N; gx0++) { var xx2 = ax + gx0; grid[gz0 * N + gx0] = zz > bz || xx2 > bx ? 1 : G0[zz * NG + xx2]; }
    }
    var s = (Math.floor(start.z) + B - az) * N + Math.floor(start.x) + B - ax;
    var e = (Math.floor(goal.z) + B - az) * N + Math.floor(goal.x) + B - ax;
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
    while (k !== -1) { pts.push({ x: (k % N) + ax - B + 0.5, z: ((k / N) | 0) + az - B + 0.5 }); k = from[k]; }
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

  // a praça mais próxima: hoje só há uma (plaza); um mapa com mais de uma lista todas em vila.pracas
  World.prototype.pracaPerto = function (x, z) {
    return (this.vila.pracas || [this.plaza]).reduce(function (a, b) { return dist(x, z, b.x, b.z) < dist(x, z, a.x, a.z) ? b : a; });
  };

  // ---------- estado ----------
  function newState(world, seed) {
    var G = world.game, sp = world.vila.spawn;
    var st = {
      v: 1, fmt: NZ.FORMATO_SAVE, mapa: 4, seed: seed | 0, t: 0,
      player: {
        name: '', x: sp.x, z: sp.z, yaw: Math.PI, hp: G.player.hpBase, lv: 1, xp: 0, rep: 0,
        inv: JSON.parse(JSON.stringify(G.player.startItems)), stance: 'ofensiva',
        equip: newEquip(G, G.player.startEquip), attr: newAttr(G), pts: 0, maestria: {}, prof: {}, mana: null, magCd: {}, afiada: null, // prof: tentativas por magia; mana null = cheia; afiada: a pedra de amolar na arma da mão { arma, n golpes, mult } // pts: pontos de atributo ainda por gastar
        potCd: 0, atkCd: 0, combatT: 99, action: null, goto: null,
        mode: 'manual', mapNav: 'caminhada', // mapNav: o que o clique no mapa faz por padrão ('caminhada' ou 'macro')
        macro: { area: null, on: false, phase: 'idle', stop: '', path: null, goal: null, repath: 0 }
      },
      rules: G.macro.defaultOrder.map(function (id) { return { id: id, on: true, val: G.macro.rules[id].val }; }),
      nodes: {}, mobs: [], farm: {},
      stats: { kills: 0, items: {}, potions: 0, xp: 0, retreats: 0, faints: 0 },
      quests: {}, qkills: {}, flags: {}, daily: { day: '', q: {} },
      magias: { on: false, limite: G.magias.limite, v: 2 }, // magias de teste (modo desenvolvedor)
      saque: [], saqueDeixa: {}, // saque no chão e o que a macro deixa de pegar (ver deixaSaque)
      nomes: {}, // nomes[id]: nome de quem substituiu a pessoa (só em saves da época em que dava para atacar a vila)
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
      var it = p.equip[s] && I[p.equip[s]]; if (!it || it.quebrada) { continue; } // quebrada: vestida, mas não protege nem dá bônus
      if (it.def) { add('def', it.def); }
      for (k in (it.bonus || {})) { add(k, it.bonus[k]); }
      for (k in (it.gather || {})) { gby[k] = (gby[k] || 0) + it.gather[k]; }
    }
    keys(A).forEach(function (a) { for (var c in (A[a].cap || {})) { if (b[c] > A[a].cap[c]) { b[c] = A[a].cap[c]; } } });
    // arco sem flecha na casa de munição não atira: luta de mãos nuas
    var wp = p.equip.arma && I[p.equip.arma]; if (wp && wp.quebrada) { wp = null; }
    var cls = wp ? G.weaponClasses[wp.class] : null;
    var noAmmo = !!(cls && cls.ammo && !(p.equip.municao === cls.ammo && p.inv[cls.ammo] > 0));
    var W = wp && !noAmmo ? wp : P.unarmed, C = W === wp ? cls : null, ranged = !!(C && C.ranged);
    var mul = 1 + (b[C ? C.scale : 'melee'] || 0);
    for (id in G.nodes) { gby[id] = 1 + (b.gather || 0) + (gby[id] || 0); }
    return {
      hp: P.hpBase + (p.lv - 1) * P.hpPerLv + Math.round(b.hp || 0),
      weapon: W === wp ? p.equip.arma : null, cls: C ? wp.class : null, noAmmo: noAmmo,
      min: W.dmg[0] * mul, max: W.dmg[1] * mul, interval: (C ? ritmo(w, p, wp.class) : W.interval) / (1 + (b.haste || 0)), reach: W.reach,
      ranged: ranged, ammo: C && C.ammo ? C.ammo : null,
      crit: Math.min(1, P.critBase + (b.crit || 0) + (C ? critMaestria(w, p, wp.class, naMacro(p)) : 0)), critMult: P.critMult + (b.critMult || 0), def: P.defBase + (b.def || 0),
      move: 1 + (b.move || 0), regen: 1 + (b.regen || 0), xp: 1 + (b.xp || 0), potion: 1 + (b.potion || 0),
      gather: gby, buy: 1 - (b.discount || 0), sell: 1 + (b.markup || 0), rep: 1 + (b.rep || 0),
      bag: G.settings.bagCapacity + Math.floor((b.bag || 0) + 1e-9)
    };
  }
  // bicho: o perfil vem direto de game.json
  function mobStats(def) {
    var d = def.dmg || [0, 0];
    return { min: d[0], max: d[1], interval: def.interval, reach: def.reach, crit: def.crit || 0, critMult: def.critMult || 1.5, def: def.def || 0 };
  }
  // fração da armadura: def / (def + armorK); nunca chega a 100%
  function armorCut(w, def) { return def > 0 ? def / (def + w.game.combat.armorK) : 0; }
  // algum bicho bravo (monsters → aggro) persegue o jogador agora? Coelho e veado não contam
  function perseguido(w, st) { return st.mobs.some(function (m) { return m.alive && m.fight && w.game.monsters[m.kind].aggro > 0; }); }
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

  // ---------- raridade, qualidade e durabilidade ----------
  // Cada peça de equipamento (item com slot que não é munição) tem uma qualidade (game.json → qualidade: de enferrujada a
  // celestial) e uma raridade (game.json → raridade: de comum a lendária; multiplica os modificadores). Na arma, a
  // qualidade diz a chance de quebrar a cada golpe (com a maestria); na peça de defesa, a durabilidade (qualidade.dur),
  // que cada golpe recebido gasta (oficina.desgaste).
  // A peça é guardada pelo id: o id puro (espada_ferro) é a qualidade padrão, comum e inteira; as outras são
  // id~q~r (espada_ferro~5~2 = radiante e rara), mais ~g<gasto em décimos> (defesa gasta: gambeson~3~0~g12 = 1,2 gasto)
  // ou ~x (quebrada). Pedra de amolar gasta: pedra_amolar~u3 (3 usos sobrando).
  // variante() monta a ficha dessas no próprio G.items na primeira vez que aparecem, então bolsa, casas, saque, lojas e
  // save usam o id como qualquer item. Quem abre um save chama registraVariantes antes de tudo (NZ.settle já faz)
  function ehPeca(def) { return !!(def && def.slot && !def.stack); }
  function ehDefesa(def) { return ehPeca(def) && !def.class; } // tem durabilidade (armadura, escudo...)
  function preparaPecas(G) {
    if (!G.qualidade) { return; }
    keys(G.items).forEach(function (k) {
      var d = G.items[k];
      if (ehPeca(d) && !d.base && d.q === undefined) { d.q = G.qualidade.padrao; d.r = 0; d.gasto = 0; d.durMax = durMax(G, d.q); }
    });
    // cada loja sabe de quem é (o estoque do dia fica em st.lojas[npc])
    keys(G.npcs).forEach(function (id) { (G.npcs[id].services || []).forEach(function (s) { if (s.type === 'shop' && !s.npc) { Object.defineProperty(s, 'npc', { value: id }); } }); });
  }
  // durabilidade máxima em décimos (o gasto também é guardado em décimos)
  function durMax(G, q) { return Math.round((G.qualidade.niveis[q].dur || 0) * 10); }
  function pecaId(G, base, q, r, gasto, quebrada) {
    if (!quebrada && !gasto && q === G.qualidade.padrao && !r) { return base; }
    return base + '~' + q + '~' + r + (quebrada ? '~x' : gasto ? '~g' + gasto : '');
  }
  function varId(G, base, q, r) { return pecaId(G, base, q, r, 0, false); }
  // o id da mesma peça inteira e sem gasto
  function inteira(G, id) {
    var d = variante(G, id), r = d && d.base !== undefined && d.q !== undefined ? varId(G, d.base, d.q, d.r) : id;
    variante(G, r);
    return r;
  }
  function forma(nivel, g) { return nivel.nome[g] || nivel.nome.m; }
  var QUEBRADA = { m: 'quebrado', f: 'quebrada', mp: 'quebrados', fp: 'quebradas' };
  function arred(v) { return Math.round(v * 1000) / 1000; }
  function variante(G, id) {
    if (typeof id !== 'string') { return null; }
    if (G.items[id]) { return G.items[id]; }
    var u = /^([^~]+)~u(\d+)$/.exec(id), b;
    if (u) { // pedra de amolar com usos gastos
      b = G.items[u[1]];
      if (!b || !b.usos || +u[2] < 1 || +u[2] >= b.usos) { return null; }
      var pd = JSON.parse(JSON.stringify(b));
      pd.base = u[1]; pd.restam = +u[2]; pd.price = Math.max(1, Math.round(b.price * pd.restam / b.usos)); delete pd.buy;
      G.items[id] = pd;
      return pd;
    }
    var m = /^([^~]+)~(\d+)~(\d+)(?:~(?:g(\d+)|(x)))?$/.exec(id);
    b = m && G.items[m[1]];
    if (!ehPeca(b) || b.base) { return null; }
    var q = +m[2], r = +m[3], Q = G.qualidade.niveis[q], R = G.raridade.niveis[r], k;
    if (!Q || !R) { return null; }
    var gasto = m[4] ? +m[4] : 0, quebrada = !!m[5], max = durMax(G, q);
    if (gasto && (b.class || gasto >= max)) { return null; } // só a defesa se gasta; gasta até o fim vira ~x
    var d = JSON.parse(JSON.stringify(b)), mul = R.mult, g = b.g || 'm';
    d.base = m[1]; d.q = q; d.r = r; d.gasto = gasto; d.durMax = max; d.quebrada = quebrada;
    if (d.dmg) { d.dmg = [arred(d.dmg[0] * mul), arred(d.dmg[1] * mul)]; }
    if (d.def) { d.def = arred(d.def * mul); }
    for (k in (d.bonus || {})) { d.bonus[k] = arred(d.bonus[k] * mul); }
    for (k in (d.gather || {})) { d.gather[k] = arred(d.gather[k] * mul); }
    // revenda: a peça gasta vale menos (até oficina.revenda a menos); a quebrada não se vende (price 0)
    var desc = max ? 1 - (G.oficina.revenda || 0) * gasto / max : 1;
    if (b.price) { d.price = quebrada ? 0 : Math.max(1, Math.round(b.price * Q.preco * R.preco * desc)); }
    if (b.buy) { d.buy = Math.max(1, Math.round(b.buy * Q.preco * R.preco)); }
    var gp = g.length > 1 ? g : g + 'p';
    d.name = b.name + ' ' + forma(Q, g) + (r ? ' ' + forma(R, g) : '') + (quebrada ? ' (' + QUEBRADA[g] + ')' : '');
    d.plural = (b.plural || b.name) + ' ' + forma(Q, gp) + (r ? ' ' + forma(R, gp) : '') + (quebrada ? ' (' + QUEBRADA[gp] + ')' : '');
    G.items[id] = d;
    return d;
  }
  // todo id de peça que o save cita ganha a ficha (bolsa, casas, saque no chão, estoque das lojas)
  function registraVariantes(G, st) {
    var p = st.player || {}, k;
    for (k in (p.inv || {})) { variante(G, k); }
    for (k in (p.equip || {})) { variante(G, p.equip[k]); }
    (st.saque || []).forEach(function (s) { for (var i in (s.itens || {})) { variante(G, i); } });
    for (k in (st.lojas || {})) { for (var j in (st.lojas[k].itens || {})) { variante(G, j); } }
  }
  // índice sorteado pelos pesos
  function sorteia(st, pesos) {
    var t = 0, i; for (i = 0; i < pesos.length; i++) { t += pesos[i]; }
    var x = rnd(st) * t;
    for (i = 0; i < pesos.length; i++) { x -= pesos[i]; if (x < 0 && pesos[i] > 0) { return i; } }
    return pesos.length - 1;
  }
  // uma peça nova do item base, com qualidade e raridade sorteadas (pesos de game.json → qualidade/raridade, ou os dados)
  function novaPeca(G, st, base, pq, pr) {
    var r = sorteia(st, pr || G.raridade.saque), q = sorteia(st, pq || G.qualidade.saque), id;
    if (r >= G.raridade.qualidadeDupla) { q = Math.max(q, sorteia(st, pq || G.qualidade.saque)); } // peça rara ou melhor: vale a melhor de duas
    id = varId(G, base, q, r);
    variante(G, id);
    return id;
  }
  // maestria numa classe de arma: aprende com o uso, em níveis que custam cada vez mais (game.json → maestria).
  // { lv, tem e falta (golpes dentro do nível atual), usos }; no último nível, falta = 0
  // ataques para sair do nível anterior e chegar a lv (o nível 1 é de graça)
  function custoMaestria(G, lv) { return lv < 2 ? 0 : Math.round(G.maestria.golpes * Math.pow(G.maestria.cresce, lv - 2)); }
  function nivelMaestria(w, p, cls) { return nivelDe(w.game, (p.maestria && p.maestria[cls]) || 0); }
  function nivelDe(G, n) {
    var usos = n, lv = 1, c;
    while (lv < G.maestria.niveis && n >= (c = custoMaestria(G, lv + 1))) { n -= c; lv++; }
    return { lv: lv, usos: usos, tem: n, falta: lv < G.maestria.niveis ? custoMaestria(G, lv + 1) - n : 0 };
  }
  // quanto do efeito o nível dá, de 0 a 1: cada nível dá mais que o anterior
  function efeitoMaestria(G, lv) { var N = G.maestria.niveis; return lv * (lv - 1) / (N * (N - 1)); }
  function maestria(w, p, cls) { return efeitoMaestria(w.game, nivelMaestria(w, p, cls).lv); }
  function naMacro(p) { return p.mode === 'macro' && !!(p.macro && p.macro.on); }
  function treino(w, p) { return naMacro(p) ? w.game.maestria.macro : 1; } // quanto uma tentativa treina
  function entre(v, e) { return v[0] + (v[1] - v[0]) * e; } // do primeiro ao último nível, pelo efeito e
  // segundos entre ataques com a classe (sem o bônus de velocidade, que divide)
  function ritmo(w, p, cls) { return entre(w.game.weaponClasses[cls].ritmo, maestria(w, p, cls)); }
  // { cheio, raspao, erra } de uma tabela de acerto, com o efeito e
  function chances(A, e) { var c = entre(A.cheio, e), r = entre(A.raspao, e); return { cheio: c, raspao: r, erra: Math.max(0, 1 - c - r) }; }
  function sorteAcerto(st, A, e, fraco) { var c = chances(A, e), q = rnd(st); return q < c.cheio ? 1 : q < c.cheio + c.raspao ? fraco : 0; }
  function nivelMagia(w, p, id) { return nivelDe(w.game, (p.prof && p.prof[id]) || 0); }
  function proficiencia(w, p, id) { return efeitoMaestria(w.game, nivelMagia(w, p, id).lv); }
  function manaMax(w, p) { var M = w.game.magias.mana; return M.base + (p.lv - 1) * M.porNivel; }
  function critMaestria(w, p, cls, macro) { var M = w.game.maestria; return (macro ? M.criticoMacro : M.critico) * maestria(w, p, cls); }
  // chance de a arma quebrar no próximo golpe (peça de defesa não rola dado: se gasta)
  function chanceQuebra(w, p, id, cls) {
    var G = w.game, d = G.items[id];
    if (!ehPeca(d) || !d.class || d.quebrada || d.q === undefined) { return 0; }
    return G.qualidade.niveis[d.q].quebra * (1 - G.maestria.corte * maestria(w, p, cls || d.class));
  }
  // durabilidade que sobra, por inteiro, para a tela (o jogo conta em décimos)
  function durabilidade(G, id) {
    var d = G.items[id];
    if (!ehDefesa(d)) { return null; }
    return { resta: d.quebrada ? 0 : Math.ceil((d.durMax - d.gasto) / 10), max: Math.round(d.durMax / 10) };
  }
  // custo do conserto de uma unidade: reparar (defesa gasta ou quebrada) ou restaurar (arma quebrada); 0 = não precisa
  function custoConserto(w, p, id) {
    var G = w.game, d = G.items[id], O = G.oficina, b = d && G.items[inteira(G, id)];
    if (!ehPeca(d) || !b) { return 0; }
    var base = b.buy || b.price || 1, f;
    if (d.class) { f = d.quebrada ? O.restauro : 0; }
    else { f = d.quebrada ? O.reparo : O.reparo * d.gasto / d.durMax; }
    return f ? Math.max(1, Math.round(base * f * stats(w, p).buy + 1e-9)) : 0;
  }

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
  // ---------- saque no chão (o que os bichos deixam) ----------
  // st.saque: [{ id, x, z, itens: { item: n }, ate: st.t em que some }]. O jogador abre o monte e escolhe o que pegar;
  // com a macro trabalhando, ela pega na hora o que não estiver em st.saqueDeixa (o jogador marca no menu da macro, botão
  // Saque) e o resto fica no chão. Cada monte some depois de game.json → saque.dura segundos; no máximo saque.max montes
  Sim.prototype.deixaSaque = function (st, m, def) {
    var G = this.w.game, C = G.saque || {}, it = {}, n = 0;
    (def.drops || []).forEach(function (d) {
      if (!(rnd(st) < d.chance)) { return; }
      // equipamento: uma peça de um dos itens da lista, com qualidade e raridade sorteadas
      var id = d.equip ? novaPeca(G, st, d.equip[Math.floor(rnd(st) * d.equip.length)], d.qualidade, d.raridade) : d.item;
      it[id] = (it[id] || 0) + (d.n || 1); n++;
    });
    if (!n) { return null; }
    st.saque = st.saque || [];
    st.saqueN = (st.saqueN || 0) + 1;
    var s = { id: 'sq' + st.saqueN, x: m.x, z: m.z, itens: it, ate: st.t + (C.dura || 300) };
    st.saque.push(s);
    while (st.saque.length > (C.max || 30)) { st.saque.shift(); }
    var p = st.player;
    if (p.mode === 'macro' && p.macro.on) { this.macroSaque(st, s); }
    if (this.saqueDe(st, s.id)) { this.log(st, def.name + ' deixou algo no chão.'); }
    this.emit(st, { type: 'saque' });
    return s;
  };
  // o jogador solta n de um item da bolsa (n vazio = tudo): vira um monte no chão, um pouco à frente dele (aos pés não se
  // veria, com a câmera em primeira pessoa; a 2,4 m entra no campo de visão e fica ao alcance para pegar, game.json → settings.interactRange), que se pega de volta como
  // qualquer saque e some depois do mesmo saque.dura. Soltar de novo no mesmo lugar junta no mesmo monte (e o tempo dele
  // recomeça). O monte que recomeça vai para o fim da lista, que fica em ordem de sumir (ver o fim do tick)
  Sim.prototype.solta = function (st, item, n) {
    var G = this.w.game, C = G.saque || {}, p = st.player, def = G.items[item], tem = p.inv[item] || 0;
    if (!def || !(tem > 0)) { return 'Você não tem isso.'; }
    var k = Math.min(tem, n === undefined || n === null ? tem : Math.max(1, Math.floor(n)));
    p.inv[item] = tem - k;
    st.saque = st.saque || [];
    var y = p.yaw || 0, ax = p.x + Math.sin(y) * 2.4, az = p.z + Math.cos(y) * 2.4;
    var s = st.saque.filter(function (x) { return x.solto && dist(x.x, x.z, ax, az) < 1; })[0];
    if (s) { st.saque = st.saque.filter(function (x) { return x !== s; }); } else {
      st.saqueN = (st.saqueN || 0) + 1;
      s = { id: 'sq' + st.saqueN, x: ax, z: az, itens: {}, solto: true };
    }
    s.itens[item] = (s.itens[item] || 0) + k; s.ate = st.t + (C.dura || 300);
    st.saque.push(s);
    while (st.saque.length > (C.max || 30)) { st.saque.shift(); }
    this.emit(st, { type: 'saque' });
    var msg = 'Soltou ' + (k === 1 ? def.name : k + ' ' + (def.plural || def.name)).toLowerCase() + ' no chão.';
    this.log(st, msg);
    return msg;
  };
  Sim.prototype.saqueDe = function (st, id) { return (st.saque || []).filter(function (s) { return s.id === id; })[0] || null; };
  Sim.prototype.macroSaque = function (st, s) {
    var deixa = st.saqueDeixa || {};
    for (var k in s.itens) { var b = (this.w.game.items[k] || {}).base || k; if (!deixa[b]) { this.pegaSaque(st, s.id, k, s.itens[k], true); } } // peça: vale a marca do item base
  };
  // pega n de um item do monte (n vazio = tudo o que houver), até onde a bolsa deixa; devolve o texto para o jogador.
  // longe = já vale a distância (a macro, ao lado do bicho que acabou de abater)
  Sim.prototype.pegaSaque = function (st, id, item, n, longe) {
    var w = this.w, G = w.game, p = st.player, s = this.saqueDe(st, id);
    if (!s || !s.itens[item]) { return 'Não há mais isso aqui.'; }
    if (!longe && dist(p.x, p.z, s.x, s.z) > G.settings.interactRange + 0.5) { return 'Aproxime-se do saque.'; }
    var tem = s.itens[item], quer = Math.min(tem, n === undefined || n === null ? tem : Math.max(1, Math.floor(n)));
    var def = G.items[item], cabe = def.noBag ? quer : Math.max(0, bagCap(w, p) - bagCount(w, p)), k = Math.min(quer, cabe);
    if (!k) { return 'Bolsa cheia: ' + def.name.toLowerCase() + ' ficou no chão.'; }
    this.give(st, item, k);
    s.itens[item] -= k; if (!s.itens[item]) { delete s.itens[item]; }
    if (!Object.keys(s.itens).length) { st.saque = st.saque.filter(function (x) { return x !== s; }); }
    this.emit(st, { type: 'saque' });
    var nome = (k === 1 ? def.name : k + ' ' + (def.plural || def.name)).toLowerCase();
    return k < quer ? 'Pegou ' + nome + '; o resto não coube na bolsa.' : 'Pegou ' + nome + '.';
  };
  Sim.prototype.pegaTudo = function (st, id) {
    var s = this.saqueDe(st, id), msgs = [];
    if (!s) { return 'Não há mais nada aqui.'; }
    var self = this; Object.keys(s.itens).forEach(function (k) { msgs.push(self.pegaSaque(st, id, k)); });
    return msgs.filter(function (m) { return /^Bolsa|resto/.test(m); })[0] || 'Pegou tudo.';
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

  // pedra de amolar: gasta um uso e deixa a espada ou o machado da mão com +mult de dano nos próximos golpes (renova, não soma)
  Sim.prototype.afia = function (st, item) {
    var w = this.w, G = w.game, p = st.player, d = G.items[item], b = d && G.items[d.base || item];
    if (!b || !b.afia || !(p.inv[item] > 0)) { return 'Você não tem essa pedra.'; }
    var arma = p.equip.arma && G.items[p.equip.arma], cls = arma && G.weaponClasses[arma.class];
    if (!arma || arma.quebrada) { return 'Sem arma na mão para afiar.'; }
    if (cls && cls.ranged) { return 'O arco não se afia: só espada e machado.'; }
    var restam = (d.restam || b.usos) - 1, base = d.base || item;
    p.inv[item]--;
    if (restam > 0) { var nid = base + '~u' + restam; variante(G, nid); p.inv[nid] = (p.inv[nid] || 0) + 1; }
    p.afiada = { arma: p.equip.arma, n: b.afia.golpes, mult: b.afia.mult };
    var msg = 'Afiou ' + arma.name.toLowerCase() + ': +' + Math.round(b.afia.mult * 100) + '% de dano nos próximos ' + b.afia.golpes + ' golpes' +
      (restam > 0 ? ' (a pedra ainda tem ' + restam + ' uso' + (restam === 1 ? '' : 's') + ').' : ' (a pedra acabou).');
    this.log(st, msg);
    return msg;
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
    st.mobs.forEach(function (m) { m.fight = false; m.prep = 0; });
    this.stopMacro(st, 'Você desmaiou e foi levado à praça.');
    this.log(st, 'Você desmaiou e acordou na praça.');
    this.emit(st, { type: 'faint' });
  };

  // ---------- gente da vila ----------
  // onde a pessoa está para a simulação: os parados no posto; quem anda segue a trilha do desenho (a simulação não sabe onde)
  Sim.prototype.personPos = function (st, id) {
    var q = this.w.personById[id];
    return q && q.fixed ? q : null;
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
  // o golpe do bicho que persegue o jogador
  Sim.prototype.hitPlayer = function (st, e, def) {
    var w = this.w, G = w.game, p = st.player;
    var h = this.strike(st, mobStats(def), stats(w, p), G.stances[p.stance].taken);
    p.hp -= h.n; p.combatT = 0; e.atkCd = def.interval; this.recua(st, e);
    this.gastaDefesa(st); // a defesa vestida se gasta a cada golpe recebido
    // veneno: dano por segundo que a armadura não corta; a picada nova renova o tempo, não soma
    if (def.poison && !(p.poison && p.poison.t > def.poison.sec)) {
      if (!p.poison) { this.log(st, 'Envenenado! A poção ou o padre curam.'); }
      p.poison = { dps: Math.max(def.poison.dps, (p.poison && p.poison.dps) || 0), t: def.poison.sec };
    }
    e.face = Math.atan2(p.x - e.x, p.z - e.z);
    this.emit(st, { type: 'hit', who: 'player', n: h.n, crit: h.crit });
    if (p.hp <= 0) { this.faint(st); }
  };
  // golpe com a arma da mão: rola a quebra com a maestria de agora e depois aprende com o uso. A arma quebrada sai da
  // mão e vai para a bolsa (bolsa cheia: cai no chão, à frente)
  Sim.prototype.usaArma = function (st, cls) {
    var w = this.w, G = w.game, p = st.player, id = p.equip.arma, d = id && G.items[id];
    if (!d || d.quebrada) { return false; }
    var quebrou = rnd(st) < chanceQuebra(w, p, id, cls);
    var lv = nivelMaestria(w, p, cls).lv;
    p.maestria = p.maestria || {}; p.maestria[cls] = (p.maestria[cls] || 0) + treino(w, p);
    if (nivelMaestria(w, p, cls).lv > lv) { this.subiuMaestria(st, cls, lv + 1); }
    if (!quebrou) { return false; }
    p.equip.arma = null; p.afiada = null;
    this.quebrou(st, d, pecaId(G, d.base || id, d.q, d.r, 0, true), true);
    // com a macro ligada: para de trabalhar e volta à praça mais próxima (macroTick, fase 'quebrou')
    if (p.mode === 'macro' && p.macro.on) { p.macro.phase = 'quebrou'; p.macro.path = null; p.macro.goal = null; }
    return true;
  };
  Sim.prototype.subiuMaestria = function (st, cls, lv) {
    var G = this.w.game, M = G.maestria, e = efeitoMaestria(G, lv);
    function pc(v) { return (Math.round(v * 10000) / 100).toLocaleString('pt-BR') + '%'; }
    function num1(v) { return (Math.round(v * 100) / 100).toLocaleString('pt-BR'); }
    this.log(st, 'Maestria de ' + G.weaponClasses[cls].name.toLowerCase() + ': nível ' + lv + ' de ' + M.niveis + '. A arma quebra ' + pc(M.corte * e) +
      ' menos, o ritmo é de ' + num1(entre(G.weaponClasses[cls].ritmo, e)) + ' s e o crítico ganha ' + pc(M.critico * e) + ' (' + pc(M.criticoMacro * e) + ' na macro).');
    this.emit(st, { type: 'maestria', cls: cls, lv: lv });
  };
  // cada golpe recebido gasta todas as peças de defesa vestidas (oficina.desgaste); a que chega a zero quebra
  Sim.prototype.gastaDefesa = function (st) {
    var self = this, w = this.w, G = w.game, p = st.player, O = G.oficina, dz = Math.round((O.desgaste || 0) * 10);
    if (!dz) { return; }
    keys(G.equipSlots).forEach(function (sl) {
      var id = p.equip[sl], d = id && G.items[id];
      if (!ehDefesa(d) || d.quebrada) { return; }
      var gasto = d.gasto + dz, base = d.base || id;
      if (gasto < d.durMax) { p.equip[sl] = pecaId(G, base, d.q, d.r, gasto, false); variante(G, p.equip[sl]); return; }
      var qid = pecaId(G, base, d.q, d.r, 0, true), bolsa = (O.paraBolsa || []).indexOf(G.equipSlots[sl].type) >= 0;
      if (bolsa) { p.equip[sl] = null; } else { p.equip[sl] = qid; variante(G, qid); }
      self.quebrou(st, d, qid, bolsa);
    });
    p.hp = Math.min(p.hp, maxHp(w, p));
  };
  // a peça quebrou: avisa e, se for o caso, põe a quebrada na bolsa (ou no chão)
  Sim.prototype.quebrou = function (st, d, qid, bolsa) {
    var w = this.w, G = w.game, p = st.player, g = d.g || 'm', art = { m: 'O ', f: 'A ', mp: 'Os ', fp: 'As ' }[g] || 'O ';
    variante(G, qid);
    var nome = art + G.items[inteira(G, qid)].name.toLowerCase() + (g.length > 1 ? ' quebraram' : ' quebrou'), msg;
    if (bolsa) {
      p.inv[qid] = (p.inv[qid] || 0) + 1;
      if (bagCount(w, p) > bagCap(w, p)) { this.solta(st, qid, 1); msg = nome + ' e ' + (g.length > 1 ? 'caíram' : 'caiu') + ' no chão: a bolsa está cheia.'; }
      else { msg = nome + ' e ' + (g.length > 1 ? 'foram' : 'foi') + ' para a bolsa.'; }
    } else { msg = nome + ': não protege mais até ser reparad' + (g.charAt(0) === 'f' ? 'a' : 'o') + (g.length > 1 ? 's' : '') + '.'; }
    msg += d.class ? ' O Ferreiro restaura.' : ' O Ferreiro e o Alfaiate reparam.';
    this.log(st, msg);
    this.emit(st, { type: 'alert', text: msg });
    this.emit(st, { type: 'quebrou', item: qid });
  };
  // persegue e bate. smart: sem linha livre até o jogador, segue o A* (refeito a cada 1,5 s), para contornar as casas
  Sim.prototype.chase = function (st, e, def, dt, smart) {
    var w = this.w, p = st.player, d = dist(e.x, e.z, p.x, p.z);
    // finta: quem tem 'prepara' para esse tempo antes do golpe; quem sair do alcance nesse meio-tempo escapa
    if (e.prep > 0) {
      e.prep -= dt; e.face = Math.atan2(p.x - e.x, p.z - e.z);
      if (e.prep > 1e-6) { return; }
      var sobra = e.prep; e.prep = 0;
      if (d <= def.reach) { this.hitPlayer(st, e, def); if (e.fight) { e.atkCd = def.interval - def.prepara + sobra; } }
      else { e.atkCd = def.interval - def.prepara + sobra; this.recua(st, e); this.emit(st, { type: 'esquiva', id: e.id }); }
      return;
    }
    if (e.atkCd > 0 && !smart && d < def.reach + 3.2) { this.rodeia(e, p, def, dt, d, st); return; }
    if (d <= def.reach) {
      e.path = null;
      if (e.atkCd <= 0) { if (def.prepara) { e.prep = def.prepara; } else { this.hitPlayer(st, e, def); } }
      return;
    }
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
  // o baile, enquanto a barra dele enche: recua depois de atacar (acertando ou não), para, anda dois ou três passos para um lado
  // qualquer em volta do jogador, para, anda de novo... Quando a barra enche, chase vem correndo e ataca
  Sim.prototype.rodeia = function (e, p, def, dt, d, st) {
    var B = e.baile;
    if (!B || (B.t -= dt) < 1e-6) {
      // depois de andar ou recuar, para; depois de parar, anda
      if (!B || B.fase === 'para') {
        B = { fase: 'anda', t: (rnd(st) < 0.5 ? 2 : 3) * 0.2, lado: rnd(st) < 0.5 ? -1 : 1, r: def.reach + 0.8 + rnd(st) * 1.6, v: 0.5 + rnd(st) * 0.3 };
      } else { B = { fase: 'para', t: 0.4 + Math.floor(rnd(st) * 3) * 0.2 }; }
      e.baile = B;
    }
    var a = Math.atan2(e.x - p.x, e.z - p.z);
    if (B.fase === 'recua') {
      this.passo(e, a + B.desvio, def.speed * 0.8 * dt, 0.15, CERCO);
    } else if (B.fase === 'anda') {
      var q = a + B.lado * 0.8, tx = p.x + Math.sin(q) * B.r, tz = p.z + Math.cos(q) * B.r, dd = dist(e.x, e.z, tx, tz);
      if (dd > 0.05 && this.passo(e, Math.atan2(tx - e.x, tz - e.z), Math.min(def.speed * B.v * dt, dd), 0.15, CERCO) === null) { B.lado = -B.lado; }
    }
    e.face = Math.atan2(p.x - e.x, p.z - e.z); // sempre de olho no jogador
  };
  // terminou o ataque: recua um pouco, meio de lado
  Sim.prototype.recua = function (st, e) { e.baile = { fase: 'recua', t: 0.6, desvio: (rnd(st) - 0.5) * 0.9 }; };
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
    var af = p.afiada && p.afiada.n > 0 && p.afiada.arma === s.weapon ? p.afiada : null; // pedra de amolar
    var h = this.strike(st, s, mobStats(def), G.stances[p.stance].dmg * (af ? 1 + af.mult : 1));
    // arco: pode errar ou raspar (weaponClasses → acerto); o ataque gasta e treina do mesmo jeito
    var WC = s.weapon && s.cls ? G.weaponClasses[s.cls] : null, acerto = WC && WC.acerto ? sorteAcerto(st, WC.acerto, maestria(w, p, s.cls), WC.fraco) : 1;
    if (acerto < 1) { h.n = acerto ? Math.max(1, Math.round(h.n * acerto)) : 0; h.crit = h.crit && acerto > 0; }
    if (af) { af.n--; if (!af.n) { p.afiada = null; this.log(st, 'O fio da pedra de amolar acabou.'); } }
    this.useAmmo(st, s);
    if (s.weapon && s.cls) { this.usaArma(st, s.cls); }
    m.fight = true; p.atkCd = p.atkMax = s.interval; p.combatT = 0;
    this.emit(st, { type: 'hit', who: 'mob', id: m.id, x: m.x, z: m.z, n: h.n, crit: h.crit, ranged: s.ranged, raspao: acerto > 0 && acerto < 1, errou: !acerto });
    this.fere(st, m, h.n);
  };
  // tira n de vida do bicho (arma ou magia) e, se ele cair, dá o que é de dar
  Sim.prototype.fere = function (st, m, n) {
    var G = this.w.game, p = st.player, def = G.monsters[m.kind];
    m.hp -= n; m.fight = true;
    if (m.hp <= 0) {
      m.prep = 0;
      m.alive = false; m.fight = false; m.left = def.respawn;
      st.stats.kills++;
      for (var q in st.quests) { if (st.quests[q] === 'active') { st.qkills[q] = st.qkills[q] || {}; st.qkills[q][m.kind] = (st.qkills[q][m.kind] || 0) + 1; } }
      this.log(st, def.name + ' abatido.');
      this.emit(st, { type: 'kill', id: m.id });
      this.gainXp(st, def.xp);
      this.deixaSaque(st, m, def); // fica no chão; a macro pega sozinha o que estiver marcado
      if (p.action && p.action.id === m.id) { p.action = null; }
    }
  };

  // ---------- magias (teste, só no modo desenvolvedor) ----------
  // o que impede a magia agora ('' = nada). O alvo vem de alvoMagia
  Sim.prototype.impedeMagia = function (st, id) {
    var w = this.w, p = st.player, M = w.game.magias, d = M.lista[id], S = st.magias;
    if (!d || !S || !S.on) { return 'As magias ainda não existem neste mundo.'; }
    if (S.limite !== 'mana' && p.magCd[id] > 0) { return d.name + ': espere ' + fmtLeft(p.magCd[id]) + '.'; }
    if (S.limite !== 'espera' && (typeof p.mana === 'number' ? p.mana : manaMax(w, p)) < d.mana) { return 'Mana insuficiente.'; }
    return '';
  };
  // quem recebe: na magia de dano, o bicho marcado; sem marca, o que está lutando mais perto ou o que está à frente
  Sim.prototype.alvoMagia = function (st, id) {
    var w = this.w, p = st.player, d = w.game.magias.lista[id], best = null, bd = 1e9;
    if (d.tipo === 'cura') { return p.hp < maxHp(w, p) ? p : null; }
    function vale(m) { return m && m.alive && dist(p.x, p.z, m.x, m.z) <= d.alcance && w.los(p.x, p.z, m.x, m.z); }
    var marcado = p.action && p.action.type === 'attack' ? this.mobById(st, p.action.id) : null;
    if (vale(marcado)) { return marcado; }
    if (naMacro(p)) { return null; }
    st.mobs.forEach(function (m) {
      if (!vale(m)) { return; }
      var q = dist(p.x, p.z, m.x, m.z), ang = Math.abs(Math.atan2(Math.sin(Math.atan2(m.x - p.x, m.z - p.z) - p.yaw), Math.cos(Math.atan2(m.x - p.x, m.z - p.z) - p.yaw)));
      if (!m.fight && ang > 0.45) { return; }
      if (q < bd) { bd = q; best = m; }
    });
    return best;
  };
  // lança: devolve '' se saiu (inteira, fraca ou falhada) ou o motivo de não ter tentado. A tentativa gasta e treina sempre
  Sim.prototype.lanca = function (st, id) {
    var w = this.w, p = st.player, G = w.game, M = G.magias, d = M.lista[id], motivo = this.impedeMagia(st, id);
    if (motivo) { return motivo; }
    var alvo = this.alvoMagia(st, id);
    if (!alvo) { return d.tipo === 'cura' ? 'Você já está com a vida cheia.' : 'Nenhum alvo à vista.'; }
    if (typeof p.mana !== 'number') { p.mana = manaMax(w, p); }
    if (st.magias.limite !== 'espera') { p.mana -= d.mana; }
    if (st.magias.limite !== 'mana') { p.magCd[id] = d.espera; }
    var f = sorteAcerto(st, M.acerto, proficiencia(w, p, id), M.fraco), lv = nivelMagia(w, p, id).lv, v = d.dmg || d.cura, n = 0;
    p.prof[id] = (p.prof[id] || 0) + treino(w, p);
    if (f) { n = Math.max(1, Math.round(entre(v, rnd(st)) * f * (d.tipo === 'dano' ? 1 - armorCut(w, mobStats(G.monsters[alvo.kind]).def) : 1))); }
    if (d.tipo === 'cura') { n = Math.min(n, Math.max(0, Math.ceil(maxHp(w, p) - p.hp))); p.hp = Math.min(maxHp(w, p), p.hp + n); }
    this.emit(st, { type: 'magia', id: id, alvo: d.tipo === 'dano' ? alvo.id : null, x: alvo.x, z: alvo.z, n: n, fraca: f > 0 && f < 1, falhou: !f });
    if (nivelMagia(w, p, id).lv > lv) {
      var c = chances(M.acerto, proficiencia(w, p, id));
      this.log(st, 'Proficiência em ' + d.name.toLowerCase() + ': nível ' + (lv + 1) + ' de ' + G.maestria.niveis + '. Agora falha ' + Math.round(c.erra * 100) + '% das vezes.');
      this.emit(st, { type: 'proficiencia', id: id, lv: lv + 1 });
    }
    if (d.tipo === 'dano') { p.combatT = 0; alvo.fight = true; this.fere(st, alvo, n); }
    return '';
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
      if (!m.alive || self.w.game.monsters[m.kind].aggro > 0) { return; } // a macro não luta com bicho bravo: foge (macroTick, 'foge')
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
        case 'magia_cura': if (st.magias && st.magias.on && hpPct < r.val && !this.impedeMagia(st, def.magia)) { return { act: 'magia', id: def.magia }; } break;
        case 'magia_ataque': if (st.magias && st.magias.on && !this.impedeMagia(st, def.magia) && this.alvoMagia(st, def.magia)) { return { act: 'magia', id: def.magia }; } break;
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

    // bicho bravo perseguindo: larga tudo, corre para a praça mais próxima, descansa e depois volta ao trabalho
    if ((m.phase === 'run' || m.phase === 'rest') && perseguido(w, st)) {
      m.phase = 'foge'; m.path = null; m.goal = null; p.action = null; st.stats.retreats++;
      this.log(st, 'Bicho bravo por perto: fugindo para a praça.');
    }
    if (m.phase === 'foge') {
      var pf = w.pracaPerto(p.x, p.z);
      p.action = { type: 'travel', label: 'fugindo para a praça' };
      if (this.moveTo(st, pf.x, pf.z + 1.5, 1.2, dt, 'praca')) { m.phase = 'rest'; }
      return;
    }
    if (m.phase === 'rest') {
      p.hp = Math.min(maxHp(w, p), p.hp + G.player.restRegenPerSec * dt);
      p.action = { type: 'rest' };
      if (p.hp >= maxHp(w, p)) { m.phase = 'run'; p.action = null; this.log(st, 'Descansado. Voltando à área.'); }
      return;
    }
    if (m.phase === 'quebrou') { // a arma quebrou: volta à praça mais próxima e para
      var pr = w.pracaPerto(p.x, p.z);
      p.action = { type: 'travel', label: 'arma quebrada, voltando à praça' };
      if (this.moveTo(st, pr.x, pr.z + 1.5, 1.2, dt, 'praca')) { this.stopMacro(st, 'A arma quebrou: conserte ou troque e retome a macro.'); p.action = null; }
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
      case 'magia': this.lanca(st, d.id); return;
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
    if (m.fight && !m.luta) { m.atkCd = def.interval; m.baile = null; } // entrou na luta: a barra começa vazia
    m.luta = m.fight;
    if (m.calm > 0) { m.calm -= dt; }
    var step, d, dx, dz;
    if (def.flee && this.flee(st, m, def, sp, dt)) { return; }
    // bicho bravo (aggro = raio em m): ataca quem chega perto, mas só dentro da sua área (leash) e não logo depois de desistir,
    // senão ficaria preso entre atacar e voltar para casa
    if (!m.fight && def.aggro && !(m.calm > 0) && dist(m.x, m.z, p.x, p.z) <= def.aggro && dist(p.x, p.z, sp.x, sp.z) <= def.leash) { m.fight = m.luta = true; m.wait = 0; m.atkCd = def.interval; m.baile = null; }
    if (m.fight) {
      if (dist(m.x, m.z, sp.x, sp.z) > def.leash || dist(m.x, m.z, p.x, p.z) > def.leash) {
        m.fight = false; m.prep = 0; m.hp = def.hp; m.wx = sp.x; m.wz = sp.z; m.calm = 6; return;
      }
      this.chase(st, m, def, dt, false);
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
    // a luta começa (alvo marcado ou bicho perseguindo): a barra de ação do jogador começa vazia
    var luta = !!(p.action && p.action.type === 'attack') || st.mobs.some(function (m) { return m.alive && m.fight && !G.monsters[m.kind].flee && dist(m.x, m.z, p.x, p.z) < 16; });
    if (luta && !p.luta) { p.atkMax = stats(w, p).interval; p.atkCd = Math.max(p.atkCd, p.atkMax); }
    p.luta = luta;
    if (st.magias && st.magias.on) {
      var mm = manaMax(w, p); p.mana = Math.min(mm, (typeof p.mana === 'number' ? p.mana : mm) + G.magias.mana.porSeg * dt);
      for (var mg in p.magCd) { if (p.magCd[mg] > 0) { p.magCd[mg] = Math.max(0, p.magCd[mg] - dt); } }
    }
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
    if (st.saque && st.saque.length && st.saque[0].ate <= st.t) { // o mais velho vem primeiro
      st.saque = st.saque.filter(function (s) { return s.ate > st.t; }); this.emit(st, { type: 'saque' });
    }

    if (p.mode === 'macro' && p.macro.on) { this.macroTick(st, dt); }
    else { this.manualTick(st, dt); }
  };

  // avança 'sec' segundos em silêncio (tempo fora). Devolve quantos segundos rodou.
  Sim.prototype.advance = function (st, sec) {
    var dt = this.w.game.settings.tickSec, n = Math.floor(sec / dt);
    var was = this.quiet; this.quiet = true;
    for (var i = 0; i < n; i++) { this.tick(st); }
    this.quiet = was;
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
    if (s.type === 'heal') {
      var ven = !!p.poison; p.hp = maxHp(w, p); p.poison = null; return ven ? 'Vida restaurada e veneno curado.' : 'Vida restaurada.';
    }
    if (s.type === 'buy') {
      var price = buyPrice(w, p, s.item);
      if ((p.inv.moeda || 0) < price) { return 'Moedas insuficientes.'; }
      p.inv.moeda -= price; p.inv[s.item] = (p.inv[s.item] || 0) + 1; return 'Comprou ' + G.items[s.item].name.toLowerCase() + '.';
    }
    if (s.type === 'shop') { return this.buyItem(st, s, arg.item, arg.n, arg.equip); }
    if (s.type === 'oficina') { return this.conserta(st, s, arg.id, arg.slot); }
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
    var livre = s.items.indexOf(item) >= 0, e = livre ? null : this.estoque(st, s); // consumível ou do estoque do dia
    if (!def || (!livre && !(e.itens[item] > 0))) { return 'Isso não se compra aqui.'; }
    if (def.tool && p.inv[item] > 0) { return 'Você já tem ' + def.name.toLowerCase() + ': uma basta.'; } // ferramenta não gasta
    n = Math.floor(+n || 0);
    if (n < 1) { return 'Escolha quantos comprar.'; }
    if (!livre) { n = Math.min(n, e.itens[item]); } // do estoque, só o que tem
    var lot = (s.lots && s.lots[item]) || 1, units = n * lot, cost = buyPrice(w, p, item, units);
    if ((p.inv.moeda || 0) < cost) { return 'Moedas insuficientes: custa ' + cost + '.'; }
    // o que vai direto para o corpo não ocupa a bolsa, a não ser a peça que sai para dar lugar
    var slot = equip ? this.slotFor(st, item) : null, swap = slot && p.equip[slot] && !G.items[p.equip[slot]].stack ? 1 : 0;
    var room = def.noBag ? 1e9 : bagCap(w, p) - bagCount(w, p) - swap + (equip ? 1 : 0);
    if (units > room) { return 'Bolsa cheia: libere espaço antes de comprar.'; }
    p.inv.moeda -= cost; p.inv[item] = (p.inv[item] || 0) + units;
    if (!livre) { e.itens[item] -= n; }
    var msg = 'Comprou ' + (units === 1 ? def.name : units + ' ' + (def.plural || def.name)).toLowerCase() + ' por ' + cost + ' moeda' + (cost === 1 ? '' : 's') + '.';
    // munição comprada com o arco na mão e a casa vazia já vai para a aljava
    if (def.stack && !p.equip[def.slot] && p.equip.arma && (G.weaponClasses[G.items[p.equip.arma].class] || {}).ammo === item) { p.equip[def.slot] = item; }
    if (equip) { msg += ' ' + this.equip(st, item); }
    return msg;
  };

  // ---------- oficina (reparar e restaurar) ----------
  // o que este serviço conserta: [{ id, slot (vestida) ou null (bolsa), n, custo, tipo: 'reparar' | 'restaurar' }]
  Sim.prototype.consertos = function (st, s) {
    var w = this.w, G = w.game, p = st.player, out = [];
    function ve(id, slot, n) {
      var d = G.items[id];
      if (!ehPeca(d) || !(n > 0)) { return; }
      var tipo = d.class ? (d.quebrada ? 'restaurar' : null) : (d.quebrada || d.gasto ? 'reparar' : null);
      if (!tipo || !s[tipo]) { return; }
      out.push({ id: id, slot: slot, n: n, custo: custoConserto(w, p, id), tipo: tipo });
    }
    keys(G.equipSlots).forEach(function (sl) { if (p.equip[sl]) { ve(p.equip[sl], sl, 1); } });
    Object.keys(p.inv).forEach(function (k) { ve(k, null, p.inv[k]); });
    return out;
  };
  // conserta uma unidade: a vestida (slot) ou uma da bolsa. A peça volta inteira, com a mesma qualidade e raridade
  Sim.prototype.conserta = function (st, s, id, slot) {
    var w = this.w, G = w.game, p = st.player;
    var c = this.consertos(st, s).filter(function (x) { return x.id === id && (slot ? x.slot === slot : !x.slot); })[0];
    if (!c) { return 'Isso não precisa de conserto aqui.'; }
    if ((p.inv.moeda || 0) < c.custo) { return 'Moedas insuficientes: custa ' + c.custo + '.'; }
    var novo = inteira(G, id);
    p.inv.moeda -= c.custo;
    if (slot) { p.equip[slot] = novo; } else { p.inv[id]--; p.inv[novo] = (p.inv[novo] || 0) + 1; }
    p.hp = Math.min(p.hp, maxHp(w, p));
    return (c.tipo === 'restaurar' ? 'Restaurou ' : 'Reparou ') + G.items[novo].name.toLowerCase() + ' por ' + c.custo + ' moeda' + (c.custo === 1 ? '' : 's') + '.';
  };

  // ---------- estoque das lojas (game.json → lojas) ----------
  // st.lojas[npc] = { dia, itens: { id: quantos } }: as peças fixas e as rotativas do dia, e os únicos que apareceram.
  // O dia é o das missões diárias (st.daily.day, que a interface acerta pelo relógio); dia novo, estoque novo.
  // Os consumíveis (s.items) ficam fora: sempre à venda, sem limite
  Sim.prototype.estoque = function (st, s) {
    var G = this.w.game, L = G.lojas, dia = (st.daily && st.daily.day) || '-', k = s.npc || '?';
    st.lojas = st.lojas || {};
    var e = st.lojas[k];
    if (e && e.dia === dia) { return e; }
    var N = L.niveis[s.nivel || 'comum'] || L.niveis.comum, it = {};
    (s.fixos || []).forEach(function (b) { it[b] = 1; });
    (s.rotativos || []).forEach(function (b) {
      for (var n = sorteia(st, L.quantidade); n > 0; n--) { var id = novaPeca(G, st, b, N.qualidade, N.raridade); it[id] = (it[id] || 0) + 1; }
    });
    (s.unicos || []).forEach(function (u) { if (rnd(st) < u.chance) { it[u.item] = 1; } });
    st.lojas[k] = e = { dia: dia, itens: it };
    return e;
  };
  // o que a loja tem agora: [{ item, n }] (n null = sem limite), consumíveis primeiro
  Sim.prototype.vitrine = function (st, s) {
    var e = this.estoque(st, s), out = (s.items || []).map(function (k) { return { item: k, n: null }; });
    Object.keys(e.itens).forEach(function (k) { if (e.itens[k] > 0) { out.push({ item: k, n: e.itens[k] }); } });
    return out;
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
    if (def.quebrada && def.class) { return 'Arma quebrada não se empunha: o Ferreiro restaura.'; }
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
    var d = this.w.game.items[item]; if (d && d.quebrada) { return 0; } // quebrada não se vende: só consertando
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
    if (!def || s.items.indexOf(def.base || item) < 0) { return 'Isso não se vende aqui.'; }
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
    for (var k in (r.items || {})) { variante(G, k); p.inv[k] = (p.inv[k] || 0) + r.items[k]; } // pode ser uma peça com marca (espada_aco~5~2)
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
  var FORMATO_SAVE = 3;
  var MIGRACOES = {
    // exemplo: 1: function (st) { st.player.bolsa = st.player.inv; delete st.player.inv; }
    // 2: peças com qualidade, raridade e desgaste no id (espada_aco~5~3). Nada a converter: o formato novo só impede que uma
    // versão velha do jogo, em outro aparelho, abra o save e apague as peças que não conhece
    1: function () {},
    // 3: a maestria virou níveis e recomeça do zero para todos
    2: function (st) { if (st.player) { st.player.maestria = {}; } }
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
    if (!Array.isArray(st.saque)) { st.saque = []; }
    if (!st.saqueDeixa || typeof st.saqueDeixa !== 'object') { st.saqueDeixa = {}; }
    return st;
  };
  // saves de antes do equipamento: a espada da melhoria (p.weapon 0, 1 ou 2) vira a espada equivalente (legacyWeapons),
  // e os níveis já ganhos dão os pontos de atributo que teriam dado. Precisa de game.json, por isso roda em settle
  NZ.migrateGear = function (G, st) {
    var p = st.player, k;
    registraVariantes(G, st); // as peças com qualidade e raridade precisam da ficha antes de conferir as casas
    if (!p.maestria || typeof p.maestria !== 'object') { p.maestria = {}; } // maestria: usos por classe de arma
    if (p.afiada === undefined) { p.afiada = null; }
    if (!p.prof || typeof p.prof !== 'object') { p.prof = {}; } // tentativas por magia
    if (!p.magCd || typeof p.magCd !== 'object') { p.magCd = {}; }
    if (p.mana === undefined) { p.mana = null; }
    if (!st.magias || typeof st.magias !== 'object') { st.magias = { on: false }; }
    if (st.magias.v !== 2) { st.magias.v = 2; st.magias.limite = G.magias.limite; } // por enquanto, só o tempo de espera
    if (!st.lojas || typeof st.lojas !== 'object') { st.lojas = {}; }
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
      if (st.rules.some(function (r) { return r.id === id; })) { return; }
      var nova = { id: id, on: true, val: G.macro.rules[id].val }, antes = G.macro.rules[id].antes, i = -1; // 'antes': a regra nova entra antes daquela
      st.rules.forEach(function (r, j) { if (r.id === antes) { i = j; } });
      if (i >= 0) { st.rules.splice(i, 0, nova); } else { st.rules.push(nova); }
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
    // a briga com os moradores saiu do jogo: saves antigos perdem a briga, os feridos e os mortos (quem morreu volta;
    // o nome de quem já tinha substituto fica, em st.nomes)
    delete st.gente; delete st.hostil; delete st.mortos; delete st.trocas;
    if (p.action && p.action.type === 'luta') { p.action = null; }
    if (!world.free(p.x, p.z, 0.3)) {
      var f = world.nearestFree(p.x, p.z) || { x: world.plaza.x, z: world.plaza.z + 1 }, S = world.salaDe(f.x, f.z);
      // preso numa parede de construção com sala (a planta mudou): sai pela porta, em vez de aparecer lá dentro
      if (S && !world.salaEm(p.x, p.z)) { f = world.nearestFree(S.fora.x, S.fora.z) || f; }
      p.x = f.x; p.z = f.z; m.path = null; m.goal = null;
    }
    st.nomes = st.nomes || {};
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
    perseguido: perseguido, potionHeal: potionHeal, gatherSec: gatherSec, ehPeca: ehPeca, variante: variante, varId: varId, registraVariantes: registraVariantes,
    novaPeca: novaPeca, maestria: maestria, nivelMaestria: nivelMaestria, custoMaestria: custoMaestria, efeitoMaestria: efeitoMaestria, critMaestria: critMaestria, ritmo: ritmo, chances: chances, nivelMagia: nivelMagia, proficiencia: proficiencia, manaMax: manaMax, chanceQuebra: chanceQuebra, ehDefesa: ehDefesa, durabilidade: durabilidade, custoConserto: custoConserto, inteira: inteira, pecaId: pecaId, keys: keys, dist: dist, nodePoint: nodePoint, nodeDist: nodeDist, fmtLeft: fmtLeft };
})(window.NZ = window.NZ || {});
