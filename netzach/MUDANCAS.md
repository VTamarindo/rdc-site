# Netzach · mudanças ainda não publicadas

Cada mudança que o jogador percebe ganha uma linha aqui, em linguagem de jogador, quando é commitada no ramo `dev`.
Na publicação (só quando o usuário pede), a notícia do site (uma página, em `noticias/fonte.mjs`, na raiz) é escrita a partir
desta lista, montada com `node netzach/tools/montar_noticias.mjs`, a lista é zerada e roda `tools/publicar.ps1`. Mudanças só internas (código, ferramentas) vão no fim, em "Por dentro".

## Para o jogador

- Combate mais lento e mais punitivo: espada ataca a cada 4 s, machado 4,8 s e arco 4,2 s (no nível 15 de maestria: 3 s, 3,5 s e 3,3 s). O ritmo é igual para todas as armas da classe, e o dano de ostanita, duas faces e arco longo foi acertado para compensar. Mãos nuas: 4 s.
- Barra de ação no meio da tela: mostra quando sai o próximo ataque.
- O lobo ataca a cada 3 s e para 0,3 s armando o bote; quem sai do alcance escapa.
- Maestria em 15 níveis por classe de arma: 400 ataques no primeiro, e cada nível custa 60% a mais que o anterior. Recomeça do zero para todos. Na macro, cada ataque vale metade.
- O efeito é maior nos últimos níveis e só muda ao subir: no 15, a arma quebra 25% menos, e o crítico ganha 7% em uso ou 4% na macro.
- Arco impreciso: no começo, 20% em cheio, 60% de raspão (um terço do dano) e 20% erra; no nível 15, 35%, 60% e 5%.
- Site: o Netzach ganhou uma página (informações, preços, dispositivos, notícias), as mecânicas explicadas e o Campo de treinamento, que calcula tempos.

## Por dentro

- Magias de teste (bola de fogo e revitalizar), só no modo desenvolvedor: mana, espera ou as duas (`game.json` → `magias`; `Sim.prototype.lanca`). Regras de macro para as duas.
- `FORMATO_SAVE` 3. Páginas do projeto: `netzach/tools/montar_projeto.mjs`, chamado por `montar_noticias.mjs`; `treino.js`, `loja.js` (ambiente de loja, sem pagamento), `projeto.css`.
