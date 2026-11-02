/* Interface comum às versões do Zeitgeist: carregamento, HUD, missões, diário, diálogo, menu, save
   e o laço do jogo (que continua rodando com a aba em segundo plano).
   Cada versão chama ZG.UI.boot({...}) e cuida só da sua tela e dos seus controles. */
(function (ZG) {
  'use strict';

  var V = '2';
  var MAX_CATCHUP = 300;          // segundos simulados de uma vez quando a aba volta do segundo plano
  var STEP = 1 / 30;
  function $(id) { return document.getElementById(id); }
  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

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

  function boot(cfg) {
    var game, D, view = null, els = {};
    var dialogState = null, menuOpen = false, warnedSave = false, baseTitle = document.title;

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
      while (els.log.childNodes.length > 10) { els.log.removeChild(els.log.lastChild); }
    }
    function renderQuests() {
      var lines = game.questLines(), h = '';
      for (var i = 0; i < lines.length; i++) {
        var q = lines[i];
        h += '<li class="' + (q.ready ? 'ready' : '') + '"><b>' + esc(q.title) + '</b> <small>' + esc(q.kind) + '</small><small>' + esc(q.text) + '</small></li>';
      }
      els.quests.innerHTML = h || '<li><small>Nenhuma missão ativa. Clique no Escudeiro Anselmo para falar com ele.</small></li>';
    }
    var fxTimer = 0;
    function flash(color, ms) {
      els.fx.style.background = color;
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
      if (els.auto._p !== game.auto) { els.auto._p = game.auto; els.auto.setAttribute('aria-pressed', game.auto ? 'true' : 'false'); }
      setText(els.autoSt, game.auto ? (game.autoStatus || 'Pensando no próximo passo…') : 'Clique no chão para andar, ou em alguém ou algo para interagir.');
      var c = game.cur;
      if (c) {
        var def = D.monsters[c.id];
        els.target.hidden = false;
        setText(els.tName, def.name);
        setW(els.tHp, c.hp / def.hp * 100);
      } else if (!els.target.hidden) { els.target.hidden = true; }
    }

    /* ---------- diálogo e menu ---------- */
    function showPage() {
      var s = dialogState;
      els.dText.textContent = s.d.pages[s.i];
      els.dNext.textContent = s.i < s.d.pages.length - 1 ? 'Continuar' : 'Fechar';
    }
    function openDialog(d) {
      dialogState = { d: d, i: 0 };
      els.dName.textContent = d.name;
      showPage();
      els.dialog.hidden = false;
      els.dNext.focus();
      if (document.hidden) { document.title = '(!) ' + baseTitle; }
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
      if (open) { els.mClose.focus(); } else if (els.menu.contains(document.activeElement)) { document.activeElement.blur(); }
    }

    /* ---------- save ---------- */
    function saveNow() {
      if (!game) { return; }
      try { window.localStorage.setItem(cfg.saveKey, JSON.stringify(game.serialize())); }
      catch (e) { if (!warnedSave) { warnedSave = true; addLog('Não foi possível salvar neste navegador (aba privada?). Use o código de save.', 'hurt'); } }
    }
    function exportCode() { return window.btoa(JSON.stringify({ app: cfg.app, save: game.serialize() })); }
    function importCode(text) {
      var o;
      try { o = JSON.parse(window.atob(text.replace(/\s+/g, ''))); } catch (e) { o = null; }
      if (!o || typeof o !== 'object' || o.app !== cfg.app || !o.save) { return false; }
      return game.load(o.save);
    }

    function doInteract() {
      if (dialogState || menuOpen) { return; }
      var r = game.interact();
      if (!r) { addLog('Não há nada para usar aqui na frente.', 'info'); return; }
      if (r.kind === 'talk') { openDialog(r.dialog); }
    }
    function toggleAuto() {
      game.setAuto(!game.auto);
      addLog(game.auto ? 'Seguindo sozinho. Você pode assumir quando quiser.' : 'Você assumiu o controle.', 'info');
      saveNow();
    }

    /* ---------- laço: lógica por tempo real (também com a aba escondida), desenho só com a aba visível ---------- */
    var lastLogic = 0;
    function tick() {
      var now = performance.now();
      if (!lastLogic) { lastLogic = now; return; }
      var el = (now - lastLogic) / 1000;
      if (el < STEP * 0.9) { return; }
      lastLogic = now;
      if (dialogState || menuOpen) { return; }          // o tempo para enquanto há conversa ou menu aberto
      el = Math.min(el, MAX_CATCHUP);
      while (el > 0 && !dialogState) {
        var dt = Math.min(STEP, el);
        game.update(dt, { fwd: 0, strafe: 0, turn: 0 });
        el -= dt;
      }
    }
    var lastDraw = 0;
    function frame(t) {
      window.requestAnimationFrame(frame);
      if (t - lastDraw < 28) { return; }
      lastDraw = t;
      tick();
      view.draw(Date.now());
      updateHud();
    }

    function onKeyDown(e) {
      var tag = e.target && e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') { return; }
      if (e.ctrlKey || e.metaKey || e.altKey) { return; }
      var k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (dialogState) {
        if (k === 'Escape') { closeDialog(); e.preventDefault(); }
        else if (k === 'e' || k === 'Enter' || k === ' ') { if (tag !== 'BUTTON') { advanceDialog(); e.preventDefault(); } }
        return;
      }
      if (k === 'Escape' || k === 'm') { setMenu(!menuOpen); e.preventDefault(); return; }
      if (menuOpen) { return; }
      if (tag === 'BUTTON' && (k === ' ' || k === 'Enter')) { return; }
      if (k === '1') { game.setStance('ofensiva'); }
      else if (k === '2') { game.setStance('defensiva'); }
      else if (k === '3' || k === 'h') { game.usePotion(); }
      else if (k === 'g') { toggleAuto(); }
      else if (view.onKey && view.onKey(k, e)) { e.preventDefault(); }
    }

    function start(res) {
      D = res.game;
      game = new ZG.Game(D, res.map, {
        opts: cfg.opts,
        say: function (m, kind) {
          // no automático, golpe a golpe vira ruído: o diário mostra só os resultados
          if (game && game.auto && (kind === 'hit' || (kind === 'hurt' && / te acerta /.test(m)))) { return; }
          addLog(m, kind);
        },
        talk: function (d) { openDialog(d); },
        fx: function (name) {
          if (name === 'hurt') { flash('#c0392b', 140); }
          else if (name === 'level') { flash('#f0b429', 260); }
          else if (name === 'death') { flash('#000000', 500); }
          else if (name === 'quests') { if (els.quests) { renderQuests(); } }
          else if (name === 'map') { if (view && view.mapChanged) { view.mapChanged(); } }
        }
      });
      window.__zg = game;

      var loaded = false;
      try {
        var raw = window.localStorage.getItem(cfg.saveKey);
        if (raw) { loaded = game.load(JSON.parse(raw)); }
      } catch (e) { loaded = false; }
      if (!loaded) { game.reset(); }

      els.loading.hidden = true;
      els.game.hidden = false;
      view = cfg.setup({ game: game, res: res, D: D, $: $, ui: { addLog: addLog, doInteract: doInteract, isBusy: function () { return !!dialogState || menuOpen; } } });
      window.__zgView = view;
      renderQuests();
      addLog(loaded ? 'Bem-vindo de volta.' : cfg.welcome, 'info');

      window.addEventListener('keydown', onKeyDown);
      $('btn-menu').addEventListener('click', function () { setMenu(!menuOpen); });
      els.mClose.addEventListener('click', function () { setMenu(false); });
      els.stOf.addEventListener('click', function () { game.setStance('ofensiva'); });
      els.stDe.addEventListener('click', function () { game.setStance('defensiva'); });
      els.pot.addEventListener('click', function () { game.usePotion(); });
      els.auto.addEventListener('click', toggleAuto);
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
        if (importCode(v)) { if (view.mapChanged) { view.mapChanged(); } renderQuests(); saveNow(); addLog('Progresso importado.', 'good'); setMenu(false); }
        else { addLog('Código inválido.', 'hurt'); }
      });
      $('m-reset').addEventListener('click', function () {
        if (!window.confirm('Apagar todo o progresso? Isso não pode ser desfeito.')) { return; }
        game.reset(); if (view.mapChanged) { view.mapChanged(); } renderQuests(); saveNow(); addLog('Progresso apagado.', 'info'); setMenu(false);
      });

      setInterval(saveNow, 5000);
      setInterval(tick, 250);                           // com a aba escondida o navegador desacelera isto, e o tick compensa pelo relógio
      window.addEventListener('pagehide', saveNow);
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { saveNow(); } else { document.title = baseTitle; tick(); }
      });
      window.requestAnimationFrame(frame);
    }

    els.loading = $('loading'); els.game = $('game');
    els.log = $('log'); els.quests = $('quests'); els.fx = $('fx');
    els.lv = $('lv'); els.xpT = $('xp-t'); els.xpBar = $('xp-bar');
    els.hpBar = $('hp-bar'); els.hpT = $('hp-t'); els.inv = $('inv');
    els.stOf = $('st-of'); els.stDe = $('st-de'); els.pot = $('btn-pot');
    els.auto = $('btn-auto'); els.autoSt = $('auto-status');
    els.target = $('target'); els.tName = $('t-name'); els.tHp = $('t-hp');
    els.dialog = $('dialog'); els.dName = $('d-name');
    els.dText = $('d-text'); els.dNext = $('d-next');
    els.menu = $('menu'); els.mClose = $('m-close'); els.io = $('io');

    var res = {}, left = 5, failed = false;
    function mk(k) { return function (v) { res[k] = v; left--; if (left === 0 && !failed) { start(res); } }; }
    function bad(err) {
      if (failed) { return; }
      failed = true;
      els.loading.textContent = 'Não foi possível carregar o jogo. Se abriu o arquivo direto do computador, use um servidor local (por exemplo, a extensão Live Server do VS Code).';
      if (window.console) { window.console.error(err); }
    }
    getJSON('data/game.json', mk('game'), bad);
    getJSON('data/map.json', mk('map'), bad);
    getJSON('art/atlas.json', mk('atlas'), bad);
    getImage('art/walls.png', mk('walls'), bad);
    getImage('art/sprites.png', mk('sprites'), bad);
  }

  ZG.UI = { boot: boot };
})(window.ZG = window.ZG || {});
