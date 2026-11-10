/* Netzach · sons feitos por código (Web Audio), provisórios, para testar a experiência:
   - musica('menu' | 'campo' | false): a trilha que toca (uma de cada vez, com troca suave). 'menu': a da tela inicial,
     medieval e épica (pedal grave, coro, tambores de guerra, cordas, metais e trompas; ~104 s em laço). 'campo': a do começo da campanha,
     calma (acordes longos, caixinha de música, eco; 24 s em laço). false: a música some devagar;
   - motivo(): o motivo do Netzach sozinho (~5 s), a frase que aparece no meio da música do menu, para momentos marcantes;
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

  // ---------- trilhas ----------
  // cada trilha é uma lista de compassos (comp segundos cada) que se repete; o tocador marca os compassos uns segundos antes
  // de tocarem (aos poucos, para não criar milhares de sons de uma vez) e troca de trilha apagando a anterior devagar

  // 'campo': a calma do começo da campanha. 8 compassos de 3 s: o baixo, o acorde (notas MIDI) e a caixinha [segundo, nota]
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
  function compassoCampo(M, i, t) {
    var c = CICLO[i], COMP = 3;
    c.a.forEach(function (m) { pad(M.bus, M.lfo, m, t, COMP, 0.03); });
    var o = ctx.createOscillator(), g = ctx.createGain(); // baixo, bem macio
    o.type = 'sine'; o.frequency.value = hz(c.b);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + COMP + 0.8);
    o.connect(g); g.connect(M.bus); o.start(t); o.stop(t + COMP + 0.9);
    c.m.forEach(function (n) { caixinha(M.bus, n[1], t + n[0] + (Math.random() - 0.5) * 0.03, 0.085); });
  }

  // 'menu': medieval e épica, na linha das trilhas de fantasia (sem copiar nenhuma melodia). O que elas têm em comum e que
  // está aqui: modo menor antigo (Ré eólio) com quintas abertas; pedal grave de tônica que não para; a progressão épica
  // i – ♭VI – ♭III – ♭VII (Rém – Si♭ – Fá – Dó) e a dominante maior (Lá) puxando a volta; o ♭II/♭VI dramático na ponte
  // (Mi♭); coro masculino grave em notas longas e sílabas em bloco, com muita reverberação; tema heroico de saltos de
  // quarta e quinta para cima, notas longas no agudo e descida por graus; ostinato agitado de cordas e tambores de guerra;
  // construção em camadas, com o rufar dos tímpanos crescendo antes das partes fortes.
  // 92 batidas por minuto, 40 compassos de 4 tempos (~104 s):
  // abertura 4 · marcha 8 · tema 8 · motivo 4 · ponte 4 · clímax 8 · final 4.
  // O MOTIVO é a assinatura do Netzach: Ré sobe uma quinta até o Lá, segura, desce por graus (Sol, Fá, Mi) e repousa no
  // Ré. No meio da música ele aparece sozinho (a trompa sobre o pedal e o coro, sem tambores), depois com o coro junto, e
  // volta no final, devagar, no coro. Para usar em outro lugar do jogo: NZ.som.motivo()
  var BAT = 60 / 92;
  var AC = { // o baixo (MIDI) e as notas do coro (vozes graves)
    Dm: [38, [50, 57, 62, 65]], Bb: [34, [50, 58, 62, 65]], F: [41, [48, 53, 57, 60]], C: [36, [48, 55, 60, 64]],
    Gm: [43, [50, 55, 58, 62]], A: [45, [49, 52, 57, 61]], Eb: [39, [51, 55, 58, 63]], D5: [38, [50, 57, 62]]
  };
  var P1 = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Gm', 'Bb', 'A'];
  var FORMA = [].concat(['D5', 'D5', 'D5', 'D5'], P1, P1, ['Dm', 'C', 'Dm', 'A'], ['Gm', 'Eb', 'Bb', 'A'], P1, ['Dm', 'C', 'D5', 'D5']);
  var INI = { marcha: 4, tema: 12, motivo: 20, ponte: 24, climax: 28, final: 36 }; // onde começa cada parte
  function parte(i) { return i < 4 ? 'abertura' : i < 12 ? 'marcha' : i < 20 ? 'tema' : i < 24 ? 'motivo' : i < 28 ? 'ponte' : i < 36 ? 'climax' : 'final'; }
  // o motivo, dois compassos: [tempo, nota MIDI, duração em tempos]
  var MOTIVO = [[[0, 62, 1], [1, 69, 2], [3, 67, 0.5], [3.5, 65, 0.5]], [[0, 64, 1.5], [1.5, 62, 2.5]]];
  // o tema das trompas: [tempo, nota MIDI, duração em tempos], um compasso por linha (sobre P1)
  var TEMA = [
    [[0, 69, 2], [2, 74, 2]], [[0, 77, 3], [3, 76, 1]], [[0, 72, 2], [2, 69, 1], [3, 72, 1]], [[0, 67, 4]],
    [[0, 69, 2], [2, 74, 1], [3, 76, 1]], [[0, 77, 3], [3, 74, 1]], [[0, 74, 2], [2, 77, 2]], [[0, 76, 2], [2, 73, 2]]
  ];
  var TEMA_FIM = [[[0, 77, 2], [2, 79, 2]], [[0, 81, 4]]]; // no clímax, os dois últimos compassos sobem até o Lá agudo
  var ruidoBuf = null;
  function ruidoCurto() {
    if (ruidoBuf) { return ruidoBuf; }
    var n = Math.floor(ctx.sampleRate * 2); ruidoBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = ruidoBuf.getChannelData(0); for (var i = 0; i < n; i++) { d[i] = Math.random() * 2 - 1; }
    return ruidoBuf;
  }
  // taiko (o tambor de guerra das trilhas épicas, não bateria de pop): o couro grande vibra grave e longo, e a pancada é
  // abafada (sem o estalo de bumbo). grande = o taiko de chão (~46 Hz, ressoa 1,8 s); senão, o médio (~70 Hz) do "do-ko"
  function tambor(bus, t, vol, grande) {
    var f0 = grande ? 46 : 70, dura = grande ? 1.8 : 0.95;
    [[1, 1], [1.52, 0.35]].forEach(function (h) { // a fundamental e o modo de cima da pele, que dá o corpo de tambor
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f0 * h[0] * 1.22, t); o.frequency.exponentialRampToValueAtTime(f0 * h[0], t + 0.06); o.frequency.exponentialRampToValueAtTime(f0 * h[0] * 0.9, t + dura);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * h[1], t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dura * (h[0] > 1 ? 0.5 : 1));
      o.connect(g); g.connect(bus); g.connect(reverb); o.start(t); o.stop(t + dura + 0.05);
    });
    var s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), ng = ctx.createGain(); // a pancada da baqueta, bem abafada
    s.buffer = ruidoCurto(); lp.type = 'lowpass'; lp.frequency.value = grande ? 220 : 380;
    ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(vol * 0.45, t + 0.008); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    s.connect(lp); lp.connect(ng); ng.connect(bus); ng.connect(reverb); s.start(t, Math.random(), 0.2);
  }
  function timpano(bus, t, vol) { // tímpano afinado em Ré
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(hz(38) * 1.02, t); o.frequency.exponentialRampToValueAtTime(hz(38), t + 0.15);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(bus); g.connect(reverb); o.start(t); o.stop(t + 1);
  }
  function rufar(bus, t, dur, de, ate) { // rufar de tímpano crescendo, em fusas
    var n = Math.floor(dur / (BAT / 4));
    for (var k = 0; k < n; k++) { timpano(bus, t + k * BAT / 4, de + (ate - de) * k / n); }
  }
  function corda(bus, m, t, dur, vol) { // cordas graves em spiccato: serra abafada, ataque curto
    var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = hz(m);
    f.type = 'lowpass'; f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(450, t + dur); f.Q.value = 1;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
  // o fundo que ressoa: metais graves sustentados (serra bem abafada) e um seno uma oitava abaixo, sentido mais que ouvido
  function metal(bus, m, t, dur, vol) {
    var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), s = ctx.createOscillator(), sg = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = hz(m); f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.5); g.gain.setValueAtTime(vol, t + dur - 0.1); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
    o.connect(f); f.connect(g); g.connect(bus); g.connect(reverb); o.start(t); o.stop(t + dur + 0.6);
    s.type = 'sine'; s.frequency.value = hz(m - 12);
    sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(vol * 2.2, t + 0.4); sg.gain.setValueAtTime(vol * 2.2, t + dur - 0.1); sg.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
    s.connect(sg); sg.connect(bus); s.start(t); s.stop(t + dur + 0.5);
  }
  // coro: um pulso rico (serra) por quatro formantes largos da vogal, mais um pouco do som cru pelos médios (a presença
  // que corta a mistura), com vibrato de voz de verdade (CORO.vib, um pouco diferente em cada cantor) e a nota crescendo
  // enquanto dura, como um lamento que aperta: o "meio desesperado". CORO.vol acerta o volume do coro inteiro
  var CORO = { vol: 2.1, vib: 5.2, fundo: 17, presenca: 0.16, cresce: 1.25 };
  var VOGAIS = {
    a: [[730, 3, 1], [1090, 3.5, 0.85], [2440, 4.5, 0.45], [3300, 5, 0.22]],
    o: [[500, 3, 1], [860, 3.5, 0.75], [2500, 4.5, 0.32], [3300, 5, 0.16]]
  };
  function voz(bus, m, t, dur, vol, lfo, vogal, ataque) {
    vol *= CORO.vol;
    (TOQUE ? [0] : [-11, 11]).forEach(function (cents) {
      var o = ctx.createOscillator(), soma = ctx.createGain(), g = ctx.createGain(), a = Math.min(dur * 0.6, ataque || 0.35);
      var vib = ctx.createOscillator(), vg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = cents; lfo.connect(o.detune);
      vib.frequency.value = CORO.vib * (0.93 + Math.random() * 0.14); vg.gain.value = CORO.fundo; vib.connect(vg); vg.connect(o.detune);
      VOGAIS[vogal || 'a'].forEach(function (F) {
        var bp = ctx.createBiquadFilter(), fg = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = F[0]; bp.Q.value = F[1]; fg.gain.value = F[2];
        o.connect(bp); bp.connect(fg); fg.connect(soma);
      });
      var pr = ctx.createBiquadFilter(), pg = ctx.createGain(); // a presença: o som cru, só dos médios (1 a 3 kHz)
      pr.type = 'bandpass'; pr.frequency.value = 1700; pr.Q.value = 0.7; pg.gain.value = CORO.presenca;
      o.connect(pr); pr.connect(pg); pg.connect(soma);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a);
      g.gain.linearRampToValueAtTime(vol * CORO.cresce, t + Math.max(a + 0.05, dur - 0.12)); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.9);
      soma.connect(g); g.connect(bus); g.connect(reverb);
      o.start(t); o.stop(t + dur + 1); vib.start(t); vib.stop(t + dur + 1);
    });
  }
  // as vozes de um acorde: os baixos e barítonos (c[1]) e, nas partes fortes, tenores uma oitava acima nas duas notas de cima
  function coro(c, alto) { return alto && !TOQUE ? c[1].concat(c[1].slice(-2).map(function (m) { return m + 12; })) : c[1]; }
  function trompa(bus, m, t, dur, vol, oitava) { // metal: serra com o filtro abrindo; a oitava de baixo por baixo, e a de cima se pedir
    [[0, 1], [-12, 0.5]].concat(oitava ? [[12, 0.35]] : []).forEach(function (o8) {
      var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = hz(m + o8[0]);
      f.type = 'lowpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(450, t); f.frequency.linearRampToValueAtTime(2300, t + 0.2); f.frequency.linearRampToValueAtTime(1500, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * o8[1], t + 0.1); g.gain.setValueAtTime(vol * o8[1] * 0.9, t + dur - 0.08); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.35);
      o.connect(f); f.connect(g); g.connect(bus); g.connect(reverb); o.start(t); o.stop(t + dur + 0.4);
    });
  }
  // o conjunto de taikos da marcha, em semicolcheias: [posição de 0 a 15, força, grande]. Sem caixa nos tempos 2 e 4 (que
  // é coisa de pop): as pancadas grandes caem em lugares irregulares e o médio faz o "do-ko" entre elas
  var OSTINATO = [[0, 1, true], [6, 0.55, false], [7, 0.6, false], [8, 0.85, true], [11, 0.5, false], [12, 0.75, true], [14, 0.5, false], [15, 0.6, false]];
  function compassoMenu(M, i, t) {
    var P = parte(i), c = AC[FORMA[i]], bar = 4 * BAT, s16 = BAT / 4, k, n;
    var cheio = P === 'marcha' || P === 'tema' || P === 'climax', forte = P === 'climax' ? 1.25 : P === 'tema' ? 1.1 : 1;
    // fundo: o pedal de Ré na abertura, no motivo e no final; nas outras partes, o baixo do acorde
    metal(M.bus, P === 'abertura' || P === 'final' || P === 'motivo' ? 38 : c[0], t, bar, P === 'climax' ? 0.075 : 0.06);
    if (cheio) { metal(M.bus, c[0] + 7, t, bar, 0.035); } // a quinta por cima: o acorde aberto dos metais
    // tambores
    if (cheio) {
      OSTINATO.forEach(function (d) { tambor(M.bus, t + d[0] * s16, 0.5 * d[1] * forte, d[2]); });
      if (P === 'climax') { timpano(M.bus, t, 0.3); timpano(M.bus, t + 2 * BAT, 0.22); } // os tímpanos em Ré nos tempos fortes
    } else if (P === 'ponte') {
      tambor(M.bus, t, 0.5, true); tambor(M.bus, t + 2 * BAT, 0.4, true);
      if (i === INI.climax - 1) { rufar(M.bus, t + 0.5 * BAT, 3.5 * BAT, 0.05, 0.4); }
    } else if (P === 'motivo') { // sem tambores: só um tímpano macio no primeiro tempo
      timpano(M.bus, t, 0.12);
    } else { // abertura e final: golpes grandes e o rufar crescendo
      tambor(M.bus, t, 0.6, true);
      if (i === 2 || i === INI.final + 2) { rufar(M.bus, t, bar * 2, 0.04, 0.35); }
    }
    // cordas: semicolcheias (colcheias no celular), a fundamental com a oitava e a quinta
    if (cheio || P === 'ponte') {
      var passo = TOQUE || P === 'ponte' ? 2 : 1, figura = [0, 0, 7, 12];
      for (k = 0; k < 16; k += passo) { corda(M.bus, c[0] + 12 + figura[k % 4], t + k * s16, s16 * passo * 0.85, P === 'climax' ? 0.065 : 0.05); }
    }
    // coro: notas longas na abertura e no final (quintas abertas, em "oh"); sílabas em bloco na marcha e na ponte; acordes
    // sustentados sob o tema; no clímax, também o tema em uníssono
    if (P === 'abertura' && i === 0) { [38, 45, 50, 57].forEach(function (m) { voz(M.bus, m, t, 4 * bar, 0.045, M.lfo, 'o', 2 * bar); }); }
    if (P === 'final' && i === INI.final) { coro(c, true).forEach(function (m) { voz(M.bus, m, t, 4 * bar, 0.05, M.lfo, 'o', bar * 0.5); }); }
    if (P === 'motivo') { coro(c, i >= INI.motivo + 2).forEach(function (m) { voz(M.bus, m, t, bar, i < INI.motivo + 2 ? 0.03 : 0.04, M.lfo, 'o', 0.8); }); }
    if (P === 'marcha' || P === 'ponte') {
      [[0, 2, 'a'], [2, 1, 'o'], [3, 1, 'a']].forEach(function (sl) {
        c[1].forEach(function (m) { voz(M.bus, m, t + sl[0] * BAT, sl[1] * BAT * 0.92, P === 'ponte' ? 0.05 : 0.04, M.lfo, sl[2], 0.06); });
      });
    }
    if (P === 'tema' || P === 'climax') { coro(c, true).forEach(function (m) { voz(M.bus, m, t, bar, P === 'climax' ? 0.045 : 0.032, M.lfo, 'a', 0.5); }); }
    // o motivo: sozinho na trompa; na repetição, o coro canta junto uma oitava abaixo; no final, o coro devagar
    if (P === 'motivo') {
      n = i - INI.motivo;
      MOTIVO[n % 2].forEach(function (x) {
        trompa(M.bus, x[1], t + x[0] * BAT, x[2] * BAT * 0.96, n < 2 ? 0.06 : 0.075, false);
        if (n >= 2) { voz(M.bus, x[1] - 12, t + x[0] * BAT, x[2] * BAT * 0.96, 0.055, M.lfo, 'o', 0.1); }
      });
    }
    if (P === 'final' && i < INI.final + 2) {
      MOTIVO[i - INI.final].forEach(function (x) { voz(M.bus, x[1] - 12, t + x[0] * BAT, x[2] * BAT * 1.1, 0.05, M.lfo, 'o', 0.3); });
    }
    // o tema
    if (P === 'tema' || P === 'climax') {
      n = i - (P === 'tema' ? INI.tema : INI.climax);
      var frase = P === 'climax' && n >= 6 ? TEMA_FIM[n - 6] : TEMA[n];
      frase.forEach(function (x) {
        trompa(M.bus, x[1], t + x[0] * BAT, x[2] * BAT * 0.96, P === 'climax' ? 0.08 : 0.07, P === 'climax');
        if (P === 'climax') { voz(M.bus, x[1] - 12, t + x[0] * BAT, x[2] * BAT * 0.96, 0.05, M.lfo, 'a', 0.08); }
      });
    }
  }

  // o motivo do Netzach sozinho (um momento marcante do jogo): a trompa sobre um acorde do coro e o pedal grave, ~5 s.
  // Toca no volume da música, por cima do que estiver tocando
  function motivo() {
    if (!pronto()) { return; }
    var t = ctx.currentTime + 0.1, bus = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), bar = 4 * BAT;
    bus.gain.value = 1.2 * USER.musica; bus.connect(mestre);
    lfo.frequency.value = 0.23; lg.gain.value = 7; lfo.connect(lg); lfo.start(t); lfo.stop(t + 2 * bar + 2);
    metal(bus, 38, t, 2 * bar, 0.05);
    [[50, 57, 62], [48, 55, 64]].forEach(function (ac, k) { ac.forEach(function (m) { voz(bus, m, t + k * bar, bar, 0.035, lg, 'o', 0.6); }); });
    timpano(bus, t, 0.15);
    MOTIVO.forEach(function (c, k) { c.forEach(function (x) { trompa(bus, x[1], t + k * bar + x[0] * BAT, x[2] * BAT * 0.96, 0.07, false); }); });
    setTimeout(function () { try { bus.disconnect(); } catch (e) { /* já foi */ } }, (2 * bar + 3) * 1000);
  }
  var TRILHAS = {
    menu: { comp: 4 * BAT, n: FORMA.length, compasso: compassoMenu, vol: 1.3, abafa: 9000, oscila: 7 },
    campo: { comp: 3, n: CICLO.length, compasso: compassoCampo, vol: 1.1, abafa: 3200, oscila: 9 }
  };
  var querMusica = null, musica = null; // musica: { nome, bus, lfo, osc, ate, i, timer }
  function tocaMusica() {
    if (!querMusica || (musica && musica.nome === querMusica) || !pronto()) { return; }
    if (musica) { paraMusica(1.6); }
    var T = TRILHAS[querMusica], bus = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = T.abafa; // a do campo, abafada como lembrança; a do menu, mais aberta
    bus.connect(lp); lp.connect(mestre); lp.connect(reverb);
    bus.gain.setValueAtTime(0.0001, ctx.currentTime); bus.gain.linearRampToValueAtTime(Math.max(0.0001, T.vol * USER.musica), ctx.currentTime + 2.5);
    lfo.frequency.value = 0.23; lg.gain.value = T.oscila; lfo.connect(lg); lfo.start(); // a afinação oscila de leve (vibrato do coro, "fita velha" do campo)
    var M = musica = { nome: querMusica, T: T, bus: bus, lfo: lg, osc: lfo, ate: ctx.currentTime + 0.15, i: 0 };
    function adiante() { // marca os compassos dos próximos 4 s, um por um
      if (musica !== M) { return; }
      while (M.ate < ctx.currentTime + 4) { T.compasso(M, M.i, M.ate); M.ate += T.comp; M.i = (M.i + 1) % T.n; }
    }
    adiante(); M.timer = setInterval(adiante, 500);
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
    musica: function (nome, seg) { // 'menu', 'campo' (true = 'menu'), ou false para apagar devagar (seg segundos)
      querMusica = nome === true ? 'menu' : (nome && TRILHAS[nome] ? nome : null);
      if (querMusica) { tocaMusica(); } else if (ctx) { paraMusica(seg || 2.5); }
    },
    trilha: function () { return musica ? musica.nome : null; }, // para testes
    criancas: criancas, missao: missao, foco: foco, clique: clique, campo: campo, motivo: motivo,
    volume: function (k, v) {
      if (!(k in USER)) { return 0; }
      if (v === undefined) { return USER[k]; }
      USER[k] = Math.max(0, Math.min(1, +v || 0)); try { localStorage.setItem(KEY_VOL, JSON.stringify(USER)); } catch (e) { /* vale até fechar */ }
      if (ctx) {
        var t = ctx.currentTime, g = k === 'musica' ? (musica && musica.bus.gain) : sfx.gain, alvo = k === 'musica' ? (musica ? musica.T.vol : 1) * USER.musica : VOL.sfx * USER.efeitos;
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
