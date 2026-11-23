// Romance de Cavalaria · o texto das notícias. EDITE SÓ AQUI e rode, na pasta do site:
//   node netzach/tools/montar_noticias.mjs
// A ferramenta monta uma página por notícia (noticias/<slug>.html), a lista (noticias/index.html) e o carrossel (noticias.js).
// A mais nova vem primeiro. Campos de cada notícia:
//   slug      o endereço da página (minúsculas e hífens); não mude depois de publicar
//   jogo      "Netzach", "Echad" ou "O site"          data   "AAAA-MM-DD"
//   titulo, resumo (o que aparece no carrossel e na lista), abre (a frase de abertura da página)
//   simbolo   um caractere; tom: a cor da página (ouro, ferro, mata, ceu, sangue, vinho)
//   cena      as figuras do topo (nomes de noticias/img, sem .png); imagem: foto de fundo opcional, na raiz do site
//   partes    as seções: { icone, titulo, texto, itens, tabela: { cabeca, linhas }, antes, agora, nota, forja: true }
//   aberto    os pontos em aberto: { titulo, texto }; cada um ganha o botão Opinar
//   depois    o que mudou desde então (notícias antigas)
// Nos textos, **negrito**. G é o data/game.json: os números saem do jogo, não são copiados à mão.
const pct = (v) => (Math.round(v * 10000) / 100).toLocaleString('pt-BR') + '%';
const num = (v) => v.toLocaleString('pt-BR');
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export default (G) => [
  {
    slug: 'ferro-ferrugem-e-fortuna', jogo: 'Netzach', data: '2026-11-23', simbolo: '⚔', tom: 'ferro',
    titulo: 'Ferro, ferrugem e fortuna',
    resumo: 'Equipamento com qualidade e raridade, armas que quebram, armaduras que se gastam, oficina, lojas com estoque do dia e pedras de amolar.',
    abre: 'Uma espada deixou de ser só uma espada. Ela pode estar enferrujada ou ser celestial, pode partir no meio de uma luta, e pode voltar da bigorna inteira.',
    cena: ['alfaiate', 'ferreiro', 'soldado_escudo', 'troll'],
    partes: [
      {
        icone: '✦', titulo: 'Qualidade: quanto a peça aguenta',
        texto: 'Cada peça de equipamento tem uma de sete qualidades. Na arma, ela decide a chance de quebrar a cada golpe. Na armadura, quanto ela dura.',
        tabela: {
          cabeca: ['Qualidade', 'Arma quebra, por golpe', 'Durabilidade da armadura', 'Preço'],
          linhas: G.qualidade.niveis.map((q) => [cap(q.nome.f), pct(q.quebra), num(Math.round(q.dur)), '×' + num(q.preco)])
        },
        nota: 'As chances valem para quem ainda não tem maestria nenhuma com a arma.'
      },
      {
        icone: '❖', titulo: 'Raridade: quanto a peça rende',
        texto: 'A raridade multiplica o que a peça já tem: dano, defesa e bônus. Ela aparece na cor do nome e na borda da peça dentro da bolsa. O ritmo dos golpes e o alcance não mudam.',
        raridades: true
      },
      { icone: '⚒', titulo: 'Experimente na forja', forja: true, texto: 'Monte uma espada de aço, escolha quanto treino o seu personagem tem e bata cem vezes. São as mesmas contas do jogo.' },
      {
        icone: '⚔', titulo: 'Armas quebram, e a mão aprende',
        texto: 'Cada golpe num bicho joga os dados. No começo o personagem mal sabe segurar a espada, e as armas sofrem com isso.',
        itens: [
          'Cada golpe soma **maestria** com aquele tipo de arma: espada, machado ou arco. Com 300 golpes, ela chega a 50%.',
          'Quanto mais maestria, menor a chance de quebrar. Ela pode cair até um décimo da original.',
          'A arma quebrada **não some**: sai da mão e vai para a bolsa. Com a bolsa cheia, cai no chão, à sua frente.',
          'Cortar lenha com o machado não gasta a arma nem dá maestria.',
          'A janela do personagem mostra a chance de quebrar da arma que está na mão e a maestria de cada tipo.'
        ]
      },
      {
        icone: '⛨', titulo: 'Armaduras se gastam',
        texto: 'Armadura não joga dado: ela se desgasta. Cada golpe que você recebe gasta um pouco de **todas** as peças vestidas.',
        itens: [
          'A proteção e os bônus são os mesmos **até a peça quebrar**.',
          'Quebrada, ela continua no corpo, mas não protege nem dá bônus enquanto não for reparada.',
          'Peça de defesa não tem maestria, pelo menos por enquanto.'
        ]
      },
      {
        icone: '♨', titulo: 'A oficina',
        texto: 'O conserto é pago peça por peça, e a peça volta inteira, com a mesma qualidade e a mesma raridade.',
        tabela: {
          cabeca: ['Serviço', 'Quem faz', 'Quanto custa'],
          linhas: [
            ['Reparar armadura', 'Ferreiro e Alfaiate', 'Até ' + pct(G.oficina.reparo) + ' do preço da peça, conforme o desgaste'],
            ['Restaurar arma quebrada', 'Só o Ferreiro', pct(G.oficina.restauro) + ' do preço da arma']
          ]
        },
        nota: 'O carisma baixa os dois preços. Peça quebrada não se vende, e peça gasta vale menos.'
      },
      {
        icone: '⚖', titulo: 'Lojas com estoque do dia',
        texto: 'As lojas não vendem mais tudo, o tempo todo. O preço de cada peça agora segue a qualidade e a raridade dela.',
        itens: [
          '**Sempre à venda, sem limite:** flechas, balde, tesoura e pedras de amolar.',
          '**Fixos, uma peça de cada por dia:** espada de ferro, machado de trabalho e arco curto no Ferreiro; capuz, calças e luvas de lã e sapatos de couro no Alfaiate.',
          '**Rotativos:** o resto do equipamento é sorteado todo dia, de nenhuma a cinco peças de cada, até a qualidade boa.',
          '**Raridades do balcão:** de vez em quando o Ferreiro tem um lingote de oricalco ou um rubi, e o Alfaiate, uma pérola. Uma unidade só, e cara.'
        ],
        antes: 'A loja tinha tudo, sempre igual, sem limite.', agora: 'Vale a pena passar na loja todo dia.'
      },
      {
        icone: '◆', titulo: 'Pedras de amolar',
        texto: 'Afie a espada ou o machado que está na mão: **+' + pct(G.items.pedra_amolar.afia.mult) + ' de dano nos próximos ' + G.items.pedra_amolar.afia.golpes + ' golpes**. Usar de novo renova, não soma. Arco não se afia.',
        tabela: {
          cabeca: ['Pedra', 'Usos', 'Onde achar'],
          linhas: [
            ['Pedra de amolar', num(G.items.pedra_amolar.usos), 'Ferreiro, ' + G.items.pedra_amolar.buy + ' moedas'],
            ['Pedra de amolar grande', num(G.items.pedra_amolar_grande.usos), 'Ferreiro, ' + G.items.pedra_amolar_grande.buy + ' moedas'],
            ['Pedra de amolar esplêndida', num(G.items.pedra_amolar_esplendida.usos), 'Só o troll, ' + pct(G.monsters.troll.drops.filter((d) => d.item === 'pedra_amolar_esplendida')[0].chance) + ' das vezes']
          ]
        }
      },
      {
        icone: '☠', titulo: 'Saque de equipamento',
        itens: [
          'Lobos às vezes deixam peças de couro.',
          'O troll pode deixar machado de guerra, espada de aço, túnica de couro ou botas de cano alto, muitas vezes melhores que as da loja.'
        ]
      },
      {
        icone: '❦', titulo: 'E também',
        itens: [
          '**Soltar itens no chão:** na Bolsa, clique no item, escolha quantos e solte. O saquinho fica à sua frente por 5 minutos.',
          '**Mais leve:** o menu e a música pesam menos em computador sem placa de vídeo, e o som não deve mais picotar.',
          'O volume da música em 0 agora cala a música de verdade.',
          '"Retornar ao hub" passou para a tela inicial do jogo.',
          'As conversas provisórias dos moradores saíram. Por enquanto eles só cumprimentam; as falas de verdade virão aos poucos.'
        ]
      }
    ],
    aberto: [
      { titulo: 'Os números', texto: 'Chances de quebrar, durabilidade e preços são a primeira versão. Está quebrando demais? De menos?' },
      { titulo: 'Escudos', texto: 'A regra já existe (escudo quebrado vai para a bolsa), mas ainda não há escudos no jogo.' },
      { titulo: 'Cravejar', texto: 'Oricalco, rubi e pérola vão servir para cravejar equipamento. Hoje só se compram e se vendem.' },
      { titulo: 'Mercadores ambulantes e comitivas', texto: 'A ideia é que eles vendam as peças raras, bem caras. Ainda não existem.' },
      { titulo: 'Lojas especiais', texto: 'Alguns ferreiros escolhidos vão vender até a qualidade ideal e a raridade incomum. Nenhum da vila é um deles ainda.' },
      { titulo: 'Onde achar o que é raro', texto: 'Faltam os bandidos, os orcs, os goblins, as masmorras e as missões que dão equipamento.' },
      { titulo: 'A macro e as armas que quebram', texto: 'Se a arma quebra com a macro ligada, ela continua lutando de mãos nuas. Ela deveria parar e avisar?' }
    ]
  },
  {
    slug: 'musica-epica-no-menu', jogo: 'Netzach', data: '2026-11-10', simbolo: '♫', tom: 'vinho',
    titulo: 'Música épica no menu',
    resumo: 'A tela inicial ganhou uma trilha medieval de quase dois minutos, com coro, taikos e trompas, e o jogo novo começa no escuro.',
    abre: 'Um coro no escuro, tambores ao longe. Antes de a primeira imagem aparecer, Netzach já tem uma voz.',
    cena: ['menina', 'menino_a', 'menino_b'],
    partes: [
      {
        icone: '♫', titulo: 'A trilha do menu',
        texto: 'São cerca de 1 minuto e 44 segundos de música medieval e épica, toda feita por código: nenhum arquivo de áudio é baixado.',
        itens: ['Pedal grave, coro, taikos, tímpanos, cordas, metais e trompas.', 'O **motivo do Netzach** aparece no meio, sozinho, e depois com o coro.', 'A tela inicial passou a ter fundo preto.']
      },
      {
        icone: '☾', titulo: 'O começo do jogo novo',
        itens: ['A janela do menu some junto com a música.', 'No escuro, só as crianças rindo.', 'Com a imagem, entram a música calma e o vento no trigo, que seguem durante todo o capítulo.']
      }
    ],
    aberto: [
      { titulo: 'Sons definitivos', texto: 'As trilhas e os efeitos são provisórios. A ideia é trocá-los pelos definitivos quando houver.' },
      { titulo: 'Som no celular', texto: 'Ainda falta ouvir em mais aparelhos. O som sai bem no seu?' }
    ],
    depois: [['2026-11-23', 'A música ficou mais leve: agora é gravada ao abrir o jogo, com as mesmas notas. No volume 0, ela cala de verdade.']]
  },
  {
    slug: 'moradores-com-passos', jogo: 'Netzach', data: '2026-11-10', simbolo: '♟', tom: 'ouro',
    titulo: 'Moradores com passos e o som do trigo',
    resumo: 'Os moradores aparecem de frente, de lado e de costas, e andam com passos. Perto do campo, ouve-se o vento e o trigo.',
    abre: 'A vila deixou de deslizar. Agora ela anda, vira o rosto para você e, perto do campo, sussurra.',
    cena: ['mulher_cesta', 'faz_velho', 'padeira', 'rapaz', 'menina'],
    partes: [
      { icone: '♟', titulo: 'Gente que anda', itens: ['As 22 pessoas da vila ganharam frente, lado e costas, e andam com passos de verdade.', 'Quem para para falar com você fica de frente.', 'Na carroça, a câmera vira para o fazendeiro devagar, em vez de saltar.'] },
      { icone: '≋', titulo: 'O vento no trigo', itens: ['Vento e trigo farfalhando perto do campo, com distância e direção, já na tela inicial.', 'O som fica mais forte quando você anda no meio do trigo.'] },
      { icone: '☾', titulo: 'Acordar no escuro', itens: ['No jogo novo, o menu escurece e ficam dois segundos só com o som do campo.', 'O texto aparece devagar, e então o personagem acorda.'] }
    ],
    aberto: [{ titulo: 'Desenhos definitivos', texto: 'As poses de lado e de costas são provisórias, feitas por código. Serão redesenhadas à mão, uma pessoa por vez.' }],
    depois: [['2026-11-10', 'O começo do jogo novo mudou de novo com a trilha épica do menu.']]
  },
  {
    slug: 'seta-para-o-objetivo', jogo: 'Netzach', data: '2026-11-10', simbolo: '➹', tom: 'ceu',
    titulo: 'Seta para o objetivo e missões rastreáveis',
    resumo: 'Uma seta aponta o objetivo quando ele sai da vista, e no mapa você escolhe qual missão rastrear.',
    abre: 'Perder-se é bom quando a gente quer. Para quando não quer, agora existe uma seta.',
    cena: ['anselmo', 'soldado_lanca'],
    partes: [
      { icone: '➹', titulo: 'A seta', itens: ['Aparece na borda da tela, com a distância, só quando o objetivo não está à vista.', 'No minimapa, o objetivo é uma marca dourada, ou uma seta na borda quando está fora dele.'] },
      {
        icone: '❧', titulo: 'Missões', itens: ['Missão nova ganha um aviso rápido no alto da tela, com o objetivo em vermelho.', 'A lista de missões começa recolhida e lembra quando você a abre.', 'Clique numa missão, no mapa, para ler a descrição e usar o botão **Rastrear**.', 'A seta segue a missão rastreada: a árvore mais perto, o veio, ou quem fez o pedido.']
      },
      { icone: '⌖', titulo: 'O mapa', itens: ['Amplia e afasta com a rodinha do mouse, em volta do ponto embaixo do cursor.', 'Mapa à esquerda, missões no meio e a barra de zoom em pé à direita, no PC e no celular.', 'As cores e os desenhos das regiões não pulam mais com o zoom.'] }
    ],
    aberto: [{ titulo: 'Seta demais ou de menos?', texto: 'O tamanho e o momento em que ela aparece ainda podem mudar. Ela ajuda ou atrapalha?' }]
  },
  {
    slug: 'saque-no-chao', jogo: 'Netzach', data: '2026-11-10', simbolo: '❦', tom: 'mata',
    titulo: 'Saque no chão e portas abertas',
    resumo: 'O que os bichos deixam fica num saquinho no chão, e você escolhe o que pegar. Quatro construções abrem de novo.',
    abre: 'O que cai, fica. Cabe a você decidir o que vale o espaço na bolsa.',
    cena: ['coelho', 'saque', 'lobo'],
    partes: [
      { icone: '❦', titulo: 'O saquinho', itens: ['O bicho abatido deixa um saquinho onde caiu. Clique nele, ou aperte E.', 'Pegue um item por vez, ou tudo, até onde a bolsa deixar.', 'Cada saquinho some depois de 5 minutos.'], antes: 'Tudo ia direto para a bolsa.', agora: 'Você escolhe o que leva.' },
      { icone: '⚙', titulo: 'A macro escolhe por você', itens: ['No menu da macro, o botão **Saque** diz o que ela pega sozinha. O resto fica no chão.'] },
      { icone: '⌂', titulo: 'Portas abertas', itens: ['A padaria, a igreja, a ferraria e a taverna abrem de novo. Estavam fechadas desde o mapa novo.'] },
      { icone: '✎', titulo: 'Saves que continuam', itens: ['O progresso agora passa de uma versão para a outra, em vez de recomeçar do zero.'] }
    ],
    aberto: [{ titulo: 'Cinco minutos bastam?', texto: 'É o tempo até o saquinho sumir. Diga se já perdeu algo por causa dele.' }],
    depois: [['2026-11-23', 'Dá para soltar itens da bolsa no chão, e lobos e trolls passaram a deixar equipamento.']]
  },
  {
    slug: 'a-vila-e-sua', jogo: 'Netzach', data: '2026-11-09', simbolo: '⌂', tom: 'sangue', imagem: 'prev-netzach.jpg',
    titulo: 'A vila é sua: sem atacar os moradores',
    resumo: 'O protagonista é da vila, e a opção Atacar saiu do menu de conversa. As falas passaram a seguir um rodízio.',
    abre: 'Ninguém levanta a espada contra a própria casa. O protagonista agora é da vila, e a vila é dele.',
    cena: ['padre', 'taberneiro', 'mulher_cesta', 'soldado_lanca'],
    partes: [
      { icone: '⌂', titulo: 'Por que tirar o ataque', texto: 'O personagem cresceu na vila. Atacar os moradores não combinava com quem ele é.', itens: ['A opção **Atacar** saiu do menu das pessoas.', 'Um save gravado no meio de uma briga termina a briga ao carregar.'], antes: 'Dava para atacar qualquer pessoa, e a vila pegava em armas.', agora: 'A vila é um lugar seguro, e os perigos estão fora dela.' },
      { icone: '❝', titulo: 'Falas em rodízio', itens: ['Cada pessoa, e cada assunto dela, diz uma fala, depois a outra, e só então recomeça.'] }
    ],
    aberto: [{ titulo: 'Reputação', texto: 'Hoje ela é só um número, que as missões aumentam. O sistema completo fica para depois. Para que ela deveria servir?' }],
    depois: [['2026-11-23', 'As falas provisórias saíram, e com elas o rodízio. As falas de verdade virão aos poucos.']]
  },
  {
    slug: 'troll-da-floresta', jogo: 'Netzach', data: '2026-11-09', simbolo: '☠', tom: 'mata',
    titulo: 'Troll da floresta e itens novos',
    resumo: 'Um troll ronda a floresta. Couro e presa de troll ganharam ícones, e o mapa desenha o piso, os móveis e as portas.',
    abre: 'Há uma toca na floresta que os lobos evitam. Agora você sabe por quê.',
    cena: ['arvore', 'troll', 'arvore_2'],
    partes: [
      { icone: '☠', titulo: 'O troll', itens: ['Chefe único, na Toca do troll.', 'Deixa a **presa**, que o Ferreiro compra, e o **couro**, que o Alfaiate compra.'] },
      { icone: '⌖', titulo: 'Um mapa que mostra por dentro', itens: ['O mapa e o minimapa desenham o piso das salas, os móveis que ocupam o chão e o vão da porta.', 'As marcas de missão de quem está dentro de uma sala ficam acima da porta.'] },
      { icone: '⚙', titulo: 'Também nesta versão', itens: ['A macro ganhou a regra de tirar leite e tosquiar.', 'De fora, falar com alguém avisa que é preciso entrar pela porta.', 'A ajuda do Menu fala de animais, veneno, vacas, ovelhas e plantações.'] }
    ],
    aberto: [{ titulo: 'Mais chefes', texto: 'O troll é o único. Que criatura você gostaria de encontrar?' }],
    depois: [['2026-11-10', 'O troll foi para o meio da floresta, por causa do rio novo.'], ['2026-11-23', 'O troll passou a deixar armas, roupas e a pedra de amolar esplêndida.']]
  },
  {
    slug: 'interiores-fazenda-e-fauna', jogo: 'Netzach', data: '2026-11-08', simbolo: '☘', tom: 'mata',
    titulo: 'Interiores, fazenda e fauna',
    resumo: 'Entre nas construções, tire leite, tosquie as ovelhas, colha as plantações e cuidado com lobos, escorpiões e serpentes.',
    abre: 'As portas se abriram, o curral ganhou trabalho, e o mato ganhou dentes.',
    cena: ['ovelha', 'vaca', 'veado', 'lobo', 'escorpiao'],
    partes: [
      { icone: '⌂', titulo: 'Interiores', itens: ['Igreja, ferraria, taverna, padaria, alfaiataria e a Casa do Senhor, com móveis e teto.', 'Luz própria: lareira, forja, forno e velas.', 'Os lojistas passaram a atender lá dentro.'] },
      { icone: '☘', titulo: 'Fazenda', itens: ['Leite das vacas, com o **balde** do Ferreiro.', 'Lã das ovelhas, com a **tesoura** do Alfaiate.', 'Plantações que se colhem e voltam a crescer, também pela macro.', 'Catorze itens novos, com quem os compre.'] },
      {
        icone: '☠', titulo: 'Fauna',
        tabela: { cabeca: ['Bicho', 'Onde', 'Cuidado'], linhas: [['Lobo', 'Floresta', 'Ataca quem chega perto'], ['Escorpião', 'Pedregal', 'Veneno'], ['Serpente', 'Pedregal', 'Veneno'], ['Veado', 'Campina', 'Foge, e cansa']] }
      },
      { icone: '✎', titulo: 'Arte', itens: ['Três árvores inglesas, com os seus tocos: carvalho, freixo e olmo.', 'Machados e arcos na mão, com animação própria.', 'Roupas do século 12 e bordas naturais entre as regiões.'] }
    ],
    aberto: [{ titulo: 'Desempenho', texto: 'Os interiores ainda pouco foram testados em celular. Conte como rodou no seu.' }],
    depois: [['2026-11-10', 'O mapa foi refeito, com rio, ponte e vaus. Igreja, ferraria, taverna e padaria ficaram fechadas por um tempo e reabriram.']]
  },
  {
    slug: 'mundo-novo', jogo: 'Netzach', data: '2026-11-08', simbolo: '⛰', tom: 'ceu',
    titulo: 'Um mundo novo de 240 × 240 m',
    resumo: 'Floresta, pedregal e campina ao redor da vila, menu inicial com 3 saves, controles no celular e a janela de Personagem.',
    abre: 'A cerca caiu. Em volta da vila agora há floresta, pedra e campo aberto.',
    cena: ['arvore_3', 'arvore', 'soldado_lanca', 'veado', 'arvore_2'],
    partes: [
      { icone: '⛰', titulo: 'O mundo', itens: ['240 × 240 metros, com **floresta**, **pedregal** e **campina**.', 'A vila foi refeita: praça no centro, avenida calçada até a Casa do Senhor, alfaiate e igreja.', 'Horta e trigal maiores, pasto ao norte e aprisco para as ovelhas.'], antes: 'Uma vila cercada.', agora: 'Uma vila aberta, com um mundo em volta.' },
      { icone: '☻', titulo: 'O personagem', itens: ['Janela **Personagem**, com Equipamento, Bolsa e Atributos.', 'Cinco pontos por nível para distribuir entre os atributos.', 'O Ferreiro vende espadas, machados, arcos e flechas; o Alfaiate, roupas de lã e couro.', 'Dano por arma, com ritmo, alcance e armadura.'] },
      { icone: '✎', titulo: 'Três saves', itens: ['Tela inicial com Continuar, Novo jogo e três espaços.', 'O tempo fora conta para cada save.'] },
      { icone: '◎', titulo: 'Controle e celular', itens: ['Os botões e a navegação do controle foram corrigidos.', 'A câmera do controle pode ser invertida no menu.', 'No celular, os botões de toque somem enquanto o controle é usado.'] }
    ],
    aberto: [
      { titulo: 'Anéis e colar', texto: 'As casas existem na janela de Equipamento, mas ainda não há itens para elas.' },
      { titulo: 'Controle no Xbox', texto: 'Falta testar mais. Se você joga no Xbox, conte o que acontece com a câmera.' }
    ],
    depois: [['2026-11-10', 'O mapa foi refeito, com rio, limite natural e a praça em rotatória.'], ['2026-11-23', 'O equipamento ganhou qualidade, raridade e desgaste.']]
  },
  {
    slug: 'echad-em-desenvolvimento', jogo: 'Echad', data: '2026-11-01', simbolo: '✦', tom: 'vinho',
    titulo: 'Echad em desenvolvimento',
    resumo: 'Um RPG em 3D, maior e mais complexo, está sendo feito. Ele vai ter a sua própria página quando puder ser jogado.',
    abre: 'O segundo jogo da franquia já tem nome.',
    cena: [],
    partes: [{ icone: '✦', titulo: 'O que já dá para contar', itens: ['É um **RPG em 3D**, maior e mais complexo que o Netzach.', 'Está em desenvolvimento, e ainda não pode ser jogado.', 'Vai ter a sua própria página quando estiver pronto para isso.'] }],
    aberto: [{ titulo: 'O que você espera dele?', texto: 'É o melhor momento para dizer.' }]
  }
];
