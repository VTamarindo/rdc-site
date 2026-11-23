// Romance de Cavalaria · monta as páginas de notícia do site a partir de noticias/fonte.mjs
// Uso (na pasta do site):  node netzach/tools/montar_noticias.mjs
// Grava noticias/<slug>.html (uma por notícia), noticias/index.html (a lista) e noticias.js (o carrossel da página inicial).
// Apaga a página de notícia que saiu da fonte. As versões (?v=) do css e dos scripts vêm do index.html do site.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { montaProjeto } from './montar_projeto.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(SITE, 'noticias');
const G = JSON.parse(fs.readFileSync(path.join(SITE, 'netzach/data/game.json'), 'utf8'));
const lista = (await import(pathToFileURL(path.join(DIR, 'fonte.mjs')).href)).default(G);
const inicio = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

const TONS = ['ouro', 'ferro', 'mata', 'ceu', 'sangue', 'vinho'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rico = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const data = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}`; };
const num = (v) => v.toLocaleString('pt-BR');
// tamanho da figura, lido do próprio PNG (largura e altura ficam nos bytes 16 a 23)
const tam = (n) => { const b = fs.readFileSync(path.join(DIR, 'img', n + '.png')); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const ver = (arq) => { const m = inicio.match(new RegExp(arq.replace('.', '\\.') + '\\?v=([\\w-]+)')); if (!m) { throw new Error('O index.html não cita ' + arq); } return arq + '?v=' + m[1]; };

// confere a fonte antes de gravar qualquer coisa
const vistos = new Set();
lista.forEach((n) => {
  const erro = (t) => { throw new Error(`Notícia "${n.slug || n.titulo}": ${t}`); };
  if (!/^[a-z0-9-]+$/.test(n.slug || '') || n.slug === 'index') { erro('slug inválido'); }
  if (vistos.has(n.slug)) { erro('slug repetido'); }
  vistos.add(n.slug);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n.data || '')) { erro('data inválida'); }
  if (!['Netzach', 'Echad', 'O site', 'Outro'].includes(n.jogo)) { erro('jogo inválido (o feedback só aceita Netzach, Echad, O site ou Outro)'); }
  if (!TONS.includes(n.tom)) { erro('tom inválido: ' + n.tom); }
  ['titulo', 'resumo', 'abre', 'simbolo'].forEach((k) => { if (!n[k]) { erro('falta ' + k); } });
  (n.cena || []).forEach((f) => { if (!fs.existsSync(path.join(DIR, 'img', f + '.png'))) { erro('falta a figura noticias/img/' + f + '.png'); } });
});

function cabeca(titulo, desc, imagem) {
  return `<!doctype html>
<!-- Gerado por netzach/tools/montar_noticias.mjs a partir de noticias/fonte.mjs. Não edite aqui. -->
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} · Romance de Cavalaria</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(desc)}">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../${ver('portal.css')}">
<link rel="stylesheet" href="../${ver('noticia.css')}">
</head>
<body>
<header class="site-top">
  <div class="bar">
    <a class="marca" href="../" aria-label="Romance de Cavalaria, início">
      <img src="../favicon.svg" alt="" width="28" height="28"><span>Romance de Cavalaria</span>
    </a>
    <button type="button" class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="nav" aria-label="Abrir o menu">&#9776;</button>
    <nav id="nav" class="nav">
      <a href="./" ${imagem ? 'aria-current="page"' : ''}>Novidades</a>
      <a href="../projetos.html">Projetos</a>
      <a href="../quem-somos.html">Quem somos</a>
      <a href="../feedback.html">Feedback</a>
      <a class="btn" id="netzach-top" href="../netzach/">Jogar Netzach</a>
      <div class="login">
        <button type="button" class="btn ghost" id="login-btn" aria-expanded="false" aria-controls="login-caixa">Entrar</button>
        <div class="login-caixa" id="login-caixa" hidden>
          <div id="conta-portal" class="conta"></div>
          <p class="login-breve" id="login-breve">As contas estão chegando: em breve você vai poder entrar e guardar seus saves na nuvem.</p>
        </div>
      </div>
    </nav>
  </div>
</header>
`;
}
function pe(extra) {
  return `
<footer>&copy; Romance de Cavalaria</footer>

<script src="../${ver('config.js')}"></script>
<script src="../${ver('netzach/js/conta.js')}"></script>
<script src="../${ver('portal.js')}"></script>
${extra || ''}</body>
</html>
`;
}
function cena(n) {
  if (!n.cena || !n.cena.length) { return `<div class="nt-simb" aria-hidden="true">${esc(n.simbolo)}</div>`; }
  return '<div class="nt-cena" aria-hidden="true">' + n.cena.map((f) => {
    const [w, h] = tam(f);
    return `<img src="img/${f}.png" alt="" width="${w}" height="${h}" style="--w:${w};--h:${h}">`;
  }).join('') + '</div>';
}
const CORES = ['#b9b1a0', '#7fc06f', '#6ea8ec', '#c08be6', '#f0a94a']; // as raridades em cores claras, para o fundo escuro do site
function raridades() {
  return '<div class="nt-rar">' + G.raridade.niveis.map((r, i) =>
    `<div style="--rar:${CORES[i]}"><b>${esc(r.nome.f)}</b><span>×${num(r.mult)}</span><small>modificadores</small></div>`).join('') + '</div>';
}
function forja() {
  const it = G.items.espada_aco;
  const d = {
    nome: it.name, dano: it.dmg, compra: it.buy, meio: 300, corte: 0.9, // a maestria da época da notícia (hoje são 15 níveis)
   
    q: G.qualidade.niveis.map((q) => ({ n: q.nome.f, quebra: q.quebra, preco: q.preco })),
    r: G.raridade.niveis.map((r, i) => ({ n: r.nome.f, mult: r.mult, preco: r.preco, cor: CORES[i] })), padrao: G.qualidade.padrao
  };
  return `<div class="forja" id="forja" data-forja="${esc(JSON.stringify(d))}">
<div class="forja-peca"><svg viewBox="0 0 48 48" aria-hidden="true"><g transform="rotate(45 24 24)"><path d="M22.2 3.5 L24 .8 L25.8 3.5 V30.5 H22.2Z" fill="#e7e2d4" stroke="#2b1709" stroke-width="1.5" stroke-linejoin="round"/><path d="M24 4.5 V29.5" stroke="#9c958a" stroke-width=".9"/><rect x="15" y="30.5" width="18" height="3.6" rx="1.4" fill="#c99a3b" stroke="#2b1709" stroke-width="1.3"/><rect x="22.2" y="34.1" width="3.6" height="8.4" fill="#5a341a" stroke="#2b1709" stroke-width="1.2"/><circle cx="24" cy="44.6" r="2.6" fill="#c99a3b" stroke="#2b1709" stroke-width="1.3"/></g></svg>
<strong id="fj-nome"></strong></div>
<div class="forja-ctl">
<label>Qualidade<select id="fj-q">${d.q.map((q, i) => `<option value="${i}"${i === d.padrao ? ' selected' : ''}>${esc(q.n)}</option>`).join('')}</select></label>
<label>Raridade<select id="fj-r">${d.r.map((r, i) => `<option value="${i}">${esc(r.n)}</option>`).join('')}</select></label>
<label class="largo">Golpes já treinados: <output id="fj-mo">0</output><input type="range" id="fj-m" min="0" max="3000" step="50" value="0"></label>
</div>
<dl class="forja-num"><div><dt>Dano</dt><dd id="fj-dano"></dd></div><div><dt>Quebra por golpe</dt><dd id="fj-quebra"></dd></div><div><dt>Maestria</dt><dd id="fj-mae"></dd></div><div><dt>Preço</dt><dd id="fj-preco"></dd></div></dl>
<button type="button" class="btn" id="fj-bate">Bater 100 vezes</button>
<p class="forja-res" id="fj-res" role="status">A bigorna espera.</p>
<noscript><p>Para usar a forja, ligue o JavaScript.</p></noscript>
</div>`;
}
function parte(p, i) {
  let h = `<section class="nt-parte" id="p${i + 1}"><div class="nt-ic" aria-hidden="true">${esc(p.icone)}</div><div class="nt-corpo"><h2>${esc(p.titulo)}</h2>`;
  if (p.texto) { h += `<p>${rico(p.texto)}</p>`; }
  if (p.raridades) { h += raridades(); }
  if (p.antes) { h += `<div class="nt-antes"><div><small>Antes</small>${rico(p.antes)}</div><div class="agora"><small>Agora</small>${rico(p.agora)}</div></div>`; }
  if (p.itens) { h += '<ul>' + p.itens.map((t) => `<li>${rico(t)}</li>`).join('') + '</ul>'; }
  if (p.tabela) {
    h += `<div class="nt-tab" tabindex="0" role="region" aria-label="${esc(p.titulo)}"><table><thead><tr>${p.tabela.cabeca.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>` +
      p.tabela.linhas.map((l) => '<tr>' + l.map((c, k) => (k ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`)).join('') + '</tr>').join('') + '</tbody></table></div>';
  }
  if (p.forja) { h += forja(); }
  if (p.nota) { h += `<p class="nt-nota">${rico(p.nota)}</p>`; }
  return h + '</div></section>';
}
function form(n) {
  const T = [['Ideia', '✦'], ['Bug', '☠'], ['Elogio', '❤'], ['Outro', '…']];
  return `<section class="nt-fb" id="feedback"><h2>E você, o que achou?</h2><p>Escreva sobre esta atualização: lemos tudo. Nos pontos em aberto, o botão <b>Opinar</b> já começa a mensagem para você.</p>
<form id="fb-form" class="fb-form" data-noticia="${esc(n.titulo)}">
<input type="hidden" name="sobre" value="${esc(n.jogo)}">
<fieldset class="fb-tipos"><legend>Tipo</legend>${T.map(([t, s], i) => `<label><input type="radio" name="tipo" value="${t}"${i ? '' : ' checked'}><span><i aria-hidden="true">${s}</i>${t}</span></label>`).join('')}</fieldset>
<label>Mensagem<textarea name="msg" rows="5" maxlength="3800" required placeholder="O que ficou bom? O que não funcionou? O que falta?"></textarea></label>
<label>Seu e-mail <small>(opcional, se quiser resposta)</small><input name="email" type="email" maxlength="200" autocomplete="email"></label>
<button type="submit" class="btn">Enviar feedback</button>
<p class="fb-msg" id="fb-msg" role="status" hidden></p>
</form></section>`;
}
function pagina(n, i) {
  const ant = lista[i + 1], prox = lista[i - 1];
  const temForja = n.partes.some((p) => p.forja);
  let h = cabeca(n.titulo, n.resumo, true);
  h += `<div class="nt-prog" aria-hidden="true"><i id="nt-prog"></i></div>
<main class="nt tom-${n.tom}">
<header class="nt-topo${n.imagem ? ' com-foto' : ''}"${n.imagem ? ` style="--foto:url('../${esc(n.imagem)}')"` : ''}>
<div class="nt-brilho" aria-hidden="true"></div>${cena(n)}
<div class="nt-tit"><p class="meta"><span class="tag on">${esc(n.jogo)}</span> <time datetime="${n.data}">${data(n.data)}</time></p><h1>${esc(n.titulo)}</h1><p class="nt-abre">${rico(n.abre)}</p></div>
</header>
<nav class="nt-ind" aria-label="Nesta página">${n.partes.map((p, k) => `<a href="#p${k + 1}">${esc(p.titulo)}</a>`).join('')}${n.aberto && n.aberto.length ? '<a href="#aberto">Pontos em aberto</a>' : ''}<a href="#feedback">Feedback</a></nav>
<div class="nt-partes">${n.partes.map(parte).join('\n')}</div>`;
  if (n.depois && n.depois.length) {
    h += `<section class="nt-depois"><h2>O que mudou desde então</h2><ol>${n.depois.map(([d, t]) => `<li><time datetime="${d}">${data(d)}</time> ${rico(t)}</li>`).join('')}</ol></section>`;
  }
  if (n.aberto && n.aberto.length) {
    h += `<section class="nt-aberto" id="aberto"><h2>Pontos em aberto</h2><p>O que ainda não está decidido, ou ainda não existe. A sua opinião pesa aqui.</p><div class="nt-cards">` +
      n.aberto.map((a) => `<article><h3>${esc(a.titulo)}</h3><p>${rico(a.texto)}</p><button type="button" class="btn ghost" data-opinar="${esc(a.titulo)}">Opinar</button></article>`).join('') + '</div></section>';
  }
  h += form(n);
  h += `<nav class="nt-nav" aria-label="Outras notícias">${ant ? `<a href="${ant.slug}.html"><small>&#8249; Anterior</small>${esc(ant.titulo)}</a>` : '<span></span>'}${prox ? `<a class="prox" href="${prox.slug}.html"><small>Próxima &#8250;</small>${esc(prox.titulo)}</a>` : '<a class="prox" href="./"><small>Ver tudo</small>Todas as novidades</a>'}</nav>
</main>`;
  h += pe(`<script src="../${ver('feedback.js')}"></script>\n<script src="../${ver('noticia.js')}"></script>\n`);
  if (temForja && !h.includes('id="forja"')) { throw new Error('forja'); }
  return h;
}
function indice() {
  return cabeca('Novidades', 'Todas as atualizações dos jogos do Romance de Cavalaria.', true) + `<main class="wrap nt-lista">
<h1 class="titulo">Novidades</h1><p class="intro">Cada atualização, com tudo o que mudou, os pontos em aberto e um lugar para você dizer o que achou.</p>
<div class="nt-grade">${lista.map((n) => `<a class="nt-item tom-${n.tom}" href="${n.slug}.html"><div class="nt-mini">${cena(n)}</div><div class="body"><p class="meta"><span class="tag on">${esc(n.jogo)}</span> <time datetime="${n.data}">${data(n.data)}</time></p><h2>${esc(n.titulo)}</h2><p>${esc(n.resumo)}</p></div></a>`).join('\n')}</div>
</main>` + pe();
}

fs.readdirSync(DIR).filter((f) => f.endsWith('.html')).forEach((f) => { if (f !== 'index.html' && !vistos.has(f.slice(0, -5))) { fs.unlinkSync(path.join(DIR, f)); console.log('Saiu: noticias/' + f); } });
lista.forEach((n, i) => fs.writeFileSync(path.join(DIR, n.slug + '.html'), pagina(n, i)));
fs.writeFileSync(path.join(DIR, 'index.html'), indice());
const carrossel = lista.map((n) => ({ jogo: n.jogo, data: n.data, titulo: n.titulo, texto: n.resumo, simbolo: n.simbolo, tom: n.tom, imagem: n.imagem || '', cena: (n.cena || []).slice(0, 5), link: 'noticias/' + n.slug + '.html', botao: 'Ler a notícia' }));
fs.writeFileSync(path.join(SITE, 'noticias.js'), '// Notícias do carrossel. Gerado por netzach/tools/montar_noticias.mjs a partir de noticias/fonte.mjs. Não edite aqui.\nwindow.NOTICIAS = ' + JSON.stringify(carrossel, null, 1) + ';\n');
console.log(`${lista.length} notícias montadas.`);
montaProjeto({ SITE, G, V: JSON.parse(fs.readFileSync(path.join(SITE, 'netzach/data/vila.json'), 'utf8')), lista, cabeca, pe, ver, esc, rico, data, tam });
