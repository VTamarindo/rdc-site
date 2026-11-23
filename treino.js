// Romance de Cavalaria · campo de treinamento do Netzach (projetos/campo-de-treinamento.html). Os dados vêm do game.json, postos
// na página por netzach/tools/montar_projeto.mjs; as contas são as do jogo (netzach/js/sim.js)
(function () {
  'use strict';
  var el = document.getElementById('ct'); if (!el) { return; }
  var D = JSON.parse(el.getAttribute('data-ct')), M = D.M;
  function $(id) { return document.getElementById('ct-' + id); }
  function acha(l, id) { return l.filter(function (x) { return x.id === id; })[0]; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(v, d) { return v.toLocaleString('pt-BR', { maximumFractionDigits: d || 0 }); }
  function custo(lv) { return Math.round(M.golpes * Math.pow(M.cresce, lv - 1)); }
  function efeito(lv) { return lv * (lv + 1) / (M.niveis * (M.niveis + 1)); }
  function entre(v, e) { return v[0] + (v[1] - v[0]) * e; }
  function tempo(h) {
    if (!isFinite(h)) { return 'nunca'; }
    if (h < 1 / 60) { return 'menos de 1 min'; }
    if (h < 1) { return num(Math.ceil(h * 60)) + ' min'; }
    if (h < 10) { var m = Math.round(h * 60); return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + m % 60 + ' min' : ''); }
    return num(h) + ' h';
  }
  function dias(h) {
    var dia = Math.max(0.5, Math.min(24, +$('dia').value || 4)), d = h / dia;
    if (d < 1) { return 'cabe em um dia'; }
    return d < 60 ? num(d, 1) + ' dias' : d < 730 ? num(d / 30.4, 1) + ' meses' : num(d / 365, 1) + ' anos';
  }
  function saida(id, h, linhas) { $(id).innerHTML = '<b>' + tempo(h) + '</b><small>' + (isFinite(h) ? esc(dias(h)) : '') + '</small>' + linhas.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join(''); }

  // uma luta: quantos ataques, quanto dura, e quantas lutas cabem numa hora
  function luta(arma, lv) {
    var c = D.classes[arma.cls], e = efeito(lv), macro = $('modo').value === 'macro', b = acha(D.bichos, $('bicho').value);
    var crit = Math.min(1, D.crit[0] + arma.crit + (macro ? M.criticoMacro : M.critico) * e), mult = D.r[+$('rar').value].mult;
    var d = (arma.dmg[0] + arma.dmg[1]) / 2 * mult * D.postura * (1 + crit * (D.crit[1] + arma.critMult - 1)) * (1 - b.def / (b.def + D.armorK));
    if (c.acerto) { d *= entre(c.acerto.cheio, e) + entre(c.acerto.raspao, e) * c.fraco; }
    var n = Math.max(1, b.hp / d), seg = n * entre(c.ritmo, e);
    var bando = macro ? b.grupo : b.total, porHora = Math.min(3600 / (seg + D.desmontagem), bando * 3600 / (b.volta + seg));
    return { n: n, seg: seg, porHora: porHora, ataques: porHora * n * (macro ? M.macro : 1), b: b };
  }
  function soma(pesos, i) { var t = 0, a = 0; pesos.forEach(function (p, k) { t += p; if (k >= i) { a += p; } }); return a / t; }
  function itens() {
    var b = acha(D.bichos, $('bicho').value), antes = $('item').value, o = [];
    b.drops.forEach(function (d, i) { if (d.equip) { d.equip.forEach(function (q, k) { o.push([i + ':' + k, q[1]]); }); o.push([i + ':*', 'Qualquer peça de equipamento']); } else { o.push([i + ':-', d.nome]); } });
    $('item').innerHTML = o.map(function (x) { return '<option value="' + x[0] + '">' + esc(x[1]) + '</option>'; }).join('');
    if (o.some(function (x) { return x[0] === antes; })) { $('item').value = antes; }
  }
  function pinta() {
    var arma = acha(D.armas, $('arma').value), lv = +$('lv').value, L = luta(arma, lv), macro = $('modo').value === 'macro';
    $('luta').textContent = L.b.nome + ': cerca de ' + num(L.n, 1) + ' ataques, ' + num(L.seg) + ' segundos de luta, ' + num(L.porHora, 1) + ' por hora' + (L.porHora * (L.seg + D.desmontagem) < 3500 ? ' (o resto do tempo é esperar ela voltar)' : '') + '.';
    // item
    var v = $('item').value.split(':'), dr = L.b.drops[+v[0]];
    if (dr) {
      $('peca').hidden = !dr.equip;
      var ch = dr.c;
      if (dr.equip) { ch *= (v[1] === '*' ? 1 : 1 / dr.equip.length) * soma(dr.q || D.qp, +$('q').value) * soma(dr.r || D.rp, +$('r').value); }
      var h = 1 / ch / L.porHora, meta = Math.log(0.5) / Math.log(1 - Math.min(0.999999, ch)), nove = Math.log(0.1) / Math.log(1 - Math.min(0.999999, ch));
      saida('s1', h, [ch > 0.999 ? 'Toda criatura deixa.' : 'Em média, uma a cada ' + num(1 / ch, 1) + ' criaturas.', 'Metade dos jogadores consegue em ' + tempo(Math.max(1, meta) / L.porHora) + '; nove em cada dez, em ' + tempo(Math.max(1, nove) / L.porHora) + '.']);
    } else { $('peca').hidden = true; $('s1').innerHTML = '<p>Essa criatura não deixa nada.</p>'; }
    // maestria: nível por nível, porque o ritmo e a luta mudam. Outra classe: a primeira arma dela
    var alvo = +$('alvo').value, quais = $('cls').value === 'todas' ? Object.keys(D.classes) : [$('cls').value], total = 0, ataques = 0, partes = [];
    quais.forEach(function (k) {
      var a = arma.cls === k ? arma : D.armas.filter(function (x) { return x.cls === k; })[0], de = arma.cls === k ? lv : 0, hk = 0;
      for (var n = de + 1; n <= alvo; n++) { hk += custo(n) / luta(a, n - 1).ataques; ataques += custo(n); }
      total += hk; partes.push(D.classes[k].nome + ': ' + tempo(hk) + (arma.cls === k ? '' : ' (do zero, com ' + a.nome.toLowerCase() + ')'));
    });
    if (total <= 0) { $('s2').innerHTML = '<p>Você já chegou lá.</p>'; }
    else { saida('s2', total, [num(ataques) + ' ataques' + (macro ? ' (na macro cada um vale metade)' : '') + '.'].concat(quais.length > 1 ? partes : partes[0].indexOf('(do zero') > 0 ? partes : [])); }
    // magia: só o que a mana ou a espera deixam, com alvo sempre à mão
    var X = D.magias, ids = $('mag').value === 'todas' ? X.lista : [acha(X.lista, $('mag').value)], lim = $('lim').value, mt = 0, tent = 0, ml = +$('mlv').value, ma = +$('mal').value, txt = [];
    ids.forEach(function (m) {
      var t = 0, seg = lim === 'mana' ? m.mana / X.mana.porSeg : lim === 'espera' ? m.espera : Math.max(m.espera, m.mana / X.mana.porSeg);
      for (var n = ml + 1; n <= ma; n++) { t += custo(n); }
      tent += t; var hm = t * seg / 3600 / (macro ? M.macro : 1); mt += hm; txt.push(m.nome + ': ' + tempo(hm) + ', uma tentativa a cada ' + num(seg, 1) + ' s.');
    });
    if (mt <= 0) { $('s3').innerHTML = '<p>Escolha um nível acima do atual.</p>'; return; }
    var c = entre(X.acerto.cheio, efeito(ma)), r = entre(X.acerto.raspao, efeito(ma));
    saida('s3', mt, [num(tent) + ' tentativas' + (macro ? ' (na macro cada uma vale metade)' : '') + '.'].concat(txt, ['No nível ' + ma + ', sai inteira ' + num(c * 100) + '% das vezes e falha ' + num((1 - c - r) * 100) + '%.']));
  }
  $('cls').innerHTML = Object.keys(D.classes).map(function (k) { return '<option value="' + k + '">' + esc(D.classes[k].nome) + '</option>'; }).join('') + '<option value="todas">Todas as classes</option>';
  $('bicho').addEventListener('change', itens);
  $('arma').addEventListener('change', function () { if ($('cls').value !== 'todas') { $('cls').value = acha(D.armas, $('arma').value).cls; } });
  el.addEventListener('input', pinta); el.addEventListener('change', pinta);
  itens(); $('cls').value = acha(D.armas, $('arma').value).cls; pinta();
})();
