// Romance de Cavalaria · formulário de feedback (feedback.html e as páginas de notícia). Carregue depois de config.js
// Grava na tabela public.feedback do Supabase (config.js → supabaseUrl / supabaseKey; supabase/feedback.sql).
// Numa página de notícia (data-noticia no formulário) a mensagem vai com o título dela na frente: [Notícia: título]
(function () {
  'use strict';
  var f = document.getElementById('fb-form'), m = document.getElementById('fb-msg');
  if (!f || !m) { return; }
  var btn = f.querySelector('button[type=submit]'), noticia = f.getAttribute('data-noticia');
  var S = window.SITE || {}, url = S.supabaseUrl, chave = S.supabaseKey;
  var ESPERA = 30000, ultimo = 0; // um envio a cada 30 s por aba
  function diz(t) { m.hidden = false; m.textContent = t; }
  // com conta entrada, manda o token dela: o feedback fica ligado à conta
  function token() {
    try { var s = JSON.parse(localStorage.getItem('rdc-conta')); return s && s.access_token && s.expires_at * 1000 > Date.now() ? s.access_token : ''; } catch (e) { return ''; }
  }
  // Opinar, num ponto em aberto: começa a mensagem com o assunto
  Array.prototype.forEach.call(document.querySelectorAll('[data-opinar]'), function (b) {
    b.addEventListener('click', function () {
      var t = 'Sobre "' + b.getAttribute('data-opinar') + '": ', v = f.msg.value;
      if (v.indexOf(t) < 0) { f.msg.value = (v.trim() ? v.replace(/\s+$/, '') + '\n\n' : '') + t; }
      f.scrollIntoView({ block: 'center' });
      f.msg.focus(); f.msg.setSelectionRange(f.msg.value.length, f.msg.value.length);
    });
  });
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!url || !chave || !window.fetch) { diz('O envio de feedback ainda está sendo ligado. Volte em breve!'); return; }
    if (Date.now() - ultimo < ESPERA) { diz('Obrigado! Espere alguns segundos antes de mandar outro.'); return; }
    var msg = f.msg.value.trim(), email = f.email.value.trim();
    if (!msg) { diz('Escreva a mensagem antes de enviar.'); return; }
    if (noticia) { msg = '[Notícia: ' + noticia + '] ' + msg; }
    var corpo = { sobre: f.sobre.value, tipo: f.tipo.value, mensagem: msg.slice(0, 4000), email: email || null, navegador: navigator.userAgent.slice(0, 300) };
    var tk = token(), cab = { 'Content-Type': 'application/json', apikey: chave, Prefer: 'return=minimal' };
    if (tk) { cab.Authorization = 'Bearer ' + tk; }
    btn.disabled = true; diz('Enviando…');
    fetch(url.replace(/\/$/, '') + '/rest/v1/feedback', { method: 'POST', headers: cab, body: JSON.stringify(corpo) }).then(function (r) {
      if (!r.ok) { throw new Error(r.status); }
      ultimo = Date.now(); f.msg.value = '';
      diz('Recebemos seu feedback. Muito obrigado!');
    }).catch(function () {
      diz('Não deu para enviar agora. Confira a internet e o e-mail (se preencheu) e tente de novo.');
    }).then(function () { btn.disabled = false; });
  });
})();
