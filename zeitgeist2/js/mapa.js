/* Zeitgeist 2: mapa visto de cima, clique para ir.
   Clique no chão para andar, clique em alguém ou algo para interagir. A câmera segue o herói. */
(function (ZG) {
  'use strict';

  var W = 320, H = 200, T = 20, TS = 64;

  ZG.UI.boot({
    saveKey: 'zeitgeist2_save_v1',
    app: 'zeitgeist2',
    opts: { diag: true, turnFirst: false },
    welcome: 'Bem-vindo! Clique no Escudeiro Anselmo (a figura de manto, à direita) para falar com ele.',
    setup: function (ctx) {
      var game = ctx.game, D = ctx.D, $ = ctx.$, ui = ctx.ui, res = ctx.res;
      var canvas = $('view'), hover = $('hover');
      canvas.width = W; canvas.height = H;
      var c = canvas.getContext('2d');
      c.imageSmoothingEnabled = false;
      var spriteIdx = {};
      for (var i = 0; i < res.atlas.sprites.length; i++) { spriteIdx[res.atlas.sprites[i]] = i; }
      var cam = { x: 0, y: 0 }, hoverEnt = null;

      // fundo do mapa pré-desenhado (só muda quando uma porta abre)
      var base = document.createElement('canvas');
      base.width = game.w * T; base.height = game.h * T;
      function nearFloor(x, y) {
        for (var oy = -1; oy <= 1; oy++) {
          for (var ox = -1; ox <= 1; ox++) {
            var nx = x + ox, ny = y + oy;
            if (nx >= 0 && ny >= 0 && nx < game.w && ny < game.h && game.grid[ny * game.w + nx] === 0) { return true; }
          }
        }
        return false;
      }
      function drawBase() {
        var b = base.getContext('2d');
        b.imageSmoothingEnabled = false;
        for (var y = 0; y < game.h; y++) {
          for (var x = 0; x < game.w; x++) {
            var v = game.grid[y * game.w + x];
            if (v === 0) {
              b.fillStyle = ((x + y) & 1) ? '#3a3330' : '#36302d';
              b.fillRect(x * T, y * T, T, T);
              if (y > 0 && game.grid[(y - 1) * game.w + x] > 0) { b.fillStyle = 'rgba(0,0,0,.35)'; b.fillRect(x * T, y * T, T, 5); }
              if (x > 0 && game.grid[y * game.w + x - 1] > 0) { b.fillStyle = 'rgba(0,0,0,.2)'; b.fillRect(x * T, y * T, 3, T); }
            } else if (!nearFloor(x, y)) {
              b.fillStyle = '#121016'; b.fillRect(x * T, y * T, T, T);   // rocha maciça: fica escura para o mapa ficar legível
            } else {
              b.drawImage(res.walls, (v - 1) * TS, 0, TS, TS, x * T, y * T, T, T);
              b.fillStyle = 'rgba(0,0,0,.25)';
              b.fillRect(x * T, y * T + T - 3, T, 3);
            }
          }
        }
      }
      drawBase();

      function defOf(e) { return e.type === 'monster' ? D.monsters[e.id] : (e.type === 'npc' ? D.npcs[e.id] : D.nodes[e.id]); }
      function sizeOf(e) { return Math.round(T * (0.6 + (defOf(e).scale || 1))); }
      function visible(e, now) { return e.type === 'npc' || (e.type === 'monster' ? e.hp > 0 : now >= e.until); }
      function toWorld(ev) {
        var r = canvas.getBoundingClientRect();
        var sx = (ev.clientX - r.left) / r.width * W, sy = (ev.clientY - r.top) / r.height * H;
        return { x: (sx + cam.x) / T, y: (sy + cam.y) / T };
      }
      function entAt(p) {
        var best = null, bd = 1e9, now = Date.now();
        for (var k = 0; k < game.ents.length; k++) {
          var e = game.ents[k];
          if (!visible(e, now)) { continue; }
          var s = sizeOf(e) / T;
          var dx = p.x - e.x, top = e.y + 0.35 - s;
          if (Math.abs(dx) > Math.max(0.5, s * 0.45) || p.y < top || p.y > e.y + 0.5) { continue; }
          var d = Math.abs(dx) + Math.abs(p.y - (e.y - s * 0.3));
          if (d < bd) { bd = d; best = e; }
        }
        return best;
      }
      var VERB = { npc: 'falar', node: 'coletar', monster: 'atacar' };

      canvas.addEventListener('click', function (ev) {
        hover.hidden = true;
        if (ui.isBusy()) { return; }
        var p = toWorld(ev), e = entAt(p);
        if (e) { if (!game.goToEnt(e)) { ui.addLog('Não há caminho até ' + defOf(e).name + '.', 'info'); } return; }
        var tx = Math.floor(p.x), ty = Math.floor(p.y);
        if (!game.goTo(tx, ty)) { ui.addLog('Não dá para chegar ali.', 'info'); }
      });
      canvas.addEventListener('mousemove', function (ev) {
        var p = toWorld(ev), e = entAt(p);
        hoverEnt = e;
        if (e) { hover.textContent = defOf(e).name + ' · ' + VERB[e.type]; hover.hidden = false; canvas.style.cursor = 'pointer'; }
        else { hover.hidden = true; canvas.style.cursor = game.walkable(Math.floor(p.x), Math.floor(p.y)) ? 'pointer' : 'default'; }
      });
      canvas.addEventListener('mouseleave', function () { hover.hidden = true; hoverEnt = null; });

      function ring(x, y, r, color) {
        c.strokeStyle = color; c.lineWidth = 1.5;
        c.beginPath(); c.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2); c.stroke();
      }

      function draw(now) {
        var pl = game.pl;
        cam.x = Math.round(Math.max(0, Math.min(base.width - W, pl.x * T - W / 2)));
        cam.y = Math.round(Math.max(0, Math.min(base.height - H, pl.y * T - H / 2)));
        c.fillStyle = '#0c0b10'; c.fillRect(0, 0, W, H);
        c.drawImage(base, -cam.x, -cam.y);

        var k, e;
        if (game.route) {
          c.fillStyle = 'rgba(240,180,41,.75)';
          for (k = 0; k < game.route.length; k++) { c.fillRect((game.route[k].x + 0.5) * T - cam.x - 1.5, (game.route[k].y + 0.5) * T - cam.y - 1.5, 3, 3); }
        }
        var g = game.goal;
        if (g && g.kind === 'tile') { ring((g.x + 0.5) * T - cam.x, (g.y + 0.5) * T - cam.y, 7, '#f0b429'); }

        // entidades e herói, ordenados de cima para baixo
        var list = [];
        for (k = 0; k < game.ents.length; k++) { e = game.ents[k]; if (visible(e, now)) { list.push(e); } }
        list.push(pl);
        list.sort(function (a, b) { return a.y - b.y; });
        for (k = 0; k < list.length; k++) {
          e = list[k];
          var sx = e.x * T - cam.x, sy = e.y * T - cam.y;
          if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) { continue; }
          c.fillStyle = 'rgba(0,0,0,.35)';
          c.beginPath(); c.ellipse(sx, sy + 6, 7, 3, 0, 0, Math.PI * 2); c.fill();
          if (e === pl) {
            if (game.cur) { ring(sx, sy + 6, 9, 'rgba(224,74,74,.8)'); }
            c.fillStyle = '#1b1f27'; c.beginPath(); c.arc(sx, sy, 6.5, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#f0b429'; c.beginPath(); c.arc(sx, sy, 5, 0, Math.PI * 2); c.fill();
            c.strokeStyle = '#fff3c4'; c.lineWidth = 2;
            c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + Math.cos(pl.a) * 8, sy + Math.sin(pl.a) * 8); c.stroke();
            continue;
          }
          var def = defOf(e), s = sizeOf(e);
          if (e === hoverEnt || (g && g.e === e)) { ring(sx, sy + 6, 10, e.type === 'monster' ? '#e04a4a' : '#f0d04a'); }
          var top = Math.round(sy + 0.35 * T - s), left = Math.round(sx - s / 2);
          c.drawImage(res.sprites, spriteIdx[def.sprite] * TS, 0, TS, TS, left, top, s, s);
          if (e.flash > 0) { c.globalAlpha = e.flash * 0.6; c.fillStyle = '#fff'; c.fillRect(left + s * 0.2, top + s * 0.2, s * 0.6, s * 0.7); c.globalAlpha = 1; }
          if (e.type === 'monster' && e.hp < def.hp) {
            c.fillStyle = '#000'; c.fillRect(sx - 9, top - 4, 18, 3);
            c.fillStyle = '#e04a4a'; c.fillRect(sx - 9, top - 4, Math.max(1, 18 * e.hp / def.hp), 3);
          }
          if (e.type === 'npc' && hasNews(e.id)) {
            c.fillStyle = '#f0b429'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
            c.fillText('!', sx, top - 2);
          }
        }
      }
      // "!" sobre quem tem missão para dar ou receber
      function hasNews(npcId) {
        for (var qid in D.quests) {
          if (!Object.prototype.hasOwnProperty.call(D.quests, qid) || D.quests[qid].giver !== npcId) { continue; }
          var st = game.quests[qid];
          if ((st && st.s === 'ready') || game.questAvailable(qid)) { return true; }
        }
        return false;
      }

      return {
        draw: draw,
        mapChanged: drawBase,
        onKey: function (k) {
          var x = Math.floor(game.pl.x), y = Math.floor(game.pl.y);
          if (k === 'w' || k === 'ArrowUp') { game.goTo(x, y - 1); return true; }
          if (k === 's' || k === 'ArrowDown') { game.goTo(x, y + 1); return true; }
          if (k === 'a' || k === 'ArrowLeft') { game.goTo(x - 1, y); return true; }
          if (k === 'd' || k === 'ArrowRight') { game.goTo(x + 1, y); return true; }
          if (k === 'f' || k === 'e' || k === ' ') { ui.doInteract(); return true; }
          return false;
        },
        toScreen: function (wx, wy) { return { x: wx * T - cam.x, y: wy * T - cam.y }; }
      };
    }
  });
})(window.ZG);
