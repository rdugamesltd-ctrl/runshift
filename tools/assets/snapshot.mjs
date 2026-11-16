import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openZip } from './zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'asset-sources', 'quaternius', 'downtown-megakit', 'Downtown City MegaKit[Standard].zip');
const folder = path.join(root, 'assets', 'licenses');
const archive = openZip(source);
try {
  const licence = archive.read('License_Standard.txt');
  if (!licence.toString('utf8').includes('CC0 1.0 Universal')) throw new Error('Unexpected archive licence');
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'downtown-standard.txt'), licence);
  const sha256 = createHash('sha256').update(readFileSync(source)).digest('hex');
  writeFileSync(path.join(folder, 'downtown-standard.json'), JSON.stringify({
    archive: path.basename(source),
    source: 'https://quaternius.itch.io/downtown-city-megakit',
    licence: 'CC0 1.0 Universal',
    sha256,
  }, null, 2) + '\n');
  console.log(`Captured Downtown City MegaKit Standard licence; ZIP SHA-256 ${sha256}.`);
} finally {
  archive.close();
}
