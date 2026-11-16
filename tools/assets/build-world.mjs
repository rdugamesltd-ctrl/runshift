import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { extractModel } from './megakit.mjs';
import { openZip } from './zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'asset-sources', 'quaternius', 'downtown-megakit', 'Downtown City MegaKit[Standard].zip');
const cache = path.join(root, 'artifacts', 'assets', 'megakit');
const output = path.join(root, 'public', 'assets', 'world-kit.glb');
const models = [
  ['Building_Small_1', 'building-a'],
  ['Building_Medium_2_001', 'building-b'],
  ['Building_Large_2', 'building-c'],
  ['Prop_ACUnit', 'roof-unit'],
  ['Prop_Bollard', 'bollard'],
  ['Street_Asphalt_9x9', 'street-asphalt'],
];
if (!existsSync(source)) throw new Error(`Missing Downtown City MegaKit Standard ZIP: ${source}`);
const archive = openZip(source);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const kit = new Document();
const scene = kit.createScene('Catch the Thief world kit');
try {
  for (const [sourceName, kitName] of models) {
    const file = extractModel(archive, sourceName, path.join(cache, sourceName));
    const model = await io.read(file);
    for (const material of model.getRoot().listMaterials()) {
      material.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null);
      material.setMetallicFactor(0).setRoughnessFactor(1);
    }
    for (const texture of model.getRoot().listTextures()) {
      if (!texture.listParents().some(parent => parent.propertyType === 'Material')) continue;
      const image = texture.getImage();
      if (!image) continue;
      const source = sharp(image);
      const { hasAlpha } = await source.metadata();
      // The original 2K maps are too large for the download budget, but 128 px erased brick and trim detail.
      // Keep the translucent window interiors lossless; JPEG packs the opaque facade maps more efficiently.
      const size = hasAlpha ? 256 : 512;
      const resized = source.resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true });
      texture.setImage(await (hasAlpha ? resized.png() : resized.jpeg({ quality: 82, mozjpeg: true })).toBuffer());
      texture.setMimeType(hasAlpha ? 'image/png' : 'image/jpeg');
    }
    const map = mergeDocuments(kit, model);
    const copiedScene = map.get(model.getRoot().listScenes()[0]);
    const group = kit.createNode(kitName);
    for (const child of [...copiedScene.listChildren()]) group.addChild(child);
    scene.addChild(group);
    copiedScene.dispose();
  }
  // The source facades have thin, open window geometry; triangle decimation tears visible holes in it.
  await kit.transform(unpartition(), dedup(), weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  mkdirSync(path.dirname(output), { recursive: true });
  await io.write(output, kit);
  console.log(`Built ${path.relative(root, output)}: ${(statSync(output).size / 1024 / 1024).toFixed(2)} MB, ${models.length} source models.`);
} finally {
  archive.close();
}
