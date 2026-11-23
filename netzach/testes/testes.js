/* Netzach · testes automáticos
   Rodam no navegador (abra testes/index.html pelo servidor de teste) e pelo Node (npm run testar, tools/testar.mjs).
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
      teste('animações: todo quadro citado existe no atlas e toda figura animada tem frente parada', function () {
        var p = [];
        keys(atlas.anims).forEach(function (n) {
          var A = atlas.anims[n];
          if (!sprites[n]) { p.push(n + ': a figura de base não está no atlas'); }
          if (!(A.frente && A.frente.parado && A.frente.parado.length)) { p.push(n + ': sem frente parada'); }
          keys(A).forEach(function (d) {
            if (['frente', 'lado', 'costas'].indexOf(d) < 0) { p.push(n + ': direção "' + d + '"'); }
            keys(A[d]).forEach(function (e) {
              A[d][e].forEach(function (q) {
                if (!sprites[q.s]) { p.push(n + '/' + d + '/' + e + ': quadro "' + q.s + '"'); }
                else if (sprites[q.s].w !== sprites[n].w || sprites[q.s].h !== sprites[n].h) { p.push(q.s + ': tamanho diferente da figura'); }
                if (!(q.ms > 0)) { p.push(q.s + ': duração ' + q.ms); }
              });
            });
          });
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
      // a padaria ficou fechada (10/11): o centro em meio metro fazia a parede cair no meio de uma casa da grade
      teste('toda construção com interior tem porta aberta e chão por dentro', function () {
        lista(world.salas.filter(function (S) {
          var porta = S.portas.some(function (i) { return world.grid[i] === 0; });
          var chao = S.cel.some(function (i) { return world.grid[i] === 0 && S.portas.indexOf(i) < 0; });
          return !porta || !chao;
        }).map(function (S) { return S.id + ' (centro em ' + S.b.x + ', ' + S.b.z + '; use números que alinhem a parede com a grade)'; }));
      });
      teste('quem atende dentro de uma sala pode ser alcançado de dentro dela', function () {
        var r = G.settings.interactRange;
        lista(world.people.filter(function (q) {
          var S = q.fixed && world.salaDe(q.x, q.z); if (!S) { return false; }
          return !S.cel.some(function (i) {
            if (world.grid[i] !== 0) { return false; }
            var x = (i % world.N) - world.B + 0.5, z = Math.floor(i / world.N) - world.B + 0.5;
            return Math.hypot(x - q.x, z - q.z) <= r;
          });
        }).map(function (q) { return q.id + ' (' + q.x + ', ' + q.z + ')'; }));
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
      teste('o jogador entra andando em toda construção com interior', function () {
        var p = [];
        world.salas.forEach(function (S) {
          var st = novo(), pl = st.player, alvo = null;
          S.cel.some(function (i) {
            if (world.grid[i] !== 0 || S.portas.indexOf(i) >= 0) { return false; }
            alvo = { x: (i % world.N) - world.B + 0.5, z: Math.floor(i / world.N) - world.B + 0.5 }; return true;
          });
          if (!alvo) { p.push(S.id + ': sem chão livre'); return; }
          var f = world.nearestFree(S.fora.x, S.fora.z) || S.fora;
          pl.x = f.x; pl.z = f.z; sim.goTo(st, alvo.x, alvo.z); sim.advance(st, 40);
          if (world.salaEm(pl.x, pl.z) !== S.id) { p.push(S.id + ': parou em ' + pl.x.toFixed(1) + ', ' + pl.z.toFixed(1)); }
        });
        lista(p);
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
        // equipamento sai com qualidade e raridade sorteadas: conta as peças do mesmo item base
        function conta() { return Object.keys(p.inv).reduce(function (n, k) { return n + (k === it || (world.game.items[k] || {}).base === it ? p.inv[k] : 0); }, 0); }
        var lot = (loja.lots && loja.lots[it]) || 1, preco = NZ.calc.buyPrice(world, p, it, lot), tinha = conta();
        var msg = sim.buyItem(st, loja, it, 1);
        confere(p.inv.moeda === 100000 - preco, dono + '/' + it + ': moedas ' + p.inv.moeda + ' (' + msg + ')');
        confere(conta() === tinha + lot, 'item ' + conta());
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
      // câmera olhando para +z (yaw 0): a direita da tela é -x
      teste('animação: o lado que a figura mostra depende de para onde ela olha e da câmera', function () {
        var V = { yaw: 0 }, dir = function (r) { var d = NZ.View.prototype.direcao.call(V, r); return d.dir + (d.esp ? '<' : ''); };
        confere(dir(undefined) === 'frente', 'sem rumo: ' + dir(undefined));
        confere(dir(Math.PI) === 'frente', 'olhando para a câmera: ' + dir(Math.PI));
        confere(dir(0) === 'costas', 'olhando para longe: ' + dir(0));
        confere(dir(-Math.PI / 2) === 'lado', 'indo para a direita da tela: ' + dir(-Math.PI / 2));
        confere(dir(Math.PI / 2) === 'lado<', 'indo para a esquerda (espelhada): ' + dir(Math.PI / 2));
        V.yaw = Math.PI; // a câmera virou: quem ia para longe agora vem para ela
        confere(dir(0) === 'frente', 'câmera virada: ' + dir(0));
      });
      teste('animação: os passos trocam pela duração de cada quadro e param no quadro parado', function () {
        var A = { frente: { parado: [{ s: 'p', ms: 500 }], andar: [{ s: 'a0', ms: 100 }, { s: 'a1', ms: 200 }] } };
        var V = Object.create(NZ.View.prototype), o = { userData: { img: 'x' }, scale: [1, 1, 1], tex: '' };
        V.yaw = 0; V.art = { anims: { x: A } };
        var an = function (anda, dt) { NZ.View.prototype.anima.call(V, o, undefined, anda, dt); return o.tex; };
        confere(an(false, 0.016) === 's:p', 'parado: ' + o.tex);
        confere(an(true, 0.05) === 's:a0', 'começo do passo: ' + o.tex);
        confere(an(true, 0.06) === 's:a1', 'depois de 110 ms: ' + o.tex);
        confere(an(true, 0.18) === 's:a1', 'ainda no 2º (200 ms): ' + o.tex);
        confere(an(true, 0.02) === 's:a0', 'volta ao 1º: ' + o.tex);
        confere(an(false, 0.016) === 's:p', 'parou: ' + o.tex);
        confere(an(true, 3600) === 's:a0' || o.tex === 's:a1', 'muito tempo de uma vez: ' + o.tex);
      });
      // saque: o lobo sempre deixa a pele (chance 1), bom para testar
      function abate(st, kind) {
        var m = st.mobs.filter(function (b) { return b.kind === kind && b.alive; })[0];
        st.player.x = m.x + 1; st.player.z = m.z; m.hp = 1; sim.swing(st, m);
        return m;
      }
      teste('saque: o bicho abatido deixa um monte no chão, e o jogador escolhe o que pegar', function () {
        var st = novo(), p = st.player; abate(st, 'lobo');
        confere(st.saque.length === 1, 'montes: ' + st.saque.length);
        var s = st.saque[0];
        confere(!(p.inv.pele_lobo > 0), 'foi direto para a bolsa');
        confere(s.itens.pele_lobo === 1, 'sem a pele no monte: ' + JSON.stringify(s.itens));
        sim.pegaSaque(st, s.id, 'pele_lobo');
        confere(p.inv.pele_lobo === 1, 'não pegou');
        confere(!s.itens.carne ? !st.saque.length : st.saque.length === 1, 'o monte vazio não sumiu');
      });
      teste('saque: longe do monte não pega; o monte some com o tempo', function () {
        var st = novo(), p = st.player; abate(st, 'lobo');
        var s = st.saque[0]; p.x += 20;
        sim.pegaSaque(st, s.id, 'pele_lobo');
        confere(!(p.inv.pele_lobo > 0), 'pegou de longe');
        sim.advance(st, (G.saque.dura || 300) + 5);
        confere(!st.saque.length, 'o monte não sumiu');
      });
      teste('soltar: o item sai da bolsa, vira um monte logo à frente do jogador e volta para a bolsa', function () {
        var st = novo(), p = st.player; p.inv.madeira = 5;
        sim.solta(st, 'madeira', 2);
        confere(p.inv.madeira === 3, 'na bolsa: ' + p.inv.madeira);
        confere(st.saque.length === 1 && st.saque[0].itens.madeira === 2, 'monte: ' + JSON.stringify(st.saque));
        var d = Math.hypot(st.saque[0].x - p.x, st.saque[0].z - p.z);
        confere(d > 0.5 && d <= G.settings.interactRange, 'o monte não ficou logo à frente: ' + d);
        sim.solta(st, 'madeira'); // o resto, no mesmo lugar: junta no mesmo monte
        confere(st.saque.length === 1 && st.saque[0].itens.madeira === 5 && !(p.inv.madeira > 0), 'não juntou: ' + JSON.stringify(st.saque));
        sim.pegaSaque(st, st.saque[0].id, 'madeira', 4);
        confere(p.inv.madeira === 4 && st.saque[0].itens.madeira === 1, 'pegar de volta: ' + p.inv.madeira);
        confere(/não tem/.test(sim.solta(st, 'pele_lobo', 1)), 'soltou o que não tinha');
        sim.advance(st, (G.saque.dura || 300) + 5);
        confere(!st.saque.length, 'o monte solto não sumiu');
      });
      teste('saque: a macro pega sozinha só o que estiver marcado', function () {
        var st = novo(), p = st.player; p.mode = 'macro'; p.macro.on = true; st.saqueDeixa = { carne: true };
        for (var i = 0; i < 6; i++) { var m = abate(st, 'lobo'); m.alive = true; m.hp = G.monsters.lobo.hp; }
        confere(p.inv.pele_lobo === 6, 'peles: ' + p.inv.pele_lobo);
        confere(!(p.inv.carne > 0), 'pegou carne, que estava marcada para ficar');
        confere(st.saque.every(function (s) { return Object.keys(s.itens).join() === 'carne'; }), 'sobrou outra coisa no chão');
      });
      teste('saque: com a bolsa cheia, o que não cabe fica no chão', function () {
        var st = novo(), p = st.player; abate(st, 'lobo');
        p.inv.pedra = NZ.calc.bagCap(world, p) - NZ.calc.bagCount(world, p) + (p.inv.pedra || 0);
        var s = st.saque[0], msg = sim.pegaSaque(st, s.id, 'pele_lobo');
        confere(!(p.inv.pele_lobo > 0) && s.itens.pele_lobo === 1, 'passou do limite da bolsa (' + msg + ')');
      });
      teste('aggro: só bicho bravo conta para a música de combate, e só enquanto persegue', function () {
        var st = novo(), p = st.player, lobo = st.mobs.filter(function (m) { return m.kind === 'lobo'; })[0], coelho = st.mobs.filter(function (m) { return m.kind === 'coelho'; })[0];
        confere(!NZ.calc.perseguido(world, st), 'perseguido na praça');
        coelho.fight = true; confere(!NZ.calc.perseguido(world, st), 'coelho contou'); coelho.fight = false;
        p.x = lobo.x + 2; p.z = lobo.z; p.hp = 1e6; sim.advance(st, 0.5);
        confere(NZ.calc.perseguido(world, st), 'o lobo não pegou o aggro');
        sim.faint(st); confere(!NZ.calc.perseguido(world, st), 'continuou depois do desmaio');
      });
      teste('save de um jogo jogado cabe no armazenamento (menos de 60 KB)', function () {
        var st = novo(); sim.advance(st, 600);
        var kb = JSON.stringify(st).length / 1024;
        confere(kb < 60, Math.round(kb) + ' KB');
      });
    });

    // ---------------------------------------------------------------- raridade e qualidade
    parte('Raridade e qualidade', function () {
      var GI = world.game.items, C = NZ.calc, QQ = world.game.qualidade, RR = world.game.raridade;
      // QUALIDADE (até 5 testes)
      teste('qualidade: o nome concorda com o gênero e a quebra vem da tabela', function () {
        var e = C.variante(world.game, 'espada_ferro~0~2'), m = C.variante(world.game, 'machado_guerra~1~0'), l = C.variante(world.game, 'luvas_couro~6~4');
        confere(e && e.name === 'Espada de ferro enferrujada rara', e && e.name);
        confere(m && m.name === 'Machado de guerra velho', m && m.name);
        confere(l && l.name === 'Luvas de couro celestiais lendárias', l && l.name);
        var st = novo();
        confere(Math.abs(C.chanceQuebra(world, st.player, 'espada_ferro~0~2', 'espada') - QQ.niveis[0].quebra) < 1e-12, 'quebra sem maestria');
        confere(C.varId(world.game, 'espada_ferro', QQ.padrao, 0) === 'espada_ferro', 'a peça padrão e comum não é o id puro');
      });
      function golpesAte(lv) { var t = 0; for (var i = 1; i <= lv; i++) { t += C.custoMaestria(world.game, i); } return t; }
      teste('maestria: começa no 1, 400 ataques até o 2, cada um 43,5% mais caro, e cerca de 143 mil até o 15', function () {
        var M = world.game.maestria, p = novo().player;
        confere(C.custoMaestria(world.game, 1) === 0 && C.custoMaestria(world.game, 2) === 400 && C.custoMaestria(world.game, 3) === 574 && Math.abs(golpesAte(15) - 143000) < 3000, 'custos');
        [[0, 1], [399.5, 1], [400, 2], [973, 2], [974, 3], [golpesAte(15) - 1, 14], [golpesAte(15), 15], [1e7, 15]].forEach(function (c) {
          p.maestria.espada = c[0]; var m = C.nivelMaestria(world, p, 'espada');
          confere(m.lv === c[1], c[0] + ' golpes: nível ' + m.lv);
          confere(m.lv === M.niveis ? m.falta === 0 : m.falta > 0 && m.tem + m.falta === C.custoMaestria(world.game, m.lv + 1), 'falta ' + m.falta);
        });
      });
      teste('maestria: cada nível dá mais que o anterior, e só muda ao subir', function () {
        var antes = 0, passo = 0, p = novo().player;
        confere(C.efeitoMaestria(world.game, 1) === 0, 'o nível 1 já dá efeito');
        for (var lv = 2; lv <= 15; lv++) { var e = C.efeitoMaestria(world.game, lv); confere(e - antes > passo, 'nível ' + lv); passo = e - antes; antes = e; }
        confere(Math.abs(antes - 1) < 1e-12, 'no fim ' + antes);
        p.maestria.espada = 450; var a = C.maestria(world, p, 'espada'); p.maestria.espada = 900;
        confere(C.maestria(world, p, 'espada') === a, 'mudou no meio do nível');
      });
      teste('maestria: crítico até +7% em uso e +4% na macro, só com a arma da classe', function () {
        var p = novo().player, base; p.equip.arma = 'espada_ferro'; base = C.stats(world, p).crit;
        p.maestria.espada = golpesAte(15);
        confere(Math.abs(C.stats(world, p).crit - base - 0.07) < 1e-12, 'em uso ' + C.stats(world, p).crit);
        p.mode = 'macro'; p.macro.on = true; confere(Math.abs(C.stats(world, p).crit - base - 0.04) < 1e-12, 'na macro ' + C.stats(world, p).crit);
        p.macro.on = false; p.equip.arma = 'machado_guerra'; confere(Math.abs(C.stats(world, p).crit - base) < 1e-12, 'com o machado');
        p.equip.arma = null; confere(Math.abs(C.stats(world, p).crit - base) < 1e-12, 'de mãos nuas');
      });
      teste('maestria: o golpe que completa o nível avisa', function () {
        var st = novo(), p = st.player, m = st.mobs.filter(function (x) { return x.alive; })[0], n = 0, em = sim.emit;
        p.equip.arma = 'espada_ferro'; p.maestria.espada = 399; m.hp = 1e6;
        sim.emit = function (s, e) { if (e.type === 'maestria' && e.lv === 2) { n++; } };
        try { sim.swing(st, m); if (!p.equip.arma) { p.equip.arma = 'espada_ferro'; } sim.swing(st, m); } finally { sim.emit = em; }
        confere(n === 1, 'avisos: ' + n);
        confere(st.log.some(function (l) { return /Maestria de espada: nível 2/.test(l.text || l); }), 'sem linha no registro');
      });
      teste('ritmo: um por classe, e a maestria acelera até o número do fim', function () {
        var p = novo().player;
        [['espada_ferro', 4, 3], ['espada_ostanita', 4, 3], ['machado_duas_faces', 4.8, 3.5], ['arco_longo', 4.2, 3.3]].forEach(function (a) {
          var cls = world.game.items[a[0]].class; p.equip.arma = a[0]; p.equip.municao = 'flecha'; p.inv.flecha = 9; p.maestria = {};
          confere(Math.abs(C.stats(world, p).interval - a[1]) < 1e-9, a[0] + ' começa em ' + C.stats(world, p).interval);
          p.maestria[cls] = golpesAte(15); confere(Math.abs(C.stats(world, p).interval - a[2]) < 1e-9, a[0] + ' termina em ' + C.stats(world, p).interval);
        });
      });
      teste('arco: 20-60-20 no começo e 35-60-5 no fim, e o erro gasta flecha e treina', function () {
        function conta(lv) {
          var st = novo(), p = st.player, m = st.mobs.filter(function (x) { return x.alive; })[0], r = [0, 0, 0], em = sim.emit, N = 4000;
          p.equip.arma = 'arco_curto'; p.equip.municao = 'flecha'; p.inv.flecha = N; m.hp = 1e9; p.maestria.arco = golpesAte(lv);
          var q = world.game.qualidade.niveis.map(function (x) { var v = x.quebra; x.quebra = 0; return v; }), de = p.maestria.arco;
          sim.emit = function (s, e) { if (e.type === 'hit') { r[e.errou ? 2 : e.raspao ? 1 : 0]++; } };
          try { for (var i = 0; i < N; i++) { sim.swing(st, m); } } finally { sim.emit = em; world.game.qualidade.niveis.forEach(function (x, j) { x.quebra = q[j]; }); }
          confere(p.inv.flecha === 0 && p.maestria.arco === de + N, 'flechas ' + p.inv.flecha + ', treino ' + (p.maestria.arco - de));
          return r.map(function (x) { return x / N; });
        }
        [[1, [0.2, 0.6, 0.2]], [15, [0.35, 0.6, 0.05]]].forEach(function (c) {
          conta(c[0]).forEach(function (x, i) { confere(Math.abs(x - c[1][i]) < 0.03, 'nível ' + c[0] + ': ' + x + ' em vez de ' + c[1][i]); });
        });
      });
      teste('bichos bravos: um golpe a cada 3 s, parado na finta, e quem sai do alcance escapa', function () {
        ['lobo', 'escorpiao', 'serpente', 'troll'].forEach(function (k) {
          function novoBicho() { var st = novo(), m = st.mobs.filter(function (x) { return x.kind === k; })[0]; st.mobs = [m]; st.player.x = m.x + 0.9; st.player.inv.pocao = 0; st.player.z = m.z; st.player.hp = 1e6; m.fight = true; return { st: st, m: m, p: st.player }; }
          var L = novoBicho(), t = [], em = sim.emit, i;
          sim.emit = function (s, e) { if (e.type === 'hit' && e.who === 'player') { t.push(s.t); } };
          sim.tick(L.st); confere(L.m.atkCd > 2.5 && L.p.atkCd > 3.5, k + ' começou com a barra cheia: ' + L.m.atkCd + ', ' + L.p.atkCd);
          try { for (i = 0; i < 200; i++) { L.p.hp = 1e6; L.p.poison = null; sim.tick(L.st); } } finally { sim.emit = em; }
          confere(t.length >= 11 && t.length <= 14, k + ': golpes em 40 s: ' + t.length);
          L = novoBicho(); for (i = 0; i < 100 && !(L.m.prep > 0); i++) { sim.tick(L.st); }
          confere(L.m.prep > 0, k + ' não armou o golpe');
          L.p.poison = null; var x = L.m.x, hp = L.p.hp, esq = 0; L.p.x = L.m.x + 5; sim.emit = function (s, e) { if (e.type === 'esquiva') { esq++; } };
          try { sim.tick(L.st); confere(L.m.x === x, k + ' andou na finta'); sim.tick(L.st); sim.tick(L.st); } finally { sim.emit = em; }
          confere(esq === 1 && L.p.hp === hp, k + ' não esquivou: ' + esq + ', vida ' + L.p.hp);
        });
      });
      teste('bicho: anda um pouco, para, zanza, vem correndo, ataca e recua, acertando ou não', function () {
        [false, true].forEach(function (esquiva) {
          var st = novo(), m = st.mobs.filter(function (x) { return x.kind === 'lobo'; })[0], p = st.player, em = sim.emit, i, x, z, d, andou, antes = null, trocas = 0, parado = 0, seguidos = 0, maior = 0, n = 0, golpes = 0, recuos = 0, esperando = 0, d0 = 0, houve = false;
          st.mobs = [m]; p.x = m.x + 2; p.z = m.z; m.fight = true;
          sim.emit = function (q, e) { if ((e.type === 'hit' && e.who === 'player') || e.type === 'esquiva') { houve = true; } };
          try {
            for (i = 0; i < 600; i++) {
              p.hp = 1e6; x = m.x; z = m.z;
              if (esquiva && m.prep > 0) { var h = world.spawnById[m.id], k = Math.atan2(h.x - m.x, h.z - m.z); p.x = m.x + Math.sin(k) * 3; p.z = m.z + Math.cos(k) * 3; } // escapa para o lado da toca, para não sair do território
              sim.tick(st); d = Math.hypot(m.x - p.x, m.z - p.z);
              if (houve) { houve = false; golpes++; esperando = 4; d0 = d; }
              else if (esperando && !--esperando && d > d0 + 0.4) { recuos++; }
              if (m.atkCd > 0 && !(m.prep > 0) && d < 4) {
                andou = Math.hypot(m.x - x, m.z - z) > 0.02; n++;
                if (!andou) { parado++; }
                if (antes !== null && andou !== antes) { trocas++; }
                seguidos = andou ? seguidos + 1 : 0; maior = Math.max(maior, seguidos); antes = andou;
              }
            }
          } finally { sim.emit = em; }
          var q = esquiva ? ' (esquivando)' : '';
          confere(golpes > 25, 'golpes' + q + ': ' + golpes); confere(recuos / golpes > 0.8, 'recuou ' + recuos + ' de ' + golpes + q);
          confere(parado / n > 0.25 && parado / n < 0.75, 'parado' + q + ': ' + parado + ' de ' + n);
          confere(trocas > golpes * 2, 'anda e para' + q + ': ' + trocas); confere(maior <= 8, 'andou sem parar' + q + ': ' + maior);
        });
      });
      teste('macro: caça só animal manso, e foge de bicho bravo sem revidar', function () {
        var st = novo(), p = st.player, l = st.mobs.filter(function (x) { return x.kind === 'lobo'; })[0], fases = {}, i;
        p.x = l.x + 10; p.z = l.z; var f = world.nearestFree(p.x, p.z); p.x = f.x; p.z = f.z; sim.startMacro(st, { x: l.x + 8, z: l.z });
        for (i = 0; i < 600; i++) { p.hp = 1e4; sim.tick(st); fases[p.macro.phase] = 1; confere(!(p.action && p.action.type === 'attack'), 'atacou o lobo'); }
        confere(fases.foge && fases.rest && fases.run && p.macro.on && l.hp === world.game.monsters.lobo.hp, 'fases ' + Object.keys(fases));
        // e no mapa os bravos não alcançam os mansos
        var M = world.game.monsters, br = world.spawns.filter(function (s) { return M[s.kind].aggro > 0; }), ma = world.spawns.filter(function (s) { return !(M[s.kind].aggro > 0); });
        br.forEach(function (b) { ma.forEach(function (c) { confere(Math.hypot(b.x - c.x, b.z - c.z) > M[b.kind].leash + M[c.kind].leash, b.id + ' alcança ' + c.id); }); });
      });
      teste('raros: peça rara ou melhor fica com a melhor de duas qualidades', function () {
        var st = novo(), n = 0, alta = 0, N = 6000, i, d;
        for (i = 0; i < N; i++) { d = world.game.items[C.novaPeca(world.game, st, 'sapatos_couro', null, [0, 0, 0, 1, 0])]; if (d.q >= 5) { alta++; } n++; }
        confere(Math.abs(alta / n - (1 - 0.96 * 0.96)) < 0.015, 'radiante ou melhor: ' + alta / n);
      });
      teste('magia: só ligada, gasta mana ou espera, treina 1 (meio na macro) e pode falhar', function () {
        var st = novo(), p = st.player, m = st.mobs.filter(function (x) { return x.alive; })[0], M = world.game.magias;
        confere(/ainda não existem/.test(sim.lanca(st, 'bola_de_fogo')), 'saiu desligada');
        st.magias.on = true; p.x = m.x + 2; p.z = m.z; p.action = { type: 'attack', id: m.id }; m.hp = 1e6;
        confere(st.magias.limite === 'espera', 'o limite de fábrica é ' + st.magias.limite); st.magias.limite = 'mana';
        confere(sim.lanca(st, 'bola_de_fogo') === '' && p.mana === M.mana.base - 8 && p.prof.bola_de_fogo === 1, 'mana ' + p.mana);
        p.mana = 2; confere(/Mana/.test(sim.lanca(st, 'bola_de_fogo')) && p.prof.bola_de_fogo === 1, 'sem mana e saiu');
        st.magias.limite = 'espera'; confere(sim.lanca(st, 'bola_de_fogo') === '' && p.mana === 2 && p.magCd.bola_de_fogo === 6, 'espera');
        confere(/espere/.test(sim.lanca(st, 'bola_de_fogo')), 'não esperou');
        p.magCd = {}; p.mode = 'macro'; p.macro.on = true; sim.lanca(st, 'bola_de_fogo'); confere(p.prof.bola_de_fogo === 2.5, 'treino na macro ' + p.prof.bola_de_fogo);
        p.macro.on = false; p.mode = 'manual'; confere(/cheia/.test(sim.lanca(st, 'revitalizar')), 'curou cheio'); p.hp = 5;
        var r = [0, 0, 0], em = sim.emit, q = golpesAte(1);
        sim.emit = function (s, e) { if (e.type === 'magia') { r[e.falhou ? 2 : e.fraca ? 1 : 0]++; } };
        try { for (var i = 0; i < 3000; i++) { p.magCd = {}; p.hp = 5; p.prof.revitalizar = q; sim.lanca(st, 'revitalizar'); } } finally { sim.emit = em; }
        [0.2, 0.6, 0.2].forEach(function (c, k) { confere(Math.abs(r[k] / 3000 - c) < 0.03, 'nível 0: ' + r); });
      });
      teste('save: o formato 3 zera a maestria de quem já jogava', function () {
        var st = novo(); st.fmt = 2; st.player.maestria = { espada: 900 }; st = NZ.settle(world, NZ.migrate(JSON.parse(JSON.stringify(st))));
        confere(!st.player.maestria.espada, 'não zerou'); st.player.maestria.espada = 7;
        st = NZ.settle(world, NZ.migrate(JSON.parse(JSON.stringify(st)))); confere(st.player.maestria.espada === 7, 'zerou de novo');
      });
      teste('qualidade: a maestria tira chance de quebrar', function () {
        var st = novo(), p = st.player, base = C.chanceQuebra(world, p, 'espada_ferro', 'espada');
        p.maestria.espada = golpesAte(world.game.maestria.niveis);
        var fim = C.chanceQuebra(world, p, 'espada_ferro', 'espada');
        confere(Math.abs(fim - base * (1 - world.game.maestria.corte)) < 1e-12, base + ' → ' + fim);
        confere(C.chanceQuebra(world, p, 'espada_ferro', 'machado') === base, 'a maestria de outra classe valeu');
      });
      teste('qualidade: a arma quebra no golpe, sai da mão e o golpe conta maestria', function () {
        var st = novo(), p = st.player, Q0 = QQ.niveis[0].quebra, m = st.mobs.filter(function (x) { return x.alive; })[0];
        C.variante(world.game, 'espada_ferro~0~0'); p.equip.arma = 'espada_ferro~0~0';
        QQ.niveis[0].quebra = 2; // certeza
        try { sim.swing(st, m); } finally { QQ.niveis[0].quebra = Q0; }
        confere(p.equip.arma === null, 'não quebrou: ' + p.equip.arma);
        confere(p.inv['espada_ferro~0~0~x'] === 1, 'a quebrada não foi para a bolsa: ' + JSON.stringify(p.inv));
        confere(p.maestria.espada === 1, 'maestria ' + p.maestria.espada);
        confere(st.log.some(function (l) { return /quebrou/.test(l.text || l); }), 'sem aviso no registro');
      });
      teste('qualidade: a arma quebra com a macro ligada, ela volta à praça e para', function () {
        var st = novo(), p = st.player, Q = QQ.niveis[QQ.padrao], q0 = Q.quebra, c = st.mobs.filter(function (x) { return x.kind === 'coelho'; })[0];
        p.equip.arma = 'espada_ferro'; p.x = c.x; p.z = c.z; var livre = world.nearestFree(c.x + 2, c.z); p.x = livre.x; p.z = livre.z;
        sim.startMacro(st, { x: c.x, z: c.z }); Q.quebra = 5; // certeza no primeiro golpe
        try { sim.advance(st, 180); } finally { Q.quebra = q0; }
        confere(p.equip.arma === null && p.inv['espada_ferro~' + QQ.padrao + '~0~x'] === 1, 'não quebrou: ' + p.equip.arma);
        confere(!p.macro.on && /arma quebrou/.test(p.macro.stop), 'macro ligada: ' + p.macro.on + ' ' + p.macro.stop);
        confere(p.maestria.espada === 0.5, 'a macro não treinou pela metade: ' + p.maestria.espada);
        confere(Math.hypot(p.x - world.plaza.x, p.z - world.plaza.z) < 4, 'longe da praça: ' + p.x + ', ' + p.z);
      });
      teste('qualidade: a peça e a maestria sobrevivem ao save, num jogo recém-aberto', function () {
        var st = novo(), p = st.player;
        C.variante(world.game, 'arco_longo~5~3'); p.equip.arma = 'arco_longo~5~3'; p.inv['coifa_couro~4~1'] = 1; C.variante(world.game, 'coifa_couro~4~1');
        p.maestria.arco = 42;
        var w2 = new NZ.World(copia(G), copia(V)), st2 = NZ.settle(w2, NZ.migrate(JSON.parse(JSON.stringify(st))));
        confere(st2.player.equip.arma === 'arco_longo~5~3', 'arma ' + st2.player.equip.arma);
        confere(w2.game.items['coifa_couro~4~1'] && w2.game.items['coifa_couro~4~1'].name === 'Coifa de couro ideal incomum', 'coifa sem ficha');
        confere(st2.player.maestria.arco === 42, 'maestria ' + st2.player.maestria.arco);
      });
      // RARIDADE (até 5 testes)
      teste('raridade: multiplica dano, defesa, bônus e preço', function () {
        var b = GI.espada_ostanita, R = RR.niveis[4], v = C.variante(world.game, 'espada_ostanita~3~4'), t = C.variante(world.game, 'gambeson~3~2');
        confere(Math.abs(v.dmg[0] - b.dmg[0] * R.mult) < 0.01 && Math.abs(v.dmg[1] - b.dmg[1] * R.mult) < 0.01, 'dano ' + v.dmg);
        confere(Math.abs(v.bonus.crit - b.bonus.crit * R.mult) < 0.001, 'crítico ' + v.bonus.crit);
        confere(Math.abs(t.def - GI.gambeson.def * RR.niveis[2].mult) < 0.01 && Math.abs(t.bonus.hp - GI.gambeson.bonus.hp * RR.niveis[2].mult) < 0.01, 'gambeson ' + t.def + ' ' + t.bonus.hp);
        confere(v.price > b.price && v.buy > b.buy, 'preço ' + v.price + '/' + v.buy);
        confere(v.interval === b.interval && v.reach === b.reach, 'mexeu no ritmo ou no alcance');
      });
      teste('raridade: bicho com equipamento na lista deixa uma peça no chão', function () {
        var kind = keys(world.game.monsters).filter(function (k) { return (world.game.monsters[k].drops || []).some(function (d) { return d.equip; }); })[0];
        confere(kind, 'nenhum bicho deixa equipamento');
        var def = copia(world.game.monsters[kind]); def.drops = def.drops.filter(function (d) { return d.equip; }); def.drops[0].chance = 1;
        var st = novo(), m = st.mobs[0], s = sim.deixaSaque(st, m, def);
        var ks = s ? Object.keys(s.itens) : [];
        confere(ks.length === 1 && def.drops[0].equip.indexOf(GI[ks[0]].base || ks[0]) >= 0, 'saque ' + ks);
      });
      teste('raridade: a peça se vende a quem compra o item base, pelo preço dela', function () {
        var s = null;
        keys(G.npcs).some(function (id) { return (G.npcs[id].services || []).some(function (x) { if (x.type === 'sell' && (x.items || []).some(function (k) { return C.ehPeca(GI[k]); })) { s = x; return true; } }); });
        if (!s) { return; } // ninguém compra equipamento
        var base = s.items.filter(function (k) { return C.ehPeca(GI[k]); })[0], id = base + '~6~4', st = novo(), p = st.player;
        C.variante(world.game, id); p.inv[id] = 1; p.inv.moeda = 0;
        var msg = sim.sellItem(st, s, id, 1);
        confere(!p.inv[id] && p.inv.moeda === C.sellPrice(world, p, id, 1) && p.inv.moeda > C.sellPrice(world, p, base, 1), msg);
      });
      teste('raridade: a macro deixa no chão a peça marcada como Deixar (pelo item base)', function () {
        var st = novo(), id = 'tunica_couro~2~3'; C.variante(world.game, id);
        st.saque = [{ id: 'sqx', x: st.player.x, z: st.player.z, itens: {}, ate: 1e9 }]; st.saque[0].itens[id] = 1;
        st.saqueDeixa = { tunica_couro: true };
        sim.macroSaque(st, st.saque[0]);
        confere(!st.player.inv[id] && st.saque[0].itens[id] === 1, 'a macro pegou');
        st.saqueDeixa = {}; sim.macroSaque(st, st.saque[0]);
        confere(st.player.inv[id] === 1, 'a macro não pegou com Pegar');
      });
    });

    // ---------------------------------------------------------------- durabilidade, oficina, lojas e pedra de amolar
    parte('Durabilidade, oficina, lojas e pedra de amolar', function () {
      var GG = world.game, C = NZ.calc, O = GG.oficina;
      function bicho(st) { return st.mobs.filter(function (x) { return x.alive && GG.monsters[x.kind].dmg; })[0]; }
      function apanha(st, n) { var m = bicho(st); for (var i = 0; i < n; i++) { st.player.hp = 1e6; sim.hitPlayer(st, m, GG.monsters[m.kind]); } st.player.hp = 1e6; }
      function oficina(npc) { return GG.npcs[npc].services.filter(function (x) { return x.type === 'oficina'; })[0]; }
      function loja(npc) { return GG.npcs[npc].services.filter(function (x) { return x.type === 'shop'; })[0]; }
      // DURABILIDADE (até 5)
      teste('durabilidade: cada golpe recebido gasta 0,3 de todas as peças vestidas, sem mudar a defesa', function () {
        var st = novo(), p = st.player; p.equip.peito = 'gambeson'; p.equip.cabeca = 'capuz_la';
        var def0 = C.stats(world, p).def;
        apanha(st, 10);
        confere(GG.items[p.equip.peito].gasto === 30 && GG.items[p.equip.cabeca].gasto === 30, p.equip.peito + ' / ' + p.equip.cabeca);
        confere(C.stats(world, p).def === def0, 'a defesa mudou com o desgaste');
        var d = C.durabilidade(GG, p.equip.peito);
        confere(d.max === Math.round(GG.qualidade.niveis[GG.qualidade.padrao].dur) && d.resta === Math.ceil(d.max - 3) && d.resta % 1 === 0, JSON.stringify(d));
      });
      teste('durabilidade: a armadura gasta até o fim quebra e fica vestida sem proteger', function () {
        var st = novo(), p = st.player; C.variante(GG, 'gambeson~0~0'); p.equip.peito = 'gambeson~0~0';
        var golpes = Math.ceil(GG.qualidade.niveis[0].dur / O.desgaste - 1e-9);
        apanha(st, golpes - 1);
        confere(!GG.items[p.equip.peito].quebrada, 'quebrou antes da hora');
        apanha(st, 1);
        confere(p.equip.peito === 'gambeson~0~0~x' && GG.items[p.equip.peito].quebrada, 'casa ' + p.equip.peito);
        confere(C.stats(world, p).def === GG.player.defBase && C.stats(world, p).hp === C.stats(world, novo().player).hp, 'quebrada ainda protege');
      });
      teste('durabilidade: a celestial aguenta muito mais que a enferrujada', function () {
        confere(GG.qualidade.niveis[6].dur >= GG.qualidade.niveis[0].dur * 20, 'celestial ' + GG.qualidade.niveis[6].dur);
        confere(C.chanceQuebra(world, novo().player, 'gambeson') === 0, 'peça de defesa rolando dado de quebrar');
      });
      // OFICINA (até 5)
      teste('oficina: reparar cobra pelo desgaste e devolve a peça inteira, mesma qualidade e raridade', function () {
        var st = novo(), p = st.player; C.variante(GG, 'tunica_couro~4~1'); p.equip.peito = 'tunica_couro~4~1'; p.inv.moeda = 1000;
        apanha(st, 50);
        var s = oficina('alfaiate'), L = sim.consertos(st, s);
        confere(L.length === 1 && L[0].tipo === 'reparar' && L[0].custo > 0, JSON.stringify(L));
        var msg = sim.conserta(st, s, L[0].id, 'peito');
        confere(p.equip.peito === 'tunica_couro~4~1' && p.inv.moeda === 1000 - L[0].custo, msg);
      });
      teste('oficina: só o Ferreiro restaura arma quebrada; restaurada volta igual', function () {
        var st = novo(), p = st.player, id = 'machado_guerra~2~3~x'; C.variante(GG, id); p.inv[id] = 1; p.inv.moeda = 1000;
        confere(!sim.consertos(st, oficina('alfaiate')).length, 'o Alfaiate restaura arma');
        var s = oficina('ferreiro'), L = sim.consertos(st, s);
        confere(L.length === 1 && L[0].tipo === 'restaurar', JSON.stringify(L));
        sim.conserta(st, s, id, null);
        confere(!p.inv[id] && p.inv['machado_guerra~2~3'] === 1, JSON.stringify(p.inv));
      });
      teste('oficina: sem moedas não conserta; quebrada não se vende nem se empunha', function () {
        var st = novo(), p = st.player, id = 'espada_aco~3~0~x'; C.variante(GG, id); p.inv[id] = 1; p.inv.moeda = 0;
        sim.conserta(st, oficina('ferreiro'), id, null);
        confere(p.inv[id] === 1, 'consertou de graça');
        confere(sim.sellable(st, id) === 0, 'quebrada à venda');
        sim.equip(st, id); confere(p.equip.arma !== id, 'empunhou a quebrada');
      });
      // LOJAS (até 5)
      teste('lojas: fixos à venda (um de cada), consumíveis sem limite, estoque sai ao comprar', function () {
        var st = novo(), p = st.player, s = loja('ferreiro'), V = sim.vitrine(st, s); p.inv.moeda = 1e6;
        s.fixos.forEach(function (b) { confere(V.some(function (o) { return o.item === b && o.n === 1; }), 'faltou o fixo ' + b); });
        s.items.forEach(function (b) { confere(V.some(function (o) { return o.item === b && o.n === null; }), 'faltou o consumível ' + b); });
        sim.buyItem(st, s, s.fixos[0], 1);
        confere(!sim.vitrine(st, s).some(function (o) { return o.item === s.fixos[0]; }), 'o fixo continuou à venda');
        confere(sim.buyItem(st, s, s.fixos[0], 1) === 'Isso não se compra aqui.', 'comprou o mesmo fixo de novo');
      });
      teste('lojas: dia novo repõe os fixos e sorteia os rotativos dentro do limite da loja', function () {
        var st = novo(), s = loja('ferreiro'), N = GG.lojas.niveis.comum, total = 0;
        for (var d = 1; d <= 60; d++) {
          st.daily.day = '2026-1-' + d;
          var e = sim.estoque(st, s);
          s.fixos.forEach(function (b) { confere(e.itens[b] === 1, 'dia ' + d + ' sem o fixo ' + b); });
          Object.keys(e.itens).forEach(function (k) {
            var it = GG.items[k]; if (!it.base) { return; }
            confere(s.rotativos.indexOf(it.base) >= 0 && N.qualidade[it.q] > 0 && N.raridade[it.r] > 0, 'fora do limite: ' + k);
            total += e.itens[k];
          });
        }
        var med = total / 60 / s.rotativos.length; // média esperada por item: soma de n x peso
        confere(med > 0.8 && med < 2.4, 'média de rotativos por item ' + med);
      });
      teste('lojas: os únicos aparecem às vezes, uma unidade, e o preço segue a qualidade e a raridade', function () {
        var st = novo(), s = loja('ferreiro'), viu = 0;
        for (var d = 1; d <= 200; d++) { st.daily.day = '2027-1-' + d; var e = sim.estoque(st, s); s.unicos.forEach(function (u) { if (e.itens[u.item]) { viu++; confere(e.itens[u.item] === 1, 'mais de um'); } }); }
        confere(viu > 5 && viu < 80, 'únicos em 200 dias: ' + viu);
        C.variante(GG, 'espada_aco~0~0'); C.variante(GG, 'espada_aco~4~1');
        confere(C.buyPrice(world, st.player, 'espada_aco~0~0', 1) < C.buyPrice(world, st.player, 'espada_aco', 1) &&
          C.buyPrice(world, st.player, 'espada_aco~4~1', 1) > C.buyPrice(world, st.player, 'espada_aco', 1), 'preço não segue a peça');
      });
      // PEDRA DE AMOLAR (até 5)
      teste('pedra de amolar: +30% de dano por 5 golpes e gasta um uso', function () {
        var st = novo(), p = st.player, m = bicho(st); p.inv.pedra_amolar = 1; p.equip.arma = 'espada_ferro';
        var msg = sim.afia(st, 'pedra_amolar');
        confere(p.afiada && p.afiada.n === 5 && Math.abs(p.afiada.mult - 0.3) < 1e-9, msg);
        confere(!p.inv.pedra_amolar && p.inv['pedra_amolar~u4'] === 1, JSON.stringify(p.inv));
        m.hp = 1e6; for (var i = 0; i < 5; i++) { sim.swing(st, m); }
        confere(p.afiada === null, 'o fio não acabou: ' + JSON.stringify(p.afiada));
      });
      teste('pedra de amolar: arco não se afia; a esplêndida tem 15 usos e o troll a deixa', function () {
        var st = novo(), p = st.player; p.inv.pedra_amolar_grande = 1; p.equip.arma = 'arco_curto';
        sim.afia(st, 'pedra_amolar_grande'); confere(!p.afiada && p.inv.pedra_amolar_grande === 1, 'afiou o arco');
        confere(GG.items.pedra_amolar_esplendida.usos === 15 && GG.items.pedra_amolar_grande.usos === 10, 'usos');
        confere(GG.monsters.troll.drops.some(function (d) { return d.item === 'pedra_amolar_esplendida' && d.chance === 0.3; }), 'troll');
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
