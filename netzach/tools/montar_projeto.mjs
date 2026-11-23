// Romance de Cavalaria · monta as páginas do projeto Netzach (projetos/netzach.html, mecanicas-do-netzach.html e
// campo-de-treinamento.html). Não roda sozinho: netzach/tools/montar_noticias.mjs chama no fim, com as peças comuns do site.
import fs from 'node:fs';
import path from 'node:path';

export function montaProjeto({ SITE, G, V, lista, cabeca, pe, ver, esc, rico, data, tam }) {
  const DIR = path.join(SITE, 'projetos');
  fs.mkdirSync(DIR, { recursive: true });
  const chaves = (o) => Object.keys(o).filter((k) => k[0] !== '_');
  const CSS = `<link rel="stylesheet" href="../${ver('projeto.css')}">\n</head>`;
  // as páginas de notícia apontam "Novidades" para ./ ; daqui é ../noticias/ , e a página atual é Projetos
  const topo = (t, d) => cabeca(t, d, false)
    .replace('montar_noticias.mjs a partir de noticias/fonte.mjs', 'montar_projeto.mjs (rode montar_noticias.mjs)')
    .replace('content="article"', 'content="website"').replace('</head>', CSS)
    .replace(/<a href="\.\/" *>Novidades/, '<a href="../noticias/">Novidades')
    .replace('<a href="../projetos.html">', '<a href="../projetos.html" aria-current="page">');
  const figuras = (fs_) => '<div class="nt-cena" aria-hidden="true">' + fs_.map((f) => { const [w, h] = tam(f); return `<img src="../noticias/img/${f}.png" alt="" width="${w}" height="${h}" style="--w:${w};--h:${h}">`; }).join('') + '</div>';
  const abas = (aqui) => '<nav class="pj-abas" aria-label="Netzach">' + [['netzach', 'O jogo'], ['mecanicas-do-netzach', 'Mecânicas'], ['campo-de-treinamento', 'Campo de treinamento']]
    .map(([u, t]) => `<a href="${u}.html"${u === aqui ? ' aria-current="page"' : ''}>${t}</a>`).join('') + '</nav>';
  const capa = (titulo, abre, cena, tom) => `<main class="nt tom-${tom}">
<header class="nt-topo pj-topo"><div class="nt-brilho" aria-hidden="true"></div>${figuras(cena)}
<div class="nt-tit"><p class="meta"><span class="tag on">Netzach</span></p><h1>${titulo}</h1><p class="nt-abre">${abre}</p></div></header>`;
  const secao = (id, icone, titulo, html) => `<section class="nt-parte" id="${id}"><div class="nt-ic" aria-hidden="true">${icone}</div><div class="nt-corpo"><h2>${titulo}</h2>${html}</div></section>`;
  const p = (t) => `<p>${rico(t)}</p>`;
  const ul = (l) => '<ul>' + l.map((t) => `<li>${rico(t)}</li>`).join('') + '</ul>';
  const grava = (n, h) => fs.writeFileSync(path.join(DIR, n + '.html'), h);

  // ---------------------------------------------------------------- o jogo
  const novas = lista.filter((n) => n.jogo === 'Netzach');
  grava('netzach', topo('Netzach', 'Tudo sobre o Netzach: o jogo, os preços, os dispositivos, as notícias, as mecânicas e o campo de treinamento.') +
    capa('Netzach', 'Uma vila medieval em primeira pessoa, no navegador. Ande, lute, trabalhe, e deixe a macro cuidar do resto.', ['soldado_lanca', 'ferreiro', 'padeira', 'lobo'], 'ouro') +
    abas('netzach') +
    '<p class="pj-acao"><a class="btn" id="netzach-btn" href="../netzach/">Jogar agora</a><a class="btn ghost" href="campo-de-treinamento.html">Campo de treinamento</a></p>' +
    '<nav class="nt-ind" aria-label="Nesta página"><a href="#informacoes">Informações</a><a href="#precos">Preços</a><a href="#dispositivos">Dispositivos</a><a href="#noticias">Notícias</a></nav><div class="nt-partes">' +
    secao('informacoes', '⌂', 'Informações', p('Você acorda num campo de trigo, e a vila é o começo de tudo: moradores com nome, oficinas, fazenda, floresta, pedregal e bichos que não gostam de visita. O combate é punitivo no princípio, para que cada evolução tenha gosto de conquista.') +
      '<dl class="pj-ficha">' + [['Situação', 'Em estágio inicial de desenvolvimento, já jogável'], ['Gênero', 'RPG medieval em primeira pessoa, com trabalho automático (macro)'], ['Onde', 'No navegador, sem instalar nada'], ['Idioma', 'Português do Brasil'],
        ['Jogadores', 'Um'], ['Progresso', 'Salvo no navegador; com conta, também na nuvem'], ['Tempo fora', 'A macro continua por até ' + G.settings.offlineCapHours + ' horas com o jogo fechado']]
        .map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('') + '</dl><p><a href="mecanicas-do-netzach.html">Como o jogo funciona: as mecânicas</a></p>') +
    secao('precos', '⚖', 'Preços', p('Hoje jogar o Netzach não custa nada.') + '<div id="loja" class="pj-loja" data-loja></div><noscript><p>Ainda não há nada à venda.</p></noscript>') +
    secao('dispositivos', '▣', 'Dispositivos', '<div class="pj-disp"><article><h3>Testado</h3><ul><li><b>Computador com Windows</b>, no Brave e no Edge. Medido num Intel Core i5-2400 com 8 GB, sem usar a placa de vídeo: de 32 a 38 quadros por segundo na vila.</li></ul></article>' +
      '<article><h3>Previsto, ainda sem medida</h3><ul><li><b>Celular</b>, com a tela deitada e controles de toque.</li><li><b>Controle</b> no computador.</li><li><b>Xbox</b>, pelo navegador do console.</li></ul></article></div>' +
      '<p class="nt-nota">Jogou em outro aparelho? <a href="../feedback.html">Conte como foi</a>: entra nesta lista.</p>') +
    secao('noticias', '❦', 'Notícias', '<div class="pj-noticias">' + novas.slice(0, 6).map((n) => `<a href="../noticias/${n.slug}.html"><small><time datetime="${n.data}">${data(n.data)}</time></small><b>${esc(n.titulo)}</b><span>${esc(n.resumo)}</span></a>`).join('') + '</div><p><a href="../noticias/">Ver todas as novidades</a></p>') +
    '</div></main>' + pe(`<script src="../${ver('loja.js')}"></script>\n`));

  // ---------------------------------------------------------------- mecânicas (explicado, sem fórmula)
  const M = [
    ['combate', '⚔', 'Combate', p('Todo ataque tem o seu tempo. Depois de cada golpe, a **barra de ação** no meio da tela enche de novo: quando ela fica vermelha, o próximo ataque sai. Espada é a mais rápida, depois o arco, e o machado é o mais lento.') +
      ul(['O lobo também tem o tempo dele, mas sem barra: ele **para e se abaixa** antes do bote. Saia do alcance nesse instante e você escapa.', 'A postura ofensiva bate mais e apanha mais; a defensiva faz o contrário.', 'A armadura tira uma parte do dano. O veneno passa por ela: poção ou padre curam.', 'Se a vida acaba, você desmaia e acorda na praça.'])],
    ['maestria', '✦', 'Maestria', p('O personagem aprende usando. São **15 níveis** para cada classe de arma: espada, machado e arco. Os primeiros vêm em poucas horas; os últimos pedem dedicação de verdade.') +
      ul(['Cada ataque conta, mesmo quando erra ou raspa. Na macro, vale metade.', 'O efeito só muda quando o nível sobe, e os últimos níveis dão mais que os primeiros.', 'Com a maestria a arma quebra menos, o ataque vem mais cedo e o crítico aparece mais. Na macro, o ganho de crítico é menor.', 'Cortar lenha não treina o machado.'])],
    ['arco', '➹', 'Arco', p('Atira de longe e gasta uma flecha por tiro, mas não perdoa iniciante: a maioria dos tiros acerta **de raspão**, alguns vão para o mato e poucos pegam em cheio. A maestria troca quase todos os erros por tiros em cheio.')],
    ['pecas', '❖', 'Qualidade e raridade', p('A **qualidade** vai de enferrujada a celestial e diz quanto a peça aguenta. A **raridade** vai de comum a lendária e diz quanto ela rende: dano, defesa e bônus. As duas aparecem no nome, e a raridade também na cor.') +
      ul(['Peças boas vêm de bichos, e as melhores, do troll.', 'As lojas vendem só peças comuns, com estoque novo todo dia.'])],
    ['quebra', '⚒', 'Quebrar e consertar', p('A **arma** pode quebrar em qualquer golpe; a qualidade e a maestria diminuem esse risco. Quebrada, ela vai para a bolsa. A **armadura** se gasta um pouco a cada golpe que você recebe e, quebrada, fica no corpo sem proteger.') +
      ul(['O Ferreiro restaura armas e repara armaduras; o Alfaiate repara armaduras.', 'A peça volta inteira, com a mesma qualidade e raridade.', 'Pedras de amolar afiam espadas e machados por alguns golpes.'])],
    ['macro', '⚙', 'Macro', p('Marque uma área no mapa e o personagem trabalha sozinho: caça, corta, minera, colhe, bebe poção e volta para descansar, na ordem das regras que você escolher. Continua com a aba fechada, por até ' + G.settings.offlineCapHours + ' horas.') + p('Ela treina mais devagar e acerta menos críticos que você. Se a arma quebra, ela para e o personagem volta à praça mais próxima.')],
    ['vila', '⌂', 'Vila, missões e fazenda', p('Moradores dão missões, o quadro de avisos renova tarefas todo dia, e a fazenda dá trigo, hortaliças, leite e lã. Vender bem e ser reconhecido depende do carisma.')],
    ['magia', '☄', 'Magia (em teste)', p('A magia ainda não chegou ao mundo do jogo: está em teste, com **bola de fogo** e **revitalizar**. Ela segue a ideia do arco: no começo falha ou sai fraca quase sempre, e a **proficiência**, uma para cada magia, melhora com o uso.') + '<p class="nt-nota">Os números e a forma de aprender magia ainda podem mudar.</p>']
  ];
  grava('mecanicas-do-netzach', topo('Mecânicas do Netzach', 'Como funcionam o combate, a maestria, o arco, a qualidade, a raridade, os consertos, a macro e a magia do Netzach.') +
    capa('Mecânicas', 'O que o jogo faz por trás da cortina, em palavras.', ['ferreiro', 'alfaiate', 'padre', 'troll'], 'ferro') + abas('mecanicas-do-netzach') +
    '<nav class="nt-ind" aria-label="Nesta página">' + M.map((m) => `<a href="#${m[0]}">${m[2]}</a>`).join('') + '</nav><div class="nt-partes">' + M.map((m) => secao(...m)).join('\n') +
    '</div><p class="pj-acao"><a class="btn" href="campo-de-treinamento.html">Calcular o meu tempo no campo de treinamento</a></p></main>' + pe());

  // ---------------------------------------------------------------- campo de treinamento: as contas do jogo, com os dados de game.json
  const pontos = {};
  (V.regions || []).forEach((r) => (r.spots || []).forEach((s) => { pontos[s.kind] = (pontos[s.kind] || 0) + 1; }));
  const D = {
    M: G.maestria, armorK: G.combat.armorK, crit: [G.player.critBase, G.player.critMult], postura: G.stances.ofensiva.dmg, desmontagem: 5,
    classes: Object.fromEntries(chaves(G.weaponClasses).map((c) => [c, { nome: G.weaponClasses[c].name, ritmo: G.weaponClasses[c].ritmo, acerto: G.weaponClasses[c].acerto || null, fraco: G.weaponClasses[c].fraco || 0 }])),
    armas: chaves(G.items).filter((k) => G.items[k].slot === 'arma').map((k) => ({ id: k, nome: G.items[k].name, cls: G.items[k].class, dmg: G.items[k].dmg, crit: (G.items[k].bonus || {}).crit || 0, critMult: (G.items[k].bonus || {}).critMult || 0 })),
    q: G.qualidade.niveis.map((q) => q.nome.f), qp: G.qualidade.saque, r: G.raridade.niveis.map((r) => ({ nome: r.nome.f, mult: r.mult })), rp: G.raridade.saque,
    bichos: chaves(G.monsters).map((k) => { const m = G.monsters[k]; return { id: k, nome: m.name, hp: m.hp, def: m.def || 0, volta: m.respawn, grupo: m.count || 1, pontos: pontos[m.spot] || 1, total: m.spot ? (m.count || 1) * (pontos[m.spot] || 1) : (V.rabbits || []).length,
      drops: (m.drops || []).map((d) => (d.equip ? { c: d.chance, equip: d.equip.map((e) => [e, G.items[e].name]), q: d.qualidade, r: d.raridade } : { c: d.chance, item: d.item, nome: G.items[d.item].name, n: d.n || 1 })) }; }),
    magias: { mana: G.magias.mana, acerto: G.magias.acerto, lista: chaves(G.magias.lista).map((k) => ({ id: k, nome: G.magias.lista[k].name, mana: G.magias.lista[k].mana, espera: G.magias.lista[k].espera })) }
  };
  const op = (l) => l.map(([v, t, s]) => `<option value="${v}"${s ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const niveis = Array.from({ length: G.maestria.niveis + 1 }, (_, i) => [i, 'Nível ' + i]);
  grava('campo-de-treinamento', topo('Campo de treinamento', 'Calcule quanto tempo leva para conseguir um item raro, subir a maestria de uma arma ou a proficiência de uma magia no Netzach.') +
    capa('Campo de treinamento', 'Diga com o que você luta, contra quem e quanto já treinou. Os alvos de palha fazem a conta.', ['soldado_escudo', 'lobo', 'soldado_lanca'], 'mata') + abas('campo-de-treinamento') +
    `<section class="ct" id="ct" data-ct="${esc(JSON.stringify(D))}"><h2>Você</h2><div class="ct-form">
<label>Arma<select id="ct-arma">${op(D.armas.map((a) => [a.id, a.nome + ' (' + D.classes[a.cls].nome.toLowerCase() + ')']))}</select></label>
<label>Raridade da arma<select id="ct-rar">${op(D.r.map((r, i) => [i, r.nome]))}</select></label>
<label>Criatura<select id="ct-bicho">${op(D.bichos.map((b) => [b.id, b.nome, b.id === 'lobo']))}</select></label>
<label>Nível de maestria<select id="ct-lv">${op(niveis)}</select></label>
<label>Como joga<select id="ct-modo"><option value="uso">Eu mesmo, em uso</option><option value="macro">Na macro</option></select></label>
<label>Horas por dia<input id="ct-dia" type="number" min="0.5" max="24" step="0.5" value="4"></label>
</div><p class="ct-res" id="ct-luta" role="status"></p>
<div class="ct-cartas">
<article><h2>Item raro</h2><label>O que você quer<select id="ct-item"></select></label><div id="ct-peca"><label>Qualidade, pelo menos<select id="ct-q">${op(D.q.map((q, i) => [i, q]))}</select></label><label>Raridade, pelo menos<select id="ct-r">${op(D.r.map((r, i) => [i, r.nome]))}</select></label></div><div class="ct-saida" id="ct-s1" role="status"></div></article>
<article><h2>Maestria</h2><label>Classe<select id="ct-cls"></select></label><label>Até o nível<select id="ct-alvo">${op(niveis.slice(1).map(([v, t]) => [v, t, v === 5]))}</select></label><div class="ct-saida" id="ct-s2" role="status"></div></article>
<article><h2>Magia <small>em teste</small></h2><label>Magia<select id="ct-mag">${op(D.magias.lista.map((m) => [m.id, m.nome]).concat([['todas', 'As duas']]))}</select></label><label>Limitada por<select id="ct-lim"><option value="mana">Mana</option><option value="espera">Tempo de espera</option><option value="ambos">Mana e espera</option></select></label><label>Do nível<select id="ct-mlv">${op(niveis.slice(0, -1))}</select></label><label>Até o nível<select id="ct-mal">${op(niveis.slice(1).map(([v, t]) => [v, t, v === 5]))}</select></label><div class="ct-saida" id="ct-s3" role="status"></div></article>
</div><p class="nt-nota">É uma estimativa. Conta o tempo de luta, uns 5 segundos de caminhada entre uma criatura e outra e o tempo de ela voltar. A macro caça um ponto do mapa; em uso, contamos todos os pontos da criatura. Não conta desmaios, descanso, armas quebradas, atributos nem poções.</p><noscript><p>Para usar o campo de treinamento, ligue o JavaScript.</p></noscript></section></main>` +
    pe(`<script src="../${ver('treino.js')}"></script>\n`));
  console.log('3 páginas do Netzach montadas.');
}
