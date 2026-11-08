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
  var CURSOR = 0.5, ROLA = 620, ZOOM = 60;              // cursor em larguras do mapa por segundo; rolagem em pixels; zoom em passos da barra
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
    var antes = [], ativo = false, avisou = false, foco = null, indice = 0, raizAntes = null, dir = null, espera = 0, rolar = 0, zoom = 0;
    // cursor do mapa em pixels da tela (null = ainda não posto: começa no meio do mapa); arrasta = barra presa ao cursor com A segurado
    var px = null, py = null, arrasta = null, noCanvas = false;
    var cursor = document.getElementById('map-cur'), mapa = document.getElementById('bigmap'), janMapa = document.getElementById('w-map');

    function liga(v) {
      if (v === ativo) { return; }
      ativo = v; document.body.classList.toggle('pad', v);
      // sem blur: o foco pode estar no campo de texto, e tirá-lo fecharia o teclado do console
      if (!v) { cursor.hidden = true; arrasta = null; if (foco) { foco.classList.remove('pad-foco'); foco = null; } }
      api.modo();
    }
    // câmera invertida por eixo: escolha de quem joga, guardada no navegador, fora do save
    var CAM_KEY = 'zg-vila-camera', inv = { x: false, y: false }, info = document.getElementById('pad-info'), infoId = null;
    try { var salvo = JSON.parse(localStorage.getItem(CAM_KEY)); if (salvo) { inv.x = !!salvo.x; inv.y = !!salvo.y; } } catch (e) { /* começa no padrão */ }
    function pinta() {
      Array.prototype.forEach.call(document.querySelectorAll('[data-inv]'), function (b) { b.setAttribute('aria-pressed', inv[b.dataset.inv] ? 'true' : 'false'); });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-inv]'), function (b) {
      b.addEventListener('click', function () {
        inv[b.dataset.inv] = !inv[b.dataset.inv]; pinta();
        try { localStorage.setItem(CAM_KEY, JSON.stringify(inv)); } catch (e) { /* vale até fechar */ }
      });
    });
    pinta();
    // no Edge do Xbox o controle começa movendo um cursor, e a página não consegue mudar isso: só quem joga, pelo menu do navegador
    var xbox = /Xbox/i.test(navigator.userAgent);
    document.body.classList.toggle('xbox', xbox);
    if (xbox) { setTimeout(function () { api.toast('No Xbox, segure o botão Menu e escolha a opção de controles de jogo do navegador.', 8); }, 1500); }

    // mouse, toque ou teclado devolvem a tela ao jeito normal
    function solta() { liga(false); }
    window.addEventListener('pointerdown', solta, true);
    window.addEventListener('keydown', solta, true);

    // fixo = foco do cursor do mapa: rolar até o botão o tiraria de baixo do cursor
    function poe(el, fixo) {
      if (foco === el) { return; }
      if (foco) { foco.classList.remove('pad-foco'); if (document.activeElement === foco) { foco.blur(); } }
      foco = el;
      if (!el) { return; }
      el.classList.add('pad-foco');
      if (!digitavel(el)) { el.focus({ preventScroll: true }); } // focar um campo de texto abriria o teclado do console sem pedir
      if (!fixo) { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
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
    // o alvo mais perto naquela direção, pesando mais o desvio para o lado. O desvio conta da borda,
    // não do centro: abaixo de um botão largo, a casa da esquerda fica logo abaixo dele, sem desvio
    function vizinho(l, d) {
      var a = foco.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2, melhor = null, nota = 1e9;
      function vao(a0, a1, b0, b1) { return Math.max(0, b0 - a1, a0 - b1); }
      l.forEach(function (el) {
        if (el === foco) { return; }
        var b = el.getBoundingClientRect(), dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
        var vai = d === 'c' ? -dy : d === 'b' ? dy : d === 'e' ? -dx : dx;
        var lado = d === 'c' || d === 'b' ? vao(a.left, a.right, b.left, b.right) : vao(a.top, a.bottom, b.top, b.bottom);
        if (vai < 4) { return; }
        // para os lados, o que está na mesma linha ganha: senão o botão largo logo acima, perto do centro, rouba o vizinho da direita
        var n = vai + lado * 2.5 + (lado > 0 && (d === 'e' || d === 'd') ? 1e4 : 0);
        if (n < nota) { nota = n; melhor = el; }
      });
      return melhor;
    }
    function ajusta(el, sinal) {
      var passo = +el.step || 1, v = Math.max(+el.min, Math.min(+el.max, +el.value + sinal * (el.id === 'map-zoom' ? 5 : passo)));
      if (v === +el.value) { return false; }
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
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
      // nas barras e números, esquerda e direita mudam o valor; no limite, o foco segue para o lado
      if (foco && ajustavel(foco) && (d === 'e' || d === 'd') && ajusta(foco, d === 'e' ? -1 : 1)) { return; }
      if (!foco) { poe(escolhe(lista)); return; }
      var v = vizinho(lista, d); if (v) { poe(v); }
    }
    function ponto() { return { clientX: px, clientY: py, bubbles: true }; }
    // barra presa ao cursor: o valor segue a posição do cursor sobre ela
    function arrastaBarra(el) {
      var q = el.getBoundingClientRect(), f = Math.max(0, Math.min(1, (px - q.left) / q.width));
      var mn = +el.min || 0, mx = el.max === '' ? 100 : +el.max, passo = +el.step || 1;
      var v = Math.round((mn + f * (mx - mn)) / passo) * passo;
      if (v === +el.value) { return; }
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // no mapa não há foco andando entre botões: o cursor percorre a janela inteira, e A age no que estiver embaixo dele
    function noMapa(g, b, press, l, r, dt) {
      var jr = janMapa.getBoundingClientRect(), mr = mapa.getBoundingClientRect(), m = 6;
      if (px === null) { px = mr.left + mr.width / 2; py = mr.top + mr.height / 2; }
      var vel = Math.max(mr.width, 280) * CURSOR;
      px += l[0] * vel * dt; py += l[1] * vel * dt;
      // janela maior que a tela (celular deitado): empurrar o cursor contra a borda rola a janela.
      // O limite é medido com o cursor no topo: lá embaixo ele mesmo aumentaria a área de rolagem, sem fim
      cursor.style.top = '0px';
      var fim = janMapa.scrollHeight - janMapa.clientHeight;
      if (py < jr.top + m) { janMapa.scrollTop = Math.max(0, janMapa.scrollTop - (jr.top + m - py)); }
      if (py > jr.bottom - m) { janMapa.scrollTop = Math.min(fim, janMapa.scrollTop + py - (jr.bottom - m)); }
      px = Math.max(jr.left + m, Math.min(jr.right - m, px)); py = Math.max(jr.top + m, Math.min(jr.bottom - m, py));
      cursor.hidden = false;
      cursor.style.left = (px - jr.left - janMapa.clientLeft + janMapa.scrollLeft) + 'px';
      cursor.style.top = (py - jr.top - janMapa.clientTop + janMapa.scrollTop) + 'px';

      var el = document.elementFromPoint(px, py), alvo = el && el.closest ? el.closest(ALVOS) : null;
      if (alvo && (!janMapa.contains(alvo) || !visivel(alvo))) { alvo = null; }
      var sobre = el === mapa;
      if (sobre) { mapa.dispatchEvent(new PointerEvent('pointermove', ponto())); } // o mapa mostra o que há sob o cursor
      else if (noCanvas) { mapa.dispatchEvent(new PointerEvent('pointerleave', ponto())); }
      noCanvas = sobre;
      if (!arrasta) { poe(alvo, true); }

      if (r[0] || r[1]) { api.mapPan(r[0] * CURSOR * dt, r[1] * CURSOR * dt); }
      zoom += ((g.buttons[RT] ? g.buttons[RT].value : 0) - (g.buttons[LT] ? g.buttons[LT].value : 0)) * ZOOM * dt;
      if (Math.abs(zoom) >= 1) { var z = zoom > 0 ? Math.floor(zoom) : Math.ceil(zoom); zoom -= z; api.mapZoom(z); }
      if (press(RB)) { api.cmd('macro'); return; }
      if (!b[A]) { arrasta = null; }
      if (arrasta) { arrastaBarra(arrasta); return; }
      if (press(A)) {
        if (alvo && ajustavel(alvo)) { arrasta = alvo; arrastaBarra(alvo); }
        else if (alvo) { aperta(alvo); }
        else if (sobre) { mapa.dispatchEvent(new MouseEvent('click', ponto())); }
      }
    }
    function janela(g, b, press, l, r, dt, win) {
      var sell = api.sell(), box = api.mapBox(), raiz = sell || box || api.painel() || document.getElementById(win);
      if (press(B)) {
        if (sell) { api.closeSell(); } else if (box) { api.mapBoxClose(); } else { api.hide(); }
        return;
      }
      if (win === 'w-map' && !sell) { raizAntes = null; noMapa(g, b, press, l, r, dt); return; }
      cursor.hidden = true; px = null; arrasta = null;
      if (raiz !== raizAntes) { raizAntes = raiz; indice = 0; } // outra janela ou submenu: a posição da lista anterior não vale aqui
      var lista = alvos(raiz);
      if (foco && lista.indexOf(foco) < 0) { foco.classList.remove('pad-foco'); foco = null; }
      if (!foco) { poe(escolhe(lista)); }
      indice = Math.max(0, lista.indexOf(foco));
      var d = direcao(b, l, dt);
      if (d) { anda(lista, d); }
      if (press(A) && foco) { aperta(foco); return; }
      if (r[1]) {
        rolar += r[1] * ROLA * dt;
        var n = rolar > 0 ? Math.floor(rolar) : Math.ceil(rolar);
        if (n) { raiz.scrollTop += n; rolar -= n; }
      }
    }
    function noJogo(press, l, r, dt) {
      poe(null); cursor.hidden = true; indice = 0; raizAntes = null; px = null; arrasta = null;
      api.move(-l[1], l[0]);
      if (r[0] || r[1]) { api.look((inv.x ? -1 : 1) * r[0] * OLHAR_X * dt, (inv.y ? -1 : 1) * r[1] * OLHAR_Y * dt); }
      if (press(A)) { api.interact(); }
      if (press(X)) { api.cmd('potion'); }
      if (press(Y)) { api.cmd('bag'); } // a janela Personagem: o inventário fica lá dentro, sem atalho próprio
      if (press(RB)) { api.cmd('macro'); }
      if (press(CIMA) || press(L3)) { api.quests(); }
      if (press(R3)) { api.cmd('stance'); }
    }

    return {
      active: function () { return ativo; },
      tick: function (dt) {
        var g = primeiro();
        if (!g) { api.move(0, 0); antes = []; return; }
        if (info && g.id !== infoId) { // como o navegador vê o controle: ajuda a entender eixos trocados num aparelho que não dá para testar daqui
          infoId = g.id;
          info.textContent = 'Controle: ' + g.id + ' · ' + (g.mapping === 'standard' ? 'mapeamento padrão' : 'mapeamento não padrão') + ' · ' + g.axes.length + ' eixos';
        }
        var b = g.buttons.map(function (x) { return x.pressed || x.value > 0.5; });
        var ax = g.axes, l = analogico(ax[0] || 0, ax[1] || 0), r = analogico(ax[2] || 0, ax[3] || 0);
        if (b.indexOf(true) >= 0 || l[0] || l[1] || r[0] || r[1]) {
          liga(true);
          if (!avisou) { avisou = true; api.toast('Controle conectado.'); }
        }
        if (!ativo) { api.move(0, 0); antes = b; return; } // controle parado não disputa com mouse e teclado
        var velho = antes, press = function (i) { return b[i] && !velho[i]; }, win = api.win();
        antes = b;
        if (press(MENU)) { api.cmd('menu'); return; }
        if (press(VIEW)) { api.cmd('map'); return; }
        if (win) { api.move(0, 0); janela(g, b, press, l, r, dt, win); } else { noJogo(press, l, r, dt); }
      }
    };
  };
})(window.NZ = window.NZ || {});
