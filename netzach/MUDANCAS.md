# Netzach · mudanças ainda não publicadas

Cada mudança que o jogador percebe ganha uma linha aqui, em linguagem de jogador, quando é commitada no ramo `dev`.
Na publicação (só quando o usuário pede), a notícia do site (`noticias.js`, na raiz) é montada a partir desta lista,
a lista é zerada e roda `tools/publicar.ps1`. Mudanças só internas (código, ferramentas) vão no fim, em "Por dentro".

## Para o jogador
- "Retornar ao hub" agora fica na tela inicial do jogo (saiu do menu de pausa): para voltar ao site, primeiro se volta ao menu inicial.
- O subtítulo do jogo agora é "em estágio inicial de desenvolvimento" (antes, "protótipo da vila").
- O menu e a música pesam bem menos em computador sem placa de vídeo (o som chiava e picotava): a música agora é gravada ao abrir o jogo
  (com as mesmas notas e efeitos) e o papel dos botões e janelas virou imagem, com a mesma aparência.
- O volume da música em 0 agora cala a música de verdade (antes sobrava o eco da reverberação).
- Dá para soltar itens da bolsa no chão: na Bolsa, clique no item, escolha quantos e "Soltar". Eles caem num saquinho
  logo à frente, que se pega de volta como o saque dos bichos e some depois de 5 minutos.

## Por dentro
- Som: as trilhas são gravadas em pedaços com OfflineAudioContext e tocadas como gravação; o áudio do computador usa o buffer "balanced".
- CSS: o ruído SVG (feTurbulence) do pergaminho virou `css/grao.png` (`tools/gerar_grao.mjs`).
- Sim.solta: o monte solto (st.saque, com solto: true) fica 2,4 m à frente; soltar de novo no mesmo lugar junta no mesmo monte. Teste novo.
