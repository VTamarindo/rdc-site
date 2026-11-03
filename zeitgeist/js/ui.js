/* Zeitgeist · interface, entrada, laço de tempo e save (protótipo da vila) */
(function (ZG) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var calc = ZG.calc;
  var G, V, world, sim, st, view;
  var DT, CAP, THRESH;
  var lastReal = Date.now(), acc = 0, prev = null, away = null;
  var keys = {}, pad = {}, lookHold = 0, drag = null, hoverRef = null;
  var openWin = null, npcOpen = null, toastT = 0, baseTitle = document.title;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var isTouch = ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches);

  // ---------- carregar ----------
  function getJSON(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) { throw new Error(u); } return r.json(); }); }
  Promise.all([getJSON('data/game.json'), getJSON('data/vila.json'), ZG.loadArt('art/')]).then(function (d) { start(d[0], d[1], d[2]); })
    .catch(function (e) { $('loading').textContent = 'Não foi possível carregar os dados (' + e.message + '). Abra por um servidor, não direto do arquivo.'; });

  function start(game, vila, art) {
    G = game; V = vila;
    DT = G.settings.tickSec; CAP = G.settings.offlineCapHours * 3600; THRESH = G.settings.returnThresholdSec;
    world = new ZG.World(G, V); sim = new ZG.Sim(world);
    var saved = load();
    if (saved) { st = saved.state; lastReal = saved.lastReal || Date.now(); }
    else { st = ZG.newState(world, (Date.now() % 2147483647) | 0); lastReal = Date.now(); }

    view = new ZG.View($('view'), world, art);
    view.yaw = st.player.yaw;
    $('loading').hidden = true; $('hud').hidden = false;
    if (isTouch) { document.body.classList.add('touch'); $('pad').hidden = false; }
    if (/romancedecavalaria|localhost|127\.0\.0\.1/.test(location.hostname)) { $('back-site').hidden = false; }
    bindInput(); resize(); window.addEventListener('resize', resize);
    renderLog();

    if (saved) { beginAway(lastReal); endAway(Date.now()); }
    else { show('w-menu'); }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { beginAway(Date.now()); save(); }
      else { if (away) { endAway(Date.now()); } document.title = baseTitle; }
    });
    window.addEventListener('pagehide', save);
    setInterval(function () { if (away) { catchUp(Date.now()); } save(); }, 5000);
    requestAnimationFrame(frame);
  }

  // ---------- save ----------
  function save() {
    try { localStorage.setItem(G.settings.saveKey, JSON.stringify({ v: 1, lastReal: lastReal, state: st })); } catch (e) { /* sem armazenamento: segue sem salvar */ }
  }
  function load() {
    try { var s = JSON.parse(localStorage.getItem(G.settings.saveKey)); return s && s.v === 1 && s.state ? s : null; } catch (e) { return null; }
  }

  // ---------- tempo fora ----------
  function snapshot() { return { stats: JSON.parse(JSON.stringify(st.stats)), lv: st.player.lv, hp: st.player.hp, on: st.player.macro.on }; }
  function beginAway(fromMs) { if (!away) { away = { snap: snapshot(), start: fromMs, used: 0 }; lastReal = fromMs; } }
  function catchUp(nowMs) {
    var sec = (nowMs - lastReal) / 1000; lastReal = nowMs;
    if (sec <= 0) { return; }
    var wasOn = st.player.macro.on;
    var run = Math.min(sec, Math.max(0, CAP - away.used));
    if (run > 0) { away.used += sim.advance(st, run); }
    if (away.used >= CAP - DT && st.player.macro.on) { sim.stopMacro(st, 'Teto de 4 h fora atingido: o personagem parou para descansar.'); }
    if (wasOn && !st.player.macro.on && document.hidden) { document.title = '(!) ' + baseTitle; }
    sim.events.length = 0; prev = null;
  }
  function endAway(nowMs) {
    catchUp(nowMs);
    var total = (nowMs - away.start) / 1000, snap = away.snap, used = away.used;
    away = null; acc = 0;
    if (total >= THRESH) { report(snap, total, used); }
    renderLog();
  }
  function fmtTime(s) {
    s = Math.round(s); var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h) { return h + ' h ' + (m ? m + ' min' : ''); } if (m) { return m + ' min'; } return s + ' s';
  }
  function report(snap, total, used) {
    var s = st.stats, a = snap.stats, li = [];
    var k = s.kills - a.kills; if (k) { li.push(k + ' coelho' + (k > 1 ? 's' : '') + ' abatido' + (k > 1 ? 's' : '')); }
    for (var it in s.items) { var n = s.items[it] - (a.items[it] || 0); if (n) { li.push('+' + n + ' ' + G.items[it].name.toLowerCase()); } }
    var x = s.xp - a.xp; if (x) { li.push('+' + x + ' de experiência' + (st.player.lv > snap.lv ? ' (nível ' + st.player.lv + ')' : '')); }
    var p = s.potions - a.potions; if (p) { li.push(p + ' poç' + (p > 1 ? 'ões bebidas' : 'ão bebida')); }
    var r = s.retreats - a.retreats; if (r) { li.push(r + ' recuo' + (r > 1 ? 's' : '') + ' para descansar na praça'); }
    var f = s.faints - a.faints; if (f) { li.push(f + ' desmaio' + (f > 1 ? 's' : '')); }
    if (!li.length) { li.push(snap.on ? 'Nada aconteceu.' : 'Nada: a macro estava parada.'); }
    $('rep-time').textContent = 'Você ficou fora por ' + fmtTime(total) + (total > used + 1 ? ' (só ' + fmtTime(used) + ' contaram: o teto é de ' + G.settings.offlineCapHours + ' h).' : '.');
    $('rep-list').innerHTML = li.map(function (t) { return '<li>' + t + '</li>'; }).join('');
    $('rep-status').textContent = st.player.macro.on ? 'A macro continua trabalhando.' : (st.player.macro.stop || 'A macro está parada.');
    show('w-report');
  }

  // ---------- laço ----------
  function snapPrev() {
    var o = { player: { x: st.player.x, z: st.player.z } };
    st.mobs.forEach(function (m) { o[m.id] = { x: m.x, z: m.z }; });
    return o;
  }
  var lastFrame = performance.now();
  function frame(t) {
    requestAnimationFrame(frame);
    var fdt = Math.min(0.1, (t - lastFrame) / 1000); lastFrame = t;
    var now = Date.now(), gap = (now - lastReal) / 1000;
    if (away) { return; }
    if (gap > THRESH) { beginAway(lastReal); endAway(now); return; }
    lastReal = now;

    var moving = manualMove(fdt);
    acc += gap;
    var guard = 0;
    while (acc >= DT && guard++ < 50) { prev = snapPrev(); sim.tick(st); acc -= DT; }
    handleEvents();

    // câmera
    var p = st.player, auto = p.mode === 'macro' && p.macro.on;
    if (auto) {
      lookHold -= fdt;
      if (lookHold <= 0) {
        var d = angDiff(p.yaw, view.yaw);
        view.yaw += d * Math.min(1, fdt * 3.2);
        view.pitch += (-0.12 - view.pitch) * Math.min(1, fdt * 2);
      }
    } else { p.yaw = view.yaw; }
    var autoMoving = auto && prev && (Math.abs(p.x - prev.player.x) + Math.abs(p.z - prev.player.z) > 0.001);
    view.render(st, prev, Math.min(1, acc / DT), fdt, { interp: auto, moving: moving || autoMoving });
    hud();
    if (npcOpen && !sim.nearNpc(st, npcOpen)) { hide(); }
  }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) { d -= Math.PI * 2; } while (d < -Math.PI) { d += Math.PI * 2; } return d; }

  function manualMove(dt) {
    if (openWin && openWin !== 'w-report') { return false; }
    var f = (keys.KeyW || keys.ArrowUp || pad.fwd ? 1 : 0) - (keys.KeyS || keys.ArrowDown || pad.back ? 1 : 0);
    var s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    var turn = (keys.ArrowLeft || pad.left ? 1 : 0) - (keys.ArrowRight || pad.right ? 1 : 0);
    if (!f && !s && !turn) { return false; }
    if (sim.takeControl(st)) { toast('Macro pausada: você assumiu o controle (G retoma).'); }
    view.yaw += turn * G.player.turnSpeed * dt;
    if (!f && !s) { return false; }
    var y = view.yaw, fx = Math.sin(y), fz = Math.cos(y), rx = -Math.cos(y), rz = Math.sin(y);
    var vx = fx * f + rx * s, vz = fz * f + rz * s, l = Math.hypot(vx, vz), spd = G.player.walkSpeed * dt;
    return sim.walk(st, vx / l * spd, vz / l * spd);
  }

  // ---------- eventos da simulação ----------
  function handleEvents() {
    var ev = sim.events; sim.events = [];
    var newLog = false;
    ev.forEach(function (e) {
      if (e.type === 'log') { newLog = true; }
      else if (e.type === 'hit' && e.who === 'mob') {
        view.hit(e.id); view.shake = 0.05;
        var m = sim.mobById(st, e.id); if (m) { floatAt(m.x, 0.7, m.z, '-' + e.n, ''); }
      } else if (e.type === 'hit' && e.who === 'player') {
        var h = $('hurt'); h.classList.add('on'); setTimeout(function () { h.classList.remove('on'); }, 60);
        floatScreen(0.5, 0.62, '-' + e.n, 'me'); view.shake = 0.12;
      } else if (e.type === 'gain') {
        floatScreen(0.5, 0.44, '+' + e.n + ' ' + G.items[e.item].name, 'gain');
      } else if (e.type === 'alert') { toast(e.text, 4); if (document.hidden) { document.title = '(!) ' + baseTitle; } }
      else if (e.type === 'level') { toast('Nível ' + st.player.lv + '!'); }
    });
    if (newLog) { renderLog(); }
  }
  function floatAt(x, y, z, text, cls) { var s = view.project(x, y, z); if (s) { floatScreen(s.x, s.y, text, cls); } }
  function floatScreen(nx, ny, text, cls) {
    var el = document.createElement('span'); el.textContent = text; el.className = cls || '';
    el.style.left = (nx * 100) + '%'; el.style.top = (ny * 100) + '%';
    $('fx').appendChild(el); setTimeout(function () { el.remove(); }, 950);
  }
  function toast(text, sec) {
    var t = $('toast'); t.textContent = text; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, (sec || 2.4) * 1000);
  }
  function renderLog() {
    var l = st.log.slice(-6);
    $('log').innerHTML = l.map(function (x, i) { return '<li' + (i < l.length - 3 ? ' class="old"' : '') + '>' + esc(x.text) + '</li>'; }).join('');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- HUD ----------
  var hudT = 0;
  function hud() {
    var p = st.player, mh = calc.maxHp(world, p);
    $('hp-bar').style.width = Math.max(0, p.hp / mh * 100) + '%';
    $('hp-t').textContent = Math.ceil(Math.max(0, p.hp)) + ' / ' + mh;
    var need = p.lv * G.player.xpPerLevel;
    $('xp-bar').style.width = (p.xp / need * 100) + '%';

    var a = p.action, pr = $('prog');
    if (a && a.type === 'gather') { pr.hidden = false; pr.firstChild.style.width = Math.min(100, a.prog / G.nodes[world.nodeById[a.id].kind].gatherSec * 100) + '%'; }
    else if (a && a.type === 'rest') { pr.hidden = false; pr.firstChild.style.width = (p.hp / mh * 100) + '%'; }
    else { pr.hidden = true; }

    var now = performance.now(); if (now - hudT < 150) { return; } hudT = now;
    $('lv').textContent = 'Nível ' + p.lv;
    $('stance').textContent = G.stances[p.stance].name + ' · ' + G.weapon[p.weapon].name;
    $('pots').textContent = 'Poções ' + (p.inv.pocao || 0);
    $('coins').textContent = 'Moedas ' + (p.inv.moeda || 0);
    $('bag').textContent = 'Bolsa ' + calc.bagCount(world, p) + '/' + G.settings.bagCapacity;
    var inv = [];
    for (var k in p.inv) { if (p.inv[k] > 0 && !G.items[k].noBag) { inv.push('<li>' + esc(G.items[k].name) + ' ' + p.inv[k] + '</li>'); } }
    $('inv').innerHTML = inv.join('');

    var line = $('macro-line'), on = p.mode === 'macro' && p.macro.on;
    line.classList.toggle('on', on);
    line.textContent = on ? 'Macro: ' + macroText(p) : (p.macro.stop || (p.macro.area ? 'Macro parada · G retoma' : 'Abra o mapa (M) e clique onde o personagem deve trabalhar'));
    $('b-macro').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('b-macro').textContent = on ? 'Pausar macro' : 'Macro';
    drawMap($('mini'), 150, false);
    if (openWin === 'w-map') { drawMap($('bigmap'), 560, true); }
  }
  function macroText(p) {
    var a = p.action, ph = p.macro.phase;
    if (ph === 'retreat') { return 'vida baixa, voltando à praça'; }
    if (ph === 'full') { return 'bolsa cheia, voltando à praça'; }
    if (ph === 'rest') { return 'descansando na praça'; }
    if (!a) { return 'pensando'; }
    if (a.type === 'gather') { var n = world.nodeById[a.id]; return (n.kind === 'arvore' ? 'cortando árvore' : 'minerando veio'); }
    if (a.type === 'attack') { return 'caçando coelho'; }
    if (a.type === 'travel') { return a.label; }
    return 'esperando algo aparecer na área';
  }

  // ---------- mapa ----------
  var mapHover = null;
  function drawMap(cv, S, big) {
    var c = cv.getContext('2d'), B = world.B, k = S / (B * 2);
    function X(x) { return (x + B) * k; }
    function Z(z) { return (z + B) * k; }
    c.fillStyle = '#4c6a32'; c.fillRect(0, 0, S, S);
    var F = V.fence.half;
    c.fillStyle = '#5a7639'; c.fillRect(X(-F), Z(-F), F * 2 * k, F * 2 * k);
    c.strokeStyle = '#3b2a18'; c.lineWidth = Math.max(1, k * 0.4); c.strokeRect(X(-F + 0.5), Z(-F + 0.5), (F * 2 - 1) * k, (F * 2 - 1) * k);
    c.fillStyle = '#5a7639'; c.fillRect(X(V.fence.gate.from), Z(F - 1), (V.fence.gate.to - V.fence.gate.from) * k, k);
    c.fillStyle = '#7d6a4b'; c.fillRect(X(V.road.x - V.road.w / 2), Z(V.road.z0), V.road.w * k, (V.road.z1 - V.road.z0) * k);
    c.fillStyle = '#9a958b'; c.beginPath(); c.arc(X(V.plaza.x), Z(V.plaza.z), V.plaza.r * k, 0, 7); c.fill();
    c.fillStyle = '#8a5a3a';
    world.buildings.forEach(function (b) { c.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k); });
    if (big) {
      c.fillStyle = '#f1e7d0'; c.font = '13px Georgia'; c.textAlign = 'center';
      V.buildings.forEach(function (b) { c.fillText({ igreja: 'Igreja', ferreiro: 'Ferreiro', bar: 'Bar' }[b.type], X(b.x), Z(b.z) + 4); });
    }
    world.nodes.forEach(function (n) {
      var alive = st.nodes[n.id].alive;
      c.fillStyle = n.kind === 'arvore' ? (alive ? '#2f5a22' : '#6b5a3a') : (alive ? '#bdb8ae' : '#6a6762');
      c.beginPath(); c.arc(X(n.x), Z(n.z), Math.max(1.6, k * (n.kind === 'arvore' ? 0.9 : 0.6)), 0, 7); c.fill();
    });
    c.fillStyle = '#e9d9b8';
    st.mobs.forEach(function (m) { if (m.alive) { c.fillRect(X(m.x) - 1.5, Z(m.z) - 1.5, 3, 3); } });
    c.fillStyle = '#6fa8dc';
    world.npcs.forEach(function (n) { c.beginPath(); c.arc(X(n.x), Z(n.z), Math.max(1.8, k * 0.5), 0, 7); c.fill(); });
    var a = st.player.macro.area;
    if (a) { c.strokeStyle = '#e8c45a'; c.lineWidth = big ? 2 : 1; c.beginPath(); c.arc(X(a.x), Z(a.z), a.r * k, 0, 7); c.stroke(); }
    if (big && mapHover) { c.strokeStyle = 'rgba(255,255,255,.6)'; c.setLineDash([4, 4]); c.beginPath(); c.arc(X(mapHover.x), Z(mapHover.z), G.settings.macroRadius * k, 0, 7); c.stroke(); c.setLineDash([]); }
    // jogador: seta
    var p = st.player, px = X(p.x), pz = Z(p.z), y = view ? view.yaw : p.yaw, r = big ? 9 : 6;
    c.fillStyle = '#ffffff'; c.strokeStyle = '#000'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(px + Math.sin(y) * r, pz + Math.cos(y) * r);
    c.lineTo(px + Math.sin(y + 2.5) * r * 0.7, pz + Math.cos(y + 2.5) * r * 0.7);
    c.lineTo(px + Math.sin(y - 2.5) * r * 0.7, pz + Math.cos(y - 2.5) * r * 0.7);
    c.closePath(); c.fill(); c.stroke();
  }
  function mapPoint(e) {
    var cv = $('bigmap'), r = cv.getBoundingClientRect(), B = world.B;
    return { x: (e.clientX - r.left) / r.width * B * 2 - B, z: (e.clientY - r.top) / r.height * B * 2 - B };
  }

  // ---------- janelas ----------
  function show(id) { hide(); openWin = id; $(id).hidden = false; keys = {}; pad = {}; }
  function hide() {
    if (openWin) { $(openWin).hidden = true; }
    openWin = null; npcOpen = null;
  }
  function toggle(id, fn) { if (openWin === id) { hide(); } else { if (fn) { fn(); } show(id); } }

  function renderRules() {
    var ol = $('rules'); ol.innerHTML = '';
    st.rules.forEach(function (r, i) {
      var def = G.macro.rules[r.id], li = document.createElement('li');
      if (!r.on) { li.className = 'off'; }
      var label = esc(def.label).replace('{v}', '<input type="number" min="5" max="95" step="5" value="' + r.val + '" aria-label="Porcentagem">');
      li.innerHTML = '<label><input type="checkbox"' + (r.on ? ' checked' : '') + '> <span>' + label + '</span></label>' +
        '<button type="button" data-up aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" data-dn aria-label="Descer"' + (i === st.rules.length - 1 ? ' disabled' : '') + '>↓</button>';
      li.querySelector('input[type=checkbox]').onchange = function (e) { r.on = e.target.checked; renderRules(); };
      var num = li.querySelector('input[type=number]');
      if (num) { num.onchange = function () { r.val = Math.max(5, Math.min(95, +num.value || def.val)); }; }
      li.querySelector('[data-up]').onclick = function () { st.rules.splice(i - 1, 0, st.rules.splice(i, 1)[0]); renderRules(); };
      li.querySelector('[data-dn]').onclick = function () { st.rules.splice(i + 1, 0, st.rules.splice(i, 1)[0]); renderRules(); };
      ol.appendChild(li);
    });
  }

  function openNpc(id) {
    var def = G.npcs[id];
    show('w-npc'); npcOpen = id;
    $('npc-name').textContent = def.name; $('npc-text').textContent = def.idle; $('npc-res').textContent = '';
    renderNpcActs(id);
  }
  function renderNpcActs(id) {
    var def = G.npcs[id], box = $('npc-acts'), p = st.player; box.innerHTML = '';
    def.services.forEach(function (s) {
      var b = document.createElement('button'); b.type = 'button';
      if (s.type === 'heal') { b.textContent = 'Pedir cura (grátis)'; }
      if (s.type === 'buy') { b.textContent = 'Comprar ' + G.items[s.item].name.toLowerCase() + ' (' + G.items[s.item].price + ' moedas)'; }
      if (s.type === 'sell') {
        var tot = 0; s.items.forEach(function (k) { tot += (p.inv[k] || 0) * G.items[k].price; });
        b.textContent = 'Vender ' + s.items.map(function (k) { return G.items[k].name.toLowerCase(); }).join(', ') + ' (' + tot + ' moedas)';
      }
      if (s.type === 'upgrade') {
        var nx = G.weapon[p.weapon + 1];
        b.textContent = nx ? 'Melhorar para ' + nx.name + ' (' + Object.keys(nx.cost).map(function (k) { return nx.cost[k] + ' ' + G.items[k].name.toLowerCase(); }).join(' + ') + ')' : 'Espada já está no máximo';
        b.disabled = !nx;
      }
      b.onclick = function () { $('npc-res').textContent = sim.service(st, id, s); renderNpcActs(id); };
      box.appendChild(b);
    });
  }

  // ---------- interação ----------
  function refName(ref) {
    if (ref.type === 'npc') { return G.npcs[ref.id].name; }
    if (ref.type === 'mob') { return G.monsters.coelho.name; }
    var n = world.nodeById[ref.id], def = G.nodes[n.kind], ns = st.nodes[n.id];
    return def.name + (ns.alive ? '' : ' (volta em ' + Math.ceil(ns.left) + ' s)');
  }
  function refPos(ref) {
    if (ref.type === 'npc') { var r = null; world.npcs.forEach(function (n) { if (n.id === ref.id) { r = n; } }); return r; }
    if (ref.type === 'mob') { return sim.mobById(st, ref.id); }
    return world.nodeById[ref.id];
  }
  function interact(ref) {
    var p = st.player, pos = refPos(ref), d = calc.dist(p.x, p.z, pos.x, pos.z);
    if (ref.type === 'npc') {
      if (d <= G.settings.interactRange + 0.5) { openNpc(ref.id); } else { toast('Aproxime-se de ' + G.npcs[ref.id].name + '.'); }
      return;
    }
    if (ref.type === 'node') {
      if (!st.nodes[ref.id].alive) { toast(refName(ref)); return; }
      if (d > G.player.reach + 0.6) { toast('Chegue mais perto para coletar.'); return; }
      if (sim.takeControl(st)) { toast('Macro pausada (G retoma).'); }
      p.action = { type: 'gather', id: ref.id, prog: 0 };
      return;
    }
    if (ref.type === 'mob') {
      if (sim.takeControl(st)) { toast('Macro pausada (G retoma).'); }
      p.action = { type: 'attack', id: ref.id };
      if (d > G.player.reach) { toast('Alvo marcado: aproxime-se para atacar.'); }
    }
  }
  // E / botão Interagir: o que estiver mais perto, à frente
  function interactFront() {
    var p = st.player, fx = Math.sin(view.yaw), fz = Math.cos(view.yaw), best = null, bd = 1e9;
    function consider(ref, x, z, range) {
      var dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d > range || d < 0.01) { return; }
      if (d > 1.6 && (dx * fx + dz * fz) / d < 0.35) { return; }
      if (d < bd) { bd = d; best = ref; }
    }
    world.npcs.forEach(function (n) { consider({ type: 'npc', id: n.id }, n.x, n.z, G.settings.interactRange); });
    world.nodes.forEach(function (n) { if (st.nodes[n.id].alive) { consider({ type: 'node', id: n.id }, n.x, n.z, G.player.reach + 0.6); } });
    st.mobs.forEach(function (m) { if (m.alive) { consider({ type: 'mob', id: m.id }, m.x, m.z, G.settings.interactRange); } });
    if (best) { interact(best); return; }
    // nada ao alcance: diz o que está à frente, mais longe
    world.npcs.forEach(function (n) { consider({ type: 'npc', id: n.id }, n.x, n.z, 12); });
    world.nodes.forEach(function (n) { if (st.nodes[n.id].alive) { consider({ type: 'node', id: n.id }, n.x, n.z, 12); } });
    st.mobs.forEach(function (m) { if (m.alive) { consider({ type: 'mob', id: m.id }, m.x, m.z, 12); } });
    toast(best ? 'Aproxime-se: ' + refName(best) + ' (' + bd.toFixed(1) + ' m).' : 'Nada ao alcance à sua frente.');
  }

  function cmd(c) {
    var p = st.player;
    if (c === 'map') { toggle('w-map'); }
    else if (c === 'rules') { toggle('w-rules', renderRules); }
    else if (c === 'menu') { toggle('w-menu'); }
    else if (c === 'stance') { p.stance = p.stance === 'ofensiva' ? 'defensiva' : 'ofensiva'; toast('Postura ' + G.stances[p.stance].name.toLowerCase() + '.'); }
    else if (c === 'potion') { if (!sim.drink(st)) { toast(p.inv.pocao > 0 ? 'Agora não.' : 'Sem poções.'); } handleEvents(); }
    else if (c === 'macro') {
      if (p.mode === 'macro' && p.macro.on) { sim.takeControl(st); p.macro.stop = 'Macro pausada · G retoma'; }
      else if (p.macro.area) { sim.startMacro(st); toast('Macro retomada.'); }
      else { toast('Primeiro marque uma área no mapa.'); show('w-map'); }
    }
  }

  function debug(c) {
    if (c === 'reset') {
      try { localStorage.removeItem(G.settings.saveKey); } catch (e) { /* nada */ }
      st = ZG.newState(world, (Date.now() % 2147483647) | 0); view.yaw = st.player.yaw; renderLog(); hide(); toast('Recomeçado.'); return;
    }
    if (c === 'hurt') { st.player.hp = Math.max(1, st.player.hp - 15); hide(); return; }
    if (c === 'coins') { st.player.inv.moeda = (st.player.inv.moeda || 0) + 50; return; }
    var min = { away30: 30, away240: 240, away600: 600 }[c];
    if (min) { hide(); var now = Date.now(); beginAway(now - min * 60000); endAway(now); }
  }

  // ---------- entrada ----------
  function bindInput() {
    var cv = $('view');
    window.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') { return; }
      if (e.code === 'Escape') { if (openWin) { hide(); } else { cmd('menu'); } e.preventDefault(); return; }
      if (openWin === 'w-report' && (e.code === 'Enter' || e.code === 'Space')) { hide(); e.preventDefault(); return; }
      var map = { KeyM: 'map', KeyR: 'rules', KeyT: 'stance', KeyF: 'potion', KeyG: 'macro' };
      if (map[e.code] && !e.repeat) { cmd(map[e.code]); e.preventDefault(); return; }
      if (openWin && openWin !== 'w-report') { return; }
      if (e.code === 'KeyE' && !e.repeat) { interactFront(); e.preventDefault(); return; }
      if (/^(Key[WASD]|Arrow)/.test(e.code)) { keys[e.code] = true; e.preventDefault(); if (openWin === 'w-report') { hide(); } }
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });
    window.addEventListener('blur', function () { keys = {}; pad = {}; });

    cv.addEventListener('pointerdown', function (e) {
      if (openWin) { hide(); return; }
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', function (e) {
      if (drag && drag.id === e.pointerId) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved > 6) {
          view.yaw -= dx * 0.005; view.pitch = Math.max(-1.1, Math.min(0.9, view.pitch - dy * 0.004));
          lookHold = 2.5; $('hover').hidden = true;
        }
        return;
      }
      if (e.pointerType === 'mouse') { hoverAt(e); }
    });
    cv.addEventListener('pointerup', function (e) {
      if (!drag || drag.id !== e.pointerId) { return; }
      var click = drag.moved <= 6; drag = null;
      if (click) {
        var h = pickEvent(e);
        if (h) { interact(h.ref); }
      }
    });
    cv.addEventListener('pointerleave', function () { $('hover').hidden = true; });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    $('mini').addEventListener('click', function () { cmd('map'); });
    var big = $('bigmap');
    big.addEventListener('pointermove', function (e) { mapHover = mapPoint(e); });
    big.addEventListener('pointerleave', function () { mapHover = null; });
    big.addEventListener('click', function (e) {
      var pt = mapPoint(e);
      sim.startMacro(st, pt); mapHover = null; hide();
      toast('Área marcada. O personagem vai trabalhar lá.');
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-cmd]'), function (b) { b.addEventListener('click', function () { cmd(b.dataset.cmd); b.blur(); }); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', hide); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-dbg]'), function (b) { b.addEventListener('click', function () { debug(b.dataset.dbg); }); });

    // botões de toque: segurar = andar/girar
    Array.prototype.forEach.call(document.querySelectorAll('#pad [data-k]'), function (b) {
      var k = b.dataset.k;
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault(); b.classList.add('down');
        if (openWin === 'w-report') { hide(); }
        if (k === 'act') { interactFront(); return; }
        if (k === 'pot') { cmd('potion'); return; }
        pad[k] = true; b.setPointerCapture(e.pointerId);
      });
      var up = function () { pad[k] = false; b.classList.remove('down'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    });
  }
  function pickEvent(e) {
    var r = $('view').getBoundingClientRect();
    return view.pickAt((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
  }
  function hoverAt(e) {
    var h = pickEvent(e), el = $('hover'), cv = $('view');
    if (!h) { el.hidden = true; cv.classList.remove('over'); return; }
    var pos = refPos(h.ref), d = calc.dist(st.player.x, st.player.z, pos.x, pos.z);
    el.textContent = refName(h.ref) + (h.ref.type === 'mob' ? ' · ' + Math.max(0, sim.mobById(st, h.ref.id).hp) + ' de vida' : '') + ' · ' + d.toFixed(1) + ' m';
    el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px'; el.hidden = false; cv.classList.add('over');
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    view.resize(w, h, G.settings.pixelScale * Math.min(1.5, dpr));
  }
})(window.ZG = window.ZG || {});
