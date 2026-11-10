# Netzach · plano de aplicação (10/11/2026)

O que já existe está em `PENDENCIAS.md` e em `GUIA-DO-CODIGO.md`. Este arquivo é o caminho para frente: o mundo grande, os
eventos, as regiões novas, a arte animada e o que falta do jogo em relação ao padrão da indústria. Nada aqui foi feito ainda.

Tamanho de cada item: **P** = uma conversa, **M** = alguns dias, **G** = uma ou mais semanas.

---

## Retrato de hoje (varredura de 10/11)

| Parte | Como está | O que pesa para crescer |
| --- | --- | --- |
| Mundo | 240 × 240 m, montado inteiro ao abrir (`buildStatic`), névoa fecha a 150 m | 845 objetos, 159 mil triângulos, 67 texturas. Com 10× de largura seriam ~100× isso |
| Desenho | WebGL próprio (`js/view.js`), uma chamada de desenho por objeto; as peças fixas já viram uma malha por textura | Sem divisão por região: tudo existe o tempo todo |
| Chão | Uma máscara de 256 × 256 px para o mapa inteiro (`MASCARA`) | Num mapa grande fica borrada |
| Simulação | `js/sim.js` passa por todos os bichos e moradores a cada passo | Bichos a quilômetros gastam igual aos de perto |
| Arte | Gerada por código (`tools/gerar_arte.py`, 2.828 linhas): 1 quadro por figura; `sprites.png` (200 KB) | Sem frente/lado/costas, sem passos. Ao abrir, cada figura já vira uma textura própria |
| Dados | `vila.json` (mapa), `game.json` (regras, itens, falas), `campanha.json` (do roteirizador) | Um só mapa; tudo junto num arquivo de regras de 48 KB |
| Código | JavaScript puro, sem etapa de montagem. `ui.js` 2.372 linhas, `view.js` 1.911, `sim.js` 1.590 | Arquivos grandes; sem testes automáticos |
| Save | `localStorage` + nuvem (Supabase), 3 espaços, `SAVE_VER` recomeça do zero quando muda | Sem migração por versão: mudar o formato apaga o progresso |
| Publicação | Tudo o que vai para a `main` entra no site | Não dá para guardar trabalho no GitHub sem publicar |

---

## Fase 0 · Jeito de trabalhar (antes de tudo)

1. **[P] Ramo `dev` para o dia a dia.** Os dois computadores enviam e puxam do `dev`; o site não muda. Quando o usuário pedir,
   junto com o post, o `dev` entra na `main` e o site atualiza. *Confirmar:* se a hospedagem publica só a `main` (parece que sim).
2. **[P] Diário de mudanças (`MUDANCAS.md`).** Cada commit no `dev` deixa uma linha do que mudou, em linguagem de jogador.
   O post da atualização sai dele, e ele zera depois do post.
3. **[P] Versão automática.** Hoje o `?v=` é trocado à mão em 9 lugares do `index.html` e no `ui.js`. Um script que troca
   tudo de uma vez (o mesmo que vai juntar o `dev` na `main`).

## Fase 1 · Arte separada por personagem, com animação

**Minha opinião:** você está certo que precisa separar, mas o problema não é o atlas em si: é ter **um só desenho por figura**.
O padrão da indústria é:
- **Fonte separada:** uma pasta por personagem, com um arquivo por quadro (ou uma folha por personagem). É onde se desenha e mexe.
- **Atlas montado na publicação:** uma ferramenta junta as fontes num atlas, porque um arquivo grande carrega mais rápido que
  centenas de pequenos, principalmente no celular. O jogador nunca vê as fontes.

Assim você trabalha "um em cada" e o jogo continua leve.

1. **[M] Estrutura das fontes:** `art/fonte/gente/ferreiro/frente_parado.png`, `frente_andar_1..4.png`, `lado_...`,
   `costas_...` (o outro lado é o mesmo desenho espelhado). Bichos e objetos no mesmo esquema.
2. **[M] Montador do atlas** (`tools/montar_atlas`): lê as pastas e gera `sprites.png` + `atlas.json` com as animações
   (nome, quadros, velocidade). Roda junto com o servidor de teste, como o `montar_campanha.ps1`.
3. **[M] Animação no jogo** (`js/view.js`): cada figura sabe para onde está virada; a câmera escolhe frente, lado ou costas pelo
   ângulo entre o jogador e a figura (como os jogos antigos de primeira pessoa com figuras planas), e os passos trocam de
   quadro conforme anda. Melhor ainda: uma textura só para o atlas e o quadro escolhido por coordenada, em vez de uma
   textura por figura (menos troca de textura por quadro).
4. **[G] Quem desenha:** hoje é o `gerar_arte.py`. Dá para ensiná-lo a gerar as poses (rápido, mas o resultado continua
   "provisório"), ou passar a desenhar à mão (Aseprite é o padrão para pixel art) e o script só fica para o que ainda não
   foi redesenhado. **Decisão sua.** Conta: 22 pessoas × 3 direções × 5 quadros (parado + 4 passos) = 330 desenhos.
5. **[P] Rosto das falas:** passa a usar um quadro `rosto` próprio quando existir (hoje é recortado da figura).

## Fase 2 · Mundo grande (por regiões)

1. **[G] Dividir o mapa em blocos** (por exemplo 64 × 64 m). `vila.json` vira uma lista de regiões; cada bloco tem as suas
   árvores, pedras, construções, bichos e o seu pedaço do chão (máscara própria, então ela não borra).
2. **[G] Carregar só o que está perto:** os blocos em volta do jogador ficam montados; os longe saem da memória. A névoa
   esconde a borda. Montagem aos poucos (um bloco por quadro) para não travar ao andar.
3. **[M] Simulação em dois níveis:** perto, tudo como hoje; longe, bichos e moradores "dormem" e só o relógio anda (o jogo
   já faz isso para vacas e ovelhas: `World.bichoEm` calcula onde estão pelo relógio).
4. **[M] Mapa e minimapa** desenhando por blocos, com a parte não visitada escondida (névoa de guerra, opcional).
5. **[M] Medir antes e depois:** quadros por segundo, memória e tempo de abertura num celular fraco. Metas sugeridas:
   60 fps no PC, 30 fps estáveis no celular, abrir em menos de 5 s.
6. **[P] Viagem rápida** entre vilas (carroça, estrada), para o mapa grande não virar só caminhada.

## Fase 3 · Eventos por sorte

1. **[M] Gatilhos por lugar:** áreas no mapa (`eventos` nos dados): ao entrar, sorteia (1 em 20, 1 em 6...), com hora do dia,
   nível, missão ou flag como condição, e espera mínima entre tentativas.
2. **[P] Sorte gravada:** o sorteio usa uma semente do save; o resultado (aconteceu / não aconteceu / já visto) fica no save.
   Sem isso a pessoa sai e entra até o evento acontecer.
3. **[M] O que um evento faz:** reusa as cenas do roteirizador (falas, escolhas, efeitos) e o `ROTEIRO` de `js/campanha.js`.
   Um NPC conhecido num evento passa a existir para aquele jogador (flag no save).
4. **[P] Ferramenta de teste:** no modo desenvolvedor, forçar um evento e ver as chances.

## Fase 4 · Vilas, ruínas e cavernas

1. **[M] Outras vilas e ruínas** como regiões novas do mapa grande (Fase 2), cada uma com o seu arquivo de dados.
2. **[M] Cavernas como instância:** um mapa pequeno à parte, carregado só ao entrar (o jogo já troca de cenário nos
   interiores). Escuridão com tocha, salas e um chefe no fim.
3. **[P] Entrada e saída** salvam a posição; morrer dentro devolve à entrada.

## Fase 5 · Grupo e raid (mais para frente)

1. **[G] Servidor de verdade para o grupo:** para 3 a 4 jogadores na mesma caverna, alguém precisa ser o juiz do que acontece.
   Começar pelo tempo real do Supabase (quem está onde, golpes) e, se não aguentar, um servidor próprio pequeno.
2. **[G] Save que não se edita:** hoje o save fica no navegador e dá para mexer nele. Para raid e recompensas em grupo,
   o que importa (itens, nível) precisa ser conferido no servidor.
3. **[M] Grupo:** convite, sala de espera, divisão do saque.

---

## Boas práticas e padrões da indústria que faltam

### Código
- **[M] Dividir os arquivos grandes:** `ui.js` em janelas (personagem, loja, mapa, menu, conversa), `view.js` em desenho,
  construções e figuras. Arquivos de até ~800 linhas são mais fáceis de achar e de mexer sem quebrar outra coisa.
- **[M] Testes automáticos da simulação:** `sim.js` não depende da tela, então dá para testar combate, coleta, lojas, missões
  e o save rodando sozinho. Roda antes de cada publicação e pega erro antes do jogador.
- **[P] Verificador de código** (ESLint) para pegar variável errada e erro de digitação.
- **[P] Captura de erros:** hoje um erro no jogador some. Registrar os erros (na tabela de feedback que já existe, ou num
  serviço como o Sentry) com versão e aparelho.

### Dados e save
- **[M] Save com migração:** em vez de recomeçar do zero quando `SAVE_VER` muda, cada versão sabe converter a anterior.
  Essencial quando houver jogadores com horas de jogo.
- **[P] Validar os dados ao abrir** (`game.json`, `vila.json`): item que não existe, NPC sem fala, missão sem quem dá.
  O `verificar_trilhas.py` já faz isso para os caminhos; estender para o resto.
- **[M] Separar `game.json`** por assunto (itens, NPCs, missões, monstros), montado num só na publicação como a campanha.

### Arte e som
- **[P] Fontes da arte no repositório** (Fase 1) e uma regra de escala: 100 px por metro, como já é, escrita no guia.
- **[P] Créditos e licenças** de tudo que veio de fora (as texturas de pedra, tijolo e porta vêm do zeitgeist1).
- **[M] Sons em arquivo** quando o som feito por código não bastar (passos, golpes, ambiente), com volume por grupo.

### Desempenho
- **[P] Contador de desempenho** no modo desenvolvedor: fps, objetos desenhados, memória.
- **[M] Uma textura de atlas** e figuras desenhadas juntas (menos chamadas de desenho).
- **[P] Teste regular num celular fraco de verdade:** várias coisas do celular ainda estão como "não testado" em `PENDENCIAS.md`.

### Jogador
- **[P] Tamanho do texto e alto contraste** nas configurações; legenda para os sons importantes.
- **[P] Teclas configuráveis** no PC.
- **[M] Tutorial que se pode rever** e um registro das falas (histórico da conversa), útil com muitos personagens.

---

## Ordem sugerida

1. Fase 0 inteira (dias).
2. Testes da simulação, captura de erros e save com migração: protegem tudo o que vem depois.
3. Fase 1 (arte animada): muda a cara do jogo e a estrutura das figuras antes de o mundo crescer.
4. Fase 2 (mundo grande): a mais pesada; depois dela, as Fases 3 e 4 são principalmente conteúdo.
5. Fase 5 só quando a campanha solo estiver redonda.

**Decisões (10/11):**
- Arte: **à mão, no Aseprite.** O `gerar_arte.py` fica só para as figuras ainda não redesenhadas.
- Direções: **4** (frente, costas e lado; o outro lado é espelhado).
- Publicação: **ramo `dev`** para o dia a dia; o `dev` entra na `main` (e no site) **só quando o usuário pedir**, não todo dia.
- Tamanho do mapa inteiro: **2 × 2 km** (uns 10 minutos andando de ponta a ponta). O bloco (Fase 2) é técnico.
- O plano inteiro foi aprovado, para seguir na ordem sugerida.

## Andamento

- **10/11 · Fase 0 feita:** ramo `dev`, `MUDANCAS.md`, `tools/versao.ps1` e `tools/publicar.ps1` (testado com `-Testar`).
- **10/11 · Proteções feitas:**
  - testes automáticos em `testes/` (27 testes de dados e simulação; todos passam);
  - registro de erros dos jogadores (`js/erros.js`, testado: o pedido sai certo). **Falta criar a tabela** `erros` no
    Supabase (`supabase/erros.sql`): o modo automático não deixou mexer no banco do site sem autorização. Até lá o jogo
    não quebra, os erros só não são guardados;
  - save com migração (`FORMATO_SAVE` e `MIGRACOES` em `js/sim.js`); o recomeço do zero a cada versão foi desligado
    (`resetSaveOnNewVersion: false`); save de versão mais nova é recusado em vez de estragado.
- **10/11 · Node 26 e Python 3.13 instalados** (winget). Verificador de código (ESLint) ligado e limpo; os testes rodam
  também pelo Node (`npm run testar`); o `publicar.ps1` roda os dois e não publica se falharem.
- **Ainda das boas práticas, para depois:** dividir os arquivos grandes (melhor junto com as Fases 1 e 2, que mexem neles),
  contador de desempenho.
- **10/11 · Tabela `erros` criada no Supabase** pelo usuário; testado: gravar funciona, ler de fora é negado.
- **10/11 · Fase 1 (estrutura) feita:**
  - `art/fonte/<nome>.aseprite` para as 22 pessoas, com as marcas `frente/lado/costas` × `parado/andar` (e `rosto`, opcional),
    criados com a figura de hoje em todos os quadros; `art/fonte/_modelo.aseprite` vazio para personagem novo;
  - `tools/montar_atlas.py`: exporta pelo Aseprite, junta com a arte gerada (`art/gerado/`), tira quadros repetidos,
    comprime (pyoxipng: 186 KB, antes 204 KB) e troca o `?a=`. Só entra o que já foi redesenhado: até lá o jogo fica igual
    (conferido: as 57 figuras saem idênticas, pixel a pixel);
  - no jogo: `direcao` e `anima` em `js/view.js` (frente, lado espelhado e costas pela câmera; passos pela duração do
    Aseprite) em moradores, gente de posto, atores da campanha e bichos; rosto próprio nas falas;
  - testado de ponta a ponta com um lado e um rosto de mentira (depois desfeitos); 30 testes passam.
  - **Poses provisórias feitas (10/11):** `tools/gerar_poses.py` desenhou costas, perfil e passos das 22 pessoas pela
    API do Aseprite (a partir da figura de frente e de uma ficha por pessoa). Atlas: 270 figuras, 429 KB. Qualquer um
    pode ser redesenhado à mão depois no Aseprite. Bichos ainda sem animação.
  - **Para a Fase 2:** uma textura só para o atlas (hoje cada quadro vira uma textura própria; com muitos quadros, pesa).
- **Próximo:** Fase 2 (mundo grande por blocos). O Aseprite 1.3.18 está em `D:\SteamLibrary\steamapps\common\Aseprite` e roda pela
  linha de comando (`Aseprite.exe -b`), então o montador do atlas pode exportar os arquivos `.aseprite` sozinho.
