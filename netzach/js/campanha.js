/* Netzach · campanha (o modo história)
   As cenas vêm do roteirizador: tools/montar_campanha.ps1 junta projeto.json e cenas/*.json em data/campanha.json.
   Cada cena tem falas, efeitos (moedas, experiência...) e escolhas, cada escolha com o destino (outra cena).
   O que acontece no mundo em cada cena (andar até a figura, colher, a carroça) fica em ROTEIRO, pelo id da cena;
   cena sem roteiro funciona sozinha: as falas uma a uma e as escolhas como botões (sem escolhas, o capítulo termina).
   Números e lugares do capítulo ficam em game.json → campanha. O progresso fica no save, em st.camp. */
(function (NZ) {
  'use strict';
  NZ.campanha = function (api) {
    var G = api.G, world = api.world, view = api.view, sim = api.sim, C = api.dados || { cenas: {} }, CF = G.campanha;
    var cenas = C.cenas || {}, inicial = (C.projeto && C.projeto.cena_inicial) || Object.keys(cenas)[0];
    var $ = function (id) { return document.getElementById(id); };
    var st = null, p = null;
    var trava = false, deit = 0, deitAnim = null, giro = null, fila = [], parado = 0, ultimo = null, fugindo = false;
    var campo = (world.vila.fields || []).filter(function (f) { return f.id === CF.campo; })[0];

    // ---------- atores do capítulo (só desenho: view.ator / view.carroca) ----------
    var F = CF.figura, FZ = CF.fazendeiro, CR = CF.carroca;
    view.ator('figura', F.img, F.h, parseInt(F.tinta, 16), F.nome);
    view.ator('faz', FZ.img, FZ.h, undefined, FZ.nome);
    view.carroca('carroca', CR.x, CR.z, (CR.rot || 0) * Math.PI / 180, CR.nome);
    function ator(id) { return view.atores[id]; }
    function esconde() { ['figura', 'faz', 'carroca'].forEach(function (id) { view.esconde(id); }); ator('carroca').carga.visible = false; }
    function poeCarroca(cheia) { var a = ator('carroca'); a.o.visible = true; a.carga.visible = !!cheia; }
    function fazNaCarroca(anda) { if (anda) { view.vai('faz', CR.x + CR.faz[0], CR.z + CR.faz[1], 1.6); } else { view.poeAtor('faz', CR.x + CR.faz[0], CR.z + CR.faz[1]); } }

    // ---------- estado salvo ----------
    function S() { return st.camp; }
    function novo(s) {
      s.modo = 'campanha';
      s.camp = { cena: inicial, passo: '', n: 0, vars: {}, fim: false, missao: null, feitos: {}, semVolta: CF.campo }; // semVolta: o campo do capítulo não volta a crescer até o fim dele (js/sim.js)
      var P = s.player, V = C.projeto && C.projeto.variaveis || {};
      P.x = CF.inicio.x; P.z = CF.inicio.z; P.yaw = CF.inicio.yaw * Math.PI / 180;
      P.inv = JSON.parse(JSON.stringify(CF.itens || {}));
      if (V.moedas) { P.inv.moeda = V.moedas.inicial || 0; }
      if (CF.semArma) { P.equip.arma = null; }
      Object.keys(V).forEach(function (k) { if (!MAPA[k]) { s.camp.vars[k] = V[k].inicial; } });
    }
    // abre o save (ou o jogo novo) no ponto da história em que parou; volta = save carregado, não cena nova
    function abre(s, volta) {
      st = s; p = s ? s.player : null; fila = []; trava = false; deit = 0; deitAnim = null; giro = null; parado = 0; ultimo = null; fugindo = false;
      if (s && s.camp && !s.camp.fim) { s.camp.semVolta = CF.campo; } // saves de antes: o campo também para de crescer de novo
      preto(0, '', 0); dica(null); fechaCaixa(); esconde();
      if (!ativa()) { return; }
      var c = S();
      if (c.fim) { // capítulo terminado: quem volta ao jogo depois começa na praça (a cena do pasto ainda vai ser ligada)
        if (volta) { var sp = world.vila.spawn; p.x = sp.x; p.z = sp.z; }
        api.quests(); return;
      }
      entra(c.cena, volta);
    }
    function ativa() { return !!(st && st.modo === 'campanha' && st.camp); }

    // ---------- variáveis do roteirizador ↔ o jogo ----------
    var MAPA = {
      moedas: { le: function () { return p.inv.moeda || 0; }, poe: function (v) { p.inv.moeda = Math.max(0, Math.round(v)); } },
      experiencia: { le: function () { return st.stats.xp || 0; }, poe: function (v, d) { if (d > 0) { sim.gainXp(st, d, true); } } },
      nivel: { le: function () { return p.lv; }, poe: function (v) { p.lv = Math.max(1, Math.round(v)); } }
    };
    function le(k) { return MAPA[k] ? MAPA[k].le() : (S().vars[k] === undefined ? 0 : S().vars[k]); }
    function poe(k, v) { var a = le(k); if (MAPA[k]) { MAPA[k].poe(v, v - a); } else { S().vars[k] = v; } }
    function conta(a, op, b) {
      switch (op) {
        case '+=': return (+a || 0) + (+b || 0); case '-=': return (+a || 0) - (+b || 0);
        case '*=': return (+a || 0) * (+b || 0); case '=': return b;
        case '>=': return a >= b; case '<=': return a <= b; case '>': return a > b; case '<': return a < b;
        case '==': return a == b; case '!=': return a != b; // == de propósito: o roteirizador pode gravar "5" ou 5
      }
      return b;
    }
    function aplica(E) { (E || []).forEach(function (e) { poe(e.variavel, conta(le(e.variavel), e.op, e.valor)); }); api.eventos(); }
    // condição: null (sempre), { variavel, op, valor } ou o texto "moedas >= 5"
    function pode(x) {
      var c = x && x.condicao; if (!c) { return true; }
      if (typeof c === 'string') { var m = c.match(/^\s*(\w+)\s*(>=|<=|==|!=|>|<|=)\s*(.+?)\s*$/); if (!m) { return true; } c = { variavel: m[1], op: m[2], valor: isNaN(+m[3]) ? m[3] : +m[3] }; }
      return !!conta(le(c.variavel), c.op === '=' ? '==' : c.op, c.valor);
    }
    function resumoEfeitos(E) {
      var nome = { moedas: ['moeda', 'moedas'], experiencia: ['de experiência', 'de experiência'] };
      return (E || []).filter(function (e) { return e.op === '+=' && e.valor > 0; }).map(function (e) {
        var n = nome[e.variavel]; return '+' + e.valor + ' ' + (n ? n[e.valor === 1 ? 0 : 1] : e.variavel);
      }).join(' · ');
    }

    // ---------- seguir de cena em cena ----------
    function entra(id, volta) {
      var c = cenas[id];
      if (!c) { fimCapitulo(); return; }
      S().cena = id; if (!volta) { S().passo = ''; }
      var R = ROTEIRO[id];
      if (!volta && !(R && R.adia)) { aplica(c.efeitos); }
      if (R) { R.entra(c, volta); } else { padrao(c); }
      api.quests(); api.save();
    }
    // escolha i da cena (a ordem do roteirizador); escolha que não vale (condição) não segue
    function segue(c, i) {
      var e = c.escolhas[i];
      if (!e) { fimCapitulo(); return; }
      if (!pode(e)) { return; }
      fila = []; aplica(e.efeitos); entra(e.destino);
    }
    function botoes(c) {
      var L = c.escolhas.map(function (e, i) { return pode(e) ? { text: e.texto.trim(), fn: function () { fechaCaixa(); segue(c, i); } } : null; }).filter(Boolean);
      return L.length ? L : [{ text: 'Continuar', fn: function () { fechaCaixa(); fimCapitulo(); } }];
    }
    function padrao(c) {
      if (!c.falas.length && !c.escolhas.length) { fimCapitulo(); return; }
      falas(c.falas, botoes(c), c.titulo);
    }
    function fimCapitulo() {
      fila = []; trava = false; dica(null); fechaCaixa();
      var ok = S().cena === CF.ficaNoPasto;
      S().fim = true; S().cena = 'pasto'; S().passo = '';
      S().missao = ok ? { t: CF.pasto.missao, p: CF.pasto.prog } : null;
      // o fazendeiro leva a carroça para a vila
      ['faz', 'carroca'].forEach(function (id) { view.some(id, 2.5); });
      api.toast(CF.fimTexto, 5);
      api.quests(); api.save();
    }

    // ---------- falas: caixa de conversa embaixo da tela ----------
    function quem(n) { return /protagonista|\(nome/i.test(n || '') ? p.name : n; }
    // o rosto de quem fala (view.retrato): os atores do capítulo e, pelo nome, qualquer pessoa da vila.
    // O protagonista (o jogador), a narração e nome desconhecido ficam sem rosto
    function rosto(n) {
      if (!n || /protagonista|\(nome/i.test(n)) { return null; }
      var k = n.trim().toLowerCase();
      if (k === F.nome.toLowerCase()) { return view.retrato(F.img, parseInt(F.tinta, 16)); }
      if (k === FZ.nome.toLowerCase()) { return view.retrato(FZ.img); }
      var P = world.personById || {}, id = Object.keys(P).filter(function (i) { return String(P[i].name || '').toLowerCase() === k; })[0];
      return id ? view.retrato(id) : null;
    }
    function fill(t) { return String(t || '').replace(/\((nome( do jogador)?)\)|\{nome\}/gi, p.name); }
    function falas(L, fim, titulo) {
      L = (L || []).filter(pode);
      var i = 0;
      (function mostra() {
        var ultima = i >= L.length - 1, f = L[i];
        var ops = ultima && typeof fim !== 'function' ? fim : [{ text: 'Continuar', cls: 'main', fn: function () {
          if (!ultima) { i++; mostra(); return; }
          fechaCaixa(); fim();
        } }];
        caixa(f ? quem(f.personagem) : '', f ? fill(f.texto) : (titulo || ''), ops, f ? rosto(f.personagem) : null);
      })();
    }
    function caixa(nome, texto, ops, img) {
      var r = $('cena-rosto'); r.hidden = !img; if (img) { r.src = img; }
      $('cena-nome').textContent = nome || ''; $('cena-nome').hidden = !nome;
      $('cena-texto').textContent = texto;
      var box = $('cena-opts'); box.innerHTML = '';
      ops.forEach(function (o, k) {
        var b = document.createElement('button'); b.type = 'button'; b.className = o.cls || (ops.length === 1 || k === 0 ? 'main' : 'opt'); b.textContent = o.text;
        b.onclick = function () { if (api.guardado()) { return; } o.fn(); };
        box.appendChild(b);
      });
      api.janela(true);
    }
    function fechaCaixa() { if (!$('w-cena').hidden) { api.janela(false); } }

    // ---------- tela: preto, dica, missão, missão completada ----------
    // preto(opacidade, texto, segundos da transição)
    function preto(a, texto, seg) {
      var el = $('cena-preto');
      el.style.transition = 'opacity ' + (seg || 0) + 's linear';
      if (texto !== undefined) { $('cena-preto-t').textContent = texto; }
      el.hidden = false; el.style.opacity = a;
      clearTimeout(el._t); if (!a) { el._t = setTimeout(function () { if (el.style.opacity === '0') { el.hidden = true; } }, (seg || 0) * 1000 + 50); }
    }
    // no celular a dica fica no alto e some sozinha depois de DICA_SEG segundos (na frente da colheita, atrapalhava)
    var DICA_SEG = 8;
    function dica(t) {
      var el = $('cena-dica'); el.textContent = t || ''; el.hidden = !t; clearTimeout(el._t);
      if (t && document.body.classList.contains('touch')) { el._t = setTimeout(function () { el.hidden = true; }, DICA_SEG * 1000); }
    }
    function missao(t, prog) { S().missao = t ? { t: t, p: prog || '' } : null; api.quests(); }
    function feito(titulo, linha) {
      var el = $('cena-feito');
      $('cena-feito-t').textContent = titulo; $('cena-feito-l').textContent = linha || ''; $('cena-feito-l').hidden = !linha;
      el.hidden = false; el.classList.remove('sai'); void el.offsetWidth; el.classList.add('entra');
      clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('entra'); el.classList.add('sai'); el._t = setTimeout(function () { el.hidden = true; }, 600); }, 3200);
      som('missao');
    }
    // sons (js/som.js, feitos por código): o nome da cena pede o som; sem Web Audio, fica mudo
    var SONS = { missao: 'missao', criancas_rindo: 'criancas' };
    function som(nome) { var S = NZ.som, f = S && S[SONS[nome]]; if (f) { f(); } }

    // ---------- tempo: passos da cena em sequência (segundos do jogo na tela, não salvos) ----------
    function depois(seg, fn) { fila.push({ t: seg, fn: fn }); }
    function olha(x, z) { view.yaw = Math.atan2(x - p.x, z - p.z); view.pitch = -0.05; }
    // vira para (x, z) de forma rápida mas contínua (o puxão no ombro): começa rápido e assenta no fim
    function vira(x, z, seg) {
      var alvo = Math.atan2(x - p.x, z - p.z), d = alvo - view.yaw;
      while (d > Math.PI) { d -= Math.PI * 2; } while (d < -Math.PI) { d += Math.PI * 2; }
      giro = { de: view.yaw, d: d, p0: view.pitch, t: 0, seg: seg || 0.6 };
    }
    function levanta(seg, fim) { deitAnim = { de: deit, para: 0, t: 0, seg: seg, fim: fim }; }
    function noCampo(folga) {
      var f = folga === undefined ? CF.folga : folga;
      return p.x > campo.x0 - f && p.x < campo.x1 + f && p.z > campo.z0 - f && p.z < campo.z1 + f;
    }
    function volta(msg) { // fugiu do campo sem a cena de fuga: a tela apaga e ele volta ao começo
      fugindo = true; trava = true; preto(1, '', 0.7);
      setTimeout(function () {
        if (!ativa()) { return; }
        p.x = CF.inicio.x; p.z = CF.inicio.z; p.action = null; p.goto = null; olha(CF.figura.x, CF.figura.z);
        preto(0, '', 0.9); trava = false; fugindo = false; if (msg) { aviso(msg); }
      }, 900);
    }
    // caixinha de texto sem quem fala (narração): um botão Continuar, que fecha e segue (fim)
    function aviso(texto, fim) { caixa('', fill(texto), [{ text: 'Continuar', cls: 'main', fn: function () { fechaCaixa(); if (fim) { fim(); } } }]); }
    function textoColheita() { var e = api.entrada(); return CF.dicaColher[e] || CF.dicaColher.teclado; }
    function prog(n, de) { return Math.min(n, de) + '/' + de; }

    // ---------- o capítulo do trigo ----------
    var N1 = CF.colher;
    // retalhos do campo do capítulo ainda de pé (cada um dá um feixe)
    function dePe() { return world.nodes.filter(function (n) { return n.field === CF.campo && st.nodes[n.id].alive; }).length; }
    function puxao(correu) {
      return {
        entra: function (c, voltou) {
          fazNaCarroca(false); ator('faz').o.visible = false; poeCarroca(false); missao(null);
          var atras = function () { var y = view.yaw; return { x: p.x - Math.sin(y) * 1.6, z: p.z - Math.cos(y) * 1.6 }; };
          var conversa = function () { falas(c.falas, botoes(c)); };
          if (voltou) { var q = atras(); view.poeAtor('faz', q.x, q.z); olha(q.x, q.z); conversa(); return; }
          trava = true;
          if (correu) { view.vai('figura', CF.figura.x + 26, CF.figura.z - 4, 4.5); view.some('figura', 1.1); } else { view.some('figura', 2.2); }
          depois(correu ? 0.9 : 1.8, function () {
            var q = atras(); view.poeAtor('faz', q.x, q.z); view.shake = 0.08; vira(q.x, q.z, CF.puxaoSeg);
          });
          depois(CF.puxaoSeg + 0.15, function () { trava = false; conversa(); });
        }
      };
    }
    var ROTEIRO = {
      c01_trigo_acorda: {
        entra: function (c, voltou) {
          view.poeAtor('figura', F.x, F.z); poeCarroca(false); S().n = 0;
          if (voltou && S().passo === 'figura') { missao(CF.missoes.figura); return; }
          p.x = CF.inicio.x; p.z = CF.inicio.z; view.yaw = CF.inicio.yaw * Math.PI / 180; view.pitch = -0.05;
          S().passo = 'acordando'; trava = true; deit = 1;
          preto(1, fill(CF.acordou), 0); som('criancas_rindo');
          depois(3.4, function () { preto(0, undefined, 2.6); });
          depois(2.8, function () { levanta(2.2); });
          depois(2.4, function () { trava = false; S().passo = 'figura'; parado = 0; ultimo = null; missao(CF.missoes.figura); api.save(); });
        },
        tick: function (c, dt) {
          if (S().passo !== 'figura' || fugindo) { return; }
          if (!noCampo()) { volta(); return; }
          var d0 = Math.hypot(F.x - CF.inicio.x, F.z - CF.inicio.z), d = Math.hypot(F.x - p.x, F.z - p.z);
          if (d < d0 - CF.seguir) { segue(c, 0); return; }          // andou em direção à figura: Seguir
          if (parado >= CF.paradoSeg) { segue(c, 1); }              // ficou parado: o fazendeiro chega
        }
      },
      c01_trigo_seguir_figura: puxao(true),
      c01_trigo_ficar_parado: puxao(false),
      c01_trigo_tutorial: {
        entra: function (c, voltou) {
          view.esconde('figura'); poeCarroca(false);
          if (!ator('faz').o.visible) { fazNaCarroca(false); }
          var comeca = function () {
            S().passo = 'colher'; dica(textoColheita()); missao(CF.missoes.colher, prog(S().n, N1)); fazNaCarroca(true); api.save();
          };
          if (voltou && S().passo === 'colher') { fazNaCarroca(false); comeca(); return; }
          // voltando da fuga: o fazendeiro já falou e o protagonista também; segue colhendo, sem repetir as falas
          if (S().puxado) { delete S().puxado; fazNaCarroca(false); comeca(); return; }
          falas(c.falas, comeca);
        },
        tick: function (c) {
          if (S().passo !== 'colher' || fugindo) { return; }
          if (!noCampo()) { segue(c, 1); return; }                  // Tentar fugir
          var a = p.action, n = a && a.type === 'gather' && world.nodeById[a.id];
          if (n && n.field === CF.campo) { segue(c, 0); }           // começou a colher: Colher o trigo
        }
      },
      c01_trigo_tentar_fugir: {
        entra: function (c, voltou) {
          S().puxado = true; // a cena do tutorial, ao voltar, não repete as falas
          if (voltou) { segue(c, 0); return; }
          dica(null); trava = true; fugindo = true; preto(1, '', 0.8);
          depois(1.0, function () { p.x = CF.inicio.x; p.z = CF.inicio.z; p.action = null; p.goto = null; olha(CR.x, CR.z); preto(0, '', 1); });
          // a caixinha diz o que aconteceu; "Continuar" é a escolha da cena (Reiniciar), de volta à colheita
          depois(1.1, function () { trava = false; fugindo = false; aviso(CF.naoFuja, function () { segue(c, 0); }); });
        }
      },
      c01_trigo_colher_o_trigo: {
        entra: function (c, voltou) {
          poeCarroca(false); fazNaCarroca(!voltou);
          if (S().passo === 'carroca') { missao(CF.missoes.carroca); return; }
          S().passo = 'colher'; dica(textoColheita()); missao(CF.missoes.colher, prog(S().n, N1));
        },
        colheu: function () {
          if (S().passo !== 'colher') { return; }
          S().n++; missao(CF.missoes.colher, prog(S().n, N1));
          if (S().n >= N1) { dica(null); S().passo = 'carroca'; missao(CF.missoes.carroca); api.toast(CF.missoes.carroca + '.', 3); }
          api.save();
        },
        tick: function () { if (S().passo === 'colher' && !fugindo && !noCampo()) { volta(CF.naoFuja); } },
        carroca: function (c) { if (S().passo === 'carroca') { segue(c, 0); } }
      },
      c01_trigo_colocar_na_carroca: {
        entra: function (c, voltou) {
          dica(null); missao(null); fazNaCarroca(false);
          if (!voltou) { descarrega(); }
          poeCarroca(true); var fz = ator('faz').o.pos; if (voltou) { olha(fz[0], fz[2]); } else { vira(fz[0], fz[2], CF.puxaoSeg); } // vira para o fazendeiro como no puxão
          falas(c.falas, botoes(c));
        }
      },
      c01_trigo_receber_moedas: {
        entra: function (c, voltou) {
          fazNaCarroca(false); poeCarroca(true);
          if (!voltou) { feito(CF.feito, resumoEfeitos(c.efeitos)); }
          falas(c.falas, botoes(c));
        }
      },
      c01_trigo_terminar_o_campo: {
        adia: true, // os efeitos (moedas e experiência) só valem quando o trigo chega à carroça
        entra: function (c, voltou) {
          fazNaCarroca(false); poeCarroca(true);
          // "terminar o campo" é o campo todo: a meta é o que ainda está de pé (o campo não volta a crescer no capítulo)
          if (!voltou) { S().n = 0; S().meta = dePe(); S().passo = S().meta ? 'colher' : 'carroca'; }
          if (S().passo === 'fim') { falas(c.falas, fimCapitulo); return; }
          if (S().passo === 'carroca') { missao(CF.missoes.carroca2); return; }
          missao(CF.missoes.terminar, prog(S().meta - dePe(), S().meta));
        },
        colheu: function () {
          if (S().passo !== 'colher') { return; }
          var falta = dePe();
          missao(CF.missoes.terminar, prog(S().meta - falta, S().meta));
          if (!falta) { S().passo = 'carroca'; missao(CF.missoes.carroca2); api.toast(CF.missoes.carroca2 + '.', 3); }
          api.save();
        },
        tick: function () { if (S().passo === 'colher' && !fugindo && !noCampo()) { volta(CF.naoFuja); } },
        carroca: function (c) {
          if (S().passo !== 'carroca') { return; }
          descarrega(); aplica(c.efeitos); S().passo = 'fim'; missao(null);
          feito(CF.feito, resumoEfeitos(c.efeitos)); api.save();
          vira(ator('faz').o.pos[0], ator('faz').o.pos[2], CF.puxaoSeg); // vira para o fazendeiro como no puxão
          falas(c.falas, fimCapitulo);
        }
      }
    };
    // o trigo colhido vai para a carroça (sai da bolsa)
    function descarrega() { if (p.inv.trigo) { api.toast('Colocou ' + p.inv.trigo + ' feixes de trigo na carroça.', 3); p.inv.trigo = 0; } }

    // ---------- chamado pela interface ----------
    function tick(dt) {
      if (!ativa()) { return; }
      // parado: o personagem não andou (o tempo só conta com o jogo à vista, sem janela aberta)
      if (ultimo && Math.hypot(p.x - ultimo[0], p.z - ultimo[1]) < 0.02 && !trava && !api.janelaAberta()) { parado += dt; } else if (!ultimo || Math.hypot(p.x - ultimo[0], p.z - ultimo[1]) >= 0.02) { parado = 0; }
      ultimo = [p.x, p.z];
      if (giro) {
        giro.t += dt; var kg = Math.min(1, giro.t / giro.seg), eg = 1 - Math.pow(1 - kg, 3);
        view.yaw = giro.de + giro.d * eg; view.pitch = giro.p0 + (-0.05 - giro.p0) * eg;
        if (kg >= 1) { giro = null; }
      }
      if (deitAnim) {
        var A = deitAnim; A.t += dt; var k = Math.min(1, A.t / A.seg), e = k * k * (3 - 2 * k);
        deit = A.de + (A.para - A.de) * e;
        if (k >= 1) { deitAnim = null; deit = A.para; if (A.fim) { A.fim(); } }
      }
      while (fila.length) {
        fila[0].t -= dt; if (fila[0].t > 0) { break; }
        var f = fila.shift(); f.fn(); dt = 0;
      }
      if (S().fim) { return; }
      var R = ROTEIRO[S().cena];
      if (R && R.tick && !trava && api.janelaAberta() !== 'w-cena') { R.tick(cenas[S().cena], dt); }
    }
    function evento(e) {
      if (!ativa() || S().fim || e.type !== 'gathered') { return; }
      var n = world.nodeById[e.id], R = ROTEIRO[S().cena];
      if (n && n.field === CF.campo && R && R.colheu) { R.colheu(cenas[S().cena]); }
    }
    // clique ou E/A num ator da campanha
    function interage(id, d) {
      if (!ativa() || S().fim) { return; }
      var R = ROTEIRO[S().cena];
      if (id === 'carroca') {
        if (d > CF.alcance) { api.toast('Chegue mais perto da carroça.'); return; }
        if (R && R.carroca && S().passo === 'carroca') { R.carroca(cenas[S().cena]); return; }
        api.toast(S().passo === 'colher' ? 'Colha o trigo primeiro: ' + (S().missao ? S().missao.p : '') + '.' : 'A carroça do fazendeiro.');
        return;
      }
      if (id === 'faz') { api.toast(S().missao ? FZ.nome + ': "' + S().missao.t + '."' : FZ.nome + '.', 3); return; }
      if (id === 'figura') { api.toast('…'); }
    }
    function marcas() {
      if (!ativa() || S().fim) { return []; }
      var out = [], c = ator('carroca').o;
      if (S().passo === 'carroca') { out.push({ id: 'camp:carroca', sym: '!', x: c.pos[0], y: 2.1, z: c.pos[2] }); }
      return out;
    }
    return {
      novo: novo, abre: abre, tick: tick, evento: evento, interage: interage, marcas: marcas, ativa: ativa,
      trava: function () { return ativa() && trava; },
      deitado: function () { return ativa() ? deit : 0; },
      missao: function () { return ativa() ? S().missao : null; },
      fim: function () { return ativa() && S().fim; },
      perto: function () { // atores com quem o E/A conversa (os visíveis)
        if (!ativa() || S().fim) { return []; }
        return ['faz', 'carroca'].filter(function (id) { return ator(id).o.visible; }).map(function (id) { var o = ator(id).o; return { id: id, x: o.pos[0], z: o.pos[2] }; });
      },
      tem: function () { return !!(inicial && cenas[inicial]); }
    };
  };
})(window.NZ = window.NZ || {});
