/* Netzach · controle (Gamepad API)
   Lê o controle a cada quadro e fala com o jogo só pelo que o ui.js entrega em api. Fora de janelas o controle joga;
   com janela aberta, um foco visível anda entre os botões; no mapa, um cursor faz o papel do clique. */
(function (NZ) {
  'use strict';

  // no navegador do Xbox o controle vira um cursor de mouse se a página não pedir o contrário
  try { navigator.gamepadInputEmulation = 'gamepad'; } catch (e) { /* navegador sem esse ajuste */ }

  // ordem padrão dos botões no Gamepad API
  var A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, VIEW = 8, MENU = 9, L3 = 10, R3 = 11, CIMA = 12, BAIXO = 13, ESQ = 14, DIR = 15;
  var MORTA = 0.18;                                     // abaixo disso o analógico conta como solto: controle gasto não anda sozinho
  var OLHAR_X = 2.6, OLHAR_Y = 1.7;                     // radianos por segundo com o analógico no fim
  var REPETE_1 = 0.35, REPETE = 0.12;                   // segurar uma direção: espera antes de repetir, e o passo depois
  var CURSOR = 0.45, ROLA = 620, ZOOM = 60;             // cursor em frações do mapa por segundo; rolagem em pixels; zoom em passos da barra
  var ALVOS = 'button, input, select, textarea, a[href]';

  function analogico(x, y) {
    var m = Math.hypot(x, y); if (m < MORTA) { return [0, 0]; }
    var a = Math.min(1, (m - MORTA) / (1 - MORTA));
    return [x / m * a, y / m * a];
  }
  function primeiro() {
    var l = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < l.length; i++) { if (l[i] && l[i].connected !== false) { return l[i]; } }
    return null;
  }
  function visivel(el) { return !el.disabled && el.getClientRects().length > 0; }
  function ajustavel(el) { return el.tagName === 'INPUT' && (el.type === 'range' || el.type === 'number'); }
  function digitavel(el) { return el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search')); }

  NZ.controle = function (api) {
    var antes = [], ativo = false, avisou = false, foco = null, indice = 0, dir = null, espera = 0, rolar = 0, zoom = 0;
    var cx = 0.5, cy = 0.5, cursor = document.getElementById('map-cur'), mapa = document.getElementById('bigmap'), usaCursor = true;

    function liga(v) {
      if (v === ativo) { return; }
      ativo = v; document.body.classList.toggle('pad', v);
      api.modo();
    }
    // mouse, toque ou teclado devolvem a tela ao jeito normal
    function solta() { liga(false); }
    window.addEventListener('pointerdown', solta, true);
    window.addEventListener('keydown', solta, true);

    function poe(el) {
      if (foco === el) { return; }
      if (foco) { foco.classList.remove('pad-foco'); if (document.activeElement === foco) { foco.blur(); } }
      foco = el;
      if (!el) { return; }
      el.classList.add('pad-foco');
      if (!digitavel(el)) { el.focus({ preventScroll: true }); } // focar um campo de texto abriria o teclado do console sem pedir
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    function alvos(raiz) {
      return Array.prototype.filter.call(raiz.querySelectorAll(ALVOS), function (el) { return visivel(el) && !el.classList.contains('num'); });
    }
    // sem foco válido: volta ao que a janela focou, ao lugar anterior da lista, ou ao primeiro botão que não seja Fechar
    function escolhe(l) {
      var at = document.activeElement;
      if (l.indexOf(at) >= 0) { return at; }
      if (indice > 0 && l.length) { return l[Math.min(indice, l.length - 1)]; }
      return l.filter(function (el) { return !el.classList.contains('x'); })[0] || l[0] || null;
    }
    // o alvo mais perto naquela direção, pesando mais o desvio para o lado
    function vizinho(l, d) {
      var a = foco.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2, melhor = null, nota = 1e9;
      l.forEach(function (el) {
        if (el === foco) { return; }
        var b = el.getBoundingClientRect(), dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
        var vai = d === 'c' ? -dy : d === 'b' ? dy : d === 'e' ? -dx : dx, lado = d === 'c' || d === 'b' ? Math.abs(dx) : Math.abs(dy);
        if (vai < 4) { return; }
        var n = vai + lado * 2.5;
        if (n < nota) { nota = n; melhor = el; }
      });
      return melhor;
    }
    function ajusta(el, sinal) {
      var passo = +el.step || 1, v = Math.max(+el.min, Math.min(+el.max, +el.value + sinal * (el.id === 'map-zoom' ? 5 : passo)));
      if (v === +el.value) { return; }
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function aperta(el) {
      if (digitavel(el)) { el.focus(); return; } // aí sim abre o teclado do console
      if (!ajustavel(el)) { el.click(); }
    }
    // direcional e, fora do mapa, analógico: um passo ao apertar, e repete ao segurar
    function direcao(b, l, dt) {
      var d = b[CIMA] || l[1] < -0.5 ? 'c' : b[BAIXO] || l[1] > 0.5 ? 'b' : b[ESQ] || l[0] < -0.5 ? 'e' : b[DIR] || l[0] > 0.5 ? 'd' : null;
      if (d !== dir) { dir = d; espera = REPETE_1; return d; }
      if (!d) { return null; }
      espera -= dt; if (espera > 0) { return null; }
      espera = REPETE; return d;
    }
    function anda(lista, d) {
      if (foco && ajustavel(foco) && (d === 'e' || d === 'd')) { ajusta(foco, d === 'e' ? -1 : 1); return; }
      if (!foco) { poe(escolhe(lista)); return; }
      var v = vizinho(lista, d); if (v) { poe(v); }
    }
    function pontoNaTela() {
      var r = mapa.getBoundingClientRect();
      return { clientX: r.left + cx * r.width, clientY: r.top + cy * r.height, bubbles: true };
    }
    function cursorNoMapa(on) {
      cursor.hidden = !on; if (!on) { return; }
      cursor.style.left = cx * 100 + '%'; cursor.style.top = cy * 100 + '%';
    }
    function noMapa(g, b, press, l, r, dt) {
      if (l[0] || l[1]) {
        usaCursor = true; poe(null);
        var nx = cx + l[0] * CURSOR * dt, ny = cy + l[1] * CURSOR * dt;
        // no canto, com zoom, o mapa anda em vez de o cursor sair
        api.mapPan(nx < 0 ? nx : nx > 1 ? nx - 1 : 0, ny < 0 ? ny : ny > 1 ? ny - 1 : 0);
        cx = Math.max(0, Math.min(1, nx)); cy = Math.max(0, Math.min(1, ny));
        mapa.dispatchEvent(new PointerEvent('pointermove', pontoNaTela()));
      }
      if (r[0] || r[1]) { api.mapPan(r[0] * CURSOR * dt, r[1] * CURSOR * dt); }
      zoom += ((g.buttons[RT] ? g.buttons[RT].value : 0) - (g.buttons[LT] ? g.buttons[LT].value : 0)) * ZOOM * dt;
      if (Math.abs(zoom) >= 1) { var z = zoom > 0 ? Math.floor(zoom) : Math.ceil(zoom); zoom -= z; api.mapZoom(z); }
      cursorNoMapa(true);
      if (press(RB)) { api.cmd('macro'); return; }
      if (press(A)) {
        if (foco && !usaCursor) { aperta(foco); return; }
        mapa.dispatchEvent(new MouseEvent('click', pontoNaTela()));
      }
    }
    function janela(g, b, press, l, r, dt, win) {
      var sell = api.sell(), box = api.mapBox(), raiz = sell || box || document.getElementById(win);
      var soMapa = win === 'w-map' && !sell && !box;
      if (press(B)) {
        if (sell) { api.closeSell(); } else if (box) { api.mapBoxClose(); } else { api.hide(); }
        return;
      }
      var lista = alvos(raiz);
      if (foco && lista.indexOf(foco) < 0) { foco.classList.remove('pad-foco'); foco = null; }
      if (!foco && !(soMapa && usaCursor)) { poe(escolhe(lista)); }
      indice = Math.max(0, lista.indexOf(foco));
      var d = direcao(b, soMapa ? [0, 0] : l, dt);
      if (d) { if (soMapa) { usaCursor = false; } anda(lista, d); }
      if (soMapa) { noMapa(g, b, press, l, r, dt); return; }
      cursorNoMapa(false);
      if (press(A) && foco) { aperta(foco); return; }
      if (r[1]) {
        rolar += r[1] * ROLA * dt;
        var n = rolar > 0 ? Math.floor(rolar) : Math.ceil(rolar);
        if (n) { raiz.scrollTop += n; rolar -= n; }
      }
    }
    function noJogo(press, l, r, dt) {
      poe(null); cursorNoMapa(false); indice = 0; usaCursor = true; cx = cy = 0.5;
      api.move(-l[1], l[0]);
      if (r[0] || r[1]) { api.look(r[0] * OLHAR_X * dt, r[1] * OLHAR_Y * dt); }
      if (press(A)) { api.interact(); }
      if (press(X)) { api.cmd('potion'); }
      if (press(Y)) { api.cmd('bag'); }
      if (press(LB)) { api.cmd('inv'); }
      if (press(RB)) { api.cmd('macro'); }
      if (press(L3)) { api.quests(); }
      if (press(R3)) { api.cmd('stance'); }
    }

    return {
      active: function () { return ativo; },
      tick: function (dt) {
        var g = primeiro();
        if (!g) { api.move(0, 0); antes = []; return; }
        var b = g.buttons.map(function (x) { return x.pressed || x.value > 0.5; });
        var ax = g.axes, l = analogico(ax[0] || 0, ax[1] || 0), r = analogico(ax[2] || 0, ax[3] || 0);
        if (b.indexOf(true) >= 0 || l[0] || l[1] || r[0] || r[1]) {
          liga(true);
          if (!avisou) { avisou = true; api.toast('Controle conectado.'); }
        }
        if (!ativo) { api.move(0, 0); antes = b; return; } // controle parado não disputa com mouse e teclado
        var press = function (i) { return b[i] && !antes[i]; }, win = api.win();
        antes = b;
        if (press(MENU)) { api.cmd('menu'); return; }
        if (press(VIEW)) { api.cmd('map'); return; }
        if (win) { api.move(0, 0); janela(g, b, press, l, r, dt, win); } else { noJogo(press, l, r, dt); }
      }
    };
  };
})(window.NZ = window.NZ || {});
