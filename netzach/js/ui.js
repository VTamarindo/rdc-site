/* Netzach · interface, entrada, laço de tempo e save (protótipo da vila) */
(function (NZ) {
  'use strict';
  // TODA publicação troca VERSION aqui e o ?v= no index.html: o Cloudflare guarda js e css por 4 h no navegador,
  // e com o mesmo ?v= o HTML novo roda com o código velho. SAVE_VER só muda quando o jogo deve recomeçar do zero.
  var VERSION = '20261107-9', SAVE_VER = '20261105-3';
  var $ = function (id) { return document.getElementById(id); };
  // relógio do jogo: a hora do site, contada pelo relógio interno do navegador, que não muda com a data do aparelho.
  // sem resposta do site, usa a hora do aparelho; aí as diárias só aceitam datas que avançam (ver dayNum em sim.js)
  var clock = null, clockShift = 0;
  function clockNow() { return (clock ? clock.base + performance.now() - clock.perf : Date.now()) + clockShift; }
  function clockSync() {
    var ask = fetch(location.pathname, { method: 'HEAD', cache: 'no-store' }).then(function (r) {
      var d = Date.parse(r.headers.get('Date'));
      if (d) { clock = { base: d, perf: performance.now() }; }
    }).catch(function () { /* sem site: segue com o relógio que já tem */ });
    return Promise.race([ask, new Promise(function (ok) { setTimeout(ok, 2500); })]);
  }
  var calc = NZ.calc;
  var G, V, world, sim, st, view;
  var DT, CAP, THRESH;
  var lastReal = clockNow(), acc = 0, prev = null, away = null;
  var keys = {}, pad = {}, lookHold = 0, drag = null, hoverRef = null, ctrl = null;
  var newVersion = false;
  var dailyNext = 0; // quando as missões diárias reiniciam (ms do relógio real)
  var LINE_MS = 10000, lineTxt = null, lineEnd = 0, hintSeen = false;
  var openWin = null, npcOpen = null, toastT = 0, baseTitle = document.title;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var isTouch = ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches);

  // ---------- carregar ----------
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(function () { /* sem ele, o jogo só não abre sem internet */ }); }
  function getJSON(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) { throw new Error(u); } return r.json(); }); }
  Promise.all([getJSON('data/game.json?v=' + VERSION), getJSON('data/vila.json?v=' + VERSION), NZ.loadArt('art/', VERSION), clockSync()]).then(function (d) { start(d[0], d[1], d[2]); })
    .catch(function (e) { $('loading').textContent = 'Não foi possível carregar os dados (' + e.message + '). Abra por um servidor, não direto do arquivo.'; });

  function start(game, vila, art) {
    G = game; V = vila;
    DT = G.settings.tickSec; CAP = G.settings.offlineCapHours * 3600; THRESH = G.settings.returnThresholdSec;
    world = new NZ.World(G, V); sim = new NZ.Sim(world);
    var saved = load();
    if (saved) { st = NZ.settle(world, NZ.migrate(saved.state)); lastReal = saved.lastReal || clockNow(); }
    else { st = NZ.newState(world, (Date.now() % 2147483647) | 0); lastReal = clockNow(); }

    view = new NZ.View($('view'), world, art);
    view.yaw = st.player.yaw;
    $('loading').hidden = true; $('hud').hidden = false; $('ver').textContent = VERSION;
    if (isTouch) { document.body.classList.add('touch'); $('pad').hidden = false; $('menu-ctrl').hidden = false; ctrlSet(ctrlLoad()); }
    if (/romancedecavalaria|localhost|127\.0\.0\.1/.test(location.hostname)) { $('back-site').hidden = false; }
    bindInput(); ctrl = NZ.controle(ctrlApi()); resize(); window.addEventListener('resize', resize);
    setInterval(clockSync, 600000); // o relógio interno pode parar com o computador suspenso
    fullUi(); document.addEventListener('fullscreenchange', fullUi); document.addEventListener('webkitfullscreenchange', fullUi);
    NZ.debug = { state: function () { return st; }, view: function () { return view; }, sim: sim, interact: function (ref) { interact(ref); }, clockNow: clockNow, clockShift: function (ms) { clockShift += ms; } }; // para testes
    renderLog();

    if (saved) { beginAway(lastReal); endAway(clockNow()); }
    if (!st.player.name) { showNew(); if (newVersion) { $('new-err').hidden = false; $('new-err').textContent = 'Versão nova do protótipo (' + VERSION + '): o jogo recomeçou do zero.'; } }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { beginAway(clockNow()); save(); }
      else { if (away) { endAway(clockNow()); } document.title = baseTitle; clockSync(); }
    });
    window.addEventListener('pagehide', save);
    setInterval(function () { if (away) { catchUp(clockNow()); } save(); }, 5000);
    requestAnimationFrame(frame);
  }

  // ---------- save ----------
  function save() {
    try { localStorage.setItem(G.settings.saveKey, JSON.stringify({ v: 1, ver: SAVE_VER, lastReal: lastReal, state: st })); } catch (e) { /* sem armazenamento: segue sem salvar */ }
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(G.settings.saveKey));
      if (!(s && s.v === 1 && s.state)) { return null; }
      // protótipo: SAVE_VER novo = jogo recomeça do zero (sem precisar limpar o cache)
      if (G.settings.resetSaveOnNewVersion && s.ver !== SAVE_VER) { localStorage.removeItem(G.settings.saveKey); newVersion = true; return null; }
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
    var now = clockNow(), gap = (now - lastReal) / 1000;
    if (away) { return; }
    if (gap > THRESH) { beginAway(lastReal); endAway(now); return; }
    lastReal = now;

    ctrl.tick(fdt);
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
    view.render(st, prev, Math.min(1, acc / DT), fdt, { interp: auto, moving: moving || autoMoving, now: now, clock: clockNow() });
    hud(); marks();
    if (npcOpen && !sim.nearNpc(st, npcOpen)) { hide(); }
  }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) { d -= Math.PI * 2; } while (d < -Math.PI) { d += Math.PI * 2; } return d; }

  function manualMove(dt) {
    if (openWin && openWin !== 'w-report') { return false; }
    // pad.sf e pad.ss: o analógico da tela; pad.gf e pad.gs: o do controle. Todos de -1 a 1
    var f = (keys.KeyW || keys.ArrowUp || pad.fwd ? 1 : 0) - (keys.KeyS || keys.ArrowDown || pad.back ? 1 : 0) + (pad.sf || 0) + (pad.gf || 0);
    var s = (keys.KeyD || pad.right ? 1 : 0) - (keys.KeyA || pad.left ? 1 : 0) + (pad.ss || 0) + (pad.gs || 0);
    var turn = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
    if (!f && !s && !turn) { return false; }
    if (sim.takeControl(st)) { toast('Macro pausada: você assumiu o controle.'); }
    view.yaw += turn * G.player.turnSpeed * dt;
    if (!f && !s) { return false; }
    var y = view.yaw, fx = Math.sin(y), fz = Math.cos(y), rx = -Math.cos(y), rz = Math.sin(y);
    var vx = fx * f + rx * s, vz = fz * f + rz * s, l = Math.hypot(vx, vz), spd = G.player.walkSpeed * dt * Math.min(1, l); // teclas dão l >= 1; o analógico, a intensidade
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
      else if (e.type === 'quest') { toast('Missão concluída: ' + (G.quests[e.id] || G.daily.quests[e.id]).title + '.', 3); }
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
    $('lv').textContent = 'Nível ' + p.lv + ' · ' + p.rep + ' rp';
    $('pots').textContent = 'Poções ' + (p.inv.pocao || 0);
    $('coins').textContent = 'Moedas ' + (p.inv.moeda || 0);
    $('bag').textContent = 'Bolsa ' + calc.bagCount(world, p) + '/' + G.settings.bagCapacity;
    if (openWin === 'w-inv') { renderInv(); }
    if (openWin === 'w-bag') { renderBag(); }
    dailyTick();
    if (openWin === 'w-npc') { sellTick(); }

    var line = $('macro-line'), on = p.mode === 'macro' && p.macro.on;
    var busy = on || !!p.goto, now = performance.now();
    var hint = isTouch ? 'Toque no mapa pequeno, no canto, para andar ou usar a macro' : p.mapNav === 'macro' ? 'Mapa (M): clique para a macro trabalhar · Caminhada: para só andar' : 'Mapa (M): clique para andar · Macro (G): escolha a área de trabalho';
    var txt = on ? 'Macro: ' + macroText(p) : p.goto ? 'Andando até o ponto marcado no mapa' : (p.macro.stop || hint);
    // o que está acontecendo fica na tela; dica e aviso de parada somem depois de LINE_MS, e a dica só aparece uma vez
    if (txt !== lineTxt) { lineTxt = txt; line.textContent = txt; lineEnd = txt === hint && hintSeen ? 0 : now + LINE_MS; }
    if (!p.name) { lineEnd = now + LINE_MS; } // a contagem só começa depois de criar o personagem
    if (txt === hint && now >= lineEnd) { hintSeen = true; }
    line.classList.toggle('on', busy);
    line.classList.toggle('fade', !busy && now >= lineEnd);
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
  // mapArmed: o próximo clique, avulso ('macro', 'caminhada' ou false); mapMenu: o submenu aberto (idem)
  var mapHover = null, mapArmed = false, mapMenu = false, mapTipT = 0;
  // zoom do mapa grande: mapZ é a ampliação; (mapCx, mapCz), o ponto do mundo no centro da janela.
  // mapDragged: o gesto atual passou de MAP_DRAG_MIN pixels e virou arrasto, então não é clique
  var mapZ = 1, mapZMax = 3, mapCx = 0, mapCz = 0, mapDrag = null, mapDragged = false, MAP_DRAG_MIN = 8;
  function mapLimit() { // a janela nunca sai da imagem
    var h = world.B * (1 - 1 / mapZ);
    mapCx = Math.max(-h, Math.min(h, mapCx)); mapCz = Math.max(-h, Math.min(h, mapCz));
  }
  // v vai de 0 a 100 em escala geométrica: cada passo amplia na mesma proporção, seja qual for o tamanho da vila
  function mapZoomTo(v) {
    v = Math.max(0, Math.min(100, v));
    var z = Math.pow(mapZMax, v / 100), p = st.player, h = world.B / mapZ;
    if (Math.abs(p.x - mapCx) <= h && Math.abs(p.z - mapCz) <= h) { // o jogador à vista fica parado na janela
      mapCx = p.x - (p.x - mapCx) * mapZ / z; mapCz = p.z - (p.z - mapCz) * mapZ / z;
    }
    mapZ = z; mapLimit();
    var r = $('map-zoom'); r.value = v; r.style.setProperty('--p', v + '%');
    r.setAttribute('aria-valuetext', z.toFixed(1) + ' vezes');
    $('map-zval').textContent = z.toFixed(1) + '×';
    $('map-zout').disabled = v <= 0; $('map-zin').disabled = v >= 100;
    drawMap($('bigmap'), 560, true);
  }
  function macroOn() { return st.player.mode === 'macro' && st.player.macro.on; }
  // o que o próximo clique no mapa vai fazer: o armado vale mais que o padrão
  function mapNext() { return mapArmed || st.player.mapNav; }
  // estado dos controles da janela do mapa (botões Macro e Caminhada embaixo e os menus que eles abrem)
  function mapUi() {
    var a = st.player.macro.area, on = macroOn(), nav = st.player.mapNav, mb = $('map-macro'), wb = $('map-walk');
    var mOpen = mapMenu === 'macro', wOpen = mapMenu === 'caminhada', box = mOpen ? $('map-menu') : wOpen ? $('map-walk-menu') : null;
    var mapText = mapArmed === 'macro'
      ? 'Macro armada: clique onde o personagem deve trabalhar sozinho (o círculo dourado mostra a área).'
      : mapArmed === 'caminhada' ? (on ? 'Caminhada armada: clique num ponto para pausar a macro e andar até lá.' : 'Caminhada armada: clique no ponto até onde o personagem deve andar.')
      : nav === 'macro' ? (on ? 'A macro está trabalhando e é o padrão. Um clique no mapa muda a área de trabalho para o ponto.' : 'Macro é o padrão: clique onde o personagem deve trabalhar sozinho.')
      : on ? 'A macro está trabalhando na área marcada. Um clique no mapa pausa e leva o personagem até o ponto.'
      : 'Clique num ponto para o personagem andar até lá.';
    $('map-hint').textContent = ctrl && ctrl.active() ? mapText.replace(/Um clique/g, 'O botão A').replace(/clique/g, 'aperte A').replace(/Clique/g, 'Aperte A')
      : isTouch ? mapText.replace(/clique/g, 'toque').replace(/Clique/g, 'Toque') : mapText; // no celular não existe clique
    mb.setAttribute('aria-pressed', mapArmed === 'macro' ? 'true' : 'false');
    mb.setAttribute('aria-expanded', mOpen ? 'true' : 'false');
    mb.textContent = mapArmed === 'macro' ? 'Macro armada · cancelar' : (on ? 'Macro (trabalhando) ' : 'Macro ') + (mOpen ? '▾' : '▴');
    mb.classList.toggle('padrao', nav === 'macro');
    mb.title = nav === 'macro' ? 'Macro (G) · padrão do mapa' : 'Macro (G)';
    wb.setAttribute('aria-pressed', mapArmed === 'caminhada' ? 'true' : 'false');
    wb.setAttribute('aria-expanded', wOpen ? 'true' : 'false');
    wb.textContent = mapArmed === 'caminhada' ? 'Caminhada armada · cancelar' : 'Caminhada ' + (wOpen ? '▾' : '▴');
    wb.classList.toggle('padrao', nav === 'caminhada');
    wb.title = nav === 'caminhada' ? 'Caminhada · padrão do mapa' : 'Caminhada';
    $('map-menu').hidden = !mOpen;
    $('map-walk-menu').hidden = !wOpen;
    $('mm-prev').hidden = !a;
    $('mm-pause').hidden = !on;
    $('mm-def').setAttribute('aria-checked', nav === 'macro' ? 'true' : 'false');
    $('mw-def').setAttribute('aria-checked', nav === 'caminhada' ? 'true' : 'false');
    $('bigmap').classList.toggle('armed', !!mapArmed);
    if (wOpen) { placeWalkMenu(); }
    if (!box) { mapTipOff(); }
    $('map-tip').style.bottom = (box ? box.offsetHeight + 16 : 8) + 'px';
  }
  // o menu da Caminhada abre sobre o seu botão (que muda de lugar com o texto do Macro), sem sair do mapa
  function placeWalkMenu() {
    var m = $('map-walk-menu'), mapbox = m.parentNode, r = mapbox.getBoundingClientRect();
    var bx = $('map-walk').getBoundingClientRect().left - r.left, left = Math.max(6, Math.min(bx, r.width - m.offsetWidth - 6));
    m.style.left = left + 'px'; m.style.setProperty('--seta', (bx - left + 20) + 'px');
  }
  // texto da opção Padrão: com sec fica esse tempo sozinho, porque no toque não existe hover
  function mapTip(b, sec) {
    var t = $('map-tip'); clearTimeout(mapTipT); mapTipT = 0;
    t.textContent = b.dataset.tip; t.hidden = false;
    if (sec) { mapTipT = setTimeout(function () { mapTipT = 0; t.hidden = true; }, sec * 1000); }
  }
  function mapTipOff() { if (!mapTipT) { $('map-tip').hidden = true; } }
  function setMapNav(nav, b, trigger) {
    st.player.mapNav = nav; mapArmed = false; mapMenu = false; save(); mapUi();
    trigger.focus(); // a opção some com o menu: o foco do teclado volta ao botão
    mapTip(b, 4);
  }
  // o mapa grande abre no meio da barra de zoom, centrado em quem joga; 0% mostra o mapa inteiro
  var MAP_OPEN = 50, MINI_ZOOM = 80;
  function openMap() {
    mapArmed = false; mapMenu = false; mapHover = null; mapDrag = null; mapDragged = false; mapCx = st.player.x; mapCz = st.player.z; mapZ = 1;
    clearTimeout(mapTipT); mapTipT = 0; $('map-tip').hidden = true; show('w-map'); mapUi(); mapZoomTo(MAP_OPEN);
  }
  function pauseMacro() {
    if (!macroOn()) { return false; }
    sim.takeControl(st); st.player.macro.stop = isTouch ? 'Macro pausada · marque a área no mapa' : ctrl.active() ? 'Macro pausada · RB para marcar a área' : 'Macro pausada · G para marcar a área';
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
  // tinta de cada região e o desenho que se repete dentro dela (só no que está à vista)
  var REGIAO = { vila: 'rgba(160,120,60,.10)', floresta: 'rgba(60,96,36,.16)', rochas: 'rgba(110,100,86,.2)', campina: 'rgba(176,196,84,.14)' };
  function sorteMapa(i) { var t = Math.sin(i * 12.9898) * 43758.5453; return t - Math.floor(t); }
  // big: mapa grande (zoom da barra, arrastável); senão, o pequeno do canto: zoom fixo, sempre centrado em quem joga
  function drawMap(cv, S, big) {
    var c = cv.getContext('2d'), B = world.B, p = st.player, zm = big ? mapZ : Math.pow(mapZMax, MINI_ZOOM / 100);
    var ox = big ? mapCx : p.x, oz = big ? mapCz : p.z, k = S / (B * 2) * zm, hw = S / 2 / k + 4; // hw: meia janela em metros, com folga
    var u = big ? Math.max(1, Math.min(1.4, S / (cv.clientWidth || S))) : 1; // mapa encolhido (celular): letras maiores
    function X(x) { return (x - ox) * k + S / 2; }
    function Z(z) { return (z - oz) * k + S / 2; }
    function vis(x, z, m) { return Math.abs(x - ox) < hw + (m || 0) && Math.abs(z - oz) < hw + (m || 0); }
    function rect(x0, z0, x1, z1) { c.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k); }
    c.setLineDash([]); c.lineCap = 'butt'; c.lineJoin = 'miter';
    c.fillStyle = '#e2cc98'; c.fillRect(0, 0, S, S); // fora do mundo (o pequeno, perto da borda): papel liso
    var pw = S / zm, sx = (ox + B) / (B * 2) * S - pw / 2, sz = (oz + B) / (B * 2) * S - pw / 2; // o papel acompanha o zoom
    var cx0 = Math.max(0, sx), cz0 = Math.max(0, sz), cx1 = Math.min(S, sx + pw), cz1 = Math.min(S, sz + pw), q = S / pw;
    if (cx1 > cx0 && cz1 > cz0) { c.drawImage(parchment(S), cx0, cz0, cx1 - cx0, cz1 - cz0, (cx0 - sx) * q, (cz0 - sz) * q, (cx1 - cx0) * q, (cz1 - cz0) * q); }

    // regiões: floresta com copinhas, pedregal com pedrinhas, campina com tufos de capim
    var passo = Math.max(5, 26 / k); // um desenho a cada ~26 px, nunca mais denso que 5 m
    (V.regions || []).forEach(function (r) {
      c.fillStyle = REGIAO[r.kind] || 'rgba(0,0,0,0)';
      r.rects.forEach(function (q) {
        if (!vis((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, Math.max(q[2] - q[0], q[3] - q[1]) / 2)) { return; }
        rect(q[0], q[1], q[2], q[3]);
        if (r.kind === 'vila') { return; }
        c.save(); c.beginPath(); c.rect(X(q[0]), Z(q[1]), (q[2] - q[0]) * k, (q[3] - q[1]) * k); c.clip();
        var gx0 = Math.floor(Math.max(q[0], ox - hw) / passo), gx1 = Math.ceil(Math.min(q[2], ox + hw) / passo);
        var gz0 = Math.floor(Math.max(q[1], oz - hw) / passo), gz1 = Math.ceil(Math.min(q[3], oz + hw) / passo);
        c.lineWidth = 1; c.strokeStyle = r.kind === 'floresta' ? 'rgba(52,74,30,.4)' : r.kind === 'rochas' ? 'rgba(80,70,60,.45)' : 'rgba(96,120,40,.45)';
        c.beginPath();
        for (var i = gx0; i <= gx1; i++) { for (var j = gz0; j <= gz1; j++) {
          var n = i * 7919 + j * 104729, x = X((i + sorteMapa(n)) * passo), z = Z((j + sorteMapa(n + 0.5)) * passo), s = 3 + sorteMapa(n + 0.3) * 2;
          if (r.kind === 'floresta') { c.moveTo(x + s, z); c.arc(x, z, s, 0, 6.3); }
          else if (r.kind === 'rochas') { c.moveTo(x - s, z + s * 0.5); c.lineTo(x - s * 0.2, z - s * 0.6); c.lineTo(x + s, z + s * 0.5); c.closePath(); }
          else { c.moveTo(x - s * 0.6, z - s * 0.8); c.lineTo(x, z); c.lineTo(x + s * 0.6, z - s * 0.8); c.moveTo(x, z - s); c.lineTo(x, z); }
        } }
        c.stroke(); c.restore();
      });
    });
    // estrada: duas linhas de tinta
    var rx0 = X(V.road.x - V.road.w / 2), rx1 = X(V.road.x + V.road.w / 2), rz0 = Z(V.road.z0), rz1 = Z(V.road.z1);
    c.fillStyle = 'rgba(196,160,98,.45)'; c.fillRect(rx0, rz0, rx1 - rx0, rz1 - rz0);
    c.strokeStyle = INK2; c.lineWidth = big ? 1.2 : 0.8;
    c.beginPath(); c.moveTo(rx0, rz0); c.lineTo(rx0, rz1); c.moveTo(rx1, rz0); c.lineTo(rx1, rz1); c.stroke();
    // ruas de terra, a avenida calçada (pedras miúdas), plantações e cercados
    c.fillStyle = 'rgba(196,160,98,.38)';
    V.streets.forEach(function (r) { rect(r.x0, r.z0, r.x1, r.z1); });
    var av = V.avenue;
    if (av) {
      c.fillStyle = 'rgba(176,160,132,.55)'; rect(av.x0, av.z0, av.x1, av.z1);
      c.strokeStyle = INK; c.lineWidth = big ? 1.3 : 0.8; c.beginPath();
      c.moveTo(X(av.x0), Z(av.z0)); c.lineTo(X(av.x1), Z(av.z0)); c.moveTo(X(av.x0), Z(av.z1)); c.lineTo(X(av.x1), Z(av.z1)); c.stroke();
      if (big && k > 4) {
        c.fillStyle = 'rgba(59,36,20,.3)';
        for (var ax = Math.ceil(Math.max(av.x0, ox - hw)); ax < Math.min(av.x1, ox + hw); ax += 1.5) { c.fillRect(X(ax), Z((av.z0 + av.z1) / 2) - 1, 2, 2); }
      }
    }
    function canteiro(x0, x1, z0, z1, tinta, risco) {
      c.fillStyle = tinta; rect(x0, z0, x1, z1);
      if (big) { c.strokeStyle = risco; c.lineWidth = 1; c.beginPath(); for (var y = z0 + 1; y < z1; y += Math.max(2, 6 / k)) { c.moveTo(X(x0) + 2, Z(y)); c.lineTo(X(x1) - 2, Z(y)); } c.stroke(); }
    }
    var TINTA = { trigo: ['rgba(214,168,52,.5)', 'rgba(140,96,20,.55)'], cebola: ['rgba(196,136,56,.42)', 'rgba(110,70,24,.5)'],
      nabo: ['rgba(150,88,142,.34)', 'rgba(90,44,84,.5)'], alho_poro: ['rgba(84,140,108,.42)', 'rgba(36,84,64,.5)'] };
    V.fields.forEach(function (f) {
      (f.strips || [f]).forEach(function (s) { canteiro(f.x0, f.x1, s.z0, s.z1, TINTA[s.kind][0], TINTA[s.kind][1]); });
    });
    var P = V.pasture, cercados = [P].concat(V.folds || []);
    cercados.forEach(function (Q) {
      var q0 = Q.x0 + 0.5, q1 = Q.x1 - 0.5, r0 = Q.z0 + 0.5, r1 = Q.z1 - 0.5, g = Q.gate || {};
      c.fillStyle = 'rgba(110,140,50,.2)'; rect(q0, r0, q1, r1);
      c.strokeStyle = INK; c.lineWidth = big ? 1.3 : 0.8; c.beginPath();
      // cada face, aberta na porteira
      [['north', q0, r0, q1, r0], ['east', q1, r0, q1, r1], ['south', q0, r1, q1, r1], ['west', q0, r0, q0, r1]].forEach(function (f) {
        var h = f[2] === f[4]; // face horizontal (ao longo de x)
        if (g.side !== f[0]) { c.moveTo(X(f[1]), Z(f[2])); c.lineTo(X(f[3]), Z(f[4])); return; }
        if (h) { c.moveTo(X(f[1]), Z(f[2])); c.lineTo(X(g.from), Z(f[2])); c.moveTo(X(g.to), Z(f[2])); c.lineTo(X(f[3]), Z(f[2])); }
        else { c.moveTo(X(f[1]), Z(f[2])); c.lineTo(X(f[1]), Z(g.from)); c.moveTo(X(f[1]), Z(g.to)); c.lineTo(X(f[1]), Z(f[4])); }
      });
      c.stroke();
    });
    // praça
    c.fillStyle = 'rgba(196,160,98,.5)'; c.beginPath(); c.arc(X(V.plaza.x), Z(V.plaza.z), V.plaza.r * k, 0, 7); c.fill();
    c.strokeStyle = INK; c.lineWidth = big ? 1.3 : 0.8; c.stroke();
    if (big && V.plaza.r * k > 8) { c.strokeStyle = INK2; c.lineWidth = 0.8; c.beginPath(); c.arc(X(V.plaza.x), Z(V.plaza.z), V.plaza.r * k - 4, 0, 7); c.stroke(); }
    // portão: os dois mourões na estrada
    var pv = V.gate;
    if (pv) { c.fillStyle = INK; [-1, 1].forEach(function (s) { var x = X(pv.x + s * (pv.w / 2 + 0.5)); c.fillRect(x - 2, Z(pv.z) - 2, 4, 4); }); }
    // pedras soltas e moitas
    (V.boulders || []).forEach(function (b) {
      if (!vis(b[0], b[1])) { return; }
      var s = Math.max(1.6, b[2] * k * 0.5); c.fillStyle = 'rgba(120,112,98,.6)'; c.beginPath(); c.arc(X(b[0]), Z(b[1]), s, 0, 7); c.fill();
    });
    c.fillStyle = 'rgba(80,110,44,.55)';
    (V.bushes || []).forEach(function (b) {
      if (!vis(b[0], b[1])) { return; }
      c.beginPath(); c.arc(X(b[0]), Z(b[1]), Math.max(1.2, b[2] * k * 0.6), 0, 7); c.fill();
    });
    // objetos fixos: a mesma tinta das casas
    world.props.forEach(function (o) {
      c.fillStyle = 'rgba(122,72,34,.55)'; c.fillRect(X(o.x - o.w / 2), Z(o.z - o.d / 2), o.w * k, o.d * k);
    });
    // casas: tinta sépia com hachura
    world.buildings.forEach(function (b) {
      var x = X(b.x0), z = Z(b.z0), w = (b.x1 - b.x0) * k, h = (b.z1 - b.z0) * k;
      c.fillStyle = 'rgba(122,72,34,.55)'; c.fillRect(x, z, w, h);
      if (big && k > 3) {
        c.save(); c.beginPath(); c.rect(x, z, w, h); c.clip();
        c.strokeStyle = 'rgba(59,36,20,.35)'; c.lineWidth = 1;
        for (var d = -h; d < w; d += 6) { c.beginPath(); c.moveTo(x + d, z + h); c.lineTo(x + d + h, z); c.stroke(); }
        c.restore();
      }
      c.strokeStyle = INK; c.lineWidth = big ? 1.6 : 0.9; c.strokeRect(x, z, w, h);
    });
    // árvores e veios (só os que estão à vista)
    world.nodes.forEach(function (n) {
      if (!vis(n.x, n.z)) { return; }
      var alive = st.nodes[n.id].alive, x = X(n.x), z = Z(n.z);
      if (n.kind === 'arvore') {
        var r = Math.max(1.8, k * 0.95 * (n.s || 1));
        if (!alive) { c.fillStyle = 'rgba(59,36,20,.4)'; c.fillRect(x - 1.5, z - 1, 3, 2); return; }
        if (big && k > 3) { c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, z); c.lineTo(x, z + r * 1.1); c.stroke(); }
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
    st.mobs.forEach(function (m) { if (m.alive && vis(m.x, m.z)) { c.beginPath(); c.arc(X(m.x), Z(m.z), big ? 2.4 : 1.4, 0, 7); c.fill(); } });
    // gente: tinta azul
    world.npcs.forEach(function (n) {
      c.fillStyle = '#2c4a7a'; c.strokeStyle = '#f1e2bb'; c.lineWidth = 1;
      c.beginPath(); c.arc(X(n.x), Z(n.z), Math.max(2, k * 0.5), 0, 7); c.fill(); c.stroke();
    });
    // missões diárias disponíveis: o mesmo ! dos NPCs, sobre o quadro de avisos
    if (dailyOpen()) {
      var qd = dailyBoard();
      c.save(); c.font = 'bold ' + (big ? 22 : 15) + 'px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3; c.strokeStyle = '#f1e2bb'; c.fillStyle = '#a8730f';
      c.strokeText('!', X(qd.x), Z(qd.z)); c.fillText('!', X(qd.x), Z(qd.z)); c.restore();
    }
    if (big) {
      // de perto, os nomes das casas e lugares; de longe, só as regiões (os nomes da vila se atropelariam)
      var perto = k >= 3.2;
      (V.regions || []).forEach(function (r) {
        if (r.kind === 'vila' && perto) { return; }
        var q = r.rects.slice().sort(function (a, b) { return (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]); })[0];
        var lx = (q[0] + q[2]) / 2, lz = (q[1] + q[3]) / 2;
        if (r.kind === 'vila') { lx = V.plaza.x - 40; lz = V.plaza.z + 10; } // no vão entre as moradias e a horta, longe dos outros nomes
        label(c, r.name, X(lx), Z(lz), Math.round((perto ? 16 : 14) * u), true);
      });
      if (perto) {
        var NOME = { igreja: 'Igreja', ferreiro: 'Ferreiro', bar: 'Bar', casa_senhor: 'Casa do senhor', padaria: 'Padaria', alfaiate: 'Alfaiate' };
        // o nome fica logo ao norte da pegada, para não cobrir a porta nem o vizinho
        V.buildings.forEach(function (b, i) { if (NOME[b.type]) { label(c, NOME[b.type], X(b.x), Z(world.buildings[i].z0 - 2.2), Math.round(14 * u), false); } });
        var mor = world.buildings.filter(function (b, i) { return V.buildings[i].type === 'moradia'; });
        if (mor.length) {
          var mx0 = Math.min.apply(null, mor.map(function (b) { return b.x0; })), mx1 = Math.max.apply(null, mor.map(function (b) { return b.x1; }));
          var mz0 = Math.min.apply(null, mor.map(function (b) { return b.z0; }));
          label(c, 'Moradias', X((mx0 + mx1) / 2), Z(mz0 - 2.5), Math.round(13 * u), false);
        }
        if (av) { label(c, av.name || 'Avenida', X((V.plaza.x + V.plaza.r + av.x1) / 2), Z((av.z0 + av.z1) / 2), Math.round(12 * u), true); }
        cercados.forEach(function (Q) { label(c, Q.name || 'Pasto', X((Q.x0 + Q.x1) / 2), Z((Q.z0 + Q.z1) / 2), Math.round(13 * u), true); });
        V.fields.forEach(function (f) {
          (f.strips || [f]).forEach(function (s) { label(c, s.name, X((f.x0 + f.x1) / 2), Z((s.z0 + s.z1) / 2), Math.round(12 * u), true); });
        });
        label(c, 'Praça', X(V.plaza.x), Z(V.plaza.z), Math.round(12 * u), true);
        if (pv) { label(c, pv.name || 'Portão', X(pv.x) + 22 + 8 * u, Z(pv.z) + 8 * u, Math.round(11 * u), true); }
      }
      compass(c, S - 36, S - 40, 22);
      // moldura de linha dupla
      c.strokeStyle = INK; c.lineWidth = 1.2; c.strokeRect(5.5, 5.5, S - 11, S - 11);
      c.lineWidth = 0.7; c.strokeRect(9.5, 9.5, S - 19, S - 19);
    }
    // área da macro
    var a = macroOn() || st.player.mapNav === 'macro' ? st.player.macro.area : null; // a marca some ao só caminhar
    if (a) {
      c.fillStyle = 'rgba(200,150,40,.12)'; c.beginPath(); c.arc(X(a.x), Z(a.z), a.r * k, 0, 7); c.fill();
      c.strokeStyle = macroOn() ? GOLD : 'rgba(168,115,15,.6)'; c.lineWidth = big ? 2.2 : 1.2; c.stroke();
    }
    var nextMacro = big && mapNext() === 'macro';
    if (nextMacro && (mapArmed || mapHover)) {
      var hv = mapHover || { x: st.player.x, z: st.player.z };
      c.fillStyle = 'rgba(214,160,40,.18)'; c.beginPath(); c.arc(X(hv.x), Z(hv.z), G.settings.macroRadius * k, 0, 7); c.fill();
      c.strokeStyle = '#b07a10'; c.lineWidth = 2.6; c.setLineDash([7, 5]); c.stroke(); c.setLineDash([]);
      c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); c.moveTo(X(hv.x) - 5, Z(hv.z)); c.lineTo(X(hv.x) + 5, Z(hv.z)); c.moveTo(X(hv.x), Z(hv.z) - 5); c.lineTo(X(hv.x), Z(hv.z) + 5); c.stroke();
    }
    if (big && mapHover && !nextMacro) { c.strokeStyle = WAX; c.lineWidth = 1.5; c.beginPath(); c.arc(X(mapHover.x), Z(mapHover.z), 6, 0, 7); c.stroke(); }
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
    var cv = $('bigmap'), r = cv.getBoundingClientRect(), h = world.B / mapZ; // client*: a imagem, sem a moldura do canvas
    return { x: mapCx + ((e.clientX - r.left - cv.clientLeft) / cv.clientWidth * 2 - 1) * h, z: mapCz + ((e.clientY - r.top - cv.clientTop) / cv.clientHeight * 2 - 1) * h };
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
    closeSell(true); sellShown = null;
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
    $('iv-rep').textContent = p.rep + ' rp';
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
  // ---------- missões diárias: reinício, quadro de avisos e baú ----------
  function dailyOffset() { return (G.daily.resetHour * 60 + G.daily.resetMinute) * 60000; }
  function dayKey(off) { var d = new Date(clockNow() - off); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function nextAt(h, m) {
    var n = new Date(clockNow()); n.setHours(h, m, 0, 0);
    if (n.getTime() <= clockNow()) { n.setDate(n.getDate() + 1); }
    return n.getTime();
  }
  function nextReset() { return nextAt(G.daily.resetHour, G.daily.resetMinute); }
  // dois horários: à meia-noite paga as entregas incompletas; no reinício as missões renovam
  function dailyTick() {
    if (clockNow() < dailyNext && dailyNext - clockNow() <= 86400000) { return; } // mais de um dia à frente: o relógio voltou
    dailyNext = Math.min(nextAt(0, 0), nextReset());
    var paid = sim.dailySettle(st, dayKey(0)), fresh = sim.dailyCheck(st, dayKey(dailyOffset()));
    if (paid || fresh) { handleEvents(); save(); if (npcOpen && G.npcs[npcOpen].daily) { talk(npcOpen); } }
  }
  function dailyLeftText() {
    var m = Math.ceil((nextReset() - clockNow()) / 60000), h = Math.floor(m / 60);
    return 'Novas missões em ' + (h ? h + ' h ' : '') + (m % 60) + ' min.';
  }
  function dailyBoard() { return world.props.filter(function (o) { return o.npc === 'quadro'; })[0]; }
  function dailyOpen() { return Object.keys(G.daily.quests).some(function (q) { return sim.dailyState(st, q) === 'available'; }); }
  function dailyProg(id) { var Q = G.daily.quests[id]; return G.items[Q.item].name.toLowerCase() + ' ' + sim.dailyGot(st, id) + '/' + Q.n; }
  function dailyTalk(id) {
    var D = G.daily, ids = Object.keys(D.quests), act = sim.dailyActive(st);
    var state = function (q) { return sim.dailyState(st, q); };
    if (G.npcs[id].daily === 'bau') {
      if (ids.every(function (q) { return state(q) === 'done'; })) { setTalk(D.textos.completo); }
      else if (!act.length) { setTalk(D.textos.verificar); }
      else { setTalk(D.textos.entrega, [], act.map(dailyProg).join(' · ')); }
      return;
    }
    setTalk(D.textos.quadro, ids.map(function (q) {
      var s = state(q), tag = s === 'active' ? ' · ' + dailyProg(q) : s === 'done' ? ' · concluída' : s === 'closed' ? ' · encerrada' : '';
      return { text: D.quests[q].title + tag, fn: function () { dailyShow(id, q); } };
    }), dailyLeftText());
  }
  function dailyShow(id, q) {
    var Q = G.daily.quests[q], r = sim.dailyReward(q), s = sim.dailyState(st, q), back = { text: 'Voltar', fn: function () { dailyTalk(id); } };
    setTalk(Q.text, s === 'available' ? [{ text: 'Aceitar: ' + Q.title, cls: 'main', fn: function () { sim.dailyAccept(st, q); handleEvents(); save(); dailyTalk(id); } }, back] : [back],
      s === 'active' ? 'Missão: ' + Q.title + ' · ' + dailyProg(q) : s === 'done' ? 'Concluída hoje.' : s === 'closed' ? 'Encerrada até o reinício.' :
      'Recompensa: ' + r.moedas + ' moedas, ' + r.xp + ' XP e ' + r.rp + ' rp.');
  }
  function talk(id, said) {
    var def = G.npcs[id], dlg = def.dialogue && G.dialogues[def.dialogue];
    if (def.daily) { dailyTalk(id); renderNpcActs(id); return; }
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
  // a escolha de recolher a lista vale para este navegador, como os controles; fora do save
  var QUESTS_KEY = 'zg-vila-missoes', questsClosed = false;
  try { questsClosed = localStorage.getItem(QUESTS_KEY) === '1'; } catch (e) { /* sem armazenamento: começa aberta */ }
  function toggleQuests() {
    questsClosed = !questsClosed;
    try { localStorage.setItem(QUESTS_KEY, questsClosed ? '1' : '0'); } catch (e) { /* sem armazenamento: vale até fechar */ }
    renderQuests();
  }
  function renderQuests() {
    var html = [];
    sim.dailyActive(st).forEach(function (id) {
      html.push('<li class="active">' + esc(G.daily.quests[id].title) + '<br><small>' + esc(dailyProg(id)) + '</small></li>');
    });
    Object.keys(st.quests).forEach(function (id) {
      var s = sim.questState(st, id); if (s !== 'active' && s !== 'ready') { return; }
      var Q = G.quests[id];
      html.push('<li class="' + s + '">' + esc(Q.title) + '<br><small>' +
        (s === 'ready' ? 'entregar a ' + esc(G.npcs[Q.giver].name) : esc(objText(id))) + '</small></li>');
    });
    $('quests').innerHTML = html.join('');
    $('quests').hidden = questsClosed;
    $('q-toggle').hidden = !html.length;
    $('q-toggle').setAttribute('aria-expanded', String(!questsClosed));
    $('q-count').textContent = html.length;
  }
  // ! = tem algo a dizer ou missão a oferecer · ? = missão pronta para entregar
  var markEls = {};
  function mark(id, sym, x, y, z) {
    var el = markEls[id];
    if (!el) { el = markEls[id] = document.createElement('span'); $('marks').appendChild(el); }
    var pos = sym && calc.dist(st.player.x, st.player.z, x, z) < 40 ? view.project(x, y, z) : null;
    if (!pos || pos.x < 0 || pos.x > 1 || pos.y < 0 || pos.y > 1) { el.hidden = true; return; }
    el.hidden = false; el.textContent = sym; el.className = sym === '?' ? 'q' : '';
    el.style.left = (pos.x * 100) + '%'; el.style.top = (pos.y * 100) + '%';
  }
  function marks() {
    var qd = dailyBoard();
    mark(qd.id, dailyOpen() ? '!' : '', qd.x, 2.75, qd.z);
    world.npcs.forEach(function (n) {
      var def = G.npcs[n.id], dlg = def.dialogue && G.dialogues[def.dialogue], q = sim.npcQuest(st, n.id), sym = '';
      if (dlg && !st.flags[dlg.flag]) { sym = '!'; }
      else if (q && q.state === 'available') { sym = '!'; }
      else if (q && q.state === 'ready') { sym = '?'; }
      mark(n.id, sym, n.x, 2.25, n.z);
    });
  }
  function renderNpcActs(id) {
    var def = G.npcs[id], box = $('npc-acts'), p = st.player; box.innerHTML = ''; sellShown = null;
    def.services.forEach(function (s) {
      if (s.type === 'sell') { box.appendChild(sellBox(id, s)); return; }
      if (s.type === 'deliver') { if (sim.dailyActive(st).length) { box.appendChild(sellBox(id, s)); } return; }
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
    if (G.npcs[id].daily) { dailyTalk(id); renderNpcActs(id); }
    else if (!$('npc-opts').children.length) { talk(id, $('npc-text').textContent); }
  }
  // ---------- venda: tabuleiro de itens e submenu de quantidade ----------
  // a Bolsa e o Inventário só têm texto, então estes são os primeiros ícones de item:
  // SVG embutido, no mesmo traço dos botões da barra; item sem desenho mostra a inicial
  var ITEM_ICONS = {
    madeira: '<path d="M8 33 L33 12 L40 20 L15 41 Z" fill="#9a6232" stroke="#2b1709" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 31 L30 18 M18 36 L34 22" stroke="#5a341a" stroke-width="1.2"/><ellipse cx="36.5" cy="16" rx="4.2" ry="5.8" transform="rotate(40 36.5 16)" fill="#dcb67a" stroke="#2b1709" stroke-width="2"/><ellipse cx="36.5" cy="16" rx="1.8" ry="2.7" transform="rotate(40 36.5 16)" fill="none" stroke="#8a5428" stroke-width="1"/>',
    pedra: '<path d="M7 35 L12 19 L23 10 L36 14 L42 29 L36 40 L14 41 Z" fill="#8f8a80" stroke="#2b1709" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 19 L24 22 L36 14 M24 22 L27 40" fill="none" stroke="#5e5a52" stroke-width="1.3"/><path d="M16 19 L23 14 L30 15" fill="none" stroke="#c9c4b8" stroke-width="1.6" stroke-linecap="round"/>',
    ferro: '<path d="M7 34 L11 20 L22 11 L35 13 L42 27 L37 39 L15 41 Z" fill="#5f5148" stroke="#2b1709" stroke-width="2.2" stroke-linejoin="round"/><path d="M15 25 L22 20 L25 27 L18 31 Z M29 19 L35 22 L32 28 L27 25 Z M24 32 L31 31 L30 37 L24 37 Z" fill="#b5602e" stroke="#2b1709" stroke-width="1.1" stroke-linejoin="round"/><path d="M17 25 L21 22 M30 20 L33 22 M25 33 L29 33" stroke="#e8b078" stroke-width="1.2" stroke-linecap="round"/>',
    carne: '<path d="M30 8 C40 8 43 19 37 26 C33 31 25 32 21 29 C16 25 17 13 30 8 Z" fill="#a8362a" stroke="#2b1709" stroke-width="2.2" stroke-linejoin="round"/><path d="M28 13 C34 12 37 18 33 23" fill="none" stroke="#e39a84" stroke-width="1.8" stroke-linecap="round"/><path d="M22 29 L12 38" stroke="#2b1709" stroke-width="7" stroke-linecap="round"/><path d="M22 29 L12 38" stroke="#efe5cf" stroke-width="3.6" stroke-linecap="round"/><circle cx="8.5" cy="36.5" r="3.2" fill="#efe5cf" stroke="#2b1709" stroke-width="1.6"/><circle cx="13.5" cy="41.5" r="3.2" fill="#efe5cf" stroke="#2b1709" stroke-width="1.6"/>',
    pele: '<path d="M16 7 L20 13 H28 L32 7 L35 15 C35 20 37 23 41 25 L36 29 C36 34 37 37 40 41 L31 39 L24 43 L17 39 L8 41 C11 37 12 34 12 29 L7 25 C11 23 13 20 13 15 Z" fill="#b08a5c" stroke="#2b1709" stroke-width="2.2" stroke-linejoin="round"/><path d="M24 16 V37" stroke="#7a5a34" stroke-width="1.4" stroke-dasharray="3 2"/><path d="M18 21 L21 24 M30 21 L27 24 M18 30 L21 28 M30 30 L27 28" stroke="#e0c49a" stroke-width="1.5" stroke-linecap="round"/>'
  };
  function itemIcon(k) {
    if (ITEM_ICONS[k]) { return '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + ITEM_ICONS[k] + '</svg>'; }
    return '<b class="sell-ini" aria-hidden="true">' + esc(G.items[k].name.charAt(0)) + '</b>';
  }
  function coins(n) { return n + ' moeda' + (n === 1 ? '' : 's'); }

  var SELL_COLS = 5, SELL_ROWS = 2; // tamanho mínimo do tabuleiro; cresce de linha em linha se precisar
  var sellShown = null, sellPop = null;
  // o mesmo tabuleiro serve para vender (s.type 'sell') e para colocar material no baú (s.type 'deliver')
  function boardItems(s) { return s.type === 'deliver' ? sim.dailyItems(st) : s.items; }
  function boardMax(s, k) { return s.type === 'deliver' ? sim.dailyMax(st, k) : sim.sellable(st, k); }
  // só os itens que o jogador tem e este NPC aceita; as outras casas ficam vazias
  function sellBox(id, s) {
    var p = st.player, wrap = document.createElement('div'), board = document.createElement('div'), deliver = s.type === 'deliver';
    var items = boardItems(s), owned = items.filter(function (k) { return (p.inv[k] || 0) > 0; });
    wrap.className = 'sell'; board.className = 'sell-board';
    wrap.innerHTML = deliver ? '<div class="sell-top"><h3>Colocar no baú</h3></div>' : '<div class="sell-top"><h3>Vender</h3><span>Moedas: ' + (p.inv.moeda || 0) + '</span></div>';
    owned.forEach(function (k) {
      var it = G.items[k], have = p.inv[k], can = boardMax(s, k), free = sim.sellable(st, k), b = document.createElement('button');
      b.type = 'button'; b.className = 'sell-cell' + (can ? '' : ' off'); b.dataset.item = k;
      b.title = it.name + (have > free ? ' (parte para missão)' : '');
      b.setAttribute('aria-label', it.name + ': ' + have + (have > free ? ', ' + (have - free) + ' para missão' : ''));
      b.innerHTML = itemIcon(k) + '<span class="n">' + have + '</span>' + (have > free ? '<i class="res" aria-hidden="true"></i>' : '');
      b.onclick = function () { openSell(id, s, k); };
      board.appendChild(b);
    });
    var cells = Math.max(SELL_ROWS, Math.ceil(owned.length / SELL_COLS)) * SELL_COLS;
    for (var i = owned.length; i < cells; i++) {
      var e = document.createElement('span'); e.className = 'sell-cell empty'; board.appendChild(e);
    }
    wrap.appendChild(board);
    if (!owned.length) {
      var h = document.createElement('p'); h.className = 'hint';
      h.textContent = (deliver ? 'Você não tem o material pedido. Falta: ' : 'Você não tem nada que se venda aqui. Compra: ') + items.map(function (k) { return (G.items[k].plural || G.items[k].name).toLowerCase(); }).join(', ') + '.';
      wrap.appendChild(h);
    }
    sellShown = sellSig(id);
    return wrap;
  }
  // o jogo segue rodando com a janela aberta: se algo mudou, refaz o tabuleiro e o submenu
  function sellSig(id) {
    var o = [st.player.inv.moeda || 0];
    G.npcs[id].services.forEach(function (s) {
      if (s.type === 'sell' || s.type === 'deliver') { boardItems(s).forEach(function (k) { o.push(k, st.player.inv[k] || 0, boardMax(s, k)); }); }
    });
    return o.join(',');
  }
  function sellTick() {
    if (sellShown === null || !npcOpen || sellSig(npcOpen) === sellShown) { return; }
    renderNpcActs(npcOpen);
    if (sellPop) { sellRefresh(); }
  }
  // submenu: fica fora da janela (que tem rolagem) e por cima de tudo; o fundo apanha o clique fora
  function openSell(id, s, k) {
    closeSell(true);
    var it = G.items[k], back = document.createElement('div'), downOut = false, deliver = s.type === 'deliver';
    back.className = 'sell-back';
    back.innerHTML = '<div class="sell-pop" role="dialog" tabindex="-1" aria-label="' + (deliver ? 'Colocar ' : 'Vender ') + esc(it.name.toLowerCase()) + '">' +
      '<div class="sell-id"><span class="ic">' + itemIcon(k) + '</span><span class="nm"><b>' + esc(it.name) + '</b><small>' + (deliver ? 'Faltam ' + sim.dailyNeed(st, k) : coins(it.price) + ' cada') + '</small></span>' +
      '<button type="button" class="x" data-x>Fechar</button></div>' +
      '<p class="sell-note" hidden></p>' +
      '<div class="sell-qty"><input type="range" min="1" step="1" value="1" aria-label="Quantidade">' +
      '<input type="text" class="num" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Quantidade"><small></small></div>' +
      '<button type="button" class="main" data-ok></button><button type="button" data-all>' + (deliver ? 'Colocar tudo' : 'Vender tudo') + '</button></div>';
    var q = function (sel) { return back.querySelector(sel); };
    var P = sellPop = { id: id, s: s, k: k, n: 1, blank: false, back: back, pop: q('.sell-pop'), note: q('.sell-note'), qty: q('.sell-qty'),
      range: q('[type=range]'), num: q('.num'), max: q('.sell-qty small'), ok: q('[data-ok]'), all: q('[data-all]') };
    // conta só o toque que começa no fundo: soltar a barra fora do submenu também gera clique aqui
    back.onpointerdown = function (e) { downOut = e.target === back; };
    back.onclick = function (e) { if (e.target === back && downOut) { closeSell(); } };
    q('[data-x]').onclick = function () { closeSell(); };
    P.range.oninput = function () { sellSet(+P.range.value); };
    P.num.oninput = function () {
      var d = P.num.value.replace(/\D/g, '');
      if (d) { sellSet(parseInt(d, 10)); return; }
      P.blank = true; sellPaint(); // campo vazio enquanto digita; ao sair dele volta o último valor
    };
    P.num.onfocus = function () { P.num.select(); };
    P.num.onblur = function () { if (P.blank) { P.blank = false; sellPaint(); } };
    P.num.onkeydown = function (e) { // Enter só confirma o número; quem vende é o botão
      if (e.key === 'Enter') { e.preventDefault(); if (P.blank) { P.num.blur(); } else { P.ok.focus(); } }
    };
    P.ok.onclick = function () { doSell(P.n); };
    P.all.onclick = function () { doSell(boardMax(s, k)); };
    $('w-npc').parentNode.appendChild(back);
    sellRefresh();
    if (sellPop && !isTouch && !ctrl.active() && !P.num.disabled) { P.num.focus(); } else if (sellPop) { P.pop.focus(); } // no toque e no controle, o teclado só abre se pedir
  }
  function sellSet(n) {
    var P = sellPop;
    P.n = Math.max(1, Math.min(boardMax(P.s, P.k) || 1, n)); P.blank = false; sellPaint();
  }
  // recalcula o máximo e o aviso de reserva a partir do estado atual do jogo
  function sellRefresh() {
    var P = sellPop, have = st.player.inv[P.k] || 0, can = boardMax(P.s, P.k), res = have - sim.sellable(st, P.k), verbo = P.s.type === 'deliver' ? 'colocar' : 'vender';
    if (!have || boardItems(P.s).indexOf(P.k) < 0) { closeSell(); return; }
    P.note.hidden = !res;
    if (can && res) { P.note.textContent = (res === 1 ? '1 unidade fica guardada' : res + ' unidades ficam guardadas') + ' para a missão: dá para ' + verbo + ' ' + can + ' de ' + have + '.'; }
    else if (res) { P.note.textContent = (res === 1 ? 'A unidade que você tem está guardada' : 'As ' + res + ' unidades que você tem estão guardadas') + ' para a missão: não dá para ' + verbo + '.'; }
    P.qty.hidden = P.ok.hidden = !can; P.all.disabled = !can;
    P.range.max = Math.max(1, can); P.num.disabled = !can;
    P.range.disabled = can < 2; // com uma só unidade não há o que puxar
    P.max.textContent = 'de ' + can;
    P.n = Math.max(1, Math.min(can || 1, P.n));
    sellPaint();
  }
  // número, barra e botão sempre mostram o mesmo valor
  function sellPaint() {
    var P = sellPop, can = boardMax(P.s, P.k), price = G.items[P.k].price;
    var v = P.blank ? '' : String(P.n);
    if (P.num.value !== v) { P.num.value = v; }
    P.range.value = P.n;
    P.range.style.setProperty('--p', (can > 1 ? (P.n - 1) / (can - 1) * 100 : 100) + '%');
    P.ok.disabled = P.blank;
    P.ok.textContent = P.blank ? 'Escolha a quantidade' : P.s.type === 'deliver' ? 'Colocar ' + P.n + ' no baú' : 'Vender ' + P.n + ' por ' + P.n * price;
  }
  function doSell(n) {
    var P = sellPop; closeSell(true);
    npcDone(P.id, sim.service(st, P.id, P.s, { item: P.k, n: n }));
  }
  function closeSell(noFocus) {
    var P = sellPop; if (!P) { return; }
    sellPop = null; P.back.parentNode.removeChild(P.back);
    var cell = !noFocus && $('npc-acts').querySelector('[data-item="' + P.k + '"]');
    if (cell) { cell.focus(); }
  }

  // ---------- interação ----------
  function refName(ref) {
    if (ref.type === 'npc') { return G.npcs[ref.id].name; }
    if (ref.type === 'amb') { return view.amb[ref.id].name; }
    if (ref.type === 'mob') { return G.monsters.coelho.name; }
    if (ref.type === 'prop') { return propById(ref.id).name; }
    var n = world.nodeById[ref.id], def = G.nodes[n.kind], ns = st.nodes[n.id];
    return def.name + (ns.alive ? '' : ' (volta em ' + Math.ceil(ns.left) + ' s)');
  }
  function propById(id) { return world.props.filter(function (o) { return o.id === id; })[0]; }
  function refPos(ref) {
    if (ref.type === 'amb') { var o = view.amb[ref.id].o; return { x: o.pos[0], z: o.pos[2] }; }
    if (ref.type === 'npc') { var r = null; world.npcs.forEach(function (n) { if (n.id === ref.id) { r = n; } }); return r; }
    if (ref.type === 'mob') { return sim.mobById(st, ref.id); }
    if (ref.type === 'prop') { return propById(ref.id); }
    return world.nodeById[ref.id];
  }
  function interact(ref) {
    var p = st.player, pos = refPos(ref), d = calc.dist(p.x, p.z, pos.x, pos.z);
    if (ref.type === 'npc') {
      if (d <= G.settings.interactRange + 0.5) { openNpc(ref.id); } else { toast('Aproxime-se de ' + G.npcs[ref.id].name + '.'); }
      return;
    }
    if (ref.type === 'prop') {
      if (d <= G.settings.interactRange + 0.5) { openNpc(pos.npc); } else { toast('Aproxime-se: ' + pos.name + '.'); }
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
    world.props.forEach(function (o) { consider({ type: 'prop', id: o.id }, o.x, o.z, G.settings.interactRange); });
    world.nodes.forEach(function (n) { if (st.nodes[n.id].alive) { consider({ type: 'node', id: n.id }, n.x, n.z, G.player.reach + 0.6); } });
    st.mobs.forEach(function (m) { if (m.alive) { consider({ type: 'mob', id: m.id }, m.x, m.z, G.settings.interactRange); } });
    if (best) { interact(best); return; }
    // nada ao alcance: diz o que está à frente, mais longe
    world.npcs.forEach(function (n) { consider({ type: 'npc', id: n.id }, n.x, n.z, 12); });
    world.props.forEach(function (o) { consider({ type: 'prop', id: o.id }, o.x, o.z, 12); });
    world.nodes.forEach(function (n) { if (st.nodes[n.id].alive) { consider({ type: 'node', id: n.id }, n.x, n.z, 12); } });
    st.mobs.forEach(function (m) { if (m.alive) { consider({ type: 'mob', id: m.id }, m.x, m.z, 12); } });
    toast(best ? 'Aproxime-se: ' + refName(best) + ' (' + bd.toFixed(1) + ' m).' : 'Nada ao alcance à sua frente.');
  }

  function cmd(c) {
    var p = st.player;
    if (c === 'map') { if (openWin === 'w-map') { hide(); } else { openMap(); } }
    else if (c === 'rules') { toggle('w-rules', renderRules); }
    else if (c === 'menu') { toggle('w-menu'); }
    else if (c === 'fullscreen') { toggleFull(); }
    else if (c === 'inv') { toggle('w-inv', function () { $('iv-res').textContent = ''; }); if (openWin === 'w-inv') { renderInv(); } }
    else if (c === 'bag') { toggle('w-bag'); if (openWin === 'w-bag') { renderBag(); } }
    else if (c === 'stance') { setStance(); }
    else if (c === 'potion') { drinkPotion(); }
    else if (c === 'macro') {
      if (pauseMacro()) { toast('Macro pausada.'); if (openWin === 'w-map') { mapMenu = false; mapUi(); } }
      else {
        // G leva direto ao clique: com caminhada padrão, arma a macro por um clique; com macro padrão, o clique normal já é a macro
        var want = st.player.mapNav === 'macro' ? false : 'macro';
        if (openWin !== 'w-map') { openMap(); mapArmed = want; mapUi(); }
        else if (mapArmed === want && !mapMenu) { hide(); }
        else { mapArmed = want; mapMenu = false; mapUi(); }
      }
    }
  }

  // ---------- tela cheia (o iPhone não oferece isso às páginas: o botão avisa em vez de falhar calado) ----------
  function fullEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function fullCan() { var d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); }
  function fullUi() {
    var b = $('btn-full');
    b.textContent = !fullCan() ? 'Tela cheia indisponível neste navegador' : fullEl() ? 'Sair da tela cheia' : 'Tela cheia';
    b.disabled = !fullCan();
  }
  function toggleFull() {
    var d = document.documentElement, r;
    if (fullEl()) { r = (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    else { r = (d.requestFullscreen || d.webkitRequestFullscreen).call(d); }
    if (r && r.catch) { r.catch(function () { toast('O navegador recusou a tela cheia.'); }); }
  }

  function debug(c) {
    if (c === 'reset') {
      try { localStorage.removeItem(G.settings.saveKey); } catch (e) { /* nada */ }
      st = NZ.newState(world, (Date.now() % 2147483647) | 0); dailyNext = 0; view.yaw = st.player.yaw; renderLog(); hide(); showNew(); return;
    }
    if (c === 'hurt') { st.player.hp = Math.max(1, st.player.hp - 15); hide(); return; }
    if (c === 'coins') { st.player.inv.moeda = (st.player.inv.moeda || 0) + 50; return; }
    var min = { away30: 30, away240: 240, away600: 600 }[c];
    if (min) { hide(); var now = clockNow(); beginAway(now - min * 60000); endAway(now); }
  }

  // modo desenvolvedor: cliques seguidos no nome do jogo, no título do menu, mostram os testes até recarregar a página
  var DEV_CLICKS = 5, DEV_GAP_MS = 700, devClicks = 0, devLast = 0;
  function devTap(e) {
    if (!$('dev-opts').hidden) { return; }
    if (e.target !== $('dev-tap')) { devClicks = 0; return; } // clique em outro ponto do menu quebra a sequência
    var now = performance.now();
    devClicks = now - devLast <= DEV_GAP_MS ? devClicks + 1 : 1; devLast = now;
    if (devClicks >= DEV_CLICKS) { $('dev-opts').hidden = false; toast('Modo desenvolvedor ativado.', 3); }
  }

  // ---------- entrada ----------
  function bindInput() {
    var cv = $('view');
    window.addEventListener('keydown', function (e) {
      // submenu de venda aberto: Esc fecha só ele e os atalhos do jogo ficam desligados
      if (sellPop) { if (e.code === 'Escape') { closeSell(); e.preventDefault(); } return; }
      if (e.target.tagName === 'INPUT' && e.target.id !== 'map-zoom') { return; } // a barra de zoom não tira M e Esc
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
        var h = pickEvent(e, true);
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
    mapZMax = Math.max(3, world.B / 12); // no máximo, a janela mostra cerca de 24 m de lado
    big.addEventListener('pointerdown', function (e) {
      mapDragged = false;
      if (mapDrag || (e.pointerType === 'mouse' && (mapZ <= 1 || e.button !== 0))) { return; } // mouse sem zoom: como sempre foi
      mapDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: mapCx, cz: mapCz };
      big.setPointerCapture(e.pointerId);
    });
    big.addEventListener('pointermove', function (e) {
      if (mapDrag && mapDrag.id === e.pointerId) {
        var dx = e.clientX - mapDrag.x, dy = e.clientY - mapDrag.y;
        if (!mapDragged && Math.hypot(dx, dy) >= MAP_DRAG_MIN) { // a imagem sai do lugar sem saltar a distância mínima
          mapDragged = true; mapHover = null; big.classList.add('drag');
          mapDrag.x = e.clientX; mapDrag.y = e.clientY; dx = dy = 0;
        }
        if (mapDragged) {
          var q = world.B * 2 / mapZ / big.clientWidth;
          mapCx = mapDrag.cx - dx * q; mapCz = mapDrag.cz - dy * q; mapLimit();
          drawMap(big, 560, true);
          return;
        }
      }
      mapHover = mapPoint(e);
    });
    var mapDragEnd = function (e) { if (mapDrag && mapDrag.id === e.pointerId) { mapDrag = null; big.classList.remove('drag'); } };
    big.addEventListener('pointerup', mapDragEnd); big.addEventListener('pointercancel', mapDragEnd); big.addEventListener('lostpointercapture', mapDragEnd);
    big.addEventListener('pointerleave', function () { mapHover = null; });
    $('map-zoom').addEventListener('input', function () { mapZoomTo(+this.value); });
    $('map-zout').addEventListener('click', function () { mapZoomTo(+$('map-zoom').value - 10); });
    $('map-zin').addEventListener('click', function () { mapZoomTo(+$('map-zoom').value + 10); });
    big.addEventListener('click', function (e) {
      if (mapDragged) { mapDragged = false; return; } // fim de um arrasto não é clique
      var pt = mapPoint(e), wasMacro = macroOn();
      if (mapMenu) { mapMenu = false; mapUi(); return; } // clique fora do menu só fecha o menu
      mapHover = null;
      if (mapNext() === 'macro') { sim.startMacro(st, pt); mapArmed = false; hide(); toast(wasMacro ? 'Área mudada. A macro segue trabalhando lá.' : 'Área marcada. O personagem vai trabalhar lá.'); return; }
      if (sim.goTo(st, pt.x, pt.z)) { mapArmed = false; hide(); toast(wasMacro ? 'Macro pausada. Indo até o ponto marcado.' : 'Indo até o ponto marcado.'); }
    });
    $('map-macro').addEventListener('click', function () { if (mapArmed === 'macro') { mapArmed = false; } else { mapMenu = mapMenu === 'macro' ? false : 'macro'; } mapUi(); });
    $('map-walk').addEventListener('click', function () { if (mapArmed === 'caminhada') { mapArmed = false; } else { mapMenu = mapMenu === 'caminhada' ? false : 'caminhada'; } mapUi(); });
    $('mw-go').addEventListener('click', function () { mapMenu = false; mapArmed = 'caminhada'; mapUi(); });
    $('mm-def').addEventListener('click', function () { setMapNav('macro', this, $('map-macro')); });
    $('mw-def').addEventListener('click', function () { setMapNav('caminhada', this, $('map-walk')); });
    ['mm-def', 'mw-def'].forEach(function (id) {
      var b = $(id), on = function (e) { if (e.type === 'focus' || e.pointerType === 'mouse') { mapTip(b); } };
      b.addEventListener('pointerenter', on); b.addEventListener('focus', on);
      b.addEventListener('pointerleave', mapTipOff); b.addEventListener('blur', mapTipOff);
    });
    $('mm-pick').addEventListener('click', function () { mapMenu = false; mapArmed = 'macro'; mapUi(); });
    $('mm-prev').addEventListener('click', function () { mapMenu = false; if (sim.startMacro(st)) { mapArmed = false; hide(); toast('Macro retomada na área anterior.'); } });
    $('mm-rules').addEventListener('click', function () { mapMenu = false; mapArmed = false; show('w-rules'); renderRules(); });
    $('mm-pause').addEventListener('click', function () { mapMenu = false; pauseMacro(); mapUi(); toast('Macro pausada.'); });
    $('iv-drink').addEventListener('click', function () { drinkPotion(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-stance]'), function (b) { b.addEventListener('click', function () { setStance(b.dataset.stance); }); });

    Array.prototype.forEach.call(document.querySelectorAll('[data-cmd]'), function (b) { b.addEventListener('click', function () { cmd(b.dataset.cmd); b.blur(); }); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', hide); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-dbg]'), function (b) { b.addEventListener('click', function () { debug(b.dataset.dbg); }); });
    $('w-menu').addEventListener('click', devTap);

    // botões de toque: segurar = andar
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
    bindStick();
    $('q-toggle').addEventListener('click', function () { toggleQuests(); this.blur(); }); // sem foco, Espaço e Enter seguem sendo do jogo
    Array.prototype.forEach.call(document.querySelectorAll('[data-ctrl]'), function (b) {
      b.addEventListener('click', function () { ctrlSet(b.dataset.ctrl); try { localStorage.setItem(CTRL_KEY, ctrlMode); } catch (e) { /* sem armazenamento: vale até fechar */ } });
    });
  }
  // o que o controle pode fazer no jogo; a leitura dos botões fica em controle.js
  function ctrlApi() {
    return {
      win: function () { return openWin; },
      sell: function () { return sellPop ? sellPop.pop : null; },
      closeSell: function () { closeSell(); },
      mapBox: function () { return mapMenu === 'macro' ? $('map-menu') : mapMenu === 'caminhada' ? $('map-walk-menu') : null; },
      mapBoxClose: function () { var b = $(mapMenu === 'macro' ? 'map-macro' : 'map-walk'); mapMenu = false; mapUi(); b.focus(); }, // o foco volta a quem abriu o menu
      mapPan: function (fx, fz) { // fx e fz em frações da janela do mapa
        if (!fx && !fz) { return; }
        var q = world.B * 2 / mapZ; mapCx += fx * q; mapCz += fz * q; mapLimit();
        drawMap($('bigmap'), 560, true);
      },
      mapZoom: function (n) { mapZoomTo(+$('map-zoom').value + n); },
      hide: hide, cmd: cmd, interact: interactFront, quests: toggleQuests, toast: function (t, sec) { toast(t, sec || 3); },
      move: function (f, s) { pad.gf = f; pad.gs = s; },
      look: function (x, y) { view.yaw -= x; view.pitch = Math.max(-1.1, Math.min(0.9, view.pitch - y)); lookHold = 2.5; },
      modo: function () { if (openWin === 'w-map') { mapUi(); } } // o texto do mapa muda entre clique e botão A
    };
  }
  // analógico: o dedo fica preso a ele, então o arrasto de câmera (no #view) nunca recebe esse toque, e vice-versa
  function bindStick() {
    var el = $('stick'), knob = el.firstElementChild, id = null;
    function aim(e) {
      var r = el.getBoundingClientRect(), R = r.width * STICK_TRAVEL, dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
      var m = Math.hypot(dx, dy) || 1, q = Math.min(1, R / m), n = Math.min(1, m / R), a = Math.max(0, (n - STICK_DEAD) / (1 - STICK_DEAD));
      knob.style.transform = 'translate(' + dx * q + 'px, ' + dy * q + 'px)';
      pad.ss = dx / m * a; pad.sf = -dy / m * a;
    }
    function off(e) {
      if (e.pointerId !== id) { return; }
      id = null; pad.ss = pad.sf = 0; knob.style.transform = ''; el.classList.remove('down');
    }
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (id !== null) { return; } // um segundo dedo não troca quem comanda
      if (openWin === 'w-report') { hide(); }
      id = e.pointerId; el.setPointerCapture(id); el.classList.add('down'); aim(e);
    });
    el.addEventListener('pointermove', function (e) { if (e.pointerId === id) { aim(e); } });
    el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
  }
  // controles do celular: analógico (padrão) ou botões em cruz; a escolha fica fora do save, e sobrevive a recomeçar o jogo
  var CTRL_KEY = 'zg-vila-controles', ctrlMode = 'analogico', STICK_TRAVEL = 0.32, STICK_DEAD = 0.18;
  function ctrlLoad() { try { return localStorage.getItem(CTRL_KEY); } catch (e) { return null; } }
  function ctrlSet(mode) {
    ctrlMode = mode === 'botoes' ? 'botoes' : 'analogico';
    document.querySelector('.dpad').hidden = ctrlMode !== 'botoes';
    $('stick').hidden = ctrlMode === 'botoes';
    Array.prototype.forEach.call(document.querySelectorAll('[data-ctrl]'), function (b) { b.setAttribute('aria-pressed', b.dataset.ctrl === ctrlMode ? 'true' : 'false'); });
  }
  function pickEvent(e, solid) {
    var r = $('view').getBoundingClientRect();
    return view.pickAt((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1), solid);
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
})(window.NZ = window.NZ || {});
