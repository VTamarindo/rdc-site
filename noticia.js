// Romance de Cavalaria · páginas de notícia: a barra de leitura e a forja (as contas são as do jogo, em netzach/js/sim.js)
(function () {
  'use strict';
  var prog = document.getElementById('nt-prog'), pede = false;
  function le() {
    pede = false;
    var t = document.documentElement.scrollHeight - window.innerHeight;
    prog.style.transform = 'scaleX(' + (t > 0 ? Math.min(1, window.pageYOffset / t) : 0) + ')';
  }
  if (prog) { window.addEventListener('scroll', function () { if (!pede) { pede = true; requestAnimationFrame(le); } }, { passive: true }); le(); }

  var fj = document.getElementById('forja');
  if (!fj) { return; }
  var D = JSON.parse(fj.getAttribute('data-forja'));
  function $(id) { return document.getElementById(id); }
  function num(v, d) { return v.toLocaleString('pt-BR', { maximumFractionDigits: d === undefined ? 1 : d }); }
  function maestria(n) { return n / (n + D.meio); }
  function chance(n) { return D.q[+$('fj-q').value].quebra * (1 - D.corte * maestria(n)); }
  function pinta() {
    var q = D.q[+$('fj-q').value], r = D.r[+$('fj-r').value], n = +$('fj-m').value;
    fj.style.setProperty('--rar', r.cor);
    fj.classList.remove('quebrou', 'bateu');
    $('fj-nome').textContent = D.nome + ' ' + q.n + ($('fj-r').value === '0' ? '' : ' ' + r.n);
    $('fj-dano').textContent = num(D.dano[0] * r.mult) + ' a ' + num(D.dano[1] * r.mult);
    $('fj-quebra').textContent = num(chance(n) * 100, 2) + '%';
    $('fj-mae').textContent = num(maestria(n) * 100) + '%';
    $('fj-preco').textContent = num(Math.max(1, Math.round(D.compra * q.preco * r.preco)), 0) + ' moedas';
    $('fj-mo').textContent = num(n, 0);
  }
  ['fj-q', 'fj-r', 'fj-m'].forEach(function (id) { $(id).addEventListener('input', function () { pinta(); $('fj-res').textContent = 'A bigorna espera.'; }); });
  $('fj-bate').addEventListener('click', function () {
    var n = +$('fj-m').value, i, parou = 0;
    for (i = 1; i <= 100; i++) { if (Math.random() < chance(n + i - 1)) { parou = i; break; } }
    fj.classList.remove('quebrou', 'bateu'); void fj.offsetWidth; // recomeça a animação
    fj.classList.add(parou ? 'quebrou' : 'bateu');
    $('fj-res').textContent = parou ? 'Quebrou no golpe ' + parou + '. O Ferreiro restaura.' : 'Aguentou os 100 golpes.';
  });
  pinta();
})();
