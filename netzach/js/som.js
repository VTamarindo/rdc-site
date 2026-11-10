/* Netzach · sons feitos por código (Web Audio), provisórios, para testar a experiência:
   - musica(true/false): a trilha da tela inicial, um ciclo de 24 s que se repete (acordes longos, caixinha de música, eco);
   - criancas(): crianças rindo ao longe (o acordar da campanha);
   - missao(): o toque de missão completada;
   - campo(...): o vento e o trigo farfalhando, com volume e lado pela distância até o campo (som 3D, ver "ambiente");
   - foco() e clique(): a navegação nos menus (ligados sozinhos a todos os botões das janelas e da tela inicial).
   O navegador só deixa tocar som depois do primeiro clique ou tecla: até lá, tudo fica mudo e a música espera.
   ligado(true/false) liga e desliga tudo; volume('musica' | 'efeitos', 0 a 1) acerta cada parte (tela de Configurações).
   As escolhas ficam no navegador (fora do save). */
(function (NZ) {
  'use strict';
  var KEY = 'zg-vila-som', ctx = null, mestre = null, reverb = null, eco = null, sfx = null;
  var medidor = null;
  var ligadoJa = true;
  try { ligadoJa = localStorage.getItem(KEY) !== '0'; } catch (e) { /* sem armazenamento: ligado */ }
  var VOL = { mestre: 0.9, musica: 1.1, sfx: 0.9 };
  // volume escolhido pelo jogador (0 a 1), por cima do VOL
  var KEY_VOL = 'zg-vila-som-vol', USER = { musica: 1, efeitos: 1 };
  try { var uv = JSON.parse(localStorage.getItem(KEY_VOL) || '{}'); ['musica', 'efeitos'].forEach(function (k) { if (typeof uv[k] === 'number') { USER[k] = Math.max(0, Math.min(1, uv[k])); } }); } catch (e) { /* padrão */ }
  // celular: menos trabalho para o áudio (o jogo 3D disputa o processador e o som picotava): buffer maior e eco mais curto
  var TOQUE = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;

  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // monta o áudio na primeira vez; devolve false se o navegador não tem Web Audio
  function prepara() {
    if (ctx) { return true; }
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) { return false; }
    try { ctx = new AC(TOQUE ? { latencyHint: 'playback' } : undefined); } catch (e) { ctx = new AC(); }
    // limitador no fim: os acordes somados passavam de 1 e estouravam (o chiado); ele segura o pico sem mudar o resto
    var lim = ctx.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 4; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.25;
    lim.connect(ctx.destination);
    mestre = ctx.createGain(); mestre.gain.value = ligadoJa ? VOL.mestre : 0; mestre.connect(lim);
    medidor = ctx.createAnalyser(); medidor.fftSize = 2048; mestre.connect(medidor); // só para testes (estado())
    // reverberação: resposta de ruído que se apaga em 3 s, um pouco diferente em cada ouvido (o "sonho"). No celular ela
    // pesava demais junto com o jogo 3D (o som picotava): lá fica só o eco, que é leve
    if (TOQUE) { reverb = ctx.createGain(); reverb.gain.value = 0; } else {
      reverb = ctx.createConvolver();
      var n = Math.floor(ctx.sampleRate * 3), b = ctx.createBuffer(2, n, ctx.sampleRate);
      for (var c = 0; c < 2; c++) { var d = b.getChannelData(c); for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); } }
      reverb.buffer = b;
    }
    var rv = ctx.createGain(); rv.gain.value = 0.55; reverb.connect(rv); rv.connect(mestre);
    // eco: 3/8 de segundo, voltando três ou quatro vezes, cada vez mais abafado
    eco = ctx.createDelay(2); eco.delayTime.value = 0.375;
    var fb = ctx.createGain(); fb.gain.value = 0.38; var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    eco.connect(lp); lp.connect(fb); fb.connect(eco); lp.connect(reverb); lp.connect(mestre);
    sfx = ctx.createGain(); sfx.gain.value = VOL.sfx * USER.efeitos; sfx.connect(mestre);
    return true;
  }
  function pronto() { return prepara() && ctx.state === 'running'; }
  // o primeiro gesto destrava o som (regra dos navegadores) e começa a música, se ela estava esperando. No celular só
  // valem o fim do toque e o clique (touchstart e pointerdown não destravam): por isso a lista tem os dois tipos. Depois de
  // uma interrupção (ligação, aba escondida no iPhone), o próximo gesto destrava de novo
  function destrava() {
    if (escondido || !prepara()) { return; }
    if (ctx.state === 'running') { tocaMusica(); return; }
    var p = ctx.resume(); if (p && p.then) { p.then(function () { tocaMusica(); }, function () { /* sem gesto válido: o próximo tenta */ }); }
  }
  ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(function (ev) { window.addEventListener(ev, destrava, true); });
  // aba escondida: o áudio para (no celular ele seguia tocando ou voltava picotado); ao voltar, retoma
  var escondido = false;
  document.addEventListener('visibilitychange', function () {
    escondido = document.hidden; if (!ctx) { return; }
    if (escondido) { if (ctx.state === 'running') { ctx.suspend(); } } else { destrava(); }
  });

  // ---------- trilha da tela inicial ----------
  // 8 compassos de 3 s = 24 s. Cada um: o baixo, o acorde (notas MIDI) e a melodia da caixinha [segundo no compasso, nota]
  var CICLO = [
    { b: 41, a: [53, 57, 60, 64, 67], m: [[0, 76], [0.75, 79], [1.5, 84], [2.25, 83]] }, // Fá com sétima e nona
    { b: 40, a: [52, 55, 59, 62], m: [[0, 79], [1.5, 76]] },                           // Mi menor
    { b: 45, a: [52, 57, 60, 64, 71], m: [[0, 81], [0.75, 76], [1.5, 79], [2.25, 72]] }, // Lá menor
    { b: 43, a: [50, 55, 60, 62], m: [[0, 74], [1.5, 79]] },                           // Sol suspenso
    { b: 41, a: [53, 57, 60, 64], m: [[0, 81], [0.75, 84], [1.5, 88], [2.25, 86]] },
    { b: 38, a: [50, 53, 57, 60, 64], m: [[0, 84], [1.5, 81]] },                       // Ré menor
    { b: 46, a: [58, 62, 65, 69], m: [[0, 82], [0.75, 77], [1.5, 74], [2.25, 77]] },   // Si bemol
    { b: 48, a: [55, 60, 65, 67], m: [[0, 79], [1.5, 77], [2.25, 76]] }                // Dó suspenso
  ];
  var COMP = 3, DUR = CICLO.length * COMP;
  var querMusica = false, musica = null; // musica: { bus, lfo, ate (até onde já está marcado), timer }
  function pad(bus, lfo, m, t, dur, vol) {
    (TOQUE ? [0] : [-7, 7]).forEach(function (cents) { // no celular, uma voz por nota (metade do trabalho)
      var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = hz(m); o.detune.value = cents; lfo.connect(o.detune);
      f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = 0.4;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 1.3); g.gain.setValueAtTime(vol, t + dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.6);
      o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 1.7);
    });
  }
  function caixinha(bus, m, t, vol) { // caixinha de música: o tom e dois harmônicos que somem antes
    [[1, 1, 1.8], [2, 0.32, 0.7], [3.01, 0.12, 0.35]].forEach(function (h) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = hz(m) * h[0];
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * h[1], t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + h[2]);
      o.connect(g); g.connect(bus); g.connect(eco); o.start(t); o.stop(t + h[2] + 0.05);
    });
  }
  function marcaCiclo(M, t0) {
    CICLO.forEach(function (c, i) {
      var t = t0 + i * COMP;
      c.a.forEach(function (m) { pad(M.bus, M.lfo, m, t, COMP, 0.03); });
      var o = ctx.createOscillator(), g = ctx.createGain(); // baixo, bem macio
      o.type = 'sine'; o.frequency.value = hz(c.b);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + COMP + 0.8);
      o.connect(g); g.connect(M.bus); o.start(t); o.stop(t + COMP + 0.9);
      c.m.forEach(function (n) { caixinha(M.bus, n[1], t + n[0] + (Math.random() - 0.5) * 0.03, 0.085); });
    });
  }
  function tocaMusica() {
    if (musica || !querMusica || !pronto()) { return; }
    var bus = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3200; // tudo um pouco abafado, como lembrança
    bus.connect(lp); lp.connect(mestre); lp.connect(reverb);
    bus.gain.setValueAtTime(0.0001, ctx.currentTime); bus.gain.linearRampToValueAtTime(Math.max(0.0001, VOL.musica * USER.musica), ctx.currentTime + 2.5);
    lfo.frequency.value = 0.23; lg.gain.value = 9; lfo.connect(lg); lfo.start(); // "fita velha": a afinação oscila de leve
    var M = musica = { bus: bus, lfo: lg, osc: lfo, ate: ctx.currentTime + 0.15 };
    function adiante() { // marca o próximo ciclo 4 s antes do fim do atual, para não ter buraco
      if (musica !== M) { return; }
      while (M.ate < ctx.currentTime + 4) { marcaCiclo(M, M.ate); M.ate += DUR; }
    }
    adiante(); M.timer = setInterval(adiante, 1000);
  }
  function paraMusica(seg) {
    var M = musica; musica = null; if (!M) { return; }
    clearInterval(M.timer);
    var t = ctx.currentTime; M.bus.gain.cancelScheduledValues(t); M.bus.gain.setValueAtTime(M.bus.gain.value, t); M.bus.gain.linearRampToValueAtTime(0.0001, t + (seg || 2));
    setTimeout(function () { try { M.bus.disconnect(); M.osc.stop(); } catch (e) { /* já parou */ } }, (seg || 2) * 1000 + 200);
  }

  // ---------- crianças rindo ao longe ----------
  // cada risada: sílabas "ha" (vogal com dois formantes) que descem de tom, e um "hi" mais agudo no fim; três crianças
  function silaba(saida, t, f0, vogal, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain(), sum = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 1.12, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.86, t + 0.11);
    (vogal === 'i' ? [[420, 5, 1], [3000, 9, 0.6]] : [[1050, 5, 1], [1750, 7, 0.55], [3100, 9, 0.2]]).forEach(function (F) {
      var bp = ctx.createBiquadFilter(), fg = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = F[0]; bp.Q.value = F[1]; fg.gain.value = F[2];
      o.connect(bp); bp.connect(fg); fg.connect(sum);
    });
    // o "h": um sopro de ruído antes da vogal
    var nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate), nd = nb.getChannelData(0);
    for (var i = 0; i < nd.length; i++) { nd[i] = Math.random() * 2 - 1; }
    var ns = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), ng = ctx.createGain(); ns.buffer = nb; hp.type = 'highpass'; hp.frequency.value = 1800;
    ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); ns.connect(hp); hp.connect(ng); ng.connect(saida); ns.start(t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.025); g.gain.setValueAtTime(vol, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    sum.connect(g); g.connect(saida); o.start(t); o.stop(t + 0.15);
  }
  function criancas() {
    if (!pronto()) { return; }
    var t0 = ctx.currentTime + 0.1, saida = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 4200; saida.gain.value = 0.92; // ao longe: um pouco abafado
    saida.connect(lp); lp.connect(sfx); // sem reverberação: com ela a risada ficava ecoando
    [[0, 410, -0.5], [0.45, 470, 0.4], [1.1, 360, 0.1]].forEach(function (cr) {
      var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (pan.pan) { pan.pan.value = cr[2]; }
      pan.connect(saida);
      for (var r = 0; r < 2; r++) { // duas risadas por criança
        var t = t0 + cr[0] + r * 1.7 + Math.random() * 0.3, n = 4 + Math.floor(Math.random() * 4), f = cr[1] * (1 + Math.random() * 0.1) * (r ? 1.08 : 1);
        for (var i = 0; i < n; i++) { silaba(pan, t, f * (1.22 - i * 0.055), 'a', 0.32 * (1 - i * 0.07)); t += 0.15 + Math.random() * 0.05; }
        silaba(pan, t + 0.05, f * 1.45, 'i', 0.22);
      }
    });
  }

  // ---------- ambiente: vento e trigo farfalhando perto do campo ----------
  // campo({ d, pan, atras, anda, dentro }) a cada pouco (js/ui.js, ambienteCampo): d = metros até o trigo mais perto (0 = dentro),
  // pan = de que lado ele está (-1 esquerda, 1 direita), atras = 0 a 1 (atrás da câmera fica mais abafado), anda = o jogador
  // anda dentro do trigo (o farfalhar cresce), dentro = numa casa (bem abafado). campo(null) apaga devagar.
  // Vento: ruído grave e abafado com rajadas lentas; farfalhar: ruído agudo que cresce e some em ondas (as espigas se esfregando)
  var AMB = { alcance: 35, vento: 0.16, trigo: 0.1, andando: 1.8 }, amb = null;
  function ruido(seg) {
    var n = Math.floor(ctx.sampleRate * seg), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), u = 0;
    for (var i = 0; i < n; i++) { u = 0.97 * u + 0.03 * (Math.random() * 2 - 1); d[i] = (Math.random() * 2 - 1) * 0.6 + u * 4; } // branco com um pouco de grave
    for (var k = 0; k < 2000; k++) { var a = k / 2000; d[k] = d[k] * a + d[n - 2000 + k] * (1 - a); } // emenda sem estalo no laço
    return b;
  }
  function montaAmb() {
    var A = { saida: ctx.createGain(), pan: ctx.createStereoPanner ? ctx.createStereoPanner() : null, lp: ctx.createBiquadFilter() };
    A.saida.gain.value = 0.0001; A.lp.type = 'lowpass'; A.lp.frequency.value = 9000;
    A.lp.connect(A.saida); if (A.pan) { A.saida.connect(A.pan); A.pan.connect(sfx); } else { A.saida.connect(sfx); }
    var buf = ruido(5);
    // vento
    var v = ctx.createBufferSource(), vf = ctx.createBiquadFilter(), vg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    v.buffer = buf; v.loop = true; vf.type = 'lowpass'; vf.frequency.value = 520; vf.Q.value = 0.7; vg.gain.value = AMB.vento;
    lfo.frequency.value = 0.09; lg.gain.value = 260; lfo.connect(lg); lg.connect(vf.frequency); // o vento sobe e desce de tom
    v.connect(vf); vf.connect(vg); vg.connect(A.lp); v.start(); lfo.start();
    // farfalhar: a mesma fonte, em outro ponto do laço, pelo agudo
    var t = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), bp = ctx.createBiquadFilter(), tg = ctx.createGain();
    t.buffer = buf; t.loop = true; hp.type = 'highpass'; hp.frequency.value = 1800; bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 0.6;
    tg.gain.value = 0.0001; t.connect(hp); hp.connect(bp); bp.connect(tg); tg.connect(A.lp); t.start(0, 2.3);
    A.fontes = [v, t, lfo]; A.vg = vg; A.tg = tg; A.anda = 0;
    // as ondas do farfalhar: a cada 0,4 a 1,6 s, um novo alvo de volume (mais alto e mais rápido quando o jogador anda no trigo)
    A.timer = setInterval(function () {
      if (!ctx || amb !== A) { return; }
      var now = ctx.currentTime, forte = 1 + A.anda * (AMB.andando - 1);
      tg.gain.setTargetAtTime(AMB.trigo * forte * (0.25 + Math.random() * 0.75), now, A.anda ? 0.12 : 0.35);
      vg.gain.setTargetAtTime(AMB.vento * (0.6 + Math.random() * 0.6), now, 1.2);
    }, 700);
    return A;
  }
  function campo(o) {
    if (!pronto()) { return; }
    if (!o) { if (amb) { amb.saida.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6); } return; }
    if (!amb) { amb = montaAmb(); }
    var now = ctx.currentTime, k = Math.max(0, 1 - o.d / AMB.alcance), vol = k * k * (o.dentro ? 0.3 : 1);
    amb.saida.gain.setTargetAtTime(Math.max(0.0001, vol), now, 0.25);
    if (amb.pan) { amb.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, o.pan || 0)), now, 0.15); }
    amb.lp.frequency.setTargetAtTime(o.dentro ? 700 : 9000 - 5500 * (o.atras || 0), now, 0.2);
    amb.anda = o.anda ? 1 : 0;
  }

  // ---------- toques curtos ----------
  function toque(notas, tipo, vol, dur) {
    if (!pronto()) { return; }
    var t = ctx.currentTime;
    notas.forEach(function (n) {
      var o = ctx.createOscillator(), g = ctx.createGain(), at = t + n[1];
      o.type = tipo; o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(sfx); o.start(at); o.stop(at + dur + 0.02);
    });
  }
  var focoT = 0;
  function foco() { var a = performance.now(); if (a - focoT < 45) { return; } focoT = a; toque([[1568, 0]], 'sine', 0.035, 0.07); }
  function clique() { toque([[784, 0], [1175, 0.045]], 'triangle', 0.07, 0.16); }
  function missao() { toque([[659.3, 0], [880, 0.12], [1318.5, 0.24]], 'triangle', 0.16, 0.7); }

  // navegação: todo botão dentro de uma janela, da tela inicial ou de uma janelinha (pop) faz som ao ganhar foco ou o mouse,
  // e ao ser apertado. Os botões do jogo em si (barra, analógico) ficam quietos
  function doMenu(el) { var b = el && el.closest && el.closest('button, [role=button], input[type=range]'); return b && b.closest('.win, #w-title, .pop') ? b : null; }
  document.addEventListener('pointerover', function (e) { var b = doMenu(e.target); if (b && !b.disabled && !(e.relatedTarget && b.contains(e.relatedTarget))) { foco(); } }, true);
  document.addEventListener('focusin', function (e) { var b = doMenu(e.target); if (b && !b.disabled && !b.matches(':hover')) { foco(); } }, true);
  document.addEventListener('click', function (e) { var b = doMenu(e.target); if (b && !b.disabled) { clique(); } }, true);

  NZ.som = {
    musica: function (on) { querMusica = !!on; if (on) { tocaMusica(); } else if (ctx) { paraMusica(2.5); } },
    criancas: criancas, missao: missao, foco: foco, clique: clique, campo: campo,
    volume: function (k, v) {
      if (!(k in USER)) { return 0; }
      if (v === undefined) { return USER[k]; }
      USER[k] = Math.max(0, Math.min(1, +v || 0)); try { localStorage.setItem(KEY_VOL, JSON.stringify(USER)); } catch (e) { /* vale até fechar */ }
      if (ctx) {
        var t = ctx.currentTime, g = k === 'musica' ? (musica && musica.bus.gain) : sfx.gain, alvo = k === 'musica' ? VOL.musica * USER.musica : VOL.sfx * USER.efeitos;
        if (g) { g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(Math.max(0.0001, alvo), t + 0.15); }
      }
      return USER[k];
    },
    estado: function () { var pico = 0; if (medidor) { var a = new Float32Array(medidor.fftSize); medidor.getFloatTimeDomainData(a); for (var i = 0; i < a.length; i++) { pico = Math.max(pico, Math.abs(a[i])); } } return { audio: ctx ? ctx.state : 'sem', musica: !!musica, ligado: ligadoJa, pico: Math.round(pico * 1000) / 1000 }; }, // para testes
    ligado: function (v) {
      if (v === undefined) { return ligadoJa; }
      ligadoJa = !!v; try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* vale até fechar */ }
      if (prepara()) { var t = ctx.currentTime; mestre.gain.cancelScheduledValues(t); mestre.gain.setValueAtTime(mestre.gain.value, t); mestre.gain.linearRampToValueAtTime(v ? VOL.mestre : 0, t + 0.3); }
      return ligadoJa;
    }
  };
})(window.NZ = window.NZ || {});
