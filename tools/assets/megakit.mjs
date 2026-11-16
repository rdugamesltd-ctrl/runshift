import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MEGAKIT_PREFIX = 'Exports/glTF (Godot)/';

/** Extracts a glTF model and only its referenced files into a build cache. */
export function extractModel(archive, model, directory) {
  mkdirSync(directory, { recursive: true });
  const name = `${model}.gltf`;
  const gltf = archive.read(MEGAKIT_PREFIX + name);
  const parsed = JSON.parse(gltf.toString('utf8'));
  const files = new Set([name]);
  for (const resource of [...(parsed.buffers ?? []), ...(parsed.images ?? [])]) {
    if (!resource.uri || resource.uri.startsWith('data:')) continue;
    if (resource.uri !== path.basename(resource.uri)) throw new Error(`Unsafe resource name: ${resource.uri}`);
    files.add(resource.uri);
  }
  for (const file of files) writeFileSync(path.join(directory, file), file === name ? gltf : archive.read(MEGAKIT_PREFIX + file));
  return path.join(directory, name);
}
