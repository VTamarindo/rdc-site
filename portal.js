/* Romance de Cavalaria · o que é igual em todas as páginas do portal: endereços do config.js, menu no celular e login.
   Carregue depois de config.js e netzach/js/conta.js. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }

  // endereços do config.js (os botões que não existirem na página são ignorados)
  var z = window.SITE && window.SITE.netzachUrl;
  if (typeof z === 'string' && z) {
    ['netzach-btn', 'netzach-top'].forEach(function (id) { if ($(id)) { $(id).href = z; } });
  }
  var url = window.SITE && window.SITE.echadUrl;
  if ($('echad-btn') && typeof url === 'string' && /^https:\/\//i.test(url)) {
    var b = $('echad-btn'), a = document.createElement('a');
    a.className = 'btn'; a.href = url; a.rel = 'noopener'; a.textContent = 'Ver no itch.io';
    b.parentNode.replaceChild(a, b);
    if ($('echad-status')) { $('echad-status').textContent = 'No ar'; }
  }

  // menu no celular
  var mb = $('menu-btn'), nav = $('nav');
  if (mb && nav) {
    mb.addEventListener('click', function () {
      var abre = !nav.classList.contains('aberto');
      nav.classList.toggle('aberto', abre); mb.setAttribute('aria-expanded', abre);
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) { nav.classList.remove('aberto'); mb.setAttribute('aria-expanded', 'false'); }
    });
  }

  // login: abre a caixa; o formulário vem de Conta.painel quando o Supabase estiver ligado
  var lb = $('login-btn'), caixa = $('login-caixa');
  if (!lb || !caixa) { return; }
  var C = window.Conta, ligada = !!(C && C.ligada && C.ligada());
  function abre(sim) { caixa.hidden = !sim; lb.setAttribute('aria-expanded', sim); }
  lb.addEventListener('click', function (e) { e.stopPropagation(); abre(caixa.hidden); });
  document.addEventListener('click', function (e) { if (!caixa.hidden && !e.target.closest('.login')) { abre(false); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { abre(false); } });
  if (!ligada) { return; }
  $('login-breve').hidden = true;
  C.painel($('conta-portal'), { semConta: 'Entre para guardar seus saves na nuvem.', comConta: 'Conta', direto: true });
  function rotulo(u) { lb.textContent = u ? (u.email.split('@')[0] || 'Conta') : 'Entrar'; lb.title = u ? u.email : ''; }
  rotulo(C.usuario()); C.aoMudar(rotulo);
})();
