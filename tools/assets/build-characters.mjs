import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'public', 'assets', 'characters');
const evidence = path.join(root, 'assets', 'licenses');
const models = [
  { role: 'hero', id: 'kKtL4zvS3n', title: 'Animated Platformer Character' },
  { role: 'thief', id: 'xGYmeDpfTu', title: 'Ninja' },
];
const io = new NodeIO();
const manifest = [];
mkdirSync(output, { recursive: true });
mkdirSync(evidence, { recursive: true });
for (const { role, id, title } of models) {
  const folder = path.join(root, 'asset-sources', 'polypizza', id);
  const files = readdirSync(folder).filter(name => name.toLowerCase().endsWith('.glb'));
  if (files.length !== 1) throw new Error(`Expected one GLB in ${folder}, found ${files.length}`);
  const source = path.join(folder, files[0]);
  const doc = await io.read(source);
  const clips = doc.getRoot().listAnimations().map(animation => animation.getName());
  for (const needed of ['Idle', 'Run', 'Jump', 'Duck', 'HitReact']) {
    if (!clips.some(name => name.endsWith(`|${needed}`))) throw new Error(`${role} is missing ${needed}`);
  }
  if (doc.getRoot().listSkins().length === 0) throw new Error(`${role} has no skin`);
  const dest = path.join(output, `${role}.glb`);
  copyFileSync(source, dest);
  if (statSync(dest).size > 1.2 * 1024 * 1024) throw new Error(`${role} exceeds 1.2 MB`);
  manifest.push({ role, title, creator: 'Quaternius', source: `https://poly.pizza/m/${id}`,
    licenceShown: 'Public Domain (CC0)', sourceFile: files[0], sha256: createHash('sha256').update(readFileSync(source)).digest('hex'),
    animations: clips.length, bytes: statSync(dest).size });
  console.log(`${role}: ${clips.length} clips, ${statSync(dest).size} bytes, rigged`);
}
writeFileSync(path.join(evidence, 'polypizza-characters.json'), JSON.stringify({ checked: '2026-11-12', models: manifest }, null, 2) + '\n');
