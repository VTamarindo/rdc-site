# Netzach · mudanças ainda não publicadas

Cada mudança que o jogador percebe ganha uma linha aqui, em linguagem de jogador, quando é commitada no ramo `dev`.
Na publicação (só quando o usuário pede), a notícia do site (`noticias.js`, na raiz) é montada a partir desta lista,
a lista é zerada e roda `tools/publicar.ps1`. Mudanças só internas (código, ferramentas) vão no fim, em "Por dentro".

## Para o jogador
- Os saves não recomeçam mais do zero quando sai uma versão nova: o progresso passa de uma versão para a outra.

- Os moradores agora têm frente, lado e costas, e andam com passos de verdade (desenhos provisórios).
- Quem para para falar com você fica de frente; na carroça, a câmera vira para o fazendeiro devagar.
- O mapa amplia e afasta com a rodinha do mouse, em volta do ponto embaixo do mouse; a cor e os desenhos das regiões não pulam mais com o zoom.
- Som de vento e de trigo farfalhando perto do campo, com distância e direção (já na tela inicial).
- Jogo novo: o menu escurece, ficam dois segundos só com o som do campo, e então o texto (aparecendo devagar) e o acordar.
- Dá para entrar de novo na padaria, na igreja, na ferraria e na taverna (estavam fechadas desde o mapa novo).
- Seta para o objetivo: na borda da tela quando ele não está à vista, e no minimapa (marca dourada, ou seta na borda quando fica fora dele).
- Missão nova: aviso rápido no alto da tela, com o objetivo em vermelho. A lista de missões começa recolhida.
- Mapa (PC e celular): o mapa à esquerda, as missões no meio e a barra de zoom em pé na direita. Clicar numa missão mostra a descrição e o botão Rastrear; a seta segue a missão rastreada (madeira: a árvore mais perto; ferro: o veio; entregar: quem pediu).

- O que os bichos deixam fica no chão, num saquinho: clique nele (ou aperte E) e escolha o que pegar. A macro pega sozinha
  o que estiver marcado no botão Saque, no menu dela; o resto fica no chão. Cada saquinho some depois de 5 minutos.

## Por dentro
- Arte desenhada no Aseprite (`art/fonte/`), montada no atlas por `tools/montar_atlas.py`; atlas 10% menor.
- Testes automáticos dos dados e da simulação (`testes/`).
- Registro dos erros que acontecem no jogo dos jogadores (`js/erros.js`; falta criar a tabela no Supabase).
- Ramo `dev`, script de versão e de publicação.
- Verificador de código (ESLint) e testes pelo Node, rodando antes de cada publicação.
