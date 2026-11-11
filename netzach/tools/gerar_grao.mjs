// Netzach · grava o grão do papel (css/grao.png)
// O pergaminho dos botões e janelas usava um filtro SVG de ruído (feTurbulence) direto no CSS. O navegador recalcula esse
// filtro a cada repintura e, sem placa de vídeo, o menu travava. Este script desenha o MESMO SVG uma vez, no Chrome, em 2x
// (360 px), e grava em PNG de paleta (uma cor só, 256 níveis de transparência): a imagem fica igual e custa quase nada.
// Só precisa rodar de novo se mudar o SVG abaixo.
// Uso (na pasta netzach, com o Chrome instalado):  npx -y -p playwright node tools/gerar_grao.mjs
import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }

// o ruído do papel: fractalNoise, e a cor fixa (marrom) com a transparência vinda do ruído
const SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .33 0 0 0 0 .2 0 0 0 0 .07 .55 0 0 0 -.2'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>";

const b = await pw.chromium.launch({ channel: 'chrome' }).catch(function () { return pw.chromium.launch(); });
const p = await b.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 2 });
await p.setContent('<html><body style="margin:0;background:transparent"></body></html>');
// lê só a transparência de cada pixel (a cor é sempre a mesma) e monta o PNG de paleta no próprio navegador
const alfa = await p.evaluate(function (svg) {
  return new Promise(function (ok) {
    var im = new Image();
    im.onload = function () {
      var c = document.createElement('canvas'); c.width = 360; c.height = 360;
      var g = c.getContext('2d'); g.drawImage(im, 0, 0, 360, 360);
      var d = g.getImageData(0, 0, 360, 360).data, a = [];
      for (var i = 3; i < d.length; i += 4) { a.push(d[i]); }
      ok(a);
    };
    im.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
  });
}, SVG);
await b.close();

// PNG de paleta: 256 entradas da mesma cor (a .33/.2/.07 do filtro, que o navegador aplica em RGB linear: 156,124,75 em sRGB)
// com transparência 0 a 255; cada pixel guarda o seu nível de transparência
const zlib = require('zlib');
function crc(buf) { var c, t = [], k, n; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } t[n] = c >>> 0; } c = 0xffffffff; for (n = 0; n < buf.length; n++) { c = t[(c ^ buf[n]) & 255] ^ (c >>> 8); } return (c ^ 0xffffffff) >>> 0; }
function bloco(tipo, dados) { var l = Buffer.alloc(4), tb = Buffer.from(tipo), cb = Buffer.alloc(4); l.writeUInt32BE(dados.length); cb.writeUInt32BE(crc(Buffer.concat([tb, dados]))); return Buffer.concat([l, tb, dados, cb]); }
var W = 360, ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 3;
var plte = Buffer.alloc(768), trns = Buffer.alloc(256), cru = Buffer.alloc(W * (W + 1));
for (var i = 0; i < 256; i++) { plte[i * 3] = 156; plte[i * 3 + 1] = 124; plte[i * 3 + 2] = 75; trns[i] = i; }
for (var y = 0; y < W; y++) { cru[y * (W + 1)] = 0; for (var x = 0; x < W; x++) { cru[y * (W + 1) + 1 + x] = alfa[y * W + x]; } }
var png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr), bloco('PLTE', plte), bloco('tRNS', trns),
  bloco('IDAT', zlib.deflateSync(cru, { level: 9 })), bloco('IEND', Buffer.alloc(0))]);
writeFileSync(new URL('../css/grao.png', import.meta.url), png);
console.log('css/grao.png gravado (' + png.length + ' bytes).');
