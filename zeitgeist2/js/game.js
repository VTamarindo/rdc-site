/* Lógica do jogo (sem DOM): movimento, combate automático em tempo real, coleta, quests e save.
   Todo o conteúdo vem de data/game.json e data/map.json. */
(function (ZG) {
  'use strict';

  var SAVE_VERSION = 1;
  var MAX_AWAY = 8 * 3600;           // segundos de ausência que contam (regeneração)
  var PL_R = 0.25, MON_R = 0.3;      // raios de colisão

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function num(v, min, max, def) {
    v = Number(v);
    if (!isFinite(v)) { return def; }
    return v < min ? min : (v > max ? max : v);
  }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  function angDiff(to, from) {
    var d = to - from;
    while (d > Math.PI) { d -= 2 * Math.PI; }
    while (d < -Math.PI) { d += 2 * Math.PI; }
    return d;
  }
  function normA(a) { var T = Math.PI * 2; a %= T; return a < 0 ? a + T : a; }
  function snap90(a) { return normA(Math.round(a / (Math.PI / 2)) * (Math.PI / 2)); }

  /* hooks: { say(msg, kind), fx(name), talk(dialog), opts: { diag: bool, turnFirst: bool } }
     diag: anda nas 8 direções (mapa visto de cima); turnFirst: gira antes de andar (primeira pessoa em grade) */
  function Game(data, map, hooks) {
    this.D = data;
    this.opts = (hooks && hooks.opts) || {};
    this.map = map;
    this.hooks = hooks || {};
    this.w = map.w; this.h = map.h;
    this.baseGrid = new Uint8Array(map.w * map.h);
    for (var y = 0; y < map.h; y++) {
      for (var x = 0; x < map.w; x++) { this.baseGrid[y * map.w + x] = map.grid[y].charCodeAt(x) - 48; }
    }
    this.grid = new Uint8Array(this.baseGrid);
    this.initState();
  }
  var G = Game.prototype;

  G.say = function (msg, kind) { if (this.hooks.say) { this.hooks.say(msg, kind || 'info'); } };
  G.fx = function (name, arg) { if (this.hooks.fx) { this.hooks.fx(name, arg); } };

  /* ---------- estado ---------- */
  G.initState = function () {
    var sp = this.map.spawn;
    this.pl = { x: sp.x, y: sp.y, a: sp.a, lv: 1, xp: 0, hp: 0, stance: 'ofensiva', atkT: 0, potT: 0, ta: null };
    this.route = null; this.goal = null; this.focus = null; this.seg = false; this.waitT = 0; this.repathT = 0;
    this.auto = false; this.autoT = 0; this.autoStatus = ''; this.resting = false; this.lastAutoMsg = '';
    this.pl.hp = this.maxHp();
    this.inv = { erva: 0, ferro: 0, pocao: 0 };
    this.quests = {};
    this.flags = {};
    this.cur = null;
    this.combatT = 99;
    this.ents = [];
    for (var i = 0; i < this.map.entities.length; i++) {
      var m = this.map.entities[i];
      var e = { type: m.type, id: m.id, x: m.x, y: m.y, hx: m.x, hy: m.y, hp: 0, until: 0, atkT: 0, flash: 0 };
      e.key = m.type + ':' + m.id + ':' + m.x + ',' + m.y;
      if (m.type === 'monster') { e.hp = this.D.monsters[m.id].hp; }
      this.ents.push(e);
    }
    this.grid = new Uint8Array(this.baseGrid);
  };

  G.maxHp = function (lv) { lv = lv || this.pl.lv; return this.D.player.hpBase + this.D.player.hpPerLv * (lv - 1); };
  G.atk = function () { return this.D.player.atkBase + this.D.player.atkPerLv * this.pl.lv; };
  G.def = function () { return this.D.player.defBase + Math.floor(this.pl.lv / 2); };
  G.need = function (lv) { lv = lv || this.pl.lv; return Math.floor(20 * Math.pow(lv, 1.5)); };

  G.applyFlags = function () {
    var doors = this.map.doors || [];
    for (var i = 0; i < doors.length; i++) {
      if (this.flags[doors[i].flag]) { this.grid[doors[i].y * this.w + doors[i].x] = 0; }
    }
  };

  /* ---------- colisão ---------- */
  G.solidCell = function (cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) { return true; }
    return this.grid[cy * this.w + cx] > 0;
  };
  G.blockedBox = function (x, y, r) {
    return this.solidCell(Math.floor(x - r), Math.floor(y - r)) || this.solidCell(Math.floor(x + r), Math.floor(y - r)) ||
      this.solidCell(Math.floor(x - r), Math.floor(y + r)) || this.solidCell(Math.floor(x + r), Math.floor(y + r));
  };
  G.blockedByEnts = function (x, y, self, minD) {
    for (var i = 0; i < this.ents.length; i++) {
      var e = this.ents[i];
      if (e === self) { continue; }
      if (e.type === 'npc' || (e.type === 'monster' && e.hp > 0)) {
        var dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy < minD * minD) { return true; }
      }
    }
    return false;
  };
  G.los = function (ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy);
    var n = Math.ceil(d / 0.2);
    for (var i = 1; i < n; i++) {
      if (this.solidCell(Math.floor(ax + dx * i / n), Math.floor(ay + dy * i / n))) { return false; }
    }
    return true;
  };

  /* ---------- atualização ---------- */
  G.update = function (dt, inp) {
    var P = this.D.player, pl = this.pl, now = Date.now(), i, e;
    if (inp.fwd || inp.strafe || inp.turn) { this.stop(); }
    this.navUpdate(dt);

    pl.a += inp.turn * P.turnSpeed * dt;
    var TAU = Math.PI * 2;
    if (pl.a < 0) { pl.a += TAU; } else if (pl.a >= TAU) { pl.a -= TAU; }
    var dx = Math.cos(pl.a), dy = Math.sin(pl.a);
    var f = inp.fwd, s = inp.strafe;
    if (f && s) { f *= 0.7071; s *= 0.7071; }
    var mx = (dx * f - dy * s) * P.moveSpeed * dt;
    var my = (dy * f + dx * s) * P.moveSpeed * dt;
    if (mx && !this.blockedBox(pl.x + mx, pl.y, PL_R) && !this.blockedByEnts(pl.x + mx, pl.y, null, 0.55)) { pl.x += mx; }
    if (my && !this.blockedBox(pl.x, pl.y + my, PL_R) && !this.blockedByEnts(pl.x, pl.y + my, null, 0.55)) { pl.y += my; }

    if (pl.atkT > 0) { pl.atkT -= dt; }
    if (pl.potT > 0) { pl.potT -= dt; }

    var near = null, nd = 1e9;
    for (i = 0; i < this.ents.length; i++) {
      e = this.ents[i];
      if (e.flash > 0) { e.flash = Math.max(0, e.flash - dt * 4); }
      if (e.type !== 'monster') { continue; }
      var def = this.D.monsters[e.id];
      if (e.hp <= 0) {
        if (now >= e.until) { this.respawn(e); }
        continue;
      }
      var d = dist(e, pl);
      if (d < def.aggro && d > 1.0 && this.los(e.x, e.y, pl.x, pl.y)) {
        this.stepMonster(e, pl.x, pl.y, def.speed * dt);
      } else if (d > def.aggro * 1.6 && dist(e, { x: e.hx, y: e.hy }) > 0.15) {
        this.stepMonster(e, e.hx, e.hy, def.speed * 0.6 * dt);
      }
      if (d <= 1.15) {
        e.atkT -= dt;
        if (e.atkT <= 0) { e.atkT = def.interval; if (this.hitPlayer(e, def)) { return; } }
      } else {
        e.atkT = def.interval * 0.35;
      }
      if (d <= P.reach && d < nd && this.los(pl.x, pl.y, e.x, e.y)) { near = e; nd = d; }
    }

    var fo = this.focus;
    if (fo && fo.hp > 0 && dist(fo, pl) <= P.reach && this.los(pl.x, pl.y, fo.x, fo.y)) { near = fo; }
    if (fo && fo.hp <= 0) { this.focus = null; }
    this.cur = near;
    if (near && this.opts.turnFirst && !this.route && pl.ta === null) {
      var fa = snap90(Math.atan2(near.y - pl.y, near.x - pl.x));
      if (Math.abs(angDiff(fa, pl.a)) > 0.01) { pl.ta = fa; }
    }
    if (this.auto) {
      if (pl.hp < this.maxHp() * 0.35 && this.inv.pocao > 0 && pl.potT <= 0) { this.usePotion(); }
      this.autoT += dt;
      if (this.autoT >= 0.4) { this.autoT = 0; this.autoThink(); }
    }
    if (near) {
      this.combatT = 0;
      if (pl.atkT <= 0) { pl.atkT = P.atkInterval; this.hitMonster(near); }
    } else {
      if (pl.atkT < 0) { pl.atkT = 0; }
      this.combatT += dt;
      if (this.combatT > 3 && pl.hp < this.maxHp()) { pl.hp = Math.min(this.maxHp(), pl.hp + P.regenPerSec * dt); }
    }
  };

  G.stepMonster = function (e, tx, ty, step) {
    var dx = tx - e.x, dy = ty - e.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.001) { return; }
    var mx = dx / d * step, my = dy / d * step;
    if (!this.blockedBox(e.x + mx, e.y, MON_R) && !this.blockedByEnts(e.x + mx, e.y, e, 0.5) && !this.nearPlayer(e.x + mx, e.y)) { e.x += mx; }
    if (!this.blockedBox(e.x, e.y + my, MON_R) && !this.blockedByEnts(e.x, e.y + my, e, 0.5) && !this.nearPlayer(e.x, e.y + my)) { e.y += my; }
  };
  G.nearPlayer = function (x, y) {
    var dx = this.pl.x - x, dy = this.pl.y - y;
    return dx * dx + dy * dy < 0.8 * 0.8;
  };

  G.respawn = function (e) {
    e.hp = this.D.monsters[e.id].hp; e.x = e.hx; e.y = e.hy; e.atkT = 0; e.flash = 0; e.until = 0;
  };

  G.hitPlayer = function (e, def) {
    var st = this.D.stances[this.pl.stance];
    var raw = def.atk * rand(0.8, 1.2) * st.taken - this.def();
    var dmg = Math.max(1, Math.round(raw));
    this.pl.hp -= dmg;
    this.combatT = 0;
    this.say(def.name + ' te acerta (-' + dmg + ').', 'hurt');
    this.fx('hurt');
    if (this.pl.hp <= 0) { this.die(); return true; }
    return false;
  };

  G.hitMonster = function (e) {
    var def = this.D.monsters[e.id], st = this.D.stances[this.pl.stance];
    var raw = (this.atk() + Math.floor(rand(0, 3))) * st.dmg - def.def;
    var dmg = Math.max(1, Math.round(raw));
    e.hp -= dmg;
    e.flash = 1;
    this.say('Você acerta ' + def.name + ' (-' + dmg + ').', 'hit');
    if (e.hp <= 0) { this.killMonster(e, def); }
  };

  G.killMonster = function (e, def) {
    e.hp = 0;
    e.until = Date.now() + def.respawn * 1000;
    this.say('Você derrotou ' + def.name + ' (+' + def.xp + ' XP).', 'good');
    for (var i = 0; i < def.drops.length; i++) {
      var dr = def.drops[i];
      if (Math.random() <= dr.chance) { this.giveItem(dr.item, dr.n); }
    }
    for (var qid in this.quests) {
      if (has(this.quests, qid) && this.quests[qid].s === 'active') {
        var q = this.D.quests[qid];
        for (var j = 0; j < q.objectives.length; j++) {
          var o = q.objectives[j];
          if (o.type === 'kill' && o.target === e.id) { this.quests[qid].k[o.target] = (this.quests[qid].k[o.target] || 0) + 1; }
        }
      }
    }
    this.addXp(def.xp);
    this.checkQuests();
  };

  G.giveItem = function (item, n) {
    this.inv[item] = (this.inv[item] || 0) + n;
    this.say('Você recebeu ' + n + 'x ' + this.D.items[item] + '.', 'good');
  };

  G.addXp = function (x) {
    var pl = this.pl;
    pl.xp += x;
    while (pl.xp >= this.need()) {
      pl.xp -= this.need();
      pl.lv++;
      pl.hp = this.maxHp();
      this.say('Você subiu para o nível ' + pl.lv + '! Vida restaurada.', 'quest');
      this.fx('level');
    }
  };

  G.die = function () {
    var sp = this.map.spawn, pl = this.pl;
    this.say('Você desmaiou... e acordou de volta no porão.', 'hurt');
    this.fx('death');
    pl.x = sp.x; pl.y = sp.y; pl.a = sp.a;
    pl.hp = Math.max(1, Math.round(this.maxHp() * this.D.player.deathHpFrac));
    pl.atkT = 0; pl.ta = null;
    this.route = null; this.goal = null; this.focus = null; this.seg = false; this.resting = false;
    this.combatT = 99;
    for (var i = 0; i < this.ents.length; i++) {
      if (this.ents[i].type === 'monster' && this.ents[i].hp > 0) { this.respawn(this.ents[i]); }
    }
  };

  G.setStance = function (name) {
    if (!has(this.D.stances, name) || this.pl.stance === name) { return; }
    this.pl.stance = name;
    this.say('Postura ' + this.D.stances[name].name.toLowerCase() + '.', 'info');
  };

  G.usePotion = function () {
    var pl = this.pl;
    if (pl.potT > 0) { return; }
    if (this.inv.pocao < 1) { this.say('Você não tem poções.', 'info'); return; }
    if (pl.hp >= this.maxHp()) { this.say('Sua vida já está cheia.', 'info'); return; }
    this.inv.pocao--;
    pl.potT = this.D.player.potionCooldown;
    var before = pl.hp;
    pl.hp = Math.min(this.maxHp(), pl.hp + this.D.player.potionHeal);
    this.say('Você bebe uma poção (+' + Math.round(pl.hp - before) + ' vida).', 'good');
  };

  /* ---------- interação ---------- */
  G.interact = function () {
    var pl = this.pl, now = Date.now(), best = null, bd = 1e9;
    for (var i = 0; i < this.ents.length; i++) {
      var e = this.ents[i];
      if (e.type === 'monster') { continue; }
      if (e.type === 'node' && now < e.until) { continue; }
      var d = dist(e, pl);
      if (d > 1.7) { continue; }
      var ang = Math.atan2(e.y - pl.y, e.x - pl.x) - pl.a;
      while (ang > Math.PI) { ang -= 2 * Math.PI; }
      while (ang < -Math.PI) { ang += 2 * Math.PI; }
      if (d > 0.9 && Math.abs(ang) > 1.0) { continue; }
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) { return null; }
    if (best.type === 'node') { this.collect(best); return { kind: 'node' }; }
    return { kind: 'talk', dialog: this.talk(best.id) };
  };

  /* ---------- quests ---------- */
  G.questAvailable = function (qid, extraDone) {
    var q = this.D.quests[qid];
    if (this.quests[qid]) { return false; }
    if (!q.requires) { return true; }
    return (this.quests[q.requires] && this.quests[q.requires].s === 'done') || (extraDone && extraDone[q.requires]) || false;
  };

  G.talk = function (npcId) {
    var D = this.D, self = this, npc = D.npcs[npcId], pages = [], steps = [], doneNow = {}, qid, q;
    var ids = Object.keys(D.quests);
    var i;
    for (i = 0; i < ids.length; i++) {
      qid = ids[i]; q = D.quests[qid];
      if (q.giver === npcId && this.quests[qid] && this.quests[qid].s === 'ready') {
        pages.push(q.done);
        doneNow[qid] = true;
        steps.push((function (id) { return function () { self.completeQuest(id); }; })(qid));
      }
    }
    for (i = 0; i < ids.length; i++) {
      qid = ids[i]; q = D.quests[qid];
      if (q.giver === npcId && this.questAvailable(qid, doneNow)) {
        pages.push(q.offer);
        steps.push((function (id) { return function () { self.acceptQuest(id); }; })(qid));
        break;
      }
    }
    if (!pages.length) {
      for (i = 0; i < ids.length; i++) {
        qid = ids[i]; q = D.quests[qid];
        if (q.giver === npcId && this.quests[qid] && this.quests[qid].s === 'active') {
          pages.push(q.active + '\n\n' + this.progressText(qid));
          break;
        }
      }
    }
    if (!pages.length) { pages.push(npc.idle); }
    return {
      name: npc.name, pages: pages,
      onClose: function () { for (var k = 0; k < steps.length; k++) { steps[k](); } }
    };
  };

  G.acceptQuest = function (qid) {
    if (this.quests[qid]) { return; }
    this.quests[qid] = { s: 'active', k: {} };
    this.say('Nova missão: ' + this.D.quests[qid].title + '.', 'quest');
    this.checkQuests();
    this.fx('quests');
  };

  G.objDone = function (qid, o) {
    if (o.type === 'kill') { return (this.quests[qid].k[o.target] || 0) >= o.n; }
    return (this.inv[o.item] || 0) >= o.n;
  };
  G.objCount = function (qid, o) {
    var c = o.type === 'kill' ? (this.quests[qid].k[o.target] || 0) : (this.inv[o.item] || 0);
    return Math.min(c, o.n);
  };

  G.checkQuests = function () {
    var changed = false;
    for (var qid in this.quests) {
      if (!has(this.quests, qid)) { continue; }
      var st = this.quests[qid];
      if (st.s === 'done') { continue; }
      var q = this.D.quests[qid], all = true;
      for (var j = 0; j < q.objectives.length; j++) { if (!this.objDone(qid, q.objectives[j])) { all = false; } }
      if (all && st.s === 'active') {
        st.s = 'ready'; changed = true;
        this.say('Missão pronta para entregar: ' + q.title + '.', 'quest');
      } else if (!all && st.s === 'ready') { st.s = 'active'; changed = true; }
    }
    this.fx('quests');
    return changed;
  };

  G.completeQuest = function (qid) {
    var st = this.quests[qid], q = this.D.quests[qid];
    if (!st || st.s !== 'ready') { return; }
    st.s = 'done';
    for (var j = 0; j < q.objectives.length; j++) {
      var o = q.objectives[j];
      if (o.type === 'collect') { this.inv[o.item] = Math.max(0, (this.inv[o.item] || 0) - o.n); }
    }
    this.say('Missão concluída: ' + q.title + ' (+' + q.reward.xp + ' XP).', 'quest');
    for (var item in q.reward.items) { if (has(q.reward.items, item)) { this.giveItem(item, q.reward.items[item]); } }
    if (q.reward.flag) { this.flags[q.reward.flag] = true; this.applyFlags(); this.fx('map'); }
    if (q.reward.message) { this.say(q.reward.message, 'quest'); }
    this.addXp(q.reward.xp);
    this.checkQuests();
  };

  G.objectiveName = function (o) {
    if (o.type === 'kill') { return this.D.monsters[o.target].name; }
    return this.D.items[o.item];
  };

  G.progressText = function (qid) {
    var q = this.D.quests[qid], parts = [];
    for (var j = 0; j < q.objectives.length; j++) {
      var o = q.objectives[j];
      parts.push((o.type === 'kill' ? 'Derrotar ' : 'Coletar ') + this.objectiveName(o) + ' ' + this.objCount(qid, o) + '/' + o.n);
    }
    return parts.join(' · ');
  };

  G.questLines = function () {
    var out = [];
    for (var qid in this.D.quests) {
      if (!has(this.D.quests, qid)) { continue; }
      var st = this.quests[qid];
      if (!st || st.s === 'done') { continue; }
      var q = this.D.quests[qid];
      out.push({ title: q.title, kind: q.kind, ready: st.s === 'ready', text: st.s === 'ready' ? 'Entregar a ' + this.D.npcs[q.giver].name : this.progressText(qid) });
    }
    return out;
  };

  G.collect = function (e) {
    var nd = this.D.nodes[e.id];
    if (Date.now() < e.until) { return false; }
    e.until = Date.now() + nd.respawn * 1000;
    this.say('Você coletou ' + nd.name + '.', 'good');
    this.inv[nd.item] = (this.inv[nd.item] || 0) + 1;
    this.checkQuests();
    return true;
  };

  /* ---------- navegação por clique (caminhos em grade) ---------- */
  G.npcAt = function (cx, cy) {
    for (var i = 0; i < this.ents.length; i++) {
      var e = this.ents[i];
      if (e.type === 'npc' && Math.floor(e.x) === cx && Math.floor(e.y) === cy) { return true; }
    }
    return false;
  };
  G.walkable = function (cx, cy) { return !this.solidCell(cx, cy) && !this.npcAt(cx, cy); };
  G.tileBusy = function (cx, cy) {
    for (var i = 0; i < this.ents.length; i++) {
      var e = this.ents[i];
      if (e.type !== 'monster' || e.hp <= 0) { continue; }
      var dx = e.x - (cx + 0.5), dy = e.y - (cy + 0.5);
      if (dx * dx + dy * dy < 0.6 * 0.6) { return true; }
    }
    return false;
  };
  G.dirs = function () {
    var d4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    return this.opts.diag ? d4.concat([[1, 1], [1, -1], [-1, 1], [-1, -1]]) : d4;
  };
  // Busca em largura a partir do herói; devolve { dist: Int16Array, prev: Int32Array }
  G.flood = function () {
    var w = this.w, n = w * this.h, dist = new Int16Array(n), prev = new Int32Array(n), q = new Int32Array(n), qh = 0, qt = 0;
    for (var i = 0; i < n; i++) { dist[i] = -1; prev[i] = -1; }
    var o = this.origin(), sx = o.x, sy = o.y, s = sy * w + sx, ds = this.dirs();
    if (sx < 0 || sy < 0 || sx >= w || sy >= this.h) { return { dist: dist, prev: prev }; }
    dist[s] = 0; q[qt++] = s;
    while (qh < qt) {
      var c = q[qh++], cx = c % w, cy = (c - cx) / w;
      for (var k = 0; k < ds.length; k++) {
        var nx = cx + ds[k][0], ny = cy + ds[k][1];
        if (!this.walkable(nx, ny)) { continue; }
        if (ds[k][0] && ds[k][1] && (!this.walkable(cx + ds[k][0], cy) || !this.walkable(cx, cy + ds[k][1]))) { continue; }
        var ni = ny * w + nx;
        if (dist[ni] >= 0) { continue; }
        dist[ni] = dist[c] + 1; prev[ni] = c; q[qt++] = ni;
      }
    }
    return { dist: dist, prev: prev };
  };
  // Casas de onde o herói alcança a entidade (vizinhas; na grade só as 4 retas)
  G.entGoalTiles = function (e) {
    var ex = Math.floor(e.x), ey = Math.floor(e.y), out = [], ds = this.dirs();
    for (var k = 0; k < ds.length; k++) { out.push([ex + ds[k][0], ey + ds[k][1]]); }
    if (this.opts.diag && e.type === 'node') { out.push([ex, ey]); }
    return out;
  };
  G.bestOf = function (fl, tiles) {
    var best = -1, bd = 1e9;
    for (var i = 0; i < tiles.length; i++) {
      var x = tiles[i][0], y = tiles[i][1];
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) { continue; }
      var d = fl.dist[y * this.w + x];
      if (d >= 0 && d < bd) { bd = d; best = y * this.w + x; }
    }
    return best < 0 ? null : { i: best, d: bd };
  };
  // Casa de onde partem os caminhos: a casa atual, ou a do passo em andamento (para não cortar quinas)
  G.origin = function () {
    if (this.seg && this.route && this.route.length) { return { x: this.route[0].x, y: this.route[0].y }; }
    return { x: Math.floor(this.pl.x), y: Math.floor(this.pl.y) };
  };
  G.buildRoute = function (fl, idx) {
    var r = [], w = this.w;
    while (idx >= 0 && fl.dist[idx] > 0) { r.unshift({ x: idx % w, y: Math.floor(idx / w) }); idx = fl.prev[idx]; }
    if (this.seg && this.route && this.route.length) { r.unshift(this.route[0]); }
    return r;
  };
  G.stop = function () { this.halt(); this.focus = null; this.pl.ta = null; };
  // Para de seguir o caminho, mas termina o passo em andamento (o herói sempre para no centro de uma casa)
  G.halt = function () {
    if (this.seg && this.route && this.route.length) { this.route = [this.route[0]]; this.goal = { kind: 'step' }; }
    else { this.route = null; this.goal = null; this.keepFacing = false; }
  };
  G.goTo = function (cx, cy) {
    if (!this.walkable(cx, cy)) { return false; }
    var fl = this.flood(), b = this.bestOf(fl, [[cx, cy]]);
    if (!b) { return false; }
    this.goal = { kind: 'tile', x: cx, y: cy }; this.focus = null; this.keepFacing = false;
    this.route = this.buildRoute(fl, b.i); this.waitT = 0;
    if (!this.route.length) { this.route = null; this.goal = null; }
    return true;
  };
  G.goToEnt = function (e) {
    if (!e || (e.type === 'monster' && e.hp <= 0)) { return false; }
    var fl = this.flood(), b = this.bestOf(fl, this.entGoalTiles(e));
    if (!b) { return false; }
    this.goal = { kind: 'ent', e: e, tx: Math.floor(e.x), ty: Math.floor(e.y) }; this.keepFacing = false;
    this.focus = e.type === 'monster' ? e : null;
    this.route = this.buildRoute(fl, b.i); this.waitT = 0; this.repathT = 0;
    if (!this.route.length) { this.route = null; this.arrive(); }
    return true;
  };
  // Um passo de casa (setas / teclado na versão em grade); dir: 0 frente, 1 direita, 2 trás, 3 esquerda
  G.step = function (dir) {
    if (this.route && this.route.length > 1) { return false; }
    if (this.route || this.pl.ta !== null) { return false; }
    var a = snap90(this.pl.a) + dir * Math.PI / 2;
    var cx = Math.floor(this.pl.x) + Math.round(Math.cos(a)), cy = Math.floor(this.pl.y) + Math.round(Math.sin(a));
    if (!this.walkable(cx, cy) || this.tileBusy(cx, cy)) { return false; }
    this.goal = { kind: 'step' }; this.focus = null;
    this.route = [{ x: cx, y: cy }]; this.keepFacing = true;
    return true;
  };
  G.turn = function (dir) {
    var base = this.pl.ta !== null ? this.pl.ta : snap90(this.pl.a);
    this.pl.ta = normA(base + dir * Math.PI / 2);
  };
  G.arrive = function () {
    var g = this.goal, pl = this.pl;
    this.route = null; this.keepFacing = false;
    if (!g || g.kind !== 'ent') { this.goal = null; return; }
    var e = g.e;
    var fa = Math.atan2(e.y - pl.y, e.x - pl.x);
    if (this.opts.turnFirst) { pl.ta = snap90(fa); } else if (Math.abs(e.x - pl.x) + Math.abs(e.y - pl.y) > 0.01) { pl.a = normA(fa); }
    if (e.type === 'monster') { return; }   // a luta é automática; o alvo segue marcado
    this.goal = null;
    if (e.type === 'npc') { if (this.hooks.talk) { this.hooks.talk(this.talk(e.id)); } }
    else if (e.type === 'node') { if (!this.collect(e)) { this.say('Ainda não brotou de novo.', 'info'); } }
  };
  G.navUpdate = function (dt) {
    var pl = this.pl, P = this.D.player;
    if (pl.ta !== null) {
      var d = angDiff(pl.ta, pl.a), st = (this.opts.turnSpeed || 7) * dt;
      if (Math.abs(d) <= st) { pl.a = pl.ta; pl.ta = null; } else { pl.a = normA(pl.a + (d > 0 ? st : -st)); }
    }
    var g = this.goal;
    if (g && g.kind === 'ent' && g.e.type === 'monster') {
      if (g.e.hp <= 0) { this.halt(); this.focus = null; return; }
      this.repathT += dt;
      var mx = Math.floor(g.e.x), my = Math.floor(g.e.y);
      if (!this.seg && this.repathT > 0.5 && (mx !== g.tx || my !== g.ty)) {
        this.repathT = 0;
        if (dist(g.e, pl) > P.reach) { this.goToEnt(g.e); } else { this.route = null; }
        return;
      }
      if (!this.route) { return; }
    }
    if (!this.route) { return; }
    if (this.opts.turnFirst && pl.ta !== null) { return; }
    if (this.auto && this.cur && !this.seg) { return; }          // no automático, para e luta
    var wp = this.route[0], tx = wp.x + 0.5, ty = wp.y + 0.5;
    var dx = tx - pl.x, dy = ty - pl.y, dd = Math.sqrt(dx * dx + dy * dy);
    if (!this.seg) {
      if (!this.walkable(wp.x, wp.y)) { this.retarget(); return; }
      if (this.tileBusy(wp.x, wp.y)) {
        this.waitT += dt;
        if (this.waitT > 1.0) { this.waitT = 0; this.retarget(); }
        return;
      }
      this.waitT = 0;
      if (dd > 0.001) {
        var ang = normA(Math.atan2(dy, dx));
        if (this.opts.turnFirst) {
          if (!this.keepFacing && Math.abs(angDiff(ang, pl.a)) > 0.01) { pl.ta = ang; return; }
        } else { pl.a = ang; }
      }
      this.seg = true;
    }
    var stp = P.moveSpeed * dt;
    if (stp >= dd) {
      pl.x = tx; pl.y = ty; this.seg = false; this.route.shift();
      if (!this.route.length) { this.arrive(); }
    } else { pl.x += dx / dd * stp; pl.y += dy / dd * stp; }
  };
  G.retarget = function () {
    var g = this.goal;
    if (g && g.kind === 'ent') { if (!this.goToEnt(g.e)) { this.route = null; this.goal = null; } }
    else if (g && g.kind === 'tile') { if (!this.goTo(g.x, g.y)) { this.route = null; this.goal = null; } }
    else { this.route = null; this.goal = null; }
  };

  /* ---------- "Seguir sozinho" (piloto automático) ---------- */
  G.setAuto = function (on) {
    this.auto = !!on; this.autoT = 1; this.resting = false; this.lastAutoMsg = '';
    if (!on) { this.autoStatus = ''; if (this.goal && this.goal.auto) { this.stop(); } }
  };
  // Estimativa simples: dá para vencer este monstro com a vida (e poções) de agora?
  G.canBeat = function (def) {
    var st = this.D.stances[this.pl.stance], P = this.D.player;
    var myDps = Math.max(1, (this.atk() + 1) * st.dmg - def.def) / P.atkInterval;
    var hisDps = Math.max(1, def.atk * st.taken - this.def()) / def.interval;
    var hp = this.pl.hp + Math.min(this.inv.pocao, 3) * P.potionHeal * 0.8;
    return (def.hp / myDps) * hisDps < hp * 0.85;
  };
  G.autoSay = function (msg) { if (msg !== this.lastAutoMsg) { this.lastAutoMsg = msg; this.say(msg, 'info'); } };
  G.autoThink = function () {
    var pl = this.pl, mh = this.maxHp();
    if (this.cur) { this.autoStatus = 'Lutando com ' + this.D.monsters[this.cur.id].name + '.'; return; }
    if (this.route) { return; }
    if (pl.hp < mh * 0.5) { this.resting = true; }
    if (this.resting) {
      if (pl.hp >= mh * 0.95) { this.resting = false; }
      else { this.autoStatus = 'Descansando para recuperar a vida.'; return; }
    }
    var c = this.chooseGoal();
    if (!c) { this.autoStatus = 'Nada para fazer agora. Os recursos e monstros voltam com o tempo.'; return; }
    this.autoStatus = c.text;
    if (c.note) { this.autoSay(c.note); }
    if (this.goToEnt(c.e) && this.goal) { this.goal.auto = true; }
  };
  G.chooseGoal = function () {
    var D = this.D, fl = this.flood(), now = Date.now(), self = this, i, j, qid, q;
    var ids = Object.keys(D.quests), note = '';
    function nearest(filter) {
      var best = null, bd = 1e9;
      for (var k = 0; k < self.ents.length; k++) {
        var e = self.ents[k];
        if (!filter(e)) { continue; }
        var b = self.bestOf(fl, self.entGoalTiles(e));
        if (b && b.d < bd) { bd = b.d; best = e; }
      }
      return best;
    }
    function npcEnt(id) { return nearest(function (e) { return e.type === 'npc' && e.id === id; }); }
    for (i = 0; i < ids.length; i++) {
      qid = ids[i];
      if (this.quests[qid] && this.quests[qid].s === 'ready') {
        var g1 = npcEnt(D.quests[qid].giver);
        if (g1) { return { e: g1, text: 'Indo entregar "' + D.quests[qid].title + '".' }; }
      }
    }
    for (i = 0; i < ids.length; i++) {
      qid = ids[i]; q = D.quests[qid];
      if (!this.quests[qid] || this.quests[qid].s !== 'active') { continue; }
      for (j = 0; j < q.objectives.length; j++) {
        var o = q.objectives[j];
        if (this.objDone(qid, o)) { continue; }
        if (o.type === 'kill') {
          var m = nearest(function (e) { return e.type === 'monster' && e.hp > 0 && e.id === o.target; });
          if (m && this.canBeat(D.monsters[o.target])) { return { e: m, text: 'Caçando ' + D.monsters[o.target].name + ' ("' + q.title + '").' }; }
          if (m) { note = D.monsters[o.target].name + ' parece forte demais por enquanto. Vou treinar antes.'; }
        } else {
          var n = nearest(function (e) { return e.type === 'node' && now >= e.until && D.nodes[e.id].item === o.item; });
          if (n) { return { e: n, text: 'Coletando ' + D.nodes[n.id].name + ' ("' + q.title + '").' }; }
        }
      }
    }
    for (i = 0; i < ids.length; i++) {
      qid = ids[i];
      if (this.questAvailable(qid)) {
        var g2 = npcEnt(D.quests[qid].giver);
        if (g2) { return { e: g2, text: 'Indo falar com ' + D.npcs[D.quests[qid].giver].name + '.' }; }
      }
    }
    var t = nearest(function (e) { return e.type === 'monster' && e.hp > 0 && self.canBeat(D.monsters[e.id]); });
    if (t) { return { e: t, text: 'Treinando contra ' + D.monsters[t.id].name + '.', note: note }; }
    if (note) { this.autoSay(note); }
    return null;
  };

  /* ---------- desenho ---------- */
  G.drawList = function (spriteIndex) {
    var list = [], now = Date.now();
    for (var i = 0; i < this.ents.length; i++) {
      var e = this.ents[i], def;
      if (e.type === 'monster') { if (e.hp <= 0) { continue; } def = this.D.monsters[e.id]; }
      else if (e.type === 'npc') { def = this.D.npcs[e.id]; }
      else { if (now < e.until) { continue; } def = this.D.nodes[e.id]; }
      list.push({ x: e.x, y: e.y, tex: spriteIndex[def.sprite], scale: def.scale, flash: e.flash, ref: e });
    }
    return list;
  };

  /* ---------- save ---------- */
  G.serialize = function () {
    var pl = this.pl, ents = {};
    for (var i = 0; i < this.ents.length; i++) {
      var e = this.ents[i];
      if (e.type === 'npc') { continue; }
      ents[e.key] = { hp: e.hp, until: e.until };
    }
    return {
      v: SAVE_VERSION, t: Date.now(),
      pl: { x: pl.x, y: pl.y, a: pl.a, lv: pl.lv, xp: pl.xp, hp: pl.hp, stance: pl.stance },
      inv: this.inv, quests: this.quests, flags: this.flags, ents: ents, auto: this.auto
    };
  };

  // Aceita qualquer objeto (save local ou importado) e valida tudo antes de usar
  G.load = function (raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) { return false; }
    this.initState();
    var pl = this.pl, rp = raw.pl || {}, i, k;
    pl.lv = Math.floor(num(rp.lv, 1, 99, 1));
    pl.xp = Math.floor(num(rp.xp, 0, this.need(pl.lv) - 1, 0));
    pl.hp = num(rp.hp, 1, this.maxHp(), this.maxHp());
    pl.stance = (typeof rp.stance === 'string' && has(this.D.stances, rp.stance)) ? rp.stance : 'ofensiva';
    var px = num(rp.x, 0, this.w, this.map.spawn.x), py = num(rp.y, 0, this.h, this.map.spawn.y);
    pl.a = num(rp.a, 0, Math.PI * 2, 0);

    var items = Object.keys(this.D.items);
    for (i = 0; i < items.length; i++) {
      this.inv[items[i]] = Math.floor(num(raw.inv && raw.inv[items[i]], 0, 99999, 0));
    }
    var flagNames = {};
    var doors = this.map.doors || [];
    for (i = 0; i < doors.length; i++) { flagNames[doors[i].flag] = true; }
    for (k in flagNames) { if (has(flagNames, k) && raw.flags && raw.flags[k] === true) { this.flags[k] = true; } }
    this.applyFlags();

    for (var qid in this.D.quests) {
      if (!has(this.D.quests, qid)) { continue; }
      var rq = raw.quests && has(raw.quests, qid) ? raw.quests[qid] : null;
      if (!rq || (rq.s !== 'active' && rq.s !== 'ready' && rq.s !== 'done')) { continue; }
      var kk = {}, q = this.D.quests[qid];
      for (var j = 0; j < q.objectives.length; j++) {
        var o = q.objectives[j];
        if (o.type === 'kill') { kk[o.target] = Math.floor(num(rq.k && rq.k[o.target], 0, 9999, 0)); }
      }
      this.quests[qid] = { s: rq.s, k: kk };
    }

    for (i = 0; i < this.ents.length; i++) {
      var e = this.ents[i], re = raw.ents && has(raw.ents, e.key) ? raw.ents[e.key] : null;
      if (!re || e.type === 'npc') { continue; }
      e.until = num(re.until, 0, Date.now() + 86400000, 0);
      if (e.type === 'monster') { e.hp = num(re.hp, 0, this.D.monsters[e.id].hp, this.D.monsters[e.id].hp); }
    }
    px = Math.floor(px) + 0.5; py = Math.floor(py) + 0.5;
    if (this.walkable(Math.floor(px), Math.floor(py))) { pl.x = px; pl.y = py; }
    if (this.opts.turnFirst) { pl.a = snap90(pl.a); }
    this.auto = raw.auto === true;
    this.checkQuests();

    var away = Math.min(MAX_AWAY, Math.max(0, (Date.now() - num(raw.t, 0, Date.now(), Date.now())) / 1000));
    this.away(away);
    return true;
  };

  // Tempo fora do jogo: a vida regenera (respawns usam o relógio real, então já funcionam)
  G.away = function (seconds) {
    if (seconds <= 0 || this.combatT < 3) { return 0; }
    var before = this.pl.hp;
    this.pl.hp = Math.min(this.maxHp(), this.pl.hp + this.D.player.regenPerSec * seconds);
    return this.pl.hp - before;
  };

  G.reset = function () { this.initState(); };

  ZG.Game = Game;
})(window.ZG = window.ZG || {});
