/* Netzach · registro de erros dos jogadores
   Carrega antes de tudo: um erro de código no jogo de alguém vai para a tabela public.erros do Supabase
   (supabase/erros.sql), com a versão, o aparelho e onde aconteceu. Para ler: painel do Supabase → Table Editor → erros.
   No servidor de teste (localhost) não manda nada, só mostra no console; para testar o envio daqui:
   localStorage.setItem('nz-erros-local', '1'). Sem internet ou sem a tabela, nada acontece: o jogo segue.
   NZ.erro(mensagem, onde) registra um erro à mão (num catch, por exemplo). */
(function (NZ) {
  'use strict';
  // o mesmo projeto e a mesma chave pública de js/conta.js (feita para ficar à vista; quem protege é a regra da tabela)
  var URL_SB = 'https://cyzldbitvtknniexqjkp.supabase.co', CHAVE = 'sb_publishable_YK8dhOvCfNAl2aSjuroBwg_gYQ5mm-7';
  var MAX = 5; // por partida: um erro que se repete a cada quadro não vira milhares de linhas
  var vistos = {}, enviados = 0;
  var me = document.currentScript && document.currentScript.src, v = me && /[?&]v=([\w-]+)/.exec(me);
  var VERSAO = (v && v[1]) || 'desconhecida';
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  function manda() { try { return !local || localStorage.getItem('nz-erros-local') === '1'; } catch (e) { return !local; } }
  function corta(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function registra(msg, onde) {
    msg = corta(msg || 'erro sem mensagem', 1000).trim() || 'erro sem mensagem'; onde = onde ? corta(onde, 3000) : null;
    var chave = msg + '|' + (onde || '').split('\n')[0];
    if (vistos[chave] || enviados >= MAX) { return; }
    vistos[chave] = 1;
    if (!manda()) { return; }
    enviados++;
    var corpo = {
      jogo: 'Netzach', versao: VERSAO, mensagem: msg, onde: onde,
      aparelho: document.body && document.body.classList.contains('touch') ? 'celular' : 'pc',
      navegador: corta(navigator.userAgent, 300)
    };
    try {
      fetch(URL_SB + '/rest/v1/erros', {
        method: 'POST', keepalive: true,
        headers: { apikey: CHAVE, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(corpo)
      }).catch(function () { /* sem internet ou sem a tabela: fica só no console */ });
    } catch (e) { /* navegador antigo: nada */ }
  }

  window.addEventListener('error', function (e) {
    if (!e || (!e.message && !e.error)) { return; } // imagem ou arquivo que não carregou: não é erro de código
    var onde = (e.filename ? e.filename.replace(location.origin, '') + ':' + e.lineno + ':' + e.colno : '') +
      (e.error && e.error.stack ? '\n' + e.error.stack : '');
    registra(e.message || String(e.error), onde);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    if (r && r.name === 'AbortError') { return; } // pedido cancelado pelo próprio navegador
    registra('Promessa rejeitada: ' + ((r && r.message) || String(r)), r && r.stack);
  });
  NZ.erro = registra;
})(window.NZ = window.NZ || {});
