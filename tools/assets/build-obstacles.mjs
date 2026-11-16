import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { OBSTACLE_SOURCES } from './obstacle-sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'public', 'assets', 'obstacles.glb');
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const kit = new Document();
const scene = kit.createScene('Catch the Thief obstacles');
for (const { kind, id } of OBSTACLE_SOURCES) {
  const file = path.join(root, 'asset-sources', 'polypizza', id, 'model.glb');
  if (!existsSync(file)) throw new Error(`Missing ${file}; run node tools/assets/fetch-obstacles.mjs`);
  const model = await io.read(file);
  const map = mergeDocuments(kit, model);
  const copiedScene = map.get(model.getRoot().listScenes()[0]);
  const group = kit.createNode(kind);
  for (const child of [...copiedScene.listChildren()]) group.addChild(child);
  // These source models run along X/Z opposite to the game's forward axis.
  if (kind === 'barrier-high' || kind === 'metro-car') group.setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  scene.addChild(group);
  copiedScene.dispose();
}
await kit.transform(unpartition(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
mkdirSync(path.dirname(output), { recursive: true });
await io.write(output, kit);
const mb = statSync(output).size / 1024 / 1024;
if (mb > 1.2) throw new Error(`Obstacle kit exceeds 1.2 MB: ${mb.toFixed(2)} MB`);
console.log(`Built ${path.relative(root, output)}: ${mb.toFixed(2)} MB, ${OBSTACLE_SOURCES.length} authored models.`);
