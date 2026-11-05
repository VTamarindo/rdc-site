/* Zeitgeist · interface, entrada, laço de tempo e save (protótipo da vila) */
(function (ZG) {
  'use strict';
  // ao publicar uma versão nova, troque VERSION aqui e o ?v= no index.html (evita cache velho)
  var VERSION = '20261105-2';
  var $ = function (id) { return document.getElementById(id); };
  var calc = ZG.calc;
  var G, V, world, sim, st, view;
  var DT, CAP, THRESH;
  var lastReal = Date.now(), acc = 0, prev = null, away = null;
  var keys = {}, pad = {}, lookHold = 0, drag = null, hoverRef = null;
  var newVersion = false;
  var openWin = null, npcOpen = null, toastT = 0, baseTitle = document.title;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var isTouch = ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches);

  // ---------- carregar ----------
  function getJSON(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) { throw new Error(u); } return r.json(); }); }
  Promise.all([getJSON('data/game.json?v=' + VERSION), getJSON('data/vila.json?v=' + VERSION), ZG.loadArt('art/', VERSION)]).then(function (d) { start(d[0], d[1], d[2]); })
    .catch(function (e) { $('loading').textContent = 'Não foi possível carregar os dados (' + e.message + '). Abra por um servidor, não direto do arquivo.'; });

  function start(game, vila, art) {
    G = game; V = vila;
    DT = G.settings.tickSec; CAP = G.settings.offlineCapHours * 3600; THRESH = G.settings.returnThresholdSec;
    world = new ZG.World(G, V); sim = new ZG.Sim(world);
    var saved = load();
    if (saved) { st = ZG.migrate(saved.state); lastReal = saved.lastReal || Date.now(); }
    else { st = ZG.newState(world, (Date.now() % 2147483647) | 0); lastReal = Date.now(); }

    view = new ZG.View($('view'), world, art);
    view.yaw = st.player.yaw;
    $('loading').hidden = true; $('hud').hidden = false; $('ver').textContent = VERSION;
    if (isTouch) { document.body.classList.add('touch'); $('pad').hidden = false; }
    if (/romancedecavalaria|localhost|127\.0\.0\.1/.test(location.hostname)) { $('back-site').hidden = false; }
    bindInput(); resize(); window.addEventListener('resize', resize);
    ZG.debug = { state: function () { return st; }, view: function () { return view; }, sim: sim, interact: function (ref) { interact(ref); } }; // para testes
    renderLog();

    if (saved) { beginAway(lastReal); endAway(Date.now()); }
    if (!st.player.name) { showNew(); if (newVersion) { $('new-err').hidden = false; $('new-err').textContent = 'Versão nova do protótipo (' + VERSION + '): o jogo recomeçou do zero.'; } }

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
    try { localStorage.setItem(G.settings.saveKey, JSON.stringify({ v: 1, ver: VERSION, lastReal: lastReal, state: st })); } catch (e) { /* sem armazenamento: segue sem salvar */ }
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(G.settings.saveKey));
      if (!(s && s.v === 1 && s.state)) { return null; }
      // protótipo: versão nova publicada = jogo recomeça do zero (sem precisar limpar o cache)
      if (G.settings.resetSaveOnNewVersion && s.ver !== VERSION) { localStorage.removeItem(G.settings.saveKey); newVersion = true; return null; }
      return s;
    } catch (e) { return null; }
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
    var p = st.player, auto = (p.mode === 'macro' && p.macro.on) || !!p.goto;
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
    hud(); marks();
    if (npcOpen && !sim.nearNpc(st, npcOpen)) { hide(); }
  }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) { d -= Math.PI * 2; } while (d < -Math.PI) { d += Math.PI * 2; } return d; }

  function manualMove(dt) {
    if (openWin && openWin !== 'w-report') { return false; }
    var f = (keys.KeyW || keys.ArrowUp || pad.fwd ? 1 : 0) - (keys.KeyS || keys.ArrowDown || pad.back ? 1 : 0);
    var s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    var turn = (keys.ArrowLeft || pad.left ? 1 : 0) - (keys.ArrowRight || pad.right ? 1 : 0);
    if (!f && !s && !turn) { return false; }
    if (sim.takeControl(st)) { toast('Macro pausada: você assumiu o controle.'); }
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
      else if (e.type === 'quest') { toast('Missão concluída: ' + G.quests[e.id].title + '.', 3); }
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
    $('pname').textContent = p.name || '';
    $('lv').textContent = 'Nível ' + p.lv;
    $('pots').textContent = 'Poções ' + (p.inv.pocao || 0);
    $('coins').textContent = 'Moedas ' + (p.inv.moeda || 0);
    $('bag').textContent = 'Bolsa ' + calc.bagCount(world, p) + '/' + G.settings.bagCapacity;
    if (openWin === 'w-inv') { renderInv(); }
    if (openWin === 'w-bag') { renderBag(); }

    var line = $('macro-line'), on = p.mode === 'macro' && p.macro.on;
    line.classList.toggle('on', on);
    line.textContent = on ? 'Macro: ' + macroText(p) : p.goto ? 'Andando até o ponto marcado no mapa' : (p.macro.stop || (isTouch ? 'Toque no mapa pequeno, no canto, para andar ou usar a macro' : 'Mapa (M): clique para andar · Macro (G): escolha a área de trabalho'));
    line.classList.toggle('on', on || !!p.goto);
    renderQuests();
    drawMap($('mini'), 150, false);
    if (openWin === 'w-map') { drawMap($('bigmap'), 560, true); mapUi(); }
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
  var mapHover = null, mapArmed = false, mapMenu = false;
  function macroOn() { return st.player.mode === 'macro' && st.player.macro.on; }
  // estado dos controles da janela do mapa (botão Macro embaixo e o menu que ele abre)
  function mapUi() {
    var a = st.player.macro.area, on = macroOn(), mb = $('map-macro');
    $('map-hint').textContent = mapArmed
      ? 'Macro armada: clique onde o personagem deve trabalhar sozinho (o círculo dourado mostra a área).'
      : on ? 'A macro está trabalhando na área marcada. Um clique no mapa pausa e leva o personagem até o ponto.'
      : 'Clique num ponto para o personagem andar até lá.';
    mb.setAttribute('aria-pressed', mapArmed ? 'true' : 'false');
    mb.setAttribute('aria-expanded', mapMenu ? 'true' : 'false');
    mb.textContent = mapArmed ? 'Macro armada · cancelar' : (on ? 'Macro (trabalhando) ' : 'Macro ') + (mapMenu ? '▾' : '▴');
    $('map-menu').hidden = !mapMenu;
    $('mm-prev').hidden = !a;
    $('mm-pause').hidden = !on;
    $('bigmap').classList.toggle('armed', mapArmed);
  }
  function openMap(menu) { mapArmed = false; mapMenu = !!menu; mapHover = null; show('w-map'); mapUi(); drawMap($('bigmap'), 560, true); }
  function pauseMacro() {
    if (!macroOn()) { return false; }
    sim.takeControl(st); st.player.macro.stop = 'Macro pausada · Macro (G) para retomar';
    return true;
  }

  // papel envelhecido: textura gerada uma vez por tamanho (manchas, fibras e bordas queimadas)
  var parchCache = {};
  function parchment(S) {
    if (parchCache[S]) { return parchCache[S]; }
    var cv = document.createElement('canvas'); cv.width = cv.height = S;
    var c = cv.getContext('2d'), seed = 7;
    function r() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    c.fillStyle = '#e9d6a6'; c.fillRect(0, 0, S, S);
    var i, n = Math.round(S * S / 900);
    for (i = 0; i < n; i++) { // manchas grandes e suaves
      var x = r() * S, y = r() * S, rad = S * (0.04 + r() * 0.12), g = c.createRadialGradient(x, y, 0, x, y, rad);
      var tone = r() < 0.5 ? '150,105,45' : '255,245,215';
      g.addColorStop(0, 'rgba(' + tone + ',' + (0.05 + r() * 0.07) + ')'); g.addColorStop(1, 'rgba(' + tone + ',0)');
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (i = 0; i < S * S / 60; i++) { // grão do papel
      c.fillStyle = r() < 0.5 ? 'rgba(110,70,25,' + (r() * 0.09) + ')' : 'rgba(255,250,230,' + (r() * 0.12) + ')';
      c.fillRect(r() * S, r() * S, 1, 1);
    }
    var v = c.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.74); // bordas queimadas
    v.addColorStop(0, 'rgba(120,70,20,0)'); v.addColorStop(0.75, 'rgba(120,70,20,.28)'); v.addColorStop(1, 'rgba(70,35,10,.75)');
    c.fillStyle = v; c.fillRect(0, 0, S, S);
    parchCache[S] = cv; return cv;
  }
  var INK = '#3b2414', INK2 = 'rgba(59,36,20,.55)', WAX = '#8e1c14', GOLD = '#a8730f';
  function compass(c, x, y, R) {
    c.save(); c.translate(x, y);
    c.strokeStyle = INK; c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, R * 0.62, 0, 7); c.stroke();
    c.beginPath(); c.arc(0, 0, R * 0.56, 0, 7); c.stroke();
    for (var i = 0; i < 8; i++) {
      var long = i % 2 === 0, L = long ? R : R * 0.55, w = long ? R * 0.17 : R * 0.12;
      c.save(); c.rotate(i * Math.PI / 4);
      c.beginPath(); c.moveTo(0, -L); c.lineTo(w, 0); c.lineTo(0, 0); c.closePath(); c.fillStyle = i === 0 ? WAX : INK; c.fill();
      c.beginPath(); c.moveTo(0, -L); c.lineTo(-w, 0); c.lineTo(0, 0); c.closePath(); c.fillStyle = '#f1e2bb'; c.fill(); c.stroke();
      c.restore();
    }
    c.fillStyle = INK; c.font = 'bold ' + Math.round(R * 0.42) + 'px "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
    c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillText('N', 0, -R - 1);
    c.restore();
  }
  function label(c, t, x, y, size, italic) {
    c.font = (italic ? 'italic ' : '') + size + 'px "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.strokeStyle = 'rgba(240,226,190,.9)'; c.lineWidth = 3; c.strokeText(t, x, y);
    c.fillStyle = INK; c.fillText(t, x, y);
  }
  function drawMap(cv, S, big) {
    var c = cv.getContext('2d'), B = world.B, k = S / (B * 2);
    var u = big ? Math.max(1, Math.min(1.4, S / (cv.clientWidth || S))) : 1; // mapa encolhido (celular): letras maiores
    function X(x) { return (x + B) * k; }
    function Z(z) { return (z + B) * k; }
    c.setLineDash([]); c.lineCap = 'butt'; c.lineJoin = 'miter';
    c.drawImage(parchment(S), 0, 0);
    var F = V.fence.half, gt0 = V.fence.gate.from, gt1 = V.fence.gate.to, f = F - 0.5;
    // dentro da cerca, um leve tom de terra cultivada
    c.fillStyle = 'rgba(160,120,60,.10)'; c.fillRect(X(-f), Z(-f), f * 2 * k, f * 2 * k);
    // estrada: duas linhas de tinta
    var rx0 = X(V.road.x - V.road.w / 2), rx1 = X(V.road.x + V.road.w / 2), rz0 = Z(V.road.z0), rz1 = Z(V.road.z1);
    c.fillStyle = 'rgba(196,160,98,.45)'; c.fillRect(rx0, rz0, rx1 - rx0, rz1 - rz0);
    c.strokeStyle = INK2; c.lineWidth = big ? 1.2 : 0.8;
    c.beginPath(); c.moveTo(rx0, rz0); c.lineTo(rx0, rz1); c.moveTo(rx1, rz0); c.lineTo(rx1, rz1); c.stroke();
    // praça
    c.fillStyle = 'rgba(196,160,98,.5)'; c.beginPath(); c.arc(X(V.plaza.x), Z(V.plaza.z), V.plaza.r * k, 0, 7); c.fill();
    c.strokeStyle = INK; c.lineWidth = big ? 1.3 : 0.8; c.stroke();
    if (big) { c.strokeStyle = INK2; c.lineWidth = 0.8; c.beginPath(); c.arc(X(V.plaza.x), Z(V.plaza.z), V.plaza.r * k - 4, 0, 7); c.stroke(); }
    // cerca: linha dupla com postes, aberta no portão
    c.strokeStyle = INK; c.lineWidth = big ? 1.6 : 1;
    c.beginPath();
    c.moveTo(X(gt0), Z(f)); c.lineTo(X(-f), Z(f)); c.lineTo(X(-f), Z(-f)); c.lineTo(X(f), Z(-f)); c.lineTo(X(f), Z(f)); c.lineTo(X(gt1), Z(f));
    c.stroke();
    if (big) {
      c.fillStyle = INK;
      for (var t = -f; t <= f + 0.01; t += 2.5) {
        [[t, -f], [-f, t], [f, t]].concat(t < gt0 || t > gt1 ? [[t, f]] : []).forEach(function (q) { c.fillRect(X(q[0]) - 1.5, Z(q[1]) - 1.5, 3, 3); });
      }
    }
    // casas: tinta sépia com hachura
    world.buildings.forEach(function (b) {
      var x = X(b.x0), z = Z(b.z0), w = (b.x1 - b.x0) * k, h = (b.z1 - b.z0) * k;
      c.fillStyle = 'rgba(122,72,34,.55)'; c.fillRect(x, z, w, h);
      if (big) {
        c.save(); c.beginPath(); c.rect(x, z, w, h); c.clip();
        c.strokeStyle = 'rgba(59,36,20,.35)'; c.lineWidth = 1;
        for (var d = -h; d < w; d += 6) { c.beginPath(); c.moveTo(x + d, z + h); c.lineTo(x + d + h, z); c.stroke(); }
        c.restore();
      }
      c.strokeStyle = INK; c.lineWidth = big ? 1.6 : 0.9; c.strokeRect(x, z, w, h);
    });
    // árvores e veios
    world.nodes.forEach(function (n) {
      var alive = st.nodes[n.id].alive, x = X(n.x), z = Z(n.z);
      if (n.kind === 'arvore') {
        var r = Math.max(1.8, k * 0.95);
        if (!alive) { c.fillStyle = 'rgba(59,36,20,.4)'; c.fillRect(x - 1.5, z - 1, 3, 2); return; }
        if (big) { c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, z); c.lineTo(x, z + r * 1.1); c.stroke(); }
        c.fillStyle = 'rgba(88,104,44,.75)'; c.beginPath(); c.arc(x, z - (big ? r * 0.25 : 0), r, 0, 7); c.fill();
        c.strokeStyle = INK; c.lineWidth = big ? 1.1 : 0.7; c.stroke();
      } else {
        var s2 = Math.max(2.2, k * 0.75);
        c.beginPath(); c.moveTo(x - s2, z + s2 * 0.6); c.lineTo(x - s2 * 0.2, z - s2); c.lineTo(x + s2 * 0.3, z - s2 * 0.3); c.lineTo(x + s2, z + s2 * 0.6); c.closePath();
        c.fillStyle = alive ? 'rgba(120,112,98,.75)' : 'rgba(120,112,98,.25)'; c.fill();
        c.strokeStyle = alive ? INK : INK2; c.lineWidth = big ? 1.1 : 0.7; c.stroke();
      }
    });
    // coelhos
    c.fillStyle = '#6b4424';
    st.mobs.forEach(function (m) { if (m.alive) { c.beginPath(); c.arc(X(m.x), Z(m.z), big ? 2.4 : 1.4, 0, 7); c.fill(); } });
    // gente: tinta azul
    world.npcs.forEach(function (n) {
      c.fillStyle = '#2c4a7a'; c.strokeStyle = '#f1e2bb'; c.lineWidth = 1;
      c.beginPath(); c.arc(X(n.x), Z(n.z), Math.max(2, k * 0.5), 0, 7); c.fill(); c.stroke();
    });
    if (big) {
      V.buildings.forEach(function (b) { label(c, { igreja: 'Igreja', ferreiro: 'Ferreiro', bar: 'Bar' }[b.type], X(b.x), Z(b.z), Math.round(14 * u), false); });
      label(c, 'Praça', X(V.plaza.x), Z(V.plaza.z), Math.round(12 * u), true);
      label(c, 'Portão', X(V.road.x) + 22 + 8 * u, Z(F) + 8 * u, Math.round(11 * u), true);
      compass(c, S - 36, S - 40, 22);
      // moldura de linha dupla
      c.strokeStyle = INK; c.lineWidth = 1.2; c.strokeRect(5.5, 5.5, S - 11, S - 11);
      c.lineWidth = 0.7; c.strokeRect(9.5, 9.5, S - 19, S - 19);
    }
    // área da macro
    var a = st.player.macro.area;
    if (a) {
      c.fillStyle = 'rgba(200,150,40,.12)'; c.beginPath(); c.arc(X(a.x), Z(a.z), a.r * k, 0, 7); c.fill();
      c.strokeStyle = macroOn() ? GOLD : 'rgba(168,115,15,.6)'; c.lineWidth = big ? 2.2 : 1.2; c.stroke();
    }
    if (big && mapArmed) {
      var hv = mapHover || { x: st.player.x, z: st.player.z };
      c.fillStyle = 'rgba(214,160,40,.18)'; c.beginPath(); c.arc(X(hv.x), Z(hv.z), G.settings.macroRadius * k, 0, 7); c.fill();
      c.strokeStyle = '#b07a10'; c.lineWidth = 2.6; c.setLineDash([7, 5]); c.stroke(); c.setLineDash([]);
      c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); c.moveTo(X(hv.x) - 5, Z(hv.z)); c.lineTo(X(hv.x) + 5, Z(hv.z)); c.moveTo(X(hv.x), Z(hv.z) - 5); c.lineTo(X(hv.x), Z(hv.z) + 5); c.stroke();
    }
    if (big && mapHover && !mapArmed) { c.strokeStyle = WAX; c.lineWidth = 1.5; c.beginPath(); c.arc(X(mapHover.x), Z(mapHover.z), 6, 0, 7); c.stroke(); }
    // destino: um X de lacre
    var gt = st.player.goto;
    if (gt) { var gx = X(gt.x), gz = Z(gt.z), q = big ? 6 : 3; c.strokeStyle = WAX; c.lineWidth = big ? 3 : 1.8; c.lineCap = 'round'; c.beginPath(); c.moveTo(gx - q, gz - q); c.lineTo(gx + q, gz + q); c.moveTo(gx + q, gz - q); c.lineTo(gx - q, gz + q); c.stroke(); c.lineCap = 'butt'; }
    // jogador: seta vermelho-lacre
    var p = st.player, px = X(p.x), pz = Z(p.z), y = view ? view.yaw : p.yaw, r2 = big ? 10 * u : 6.5;
    c.fillStyle = WAX; c.strokeStyle = '#f6ead0'; c.lineWidth = big ? 1.6 : 1.1; c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(px + Math.sin(y) * r2, pz + Math.cos(y) * r2);
    c.lineTo(px + Math.sin(y + 2.5) * r2 * 0.75, pz + Math.cos(y + 2.5) * r2 * 0.75);
    c.lineTo(px + Math.sin(y + Math.PI) * r2 * 0.3, pz + Math.cos(y + Math.PI) * r2 * 0.3);
    c.lineTo(px + Math.sin(y - 2.5) * r2 * 0.75, pz + Math.cos(y - 2.5) * r2 * 0.75);
    c.closePath(); c.stroke(); c.fill();
    c.strokeStyle = INK; c.lineWidth = 0.8; c.stroke();
  }
  function mapPoint(e) {
    var cv = $('bigmap'), r = cv.getBoundingClientRect(), B = world.B;
    return { x: (e.clientX - r.left) / r.width * B * 2 - B, z: (e.clientY - r.top) / r.height * B * 2 - B };
  }

  // ---------- janelas ----------
  function show(id) {
    if (openWin === 'w-new' && !st.player.name && id !== 'w-new') { return; }
    hide(); openWin = id; $(id).hidden = false; keys = {}; pad = {}; guardClicks();
  }
  // o toque que abre uma janela gera, logo depois, um clique fantasma no mesmo ponto;
  // por meio segundo a janela ignora cliques, para ele não escolher uma opção sozinho
  var guardUntil = 0, lastPointer = 'mouse';
  window.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType; }, true);
  function guardClicks() { if (lastPointer === 'touch') { guardUntil = performance.now() + 500; } }
  function hide() {
    if (openWin === 'w-new' && !st.player.name) { return; } // sem nome não se joga
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

  // ---------- inventário e bolsa ----------
  function mult(v) { return '×' + String(v).replace('.', ','); }
  function renderInv() {
    var p = st.player, mh = calc.maxHp(world, p), w = G.weapon[p.weapon], S = G.stances[p.stance];
    $('iv-hp-bar').style.width = Math.max(0, p.hp / mh * 100) + '%';
    $('iv-hp').textContent = Math.ceil(Math.max(0, p.hp)) + ' / ' + mh;
    $('iv-wpn').textContent = w.name;
    $('iv-atk').textContent = 'Ataque ' + calc.atk(world, p) + (w.atk ? ' (+' + w.atk + ' da arma)' : ' (a arma não soma ataque)');
    Array.prototype.forEach.call(document.querySelectorAll('[data-stance]'), function (b) {
      var id = b.dataset.stance, on = id === p.stance;
      if (!b.textContent) { b.textContent = G.stances[id].name; }
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('iv-stance').textContent = 'Dano causado ' + mult(S.dmg) + ' · dano recebido ' + mult(S.taken);
    var n = p.inv.pocao || 0;
    $('iv-pots').textContent = n + ' ' + (n === 1 ? 'poção' : 'poções');
    $('iv-drink').disabled = !n;
  }
  function renderBag() {
    var p = st.player, cap = G.settings.bagCapacity, used = calc.bagCount(world, p), html = [];
    for (var k in p.inv) {
      if (!(p.inv[k] > 0) || !G.items[k] || G.items[k].noBag) { continue; }
      var res = Math.min(p.inv[k], sim.reserved(st, k));
      html.push('<li><span>' + esc(G.items[k].name) + (res ? ' <small>(' + res + ' para missão)</small>' : '') + '</span><b>' + p.inv[k] + '</b></li>');
    }
    var h = html.join('');
    if ($('bg-list').innerHTML !== h) { $('bg-list').innerHTML = h; }
    $('bg-empty').hidden = !!html.length;
    $('bg-cap').textContent = 'Ocupado: ' + used + ' de ' + cap;
    $('bg-coins').textContent = 'Moedas: ' + (p.inv.moeda || 0);
    $('bg-bar').style.width = Math.min(100, used / cap * 100) + '%';
    $('bg-bar').parentNode.classList.toggle('full', used >= cap);
  }
  function drinkPotion() {
    var p = st.player, msg;
    if (sim.drink(st)) { msg = 'Bebeu uma poção (+' + G.player.potionHeal + ' de vida).'; }
    else if (!(p.inv.pocao > 0)) { msg = 'Sem poções. O Padre vende.'; }
    else if (p.hp >= calc.maxHp(world, p)) { msg = 'A vida já está cheia.'; }
    else { msg = 'Agora não: espere um instante.'; }
    handleEvents();
    if (openWin === 'w-inv') { $('iv-res').textContent = msg; renderInv(); } else { toast(msg); }
  }
  function setStance(id) {
    var p = st.player; p.stance = id || (p.stance === 'ofensiva' ? 'defensiva' : 'ofensiva');
    if (openWin === 'w-inv') { renderInv(); $('iv-res').textContent = ''; }
    else { toast('Postura ' + G.stances[p.stance].name.toLowerCase() + '.'); }
  }

  // ---------- criação do personagem ----------
  function showNew() {
    show('w-new'); $('new-name').value = ''; $('new-err').hidden = true;
    setTimeout(function () { try { $('new-name').focus(); } catch (e) { /* nada */ } }, 50);
  }
  function qty(n, k) { var it = G.items[k]; return n + ' ' + (n === 1 ? it.name : (it.plural || it.name)).toLowerCase(); }
  function fill(t) { return String(t).replace(/\{nome\}/g, st.player.name); }

  // ---------- conversa: árvore de diálogo, missões e serviços ----------
  function openNpc(id) {
    show('w-npc'); npcOpen = id;
    $('npc-name').textContent = G.npcs[id].name; $('npc-res').textContent = '';
    talk(id);
  }
  function setTalk(text, opts, prog) {
    guardClicks();
    $('npc-text').textContent = fill(text);
    var pr = $('npc-prog'); pr.hidden = !prog; pr.textContent = prog || '';
    var box = $('npc-opts'); box.innerHTML = '';
    (opts || []).forEach(function (o) {
      var b = document.createElement('button'); b.type = 'button'; b.className = o.cls || 'opt'; b.textContent = fill(o.text);
      b.onclick = o.fn; box.appendChild(b);
    });
  }
  function talk(id, said) {
    var def = G.npcs[id], dlg = def.dialogue && G.dialogues[def.dialogue];
    if (dlg && !st.flags[dlg.flag]) { $('npc-acts').innerHTML = ''; dialogueNode(id, dlg, dlg.start); return; }
    var q = sim.npcQuest(st, id);
    if (said) { setTalk(said); }
    else if (q && q.state === 'available') {
      var Q = G.quests[q.id];
      setTalk(Q.offer, [
        { text: 'Aceitar: ' + Q.title, fn: function () { sim.acceptQuest(st, q.id); handleEvents(); save(); talk(id, Q.active); } },
        { text: 'Agora não', fn: function () { talk(id, def.idle || ''); } }
      ]);
    } else if (q && q.state === 'ready') {
      var R = G.quests[q.id];
      setTalk(R.active, [{ text: 'Entregar ' + objText(q.id, true), cls: 'main', fn: function () {
        sim.turnInQuest(st, q.id); handleEvents(); save(); talk(id, R.done + rewardText(R));
      } }], progText(q.id));
    } else if (q && q.state === 'active') {
      setTalk(G.quests[q.id].active, [], progText(q.id));
    } else { setTalk(def.after || def.idle || ''); }
    renderNpcActs(id);
  }
  function dialogueNode(id, dlg, nodeId) {
    var node = dlg.nodes[nodeId];
    setTalk(node.text, node.options.map(function (o) {
      return { text: o.text, fn: function () {
        if (o.next) { dialogueNode(id, dlg, o.next); return; }
        if (o.end) { st.flags[dlg.flag] = true; save(); hide(); }
      } };
    }));
  }
  function objText(qid, plain) {
    return G.quests[qid].objectives.map(function (o) {
      var name = o.type === 'collect' ? G.items[o.item].name.toLowerCase() : G.monsters[o.target].name.toLowerCase();
      if (plain) { return o.type === 'collect' ? qty(o.n, o.item) : o.n + ' ' + name; }
      return name + ' ' + sim.objProgress(st, qid, o) + '/' + o.n;
    }).join(', ');
  }
  function progText(qid) { return 'Missão: ' + G.quests[qid].title + ' · ' + objText(qid); }
  function rewardText(Q) {
    var r = Q.reward || {}, parts = [];
    for (var k in (r.items || {})) { parts.push(qty(r.items[k], k)); }
    if (r.xp) { parts.push(r.xp + ' de experiência'); }
    return parts.length ? ' (Recebeu ' + parts.join(', ') + '.)' : '';
  }
  function renderQuests() {
    var html = [];
    Object.keys(st.quests).forEach(function (id) {
      var s = sim.questState(st, id); if (s !== 'active' && s !== 'ready') { return; }
      var Q = G.quests[id];
      html.push('<li class="' + s + '">' + esc(Q.title) + '<br><small>' +
        (s === 'ready' ? 'entregar a ' + esc(G.npcs[Q.giver].name) : esc(objText(id))) + '</small></li>');
    });
    $('quests').innerHTML = html.join('');
  }
  // ! = tem algo a dizer ou missão a oferecer · ? = missão pronta para entregar
  var markEls = {};
  function marks() {
    world.npcs.forEach(function (n) {
      var el = markEls[n.id];
      if (!el) { el = markEls[n.id] = document.createElement('span'); $('marks').appendChild(el); }
      var def = G.npcs[n.id], dlg = def.dialogue && G.dialogues[def.dialogue], q = sim.npcQuest(st, n.id), sym = '';
      if (dlg && !st.flags[dlg.flag]) { sym = '!'; }
      else if (q && q.state === 'available') { sym = '!'; }
      else if (q && q.state === 'ready') { sym = '?'; }
      var pos = sym && calc.dist(st.player.x, st.player.z, n.x, n.z) < 40 ? view.project(n.x, 2.25, n.z) : null;
      if (!pos || pos.x < 0 || pos.x > 1 || pos.y < 0 || pos.y > 1) { el.hidden = true; return; }
      el.hidden = false; el.textContent = sym; el.className = sym === '?' ? 'q' : '';
      el.style.left = (pos.x * 100) + '%'; el.style.top = (pos.y * 100) + '%';
    });
  }
  function renderNpcActs(id) {
    var def = G.npcs[id], box = $('npc-acts'), p = st.player; box.innerHTML = '';
    def.services.forEach(function (s) {
      if (s.type === 'sell') { box.appendChild(sellBox(id, s)); return; }
      var b = document.createElement('button'); b.type = 'button';
      if (s.type === 'heal') { b.textContent = 'Pedir cura (grátis)'; }
      if (s.type === 'buy') { b.textContent = 'Comprar ' + G.items[s.item].name.toLowerCase() + ' (' + G.items[s.item].price + ' moedas)'; }
      if (s.type === 'upgrade') {
        var nx = G.weapon[p.weapon + 1];
        b.textContent = nx ? 'Melhorar para ' + nx.name + ' (' + Object.keys(nx.cost).map(function (k) { return qty(nx.cost[k], k); }).join(' + ') + ')' : 'Espada já está no máximo';
        b.disabled = !nx;
      }
      b.onclick = function () { npcDone(id, sim.service(st, id, s)); };
      box.appendChild(b);
    });
  }
  function npcDone(id, msg) {
    $('npc-res').textContent = msg; renderNpcActs(id); save();
    if (!$('npc-opts').children.length) { talk(id, $('npc-text').textContent); }
  }
  // uma linha por item que o NPC compra: nome, disponível, preço, quantidade e Vender
  var sellQty = {};
  function sellBox(id, s) {
    var p = st.player, wrap = document.createElement('div');
    wrap.className = 'sell';
    wrap.innerHTML = '<h3>Vender</h3><div class="sell-head"><span>Item</span><span>Tem</span><span>Preço</span><span>Quantos</span><span></span></div>';
    s.items.forEach(function (k) {
      var it = G.items[k], have = p.inv[k] || 0, can = sim.sellable(st, k), key = id + ':' + k;
      var n = Math.max(1, Math.min(can || 1, sellQty[key] || 1));
      var row = document.createElement('div'); row.className = 'sell-row' + (can ? '' : ' off');
      row.innerHTML = '<span class="nm">' + esc(it.name) + (have > can ? '<small>' + (can ? (have - can) + ' fica' + (have - can === 1 ? '' : 'm') + ' para a missão' : 'reservado para a missão') + '</small>' : '') + '</span>' +
        '<span class="av">' + can + '</span><span class="pr">' + it.price + ' <small>cada</small></span>' +
        '<span class="qt"><button type="button" data-d="-1" aria-label="Menos">−</button><output aria-live="polite">' + (can ? n : 0) + '</output><button type="button" data-d="1" aria-label="Mais">+</button></span>' +
        '<button type="button" class="go">Vender</button>';
      var out = row.querySelector('output'), minus = row.querySelector('[data-d="-1"]'), plus = row.querySelector('[data-d="1"]'), go = row.querySelector('.go');
      function sync() {
        out.textContent = can ? n : 0; minus.disabled = !can || n <= 1; plus.disabled = !can || n >= can; go.disabled = !can;
        go.textContent = can ? 'Vender por ' + n * it.price : 'Vender';
        go.setAttribute('aria-label', 'Vender ' + (can ? qty(n, k) : it.name.toLowerCase()));
      }
      minus.onclick = function () { n = Math.max(1, n - 1); sellQty[key] = n; sync(); };
      plus.onclick = function () { n = Math.min(can, n + 1); sellQty[key] = n; sync(); };
      go.onclick = function () { var msg = sim.service(st, id, s, { item: k, n: n }); delete sellQty[key]; npcDone(id, msg); };
      sync(); wrap.appendChild(row);
    });
    return wrap;
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
      if (sim.takeControl(st)) { toast('Macro pausada.'); }
      p.goto = null; p.action = { type: 'gather', id: ref.id, prog: 0 };
      return;
    }
    if (ref.type === 'mob') {
      if (sim.takeControl(st)) { toast('Macro pausada.'); }
      p.goto = null; p.action = { type: 'attack', id: ref.id };
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
    if (c === 'map') { if (openWin === 'w-map') { hide(); } else { openMap(false); } }
    else if (c === 'rules') { toggle('w-rules', renderRules); }
    else if (c === 'menu') { toggle('w-menu'); }
    else if (c === 'inv') { toggle('w-inv', function () { $('iv-res').textContent = ''; }); if (openWin === 'w-inv') { renderInv(); } }
    else if (c === 'bag') { toggle('w-bag'); if (openWin === 'w-bag') { renderBag(); } }
    else if (c === 'stance') { setStance(); }
    else if (c === 'potion') { drinkPotion(); }
    else if (c === 'macro') {
      if (pauseMacro()) { toast('Macro pausada.'); if (openWin === 'w-map') { mapMenu = false; mapUi(); } }
      else if (openWin === 'w-map') { mapArmed = false; mapMenu = !mapMenu; mapUi(); }
      else { openMap(true); }
    }
  }

  function debug(c) {
    if (c === 'reset') {
      try { localStorage.removeItem(G.settings.saveKey); } catch (e) { /* nada */ }
      st = ZG.newState(world, (Date.now() % 2147483647) | 0); view.yaw = st.player.yaw; renderLog(); hide(); showNew(); return;
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
      var map = { KeyM: 'map', KeyR: 'rules', KeyT: 'stance', KeyF: 'potion', KeyG: 'macro', KeyI: 'inv', KeyB: 'bag' };
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

    Array.prototype.forEach.call(document.querySelectorAll('.win'), function (w) {
      w.addEventListener('click', function (e) { if (performance.now() < guardUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
    });
    $('new-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var n = $('new-name').value.replace(/\s+/g, ' ').trim();
      if (n.length < 2 || n.length > 20) { $('new-err').textContent = 'Escolha um nome de 2 a 20 letras.'; $('new-err').hidden = false; return; }
      st.player.name = n; save(); hide(); toast('Bem-vindo à vila, ' + n + '.', 3);
    });
    $('mini').addEventListener('click', function () { cmd('map'); });
    var big = $('bigmap');
    big.addEventListener('pointermove', function (e) { mapHover = mapPoint(e); });
    big.addEventListener('pointerleave', function () { mapHover = null; });
    big.addEventListener('click', function (e) {
      var pt = mapPoint(e), wasMacro = macroOn();
      if (mapMenu) { mapMenu = false; mapUi(); return; } // clique fora do menu só fecha o menu
      mapHover = null;
      if (mapArmed) { sim.startMacro(st, pt); mapArmed = false; hide(); toast('Área marcada. O personagem vai trabalhar lá.'); return; }
      if (sim.goTo(st, pt.x, pt.z)) { hide(); toast(wasMacro ? 'Macro pausada. Indo até o ponto marcado.' : 'Indo até o ponto marcado.'); }
    });
    $('map-macro').addEventListener('click', function () { if (mapArmed) { mapArmed = false; } else { mapMenu = !mapMenu; } mapUi(); });
    $('mm-pick').addEventListener('click', function () { mapMenu = false; mapArmed = true; mapUi(); });
    $('mm-prev').addEventListener('click', function () { mapMenu = false; if (sim.startMacro(st)) { mapArmed = false; hide(); toast('Macro retomada na área anterior.'); } });
    $('mm-rules').addEventListener('click', function () { mapMenu = false; mapArmed = false; show('w-rules'); renderRules(); });
    $('mm-pause').addEventListener('click', function () { mapMenu = false; pauseMacro(); mapUi(); toast('Macro pausada.'); });
    $('iv-drink').addEventListener('click', function () { drinkPotion(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-stance]'), function (b) { b.addEventListener('click', function () { setStance(b.dataset.stance); }); });

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
