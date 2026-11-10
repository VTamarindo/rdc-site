/* Netzach · interface, entrada, laço de tempo e save (protótipo da vila) */
(function (NZ) {
  'use strict';
  // TODA publicação troca VERSION aqui e o ?v= no index.html: o Cloudflare guarda js e css por 4 h no navegador,
  // e com o mesmo ?v= o HTML novo roda com o código velho. SAVE_VER só muda quando o jogo deve recomeçar do zero.
  var VERSION = '20261110-11', SAVE_VER = '20261105-3';
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
  var G, V, world, sim, st, view, camp = null, campDados = null; // camp: o modo história (js/campanha.js)
  // a hora fixa do céu na campanha e na tela inicial (game.json → campanha.hora); no modo livre o céu segue o relógio
  function horaFixa() { var d = new Date(clockNow()); d.setHours(0, 0, 0, 0); return d.getTime() + G.campanha.hora * 3600000; }
  function campanha() { return !!(st && st.modo === 'campanha'); }
  // campanha antes do mundo aberto (até o fazendeiro dizer "me encontre perto do pasto"): a macro ainda não existe.
  // Some da tela (body.sem-macro esconde o que tem a classe macro-ui), do mapa e dos atalhos; volta sozinha no fim do capítulo
  function semMacro() { return campanha() && !camp.fim(); }
  var DT, CAP, THRESH;
  var lastReal = clockNow(), acc = 0, prev = null, away = null;
  var keys = {}, pad = {}, lookHold = 0, drag = null, hoverRef = null, ctrl = null;
  var newVersion = false;
  var dailyNext = 0; // quando as missões diárias reiniciam (ms do relógio real)
  var LINE_MS = 10000, lineTxt = null, lineEnd = 0, hintSeen = false;
  var openWin = null, npcOpen = null, toastT = 0, baseTitle = document.title;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var isTouch = ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches);

  // ---------- uma aba só ----------
  // Ao abrir, a aba avisa as outras ('nova'). Cada aba antiga responde 'fechando' na hora, salva, sobe o save para a nuvem
  // (até 5 s), para o jogo e manda 'passa' com o espaço que estava aberto: a aba nova abre direto nele, sem a tela inicial.
  // Mesmo navegador só (BroadcastChannel): o save passa pelo localStorage, que as abas dividem. Sem o canal, nada muda.
  var aba = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), canal: null, fechada: false, espera: false, entrega: null, pronto: false };
  try { aba.canal = new BroadcastChannel('netzach-aba'); } catch (e) { /* navegador antigo: as abas não se falam */ }
  function abaManda(m) { try { aba.canal.postMessage(m); } catch (e) { /* canal fechado */ } }
  if (aba.canal) {
    aba.canal.onmessage = function (e) {
      var m = e.data || {};
      if (m.tipo === 'nova' && m.id !== aba.id) { if (!aba.fechada) { passaAdiante(m.id); } return; }
      if (m.para !== aba.id) { return; }
      if (m.tipo === 'fechando') { aba.espera = true; }
      else if (m.tipo === 'passa') { aba.espera = false; if (!aba.entrega || !aba.entrega.slot) { aba.entrega = m; } if (aba.pronto) { usaEntrega(); } }
    };
    abaManda({ tipo: 'nova', id: aba.id });
  }

  // ---------- carregar ----------
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(function () { /* sem ele, o jogo só não abre sem internet */ }); }
  function getJSON(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) { throw new Error(u); } return r.json(); }); }
  // data/campanha.json: as cenas do roteirizador (tools/montar_campanha.ps1). Sem ele, só o modo livre
  var campanhaJSON = getJSON('data/campanha.json?v=' + VERSION).catch(function () { return null; });
  Promise.all([getJSON('data/game.json?v=' + VERSION), getJSON('data/vila.json?v=' + VERSION), NZ.loadArt('art/', VERSION), campanhaJSON, clockSync()]).then(function (d) { start(d[0], d[1], d[2], d[3]); })
    .catch(function (e) { $('loading').textContent = 'Não foi possível carregar os dados (' + e.message + '). Abra por um servidor, não direto do arquivo.'; });

  function start(game, vila, art, campanha) {
    G = game; V = vila; campDados = campanha;
    DT = G.settings.tickSec; CAP = G.settings.offlineCapHours * 3600; THRESH = G.settings.returnThresholdSec;
    world = new NZ.World(G, V); sim = new NZ.Sim(world);
    slotsMigrate();

    view = new NZ.View($('view'), world, art);
    // atrás da tela inicial: o céu visto de dentro do trigo, deitado, como no começo da campanha; não é de nenhum save
    vitrine = NZ.newState(world, 1);
    vitrine.player.x = G.campanha.inicio.x; vitrine.player.z = G.campanha.inicio.z;
    camp = NZ.campanha({
      G: G, world: world, view: view, sim: sim, dados: campDados,
      save: function () { save(); }, toast: function (t, s) { toast(t, s); }, quests: function () { renderQuests(); },
      eventos: function () { handleEvents(); hudT = 0; },
      janela: cenaJanela, janelaAberta: function () { return openWin; },
      guardado: function () { return performance.now() < guardUntil; },
      entrada: function () { return ctrl && ctrl.active() ? 'controle' : isTouch ? 'toque' : 'teclado'; }
    });
    $('loading').hidden = true; $('ver').textContent = VERSION;
    if (isTouch) { document.body.classList.add('touch'); $('pad').hidden = false; $('menu-ctrl').hidden = false; ctrlSet(ctrlLoad()); }
    if (/romancedecavalaria|localhost|127\.0\.0\.1/.test(location.hostname)) { $('back-site').hidden = false; }
    bindInput(); bindTitle(); bindConta(); ctrl = NZ.controle(ctrlApi()); resize(); window.addEventListener('resize', resize);
    setInterval(clockSync, 600000); // o relógio interno pode parar com o computador suspenso
    if (isTouch) { ['touchend', 'click'].forEach(function (ev) { window.addEventListener(ev, celularCheio, true); }); }
    fullUi(); document.addEventListener('fullscreenchange', fullUi); document.addEventListener('webkitfullscreenchange', fullUi);
    NZ.debug = { state: function () { return st; }, view: function () { return view; }, sim: sim, interact: function (ref) { interact(ref); }, clockNow: clockNow, clockShift: function (ms) { clockShift += ms; }, slot: function () { return slot; },
      copias: function () { var o = {}; for (var i = 1; i <= SLOTS; i++) { try { var c = JSON.parse(localStorage.getItem(slotKey(i) + '-copia')); if (c) { o[i] = c; } } catch (e) { /* nada */ } } return o; },
      nuvem: function () { return st ? sobe() : nuvem(); } }; // para testes

    $('aba-volta').addEventListener('click', function () { location.reload(); }); // recarregar = abrir de novo: a outra aba passa o jogo para cá
    inicioComVez();
    setInterval(function () { if (!document.hidden) { vezPulso(); } }, vez.PULSO);

    // na tela inicial não há jogo rodando: nada a salvar nem tempo fora a contar (cada save conta o seu ao ser aberto)
    document.addEventListener('visibilitychange', function () {
      if (!st || aba.fechada) { return; }
      if (document.hidden) { beginAway(clockNow()); save(); sobe(true); }
      // voltar à aba: primeiro confere se outro aparelho pegou o jogo enquanto esta estava escondida; senão, segue e sobe
      else { vezPulso(function (perdeu) { if (perdeu || !st || aba.fechada) { return; } if (away) { endAway(clockNow()); } document.title = baseTitle; clockSync(); save(); sobe(); }); }
    });
    window.addEventListener('pagehide', function () {
      if (aba.fechada) { return; }
      save(); sobe(true);
      if (vez.minha && vezPronta()) { Conta.sessao.libera(GAME, aba.id, slot, true).catch(function () { /* nada */ }); } // saiu: o próximo não espera
    });
    setInterval(function () {
      if (!st || aba.fechada) { return; }
      if (away) { catchUp(clockNow()); }
      save();
      if ((nuvemT += 5) >= NUVEM_SEG) { sobe(); }
    }, 5000);
    requestAnimationFrame(frame);
  }

  // ---------- save: SLOTS espaços, cada um na sua chave (saveKey-1, -2, -3), no mesmo formato do save único de antes ----------
  // Com conta (js/conta.js), cada conta tem as suas chaves (saveKey-u<id>-1...) e elas espelham a nuvem; sem conta, saveKey-1...
  // O save leva savedAt (quando foi gravado) e cloud (o savedAt que a nuvem tinha da última vez que os dois bateram):
  // savedAt diferente de cloud = mudou aqui e falta subir. Espaço apagado com conta vira { del: true } para o apagar chegar à nuvem.
  var SLOTS = 3, slot = 0, vitrine = null, GAME = 'netzach';
  var slotDono = '', slotCloud = null, ultimo = null; // de quem é o save aberto, o que a nuvem tem dele, e o último save gravado ({ t, json })
  function dono() { var u = window.Conta && Conta.usuario(); return u ? u.id : ''; }
  function slotKey(n, uid) { if (uid === undefined) { uid = dono(); } return G.settings.saveKey + (uid ? '-u' + uid : '') + '-' + n; }
  function ler(n, uid) { try { return JSON.parse(localStorage.getItem(slotKey(n, uid))); } catch (e) { return null; } }
  function grava(n, uid, env) { try { localStorage.setItem(slotKey(n, uid), typeof env === 'string' ? env : JSON.stringify(env)); return true; } catch (e) { return false; } }
  function carimbo(env) { return env ? Math.round(env.savedAt || env.lastReal || 0) : 0; }
  // o save que perde uma troca (nuvem × aparelho) não some: fica numa cópia por espaço (NZ.debug.copias() mostra)
  function copia(n, uid, env) { if (env && env.state) { try { localStorage.setItem(slotKey(n, uid) + '-copia', JSON.stringify(env)); } catch (e) { /* sem espaço: segue */ } } }
  function apagaSlot(n) {
    var uid = dono();
    try {
      if (!uid) { localStorage.removeItem(slotKey(n, '')); return; }
      var velho = ler(n, uid);
      grava(n, uid, { v: 1, del: true, savedAt: Math.round(clockNow()), cloud: velho ? velho.cloud : undefined });
    } catch (e) { /* nada */ }
  }
  // o save único de antes (saveKey sem número) vira o espaço 1. A chave velha só sai depois de a cópia estar gravada e lida de volta
  function slotsMigrate() {
    try {
      var old = localStorage.getItem(G.settings.saveKey);
      if (old === null) { return; }
      if (localStorage.getItem(slotKey(1)) === null) {
        localStorage.setItem(slotKey(1), old);
        if (localStorage.getItem(slotKey(1)) !== old) { return; }
      } else if (localStorage.getItem(slotKey(1)) !== old) { return; } // espaço 1 já ocupado por outro: a chave velha fica, intocada
      localStorage.removeItem(G.settings.saveKey);
    } catch (e) { /* sem armazenamento: nada a migrar */ }
  }
  // save enxuto (uns 6 KB em vez de 17): recursos no estado de sempre (vivos, sem espera) não são gravados, pois NZ.settle
  // os recria vivos ao abrir; números quebrados ficam com 3 casas. Só muda o texto gravado, não o jogo rodando
  function enxuto(k, v) {
    if (k === 'nodes' && this && this.player && v && typeof v === 'object') {
      var o = {};
      for (var id in v) { var n = v[id]; if (!(n && n.alive === true && !n.left && Object.keys(n).length === 2)) { o[id] = n; } }
      return o;
    }
    return typeof v === 'number' && v % 1 !== 0 && isFinite(v) ? Math.round(v * 1000) / 1000 : v;
  }
  function save() {
    if (!st || !slot) { return; }
    var t = Math.round(clockNow());
    var json = JSON.stringify({ v: 1, ver: SAVE_VER, lastReal: lastReal, savedAt: t, cloud: slotCloud === null ? undefined : slotCloud, state: st }, enxuto);
    ultimo = { t: t, json: json };
    grava(slot, slotDono, json); // sem armazenamento: segue sem salvar
  }
  function load(n) {
    var s = ler(n);
    if (!(s && s.v === 1 && s.state && s.state.player)) { return null; }
    // protótipo: SAVE_VER novo = jogo recomeça do zero (sem precisar limpar o cache); com conta, o apagar vai também para a nuvem
    if (G.settings.resetSaveOnNewVersion && s.ver !== SAVE_VER) { apagaSlot(n); newVersion = true; return null; }
    return s;
  }

  // ---------- nuvem (só com conta) ----------
  // Na tela inicial, nuvem() acerta os 3 espaços: o lado que mudou desde a última troca vence; se os dois mudaram, vence o
  // gravado por último, e o outro fica na cópia. Jogando, sobe() manda o save aberto a cada minuto, ao esconder a aba e ao sair;
  // se outro aparelho gravou esse espaço nesse meio tempo, o jogo abre a versão de lá (a daqui fica na cópia).
  var nuvemSt = '', sincronizando = null, subindo = false, NUVEM_SEG = 60, nuvemT = 0;
  function nuvemPronta() { return !!(window.Conta && Conta.online() && dono()); }
  // a nuvem guarda o save como texto: o JSON do save vai entre aspas dentro do corpo
  function corpo(t, json) { return '{"saved_at":' + t + ',"data":' + (json ? JSON.stringify(json) : 'null') + '}'; }
  // os saves feitos sem conta neste navegador passam para a conta ao entrar: num espaço livre dela, se houver
  function juntaVisitante(uid) {
    for (var n = 1; n <= SLOTS; n++) {
      var g = ler(n, ''); if (!(g && g.state)) { continue; }
      var alvo = 0;
      for (var m = n, k = 0; k < SLOTS; k++, m = m % SLOTS + 1) { var u = ler(m, uid); if (!(u && u.state)) { alvo = m; break; } }
      if (alvo) { var livre = ler(alvo, uid); g.cloud = livre ? livre.cloud : undefined; g.savedAt = Math.max(carimbo(g), livre ? (livre.savedAt || 0) + 1 : 0); grava(alvo, uid, g); }
      else {
        var u2 = ler(n, uid);
        if (carimbo(g) > carimbo(u2)) { copia(n, uid, u2); g.cloud = u2.cloud; grava(n, uid, g); } else { copia(n, uid, g); }
      }
      try { localStorage.removeItem(slotKey(n, '')); } catch (e) { /* nada */ }
    }
  }
  function nuvem() {
    var uid = dono();
    if (!uid) { nuvemSt = ''; return Promise.resolve(); }
    juntaVisitante(uid);
    if (!nuvemPronta()) { nuvemSt = 'off'; return Promise.resolve(); }
    if (sincronizando) { return sincronizando; }
    nuvemSt = 'indo'; nuvemTexto();
    var mudou = false;
    sincronizando = Conta.saves.listar(GAME).then(function (rows) {
      if (dono() !== uid || st) { return; } // trocou de conta ou abriu um jogo enquanto isso: a próxima vez acerta
      var R = {}, sobes = [];
      rows.forEach(function (r) { R[r.slot] = r; });
      for (var n = 1; n <= SLOTS; n++) {
        var L = ler(n, uid), r = R[n], rs = r ? +r.saved_at : null, lt = carimbo(L);
        var puxa = false, manda = false;
        if (!L) { puxa = !!r; }
        else if (!r) { manda = true; }
        else if (lt === rs) { if (L.cloud !== rs) { L.cloud = rs; grava(n, uid, L); } }
        else if (L.cloud === rs) { manda = true; }                   // só mudou aqui
        else if (lt === L.cloud || L.cloud === undefined && !L.state) { puxa = true; } // só mudou lá
        else if (lt > rs) { manda = true; if (r.data && r.data.state) { copia(n, uid, r.data); } } // os dois: vence o mais recente
        else { puxa = true; copia(n, uid, L); }
        if (puxa) {
          var d = r.data;
          if (d && d.state && G.settings.resetSaveOnNewVersion && d.ver !== SAVE_VER) { // save de antes do recomeço: apaga lá também
            newVersion = true; L = { v: 1, del: true, savedAt: Math.round(clockNow()), cloud: rs }; grava(n, uid, L); manda = true;
          } else {
            d = d && d.state ? d : { v: 1, del: true }; d.savedAt = rs; d.cloud = rs; grava(n, uid, d); mudou = true;
          }
        }
        if (manda) { sobes.push(n); }
      }
      return Promise.all(sobes.map(function (n) {
        var L = ler(n, uid), r = R[n];
        return Conta.saves.gravar(GAME, n, r ? +r.saved_at : null, corpo(carimbo(L), L.state ? JSON.stringify(L, enxuto) : null)).then(function (res) {
          if (res === 'ok' && dono() === uid) { var L2 = ler(n, uid); if (L2 && carimbo(L2) === carimbo(L)) { L2.cloud = carimbo(L); grava(n, uid, L2); } }
        });
      }));
    }).then(function () { nuvemSt = 'ok'; }, function () { nuvemSt = 'off'; }).then(function () {
      sincronizando = null;
      if (titleOn && !titleNew && !titleDel && !(contaUi && contaUi.aberto())) { if (mudou || newVersion) { showTitle(); } else { nuvemTexto(); } }
    });
    return sincronizando;
  }
  function nuvemTexto() {
    var el = $('t-nuvem'); if (!el) { return; }
    var u = window.Conta && Conta.usuario(), t = '';
    if (u) {
      t = nuvemSt === 'indo' ? 'Sincronizando com a nuvem…' : nuvemSt === 'off' ? 'Sem conexão com a nuvem: os saves ficam aqui e sobem quando ela voltar.' : 'Saves guardados na nuvem: aparecem em qualquer navegador em que você entrar.';
    }
    el.textContent = t; el.hidden = !t || (titleOn && $('t-list').hidden); // fora da lista de saves (jogo novo, apagar, configurações) fica escondido
    var onde = $('save-onde'); if (onde) { onde.textContent = u ? 'neste navegador e na sua conta' : 'neste navegador'; }
  }
  // sobe o save aberto, se mudou. fechando: a aba está indo embora (uma tacada só, sem esperar resposta).
  // Devolve a promessa do envio (a que já estava indo, se houver), ou nada quando não há o que subir.
  var subida = null;
  function sobe(fechando) {
    if (subindo) { return subida; }
    if (!st || !slot || !ultimo || !slotDono || slotDono !== dono() || !(window.Conta && Conta.online())) { return; }
    if (ultimo.t === slotCloud) { return; }
    var u = ultimo, n = slot, quem = slotDono;
    subindo = true; nuvemT = 0;
    subida = Conta.saves.gravar(GAME, n, slotCloud, corpo(u.t, u.json), fechando).then(function (res) {
      subindo = false;
      if (!st || slot !== n || slotDono !== quem) { return; }
      if (res === 'ok') { slotCloud = u.t; nuvemSt = 'ok'; return; }
      if (aba.fechada) { return; } // esta aba está passando o jogo adiante: a aba nova resolve a briga com a nuvem
      return outroAparelho(n, quem);
    }).catch(function () { subindo = false; nuvemSt = 'off'; });
    return subida;
  }

  // ---------- uma aba só: passar o jogo para a aba nova ----------
  function passaAdiante(para) {
    aba.fechada = true;
    abaManda({ tipo: 'fechando', para: para });
    if (!G || !st || !slot) { fechaAba(); abaManda({ tipo: 'passa', para: para, slot: 0 }); return; }
    var n = slot, quem = slotDono;
    save();
    var limite = new Promise(function (ok) { setTimeout(ok, 5000); });
    Promise.race([Promise.resolve(sobe()), limite]).catch(function () { /* sem nuvem: o save local basta */ }).then(function () {
      if (st && slot === n) { save(); } // grava de novo com o carimbo da nuvem já atualizado, para a aba nova não ver briga
      fechaAba();
      abaManda({ tipo: 'passa', para: para, slot: n, dono: quem });
    });
  }
  // para o jogo desta aba e mostra o aviso (o navegador só deixa fechar sozinha a aba que um script abriu)
  function fechaAba(motivo) {
    aba.fechada = true;
    $('aba-txt').textContent = motivo === 'aparelho' ? 'O jogo foi aberto em outro aparelho. Para não rodarem dois ao mesmo tempo, este parou: o progresso foi salvo e seguiu para lá.'
      : 'O jogo foi aberto em outra aba. Para não rodarem dois ao mesmo tempo, esta parou: o progresso foi salvo e seguiu para a aba nova.';
    if (!G) { return; } // ainda carregando: start() vê aba.fechada e mostra o aviso
    if (st) { hide(true); closeAllMarks(); camp.abre(null); }
    if (NZ.som) { NZ.som.musica(false); }
    st = null; slot = 0; slotDono = ''; ultimo = null; away = null; titleOn = false; openWin = null;
    $('hud').hidden = true; $('w-title').hidden = true; $('loading').hidden = true; $('w-aba').hidden = false;
    document.title = baseTitle;
    try { window.close(); } catch (e) { /* não deixou: fica o aviso */ }
  }
  // ---------- um aparelho por vez (com conta: js/conta.js → sessao, tabela do supabase/sessoes.sql) ----------
  // Ao abrir, esta aba pede a vez. Se outro aparelho estava com o jogo aberto (e deu sinal de vida há pouco), a tela espera:
  // lá, o pulso (a cada 5 s) vê que perdeu a vez, salva, sobe o save, libera dizendo qual espaço estava aberto e fecha.
  // Aqui, liberado, o jogo puxa a nuvem e abre direto nesse espaço. Vale sempre o último que abriu. Abas do mesmo navegador
  // continuam se acertando pelo canal acima. Sem a tabela no Supabase ou sem rede, tudo segue como antes
  var NAV_KEY = 'netzach-navegador', navId = '';
  try { navId = localStorage.getItem(NAV_KEY) || ''; if (!navId) { navId = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(NAV_KEY, navId); } } catch (e) { navId = aba.id; }
  var vez = { minha: false, pedindo: false, uid: '', PULSO: 5000, ESPERA: 15000, FRESCO: 25 };
  function vezPronta() { return !!(window.Conta && Conta.sessao && Conta.online() && dono()); }
  function vezPede(cb) {
    if (!vezPronta()) { cb(0); return; }
    var uid = dono(), t0 = Date.now(); vez.pedindo = true;
    function fim(s) { vez.pedindo = false; cb(s); }
    Conta.sessao.pede(GAME, aba.id, navId).then(function (ant) {
      vez.minha = true; vez.uid = uid;
      if (!(ant && ant.aba !== aba.id && ant.navegador !== navId && !ant.liberado && ant.idade < vez.FRESCO)) { fim(0); return; }
      $('loading').textContent = 'Fechando o jogo no outro aparelho…'; $('loading').hidden = false;
      (function confere() {
        Conta.sessao.pulso(GAME, aba.id).then(function (r) {
          if (r && r.aba === aba.id && r.liberado) { fim(r.slot || 0); return; }
          if (!r || r.aba !== aba.id || Date.now() - t0 > vez.ESPERA) { fim(0); return; } // sumiu, outro pediu depois, ou não respondeu
          setTimeout(confere, 1000);
        }, function () { fim(0); });
      })();
    }, function () { fim(0); });
  }
  // ao carregar: pede a vez (se tem conta) e depois abre como sempre; se o outro aparelho estava num save, abre nele
  function inicioComVez() {
    if (!(window.Conta && Conta.sessao && dono())) { abreInicio(); return; }
    Promise.race([Conta.pronto, new Promise(function (ok) { setTimeout(ok, 4000); })]).then(function () {
      vezPede(function (s) {
        if (!s || aba.entrega || aba.espera || aba.fechada) { abreInicio(); return; }
        aba.pronto = true;
        $('loading').textContent = 'Abrindo o jogo que estava no outro aparelho…'; $('loading').hidden = false;
        nuvem().then(function () {
          $('loading').hidden = true;
          if (st || aba.fechada) { return; }
          if (load(s)) { play(s); toast('O jogo veio do outro aparelho.', 4); } else { showTitle(); }
        });
      });
    });
  }
  // sinal de vida; outra aba (de outro navegador) com a vez = este aparelho fecha
  function vezPulso(cb) {
    if (!vez.minha || vez.pedindo || aba.fechada || !vezPronta() || dono() !== vez.uid) { if (cb) { cb(false); } return; }
    Conta.sessao.pulso(GAME, aba.id).then(function (r) {
      var perdeu = !!(r && r.aba !== aba.id && !aba.fechada && !(r.navegador === navId && aba.canal));
      if (perdeu) { perdeVez(r.aba, !!cb); }
      if (cb) { cb(perdeu); }
    }, function () { if (cb) { cb(false); } });
  }
  // passa o jogo para o outro aparelho: salva, sobe (até 5 s), libera e fecha. semSubir: esta aba ficou parada escondida
  // e o outro já pode ter jogado; subir agora atropelaria o save de lá
  function perdeVez(para, semSubir) {
    vez.minha = false; aba.fechada = true;
    var n = st ? slot : 0;
    function libera() { Conta.sessao.libera(GAME, para, n).catch(function () { /* o outro desiste de esperar sozinho */ }); fechaAba('aparelho'); }
    if (!st || !slot || semSubir) { if (st) { save(); } libera(); return; }
    save();
    Promise.race([Promise.resolve(sobe()), new Promise(function (ok) { setTimeout(ok, 5000); })]).catch(function () { /* sem nuvem */ }).then(function () {
      if (st && slot === n) { save(); }
      libera();
    });
  }

  // depois de carregar: abre o save que veio da outra aba, espera por ele um pouco, ou mostra a tela inicial
  function abreInicio() {
    aba.pronto = true;
    if (aba.fechada) { fechaAba(); return; }
    if (aba.entrega) { usaEntrega(); return; }
    if (aba.espera) {
      $('loading').textContent = 'Trazendo o jogo da outra aba…'; $('loading').hidden = false;
      setTimeout(function () { if (!st && !titleOn && !aba.fechada) { $('loading').hidden = true; showTitle(); } }, 6000);
      return;
    }
    showTitle();
  }
  function usaEntrega() {
    var m = aba.entrega; aba.entrega = null;
    if (!m || st || aba.fechada || titleNew || titleDel) { return; }
    $('loading').hidden = true;
    if (m.slot && m.dono === dono() && load(m.slot)) { play(m.slot); toast('O jogo veio da outra aba.', 3); return; }
    if (!titleOn) { showTitle(); }
  }
  // outro aparelho gravou este espaço enquanto ele estava aberto aqui: vale o de lá (se lá foi apagado, este continua e recria)
  function outroAparelho(n, quem) {
    return Conta.saves.listar(GAME).then(function (rows) {
      if (!st || slot !== n || slotDono !== quem) { return; }
      var r = rows.filter(function (x) { return x.slot === n; })[0];
      if (!r) { slotCloud = null; return; }
      if (!(r.data && r.data.state)) { slotCloud = +r.saved_at; return; }
      save(); copia(n, quem, JSON.parse(ultimo.json));
      var d = r.data; d.savedAt = +r.saved_at; d.cloud = d.savedAt; grava(n, quem, d);
      st = null; slot = 0; play(n);
      toast('Este save foi jogado em outro aparelho: abrindo a versão mais nova.', 5);
    });
  }
  // abre um save (ou começa um novo, com nome) no espaço n; o tempo fora de cada save conta desde a última vez que ele rodou
  // modo (só no jogo novo): 'campanha' ou 'livre'
  function play(n, name, modo) {
    var saved = name ? null : load(n);
    if (!name && !saved) { showTitle(); return; }
    var env = ler(n);
    slot = n; slotDono = dono(); slotCloud = env && env.cloud !== undefined ? env.cloud : null; ultimo = null; nuvemT = 0;
    away = null; acc = 0; prev = null; dailyNext = 0; keys = {}; pad = {}; lineTxt = null;
    if (saved) { st = NZ.settle(world, NZ.migrate(saved.state)); lastReal = saved.lastReal || clockNow(); }
    else {
      st = NZ.newState(world, (Date.now() % 2147483647) | 0); st.player.name = name; lastReal = clockNow();
      st.modo = 'livre';
      if (modo === 'campanha' && camp.tem()) { camp.novo(st); }
    }
    if (!st.modo) { st.modo = 'livre'; } // save de antes da campanha
    titleOn = false; hide(true); $('w-title').hidden = true; $('hud').hidden = false;
    if (NZ.som) { NZ.som.musica(false); } // a música some devagar ao entrar no jogo
    view.yaw = st.player.yaw; view.pitch = 0; sim.events = [];
    camp.abre(st, !!saved);
    renderLog(); renderQuests(); hudT = 0;
    if (saved) { beginAway(lastReal); endAway(clockNow()); } else if (!campanha()) { toast('Bem-vindo à vila, ' + name + '.', 3); }
    save();
  }
  function toTitle() {
    save(); sobe(); hide(true); closeAllMarks();
    st = null; camp.abre(null); slot = 0; slotDono = ''; ultimo = null; away = null; document.title = baseTitle;
    showTitle();
  }
  function closeAllMarks() { $('marks').innerHTML = ''; markEls = {}; $('hover').hidden = true; $('toast').hidden = true; }

  // ---------- tela inicial ----------
  var titleOn = false, titleDel = 0, titleNew = 0, titleCfg = false;
  // a conta, o aviso da nuvem e o botão de configurações só aparecem na primeira parte da tela inicial (a lista de saves)
  function titleRodape(naLista) { $('t-conta').hidden = !naLista; $('t-cfg-abre').hidden = !naLista; if (!naLista) { $('t-nuvem').hidden = true; } else { nuvemTexto(); } }
  function slotInfo(n) {
    var s = load(n); if (!s) { return { n: n }; }
    var c = s.state.modo === 'campanha' && s.state.camp;
    return { n: n, name: s.state.player.name || 'Sem nome', lv: s.state.player.lv || 1, when: s.lastReal || 0, modo: c ? (c.fim ? 'Campanha · fim do capítulo 1' : 'Campanha · capítulo 1') : 'Modo livre' };
  }
  function ago(ms) {
    var s = (clockNow() - ms) / 1000;
    if (!ms) { return ''; }
    if (s < 60) { return 'agora há pouco'; }
    if (s < 3600) { return 'há ' + Math.floor(s / 60) + ' min'; }
    if (s < 86400) { return 'há ' + Math.floor(s / 3600) + ' h'; }
    var d = new Date(ms); return 'em ' + d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function showTitle() {
    titleOn = false; hide(true); titleOn = true; openWin = 'w-title'; titleDel = titleNew = 0; titleCfg = false;
    if (NZ.som) { NZ.som.musica(true); } // a trilha da tela inicial (js/som.js); começa no primeiro clique ou tecla
    $('hud').hidden = true; $('w-title').hidden = false; guardClicks();
    $('t-list').hidden = false; $('new-form').hidden = true; $('t-del').hidden = true; $('t-cfg').hidden = true; titleRodape(true);
    var all = [], last = null;
    for (var i = 1; i <= SLOTS; i++) { all.push(slotInfo(i)); }
    $('t-slots').innerHTML = all.map(function (s) {
      if (!s.name) { return '<li><button type="button" class="t-slot vazio" data-t-new="' + s.n + '"><b>Espaço ' + s.n + ' · vazio</b><small>Começar um jogo novo aqui</small></button><i class="t-vaga"></i></li>'; } // a vaga alinha as linhas: no controle, direita vai ao Apagar, não à linha de baixo
      if (!last || s.when > last.when) { last = s; }
      return '<li><button type="button" class="t-slot" data-t-play="' + s.n + '"><b>' + esc(s.name) + '</b><span>' + s.modo + ' · nível ' + s.lv + ' · espaço ' + s.n + '</span><small>Jogado ' + ago(s.when) + '</small></button>' +
        '<button type="button" class="t-apaga" data-t-del="' + s.n + '" aria-label="Apagar o save de ' + esc(s.name) + '" title="Apagar">Apagar</button></li>';
    }).join('');
    var free = all.filter(function (s) { return !s.name; })[0];
    $('t-cont').hidden = !last;
    if (last) { $('t-cont').dataset.n = last.n; $('t-cont').textContent = 'Continuar · ' + last.name + ', nível ' + last.lv; }
    $('t-new').disabled = !free;
    var msg = !free ? 'Os ' + SLOTS + ' espaços estão ocupados: apague um save para começar outro jogo.' : '';
    if (newVersion) { msg = 'Versão nova do protótipo (' + VERSION + '): os saves antigos recomeçaram do zero.' + (msg ? ' ' + msg : ''); }
    $('t-msg').textContent = msg; $('t-msg').hidden = !msg;
    if (contaUi && contaUi.aberto()) { contaUi.fechar(); }
    nuvemTexto();
  }
  function titleNewGame(n) {
    titleNew = n; $('t-list').hidden = true; $('new-form').hidden = false; titleRodape(false);
    $('new-name').value = ''; $('new-err').hidden = true;
    // com o controle, focar o campo abriria o teclado do console sem pedir: ele abre quando o jogador aperta A no campo
    if (!(ctrl && ctrl.active())) { setTimeout(function () { try { $('new-name').focus(); } catch (e) { /* nada */ } }, 50); }
  }
  function titleAskDel(n) {
    var s = slotInfo(n); if (!s.name) { return; }
    titleDel = n; $('t-list').hidden = true; $('t-del').hidden = false; titleRodape(false);
    $('t-del-txt').textContent = 'Apagar ' + s.name + ' (nível ' + s.lv + ', espaço ' + n + ')? Não dá para desfazer.';
  }
  // Esc, B ou Voltar: do nome ou da confirmação volta à lista; na lista não há para onde voltar
  function titleBack() { if (contaUi && contaUi.fechar()) { return; } if (titleNew || titleDel || titleCfg) { showTitle(); } }
  function titleConfig() { titleCfg = true; $('t-list').hidden = true; $('t-cfg').hidden = false; titleRodape(false); cfgMostra(); }
  function cfgMostra() {
    if (!NZ.som) { return; }
    var on = NZ.som.ligado(); $('cfg-som').textContent = 'Som: ' + (on ? 'ligado' : 'desligado'); $('cfg-som').setAttribute('aria-pressed', String(on));
    ['musica', 'efeitos'].forEach(function (k) { var v = Math.round(NZ.som.volume(k) * 100); $('cfg-' + k).value = v; $('cfg-' + k + '-v').textContent = v + '%'; });
  }
  // painel da conta (js/conta.js) na tela inicial: aberto, ele toma o lugar da lista de saves
  var contaUi = null;
  function bindConta() {
    if (!window.Conta) { return; }
    contaUi = Conta.painel($('t-conta'), {
      semConta: 'Sem conta: os saves ficam só neste navegador. Entre para levá-los a qualquer aparelho.',
      comConta: 'Conta',
      aoAbrir: function (aberto) { if (titleOn) { $('t-list').hidden = aberto; $('t-cfg-abre').hidden = aberto; $('t-nuvem').hidden = aberto || !$('t-nuvem').textContent; } }
    });
    Conta.aoMudar(function () {
      if (!dono()) { vez.minha = false; } else if (dono() !== vez.uid && !aba.fechada) { vezPede(function () { /* entrou na conta: este aparelho fica com a vez */ }); }
      if (titleOn && !st) { showTitle(); nuvem(); } else { nuvemTexto(); }
    });
    Conta.pronto.then(function () { if (!st) { nuvem(); } });
  }
  function bindTitle() {
    $('t-slots').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) { return; }
      if (b.dataset.tPlay) { play(+b.dataset.tPlay); } else if (b.dataset.tNew) { titleNewGame(+b.dataset.tNew); } else if (b.dataset.tDel) { titleAskDel(+b.dataset.tDel); }
    });
    $('t-cont').addEventListener('click', function () { play(+this.dataset.n); });
    $('t-new').addEventListener('click', function () {
      for (var i = 1; i <= SLOTS; i++) { if (!load(i)) { titleNewGame(i); return; } }
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-t-back]'), function (b) { b.addEventListener('click', titleBack); });
    $('t-del-ok').addEventListener('click', function () {
      apagaSlot(titleDel);
      showTitle(); nuvem();
    });
    $('new-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var n = $('new-name').value.replace(/\s+/g, ' ').trim();
      if (n.length < 2 || n.length > 20) { $('new-err').textContent = 'Escolha um nome de 2 a 20 letras.'; $('new-err').hidden = false; return; }
      if (load(titleNew)) { showTitle(); $('t-msg').textContent = 'Esse espaço acabou de receber um save da nuvem. Escolha outro.'; $('t-msg').hidden = false; return; }
      $('new-name').blur(); play(titleNew, n, modoNovo);
    });
    // configurações (js/som.js): som ligado ou desligado e o volume da música e dos efeitos; valem para este navegador, fora do save
    $('t-cfg-abre').addEventListener('click', titleConfig);
    if (NZ.som) {
      $('cfg-som').addEventListener('click', function () { NZ.som.ligado(!NZ.som.ligado()); cfgMostra(); });
      ['musica', 'efeitos'].forEach(function (k) { $('cfg-' + k).addEventListener('input', function () { NZ.som.volume(k, this.value / 100); cfgMostra(); }); });
    } else { $('t-cfg-abre').hidden = true; }
    // os dois botões do jogo novo: o clique vem antes do envio do formulário; Enter no nome vale o primeiro (a campanha)
    var modoNovo = 'campanha';
    Array.prototype.forEach.call(document.querySelectorAll('#new-form [data-modo]'), function (b) { b.addEventListener('click', function () { modoNovo = b.dataset.modo; }); });
    $('new-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') { modoNovo = camp.tem() ? 'campanha' : 'livre'; } });
    if (!camp.tem()) { $('new-camp').hidden = $('new-hint').hidden = true; $('new-livre').hidden = false; modoNovo = 'livre'; } // sem campanha, o modo livre fica à vista
    $('w-title').addEventListener('click', devTap);
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
    var k = s.kills - a.kills; if (k) { li.push(k + (k > 1 ? ' bichos abatidos' : ' bicho abatido')); }
    for (var it in s.items) { var n = s.items[it] - (a.items[it] || 0); if (n) { li.push('+' + n + ' ' + G.items[it].name.toLowerCase()); } }
    var x = s.xp - a.xp; if (x) { li.push('+' + x + ' de experiência' + (st.player.lv > snap.lv ? ' (nível ' + st.player.lv + ')' : '')); }
    var p = s.potions - a.potions; if (p) { li.push(p + ' poç' + (p > 1 ? 'ões bebidas' : 'ão bebida')); }
    var r = s.retreats - a.retreats; if (r) { li.push(r + ' recuo' + (r > 1 ? 's' : '') + ' para descansar na praça'); }
    var f = s.faints - a.faints; if (f) { li.push(f + ' desmaio' + (f > 1 ? 's' : '')); }
    if (!li.length) { li.push(semMacro() ? 'Nada aconteceu.' : snap.on ? 'Nada aconteceu.' : 'Nada: a macro estava parada.'); }
    $('rep-time').textContent = 'Você ficou fora por ' + fmtTime(total) + (total > used + 1 ? ' (só ' + fmtTime(used) + ' contaram: o teto é de ' + G.settings.offlineCapHours + ' h).' : '.');
    $('rep-list').innerHTML = li.map(function (t) { return '<li>' + t + '</li>'; }).join('');
    $('rep-status').textContent = semMacro() ? '' : st.player.macro.on ? 'A macro continua trabalhando.' : (st.player.macro.stop || 'A macro está parada.');
    show('w-report');
  }

  // ---------- laço ----------
  function snapPrev() {
    var o = { player: { x: st.player.x, z: st.player.z } };
    st.mobs.forEach(function (m) { o[m.id] = { x: m.x, z: m.z }; });
    for (var id in st.gente) { var g = st.gente[id]; if (g.x !== undefined) { o['p:' + id] = { x: g.x, z: g.z }; } } // moradores em luta
    return o;
  }
  var lastFrame = performance.now();
  function frame(t) {
    requestAnimationFrame(frame);
    if (aba.fechada) { return; } // passou o jogo para outra aba: nada roda nem desenha aqui
    var fdt = Math.min(0.1, (t - lastFrame) / 1000); lastFrame = t;
    if (!st) { // tela inicial: deitado no trigo, olhando o céu (o começo da campanha), e o controle só navega
      ctrl.tick(fdt);
      view.yaw = G.campanha.inicio.yaw * Math.PI / 180 + Math.sin(t / 7000) * 0.05; view.pitch = -0.04;
      view.render(vitrine, null, 1, fdt, { interp: false, moving: false, now: clockNow(), clock: clockNow(), hora: horaFixa(), deitado: 1, semArma: true });
      return;
    }
    var now = clockNow(), gap = (now - lastReal) / 1000;
    if (away) { return; }
    if (gap > THRESH) { beginAway(lastReal); endAway(now); return; }
    lastReal = now;

    ctrl.tick(fdt);
    if (!st) { return; } // o controle acabou de voltar à tela inicial
    var moving = manualMove(fdt);
    acc += gap;
    var guard = 0;
    while (acc >= DT && guard++ < 50) { prev = snapPrev(); sim.tick(st); acc -= DT; }
    handleEvents();
    camp.tick(fdt);
    if (!st) { return; }

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
    view.render(st, prev, Math.min(1, acc / DT), fdt, { interp: auto, moving: moving || autoMoving, now: now, clock: clockNow(), hora: campanha() ? horaFixa() : null, deitado: camp.deitado() });
    hud(); marks();
    if (npcOpen && !nearOpen()) { hide(); }
  }
  // a conversa fecha quando o jogador se afasta (ou quem fala cai desacordado)
  function nearOpen() {
    var q = world.personById[npcOpen];
    if (!q) { return sim.nearNpc(st, npcOpen); }
    var pos = personPos(npcOpen);
    return !sim.isKo(st, npcOpen) && !!pos && calc.dist(st.player.x, st.player.z, pos.x, pos.z) <= G.settings.interactRange + 1;
  }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) { d -= Math.PI * 2; } while (d < -Math.PI) { d += Math.PI * 2; } return d; }

  function manualMove(dt) {
    if (openWin && openWin !== 'w-report') { return false; }
    if (camp.trava()) { return false; } // a história está mostrando algo (acordar, o puxão do fazendeiro)
    // pad.sf e pad.ss: o analógico da tela; pad.gf e pad.gs: o do controle. Todos de -1 a 1
    var f = (keys.KeyW || keys.ArrowUp || pad.fwd ? 1 : 0) - (keys.KeyS || keys.ArrowDown || pad.back ? 1 : 0) + (pad.sf || 0) + (pad.gf || 0);
    var s = (keys.KeyD || pad.right ? 1 : 0) - (keys.KeyA || pad.left ? 1 : 0) + (pad.ss || 0) + (pad.gs || 0);
    var turn = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
    if (!f && !s && !turn) { return false; }
    if (sim.takeControl(st)) { toast('Macro pausada: você assumiu o controle.'); }
    view.yaw += turn * G.player.turnSpeed * dt;
    if (!f && !s) { return false; }
    var y = view.yaw, fx = Math.sin(y), fz = Math.cos(y), rx = -Math.cos(y), rz = Math.sin(y);
    var vx = fx * f + rx * s, vz = fz * f + rz * s, l = Math.hypot(vx, vz), spd = G.player.walkSpeed * calc.stats(world, st.player).move * dt * Math.min(1, l); // teclas dão l >= 1; o analógico, a intensidade
    return sim.walk(st, vx / l * spd, vz / l * spd);
  }

  // ---------- eventos da simulação ----------
  function handleEvents() {
    var ev = sim.events; sim.events = [];
    var newLog = false;
    ev.forEach(function (e) {
      camp.evento(e);
      if (e.type === 'log') { newLog = true; }
      else if (e.type === 'hit' && e.who === 'mob') {
        view.hit(e.id); view.shake = 0.05;
        var m = sim.mobById(st, e.id); if (m) { floatAt(m.x, 0.7, m.z, '-' + e.n + (e.crit ? '!' : ''), e.crit ? 'crit' : ''); }
      } else if (e.type === 'hit' && e.who === 'gente') {
        view.hit(e.id); view.shake = 0.05;
        floatAt(e.x, 1.5, e.z, '-' + e.n + (e.crit ? '!' : ''), e.crit ? 'crit' : '');
      } else if (e.type === 'hostil') {
        if (e.on && npcOpen && world.personById[npcOpen]) { hide(); } // a conversa não sobrevive à briga
        lineTxt = null;
      } else if (e.type === 'hit' && e.who === 'player') {
        var h = $('hurt'); h.classList.add('on'); setTimeout(function () { h.classList.remove('on'); }, 60);
        floatScreen(0.5, 0.62, '-' + e.n + (e.crit ? '!' : ''), 'me'); view.shake = 0.12;
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
    var sm = semMacro(); if (sm !== document.body.classList.contains('sem-macro')) { document.body.classList.toggle('sem-macro', sm); }
    $('hp-bar').style.width = Math.max(0, p.hp / mh * 100) + '%';
    $('hp-t').textContent = Math.ceil(Math.max(0, p.hp)) + ' / ' + mh + (p.poison ? ' · envenenado' : '');
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
    $('bag').textContent = 'Bolsa ' + calc.bagCount(world, p) + '/' + calc.bagCap(world, p);
    if (openWin === 'w-char') { renderChar(); }
    dailyTick();
    if (openWin === 'w-npc') { sellTick(); }

    var line = $('macro-line'), on = p.mode === 'macro' && p.macro.on;
    var busy = on || !!p.goto, now = performance.now();
    var hint = semMacro() ? (isTouch ? 'Toque no mapa pequeno, no canto, para andar' : 'Mapa (M): clique para andar') : isTouch ? 'Toque no mapa pequeno, no canto, para andar ou usar a macro' : p.mapNav === 'macro' ? 'Mapa (M): clique para a macro trabalhar · Caminhada: para só andar' : 'Mapa (M): clique para andar · Macro (G): escolha a área de trabalho';
    var txt = on ? 'Macro: ' + macroText(p) : p.goto ? 'Andando até o ponto marcado no mapa' : (p.macro.stop || hint);
    // vila em armas: a linha fica fixa, em vermelho, e conta o tempo que falta longe da vila
    var H = st.hostil, AT = G.aldeoes.textos;
    if (H) { busy = true; txt = H.fora > 0 ? AT.fora.replace('{s}', Math.ceil(G.aldeoes.calmaSeg - H.fora)) : AT.linha + (p.goto ? ' · andando até o ponto marcado' : ''); }
    line.classList.toggle('hostil', !!H);
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
    if (a.type === 'gather') { var n = world.nodeById[a.id]; return n.kind === 'arvore' ? 'cortando árvore' : n.kind === 'veio' ? 'minerando veio' : 'colhendo ' + G.nodes[n.kind].name.toLowerCase(); }
    if (a.type === 'attack') { var mb = sim.mobById(st, a.id); return 'caçando ' + (mb ? G.monsters[mb.kind].name.toLowerCase() : 'bicho'); }
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
  function mapNext() { return semMacro() ? 'caminhada' : mapArmed || st.player.mapNav; }
  // estado dos controles da janela do mapa (botões Macro e Caminhada embaixo e os menus que eles abrem)
  function mapUi() {
    var a = st.player.macro.area, on = macroOn(), nav = semMacro() ? 'caminhada' : st.player.mapNav, mb = $('map-macro'), wb = $('map-walk');
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
  var COR_BICHO = { coelho: '#6b4424', veado: '#a8763a', lobo: '#3a3a44', escorpiao: '#8a2a1a', serpente: '#4a6a24' };
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

    // regiões: floresta com copinhas, pedregal com pedrinhas, campina com tufos de capim. Cada uma é um polígono
    // pintado com a borda esfumada (o degradê do chão), e os desenhos ficam por dentro dele
    var passo = Math.max(5, 26 / k); // um desenho a cada ~26 px, nunca mais denso que 5 m
    function poli(P) { c.beginPath(); P.forEach(function (q, i) { if (i) { c.lineTo(X(q[0]), Z(q[1])); } else { c.moveTo(X(q[0]), Z(q[1])); } }); c.closePath(); }
    (V.regions || []).forEach(function (r) {
      if (r.kind === 'vila' || !r.poly) { return; }
      var xs = r.poly.map(function (q) { return q[0]; }), zs = r.poly.map(function (q) { return q[1]; });
      var bx0 = Math.min.apply(null, xs), bx1 = Math.max.apply(null, xs), bz0 = Math.min.apply(null, zs), bz1 = Math.max.apply(null, zs);
      if (!vis((bx0 + bx1) / 2, (bz0 + bz1) / 2, Math.max(bx1 - bx0, bz1 - bz0) / 2)) { return; }
      c.save(); c.fillStyle = REGIAO[r.kind] || 'rgba(0,0,0,0)'; c.filter = 'blur(' + Math.max(1, Math.round(4 * k)) + 'px)'; poli(r.poly); c.fill(); c.restore();
      c.save(); poli(r.poly); c.clip();
      var gx0 = Math.floor(Math.max(bx0, ox - hw) / passo), gx1 = Math.ceil(Math.min(bx1, ox + hw) / passo);
      var gz0 = Math.floor(Math.max(bz0, oz - hw) / passo), gz1 = Math.ceil(Math.min(bz1, oz + hw) / passo);
      c.lineWidth = 1; c.strokeStyle = r.kind === 'floresta' ? 'rgba(52,74,30,.4)' : r.kind === 'rochas' ? 'rgba(80,70,60,.45)' : 'rgba(96,120,40,.45)';
      c.beginPath();
      for (var i = gx0; i <= gx1; i++) { for (var j = gz0; j <= gz1; j++) {
        var n = i * 7919 + j * 104729, wx = (i + sorteMapa(n)) * passo, wz = (j + sorteMapa(n + 0.5)) * passo;
        if (NZ.distPoligono(r.poly, wx, wz) < 4) { continue; } // perto da divisa o desenho rareia, como o chão
        var x = X(wx), z = Z(wz), s = 3 + sorteMapa(n + 0.3) * 2;
        if (r.kind === 'floresta') { c.moveTo(x + s, z); c.arc(x, z, s, 0, 6.3); }
        else if (r.kind === 'rochas') { c.moveTo(x - s, z + s * 0.5); c.lineTo(x - s * 0.2, z - s * 0.6); c.lineTo(x + s, z + s * 0.5); c.closePath(); }
        else { c.moveTo(x - s * 0.6, z - s * 0.8); c.lineTo(x, z); c.lineTo(x + s * 0.6, z - s * 0.8); c.moveTo(x, z - s); c.lineTo(x, z); }
      } }
      c.stroke(); c.restore();
    });
    // fora do limite jogável: papel sombreado, com a borda em tinta
    if (V.limite) {
      c.save(); c.beginPath(); c.rect(-10, -10, S + 20, S + 20);
      V.limite.slice().reverse().forEach(function (q, i) { if (i) { c.lineTo(X(q[0]), Z(q[1])); } else { c.moveTo(X(q[0]), Z(q[1])); } }); c.closePath();
      c.fillStyle = 'rgba(70,58,34,.32)'; c.fill('evenodd');
      poli(V.limite); c.strokeStyle = INK; c.lineWidth = big ? 2 : 1.2; c.stroke(); c.restore();
    }
    // rio: azul com a margem em tinta; a ponte em tábuas e os vaus em pontinhos de pedra
    (V.rios || []).forEach(function (Ri) {
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
      Ri.pts.forEach(function (q, i) { if (i) { c.lineTo(X(q[0]), Z(q[1])); } else { c.moveTo(X(q[0]), Z(q[1])); } });
      c.strokeStyle = INK2; c.lineWidth = Ri.w * k + (big ? 2.4 : 1.4); c.stroke();
      c.strokeStyle = 'rgba(92,140,180,.95)'; c.lineWidth = Ri.w * k; c.stroke(); c.restore();
    });
    (V.travessias || []).forEach(function (t) {
      if (!vis(t.x, t.z)) { return; }
      var a = (t.ang + 90) * Math.PI / 180;
      c.save(); c.translate(X(t.x), Z(t.z)); c.rotate(a);
      if (t.tipo === 'ponte') { c.fillStyle = 'rgba(122,72,34,.9)'; c.fillRect(-t.len / 2 * k, -t.w / 2 * k, t.len * k, t.w * k); c.strokeStyle = INK; c.lineWidth = 1; c.strokeRect(-t.len / 2 * k, -t.w / 2 * k, t.len * k, t.w * k); }
      else { c.fillStyle = 'rgba(120,112,98,.95)'; for (var s = -t.len / 2 + 0.5; s < t.len / 2; s += 1) { c.beginPath(); c.arc(s * k, 0, Math.max(1, k * 0.4), 0, 7); c.fill(); } }
      c.restore();
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
    // construções com sala: o piso por dentro das paredes, os móveis que ocupam o chão e o vão da porta aberto na fachada
    var N = world.N;
    world.salas.forEach(function (S) {
      if (!vis(S.b.x, S.b.z, Math.max(S.b.w, S.b.d))) { return; }
      S.cel.forEach(function (i) {
        var cx = i % N - B, cz = Math.floor(i / N) - B;
        c.fillStyle = world.grid[i] ? 'rgba(122,72,34,.7)' : 'rgba(236,214,166,.95)';
        c.fillRect(X(cx) - 0.3, Z(cz) - 0.3, k + 0.6, k + 0.6); // a folga fecha as frestas entre as células
      });
      var dw = S.I.porta[0] / 2, f = S.b.d / 2, a = S.mundo(-dw, f - 0.5), b2 = S.mundo(dw, f - 0.5), a2 = S.mundo(-dw, f + 0.3), b3 = S.mundo(dw, f + 0.3);
      c.fillStyle = 'rgba(236,214,166,.95)'; c.beginPath();
      c.moveTo(X(a.x), Z(a.z)); c.lineTo(X(b2.x), Z(b2.z)); c.lineTo(X(b3.x), Z(b3.z)); c.lineTo(X(a2.x), Z(a2.z)); c.closePath(); c.fill();
      // batentes: dois traços de tinta, um de cada lado do vão
      c.strokeStyle = INK; c.lineWidth = big ? 1.6 : 0.9; c.beginPath();
      c.moveTo(X(a.x), Z(a.z)); c.lineTo(X(a2.x), Z(a2.z)); c.moveTo(X(b2.x), Z(b2.z)); c.lineTo(X(b3.x), Z(b3.z)); c.stroke();
    });
    // árvores e veios (só os que estão à vista)
    world.nodes.forEach(function (n) {
      if (!vis(n.x, n.z)) { return; }
      var alive = st.nodes[n.id].alive, x = X(n.x), z = Z(n.z);
      if (n.rect) { // retalho colhido: terra lisa por cima das fileiras
        if (!alive) { c.fillStyle = 'rgba(120,86,48,.55)'; rect(n.rect.x0, n.rect.z0, n.rect.x1, n.rect.z1); }
        return;
      }
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
    // bichos: cada espécie com a sua tinta; os bravos (lobo, escorpião, serpente) em tons de perigo e um pouco maiores
    st.mobs.forEach(function (m) {
      if (!m.alive || !vis(m.x, m.z)) { return; }
      c.fillStyle = COR_BICHO[m.kind] || '#6b4424';
      c.beginPath(); c.arc(X(m.x), Z(m.z), (big ? 2.4 : 1.4) * (G.monsters[m.kind] && G.monsters[m.kind].aggro ? 1.25 : 1), 0, 7); c.fill();
    });
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
        var lx = r.label ? r.label[0] : V.plaza.x, lz = r.label ? r.label[1] : V.plaza.z; // vila.json → regions → label
        label(c, r.name, X(lx), Z(lz), Math.round((perto ? 16 : 14) * u), true);
      });
      (V.rios || []).slice(0, 1).forEach(function (Ri) { var q = Ri.pts[Math.floor(Ri.pts.length * 0.62)]; label(c, Ri.name, X(q[0]) + 16, Z(q[1]), Math.round(13 * u), true); });
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
    var a = !semMacro() && (macroOn() || st.player.mapNav === 'macro') ? st.player.macro.area : null; // a marca some ao só caminhar
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
    if (titleOn) { return; } // na tela inicial não se abre janela do jogo
    if (openWin === 'w-cena') { return; } // a fala da história fica até o jogador escolher
    hide(); openWin = id; $(id).hidden = false; keys = {}; pad = {}; guardClicks();
  }
  // caixa das falas da campanha (js/campanha.js): Esc, B e Fechar não a fecham; só as escolhas dela
  function cenaJanela(abre) {
    if (abre) { if (openWin && openWin !== 'w-cena') { hide(); } openWin = 'w-cena'; $('w-cena').hidden = false; keys = {}; pad = {}; guardClicks(); }
    else if (openWin === 'w-cena') { $('w-cena').hidden = true; openWin = null; }
  }
  // o toque que abre uma janela gera, logo depois, um clique fantasma no mesmo ponto;
  // por meio segundo a janela ignora cliques, para ele não escolher uma opção sozinho
  var guardUntil = 0, lastPointer = 'mouse';
  window.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType; }, true);
  function guardClicks() { if (lastPointer === 'touch') { guardUntil = performance.now() + 500; } }
  // tudo: fecha até a caixa da campanha (sair para a tela inicial, passar o jogo a outra aba)
  function hide(tudo) {
    if (titleOn) { titleBack(); return; } // a tela inicial só sai escolhendo um save
    if (openWin === 'w-cena' && !tudo) { return; }
    if (openWin) { $(openWin).hidden = true; }
    closeSell(true); closePop(true); sellShown = null;
    openWin = null; npcOpen = null; if (view) { view.segura(null); } // o morador do menu volta a andar
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

  // ---------- personagem: equipamento, bolsa e atributos ----------
  function mult(v) { return '×' + String(v).replace('.', ','); }
  function num(v, d) { var k = Math.pow(10, d === undefined ? 1 : d); return String(Math.round(v * k) / k).replace('.', ','); }
  function pct(v) { return num(v * 100) + '%'; }
  // texto de cada efeito: as mesmas chaves servem aos atributos (attributes.*.per) e aos bônus dos itens (items.*.bonus)
  var EFFECT = {
    melee: function (v) { return '+' + pct(v) + ' de dano corpo a corpo'; },
    ranged: function (v) { return '+' + pct(v) + ' de dano com arco'; },
    crit: function (v) { return '+' + pct(v) + ' de chance de crítico'; },
    critMult: function (v) { return '+' + num(v, 2) + ' no multiplicador do crítico'; },
    hp: function (v) { return '+' + Math.round(v) + ' de vida máxima'; },
    regen: function (v) { return '+' + pct(v) + ' na recuperação de vida'; },
    move: function (v) { return '+' + pct(v) + ' no passo'; },
    haste: function (v) { return '+' + pct(v) + ' no ritmo de ataque'; },
    xp: function (v) { return '+' + pct(v) + ' de experiência'; },
    potion: function (v) { return '+' + pct(v) + ' na cura das poções'; },
    gather: function (v) { return '+' + pct(v) + ' no ritmo de coleta'; },
    bag: function (v) { var n = Math.floor(v + 1e-9); return '+' + n + ' casa' + (n === 1 ? '' : 's') + ' na bolsa'; },
    discount: function (v) { return '−' + pct(v) + ' no preço das compras'; },
    markup: function (v) { return '+' + pct(v) + ' no que os mercadores pagam'; },
    rep: function (v) { return '+' + pct(v) + ' de reputação'; }
  };
  function effText(key, v) { return EFFECT[key] ? EFFECT[key](v) : key + ' ' + v; }
  // o que n pontos num atributo dão, com o limite de game.json
  function attrText(id, n) {
    var A = G.attributes[id], out = [];
    for (var k in A.per) {
      var v = n * A.per[k], cap = A.cap && A.cap[k], top = cap !== undefined && v >= cap;
      out.push(effText(k, top ? cap : v) + (top ? ' (máximo)' : ''));
    }
    return out.join(' · ');
  }
  // linhas de descrição de um item: números da arma, armadura, bônus
  function itemLines(k) {
    var it = G.items[k], L = [], c = it.class && G.weaponClasses[it.class];
    if (it.dmg) {
      L.push((c ? c.name + ' · ' : '') + 'dano ' + it.dmg[0] + '–' + it.dmg[1] + ' · um golpe a cada ' + num(it.interval, 2) + ' s · alcance ' + num(it.reach) + ' m');
      if (c && c.about) { L.push(c.about); }
    }
    if (it.def) { L.push('Defesa +' + it.def); }
    for (var b in (it.bonus || {})) { L.push(effText(b, it.bonus[b])); }
    for (var g in (it.gather || {})) { L.push(G.nodes[g].name + ': coleta ' + pct(it.gather[g]) + ' mais rápida'); }
    if (it.stack) { L.push('Munição do arco: fica na aljava, fora da bolsa, e cada tiro gasta uma.'); }
    return L;
  }
  function linesHtml(L) { return L.length ? '<ul class="pop-lines">' + L.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : ''; }
  function itemName(k, n) { var it = G.items[k]; return n === undefined || n === 1 ? it.name : (it.plural || it.name); }
  // quem na vila vende ou compra o item (para as dicas)
  function npcsWith(type, test) {
    return Object.keys(G.npcs).filter(function (id) { return G.npcs[id].services.some(function (s) { return s.type === type && s.items.some(test); }); })
      .map(function (id) { return G.npcs[id].name; });
  }

  var charTab = 'equip', charSig = '', attrAdd = {};
  function openChar(tab) {
    if (openWin === 'w-char' && (!tab || tab === charTab)) { hide(); return; }
    if (openWin !== 'w-char') { attrAdd = {}; show('w-char'); $('iv-res').textContent = ''; }
    setTab(tab || charTab);
  }
  function setTab(tab) {
    charTab = tab; charSig = '';
    ['equip', 'bag', 'attr'].forEach(function (t) {
      $('pn-' + t).hidden = t !== tab; $('tab-' + t).setAttribute('aria-selected', t === tab ? 'true' : 'false');
    });
    renderChar();
  }
  function attrSpent() { var n = 0; for (var k in attrAdd) { n += attrAdd[k]; } return n; }
  // o jogo segue rodando com a janela aberta: as barras andam sempre, e o resto só se refaz quando algo muda,
  // senão o foco do teclado e do controle se perderia a cada 150 ms
  function renderChar() {
    var p = st.player, s = calc.stats(world, p), need = p.lv * G.player.xpPerLevel;
    $('ch-name').textContent = p.name || 'Personagem';
    $('ch-hp-bar').style.width = Math.max(0, p.hp / s.hp * 100) + '%';
    $('ch-hp').textContent = Math.ceil(Math.max(0, p.hp)) + ' / ' + s.hp;
    $('ch-lv').textContent = 'Nível ' + p.lv + ' · ' + p.xp + '/' + need + ' XP · ' + p.rep + ' rp';
    $('tab-pts').hidden = !p.pts; $('tab-pts').textContent = p.pts;
    var sig = JSON.stringify([charTab, p.equip, p.inv, p.attr, p.pts, p.stance, p.lv, attrAdd, st.quests]);
    if (sig === charSig) { return; }
    charSig = sig;
    var w = $('w-char'), at = document.activeElement, key = at && w.contains(at) && at.dataset.k; // devolve o foco a quem estava nele
    if (charTab === 'equip') { renderEquip(s); } else if (charTab === 'bag') { renderBagTab(s); } else { renderAttr(); }
    if (key && !w.contains(document.activeElement)) { var el = w.querySelector('[data-k="' + key + '"]'); if (el && !el.disabled) { el.focus(); } }
  }
  function slotIcon(sl) {
    var t = G.equipSlots[sl].type, k = Object.keys(G.items).filter(function (x) { return G.items[x].slot === t; })[0];
    return ITEM_ICONS['_' + t] ? svgIcon(ITEM_ICONS['_' + t]) : k ? itemIcon(k) : '';
  }
  function renderEquip(s) {
    var p = st.player, wc = p.equip.arma && G.items[p.equip.arma].class, S = G.stances[p.stance], sd = S.dmg;
    $('eq-grid').innerHTML = calc.keys(G.equipSlots).map(function (sl) {
      var D = G.equipSlots[sl], k = p.equip[sl], it = k && G.items[k], off = D.only && wc !== D.only;
      return '<button type="button" class="eq-cell' + (it ? '' : ' empty') + (off ? ' off' : '') + '" data-slot="' + sl + '" data-k="slot:' + sl + '" style="grid-area:' + sl + '"' +
        ' aria-label="' + esc(D.name + ': ' + (it ? it.name + (it.stack ? ', ' + (p.inv[k] || 0) : '') : 'vazio')) + '">' +
        '<span class="ic">' + (it ? itemIcon(k) : slotIcon(sl)) + (it && it.stack ? '<span class="n">' + (p.inv[k] || 0) + '</span>' : '') + '</span>' +
        '<span class="eq-t"><small>' + esc(D.name) + '</small><b>' + esc(it ? it.name : off ? 'só com arco' : 'vazio') + '</b></span></button>';
    }).join('');
    var avg = (s.min + s.max) / 2 * sd * (1 + s.crit * (s.critMult - 1)), cut = calc.armorCut(world, s.def);
    var arma = s.weapon ? G.items[s.weapon].name : G.player.unarmed.name + (s.noAmmo ? ' (o arco está sem flechas)' : '');
    var rows = [
      ['Arma', arma],
      ['Dano', Math.round(s.min * sd) + '–' + Math.round(s.max * sd) + ' por golpe' + (s.ranged ? ', de longe' : '') + ' (postura ' + S.name.toLowerCase() + ' ' + mult(sd) + ')'],
      ['Ritmo', 'um golpe a cada ' + num(s.interval, 2) + ' s · cerca de ' + num(avg / s.interval) + ' de dano por segundo'],
      ['Alcance', num(s.reach) + ' m'],
      ['Crítico', pct(s.crit) + ' de chance, dano ' + mult(num(s.critMult, 2))],
      ['Defesa', s.def + ' · a armadura tira ' + pct(cut) + ' do dano, e a postura deixa passar ' + mult(S.taken)],
      ['Passo', pct(s.move) + ' do normal'],
      ['Coleta', calc.keys(G.nodes).map(function (n) { return G.nodes[n].name + ' ' + num(calc.gatherSec(world, p, n)) + ' s'; }).join(' · ')],
      ['Bolsa', s.bag + ' casas']
    ];
    $('eq-stats').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('[data-stance]'), function (b) {
      var id = b.dataset.stance;
      if (!b.textContent) { b.textContent = G.stances[id].name; }
      b.setAttribute('aria-pressed', id === p.stance ? 'true' : 'false');
    });
    $('iv-stance').textContent = 'Dano causado ' + mult(S.dmg) + ' · dano recebido ' + mult(S.taken);
    var n = p.inv.pocao || 0;
    $('iv-pots').textContent = n + ' ' + (n === 1 ? 'poção' : 'poções') + ' · cada uma cura ' + calc.potionHeal(world, p);
    $('iv-drink').disabled = !n;
  }
  function renderBagTab(s) {
    var p = st.player, cap = s.bag, used = calc.bagCount(world, p), cells = [], n = 0;
    for (var k in p.inv) {
      var it = G.items[k]; if (!(p.inv[k] > 0) || !it || it.noBag) { continue; }
      var res = Math.min(p.inv[k], sim.reserved(st, k)); n++;
      cells.push('<button type="button" class="sell-cell" data-item="' + k + '" data-k="bag:' + k + '" title="' + esc(it.name) + '" aria-label="' + esc(it.name + ': ' + p.inv[k] + (res ? ', ' + res + ' para missão' : '')) + '">' +
        itemIcon(k) + '<span class="n">' + p.inv[k] + '</span>' + (res ? '<i class="res" aria-hidden="true"></i>' : '') + '</button>');
    }
    var all = Math.max(SELL_ROWS, Math.ceil(n / SELL_COLS)) * SELL_COLS;
    for (var i = n; i < all; i++) { cells.push('<span class="sell-cell empty"></span>'); }
    $('bg-board').innerHTML = cells.join('');
    $('bg-empty').hidden = !!n;
    $('bg-cap').textContent = 'Ocupado: ' + used + ' de ' + cap;
    $('bg-coins').textContent = 'Moedas: ' + (p.inv.moeda || 0);
    $('bg-bar').style.width = Math.min(100, used / cap * 100) + '%';
    $('bg-bar').parentNode.classList.toggle('full', used >= cap);
    var ex = ['Poções: ' + (p.inv.pocao || 0)], tools = calc.keys(G.items).filter(function (x) { return G.items[x].tool && p.inv[x] > 0; });
    if (tools.length) { ex.push('Ferramentas: ' + tools.map(function (x) { return G.items[x].name.toLowerCase(); }).join(', ')); }
    calc.keys(G.items).forEach(function (x) { if (G.items[x].stack && p.inv[x] > 0) { ex.push('Na aljava: ' + p.inv[x] + ' ' + itemName(x, p.inv[x]).toLowerCase()); } });
    $('bg-extra').textContent = ex.join(' · ') + '. Toque ou clique num item para ver e equipar.'.replace('Toque ou clique', isTouch ? 'Toque' : 'Clique');
  }
  function renderAttr() {
    var p = st.player, spent = attrSpent(), left = p.pts - spent, ppl = G.player.pointsPerLevel;
    $('at-pts').innerHTML = left ? '<b>' + left + '</b> ponto' + (left === 1 ? '' : 's') + ' para distribuir. Escolha com + e −, e confirme.'
      : p.pts ? 'Todos os pontos escolhidos: confirme para valer.' : 'Sem pontos para distribuir. Cada nível dá ' + ppl + '.';
    $('at-list').innerHTML = calc.keys(G.attributes).map(function (id) {
      var A = G.attributes[id], v = p.attr[id] || 0, add = attrAdd[id] || 0;
      return '<li><div class="at-head"><b>' + esc(A.name) + '</b><span class="at-v">' + v + (add ? ' <i>+' + add + '</i>' : '') + '</span>' +
        '<button type="button" data-sub="' + id + '" data-k="sub:' + id + '" aria-label="Tirar um ponto de ' + esc(A.name) + '"' + (add ? '' : ' disabled') + '>−</button>' +
        '<button type="button" data-add="' + id + '" data-k="add:' + id + '" aria-label="Pôr um ponto em ' + esc(A.name) + '"' + (left ? '' : ' disabled') + '>+</button></div>' +
        '<p class="hint">' + esc(A.desc) + '</p>' +
        '<p class="at-eff">' + (v ? 'Agora: ' + esc(attrText(id, v)) : 'Agora: nenhum efeito') + (add ? '<br>Depois: ' + esc(attrText(id, v + add)) : '') + '</p></li>';
    }).join('');
    $('at-undo').disabled = $('at-confirm').disabled = !spent;
    $('at-undo').parentNode.hidden = !p.pts;
  }
  function attrStep(id, d) {
    var p = st.player, cur = attrAdd[id] || 0;
    if (d > 0 && attrSpent() >= p.pts) { return; }
    cur = Math.max(0, cur + d); if (cur) { attrAdd[id] = cur; } else { delete attrAdd[id]; }
    renderChar();
  }
  function attrConfirm() {
    var n = attrSpent();
    if (n && sim.spend(st, attrAdd)) { attrAdd = {}; save(); handleEvents(); toast(n + ' ponto' + (n === 1 ? '' : 's') + ' distribuído' + (n === 1 ? '' : 's') + '.'); }
    renderChar();
    if (document.activeElement === document.body || !document.activeElement || document.activeElement.disabled) { $('tab-attr').focus(); }
  }

  // ---------- janela por cima (casa do equipamento, item da bolsa, compra) ----------
  // a mesma moldura do submenu de venda; o controle a enxerga pela mesma porta (ctrlApi.sell)
  var pop = null;
  function svgIcon(body) { return '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + body + '</svg>'; }
  function popHead(icon, title, sub) {
    return '<div class="sell-id"><span class="ic">' + icon + '</span><span class="nm"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span>' +
      '<button type="button" class="x" data-x>Fechar</button></div>';
  }
  function openPop(label, inner) {
    closePop(true);
    var back = document.createElement('div'), downOut = false, from = document.activeElement;
    back.className = 'sell-back';
    back.innerHTML = '<div class="sell-pop" role="dialog" tabindex="-1" aria-label="' + esc(label) + '">' + inner + '<p class="sell-note" data-msg hidden></p></div>';
    back.onpointerdown = function (e) { downOut = e.target === back; };
    back.onclick = function (e) { if (e.target === back && downOut) { closePop(); } };
    $('app').appendChild(back);
    pop = { back: back, pop: back.firstChild, key: from && from.dataset ? from.dataset.k : null };
    back.querySelector('[data-x]').onclick = function () { closePop(); };
    pop.pop.focus();
    return pop;
  }
  function popMsg(t) { var m = pop && pop.pop.querySelector('[data-msg]'); if (m) { m.textContent = t; m.hidden = !t; } }
  function closePop(noFocus) {
    var P = pop; if (!P) { return; }
    pop = null; P.back.parentNode.removeChild(P.back);
    var el = !noFocus && P.key && document.querySelector('[data-k="' + P.key + '"]');
    if (el && !el.disabled) { el.focus(); }
  }
  function gearDone(msg) { save(); handleEvents(); charSig = ''; closePop(); renderChar(); if (msg) { toast(msg, 3); } }
  // casa do equipamento: o que está nela e o que da bolsa serve
  function openSlot(sl) {
    var p = st.player, D = G.equipSlots[sl], k = p.equip[sl], it = k && G.items[k], wc = p.equip.arma && G.items[p.equip.arma].class;
    var fits = Object.keys(p.inv).filter(function (x) { var d = G.items[x]; return d && d.slot === D.type && p.inv[x] > 0 && x !== k; });
    var sellers = npcsWith('shop', function (x) { return G.items[x].slot === D.type; });
    var html = popHead(it ? itemIcon(k) : slotIcon(sl), it ? it.name : D.name, it ? D.name + (it.stack ? ' · ' + (p.inv[k] || 0) + ' na aljava' : '') : 'Casa vazia');
    if (it) { html += linesHtml(itemLines(k)) + '<button type="button" data-un>Tirar</button>'; }
    if (D.only && wc !== D.only) { html += '<p class="sell-note">Esta casa só vale com ' + esc(G.weaponClasses[D.only].name.toLowerCase()) + ' na mão.</p>'; }
    if (fits.length) {
      html += '<h3>Da bolsa</h3>' + fits.map(function (x) {
        return '<button type="button" class="pop-item" data-eq="' + x + '">' + itemIcon(x) + '<span><b>' + esc(G.items[x].name) + (G.items[x].stack ? ' · ' + p.inv[x] : '') + '</b><small>' + esc(itemLines(x)[0] || '') + '</small></span></button>';
      }).join('');
    } else {
      html += '<p class="hint">' + (sellers.length ? 'Nada na bolsa serve aqui. Quem vende: ' + esc(sellers.join(', ')) + '.' : 'Ainda não existe nada para esta casa.') + '</p>';
    }
    var P = openPop(D.name, html);
    var un = P.pop.querySelector('[data-un]');
    if (un) { un.onclick = function () { var m = sim.unequip(st, sl); if (p.equip[sl]) { popMsg(m); } else { gearDone(m); } }; }
    Array.prototype.forEach.call(P.pop.querySelectorAll('[data-eq]'), function (b) { b.onclick = function () { gearDone(sim.equip(st, b.dataset.eq, sl)); }; });
  }
  // item da bolsa: o que é, para que serve, quem compra; equipar se for de vestir
  function openBagItem(k) {
    var p = st.player, it = G.items[k], res = Math.min(p.inv[k] || 0, sim.reserved(st, k)), slot = it.slot && !it.stack ? sim.slotFor(st, k) : null;
    var buyers = Object.keys(G.npcs).filter(function (id) { return G.npcs[id].services.some(function (s) { return s.type === 'sell' && s.items.indexOf(k) >= 0; }); });
    var html = popHead(itemIcon(k), it.name, (p.inv[k] || 0) + ' na bolsa' + (res ? ' · ' + res + ' para missão' : '')) + linesHtml(itemLines(k));
    if (buyers.length) { html += '<p class="hint">Quem compra: ' + esc(buyers.map(function (id) { return G.npcs[id].name; }).join(', ')) + ' (' + coins(calc.sellPrice(world, p, k, 1)) + ' cada).</p>'; }
    if (slot) {
      var cur = p.equip[slot];
      html += '<button type="button" class="main" data-eq>Equipar' + (cur ? ' no lugar de ' + esc(G.items[cur].name.toLowerCase()) : '') + '</button>';
    }
    var P = openPop(it.name, html), b = P.pop.querySelector('[data-eq]');
    if (b) { b.onclick = function () { gearDone(sim.equip(st, k, slot)); }; }
  }
  // loja: comprar um item (feixe de flechas com quantidade) e, se for de vestir, já equipar
  function lotOf(s, k) { return (s.lots && s.lots[k]) || 1; }
  function openBuy(id, s, k) {
    var p = st.player, it = G.items[k], lot = lotOf(s, k), unit = calc.buyPrice(world, p, k, lot), slot = it.slot && !it.stack ? sim.slotFor(st, k) : null;
    var max = Math.max(1, Math.min(20, Math.floor((p.inv.moeda || 0) / unit))), cur = slot && p.equip[slot];
    var html = popHead(itemIcon(k), it.name, coins(unit) + (lot > 1 ? ' o feixe de ' + lot : '')) + linesHtml(itemLines(k));
    if (cur) { html += '<p class="hint">Hoje em ' + esc(G.equipSlots[slot].name.toLowerCase()) + ': ' + esc(G.items[cur].name) + (itemLines(cur)[0] ? ' (' + esc(itemLines(cur)[0]) + ')' : '') + '.</p>'; }
    if (lot > 1) {
      html += '<div class="sell-qty"><input type="range" min="1" max="' + max + '" step="1" value="1" aria-label="Feixes"' + (max < 2 ? ' disabled' : '') + '>' +
        '<input type="text" class="num" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Feixes" value="1"><small>de ' + max + '</small></div>';
    }
    html += '<button type="button" class="main" data-buy></button>' + (slot ? '<button type="button" data-buyeq>Comprar e equipar</button>' : '');
    var P = openPop('Comprar ' + it.name.toLowerCase(), html), n = 1, q = function (sel) { return P.pop.querySelector(sel); };
    var range = q('[type=range]'), box = q('.num'), ok = q('[data-buy]'), eq = q('[data-buyeq]');
    function paint() {
      var cost = calc.buyPrice(world, p, k, lot * n), poor = (p.inv.moeda || 0) < cost;
      ok.textContent = 'Comprar' + (lot > 1 ? ' ' + n * lot + ' ' + itemName(k, 2).toLowerCase() : '') + ' por ' + cost;
      ok.disabled = poor; if (eq) { eq.disabled = poor; }
      popMsg(poor ? 'Moedas insuficientes: você tem ' + (p.inv.moeda || 0) + '.' : '');
      if (range) { range.value = n; range.style.setProperty('--p', (max > 1 ? (n - 1) / (max - 1) * 100 : 100) + '%'); if (box.value !== String(n) && document.activeElement !== box) { box.value = n; } }
    }
    function set(v) { n = Math.max(1, Math.min(max, v || 1)); paint(); }
    if (range) {
      range.oninput = function () { set(+range.value); };
      box.oninput = function () { var d = box.value.replace(/\D/g, ''); if (d) { set(parseInt(d, 10)); } };
      box.onblur = function () { box.value = n; };
      box.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); ok.focus(); } };
    }
    function buy(equip) { var m = sim.service(st, id, s, { item: k, n: n, equip: equip }); save(); handleEvents(); npcDone(id, m); closePop(); }
    ok.onclick = function () { buy(false); };
    if (eq) { eq.onclick = function () { buy(true); }; }
    paint();
  }
  function shopBox(id, s) {
    var p = st.player, wrap = document.createElement('div'), board = document.createElement('div');
    wrap.className = 'sell'; board.className = 'sell-board';
    wrap.innerHTML = '<div class="sell-top"><h3>Comprar</h3><span>Moedas: ' + (p.inv.moeda || 0) + '</span></div>';
    s.items.forEach(function (k) {
      var it = G.items[k], lot = lotOf(s, k), price = calc.buyPrice(world, p, k, lot), b = document.createElement('button');
      b.type = 'button'; b.className = 'sell-cell' + ((p.inv.moeda || 0) >= price ? '' : ' off'); b.dataset.k = 'buy:' + k;
      b.title = it.name + ' · ' + coins(price);
      b.setAttribute('aria-label', 'Comprar ' + it.name + (lot > 1 ? ', feixe de ' + lot : '') + ': ' + coins(price));
      b.innerHTML = itemIcon(k) + '<span class="n price">' + price + '</span>' + (lot > 1 ? '<span class="lot">×' + lot + '</span>' : '');
      b.onclick = function () { openBuy(id, s, k); };
      board.appendChild(b);
    });
    for (var i = s.items.length; i < Math.ceil(s.items.length / SELL_COLS) * SELL_COLS; i++) { var e = document.createElement('span'); e.className = 'sell-cell empty'; board.appendChild(e); }
    wrap.appendChild(board);
    return wrap;
  }

  function drinkPotion() {
    var p = st.player, msg;
    if (sim.drink(st)) { msg = 'Bebeu uma poção (+' + calc.potionHeal(world, p) + ' de vida).'; }
    else if (!(p.inv.pocao > 0)) { msg = 'Sem poções. O Padre vende.'; }
    else if (p.hp >= calc.maxHp(world, p)) { msg = 'A vida já está cheia.'; }
    else { msg = 'Agora não: espere um instante.'; }
    handleEvents();
    if (openWin === 'w-char') { $('iv-res').textContent = msg; renderChar(); } else { toast(msg); }
  }
  function setStance(id) {
    var p = st.player; p.stance = id || (p.stance === 'ofensiva' ? 'defensiva' : 'ofensiva');
    if (openWin === 'w-char') { renderChar(); $('iv-res').textContent = ''; }
    else { toast('Postura ' + G.stances[p.stance].name.toLowerCase() + '.'); }
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
    if (paid || fresh) { handleEvents(); save(); if (npcOpen && G.npcs[npcOpen] && G.npcs[npcOpen].daily) { talk(npcOpen); } }
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
    var Q = G.daily.quests[q], r = sim.dailyReward(q, 0, st), s = sim.dailyState(st, q), back = { text: 'Voltar', fn: function () { dailyTalk(id); } };
    setTalk(Q.text, s === 'available' ? [{ text: 'Aceitar: ' + Q.title, cls: 'main', fn: function () { sim.dailyAccept(st, q); handleEvents(); save(); dailyTalk(id); } }, back] : [back],
      s === 'active' ? 'Missão: ' + Q.title + ' · ' + dailyProg(q) : s === 'done' ? 'Concluída hoje.' : s === 'closed' ? 'Encerrada até o reinício.' :
      'Recompensa: ' + r.moedas + ' moedas, ' + r.xp + ' XP e ' + r.rp + ' rp.');
  }
  // ---------- gente: menu Conversar / Negociar / Fechar ----------
  // o protagonista é da vila e não ataca os moradores: a opção Atacar saiu do jogo (ver LORE.md, "O protagonista")
  // vale para os NPCs parados e para os moradores que andam, pelo id; o quadro e o baú são objetos e abrem direto (openNpc)
  function persona(id) { return G.pessoas[id] || {}; }
  // falas em rodízio: cada pessoa (e cada assunto dela) diz a fala 1, depois a 2, e volta à 1. O contador fica no save
  function alterna(chave, l, alt) {
    if (!l || !l.length) { return alt || ''; }
    var R = st.falas = st.falas || {}, k = R[chave] || 0;
    R[chave] = (k + 1) % l.length;
    return l[k % l.length];
  }
  function personName(id) { return world.personById[id].name; }
  function personPos(id) {
    var q = world.personById[id]; if (!q) { return null; }
    if (q.fixed) { return q; }
    var a = view.amb[id]; return a ? { x: a.o.pos[0], z: a.o.pos[2] } : null;
  }
  function hasTrade(id) {
    var def = G.npcs[id];
    return !!(def && world.personById[id].fixed && def.services.some(function (s) { return /^(shop|sell|buy|heal)$/.test(s.type); }));
  }
  // o que a pessoa diz com a vila em armas: quem luta ameaça, quem não luta tem medo
  function angry(id) { var P = persona(id), A = G.aldeoes.textos; return sim.papel(id).luta ? P.hostil || A.hostil : P.medo || A.medo; }
  // tem missão ou conversa nova para dar ('!') ou missão pronta para entregar ('?')
  function pending(id) {
    var def = G.npcs[id], dlg = def && def.dialogue && G.dialogues[def.dialogue], q = def && sim.npcQuest(st, id);
    if (dlg && !st.flags[dlg.flag]) { return '!'; }
    return q && q.state === 'available' ? '!' : q && q.state === 'ready' ? '?' : '';
  }
  function openPerson(id) {
    show('w-npc'); npcOpen = id;
    if (!world.personById[id].fixed) { view.segura(id); } // quem anda para e espera a conversa acabar
    $('npc-name').textContent = personName(id);
    personMenu(id);
  }
  function personMenu(id, said) {
    $('npc-acts').innerHTML = ''; sellShown = null; $('npc-res').textContent = '';
    var mk = st.hostil ? '' : pending(id), opts = [];
    opts.push({ text: 'Conversar' + (mk === '!' ? ' (!)' : mk === '?' ? ' (?)' : ''), fn: function () { if (st.hostil) { personMenu(id, angry(id)); } else { talk(id); } } });
    if (hasTrade(id)) { opts.push({ text: 'Negociar', fn: function () { negotiate(id); } }); }
    opts.push({ text: 'Fechar', fn: hide });
    setTalk(said || (st.hostil ? angry(id) : alterna('ola:' + id, persona(id).ola, (G.npcs[id] && G.npcs[id].idle) || 'Bom dia.')), opts);
  }
  function backTo(id) { return { text: 'Voltar', fn: function () { personMenu(id); } }; }
  // Negociar: a loja e os serviços de sempre, abaixo da fala; com a vila em armas, ninguém vende nada
  function negotiate(id) {
    var def = G.npcs[id];
    if (st.hostil) { setTalk(persona(id).recusa || G.aldeoes.textos.recusa, [backTo(id)]); return; }
    setTalk(def.idle || alterna('ola:' + id, persona(id).ola), [backTo(id)]);
    renderNpcActs(id);
  }
  // assuntos: cada pergunta tira uma das respostas, e as perguntas continuam ali
  function topics(id, text) {
    var T = persona(id).temas || [];
    setTalk(text, T.map(function (t, i) { return { text: t.p, fn: function () { topics(id, alterna('tema:' + id + ':' + i, t.r)); } }; }).concat([backTo(id)]));
  }
  // marca a pessoa como alvo: o golpe sai sozinho quando ela estiver ao alcance (como com os bichos)
  function target(id) {
    var p = st.player, pos = personPos(id);
    if (sim.takeControl(st)) { toast('Macro pausada.'); }
    p.goto = null; p.action = { type: 'luta', id: id };
    if (pos && calc.dist(p.x, p.z, pos.x, pos.z) > calc.stats(world, p).reach) { toast('Alvo: ' + personName(id) + '. Aproxime-se para atacar.'); }
  }
  // Conversar: primeiro a conversa marcada (Anselmo), depois a missão, e por fim os assuntos de cada um
  function talk(id, said) {
    var def = G.npcs[id], dlg = def && def.dialogue && G.dialogues[def.dialogue];
    if (def && def.daily) { dailyTalk(id); renderNpcActs(id); return; }
    $('npc-acts').innerHTML = ''; sellShown = null;
    if (dlg && !st.flags[dlg.flag]) { dialogueNode(id, dlg, dlg.start); return; }
    var q = def && sim.npcQuest(st, id), back = backTo(id);
    if (said) { setTalk(said, [back]); }
    else if (q && q.state === 'available') {
      var Q = G.quests[q.id];
      setTalk(Q.offer, [
        { text: 'Aceitar: ' + Q.title, fn: function () { sim.acceptQuest(st, q.id); handleEvents(); save(); talk(id, Q.active); } },
        { text: 'Agora não', fn: function () { personMenu(id); } }
      ]);
    } else if (q && q.state === 'ready') {
      var R = G.quests[q.id];
      setTalk(R.active, [{ text: 'Entregar ' + objText(q.id, true), cls: 'main', fn: function () {
        sim.turnInQuest(st, q.id); handleEvents(); save(); talk(id, R.done + rewardText(R));
      } }, back], progText(q.id));
    } else if (q && q.state === 'active') {
      setTalk(G.quests[q.id].active, [back], progText(q.id));
    } else { topics(id, (def && def.after) || alterna('ola:' + id, persona(id).ola, (def && def.idle) || '')); }
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
    if (r.xp) { parts.push(Math.round(r.xp * calc.stats(world, st.player).xp) + ' de experiência'); }
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
    if (!st) { return; }
    var html = [], cm = camp.missao();
    if (cm) { html.push('<li class="active camp">' + esc(cm.t) + (cm.p ? '<br><small>' + esc(cm.p) + '</small>' : '') + '</li>'); }
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
    mark('camp:carroca', '', 0, 0, 0); // campanha: a carroça ganha '!' quando é hora de levar o trigo
    camp.marcas().forEach(function (m) { mark(m.id, m.sym, m.x, m.y, m.z); });
    var qd = dailyBoard();
    mark(qd.id, dailyOpen() ? '!' : '', qd.x, 2.75, qd.z);
    // quem está dentro de uma sala: com o jogador fora, a marca fica acima da porta (várias na mesma porta, lado a lado)
    var aqui = world.salaEm(st.player.x, st.player.z), naPorta = {};
    world.npcs.forEach(function (n) {
      var def = G.npcs[n.id], dlg = def.dialogue && G.dialogues[def.dialogue], q = sim.npcQuest(st, n.id), sym = '';
      if (sim.isKo(st, n.id)) { mark(n.id, '', n.x, 2.25, n.z); return; } // morto não dá missão
      if (dlg && !st.flags[dlg.flag]) { sym = '!'; }
      else if (q && q.state === 'available') { sym = '!'; }
      else if (q && q.state === 'ready') { sym = '?'; }
      var S = world.salaDe(n.x, n.z);
      if (S && sym && S.id !== aqui) {
        var k = naPorta[S.id] = (naPorta[S.id] || 0) + 1, lx = (k - 1) * 0.5 * (k % 2 ? 1 : -1), pt = S.mundo(lx, S.b.d / 2 + 0.15);
        mark(n.id, sym, pt.x, S.I.porta[1] + 0.55, pt.z); return;
      }
      mark(n.id, sym, n.x, 2.25, n.z);
    });
  }
  function renderNpcActs(id) {
    var def = G.npcs[id], box = $('npc-acts'), p = st.player; box.innerHTML = ''; sellShown = null;
    def.services.forEach(function (s) {
      if (s.type === 'sell') { box.appendChild(sellBox(id, s)); return; }
      if (s.type === 'deliver') { if (sim.dailyActive(st).length) { box.appendChild(sellBox(id, s)); } return; }
      if (s.type === 'shop') { box.appendChild(shopBox(id, s)); return; }
      var b = document.createElement('button'); b.type = 'button';
      if (s.type === 'heal') { b.textContent = 'Pedir cura (grátis)'; }
      if (s.type === 'buy') { b.textContent = 'Comprar ' + G.items[s.item].name.toLowerCase() + ' (' + coins(calc.buyPrice(world, p, s.item)) + ')'; }
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
  // armas e roupas: o mesmo traço, montado por função para as variações de metal e couro não repetirem o desenho
  var K = 'stroke="#2b1709"';
  function iSword(blade, edge, guard, glint) {
    return '<g transform="rotate(45 24 24)"><path d="M22.2 3.5 L24 0.8 L25.8 3.5 V30.5 H22.2 Z" fill="' + blade + '" ' + K + ' stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M24 4.5 V29.5" stroke="' + edge + '" stroke-width="0.9"/>' + (glint ? '<path d="M23 7 V14 M25 18 V24" stroke="' + glint + '" stroke-width="0.9" stroke-linecap="round"/>' : '') +
      '<rect x="15" y="30.5" width="18" height="3.6" rx="1.4" fill="' + guard + '" ' + K + ' stroke-width="1.3"/>' +
      '<rect x="22.2" y="34.1" width="3.6" height="8.4" fill="#5a341a" ' + K + ' stroke-width="1.2"/><circle cx="24" cy="44.6" r="2.6" fill="' + guard + '" ' + K + ' stroke-width="1.3"/></g>';
  }
  function iAxe(head, two, big) {
    var h = big ? 'M25.6 6 C32 5 40 9 41 22 C36 19 30 18.5 25.6 20.5 Z' : 'M25.6 8 H30.5 C35.5 9 37.5 14 37 20.5 C33 18.5 29 18.5 25.6 19.5 Z';
    var m = big ? 'M22.4 6 C16 5 8 9 7 22 C12 19 18 18.5 22.4 20.5 Z' : 'M22.4 8 H17.5 C12.5 9 10.5 14 11 20.5 C15 18.5 19 18.5 22.4 19.5 Z';
    return '<g transform="rotate(35 24 24)"><rect x="22.4" y="4" width="3.2" height="41" rx="1.3" fill="#8a5428" ' + K + ' stroke-width="1.6"/>' +
      '<path d="M23.2 30 V43" stroke="#c78d4e" stroke-width="0.9"/>' +
      '<path d="' + h + '" fill="' + head + '" ' + K + ' stroke-width="1.8" stroke-linejoin="round"/>' + (two ? '<path d="' + m + '" fill="' + head + '" ' + K + ' stroke-width="1.8" stroke-linejoin="round"/>' : '') +
      '<rect x="21.4" y="7" width="5.2" height="12" rx="1" fill="#6d655c" ' + K + ' stroke-width="1.4"/>' + (big ? '<path d="M24 7 L24 1.5" ' + K + ' stroke-width="3" stroke-linecap="round"/><path d="M24 6.5 L24 2" stroke="#b9b4aa" stroke-width="1.3" stroke-linecap="round"/>' : '') + '</g>';
  }
  function iBow(long) {
    var arc = long ? 'M15 3 C33 13 33 35 15 45' : 'M16 9 C29 13 31 21 27 24 C31 27 29 35 16 39';
    var top = long ? [15, 3] : [16, 9], bot = long ? [15, 45] : [16, 39];
    return '<path d="' + arc + '" fill="none" ' + K + ' stroke-width="5.4" stroke-linecap="round"/><path d="' + arc + '" fill="none" stroke="' + (long ? '#b07a3e' : '#8a5428') + '" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M' + top[0] + ' ' + top[1] + ' L' + bot[0] + ' ' + bot[1] + '" stroke="#efe5cf" stroke-width="1.2"/>' +
      '<rect x="' + (long ? 26.4 : 26) + '" y="20.5" width="4" height="7" rx="1" fill="#5a341a" ' + K + ' stroke-width="1.2"/>';
  }
  function iTorso(cloth, line, belt) {
    return '<path d="M14 8 L20 5.5 C22 8.5 26 8.5 28 5.5 L34 8 L42.5 18.5 L37 23 L34 19.5 V42.5 H14 V19.5 L11 23 L5.5 18.5 Z" fill="' + cloth + '" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
      (belt ? '<rect x="14" y="30" width="20" height="4" fill="#5a341a" ' + K + ' stroke-width="1.3"/><rect x="22" y="29.5" width="4.4" height="5" fill="none" stroke="#d9b45a" stroke-width="1.3"/>'
        : '<path d="M19 12 V41 M24 10 V41 M29 12 V41 M14 22 H34 M14 31 H34" stroke="' + line + '" stroke-width="1.1"/>') +
      '<path d="M20 5.5 C22 8.5 26 8.5 28 5.5" fill="none" stroke="' + line + '" stroke-width="1.4"/>';
  }
  function iLegs(cloth, line, laced) {
    return '<path d="M13.5 6 H34.5 L37 42.5 H27.5 L24 17 L20.5 42.5 H11 Z" fill="' + cloth + '" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M13.6 10 H34.4" stroke="' + line + '" stroke-width="1.6"/>' +
      (laced ? '<path d="M14.5 22 L19 26 M19 22 L14.5 26 M14 31 L18.5 35 M18.5 31 L14 35 M29.5 22 L34 26 M34 22 L29.5 26 M30 31 L34.5 35 M34.5 31 L30 35" stroke="#e0c49a" stroke-width="1.1"/>'
        : '<path d="M17 14 L15.5 40 M31 14 L32.5 40" stroke="' + line + '" stroke-width="1" stroke-dasharray="2 2"/>');
  }
  function iGlove(cloth, line, fingers) {
    return '<path d="M15 43 V36 L13.5 21 C13 17 17 16.5 17.5 20 L18 13 C18 9.5 22 9.5 22 13 L22.4 11 C22.5 7.5 26.5 7.5 26.6 11 L27 13 C27.2 9.8 31 10 31 13.5 V25 L35.5 20.5 C37.8 18.4 41 21 39 23.6 L33 33 V43 Z" fill="' + cloth + '" ' + K + ' stroke-width="2.1" stroke-linejoin="round"/>' +
      '<rect x="14.2" y="36" width="19.6" height="7" fill="' + line + '" ' + K + ' stroke-width="1.6"/>' +
      (fingers ? '<path d="M17.8 20 V27 M22.2 13 V26 M26.8 13 V26" stroke="#5a341a" stroke-width="1.1"/>' : '<path d="M16 39.5 H32" stroke="#efe5cf" stroke-width="1" stroke-dasharray="1.6 1.6"/>');
  }
  var WOOL = '#a99a7a', WOOL2 = '#6e6250', LEATHER = '#8a5428', LEATHER2 = '#5a341a';
  ITEM_ICONS.espada_ferro = iSword('#b9b4aa', '#77726a', '#6d655c');
  ITEM_ICONS.espada_aco = iSword('#e7e2d4', '#9c958a', '#c99a3b', '#ffffff');
  ITEM_ICONS.espada_ostanita = iSword('#8fb8d6', '#3f6f95', '#d9b45a', '#e6f4ff');
  ITEM_ICONS.machado_trabalho = iAxe('#9a948a', false, false);
  ITEM_ICONS.machado_guerra = iAxe('#d6d1c4', false, true);
  ITEM_ICONS.machado_duas_faces = iAxe('#d6d1c4', true, true);
  ITEM_ICONS.arco_curto = iBow(false);
  ITEM_ICONS.arco_longo = iBow(true);
  ITEM_ICONS.flecha = [[-6, 0], [0, 0], [6, 0]].map(function (o) {
    return '<g transform="translate(' + o[0] + ' ' + o[1] + ') rotate(40 24 24)"><path d="M24 9 V42" ' + K + ' stroke-width="3"/><path d="M24 9 V42" stroke="#c78d4e" stroke-width="1.4"/>' +
      '<path d="M24 3 L27 10 H21 Z" fill="#b9b4aa" ' + K + ' stroke-width="1.2" stroke-linejoin="round"/><path d="M24 35 L20.5 41 V45 L24 41.5 L27.5 45 V41 Z" fill="#efe5cf" ' + K + ' stroke-width="1.1" stroke-linejoin="round"/></g>';
  }).join('');
  ITEM_ICONS.capuz_la = '<path d="M9 43 C8 25 13 7 24 7 C35 7 40 25 39 43 Z" fill="' + WOOL + '" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M16.5 31 C16 20 19 14.5 24 14.5 C29 14.5 32 20 31.5 31 C27.5 34 20.5 34 16.5 31 Z" fill="#3b2414" opacity=".8"/><path d="M12 38 C18 41 30 41 36 38" fill="none" stroke="' + WOOL2 + '" stroke-width="1.3" stroke-dasharray="2 2"/>';
  ITEM_ICONS.coifa_couro = '<path d="M11 30 C10.5 15 16.5 8 24 8 C31.5 8 37.5 15 37 30 L35 40 H29.5 V28 H18.5 V40 H13 Z" fill="' + LEATHER + '" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M24 8.5 V27.5 M12 20 C18 17 30 17 36 20" fill="none" stroke="#c78d4e" stroke-width="1.2" stroke-dasharray="2 2"/><path d="M18.5 28 H29.5" stroke="' + LEATHER2 + '" stroke-width="1.4"/>';
  ITEM_ICONS.gambeson = iTorso('#d8c9a0', '#9c8a64', false);
  ITEM_ICONS.tunica_couro = iTorso(LEATHER, '#c78d4e', true);
  ITEM_ICONS.sapatos_couro = '<path d="M7 35 C7 30.5 11 28.5 15.5 28.5 L22 26 C26 30 32 32 38 33 C43 34 43 41 38.5 41 H10 C7.5 41 7 38 7 35 Z" fill="' + LEATHER + '" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M7.5 37.5 H42" stroke="' + LEATHER2 + '" stroke-width="1.6"/><path d="M17 29 L20 32 M20 28 L23 31" stroke="#e0c49a" stroke-width="1.1"/>';
  ITEM_ICONS.botas_cano_alto = '<path d="M15 5 H29 V30 C33 31 39 32 41 36 C42.5 40 40 42.5 37 42.5 H15 Z" fill="#6e4424" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M14.5 5 H29.5 V11 H14.5 Z" fill="' + LEATHER + '" ' + K + ' stroke-width="1.6"/><path d="M15.2 39 H41.5" stroke="' + LEATHER2 + '" stroke-width="1.6"/><path d="M19 14 V28 M25 14 V29" stroke="#c78d4e" stroke-width="1" stroke-dasharray="2 2"/>';
  ITEM_ICONS.calcas_la = iLegs(WOOL, WOOL2, false);
  ITEM_ICONS.perneiras_couro = iLegs(LEATHER, LEATHER2, true);
  ITEM_ICONS.luvas_la = iGlove(WOOL, WOOL2, false);
  ITEM_ICONS.luvas_couro = iGlove(LEATHER, LEATHER2, true);
  // do mato, do curral e da lavoura
  function iPelt(cloth, line, marks) {
    return '<path d="M16 7 L20 13 H28 L32 7 L35 15 C35 20 37 23 41 25 L36 29 C36 34 37 37 40 41 L31 39 L24 43 L17 39 L8 41 C11 37 12 34 12 29 L7 25 C11 23 13 20 13 15 Z" fill="' + cloth + '" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M24 16 V37" stroke="' + line + '" stroke-width="1.4" stroke-dasharray="3 2"/>' + marks;
  }
  ITEM_ICONS.pele_lobo = iPelt('#7f7b74', '#4a4640', '<path d="M17 21 L20 24 M31 21 L28 24 M16 31 L20 29 M32 31 L28 29 M19 15 L22 18 M29 15 L26 18" stroke="#c9c4b8" stroke-width="1.5" stroke-linecap="round"/>');
  ITEM_ICONS.couro_veado = iPelt('#c08850', '#7a5430', '<g fill="#f2e4c4"><circle cx="18" cy="22" r="1.6"/><circle cx="30" cy="22" r="1.6"/><circle cx="19" cy="30" r="1.4"/><circle cx="29" cy="30" r="1.4"/><circle cx="24" cy="40" r="1.2"/></g>');
  ITEM_ICONS.pele_serpente = '<path d="M7 38 C13 28 21 41 27 32 C33 23 39 31 42 19" fill="none" ' + K + ' stroke-width="9" stroke-linecap="round"/><path d="M7 38 C13 28 21 41 27 32 C33 23 39 31 42 19" fill="none" stroke="#7a8a3c" stroke-width="5.4" stroke-linecap="round"/>' +
    '<path d="M7 38 C13 28 21 41 27 32 C33 23 39 31 42 19" fill="none" stroke="#d6c860" stroke-width="2" stroke-dasharray="1.6 3"/>';
  // troll: o couro verde-acinzentado com os calombos de pedra do desenho; a presa curva, cor de osso
  ITEM_ICONS.couro_troll = iPelt('#5a6446', '#2e3426', '<g fill="#9b958b" stroke="#45423b" stroke-width="1.2"><circle cx="18" cy="20" r="2.6"/><circle cx="30" cy="21" r="2.3"/><circle cx="24" cy="27" r="2"/><circle cx="17" cy="33" r="2.2"/><circle cx="31" cy="33" r="2.5"/></g>' +
    '<g fill="#55514b"><circle cx="18" cy="20" r="0.9"/><circle cx="30" cy="21" r="0.8"/><circle cx="17" cy="33" r="0.8"/><circle cx="31" cy="33" r="0.9"/></g>');
  ITEM_ICONS.presa_troll = '<path d="M14 42 C10 30 12 18 22 10 C27 6 34 5 39 8 C33 10 28 14 26 20 C24 27 25 34 24 42 Z" fill="#e4d8b8" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M13 41 H25" stroke="#8a6a44" stroke-width="3" stroke-linecap="round"/><path d="M17 33 C16 26 18 19 24 14" fill="none" stroke="#fff6dc" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M21 36 L23 35 M20 29 L22.5 28.5" stroke="#a89c7e" stroke-width="1.2"/>';
  ITEM_ICONS.carne_veado ='<path d="M8 26 C8 15 20 9 30 11 C40 13 43 22 39 30 C35 38 22 41 14 37 C10 35 8 31 8 26 Z" fill="#8a2c22" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M12 25 C13 19 20 14 29 15" fill="none" stroke="#e8c8a8" stroke-width="2.2" stroke-linecap="round"/><path d="M17 33 C24 35 32 32 35 27" fill="none" stroke="#c45a46" stroke-width="1.4" stroke-linecap="round"/><circle cx="27" cy="25" r="3.6" fill="#efe5cf" ' + K + ' stroke-width="1.4"/>';
  ITEM_ICONS.ferrao = '<path d="M13 41 C9 29 15 15 29 10 C33 9 37 10 40 6 C41 13 37 18 31 19 C22 22 19 30 21 41 Z" fill="#6a3a22" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M14 33 L20 32 M14.5 26 L21 27 M18 19 L23 22" stroke="#2b1709" stroke-width="1.3"/><path d="M33 13 C35 12.5 37 11.5 38.5 9.5" fill="none" stroke="#e0b070" stroke-width="1.4" stroke-linecap="round"/>';
  ITEM_ICONS.veneno = '<path d="M24 6 C30 16 36 22 36 30 C36 37 30 42 24 42 C18 42 12 37 12 30 C12 22 18 16 24 6 Z" fill="#6aa040" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M18 30 C18 25 20 21 22.5 18" fill="none" stroke="#d8f0a0" stroke-width="2" stroke-linecap="round"/><circle cx="28" cy="33" r="2.2" fill="#3e6a22"/><circle cx="22" cy="36" r="1.4" fill="#3e6a22"/>';
  ITEM_ICONS.leite = '<path d="M36 19 C43 19 43 31 35.5 32" fill="none" ' + K + ' stroke-width="2.6"/><path d="M17 8 H31 L30 14 C36 18 38 26 36 34 C35 40 31 43 24 43 C17 43 13 40 12 34 C10 26 12 18 18 14 Z" fill="#b8784a" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
    '<ellipse cx="24" cy="9.5" rx="7" ry="2.4" fill="#fbf6ea" ' + K + ' stroke-width="1.4"/><path d="M13.5 24 H34.5" stroke="#7a4a28" stroke-width="1.4"/><path d="M16 30 C16 34 18 38 21 39" fill="none" stroke="#e0b088" stroke-width="1.6" stroke-linecap="round"/>';
  ITEM_ICONS.la = '<g fill="#efe6d2" ' + K + ' stroke-width="2"><circle cx="16" cy="29" r="8"/><circle cx="32" cy="29" r="8"/><circle cx="24" cy="20" r="9.5"/><circle cx="24" cy="33" r="8.5"/></g>' +
    '<path d="M19 19 C21 16 25 16 27 19 M13 29 C15 26 18 27 18.5 29.5 M29 29 C31 26 34 27 34.5 29.5 M21 34 C23 31 26 31 27 34" fill="none" stroke="#b0a488" stroke-width="1.4" stroke-linecap="round"/>';
  ITEM_ICONS.trigo = '<path d="M24 44 V17 M24 44 L16 19 M24 44 L32 19" ' + K + ' stroke-width="4" stroke-linecap="round"/><path d="M24 44 V17 M24 44 L16 19 M24 44 L32 19" stroke="#d8b050" stroke-width="1.8" stroke-linecap="round"/>' +
    [[24, 10, 0], [15, 13, -18], [33, 13, 18]].map(function (e) { return '<ellipse cx="' + e[0] + '" cy="' + e[1] + '" rx="3.4" ry="7.5" transform="rotate(' + e[2] + ' ' + e[0] + ' ' + e[1] + ')" fill="#e8c060" ' + K + ' stroke-width="1.6"/><path d="M' + e[0] + ' ' + (e[1] - 5) + ' V' + (e[1] + 5) + '" transform="rotate(' + e[2] + ' ' + e[0] + ' ' + e[1] + ')" stroke="#a8781c" stroke-width="1"/>'; }).join('') +
    '<rect x="18.5" y="31" width="11" height="4" rx="1" fill="#8a5428" ' + K + ' stroke-width="1.3"/>';
  ITEM_ICONS.cebola = '<path d="M22 13 C21 8 22 5 24 2.5 C26 5 27 8 26 13" fill="#7a9a40" ' + K + ' stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M24 12 C33 18 39 25 38 32 C37 39 31 42 24 42 C17 42 11 39 10 32 C9 25 15 18 24 12 Z" fill="#c8843a" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M24 15 C18 22 17 34 21 41 M24 15 C30 22 31 34 27 41" fill="none" stroke="#8a5420" stroke-width="1.2"/><path d="M15 27 C16 23 18 21 20 19" fill="none" stroke="#f0c890" stroke-width="1.6" stroke-linecap="round"/><path d="M21 42 L19 46 M24 42 V46.5 M27 42 L29 46" ' + K + ' stroke-width="1.2"/>';
  ITEM_ICONS.nabo = '<path d="M24 19 C18 13 13 7 15 3 C20 4 23 10 24 19 C25 10 28 4 33 3 C35 7 30 13 24 19 Z" fill="#5a8a3a" ' + K + ' stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M24 18 C33 18 39 24 38 31 C37 37 30 40 24 46 C18 40 11 37 10 31 C9 24 15 18 24 18 Z" fill="#efe5dc"/><path d="M10.5 28 C11 21 17 18 24 18 C31 18 37 21 37.5 28 C30 25 18 25 10.5 28 Z" fill="#9a4a8a"/>' +
    '<path d="M24 18 C33 18 39 24 38 31 C37 37 30 40 24 46 C18 40 11 37 10 31 C9 24 15 18 24 18 Z" fill="none" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/><path d="M16 32 C17 35 19 37 21 38" fill="none" stroke="#c9b8b0" stroke-width="1.4" stroke-linecap="round"/>';
  ITEM_ICONS.alho_poro = '<g transform="rotate(35 24 24)"><path d="M20 18 L16 2 L21.5 6 L24 0 L26.5 6 L32 2 L28 18 Z" fill="#5a8a50" ' + K + ' stroke-width="1.6" stroke-linejoin="round"/>' +
    '<rect x="20" y="16" width="8" height="28" rx="3" fill="#efeee0" ' + K + ' stroke-width="2"/><rect x="21.2" y="17.5" width="5.6" height="6" fill="#c8dca0"/><path d="M21 44 L19 47.5 M24 44 V48 M27 44 L29 47.5" ' + K + ' stroke-width="1.2"/></g>';
  ITEM_ICONS.balde = '<path d="M10 16 C10 3 38 3 38 16" fill="none" ' + K + ' stroke-width="2.4"/><path d="M10 16 H38 L34.5 43 H13.5 Z" fill="#9a6232" ' + K + ' stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M18 17 L19 42 M24 17 V42 M30 17 L29 42" stroke="#6a4020" stroke-width="1.1"/><path d="M11 23 H37 M12.8 36 H35.2" stroke="#5f5148" stroke-width="2.6"/><ellipse cx="24" cy="16" rx="14" ry="3" fill="#5a341a" ' + K + ' stroke-width="1.6"/>';
  ITEM_ICONS.tesoura = '<path d="M17 30 C11 34 13 44 24 44 C35 44 37 34 31 30" fill="none" ' + K + ' stroke-width="5"/><path d="M17 30 C11 34 13 44 24 44 C35 44 37 34 31 30" fill="none" stroke="#9c958a" stroke-width="2.4"/>' +
    '<path d="M14.5 30 L17.5 3 L23.5 6.5 L22 30.5 Z" fill="#d6d1c4" ' + K + ' stroke-width="1.6" stroke-linejoin="round"/><path d="M33.5 30 L30.5 3 L24.5 6.5 L26 30.5 Z" fill="#d6d1c4" ' + K + ' stroke-width="1.6" stroke-linejoin="round"/>' +
    '<rect x="15.5" y="24" width="6.5" height="7" rx="1" fill="#8a5428" ' + K + ' stroke-width="1.2"/><rect x="26" y="24" width="6.5" height="7" rx="1" fill="#8a5428" ' + K + ' stroke-width="1.2"/>';
  // casas vazias sem item no jogo ainda (anel e colar): o contorno, para a casa não parecer quebrada
  ITEM_ICONS._anel = '<ellipse cx="24" cy="28" rx="12" ry="11" fill="none" ' + K + ' stroke-width="5"/><ellipse cx="24" cy="28" rx="12" ry="11" fill="none" stroke="#c99a3b" stroke-width="2.6"/><path d="M19 15 L24 8 L29 15 L24 19 Z" fill="#8fb8d6" ' + K + ' stroke-width="1.5" stroke-linejoin="round"/>';
  ITEM_ICONS._colar = '<path d="M9 7 C9 25 17 31 24 31 C31 31 39 25 39 7" fill="none" ' + K + ' stroke-width="3.6"/><path d="M9 7 C9 25 17 31 24 31 C31 31 39 25 39 7" fill="none" stroke="#c99a3b" stroke-width="1.6" stroke-dasharray="2.4 1.6"/>' +
    '<path d="M24 30 L30 37 L24 45 L18 37 Z" fill="#7d1e16" ' + K + ' stroke-width="1.8" stroke-linejoin="round"/><path d="M24 33 L27 37 L24 41" fill="none" stroke="#e39a84" stroke-width="1"/>';
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
      // armas e roupas que ele recompra entram numa palavra só, senão a lista não acaba
      var raw = items.filter(function (k) { return !G.items[k].slot; }), gear = raw.length < items.length;
      h.textContent = (deliver ? 'Você não tem o material pedido. Falta: ' : 'Você não tem nada que se venda aqui. Compra: ') + raw.map(function (k) { return (G.items[k].plural || G.items[k].name).toLowerCase(); }).join(', ') +
        (gear ? (raw.length ? ' e ' : '') + 'o que ele mesmo vende, usado' : '') + '.';
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
      '<div class="sell-id"><span class="ic">' + itemIcon(k) + '</span><span class="nm"><b>' + esc(it.name) + '</b><small>' + (deliver ? 'Faltam ' + sim.dailyNeed(st, k) : coins(calc.sellPrice(world, st.player, k, 1)) + ' cada') + '</small></span>' +
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
    var P = sellPop, can = boardMax(P.s, P.k), price = function (n) { return calc.sellPrice(world, st.player, P.k, n); };
    var v = P.blank ? '' : String(P.n);
    if (P.num.value !== v) { P.num.value = v; }
    P.range.value = P.n;
    P.range.style.setProperty('--p', (can > 1 ? (P.n - 1) / (can - 1) * 100 : 100) + '%');
    P.ok.disabled = P.blank;
    P.ok.textContent = P.blank ? 'Escolha a quantidade' : P.s.type === 'deliver' ? 'Colocar ' + P.n + ' no baú' : 'Vender ' + P.n + ' por ' + price(P.n);
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
    if (ref.type === 'camp') { return view.atores[ref.id].nome; } // figuras da campanha
    if (ref.type === 'npc' || ref.type === 'gente') { return personName(ref.id); }
    if (ref.type === 'amb') { return view.amb[ref.id].name; }
    if (ref.type === 'mob') { var mb = sim.mobById(st, ref.id); return G.monsters[mb ? mb.kind : 'coelho'].name; }
    if (ref.type === 'farm') {
      var F = G.farm[sim.farmKind(ref.id)], left = sim.farmLeft(st, ref.id);
      return F.name + ' (' + (left > 0 ? 'volta em ' + calc.fmtLeft(left) : F.ready) + ')';
    }
    if (ref.type === 'prop') { return propById(ref.id).name; }
    var n = world.nodeById[ref.id], def = G.nodes[n.kind], ns = st.nodes[n.id];
    return def.name + (ns.alive ? '' : ' (volta em ' + Math.ceil(ns.left) + ' s)');
  }
  function propById(id) { return world.props.filter(function (o) { return o.id === id; })[0]; }
  function refPos(ref) {
    if (ref.type === 'camp') { var co = view.atores[ref.id].o; return { x: co.pos[0], z: co.pos[2] }; }
    if (ref.type === 'amb' || ref.type === 'farm') { var o = view.amb[ref.id].o; return { x: o.pos[0], z: o.pos[2] }; }
    if (ref.type === 'npc' || ref.type === 'gente') { return personPos(ref.id); }
    if (ref.type === 'mob') { return sim.mobById(st, ref.id); }
    if (ref.type === 'prop') { return propById(ref.id); }
    return calc.nodePoint(world.nodeById[ref.id], st.player.x, st.player.z); // plantação: a borda mais perto do retalho
  }
  function interact(ref) {
    if (camp.trava() || openWin === 'w-cena') { return; }
    var p = st.player, pos = refPos(ref), d = calc.dist(p.x, p.z, pos.x, pos.z);
    if (ref.type === 'camp') { camp.interage(ref.id, d); return; }
    if (ref.type === 'npc' || ref.type === 'gente') {
      var nm = personName(ref.id);
      if (sim.isKo(st, ref.id)) { toast(G.aldeoes.textos.desacordado.replace('{alvo}', nm)); return; }
      if (sim.hostileTo(st, ref.id)) { target(ref.id); return; } // quem vem para cima não conversa: o clique é golpe
      var parede = sim.paredeEntre(st, ref.id); if (parede) { toast(parede); return; }
      if (d <= G.settings.interactRange + 0.5) { openPerson(ref.id); } else { toast('Aproxime-se de ' + nm + '.'); }
      return;
    }
    if (ref.type === 'prop') {
      var parede2 = sim.paredeEntre(st, ref.id); if (parede2) { toast(parede2); return; }
      if (d <= G.settings.interactRange + 0.5) { openNpc(pos.npc); } else { toast('Aproxime-se: ' + pos.name + '.'); }
      return;
    }
    if (ref.type === 'node') {
      if (!st.nodes[ref.id].alive) { toast(refName(ref)); return; }
      if (d > G.player.gatherReach) { toast('Chegue mais perto para coletar.'); return; }
      if (sim.takeControl(st)) { toast('Macro pausada.'); }
      p.goto = null; p.action = { type: 'gather', id: ref.id, prog: 0 };
      return;
    }
    if (ref.type === 'mob') {
      if (sim.takeControl(st)) { toast('Macro pausada.'); }
      p.goto = null; p.action = { type: 'attack', id: ref.id };
      if (d > calc.stats(world, p).reach) { toast('Alvo marcado: aproxime-se para atacar.'); }
    }
    if (ref.type === 'farm') {
      var F = G.farm[sim.farmKind(ref.id)];
      if (d > F.range) { toast('Chegue mais perto da ' + F.name.toLowerCase() + '.'); return; }
      toast(sim.farmUse(st, ref.id)); save();
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
    // gente (parada ou andando), menos quem está desacordado
    function people(range) {
      world.people.forEach(function (q) {
        var pos = personPos(q.id); if (!pos || sim.isKo(st, q.id)) { return; }
        consider({ type: q.fixed ? 'npc' : 'gente', id: q.id }, pos.x, pos.z, range);
      });
    }
    people(G.settings.interactRange);
    camp.perto().forEach(function (a) { consider({ type: 'camp', id: a.id }, a.x, a.z, G.campanha.alcance); });
    world.props.forEach(function (o) { consider({ type: 'prop', id: o.id }, o.x, o.z, G.settings.interactRange); });
    world.nodes.forEach(function (n) { if (st.nodes[n.id].alive && !n.rect) { consider({ type: 'node', id: n.id }, n.x, n.z, G.player.gatherReach); } });
    st.mobs.forEach(function (m) { if (m.alive) { consider({ type: 'mob', id: m.id }, m.x, m.z, G.settings.interactRange); } });
    (view.cows || []).forEach(function (v) { consider({ type: 'farm', id: v.id }, v.o.pos[0], v.o.pos[2], G.farm[sim.farmKind(v.id)].range); });
    // plantação: vale estar dentro do retalho ou na beira; perde para o que estiver à frente (pessoa, bicho, árvore)
    if (!best) {
      world.nodes.forEach(function (n) {
        if (!n.rect || !st.nodes[n.id].alive) { return; }
        var dd = calc.nodeDist(n, p.x, p.z) + 1; if (dd - 1 <= G.player.gatherReach && dd < bd) { bd = dd; best = { type: 'node', id: n.id }; }
      });
    }
    if (best) { interact(best); return; }
    // nada ao alcance: diz o que está à frente, mais longe
    people(12);
    world.props.forEach(function (o) { consider({ type: 'prop', id: o.id }, o.x, o.z, 12); });
    world.nodes.forEach(function (n) { if (st.nodes[n.id].alive) { consider({ type: 'node', id: n.id }, n.x, n.z, 12); } });
    st.mobs.forEach(function (m) { if (m.alive) { consider({ type: 'mob', id: m.id }, m.x, m.z, 12); } });
    toast(best ? 'Aproxime-se: ' + refName(best) + ' (' + bd.toFixed(1) + ' m).' : 'Nada ao alcance à sua frente.');
  }

  function cmd(c) {
    if (!st) { return; } // tela inicial: atalhos do jogo desligados
    if (c === 'title') { toTitle(); return; }
    if (c === 'map') { if (openWin === 'w-map') { hide(); } else { openMap(); } }
    else if ((c === 'macro' || c === 'rules') && semMacro()) { return; } // a macro ainda não existe nesta parte da campanha
    else if (c === 'rules') { toggle('w-rules', renderRules); }
    else if (c === 'menu') { toggle('w-menu'); }
    else if (c === 'fullscreen') { toggleFull(); }
    else if (c === 'inv') { openChar('equip'); }
    else if (c === 'bag') { openChar('bag'); }
    else if (c === 'char') { openChar(); }
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
  // celular: tela cheia (sem a barra do navegador, que deixava uma faixa preta) e travado na horizontal. O navegador só deixa
  // pedir isso num toque, então o primeiro toque pede; quem sair da tela cheia pelo Menu não é puxado de volta.
  // O iPhone não deixa travar a tela: em pé aparece o aviso de girar (#gire)
  var fullAuto = true;
  function pedeCheia() {
    var d = document.documentElement, r;
    try { r = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen(); } catch (e) { r = null; }
    return Promise.resolve(r).then(function () {
      if (screen.orientation && screen.orientation.lock) { return screen.orientation.lock('landscape').catch(function () { /* não deixou travar */ }); }
    });
  }
  function celularCheio() { if (isTouch && fullAuto && fullCan() && !fullEl()) { pedeCheia().catch(function () { /* recusou: tenta no próximo toque */ }); } }
  function fullUi() {
    var b = $('btn-full');
    b.textContent = !fullCan() ? 'Tela cheia indisponível neste navegador' : fullEl() ? 'Sair da tela cheia' : 'Tela cheia';
    b.disabled = !fullCan();
  }
  function toggleFull() {
    var d = document.documentElement, r;
    if (fullEl()) { fullAuto = false; r = (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    else { fullAuto = true; r = pedeCheia(); }
    if (r && r.catch) { r.catch(function () { toast('O navegador recusou a tela cheia.'); }); }
  }

  function debug(c) {
    if (c === 'reset') {
      // apaga só o save aberto e pede o nome de novo no mesmo espaço
      var n = slot; hide(); st = null; slot = 0;
      try { localStorage.removeItem(slotKey(n)); } catch (e) { /* nada */ }
      showTitle(); titleNewGame(n); return;
    }
    if (c === 'hurt') { st.player.hp = Math.max(1, st.player.hp - 15); hide(); return; }
    if (c === 'coins') { st.player.inv.moeda = (st.player.inv.moeda || 0) + 50; return; }
    var min = { away30: 30, away240: 240, away600: 600 }[c];
    if (min) { hide(); var now = clockNow(); beginAway(now - min * 60000); endAway(now); }
  }

  // modo desenvolvedor: cliques seguidos no nome do jogo, no título do menu, mostram os testes até recarregar a página
  // O mesmo atalho no nome do jogo da tela inicial: lá ele mostra o Modo livre no jogo novo (a tela inicial só oferece a campanha)
  var DEV_CLICKS = 5, DEV_GAP_MS = 700, devClicks = 0, devLast = 0, devOn = false;
  function devTap(e) {
    if (devOn) { return; }
    if (e.target !== $('dev-tap') && e.target !== $('t-dev-tap')) { devClicks = 0; return; } // clique em outro ponto quebra a sequência
    var now = performance.now();
    devClicks = now - devLast <= DEV_GAP_MS ? devClicks + 1 : 1; devLast = now;
    if (devClicks >= DEV_CLICKS) { ligaDev(); }
  }
  function ligaDev() {
    devOn = true; $('dev-opts').hidden = false; $('new-livre').hidden = false; toast('Modo desenvolvedor ativado.', 3);
    if (titleOn && !$('t-list').hidden) { $('t-msg').textContent = 'Modo desenvolvedor: o Modo livre aparece em Novo jogo.'; $('t-msg').hidden = false; }
  }

  // ---------- entrada ----------
  function bindInput() {
    var cv = $('view');
    window.addEventListener('keydown', function (e) {
      // submenu de venda aberto: Esc fecha só ele e os atalhos do jogo ficam desligados
      if (sellPop || pop) { if (e.code === 'Escape') { if (sellPop) { closeSell(); } else { closePop(); } e.preventDefault(); } return; }
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range') { return; } // as barras (zoom do mapa, volumes) não tiram M e Esc
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
      if (mapNext() === 'macro' && st.hostil) { toast(G.aldeoes.textos.macro, 3); return; }
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
    $('mm-prev').addEventListener('click', function () { mapMenu = false; if (sim.startMacro(st)) { mapArmed = false; hide(); toast('Macro retomada na área anterior.'); } else if (st.hostil) { mapUi(); toast(G.aldeoes.textos.macro, 3); } });
    $('mm-rules').addEventListener('click', function () { mapMenu = false; mapArmed = false; show('w-rules'); renderRules(); });
    $('mm-pause').addEventListener('click', function () { mapMenu = false; pauseMacro(); mapUi(); toast('Macro pausada.'); });
    $('iv-drink').addEventListener('click', function () { drinkPotion(); });
    // janela do personagem: as casas são refeitas quando algo muda, então o clique é apanhado na caixa de fora
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });
    $('eq-grid').addEventListener('click', function (e) { var b = e.target.closest('[data-slot]'); if (b) { openSlot(b.dataset.slot); } });
    $('bg-board').addEventListener('click', function (e) { var b = e.target.closest('[data-item]'); if (b) { openBagItem(b.dataset.item); } });
    $('at-list').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) { return; }
      if (b.dataset.add) { attrStep(b.dataset.add, 1); } else if (b.dataset.sub) { attrStep(b.dataset.sub, -1); }
    });
    $('at-undo').addEventListener('click', function () { attrAdd = {}; renderChar(); $('tab-attr').focus(); });
    $('at-confirm').addEventListener('click', attrConfirm);
    Array.prototype.forEach.call(document.querySelectorAll('[data-stance]'), function (b) { b.addEventListener('click', function () { setStance(b.dataset.stance); }); });

    Array.prototype.forEach.call(document.querySelectorAll('[data-cmd]'), function (b) { b.addEventListener('click', function () { cmd(b.dataset.cmd); b.blur(); }); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', function () { hide(); }); });
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
      // a parte visível da tela inicial: trocar de parte (lista, nome, apagar) recomeça o foco do controle nela
      painel: function () { return !titleOn ? null : titleNew ? $('new-form') : titleDel ? $('t-del') : titleCfg ? $('t-cfg') : $('t-list'); },
      sell: function () { return sellPop ? sellPop.pop : pop ? pop.pop : null; },
      closeSell: function () { if (sellPop) { closeSell(); } else { closePop(); } },
      mapBox: function () { return mapMenu === 'macro' ? $('map-menu') : mapMenu === 'caminhada' ? $('map-walk-menu') : null; },
      mapBoxClose: function () { var b = $(mapMenu === 'macro' ? 'map-macro' : 'map-walk'); mapMenu = false; mapUi(); b.focus(); }, // o foco volta a quem abriu o menu
      mapPan: function (fx, fz) { // fx e fz em frações da janela do mapa
        if (!fx && !fz) { return; }
        var q = world.B * 2 / mapZ; mapCx += fx * q; mapCz += fz * q; mapLimit();
        drawMap($('bigmap'), 560, true);
      },
      mapZoom: function (n) { mapZoomTo(+$('map-zoom').value + n); },
      hide: function () { hide(); }, cmd: cmd, interact: interactFront, quests: toggleQuests, toast: function (t, sec) { toast(t, sec || 3); },
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
    var pos = refPos(h.ref), d = calc.dist(st.player.x, st.player.z, pos.x, pos.z), who = h.ref.type === 'npc' || h.ref.type === 'gente';
    var g = who && st.hostil && st.gente[h.ref.id], life = h.ref.type === 'mob' ? sim.mobById(st, h.ref.id).hp : g ? g.hp : null;
    el.textContent = refName(h.ref) + (life !== null ? ' · ' + Math.max(0, Math.ceil(life)) + ' de vida' : '') + ' · ' + d.toFixed(1) + ' m';
    el.classList.toggle('hostil', who && sim.hostileTo(st, h.ref.id)); // quem vai lutar aparece em vermelho
    el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px'; el.hidden = false; cv.classList.add('over');
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    view.resize(w, h, G.settings.pixelScale * Math.min(1.5, dpr));
  }
})(window.NZ = window.NZ || {});
