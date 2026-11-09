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
