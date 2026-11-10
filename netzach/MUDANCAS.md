# Netzach · mudanças ainda não publicadas

Cada mudança que o jogador percebe ganha uma linha aqui, em linguagem de jogador, quando é commitada no ramo `dev`.
Na publicação (só quando o usuário pede), a notícia do site (`noticias.js`, na raiz) é montada a partir desta lista,
a lista é zerada e roda `tools/publicar.ps1`. Mudanças só internas (código, ferramentas) vão no fim, em "Por dentro".

## Para o jogador
- Os saves não recomeçam mais do zero quando sai uma versão nova: o progresso passa de uma versão para a outra.

## Por dentro
- Testes automáticos dos dados e da simulação (`testes/`).
- Registro dos erros que acontecem no jogo dos jogadores (`js/erros.js`; falta criar a tabela no Supabase).
- Ramo `dev`, script de versão e de publicação.
- Verificador de código (ESLint) e testes pelo Node, rodando antes de cada publicação.
