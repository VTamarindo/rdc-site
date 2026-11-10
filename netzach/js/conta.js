/* Romance de Cavalaria · conta do site (Supabase): entrar, criar conta, sair e guardar os saves na nuvem.
   Usado pelo portal (index.html da raiz) e pelos jogos. A sessão fica no navegador e vale para o site inteiro.
   Sem internet ou sem o Supabase, nada quebra: os jogos seguem salvando só no navegador. */
(function () {
  'use strict';
  // Projeto do Supabase: Project Settings → API (ou "Connect"). Cole o Project URL e a chave publishable (ou "anon public").
  // Essa chave é feita para ficar no site, à vista: quem protege os saves são as regras da tabela (supabase/conta.sql).
  // NUNCA cole aqui a chave secret / service_role.
  var URL_SB = 'https://cyzldbitvtknniexqjkp.supabase.co';
  var CHAVE = 'sb_publishable_YK8dhOvCfNAl2aSjuroBwg_gYQ5mm-7';
  var LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js';
  var SRI = 'sha384-uteMfOloLDGt042uDz+xHGF3ym63/WQ6rFq7murQRG8Ih7QrXGEGNtWd8688sb4O';
  var STORE = 'rdc-conta'; // chave da sessão no localStorage
  var KEEPALIVE_MAX = 60000; // o navegador só garante envio ao fechar a aba até ~64 KB

  var sb = null, carregou = false, user = null, recup = false, ouvintes = [];
  function sessaoLocal() { try { var s = JSON.parse(localStorage.getItem(STORE)); return s && s.user && s.access_token ? s : null; } catch (e) { return null; } }
  function deSessao(s) { return s && s.user ? { id: s.user.id, email: s.user.email || '' } : null; }
  user = deSessao(sessaoLocal()); // já sabe quem é antes de a biblioteca carregar (e sem internet)

  function avisa() { ouvintes.slice().forEach(function (f) { try { f(user); } catch (e) { /* um ouvinte com erro não para os outros */ } }); }
  function muda(u) {
    var antes = user ? user.id + user.email : '', depois = u ? u.id + u.email : '';
    user = u; if (antes !== depois) { avisa(); }
  }

  var pronto = new Promise(function (ok) {
    if (!URL_SB || !CHAVE) { ok(false); return; }
    var s = document.createElement('script');
    s.src = LIB; s.integrity = SRI; s.crossOrigin = 'anonymous'; s.async = true;
    s.onerror = function () { ok(false); };
    s.onload = function () {
      try {
        sb = window.supabase.createClient(URL_SB, CHAVE, { auth: { storageKey: STORE, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });
      } catch (e) { ok(false); return; }
      carregou = true;
      // dentro deste aviso não se chama o Supabase de novo (a biblioteca trava): só anota
      sb.auth.onAuthStateChange(function (ev, ses) {
        if (ev === 'PASSWORD_RECOVERY') { recup = true; }
        if (ev === 'SIGNED_OUT') { recup = false; muda(null); avisa(); return; }
        if (ses) { muda(deSessao(ses)); if (ev === 'PASSWORD_RECOVERY') { avisa(); } }
      });
      sb.auth.getSession().then(function (r) {
        var ses = r && r.data && r.data.session;
        if (ses) { muda(deSessao(ses)); } else if (!sessaoLocal()) { muda(null); }
        limpaEndereco(); ok(true);
      }, function () { ok(true); });
    };
    document.head.appendChild(s);
  });
  // o link do e-mail (confirmar, trocar senha) volta com a sessão no endereço: a biblioteca lê, aqui só some da barra
  function limpaEndereco() {
    if (/access_token=|error_description=|type=recovery/.test(location.hash) && history.replaceState) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function erroTexto(e) {
    var c = (e && (e.code || e.error_code)) || '', m = (e && e.message) || '';
    if (c === 'invalid_credentials' || /invalid login/i.test(m)) { return 'E-mail ou senha errados.'; }
    if (c === 'user_already_exists' || /already registered/i.test(m)) { return 'Já existe uma conta com esse e-mail. Use Entrar.'; }
    if (c === 'weak_password' || /password should be/i.test(m)) { return 'Senha fraca: use pelo menos 6 caracteres.'; }
    if (c === 'email_not_confirmed') { return 'Confirme o e-mail antes de entrar: veja a sua caixa de entrada.'; }
    if (c === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(m)) { return 'Esse e-mail não parece válido.'; }
    if (c === 'over_email_send_rate_limit' || c === 'over_request_rate_limit' || /rate limit/i.test(m)) { return 'Muitas tentativas agora. Espere um pouco e tente de novo.'; }
    if (c === 'email_address_not_authorized') { return 'O site ainda não consegue mandar e-mail para esse endereço.'; }
    if (c === 'same_password') { return 'A senha nova tem de ser diferente da antiga.'; }
    if (/fetch|network|load failed/i.test(m)) { return 'Sem conexão com o servidor de contas.'; }
    return 'Não deu certo' + (m ? ': ' + m : '.');
  }
  function semLib() { return Promise.resolve({ ok: false, msg: URL_SB ? 'Sem conexão com o servidor de contas.' : 'As contas ainda não foram ligadas neste site.' }); }
  function volta() { return location.origin + location.pathname; }
  function resposta(r, okMsg) { return r.error ? { ok: false, msg: erroTexto(r.error) } : { ok: true, msg: okMsg || '' }; }
  function falhou(e) { return { ok: false, msg: erroTexto(e) }; }

  function entrar(email, senha) {
    if (!sb) { return semLib(); }
    return sb.auth.signInWithPassword({ email: email, password: senha }).then(function (r) { return resposta(r); }, falhou);
  }
  function criar(email, senha) {
    if (!sb) { return semLib(); }
    return sb.auth.signUp({ email: email, password: senha, options: { emailRedirectTo: volta() } }).then(function (r) {
      if (r.error) { return resposta(r); }
      // com "Confirm email" ligado no Supabase, a conta só entra depois do link do e-mail
      if (!r.data.session) { return { ok: true, confirmar: true, msg: 'Conta criada. Abra o link que mandamos para ' + email + ' para ativar.' }; }
      return { ok: true, msg: '' };
    }, falhou);
  }
  function esqueci(email) {
    if (!sb) { return semLib(); }
    return sb.auth.resetPasswordForEmail(email, { redirectTo: volta() }).then(function (r) {
      return resposta(r, 'Se houver conta com esse e-mail, chega um link para criar uma senha nova.');
    }, falhou);
  }
  function novaSenha(senha) {
    if (!sb) { return semLib(); }
    return sb.auth.updateUser({ password: senha }).then(function (r) { if (!r.error) { recup = false; } return resposta(r, 'Senha trocada.'); }, falhou);
  }
  function sair() {
    if (!sb) { try { localStorage.removeItem(STORE); } catch (e) { /* nada */ } muda(null); return Promise.resolve({ ok: true }); }
    // scope local: sai só deste navegador, mesmo sem internet
    return sb.auth.signOut({ scope: 'local' }).then(function () { muda(null); return { ok: true }; }, function () { muda(null); return { ok: true }; });
  }

  // ---------- saves na nuvem: tabela public.saves (user_id, game, slot, saved_at, data) ----------
  function token() {
    if (!sb) { return Promise.reject(new Error('sem conexão')); }
    return sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session; if (!s) { throw new Error('sem sessão'); }
      return s.access_token;
    });
  }
  function cab(tk, extra) {
    var h = { apikey: CHAVE, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' };
    for (var k in extra) { h[k] = extra[k]; }
    return h;
  }
  function rest(q) { return URL_SB.replace(/\/+$/, '') + '/rest/v1/saves' + q; }
  // todos os espaços do jogo: [{ slot, saved_at, data }]
  function listar(game) {
    return token().then(function (tk) {
      return fetch(rest('?select=slot,saved_at,data&game=eq.' + encodeURIComponent(game)), { headers: cab(tk), cache: 'no-store' });
    }).then(function (r) { if (!r.ok) { throw new Error('nuvem ' + r.status); } return r.json(); }).then(function (l) {
      // data é texto (JSON): chega aqui já lido; texto estragado vira espaço vazio
      l.forEach(function (x) { if (typeof x.data === 'string') { try { x.data = JSON.parse(x.data); } catch (e) { x.data = null; } } });
      return l;
    });
  }
  // grava um espaço só se a nuvem ainda estiver como a deixamos (base = saved_at que conhecíamos; null = espaço novo).
  // corpo: o JSON pronto { saved_at, data } (data = o save em texto, ou null para espaço apagado).
  // Responde 'ok' ou 'conflito' (outro aparelho gravou antes); erro de rede vira rejeição.
  // fechando: a aba está fechando, então vai numa tacada só, com a sessão que já está no navegador
  function gravar(game, slot, base, corpo, fechando) {
    var uid = user && user.id; if (!uid) { return Promise.reject(new Error('sem conta')); }
    var alvo = '?user_id=eq.' + uid + '&game=eq.' + encodeURIComponent(game) + '&slot=eq.' + slot;
    function manda(tk) {
      var ka = !!fechando && corpo.length < KEEPALIVE_MAX;
      if (base === null || base === undefined) {
        var linha = corpo.replace(/^\{/, '{"game":' + JSON.stringify(game) + ',"slot":' + slot + ',');
        return fetch(rest(''), { method: 'POST', headers: cab(tk, { Prefer: 'return=minimal' }), body: linha, keepalive: ka }).then(function (r) {
          if (r.status === 409) { return 'conflito'; }
          if (!r.ok) { throw new Error('nuvem ' + r.status); }
          return 'ok';
        });
      }
      return fetch(rest(alvo + '&saved_at=eq.' + base + '&select=slot'), { method: 'PATCH', headers: cab(tk, { Prefer: 'return=representation' }), body: corpo, keepalive: ka }).then(function (r) {
        if (!r.ok) { throw new Error('nuvem ' + r.status); }
        return r.json().then(function (l) { return l.length ? 'ok' : 'conflito'; });
      });
    }
    if (fechando) { var s = sessaoLocal(); if (!s) { return Promise.reject(new Error('sem sessão')); } return manda(s.access_token); }
    return token().then(manda);
  }

  // ---------- um aparelho por vez: tabela public.sessoes e as funções sessao_* (supabase/sessoes.sql) ----------
  // pede(game, aba, navegador) → como estava antes ({ aba, navegador, liberado, idade } ou null); pulso(game, aba) → a dona
  // atual ({ aba, navegador, liberado, slot } ou null); libera(game, para, slot). fechando: a aba está indo embora (keepalive).
  // Sem a tabela no Supabase (ou sem rede) a promessa é rejeitada e o jogo segue como antes, sem fechar o outro aparelho
  function rpc(nome, args, fechando) {
    function manda(tk) {
      return fetch(URL_SB.replace(/\/+$/, '') + '/rest/v1/rpc/' + nome, { method: 'POST', headers: cab(tk), body: JSON.stringify(args), keepalive: !!fechando, cache: 'no-store' })
        .then(function (r) { if (!r.ok) { throw new Error('nuvem ' + r.status); } return r.status === 204 ? null : r.json(); });
    }
    if (fechando) { var s = sessaoLocal(); if (!s) { return Promise.reject(new Error('sem sessão')); } return manda(s.access_token); }
    return token().then(manda);
  }
  function primeira(l) { return l && l.length ? l[0] : null; }
  var sessao = {
    pede: function (game, aba, nav) { return rpc('sessao_pede', { p_game: game, p_aba: aba, p_navegador: nav }).then(primeira); },
    pulso: function (game, aba) { return rpc('sessao_pulso', { p_game: game, p_aba: aba }).then(primeira); },
    libera: function (game, para, slot, fechando) { return rpc('sessao_libera', { p_game: game, p_para: para, p_slot: slot || null }, fechando); }
  };

  // ---------- painel: entrar / criar conta / sair, igual no portal e nos jogos ----------
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // opts: semConta (texto quando não entrou), comConta (texto quando entrou), aoAbrir(aberto) avisa quando o formulário abre/fecha,
  // direto: sem conta, já mostra o formulário de entrar (para quando o painel fica dentro de um botão "Entrar", como no portal)
  function painel(el, opts) {
    opts = opts || {};
    var modo = 'fechado', msg = '', ocupado = false, emailDigitado = '';
    if (!URL_SB || !CHAVE) { el.hidden = true; return { fechar: function () { return false; }, aberto: function () { return false; } }; }
    function abre(m) { var antes = modo !== 'fechado'; modo = m; msg = ''; desenha(); if (opts.aoAbrir && antes !== (m !== 'fechado')) { opts.aoAbrir(m !== 'fechado'); } foca(); }
    function foca() { var i = el.querySelector('input'); if (i && !document.body.classList.contains('pad')) { setTimeout(function () { try { i.focus(); } catch (e) { /* nada */ } }, 30); } }
    function desenha() {
      if (recup && user) { modo = 'senha'; }
      var h;
      if (modo === 'senha') {
        h = '<form class="conta-form" data-f="senha"><h3>Senha nova</h3>' +
          '<label>Senha nova<input name="senha" type="password" autocomplete="new-password" minlength="6" required></label>' +
          '<button type="submit" class="main">Trocar a senha</button>' +
          '<button type="button" data-c="fechar">Agora não</button>';
      } else if (user) {
        modo = 'fechado';
        h = '<p class="conta-st">' + (opts.comConta || 'Conta') + ': <b>' + esc(user.email) + '</b></p>' +
          '<button type="button" data-c="sair">Sair da conta</button>';
      } else if (modo === 'fechado' && !opts.direto) {
        h = '<p class="conta-st">' + (opts.semConta || 'Entre para guardar seus saves na nuvem.') + '</p>' +
          '<button type="button" data-c="entrar">Entrar ou criar conta</button>';
      } else {
        var m = modo === 'fechado' ? 'entrar' : modo, esq = m === 'esqueci';
        h = (opts.direto && opts.semConta ? '<p class="conta-st">' + opts.semConta + '</p>' : '') +
          '<form class="conta-form" data-f="' + m + '"><h3>' + (esq ? 'Esqueci a senha' : m === 'criar' ? 'Criar conta' : 'Entrar') + '</h3>' +
          '<label>E-mail<input name="email" type="email" autocomplete="email" required value="' + esc(emailDigitado) + '"></label>' +
          (esq ? '' : '<label>Senha<input name="senha" type="password" minlength="6" required autocomplete="' + (m === 'criar' ? 'new-password' : 'current-password') + '"></label>') +
          '<button type="submit" class="main">' + (esq ? 'Mandar o link' : m === 'criar' ? 'Criar conta' : 'Entrar') + '</button>' +
          (m === 'entrar' ? '<button type="button" data-c="criar">Não tenho conta: criar</button><button type="button" data-c="esqueci">Esqueci a senha</button>'
            : '<button type="button" data-c="entrar">Já tenho conta: entrar</button>') +
          (opts.direto ? '' : '<button type="button" data-c="fechar">Voltar</button>');
      }
      if (h.indexOf('<form') >= 0) { h += '<p class="conta-msg" role="status"' + (msg ? '' : ' hidden') + '>' + esc(msg) + '</p></form>'; }
      else if (msg) { h += '<p class="conta-msg" role="status">' + esc(msg) + '</p>'; }
      el.innerHTML = h;
      Array.prototype.forEach.call(el.querySelectorAll('button, input'), function (b) { b.disabled = ocupado; });
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]'); if (!b || ocupado) { return; }
      var i = el.querySelector('input[name=email]'); if (i) { emailDigitado = i.value; }
      var c = b.dataset.c;
      if (c === 'sair') { ocupado = true; desenha(); sair().then(function () { ocupado = false; msg = ''; desenha(); }); return; }
      if (c === 'fechar') { recup = false; abre('fechado'); return; }
      abre(c);
    });
    el.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, modoF = f.dataset.f;
      var email = f.email ? f.email.value.trim() : '', senha = f.senha ? f.senha.value : '';
      emailDigitado = email;
      var p = modoF === 'senha' ? novaSenha(senha) : modoF === 'esqueci' ? esqueci(email) : modoF === 'criar' ? criar(email, senha) : entrar(email, senha);
      ocupado = true; desenha();
      p.then(function (r) {
        ocupado = false;
        if (r.ok && (modoF === 'entrar' || (modoF === 'criar' && !r.confirmar) || modoF === 'senha')) { abre('fechado'); msg = r.msg; desenha(); return; }
        if (r.ok && r.confirmar) { modo = 'entrar'; }
        msg = r.msg; desenha();
        var m = el.querySelector('.conta-msg'); if (m) { m.hidden = !msg; }
      });
    });
    ouvintes.push(function () { if (modo !== 'senha' || !recup) { if (user && modo !== 'fechado') { abre('fechado'); return; } } desenha(); });
    desenha();
    return {
      // Esc / Voltar do jogo: fecha o formulário se estiver aberto (true = fechou algo)
      fechar: function () { if (modo === 'fechado') { return false; } recup = false; abre('fechado'); return true; },
      aberto: function () { return modo !== 'fechado'; }
    };
  }

  window.Conta = {
    ligada: function () { return !!(URL_SB && CHAVE); },
    pronto: pronto,                                   // Promise: true quando a biblioteca carregou
    online: function () { return carregou; },
    usuario: function () { return user; },            // { id, email } ou null
    aoMudar: function (f) { ouvintes.push(f); },
    entrar: entrar, criar: criar, sair: sair, esqueci: esqueci, novaSenha: novaSenha,
    saves: { listar: listar, gravar: gravar },
    sessao: sessao,
    painel: painel
  };
})();
