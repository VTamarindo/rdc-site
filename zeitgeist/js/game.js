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

  function Game(data, map, hooks) {
    this.D = data;
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
    this.pl = { x: sp.x, y: sp.y, a: sp.a, lv: 1, xp: 0, hp: 0, stance: 'ofensiva', atkT: 0, potT: 0 };
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

    this.cur = near;
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
    pl.atkT = 0;
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
    if (best.type === 'node') {
      var nd = this.D.nodes[best.id];
      best.until = now + nd.respawn * 1000;
      this.say('Você coletou ' + nd.name + '.', 'good');
      this.inv[nd.item] = (this.inv[nd.item] || 0) + 1;
      this.checkQuests();
      return { kind: 'node' };
    }
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

  /* ---------- desenho ---------- */
  G.drawList = function (spriteIndex) {
    var list = [], now = Date.now();
    for (var i = 0; i < this.ents.length; i++) {
      var e = this.ents[i], def;
      if (e.type === 'monster') { if (e.hp <= 0) { continue; } def = this.D.monsters[e.id]; }
      else if (e.type === 'npc') { def = this.D.npcs[e.id]; }
      else { if (now < e.until) { continue; } def = this.D.nodes[e.id]; }
      list.push({ x: e.x, y: e.y, tex: spriteIndex[def.sprite], scale: def.scale, flash: e.flash });
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
      inv: this.inv, quests: this.quests, flags: this.flags, ents: ents
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
    if (!this.blockedBox(px, py, PL_R)) { pl.x = px; pl.y = py; }
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
