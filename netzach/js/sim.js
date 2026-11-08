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

  // ---------- mundo estático (montado a partir de vila.json) ----------
  function World(game, vila) {
    this.game = game; this.vila = vila;
    var B = this.B = vila.bounds, N = this.N = B * 2;
    this.grid = new Uint8Array(N * N);
    var self = this, i;

    // borda do mundo
    for (i = 0; i < N; i++) { this.grid[i] = 1; this.grid[(N - 1) * N + i] = 1; this.grid[i * N] = 1; this.grid[i * N + N - 1] = 1; }

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

    // recursos: centralizados na célula, que fica bloqueada
    this.nodes = [];
    vila.trees.forEach(function (p, k) { self.addNode('arvore', 'arv' + k, p); self.nodes[self.nodes.length - 1].s = p[2] || 0; }); // p[2]: escala da figura (0 = a de sempre)
    vila.rocks.forEach(function (p, k) { self.addNode('veio', 'veio' + k, p); });
    this.nodeById = {};
    this.nodes.forEach(function (n) { self.nodeById[n.id] = n; });

    this.spawns = vila.rabbits.map(function (p) { return { x: p[0] + 0.5, z: p[1] + 0.5 }; });
    // pessoa da planta sem ficha em game.json (o alfaiate antes de ganhar loja): entra com uma ficha mínima, sem serviços
    game.npcs = game.npcs || {};
    vila.npcs.forEach(function (n) { if (!game.npcs[n.id]) { game.npcs[n.id] = { name: n.name || n.id, idle: 'Bom dia.', services: [] }; } });
    this.npcs = vila.npcs.map(function (n) { self.block(n.x, n.z); return { id: n.id, x: n.x, z: n.z }; });

    // objetos fixos do cenário: w x d em metros é a pegada no mundo, centrada em (x, z); h é a altura para o clique
    this.props = (vila.props || []).map(function (p) {
      for (var x = Math.floor(p.x - p.w / 2); x < Math.ceil(p.x + p.w / 2); x++) {
        for (var z = Math.floor(p.z - p.d / 2); z < Math.ceil(p.z + p.d / 2); z++) { self.block(x, z); }
      }
      return { id: p.id, name: p.name, npc: p.npc, x: p.x, z: p.z, w: p.w, d: p.d, h: p.h, rot: p.rot || 0 };
    });
    this.plaza = vila.plaza;
  }
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
      v: 1, mapa: 3, seed: seed | 0, t: 0,
      player: {
        name: '', x: sp.x, z: sp.z, yaw: Math.PI, hp: G.player.hpBase, lv: 1, xp: 0, rep: 0,
        inv: JSON.parse(JSON.stringify(G.player.startItems)), weapon: 0, stance: 'ofensiva',
        potCd: 0, atkCd: 0, combatT: 99, action: null, goto: null,
        mode: 'manual', mapNav: 'caminhada', // mapNav: o que o clique no mapa faz por padrão ('caminhada' ou 'macro')
        macro: { area: null, on: false, phase: 'idle', stop: '', path: null, goal: null, repath: 0 }
      },
      rules: G.macro.defaultOrder.map(function (id) { return { id: id, on: true, val: G.macro.rules[id].val }; }),
      nodes: {}, mobs: [],
      stats: { kills: 0, items: {}, potions: 0, xp: 0, retreats: 0, faints: 0 },
      quests: {}, qkills: {}, flags: {}, daily: { day: '', q: {} },
      log: []
    };
    world.nodes.forEach(function (n) { st.nodes[n.id] = { alive: true, left: 0 }; });
    world.spawns.forEach(function (s, i) {
      st.mobs.push({ id: 'coelho' + i, kind: 'coelho', sp: i, x: s.x, z: s.z, hp: G.monsters.coelho.hp, alive: true, left: 0,
        fight: false, wx: s.x, wz: s.z, wait: 0, atkCd: 0, face: 0 });
    });
    return st;
  }

  // ---------- contas derivadas ----------
  function maxHp(w, p) { return w.game.player.hpBase + (p.lv - 1) * w.game.player.hpPerLv; }
  function atk(w, p) { return w.game.player.atkBase + (p.lv - 1) * w.game.player.atkPerLv + w.game.weapon[p.weapon].atk; }
  function bagCount(w, p) {
    var n = 0; for (var k in p.inv) { if (!(w.game.items[k] && w.game.items[k].noBag)) { n += p.inv[k]; } } return n;
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
    if (!(def && def.noBag) && bagCount(w, p) + n > w.game.settings.bagCapacity) {
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

  Sim.prototype.gainXp = function (st, n) {
    var w = this.w, p = st.player; p.xp += n; st.stats.xp += n;
    var need = p.lv * w.game.player.xpPerLevel;
    while (p.xp >= need) {
      p.xp -= need; var before = maxHp(w, p); p.lv++;
      p.hp += maxHp(w, p) - before;
      this.log(st, 'Subiu para o nível ' + p.lv + '.');
      this.emit(st, { type: 'level' });
      need = p.lv * w.game.player.xpPerLevel;
    }
  };

  Sim.prototype.drink = function (st) {
    var w = this.w, p = st.player;
    if (!(p.inv.pocao > 0) || p.potCd > 0) { return false; }
    var mh = maxHp(w, p);
    if (p.hp >= mh) { return false; }
    p.inv.pocao--; p.potCd = w.game.player.potionCooldown;
    p.hp = Math.min(mh, p.hp + w.game.player.potionHeal);
    st.stats.potions++;
    this.log(st, 'Bebeu uma poção.');
    this.emit(st, { type: 'potion' });
    return true;
  };

  Sim.prototype.faint = function (st) {
    var w = this.w, p = st.player, pl = w.plaza;
    p.x = pl.x; p.z = pl.z + 1; p.hp = Math.round(maxHp(w, p) * w.game.player.faintHpFrac);
    p.action = null; p.goto = null; st.stats.faints++;
    st.mobs.forEach(function (m) { m.fight = false; });
    this.stopMacro(st, 'Você desmaiou e foi levado à praça.');
    this.log(st, 'Você desmaiou e acordou na praça.');
    this.emit(st, { type: 'faint' });
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

  // golpe do jogador
  Sim.prototype.swing = function (st, m) {
    var w = this.w, p = st.player, G = w.game, def = G.monsters[m.kind];
    var raw = atk(w, p) * G.stances[p.stance].dmg - def.def;
    var dmg = Math.max(1, Math.round(raw * (0.85 + rnd(st) * 0.3)));
    m.hp -= dmg; m.fight = true; p.atkCd = G.player.atkInterval; p.combatT = 0;
    this.emit(st, { type: 'hit', who: 'mob', id: m.id, x: m.x, z: m.z, n: dmg });
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
    this.log(st, def.name + ': coleta concluída.');
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
    var w = this.w, p = st.player, m = p.macro, spd = w.game.player.moveSpeed;
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
  Sim.prototype.nearestNode = function (st, kind) {
    var p = st.player, best = null, bd = 1e9, self = this;
    this.w.nodes.forEach(function (n) {
      if (n.kind !== kind || !st.nodes[n.id].alive || !self.inArea(st, n.x, n.z)) { return; }
      var d = dist(p.x, p.z, n.x, n.z); if (d < bd) { bd = d; best = n; }
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
        case 'bag_full': if (bagCount(w, p) >= G.settings.bagCapacity) { return { act: 'retreat_stop' }; } break;
        case 'mob_in_area': {
          var cur = p.action && p.action.type === 'attack' ? this.mobById(st, p.action.id) : null;
          var mob = (cur && cur.alive) ? cur : this.nearestMob(st);
          if (mob) { return { act: 'attack', id: mob.id }; }
          break;
        }
        case 'node_in_area': {
          var c = p.action && p.action.type === 'gather' ? w.nodeById[p.action.id] : null;
          if (c && c.kind === def.kind && st.nodes[c.id].alive) { return { act: 'gather', id: c.id }; }
          var n = this.nearestNode(st, def.kind);
          if (n) { return { act: 'gather', id: n.id }; }
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
        var reach = G.player.reach;
        if (this.moveTo(st, mob.x, mob.z, reach * 0.9, dt, mob.id)) {
          this.face(st, mob.x, mob.z);
          if (p.atkCd <= 0) { this.swing(st, mob); }
        }
        return;
      }
      case 'gather': {
        var n = w.nodeById[d.id];
        if (!p.action || p.action.type !== 'gather' || p.action.id !== n.id) { p.action = { type: 'gather', id: n.id, prog: 0 }; }
        if (this.moveTo(st, n.x, n.z, 1.5, dt, n.id)) {
          this.face(st, n.x, n.z);
          p.action.prog += dt;
          if (p.action.prog >= G.nodes[n.kind].gatherSec) { this.finishGather(st, n); p.action = null; }
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
      if (dist(p.x, p.z, n.x, n.z) > G.player.reach + 0.6) { p.action = null; this.log(st, 'Longe demais para coletar.'); return; }
      a.prog += dt;
      if (a.prog >= G.nodes[n.kind].gatherSec) { this.finishGather(st, n); p.action = null; }
    } else if (a.type === 'attack') {
      var m = this.mobById(st, a.id);
      if (!m || !m.alive) { p.action = null; return; }
      var d = dist(p.x, p.z, m.x, m.z);
      if (d > 14) { p.action = null; return; }
      if (d <= G.player.reach && p.atkCd <= 0) { this.swing(st, m); }
    } else {
      p.action = null; // descanso/espera/viagem só existem dentro da macro
    }
  };

  Sim.prototype.mobTick = function (st, m, dt) {
    var w = this.w, G = w.game, def = G.monsters[m.kind], p = st.player, sp = w.spawns[m.sp];
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
    var step, d, dx, dz;
    if (m.fight) {
      if (dist(m.x, m.z, sp.x, sp.z) > def.leash || dist(m.x, m.z, p.x, p.z) > def.leash) {
        m.fight = false; m.hp = def.hp; m.wx = sp.x; m.wz = sp.z; return;
      }
      d = dist(m.x, m.z, p.x, p.z);
      if (d > def.reach) {
        step = Math.min(def.speed * dt, d - def.reach * 0.9);
        dx = (p.x - m.x) / d * step; dz = (p.z - m.z) / d * step;
        if (w.free(m.x + dx, m.z + dz, 0.15)) { m.x += dx; m.z += dz; }
        m.face = Math.atan2(p.x - m.x, p.z - m.z);
      } else if (m.atkCd <= 0) {
        var raw = (def.atk - G.player.defBase) * G.stances[p.stance].taken;
        var dmg = Math.max(1, Math.round(raw * (0.85 + rnd(st) * 0.3)));
        p.hp -= dmg; p.combatT = 0; m.atkCd = def.interval;
        m.face = Math.atan2(p.x - m.x, p.z - m.z);
        this.emit(st, { type: 'hit', who: 'player', n: dmg });
        if (p.hp <= 0) { this.faint(st); }
      }
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

  Sim.prototype.tick = function (st) {
    var w = this.w, G = w.game, dt = G.settings.tickSec, p = st.player;
    st.t += dt;
    p.potCd = Math.max(0, p.potCd - dt);
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.combatT += dt;
    if (p.combatT > G.player.regenDelaySec) { p.hp = Math.min(maxHp(w, p), p.hp + G.player.regenPerSec * dt); }

    // recursos voltam
    // pela lista fixa do mundo, não por for-in no save: com centenas de árvores, o recálculo do tempo fora pesa
    for (var k = 0, nd = w.nodes; k < nd.length; k++) {
      var ns = st.nodes[nd[k].id];
      if (!ns.alive) { ns.left -= dt; if (ns.left <= 0) { ns.alive = true; this.emit(st, { type: 'regrow', id: nd[k].id }); } }
    }
    for (var i = 0; i < st.mobs.length; i++) { this.mobTick(st, st.mobs[i], dt); }

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
    var p = st.player, r = this.w.game.settings.interactRange + 0.5;
    return this.w.npcs.concat(this.w.props).some(function (x) { return (x.id === id || x.npc === id) && dist(p.x, p.z, x.x, x.z) <= r; });
  };
  Sim.prototype.service = function (st, npc, s, arg) {
    var w = this.w, G = w.game, p = st.player;
    if (!this.nearNpc(st, npc)) { return 'Aproxime-se primeiro.'; }
    if (s.type === 'heal') {
      p.hp = maxHp(w, p); return 'Vida restaurada.';
    }
    if (s.type === 'buy') {
      var price = G.items[s.item].price;
      if ((p.inv.moeda || 0) < price) { return 'Moedas insuficientes.'; }
      p.inv.moeda -= price; p.inv[s.item] = (p.inv[s.item] || 0) + 1; return 'Comprou ' + G.items[s.item].name.toLowerCase() + '.';
    }
    if (s.type === 'sell' && arg && arg.item) { return this.sellItem(st, s, arg.item, arg.n); }
    if (s.type === 'deliver') { return this.dailyPut(st, arg.item, arg.n); }
    if (s.type === 'sell') {
      var total = 0;
      var self = this, kept = 0;
      s.items.forEach(function (k) {
        var keep = Math.min(p.inv[k] || 0, self.reserved(st, k)), n = (p.inv[k] || 0) - keep;
        kept += keep;
        if (n > 0) { total += n * G.items[k].price; p.inv[k] = keep; }
      });
      if (!total) { return kept ? 'Nada para vender: o que você tem está guardado para missões.' : 'Nada para vender aqui.'; }
      if (kept) { p.inv.moeda = (p.inv.moeda || 0) + total; return 'Vendeu por ' + total + ' moedas (guardou o que as missões pedem).'; }
      p.inv.moeda = (p.inv.moeda || 0) + total; return 'Vendeu tudo por ' + total + ' moedas.';
    }
    if (s.type === 'upgrade') {
      var next = G.weapon[p.weapon + 1];
      if (!next) { return 'Sua espada já está no máximo deste protótipo.'; }
      for (var k in next.cost) { if ((p.inv[k] || 0) < next.cost[k]) { return 'Faltam materiais.'; } }
      for (k in next.cost) { p.inv[k] -= next.cost[k]; }
      p.weapon++; return 'Agora você tem: ' + next.name + '.';
    }
    return '';
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
      var r = self.dailyReward(id, got);
      p.inv.moeda = (p.inv.moeda || 0) + r.moedas; p.rep += r.rp;
      self.gainXp(st, r.xp);
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
  // recompensa de n peças da missão, arredondada; sem n, a da missão inteira, que é a que o quadro mostra
  Sim.prototype.dailyReward = function (id, n) {
    var D = this.w.game.daily, Q = D.quests[id], W = D.reward; n = n || Q.n;
    return { moedas: Math.round(n * W.ouroPorPeca[Q.item]), xp: Math.round(n * W.xpPorPeca), rp: Math.round(n * W.rpPorPeca) };
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
    var r = this.dailyReward(id);
    q.state = 'done'; p.inv.moeda = (p.inv.moeda || 0) + r.moedas; p.rep += r.rp;
    this.gainXp(st, r.xp);
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
    var total = n * def.price;
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
  // saves antigos ganham os campos novos
  NZ.migrate = function (st) {
    st.quests = st.quests || {}; st.qkills = st.qkills || {}; st.flags = st.flags || {};
    st.daily = st.daily || { day: '', q: {} };
    if (typeof st.player.rep !== 'number') { st.player.rep = 0; }
    if (typeof st.player.name !== 'string') { st.player.name = ''; }
    if (st.player.goto === undefined) { st.player.goto = null; }
    if (st.player.mapNav !== 'macro') { st.player.mapNav = 'caminhada'; }
    return st;
  };

  // acerta um save com o mapa atual (st.mapa: 2 = a cidade cercada, 3 = a vila aberta com floresta, pedregal e campina).
  // Recursos e coelhos seguem a lista da planta: o que é novo nasce vivo, o que sumiu sai do save. Save de mapa antigo:
  // coelhos voltam à toca e a área da macro, se não tiver mais nada para colher, vai para o recurso mais perto.
  // Em qualquer save, quem parou dentro de algo sai para a célula livre mais perto.
  NZ.settle = function (world, st) {
    var p = st.player, m = p.macro, G = world.game, ids = {};
    world.nodes.forEach(function (n) { ids[n.id] = 1; if (!st.nodes[n.id]) { st.nodes[n.id] = { alive: true, left: 0 }; } });
    Object.keys(st.nodes).forEach(function (id) { if (!ids[id]) { delete st.nodes[id]; } });
    if (p.action && p.action.type === 'gather' && !ids[p.action.id]) { p.action = null; }
    st.mobs = st.mobs.filter(function (b) { return b.kind !== 'coelho' || b.sp < world.spawns.length; });
    world.spawns.forEach(function (s, i) {
      if (st.mobs.some(function (b) { return b.kind === 'coelho' && b.sp === i; })) { return; }
      st.mobs.push({ id: 'coelho' + i, kind: 'coelho', sp: i, x: s.x, z: s.z, hp: G.monsters.coelho.hp, alive: true, left: 0,
        fight: false, wx: s.x, wz: s.z, wait: 0, atkCd: 0, face: 0 });
    });
    if (!(st.mapa >= 3)) {
      st.mapa = 3;
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
    if (!world.free(p.x, p.z, 0.3)) {
      var f = world.nearestFree(p.x, p.z) || { x: world.plaza.x, z: world.plaza.z + 1 };
      p.x = f.x; p.z = f.z; m.path = null; m.goal = null;
    }
    return st;
  };

  NZ.World = World;
  NZ.Sim = Sim;
  NZ.newState = newState;
  NZ.calc = { maxHp: maxHp, atk: atk, bagCount: bagCount, dist: dist };
})(window.NZ = window.NZ || {});
