import { openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const END = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

function readAt(fd, size, offset) {
  const data = Buffer.alloc(size);
  let done = 0;
  while (done < size) {
    const n = readSync(fd, data, done, size - done, offset + done);
    if (!n) throw new Error(`Truncated ZIP at ${offset + done}`);
    done += n;
  }
  return data;
}

/** Read individual ZIP entries without expanding the 223 MB source archive. */
export function openZip(file) {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const tailStart = Math.max(0, size - 65_557);
    const tail = readAt(fd, size - tailStart, tailStart);
    let end = -1;
    for (let at = tail.length - 22; at >= 0; at--) {
      if (tail.readUInt32LE(at) === END) { end = at; break; }
    }
    if (end < 0) throw new Error('ZIP end directory missing');
    const count = tail.readUInt16LE(end + 10);
    const centralSize = tail.readUInt32LE(end + 12);
    const centralOffset = tail.readUInt32LE(end + 16);
    if (count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error('ZIP64 is not supported');
    const directory = readAt(fd, centralSize, centralOffset);
    const entries = new Map();
    let at = 0;
    for (let i = 0; i < count; i++) {
      if (directory.readUInt32LE(at) !== CENTRAL) throw new Error(`Bad ZIP directory entry ${i}`);
      const flags = directory.readUInt16LE(at + 8);
      const method = directory.readUInt16LE(at + 10);
      const compressed = directory.readUInt32LE(at + 20);
      const uncompressed = directory.readUInt32LE(at + 24);
      const nameLength = directory.readUInt16LE(at + 28);
      const extraLength = directory.readUInt16LE(at + 30);
      const commentLength = directory.readUInt16LE(at + 32);
      const offset = directory.readUInt32LE(at + 42);
      const name = directory.toString('utf8', at + 46, at + 46 + nameLength);
      if (flags & 1) throw new Error(`Encrypted ZIP entry: ${name}`);
      entries.set(name, { method, compressed, uncompressed, offset });
      at += 46 + nameLength + extraLength + commentLength;
    }
    return {
      entries,
      read(name) {
        const entry = entries.get(name);
        if (!entry) throw new Error(`ZIP entry missing: ${name}`);
        const header = readAt(fd, 30, entry.offset);
        if (header.readUInt32LE(0) !== LOCAL) throw new Error(`Bad ZIP entry: ${name}`);
        const dataOffset = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
        const raw = readAt(fd, entry.compressed, dataOffset);
        const data = entry.method === 0 ? raw : entry.method === 8 ? inflateRawSync(raw) : null;
        if (!data || data.length !== entry.uncompressed) throw new Error(`ZIP entry corrupt or unsupported: ${name}`);
        return data;
      },
      close() { closeSync(fd); },
    };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}
