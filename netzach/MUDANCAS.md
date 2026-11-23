# Netzach · mudanças ainda não publicadas

Cada mudança que o jogador percebe ganha uma linha aqui, em linguagem de jogador, quando é commitada no ramo `dev`.
Na publicação (só quando o usuário pede), a notícia do site (uma página, em `noticias/fonte.mjs`, na raiz) é escrita a partir
desta lista, montada com `node netzach/tools/montar_noticias.mjs`, a lista é zerada e roda `tools/publicar.ps1`. Mudanças só internas (código, ferramentas) vão no fim, em "Por dentro".

## Para o jogador
- Se a arma quebra com a macro ligada, a macro para e o personagem volta à praça mais próxima.
- Na Bolsa, ao clicar numa arma ou roupa, os atributos aparecem comparados com os da peça equipada: em verde o que é melhor,
  em vermelho o que é pior, com a diferença ao lado.
- Som de armamento quebrando, um para cada tipo: espada, machado, arco e roupa.
- Música de combate: entra quando um bicho bravo (lobo, escorpião, serpente ou troll) começa a perseguir você, e sai 4 segundos
  depois que o último desiste ou cai.

## Por dentro
- Trilha `combate` em `js/som.js` (140 bpm, 40 compassos, ~69 s em laço), gravada em 24 kHz e na frente da fila ao entrar no jogo; se um trecho ainda não gravou, repete os prontos.
