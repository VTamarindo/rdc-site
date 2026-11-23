# Netzach · mudanças ainda não publicadas

Cada mudança que o jogador percebe ganha uma linha aqui, em linguagem de jogador, quando é commitada no ramo `dev`.
Na publicação (só quando o usuário pede), a notícia do site (uma página, em `noticias/fonte.mjs`, na raiz) é escrita a partir
desta lista, montada com `node netzach/tools/montar_noticias.mjs`, a lista é zerada e roda `tools/publicar.ps1`. Mudanças só internas (código, ferramentas) vão no fim, em "Por dentro".

## Para o jogador

- A luta começa com a barra de ataque vazia, para você e para os bichos.
- Os bichos rodeiam o jogador sem rumo certo enquanto a barra deles enche e, quando enche, vêm correndo. A finta de lobo, serpente, escorpião e troll caiu de 0,3 s para 0,18 s.
- A macro caça só animais mansos. Se um bicho bravo persegue o personagem, ele foge para a praça mais próxima, descansa e volta ao trabalho.
- Maestria e proficiência começam no nível 1. Chegar ao 2 custa 400 ataques, e cada nível custa 43,5% a mais que o anterior: cerca de 350 h em uso ou 700 h na macro até o 15.
- Equipamento raro sai mais: o lobo deixa equipamento 17% das vezes (era 8%), e a peça rara ou melhor fica com a melhor de duas qualidades sorteadas.
- Campo de treinamento: sem a opção de limite das magias, e "Magia em teste" virou "Proficiência".

## Por dentro

- Magias de teste limitadas pelo tempo de espera de fábrica (`magias.limite`); a mana continua pronta, desligada.
