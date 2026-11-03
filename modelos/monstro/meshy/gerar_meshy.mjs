// Gera o monstro no Meshy (multi-imagem -> 3D) e baixa o GLB texturizado.
// Uso: MESHY_API_KEY=... node modelos/monstro/meshy/gerar_meshy.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const KEY = process.env.MESHY_API_KEY;
if (!KEY) { console.error('Defina MESHY_API_KEY.'); process.exit(1); }
const API = 'https://api.meshy.ai/openapi/v1/multi-image-to-3d';
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const imgs = ['1_frente.png', '2_lado_esquerdo.png', '3_tras.png']
  .map((f) => 'data:image/png;base64,' + readFileSync(join(AQUI, f)).toString('base64'));

const r = await fetch(API, { method: 'POST', headers: H, body: JSON.stringify({
  image_urls: imgs, should_remesh: true, should_texture: true, enable_pbr: true, ai_model: 'latest',
}) });
const j = await r.json();
if (!r.ok) { console.error('Erro ao criar tarefa:', r.status, j); process.exit(1); }
const id = j.result;
console.log('tarefa', id);

let t;
for (;;) {
  await new Promise((s) => setTimeout(s, 10000));
  t = await (await fetch(`${API}/${id}`, { headers: H })).json();
  console.log(t.status, t.progress ?? '');
  if (t.status === 'SUCCEEDED') break;
  if (t.status === 'FAILED' || t.status === 'CANCELED') { console.error(t.task_error || t); process.exit(1); }
}
const glb = Buffer.from(await (await fetch(t.model_urls.glb)).arrayBuffer());
writeFileSync(join(AQUI, 'monstro_meshy.glb'), glb);
console.log('gravado monstro_meshy.glb', glb.length, 'bytes');
