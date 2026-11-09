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
  - **Fauna:** 2 lobos, 4 escorpiões e 4 serpentes (com veneno), 6 veados que fogem; 5 ovelhas no aprisco.
  - **Fazenda:** leite das vacas (balde, no ferreiro), lã das ovelhas (tesoura, no alfaiate), colheita em 39 retalhos das
    plantações, regra da macro "Colher a plantação", 14 itens novos com compradores.
  - **Interiores** da igreja, ferreiro, taverna, padaria, Casa do Senhor e alfaiataria, com móveis, teto, luz própria
    (lareira, forja, forno, velas) e os lojistas lá dentro; a padeira fixa atrás do balcão; o senhor sentado no salão.
  - **Arte:** alfaiate, lobo, veado, ovelhas, escorpião, serpente, arbustos, três árvores inglesas (carvalho, freixo, olmo)
    com tocos, roupas do século 12, machados e arcos na mão com animação própria, pedras naturais, bordas das regiões
    irregulares e um limite visível do mundo (árvores, sebe e serra).

## Depende de decisão do usuário
- **Anéis e colar:** os espaços existem, sem itens.
- **Reputação:** só tem o número (e o −100 do ataque); o sistema completo fica para depois.
- **XP de missão** cresce com a inteligência (decisão de agente; confirmar).
- **Velocidade de subir de nível:** a macro leva um personagem novo do nível 1 ao 3 em cerca de 5 min com coelhos.
- **Ataque à vila:** um personagem de nível 1 perde para os guardas em segundos (pensado como consequência real).
- **Padeira:** o lenço novo tem um nó em cima que pode parecer um coque de cabelo.

## Falta fazer
- **Mapa e interiores:** o mapa e o minimapa não desenham a planta das salas nem as portas; a seta do jogador aparece certa.
- **Falar através da parede:** clicar num lojista do lado de fora, se estiver perto, abre a janela, mas a loja recusa
  ("Aproxime-se primeiro") sem dizer para entrar na construção.
- **Marcas de missão** ("!") de quem está dentro flutuam no lugar do NPC, não acima da porta.
- **Desacordado:** não existe figura deitada; quem cai some até levantar.
- **Fuga dos moradores:** fogem em linha reta e podem travar em cantos; guardas não desviam uns dos outros.
- **Macro:** não tira leite nem tosquia.
- **Texto de ajuda** do Menu ainda fala só de coelhos; falta citar animais, vacas, ovelhas e plantações.

## Não testado
- Celular de verdade (toque, desempenho com interiores e o mundo maior, instalação como app, abrir sem internet).
- Controle de verdade no PC e no Xbox.
- **Xbox:** falta o usuário dizer qual eixo da câmera fica trocado e o texto da linha "Controle:" no menu. O modo de
  controles de jogo do Edge só liga pelo menu do navegador (segurar Menu).
- Com a interface de verdade (os agentes testaram por código): "andar até aqui" no mapa entrando numa construção, a macro e o
  tempo fora com o personagem dentro de uma sala, o arco atirando de verdade, a perseguição de veado à mão.
- Desempenho: dentro das salas, 150 a 400 desenhos por quadro; na praça, 320 a 500 (antes, 230 a 370). Medido no PC.
