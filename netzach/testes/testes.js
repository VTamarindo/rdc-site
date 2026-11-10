/* Netzach · testes automáticos
   Rodam no navegador (o computador de trabalho não tem Node): abra testes/index.html pelo servidor de teste.
   Duas partes: DADOS (tudo o que um arquivo cita existe nos outros) e SIMULAÇÃO (js/sim.js joga sozinho e confere as contas).
   Para um teste novo: teste('nome', function () { ... }) dentro de uma das partes; falhar = lançar erro (use confere).
   window.RESULTADO fica com { ok, falhas, total } no fim, para quem roda os testes por código. */
(function (NZ) {
  'use strict';
  var partes = [], atual = null;
  function parte(nome, fn) { partes.push({ nome: nome, fn: fn, testes: [] }); }
  function teste(nome, fn) { atual.testes.push({ nome: nome, fn: fn }); }
  function confere(cond, msg) { if (!cond) { throw new Error(msg || 'falhou'); } }
  // junta os problemas de uma lista e falha com todos de uma vez (mais útil que parar no primeiro)
  function lista(problemas) { confere(!problemas.length, problemas.slice(0, 30).join('\n') + (problemas.length > 30 ? '\n… e mais ' + (problemas.length - 30) : '')); }
  function keys(o) { return Object.keys(o || {}).filter(function (k) { return k.charAt(0) !== '_'; }); } // "_nota": comentário nos dados
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function finito(v) { return typeof v === 'number' && isFinite(v); }
  function json(u) { return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) { throw new Error(u + ': ' + r.status); } return r.json(); }); }

  Promise.all([json('../data/game.json'), json('../data/vila.json'), json('../art/atlas.json'), json('../data/campanha.json').catch(function () { return null; })])
    .then(function (d) { roda(d[0], d[1], d[2], d[3]); })
    .catch(function (e) { fim([{ nome: 'Carregar os dados', testes: [{ nome: 'abrir os arquivos', erro: e.message }] }]); });

  function roda(G, V, atlas, camp) {
    var sprites = {}; atlas.sprites.forEach(function (s) { sprites[s.name] = s; });
    var SUB = (NZ.View && NZ.View.SUBSTITUTA) || {};
    function temFigura(n) { while (!sprites[n] && SUB[n]) { n = SUB[n]; } return !!sprites[n]; }
    var world = new NZ.World(copia(G), copia(V)), sim = new NZ.Sim(world);
    sim.quiet = true;
    function novo() { return NZ.settle(world, NZ.migrate(NZ.newState(world, 12345))); }

    // ---------------------------------------------------------------- DADOS
    parte('Dados', function () {
      var I = G.items;
      teste('lojas e compradores só citam itens que existem', function () {
        var p = [];
        keys(G.npcs).forEach(function (id) {
          (G.npcs[id].services || []).forEach(function (s) {
            (s.items || []).concat(s.item ? [s.item] : []).forEach(function (it) { if (!I[it]) { p.push(id + ' (' + s.type + '): ' + it); } });
          });
        });
        lista(p);
      });
      teste('missões: quem dá, objetivos, recompensa e pré-requisito existem', function () {
        var p = [];
        keys(G.quests).forEach(function (q) {
          var Q = G.quests[q];
          if (!G.npcs[Q.giver]) { p.push(q + ': quem dá "' + Q.giver + '"'); }
          if (Q.requires && !G.quests[Q.requires]) { p.push(q + ': pré-requisito "' + Q.requires + '"'); }
          (Q.objectives || []).forEach(function (o) {
            if (o.type === 'collect' && !I[o.item]) { p.push(q + ': item "' + o.item + '"'); }
            if (o.type === 'kill' && !G.monsters[o.target]) { p.push(q + ': bicho "' + o.target + '"'); }
            if (!(o.n > 0)) { p.push(q + ': quantidade ' + o.n); }
          });
          keys((Q.reward || {}).items).forEach(function (it) { if (!I[it]) { p.push(q + ': recompensa "' + it + '"'); } });
        });
        lista(p);
      });
      teste('conversas marcadas existem e cada escolha leva a um passo que existe', function () {
        var p = [];
        keys(G.npcs).forEach(function (id) {
          var d = G.npcs[id].dialogue; if (!d) { return; }
          var D = G.dialogues && G.dialogues[d];
          if (!D) { p.push(id + ': conversa "' + d + '"'); return; }
          if (!D.nodes[D.start]) { p.push(d + ': começo "' + D.start + '"'); }
          keys(D.nodes).forEach(function (n) {
            (D.nodes[n].options || []).forEach(function (o) { if (o.next && !D.nodes[o.next]) { p.push(d + '/' + n + ': vai para "' + o.next + '"'); } });
          });
        });
        lista(p);
      });
      teste('toda pessoa da vila tem figura no atlas (ou substituta)', function () {
        lista(world.people.filter(function (q) { return !temFigura(q.id); }).map(function (q) { return q.id; }));
      });
      teste('todo bicho tem figura no atlas (ou substituta)', function () {
        lista(keys(G.monsters).filter(function (k) { return !temFigura(k); }));
      });
      teste('figuras de itens na mão existem no atlas', function () {
        lista(keys(I).filter(function (k) { return I[k].sprite && !sprites[I[k].sprite]; }).map(function (k) { return k + ': ' + I[k].sprite; }));
      });
      teste('bicho com toca tem onde nascer no mapa', function () {
        var p = [];
        keys(G.monsters).forEach(function (k) {
          if (G.monsters[k].spot && !world.spawns.some(function (s) { return s.kind === k; })) { p.push(k + ' (toca "' + G.monsters[k].spot + '")'); }
        });
        lista(p);
      });
      teste('regras da macro na ordem padrão existem', function () {
        lista(G.macro.defaultOrder.filter(function (id) { return !G.macro.rules[id]; }));
      });
      teste('itens iniciais e equipamento inicial existem', function () {
        var p = keys(G.player.startItems).filter(function (k) { return !I[k]; });
        keys(G.player.startEquip).forEach(function (s) { var it = G.player.startEquip[s]; if (it && !I[it]) { p.push(s + ': ' + it); } });
        lista(p);
      });
      // quem fica parado bloqueia a própria casa da grade (ninguém o atravessa): o que importa é dar para chegar perto e conversar
      teste('dá para chegar perto de quem fica parado e conversar', function () {
        var r = G.settings.interactRange;
        lista(world.people.filter(function (q) {
          var f = q.fixed && world.nearestFree(q.x, q.z);
          return q.fixed && (!f || Math.hypot(f.x - q.x, f.z - q.z) > r);
        }).map(function (q) { return q.id + ' em ' + q.x + ', ' + q.z; }));
      });
      teste('ponto de nascer do jogador é livre', function () {
        var s = V.spawn; confere(world.free(s.x, s.z, 0.3), 'spawn em ' + s.x + ', ' + s.z);
      });
      if (camp) {
        teste('campanha: cena inicial existe e toda escolha leva a uma cena que existe', function () {
          var C = camp.cenas || {}, p = [], ini = camp.projeto && camp.projeto.cena_inicial;
          if (ini && !C[ini]) { p.push('cena inicial "' + ini + '"'); }
          keys(C).forEach(function (c) {
            (C[c].escolhas || []).forEach(function (e) { if (e.destino && !C[e.destino]) { p.push(c + ': vai para "' + e.destino + '"'); } });
          });
          lista(p);
        });
        teste('campanha: lugares do capítulo são livres', function () {
          var CF = G.campanha, p = [];
          [['início', CF.inicio], ['figura', CF.figura]].forEach(function (l) { if (l[1] && !world.free(l[1].x, l[1].z, 0.3)) { p.push(l[0] + ' em ' + l[1].x + ', ' + l[1].z); } });
          lista(p);
        });
      }
    });

    // ---------------------------------------------------------------- SIMULAÇÃO
    parte('Simulação', function () {
      teste('jogo novo nasce válido', function () {
        var st = novo(), p = st.player;
        confere(p.hp === NZ.calc.maxHp(world, p), 'vida ' + p.hp);
        confere(world.free(p.x, p.z, 0.3), 'nasce dentro de algo');
        confere(st.mobs.length === world.spawns.length, 'bichos ' + st.mobs.length + ' de ' + world.spawns.length);
      });
      teste('save gravado e aberto de novo fica igual (e abrir duas vezes não muda nada)', function () {
        var st = novo(); sim.advance(st, 30);
        var a = JSON.stringify(st), b = NZ.settle(world, NZ.migrate(JSON.parse(a)));
        confere(JSON.stringify(b) === a, 'o save mudou ao ser aberto');
      });
      teste('jogo novo já nasce no formato de save atual', function () {
        confere(NZ.newState(world, 1).fmt === NZ.FORMATO_SAVE, 'fmt ' + NZ.newState(world, 1).fmt);
      });
      // um save de antes dos campos novos (missões, fazenda, equipamento, atributos, formato...) abre e joga sem erro
      teste('save antigo (sem os campos novos) abre e continua jogando', function () {
        var st = novo(); sim.advance(st, 60);
        var velho = copia(st), p = velho.player;
        ['fmt', 'quests', 'qkills', 'flags', 'daily', 'farm', 'gente', 'hostil', 'mortos', 'nomes', 'mapa'].forEach(function (k) { delete velho[k]; });
        ['equip', 'attr', 'pts', 'rep', 'goto', 'mapNav'].forEach(function (k) { delete p[k]; });
        p.weapon = 1;
        var x = NZ.settle(world, NZ.migrate(velho));
        confere(x.fmt === NZ.FORMATO_SAVE, 'formato ' + x.fmt);
        confere(x.player.equip && x.player.equip.arma, 'sem arma depois de converter a espada antiga');
        confere(typeof x.player.pts === 'number' && x.player.attr, 'sem atributos');
        sim.advance(x, 120);
        confere(finito(x.player.x) && finito(x.player.hp), 'quebrou ao jogar');
      });
      teste('save de uma versão mais nova é recusado (não estraga o progresso)', function () {
        var st = novo(); st.fmt = NZ.FORMATO_SAVE + 1;
        var recusou = false; try { NZ.migrate(st); } catch (e) { recusou = true; }
        confere(recusou, 'abriu um save do futuro');
      });
      teste('20 minutos de jogo sozinho sem erro nem número quebrado', function () {
        var st = novo(); sim.advance(st, 1200);
        var p = st.player, mx = NZ.calc.maxHp(world, p);
        confere(finito(p.x) && finito(p.z), 'posição ' + p.x + ', ' + p.z);
        confere(finito(p.hp) && p.hp >= 0 && p.hp <= mx + 1e-6, 'vida ' + p.hp);
        lista(st.mobs.filter(function (b) { return !finito(b.x) || !finito(b.z) || !finito(b.hp); }).map(function (b) { return b.id; }));
      });
      teste('macro colhendo por 10 minutos junta alguma coisa', function () {
        var st = novo(), p = st.player, n = world.nodes.filter(function (x) { return x.kind !== 'trigo'; })[0];
        if (!n) { return; }
        var c = world.nearestFree(n.x, n.z) || n;
        p.x = c.x; p.z = c.z; p.mode = 'macro'; p.macro.on = true; p.macro.area = { x: n.x, z: n.z, r: G.settings.macroRadius };
        var antes = JSON.stringify(p.inv);
        sim.advance(st, 600);
        confere(JSON.stringify(p.inv) !== antes, 'a bolsa não mudou (' + antes + ')');
      });
      teste('comprar tira o preço certo e põe o item na bolsa', function () {
        var loja = null, dono = null;
        keys(G.npcs).some(function (id) { return (G.npcs[id].services || []).some(function (s) { if (s.type === 'shop' && s.items.length) { loja = s; dono = id; return true; } }); });
        confere(loja, 'nenhuma loja nos dados');
        var st = novo(), p = st.player, it = loja.items.filter(function (k) { return !G.items[k].tool; })[0] || loja.items[0];
        p.inv.moeda = 100000;
        var lot = (loja.lots && loja.lots[it]) || 1, preco = NZ.calc.buyPrice(world, p, it, lot), tinha = p.inv[it] || 0;
        var msg = sim.buyItem(st, loja, it, 1);
        confere(p.inv.moeda === 100000 - preco, dono + '/' + it + ': moedas ' + p.inv.moeda + ' (' + msg + ')');
        confere(p.inv[it] === tinha + lot, 'item ' + p.inv[it]);
      });
      teste('sem moedas não compra', function () {
        var loja = null;
        keys(G.npcs).some(function (id) { return (G.npcs[id].services || []).some(function (s) { if (s.type === 'shop' && s.items.length) { loja = s; return true; } }); });
        var st = novo(); st.player.inv.moeda = 0;
        var it = loja.items[0], tinha = st.player.inv[it] || 0;
        sim.buyItem(st, loja, it, 1);
        confere((st.player.inv[it] || 0) === tinha && st.player.inv.moeda === 0, 'comprou sem dinheiro');
      });
      teste('vender dá moedas e tira o item', function () {
        var s = null;
        keys(G.npcs).some(function (id) { return (G.npcs[id].services || []).some(function (x) { if (x.type === 'sell' && x.items && x.items.length) { s = x; return true; } }); });
        confere(s, 'nenhum comprador nos dados');
        var st = novo(), p = st.player, it = s.items[0];
        p.inv[it] = 5; p.inv.moeda = 0;
        sim.sellItem(st, s, it, 2);
        confere(p.inv[it] === 3, 'sobrou ' + p.inv[it]);
        confere(p.inv.moeda === NZ.calc.sellPrice(world, p, it, 2), 'moedas ' + p.inv.moeda);
      });
      teste('missão: aceitar, cumprir e entregar dá a recompensa', function () {
        var q = keys(G.quests).filter(function (k) { var Q = G.quests[k]; return !Q.requires && Q.objectives.every(function (o) { return o.type === 'collect'; }); })[0];
        if (!q) { return; }
        var Q = G.quests[q], st = novo(), p = st.player;
        confere(sim.questState(st, q) === 'available', 'estado ' + sim.questState(st, q));
        confere(sim.acceptQuest(st, q), 'não aceitou');
        Q.objectives.forEach(function (o) { p.inv[o.item] = (p.inv[o.item] || 0) + o.n; });
        confere(sim.questState(st, q) === 'ready', 'não ficou pronta');
        var xp0 = p.xp, lv0 = p.lv;
        confere(sim.turnInQuest(st, q), 'não entregou');
        confere(sim.questState(st, q) === 'done', 'não concluiu');
        if ((Q.reward || {}).xp) { confere(p.xp !== xp0 || p.lv !== lv0, 'sem experiência'); }
        keys((Q.reward || {}).items).forEach(function (it) { confere(p.inv[it] >= Q.reward.items[it], 'sem ' + it); });
      });
      teste('experiência sobe de nível e dá pontos de atributo', function () {
        var st = novo(), p = st.player;
        sim.gainXp(st, 100000);
        confere(p.lv > 1, 'nível ' + p.lv);
        confere(p.pts > 0, 'pontos ' + p.pts);
      });
      teste('poção cura e respeita a espera', function () {
        var st = novo(), p = st.player, mx = NZ.calc.maxHp(world, p);
        p.inv.pocao = 2; p.hp = 1;
        sim.drink(st);
        confere(p.hp > 1, 'não curou');
        var hp = p.hp; p.hp = 1; sim.drink(st);
        confere(p.hp === 1 || p.inv.pocao === 1, 'bebeu duas seguidas');
        confere(hp <= mx, 'passou da vida máxima');
      });
      teste('save de um jogo jogado cabe no armazenamento (menos de 60 KB)', function () {
        var st = novo(); sim.advance(st, 600);
        var kb = JSON.stringify(st).length / 1024;
        confere(kb < 60, Math.round(kb) + ' KB');
      });
    });

    // ---------------------------------------------------------------- rodar
    var res = partes.map(function (P) {
      atual = P;
      try { P.fn(); } catch (e) { P.testes.push({ nome: 'montar a parte', fn: function () { throw e; } }); }
      P.testes.forEach(function (t) {
        try { t.fn(); t.ok = true; } catch (e) { t.erro = (e && e.message) || String(e); if (e && e.stack && !/^Error: /.test(t.erro)) { t.erro += '\n' + e.stack.split('\n').slice(0, 3).join('\n'); } }
      });
      return P;
    });
    fim(res);
  }

  function fim(res) {
    var total = 0, falhas = 0, html = '';
    function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
    res.forEach(function (P) {
      html += '<h2>' + esc(P.nome) + '</h2><ul>';
      P.testes.forEach(function (t) {
        total++; if (!t.ok) { falhas++; }
        html += '<li class="' + (t.ok ? 'ok' : 'falha') + '">' + esc(t.nome) + (t.ok ? '' : '<small>' + esc(t.erro) + '</small>') + '</li>';
      });
      html += '</ul>';
    });
    document.getElementById('saida').innerHTML = html;
    var r = document.getElementById('resumo');
    r.className = falhas ? 'falha' : 'ok';
    r.textContent = falhas ? falhas + ' de ' + total + ' testes falharam.' : 'Todos os ' + total + ' testes passaram.';
    window.RESULTADO = { ok: !falhas, falhas: falhas, total: total, detalhes: res.map(function (P) { return { parte: P.nome, falhas: P.testes.filter(function (t) { return !t.ok; }).map(function (t) { return t.nome + ': ' + t.erro; }) }; }) };
  }
})(window.NZ = window.NZ || {});
