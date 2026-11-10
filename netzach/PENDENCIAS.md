# Netzach · o que falta (registro de 9/11/2026)

O pedido grande de 8/11 foi feito em duas ondas de agentes, e as duas estão prontas (versão `20261109-1`).
Este arquivo lista o que ainda falta, o que depende de decisão do usuário e o que não foi testado.

## Feito (para referência)
- **Onda 1:** mundo novo da imagem do usuário (240 × 240 m, floresta, pedregal e campina), menu inicial com 3 saves,
  controle no celular, janela Personagem (equipamento, bolsa e atributos), armas no ferreiro, roupas no alfaiate, modelo de dano.
- **Onda 2:**
  - **NPCs:** menu Conversar, Negociar, Atacar e Fechar para as 22 pessoas, falas com personalidade (`game.json` → `pessoas`),
    ataque com −100 de reputação por incidente, soldados e homens atacam, mulheres e crianças fogem, quem cai levanta em 2 min,
    a hostilidade acaba com desmaio (multa de 25% das moedas) ou ficando 60 s longe da vila (`game.json` → `aldeoes`).
    **Em 9/11 (versão `20261109-10`) a opção Atacar saiu do menu:** o protagonista é da vila e não ataca os moradores.
    O código da briga, da morte e dos substitutos continua no jogo, sem uso; dá para apagar depois.
  - **Fauna:** 2 lobos, 4 escorpiões e 4 serpentes (com veneno), 6 veados que fogem; 5 ovelhas no aprisco.
  - **Fazenda:** leite das vacas (balde, no ferreiro), lã das ovelhas (tesoura, no alfaiate), colheita em 39 retalhos das
    plantações, regra da macro "Colher a plantação", 14 itens novos com compradores.
  - **Interiores** da igreja, ferreiro, taverna, padaria, Casa do Senhor e alfaiataria, com móveis, teto, luz própria
    (lareira, forja, forno, velas) e os lojistas lá dentro; a padeira fixa atrás do balcão; o senhor sentado no salão.
  - **Arte:** alfaiate, lobo, veado, ovelhas, escorpião, serpente, arbustos, três árvores inglesas (carvalho, freixo, olmo)
    com tocos, roupas do século 12, machados e arcos na mão com animação própria, pedras naturais, bordas das regiões
    irregulares e um limite visível do mundo (árvores, sebe e serra).
- **Feito em 9/11 (versão `20261109-2`):**
  - **Mapa e minimapa** desenham o piso das salas, os móveis que ocupam o chão e o vão da porta com os batentes.
  - **Falar através da parede:** de fora, o clique e a loja dizem "Fulano está dentro: entre na ferraria pela porta" (e de
    dentro, "Saia da … para falar com …").
  - **Marcas de missão** de quem está dentro de uma sala ficam acima da porta enquanto o jogador está fora.
  - **Desacordado** fica deitado no chão (a mesma figura, de lado) até levantar; quem estava sentado cai no chão.
  - **Fuga dos moradores:** escolhem um refúgio longe do jogador e vão por caminho, contornando casas e cantos.
    **Guardas** e moradores não ficam um em cima do outro (0,8 m) e cercam o jogador lado a lado em vez de em fila.
  - **Macro:** regra nova "Tirar leite e tosquiar dentro da área" (só com balde ou tesoura na bolsa). Vacas e ovelhas
    agora passeiam pelo relógio do jogo, então a macro e o tempo fora sabem onde estão.
  - **Ajuda** do Menu fala de animais, veneno, vacas, ovelhas, plantações e das regras novas da macro.

## Mapa refeito pelo rascunho do usuário (10/11, versão `20261110-6`)
- **Feito:** planta nova (`data/vila.json`, mapa 4): floresta a noroeste, pedregal a nordeste descendo pelo leste, campina ao sul,
  pasto ao norte da vila e aprisco ao lado dele; cidade em cruz com a praça como rotatória no cruzamento (a avenida para na
  borda da praça, dos dois lados); 3 moradias de cada lado da avenida a oeste, alfaiate e ferreiro junto à praça, igreja e
  taverna do outro lado, padaria a leste e a Casa do senhor no fim da avenida; horta e trigo do mesmo tamanho (40 × 35 m),
  um de cada lado da estrada; limite jogável com a forma da linha preta do rascunho (fora dela tudo bloqueia e a mata do
  limite acompanha a curva); divisa entre terrenos em degradê pontilhado; bichos reposicionados (lobos e troll na floresta,
  escorpiões e serpentes no pedregal, veados na campina, coelhos na mata rala do oeste) e as cenas da campanha no trigo novo.
- **Rio** (segundo rascunho): nasce no norte da floresta, desce pelo oeste e se divide em dois braços na campina. A água
  bloqueia; atravessa-se pela ponte (caminho de terra que sai da avenida para o oeste) e por três vaus de pedras (na floresta,
  no braço do sudoeste e na campina). O troll e um covil de lobos ficariam em cima do rio e foram para o meio da floresta.
  **Decisão minha:** a ponte e os vaus não estão no rascunho; sem eles o rio cortaria o oeste do mapa.
- **Saves antigos:** ao abrir, quem estava no mundo volta para a praça (no meio da campanha, para o começo do trigo); os bichos
  voltam às tocas. As árvores, veios e retalhos das plantações recomeçam inteiros.
- **Decisões minhas, para confirmar:** eram 8 moradias, ficaram 6 (como no rascunho); o aprisco não aparece no rascunho e
  ficou ao lado do pasto, a leste; a cidade ficou um pouco maior que no rascunho, porque as construções têm o tamanho de antes.
- **Não testado:** celular (a máscara do chão usa uma segunda textura no sombreador) e a campanha inteira de novo com o campo novo.

## Menu inicial e som (10/11, versão `20261110-7`)
- **Feito:** o Modo livre só aparece no modo desenvolvedor (5 cliques no "Netzach" do menu inicial ou do Menu); a conta
  (entrar/sair) só aparece na primeira tela do menu inicial; em Novo jogo, "Começar a campanha" logo abaixo do nome e
  "Voltar ao menu inicial" embaixo; o botão Som virou a tela de Configurações (som ligado/desligado, volume da música e
  dos efeitos); risadas das crianças 15% mais altas.
- **Som no celular:** a causa provável era o destrave: o som só tentava destravar no começo do toque, que o celular não
  aceita. Agora destrava no fim do toque e no clique, usa um buffer maior e eco mais curto no celular, e para quando a aba
  some. **Não testado num celular de verdade.**

## Campanha (começou em 10/11, versão `20261110-5`)
- **Feito:** modo Campanha ou Modo livre no jogo novo; tela inicial com o fundo deitado no trigo; o capítulo do trigo inteiro
  (acordar, seguir a figura ou ficar 5 s parado, o puxão do fazendeiro, tutorial de colheita por aparelho, fuga do campo,
  5 fardos, carroça, moedas, terminar o campo ou recusar, fim do capítulo). Testado no navegador do PC, por código.
- **Decisões minhas, para confirmar:**
  - na campanha o personagem começa **sem a espada** e com 0 moedas e 2 poções (`game.json` → `campanha.semArma`, `itens`);
  - "Terminar o campo" dá as 15 moedas e 45 de experiência **de uma vez**, ao levar o trigo à carroça (o roteiro fala em
    1 moeda e 3 de experiência por fardo);
  - "Ficar parado" e "Seguir" mostram a mesma fala do roteirizador; "Colher o trigo" é escolhida ao começar a colher, e
    "Tentar fugir" ao sair do campo (com 5 m de folga). Fugir depois do tutorial só traz de volta, sem cena;
  - a figura misteriosa usa a figura do rapaz pintada de escuro, e o fazendeiro é o fazendeiro velho da horta;
  - as diárias, a macro e o tempo fora continuam valendo na campanha (só o céu ficou parado).
- **Falta:**
  - os sons são provisórios, feitos por código em `js/som.js` (trilha da tela inicial, crianças rindo, menus, missão): trocar
    pelos definitivos quando houver;
  - a cena do pasto ("me encontre perto do pasto"): hoje o capítulo termina e, ao abrir o save de novo, o jogador começa na
    praça; falta escrever a cena e ligar;
  - a cena "Recusar oferta" está vazia no roteirizador (o capítulo só termina).
- **Não testado:** celular e controle de verdade na campanha; o ritmo do acordar com o jogo à vista (o teste foi com o
  navegador em segundo plano).

## Depende de decisão do usuário
- **Anéis e colar:** os espaços existem, sem itens.
- **Reputação:** só tem o número (e o −100 do ataque); o sistema completo fica para depois.
- **XP de missão** cresce com a inteligência (decisão de agente; confirmar).
- **Velocidade de subir de nível:** a macro leva um personagem novo do nível 1 ao 3 em cerca de 5 min com coelhos.
- **Ataque à vila:** um personagem de nível 1 perde para os guardas em segundos (pensado como consequência real).
- **Padeira:** o lenço novo tem um nó em cima que pode parecer um coque de cabelo.

## Falta fazer
- Nada da lista de 9/11 (ver "Feito em 9/11" acima).

## Não testado
- Celular de verdade (toque, desempenho com interiores e o mundo maior, instalação como app, abrir sem internet).
- Controle de verdade no PC e no Xbox.
- **Xbox:** falta o usuário dizer qual eixo da câmera fica trocado e o texto da linha "Controle:" no menu. O modo de
  controles de jogo do Edge só liga pelo menu do navegador (segurar Menu).
- Com a interface de verdade (os agentes testaram por código): "andar até aqui" no mapa entrando numa construção, a macro e o
  tempo fora com o personagem dentro de uma sala, o arco atirando de verdade, a perseguição de veado à mão.
- 9/11: a macro no pasto e no aprisco, a mensagem da parede, a figura deitada, as marcas na porta e o mapa foram
  vistos no navegador do PC; a fuga e o cerco dos guardas, só por código (simulação), não numa briga de verdade.
- Desempenho: dentro das salas, 150 a 400 desenhos por quadro; na praça, 320 a 500 (antes, 230 a 370). Medido no PC.
