import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { SCENERY_SOURCES } from './scenery-sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'public', 'assets', 'street-scenery.glb');
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const kit = new Document();
const scene = kit.createScene('RUNSHIFT street scenery');
for (const { kind, id } of SCENERY_SOURCES) {
  const file = path.join(root, 'asset-sources', 'polypizza', id, 'model.glb');
  if (!existsSync(file)) throw new Error(`Missing ${file}; run node tools/assets/fetch-scenery.mjs`);
  const model = await io.read(file);
  const map = mergeDocuments(kit, model);
  const copiedScene = map.get(model.getRoot().listScenes()[0]);
  const group = kit.createNode(kind);
  for (const child of [...copiedScene.listChildren()]) group.addChild(child);
  scene.addChild(group);
  copiedScene.dispose();
}
await kit.transform(unpartition(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
mkdirSync(path.dirname(output), { recursive: true });
await io.write(output, kit);
console.log(`Built ${path.relative(root, output)}: ${(statSync(output).size / 1024).toFixed(1)} KB.`);
