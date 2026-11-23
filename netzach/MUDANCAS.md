# Netzach · mudanças ainda não publicadas

Cada mudança que o jogador percebe ganha uma linha aqui, em linguagem de jogador, quando é commitada no ramo `dev`.
Na publicação (só quando o usuário pede), a notícia do site (uma página, em `noticias/fonte.mjs`, na raiz) é escrita a partir
desta lista, montada com `node netzach/tools/montar_noticias.mjs`, a lista é zerada e roda `tools/publicar.ps1`. Mudanças só internas (código, ferramentas) vão no fim, em "Por dentro".

## Para o jogador

- Tela preta: quando o navegador reinicia a parte gráfica, a imagem volta sozinha em vez de ficar preta até recarregar.
- O jogo roda em torno do dobro da velocidade em computador sem placa de vídeo (ou com placa que o navegador não usa mais), com o mesmo visual.
- A tela inicial abre mais rápido.

## Por dentro

- `js/view.js`, Renderer: três programas de desenho, ordem de perto para longe com o céu por último, malhas com índices, texturas pintadas
  quando aparecem (`textura`, `aquece`) e remontagem quando o contexto WebGL cai (`monta`).
