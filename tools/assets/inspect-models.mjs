import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openZip } from './zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'asset-sources', 'quaternius', 'downtown-megakit', 'Downtown City MegaKit[Standard].zip');
if (!existsSync(source)) {
  console.error(`Missing ${source}`);
  process.exitCode = 1;
} else {
  const archive = openZip(source);
  try {
    const prefix = 'Exports/glTF (Godot)/';
    const models = [...archive.entries.keys()].filter(name => name.startsWith(prefix) && name.endsWith('.gltf'));
    const missing = [];
    let triangles = 0;
    for (const name of models) {
      const gltf = JSON.parse(archive.read(name).toString('utf8'));
      for (const buffer of gltf.buffers ?? []) {
        if (buffer.uri && !archive.entries.has(prefix + buffer.uri)) missing.push(`${name}: ${buffer.uri}`);
      }
      for (const image of gltf.images ?? []) {
        if (image.uri && !archive.entries.has(prefix + image.uri)) missing.push(`${name}: ${image.uri}`);
      }
      for (const mesh of gltf.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
        if (primitive.mode !== undefined && primitive.mode !== 4) continue;
        const accessor = gltf.accessors?.[primitive.indices];
        if (accessor) triangles += Math.floor(accessor.count / 3);
      }
    }
    const licence = archive.read('License_Standard.txt').toString('utf8');
    if (!licence.includes('CC0 1.0 Universal')) throw new Error('Archive licence is not the expected CC0 1.0 text');
    if (missing.length) throw new Error(`Missing glTF dependencies:\n${missing.slice(0, 20).join('\n')}`);
    console.log(`Downtown City MegaKit Standard: ${models.length} glTF models, about ${triangles.toLocaleString()} source triangles.`);
    console.log(`Licence in ZIP: CC0 1.0 Universal; all glTF buffers and images present.`);
    console.log(`Buildings: ${models.filter(name => /Building_/.test(name)).map(name => path.basename(name)).join(', ')}`);
  } finally {
    archive.close();
  }
}
