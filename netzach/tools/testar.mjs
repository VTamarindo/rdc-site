// Netzach · roda os testes automáticos (testes/testes.js) pelo Node, sem navegador.
// Uso (na pasta netzach):  npm run testar      Sai com código 1 se algum teste falhar (o publicar.ps1 para aí).
// Os mesmos testes abrem no navegador em /netzach/testes/; aqui o fetch lê os arquivos do disco e a tela vira texto.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const jogo = join(dirname(fileURLToPath(import.meta.url)), '..');
const elementos = {};
const el = (id) => (elementos[id] ||= { id, innerHTML: '', textContent: '', className: '' });

globalThis.window = globalThis;
globalThis.document = { getElementById: el, createElement: () => ({ getContext: () => null, style: {} }), currentScript: null, body: { classList: { contains: () => false } } };
// fetch('../data/game.json') nos testes = netzach/data/game.json
globalThis.fetch = async (u) => {
  const caminho = join(jogo, 'testes', String(u).split('?')[0]);
  try { const txt = readFileSync(caminho, 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(txt) }; }
  catch { return { ok: false, status: 404, json: async () => { throw new Error('404 ' + u); } }; }
};

for (const f of ['js/sim.js', 'js/view.js', 'testes/testes.js']) {
  vm.runInThisContext(readFileSync(join(jogo, f), 'utf8'), { filename: f });
}
for (let i = 0; i < 200 && !globalThis.RESULTADO; i++) { await new Promise((r) => setTimeout(r, 50)); }

const R = globalThis.RESULTADO;
if (!R) { console.error('Os testes não terminaram.'); process.exit(1); }
for (const p of R.detalhes) {
  for (const f of p.falhas) { console.error('✗ ' + p.parte + ' · ' + f.split('\n').slice(0, 6).join('\n    ')); }
}
console.log(R.ok ? `Todos os ${R.total} testes passaram.` : `${R.falhas} de ${R.total} testes falharam.`);
process.exit(R.ok ? 0 : 1);
