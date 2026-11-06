/* Netzach · service worker
   Com internet, tudo vem do site, então o app nunca fica preso numa versão velha. O cache só responde sem internet.
   A busca sem internet é exata, com o ?v= no endereço: misturar arquivos de versões diferentes quebra o jogo. */
'use strict';
var CACHE = 'netzach-1';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

function guarda(req, res) {
  return caches.open(CACHE).then(function (c) {
    // a versão anterior do mesmo arquivo sai antes de a nova entrar, e o cache não cresce a cada publicação
    return c.delete(req, { ignoreSearch: true }).then(function () { return c.put(req, res); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) { return; }
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copia = res.clone(); e.waitUntil(guarda(req, copia)); }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (r) { return r || Response.error(); });
  }));
});
