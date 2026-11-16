import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { openZip } from './zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'public', 'assets', 'world-kit.glb');
const source = path.join(root, 'asset-sources', 'quaternius', 'downtown-megakit', 'Downtown City MegaKit[Standard].zip');
const bytes = readFileSync(output);
if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error('world-kit.glb is not glTF 2');
const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
const binaryStart = 20 + bytes.readUInt32LE(12) + 8;
for (const image of json.images ?? []) {
  const view = json.bufferViews[image.bufferView];
  const { width, height } = await sharp(bytes.subarray(binaryStart + (view.byteOffset ?? 0), binaryStart + (view.byteOffset ?? 0) + view.byteLength)).metadata();
  const minimum = image.name?.includes('interior') ? 256 : 512;
  if (Math.min(width, height) < minimum) throw new Error(`${image.name} texture is only ${width}x${height}; expected at least ${minimum}px`);
}
const names = new Set(json.nodes?.map(node => node.name));
for (const name of ['building-a', 'building-b', 'building-c', 'roof-unit', 'bollard']) {
  if (!names.has(name)) throw new Error(`world-kit.glb has no ${name}`);
}
const facade = json.nodes.find(node => node.name === 'building-b');
const child = json.nodes[facade.children?.[0]];
const facadeTriangles = json.meshes[child.mesh]?.primitives.reduce((sum, primitive) => sum + (json.accessors[primitive.indices]?.count ?? 0) / 3, 0) ?? 0;
if (facadeTriangles < 25_000) throw new Error(`building-b facade lost too much geometry (${facadeTriangles} triangles); check for holes`);
if (!json.extensionsRequired?.includes('EXT_meshopt_compression')) throw new Error('world-kit.glb is not meshopt compressed');
const mb = statSync(output).size / 1024 / 1024;
if (mb > 2) throw new Error(`world-kit.glb exceeds 2 MB: ${mb.toFixed(2)} MB`);
const archive = openZip(source);
try {
  if (!archive.read('License_Standard.txt').toString('utf8').includes('CC0 1.0 Universal')) throw new Error('Source ZIP licence is not CC0 1.0');
} finally {
  archive.close();
}
console.log(`Megakit subset valid: 5 named models, meshopt, ${mb.toFixed(2)} MB, source CC0.`);
console.log('Full KitModel coverage awaits the remaining source assets.');
