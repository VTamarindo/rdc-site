/* Interface e laço principal: carrega os dados, liga teclado/toque, desenha HUD, diálogo, menu e save. */
(function () {
  'use strict';

  var ZG = window.ZG, V = '1';
  var SAVE_KEY = 'zeitgeist_save_v1';
  var MAX_AWAY = 8 * 3600;
  function $(id) { return document.getElementById(id); }
  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var game, engine, spriteIndex, D;
  var els = {};
  var keys = {}, vk = {};
  var dialogState = null, menuOpen = false;
  var warnedSave = false, hiddenAt = 0;

  /* ---------- carregamento ---------- */
  function getJSON(url, ok, bad) {
    var x = new XMLHttpRequest();
    x.open('GET', url + '?v=' + V);
    x.onload = function () {
      if ((x.status >= 200 && x.status < 300) || (x.status === 0 && x.responseText)) {
        try { ok(JSON.parse(x.responseText)); } catch (e) { bad(e); }
      } else { bad(new Error(url + ' ' + x.status)); }
    };
    x.onerror = function () { bad(new Error(url)); };
    x.send();
  }
  function getImage(url, ok, bad) {
    var im = new Image();
    im.onload = function () { ok(im); };
    im.onerror = function () { bad(new Error(url)); };
    im.src = url + '?v=' + V;
  }
  function loadAll(done, fail) {
    var res = {}, left = 5, failed = false;
    function mk(k) { return function (v) { res[k] = v; left--; if (left === 0 && !failed) { done(res); } }; }
    function bad(e) { if (!failed) { failed = true; fail(e); } }
    getJSON('data/game.json', mk('game'), bad);
    getJSON('data/map.json', mk('map'), bad);
    getJSON('art/atlas.json', mk('atlas'), bad);
    getImage('art/walls.png', mk('walls'), bad);
    getImage('art/sprites.png', mk('sprites'), bad);
  }

  /* ---------- helpers de tela ---------- */
  function setText(el, t) { if (el._t !== t) { el._t = t; el.textContent = t; } }
  function setW(el, pct) {
    var v = Math.max(0, Math.min(100, pct)) | 0;
    if (el._w !== v) { el._w = v; el.style.width = v + '%'; }
  }

  function addLog(msg, kind) {
    var li = document.createElement('li');
    li.className = kind || 'info';
    li.textContent = msg;
    els.log.insertBefore(li, els.log.firstChild);
    while (els.log.childNodes.length > 8) { els.log.removeChild(els.log.lastChild); }
  }

  function renderQuests() {
    var lines = game.questLines(), h = '';
    for (var i = 0; i < lines.length; i++) {
      var q = lines[i];
      h += '<li class="' + (q.ready ? 'ready' : '') + '"><b>' + esc(q.title) + '</b> <small>' + esc(q.kind) + '</small><small>' + esc(q.text) + '</small></li>';
    }
    els.quests.innerHTML = h || '<li><small>Nenhuma missão ativa. Fale com o Escudeiro Anselmo.</small></li>';
  }

  var fxTimer = 0;
  function flash(cls, ms) {
    els.fx.style.background = cls;
    els.fx.className = 'on';
    clearTimeout(fxTimer);
    fxTimer = setTimeout(function () { els.fx.className = ''; }, ms);
  }

  function updateHud() {
    var pl = game.pl, mh = game.maxHp();
    setText(els.lv, String(pl.lv));
    setText(els.xpT, pl.xp + '/' + game.need());
    setW(els.xpBar, pl.xp / game.need() * 100);
    setW(els.hpBar, pl.hp / mh * 100);
    setText(els.hpT, Math.ceil(pl.hp) + '/' + mh);
    setText(els.inv, D.items.erva + ' ' + game.inv.erva + ' · ' + D.items.ferro + ' ' + game.inv.ferro + ' · ' + D.items.pocao + ' ' + game.inv.pocao);
    setText(els.pot, D.items.pocao + ' (' + game.inv.pocao + ')');
    els.pot.disabled = game.inv.pocao < 1;
    var o = pl.stance === 'ofensiva';
    if (els.stOf._p !== o) { els.stOf._p = o; els.stOf.setAttribute('aria-pressed', o ? 'true' : 'false'); els.stDe.setAttribute('aria-pressed', o ? 'false' : 'true'); }
    var c = game.cur;
    if (c) {
      var def = D.monsters[c.id];
      els.target.hidden = false;
      setText(els.tName, def.name);
      setW(els.tHp, c.hp / def.hp * 100);
    } else if (!els.target.hidden) { els.target.hidden = true; }
  }

  /* ---------- minimapa ---------- */
  var miniBase, miniCtx, miniT = 0, CELL = 4;
  var WALL_COL = { 1: '#6b6a72', 2: '#4f8040', 3: '#8a5a45', 4: '#a0662a', 5: '#55545e', 6: '#d9a23a' };
  function drawMiniBase() {
    var mc = miniBase.getContext('2d');
    for (var y = 0; y < game.h; y++) {
      for (var x = 0; x < game.w; x++) {
        var v = game.grid[y * game.w + x];
        mc.fillStyle = v === 0 ? '#25232c' : (WALL_COL[v] || '#6b6a72');
        mc.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  }
  function drawMini(now) {
    miniCtx.drawImage(miniBase, 0, 0);
    var i, e, col;
    for (i = 0; i < game.ents.length; i++) {
      e = game.ents[i];
      if (e.type === 'monster') { if (e.hp <= 0) { continue; } col = '#e04a4a'; }
      else if (e.type === 'node') { if (now < e.until) { continue; } col = '#59d27a'; }
      else { col = '#f0d04a'; }
      miniCtx.fillStyle = col;
      miniCtx.fillRect(e.x * CELL - 1, e.y * CELL - 1, 3, 3);
    }
    var pl = game.pl;
    miniCtx.fillStyle = '#ffffff';
    miniCtx.fillRect(pl.x * CELL - 1, pl.y * CELL - 1, 3, 3);
    miniCtx.strokeStyle = '#ffffff';
    miniCtx.beginPath();
    miniCtx.moveTo(pl.x * CELL, pl.y * CELL);
    miniCtx.lineTo((pl.x + Math.cos(pl.a) * 1.6) * CELL, (pl.y + Math.sin(pl.a) * 1.6) * CELL);
    miniCtx.stroke();
  }

  /* ---------- diálogo e menu ---------- */
  function clearInput() { keys = {}; vk = {}; }
  function showPage() {
    var s = dialogState;
    els.dText.textContent = s.d.pages[s.i];
    els.dNext.textContent = s.i < s.d.pages.length - 1 ? 'Continuar' : 'Fechar';
  }
  function openDialog(d) {
    clearInput();
    dialogState = { d: d, i: 0 };
    els.dName.textContent = d.name;
    showPage();
    els.dialog.hidden = false;
    els.dNext.focus();
  }
  function advanceDialog() {
    var s = dialogState;
    if (!s) { return; }
    if (s.i < s.d.pages.length - 1) { s.i++; showPage(); } else { closeDialog(); }
  }
  function closeDialog() {
    var s = dialogState;
    if (!s) { return; }
    dialogState = null;
    els.dialog.hidden = true;
    if (els.dNext === document.activeElement) { els.dNext.blur(); }
    s.d.onClose();
    renderQuests();
    saveNow();
  }
  function setMenu(open) {
    menuOpen = open;
    els.menu.hidden = !open;
    if (open) { clearInput(); els.mClose.focus(); } else if (els.menu.contains(document.activeElement)) { document.activeElement.blur(); }
  }

  /* ---------- save ---------- */
  function saveNow() {
    try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(game.serialize())); }
    catch (e) { if (!warnedSave) { warnedSave = true; addLog('Não foi possível salvar neste navegador (aba privada?). Use o código de save.', 'hurt'); } }
  }
  function exportCode() { return window.btoa(JSON.stringify({ app: 'zeitgeist', save: game.serialize() })); }
  function importCode(text) {
    var o;
    try { o = JSON.parse(window.atob(text.replace(/\s+/g, ''))); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || o.app !== 'zeitgeist' || !o.save) { return false; }
    return game.load(o.save);
  }

  /* ---------- ações ---------- */
  function doInteract() {
    if (dialogState || menuOpen) { return; }
    var r = game.interact();
    if (!r) { addLog('Não há nada para usar aqui.', 'info'); return; }
    if (r.kind === 'talk') { openDialog(r.dialog); }
    updateHud();
  }

  function readInput() {
    var f = 0, s = 0, t = 0;
    if (keys.w || keys.ArrowUp || vk.fwd) { f += 1; }
    if (keys.s || keys.ArrowDown || vk.back) { f -= 1; }
    if (keys.d || vk.sr) { s += 1; }
    if (keys.a || vk.sl) { s -= 1; }
    if (keys.ArrowRight || vk.right) { t += 1; }
    if (keys.ArrowLeft || vk.left) { t -= 1; }
    return { fwd: f, strafe: s, turn: t };
  }

  var GAME_KEYS = { w: 1, a: 1, s: 1, d: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ' ': 1 };

  function onKeyDown(e) {
    var tag = e.target && e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') { return; }
    if (e.ctrlKey || e.metaKey || e.altKey) { return; }
    var k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (dialogState) {
      if (k === 'Escape') { closeDialog(); e.preventDefault(); }
      else if (k === 'e') { advanceDialog(); e.preventDefault(); }
      return;
    }
    if (k === 'Escape' || k === 'm') { setMenu(!menuOpen); e.preventDefault(); return; }
    if (menuOpen) { return; }
    if (GAME_KEYS[k]) {
      if (k === ' ') {
        if (tag === 'BUTTON') { return; }
        doInteract(); e.preventDefault(); return;
      }
      keys[k] = true; e.preventDefault(); return;
    }
    if (k === 'e') { doInteract(); }
    else if (k === '1') { game.setStance('ofensiva'); }
    else if (k === '2') { game.setStance('defensiva'); }
    else if (k === '3' || k === 'h') { game.usePotion(); }
  }
  function onKeyUp(e) {
    var k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys[k] = false;
  }

  function bindHold(btn) {
    var k = btn.getAttribute('data-vk');
    function down(ev) { ev.preventDefault(); vk[k] = true; }
    function up() { vk[k] = false; }
    if (window.PointerEvent) {
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    } else {
      btn.addEventListener('mousedown', down);
      btn.addEventListener('mouseup', up);
      btn.addEventListener('mouseleave', up);
      btn.addEventListener('touchstart', down);
      btn.addEventListener('touchend', up);
      btn.addEventListener('touchcancel', up);
    }
  }

  /* ---------- laço ---------- */
  var last = 0;
  function frame(t) {
    window.requestAnimationFrame(frame);
    if (t - last < 28) { return; }
    var dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    var now = Date.now();
    if (!dialogState && !menuOpen) { game.update(dt, readInput()); }
    engine.render(game.pl.x, game.pl.y, game.pl.a, { w: game.w, h: game.h, grid: game.grid }, game.drawList(spriteIndex));
    updateHud();
    if (now - miniT > 100) { miniT = now; drawMini(now); }
  }

  function start(res) {
    D = res.game;
    spriteIndex = null;
    els.view = $('view');
    engine = new ZG.Engine(els.view, res.walls, res.sprites, res.atlas);
    spriteIndex = engine.spriteIndex;

    game = new ZG.Game(D, res.map, {
      say: function (m, kind) { addLog(m, kind); },
      fx: function (name) {
        if (name === 'hurt') { flash('#c0392b', 140); }
        else if (name === 'level') { flash('#f0b429', 260); }
        else if (name === 'death') { flash('#000000', 500); }
        else if (name === 'quests') { if (els.quests) { renderQuests(); } }
        else if (name === 'map') { drawMiniBase(); }
      }
    });
    window.__zg = game;
    window.__zgFrame = function () {   // usado nos testes de desempenho
      engine.render(game.pl.x, game.pl.y, game.pl.a, { w: game.w, h: game.h, grid: game.grid }, game.drawList(spriteIndex));
    };

    var loaded = false;
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) { loaded = game.load(JSON.parse(raw)); }
    } catch (e) { loaded = false; }
    if (!loaded) { game.reset(); }

    miniBase = document.createElement('canvas');
    miniBase.width = game.w * CELL; miniBase.height = game.h * CELL;
    els.mini.width = miniBase.width; els.mini.height = miniBase.height;
    miniCtx = els.mini.getContext('2d');
    drawMiniBase();

    els.loading.hidden = true;
    els.game.hidden = false;
    renderQuests();
    addLog(loaded ? 'Bem-vindo de volta.' : 'Bem-vindo! Chegue perto do Escudeiro Anselmo e fale com ele (botão Agir ou tecla E).', 'info');

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    var holds = document.querySelectorAll('[data-vk]');
    for (var i = 0; i < holds.length; i++) { bindHold(holds[i]); }

    $('btn-menu').addEventListener('click', function () { setMenu(!menuOpen); });
    els.mClose.addEventListener('click', function () { setMenu(false); });
    els.stOf.addEventListener('click', function () { game.setStance('ofensiva'); });
    els.stDe.addEventListener('click', function () { game.setStance('defensiva'); });
    els.pot.addEventListener('click', function () { game.usePotion(); });
    $('btn-act').addEventListener('click', doInteract);
    els.dNext.addEventListener('click', advanceDialog);
    $('m-save').addEventListener('click', function () { saveNow(); addLog('Jogo salvo.', 'good'); });
    $('m-export').addEventListener('click', function () {
      els.io.value = exportCode(); els.io.focus(); els.io.select();
      addLog('Código gerado. Copie o texto da caixa.', 'info');
    });
    $('m-import').addEventListener('click', function () {
      var v = els.io.value;
      if (!v.replace(/\s+/g, '')) { addLog('Cole o código na caixa primeiro.', 'info'); return; }
      if (!window.confirm('Isso substitui o progresso atual. Continuar?')) { return; }
      if (importCode(v)) { drawMiniBase(); renderQuests(); saveNow(); addLog('Progresso importado.', 'good'); setMenu(false); }
      else { addLog('Código inválido.', 'hurt'); }
    });
    $('m-reset').addEventListener('click', function () {
      if (!window.confirm('Apagar todo o progresso? Isso não pode ser desfeito.')) { return; }
      game.reset(); drawMiniBase(); renderQuests(); saveNow(); addLog('Progresso apagado.', 'info'); setMenu(false);
    });

    setInterval(saveNow, 5000);
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { hiddenAt = Date.now(); saveNow(); return; }
      if (hiddenAt) {
        var secs = Math.min(MAX_AWAY, (Date.now() - hiddenAt) / 1000);
        hiddenAt = 0;
        var healed = game.away(secs);
        if (healed >= 1) { addLog('Você descansou e recuperou ' + Math.round(healed) + ' de vida.', 'good'); }
      }
    });

    window.requestAnimationFrame(frame);
  }

  function boot() {
    els.loading = $('loading'); els.game = $('game');
    els.log = $('log'); els.quests = $('quests'); els.fx = $('fx');
    els.lv = $('lv'); els.xpT = $('xp-t'); els.xpBar = $('xp-bar');
    els.hpBar = $('hp-bar'); els.hpT = $('hp-t'); els.inv = $('inv');
    els.stOf = $('st-of'); els.stDe = $('st-de'); els.pot = $('btn-pot');
    els.target = $('target'); els.tName = $('t-name'); els.tHp = $('t-hp');
    els.mini = $('mini'); els.dialog = $('dialog'); els.dName = $('d-name');
    els.dText = $('d-text'); els.dNext = $('d-next');
    els.menu = $('menu'); els.mClose = $('m-close'); els.io = $('io');
    loadAll(start, function (err) {
      els.loading.textContent = 'Não foi possível carregar o jogo. Se abriu o arquivo direto do computador, use um servidor local (por exemplo, a extensão Live Server do VS Code).';
      if (window.console) { window.console.error(err); }
    });
  }

  boot();
})();
