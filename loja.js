// Romance de Cavalaria · a loja do Netzach (projetos/loja.html). Por enquanto só o ambiente: nada é vendido e nenhum
// pagamento existe. Para pôr um produto, acrescente em LOJA.itens; para vender de verdade, ligue um gateway em LOJA.pagar e
// LOJA.aberta = true. Este arquivo é público: nenhuma chave secreta aqui, e quem confirma o pagamento é sempre o servidor.
(function () {
  'use strict';
  var LOJA = window.LOJA = {
    aberta: false,   // false: os botões de compra ficam desligados
    moeda: 'BRL',
    pagar: null,     // function (item) { ... } : abre o pagamento do gateway
    categorias: [{ id: 'cosmeticos', nome: 'Itens cosméticos' }, { id: 'licenciados', nome: 'Produtos licenciados' }],
    // { id, categoria, nome, texto, preco (em centavos), imagem (opcional), estado: 'breve' | 'venda' | 'esgotado' }
    itens: []
  };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  LOJA.preco = function (c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: LOJA.moeda }); };
  LOJA.compravel = function (i) { return !!(LOJA.aberta && LOJA.pagar && i && i.estado === 'venda' && i.preco > 0); };
  LOJA.comprar = function (id) { var i = LOJA.itens.filter(function (x) { return x.id === id; })[0]; if (LOJA.compravel(i)) { LOJA.pagar(i); return true; } return false; };
  LOJA.mostra = function () {
    var el = document.querySelector('[data-loja]'); if (!el) { return; }
    if (!LOJA.itens.length) { el.innerHTML = '<h2>Em breve</h2><p>Itens cosméticos e produtos licenciados serão publicados em breve.</p>'; return; }
    var h = LOJA.categorias.map(function (c) {
      var l = LOJA.itens.filter(function (i) { return i.categoria === c.id; });
      return !l.length ? '' : '<h3>' + esc(c.nome) + '</h3>' + ('<div class="pj-itens">' + l.map(function (i) {
        var ok = LOJA.compravel(i);
        return '<article>' + (i.imagem ? '<img src="../' + esc(i.imagem) + '" alt="">' : '') + '<b>' + esc(i.nome) + '</b><p>' + esc(i.texto) + '</p><span>' + (i.preco > 0 ? esc(LOJA.preco(i.preco)) : '') + '</span>' +
          '<button type="button" class="btn" data-compra="' + esc(i.id) + '"' + (ok ? '' : ' disabled') + '>' + (i.estado === 'esgotado' ? 'Esgotado' : ok ? 'Comprar' : 'Em breve') + '</button></article>';
      }).join('') + '</div>');
    }).join('');
    el.innerHTML = h;
  };
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-compra]'); if (b) { LOJA.comprar(b.getAttribute('data-compra')); } });
  LOJA.mostra();
})();
