/* Zeitgeist 1: primeira pessoa em grade, controlada por cliques.
   Clique no chão para ir até lá, clique em alguém ou algo para interagir, use as setas para andar casa a casa. */
(function (ZG) {
  'use strict';

  var CELL = 6;
  var WALL_COL = { 1: '#6b6a72', 2: '#4f8040', 3: '#8a5a45', 4: '#a0662a', 5: '#55545e', 6: '#d9a23a' };
  var VERB = { npc: 'falar', node: 'coletar', monster: 'atacar' };

  ZG.UI.boot({
    saveKey: 'zeitgeist1_save_v1',
    app: 'zeitgeist1',
    opts: { diag: false, turnFirst: true, turnSpeed: 7 },
    welcome: 'Bem-vindo! Clique no Escudeiro Anselmo, ali na frente, para falar com ele.',
    setup: function (ctx) {
      var game = ctx.game, D = ctx.D, $ = ctx.$, ui = ctx.ui;
      var canvas = $('view'), mini = $('mini'), hover = $('hover');
      var engine = new ZG.Engine(canvas, ctx.res.walls, ctx.res.sprites, ctx.res.atlas);
      var sprites = engine.spriteIndex;

      function nameOf(e) {
        if (e.type === 'monster') { return D.monsters[e.id].name; }
        if (e.type === 'npc') { return D.npcs[e.id].name; }
        return D.nodes[e.id].name;
      }
      function toScreen(ev) {
        var r = canvas.getBoundingClientRect();
        return { x: (ev.clientX - r.left) / r.width * ZG.SCREEN.w, y: (ev.clientY - r.top) / r.height * ZG.SCREEN.h };
      }

      canvas.addEventListener('click', function (ev) {
        hover.hidden = true;
        if (ui.isBusy()) { return; }
        var p = toScreen(ev), e = engine.pick(p.x, p.y);
        if (e) {
          if (!game.goToEnt(e)) { ui.addLog('Não há caminho até ' + nameOf(e) + '.', 'info'); }
          return;
        }
        var f = engine.floorAt(p.x, p.y);
        if (f && game.walkable(f.x, f.y)) {
          if (f.x === Math.floor(game.pl.x) && f.y === Math.floor(game.pl.y)) { return; }
          game.goTo(f.x, f.y); return;
        }
        if (p.x < ZG.SCREEN.w * 0.2) { game.stop(); game.turn(-1); }
        else if (p.x > ZG.SCREEN.w * 0.8) { game.stop(); game.turn(1); }
      });
      canvas.addEventListener('mousemove', function (ev) {
        var p = toScreen(ev), e = engine.pick(p.x, p.y);
        if (e) {
          hover.textContent = nameOf(e) + ' · ' + VERB[e.type];
          hover.hidden = false;
          canvas.style.cursor = 'pointer';
        } else {
          hover.hidden = true;
          var f = engine.floorAt(p.x, p.y);
          canvas.style.cursor = (f && game.walkable(f.x, f.y)) ? 'pointer' : (p.x < ZG.SCREEN.w * 0.2 ? 'w-resize' : (p.x > ZG.SCREEN.w * 0.8 ? 'e-resize' : 'default'));
        }
      });
      canvas.addEventListener('mouseleave', function () { hover.hidden = true; });

      mini.addEventListener('click', function (ev) {
        if (ui.isBusy()) { return; }
        var r = mini.getBoundingClientRect();
        var cx = Math.floor((ev.clientX - r.left) / r.width * game.w), cy = Math.floor((ev.clientY - r.top) / r.height * game.h);
        if (!game.goTo(cx, cy)) { ui.addLog('Não dá para chegar ali.', 'info'); }
      });

      var ACTS = {
        tl: function () { game.stop(); game.turn(-1); },
        tr: function () { game.stop(); game.turn(1); },
        fwd: function () { game.step(0); },
        back: function () { game.step(2); },
        sl: function () { game.step(3); },
        sr: function () { game.step(1); },
        act: function () { ui.doInteract(); }
      };
      var pad = document.querySelectorAll('[data-act]');
      for (var i = 0; i < pad.length; i++) {
        pad[i].addEventListener('click', (function (k) { return function () { if (!ui.isBusy()) { ACTS[k](); } }; })(pad[i].getAttribute('data-act')));
      }

      /* minimapa */
      var base = document.createElement('canvas'), mctx;
      base.width = game.w * CELL; base.height = game.h * CELL;
      mini.width = base.width; mini.height = base.height;
      mctx = mini.getContext('2d');
      function drawBase() {
        var b = base.getContext('2d');
        for (var y = 0; y < game.h; y++) {
          for (var x = 0; x < game.w; x++) {
            var v = game.grid[y * game.w + x];
            b.fillStyle = v === 0 ? '#25232c' : (WALL_COL[v] || '#6b6a72');
            b.fillRect(x * CELL, y * CELL, CELL, CELL);
          }
        }
      }
      drawBase();
      var miniT = 0;
      function drawMini(now) {
        mctx.drawImage(base, 0, 0);
        var i, e;
        if (game.route) {
          mctx.fillStyle = 'rgba(240,180,41,.7)';
          for (i = 0; i < game.route.length; i++) { mctx.fillRect(game.route[i].x * CELL + 2, game.route[i].y * CELL + 2, 2, 2); }
        }
        for (i = 0; i < game.ents.length; i++) {
          e = game.ents[i];
          if (e.type === 'monster') { if (e.hp <= 0) { continue; } mctx.fillStyle = '#e04a4a'; }
          else if (e.type === 'node') { if (now < e.until) { continue; } mctx.fillStyle = '#59d27a'; }
          else { mctx.fillStyle = '#f0d04a'; }
          mctx.fillRect(e.x * CELL - 2, e.y * CELL - 2, 4, 4);
        }
        var pl = game.pl;
        mctx.fillStyle = '#ffffff';
        mctx.fillRect(pl.x * CELL - 2, pl.y * CELL - 2, 4, 4);
        mctx.strokeStyle = '#ffffff';
        mctx.beginPath();
        mctx.moveTo(pl.x * CELL, pl.y * CELL);
        mctx.lineTo((pl.x + Math.cos(pl.a) * 1.4) * CELL, (pl.y + Math.sin(pl.a) * 1.4) * CELL);
        mctx.stroke();
      }

      return {
        draw: function (now) {
          var pl = game.pl;
          engine.render(pl.x, pl.y, pl.a, { w: game.w, h: game.h, grid: game.grid }, game.drawList(sprites));
          if (now - miniT > 100) { miniT = now; drawMini(now); }
        },
        mapChanged: drawBase,
        onKey: function (k) {
          if (k === 'w' || k === 'ArrowUp') { game.step(0); return true; }
          if (k === 's' || k === 'ArrowDown') { game.step(2); return true; }
          if (k === 'a') { game.step(3); return true; }
          if (k === 'd') { game.step(1); return true; }
          if (k === 'q' || k === 'ArrowLeft') { ACTS.tl(); return true; }
          if (k === 'e' || k === 'ArrowRight') { ACTS.tr(); return true; }
          if (k === 'f' || k === ' ') { ui.doInteract(); return true; }
          return false;
        },
        engine: engine
      };
    }
  });
})(window.ZG);
