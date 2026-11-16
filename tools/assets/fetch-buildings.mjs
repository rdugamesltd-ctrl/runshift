import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDING_SOURCES } from './building-sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evidence = [];
for (const source of BUILDING_SOURCES) {
  const page = `https://poly.pizza/m/${source.id}`;
  const response = await fetch(page);
  if (!response.ok) throw new Error(`${page}: HTTP ${response.status}`);
  const html = await response.text();
  if (!html.includes('Public Domain (CC0)')) throw new Error(`${page}: CC0 licence not found`);
  const url = html.match(/https:\/\/static\.poly\.pizza\/[a-f0-9-]+\.glb/i)?.[0];
  if (!url) throw new Error(`${page}: GLB URL not found`);
  const model = await fetch(url);
  if (!model.ok) throw new Error(`${url}: HTTP ${model.status}`);
  const bytes = Buffer.from(await model.arrayBuffer());
  if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${url}: not a GLB`);
  const folder = path.join(root, 'asset-sources', 'polypizza', source.id);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'model.glb'), bytes);
  evidence.push({ ...source, page, download: url, licence: 'CC0 1.0', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
  console.log(`${source.kind}: ${bytes.length} bytes`);
}
const directory = path.join(root, 'assets', 'licenses');
mkdirSync(directory, { recursive: true });
writeFileSync(path.join(directory, 'buildings.json'), JSON.stringify({ checked: '2026-11-12', models: evidence }, null, 2) + '\n');
