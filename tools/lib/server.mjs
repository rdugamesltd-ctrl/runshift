/**
 * Serves the game for the browser checks (WP-06): the Vite dev server, or `vite preview` of the build in dist/.
 *
 * Port 5199 first (the next free one when it is taken), so a running `npm run dev` on 5173 is never disturbed. The dev
 * server watches no files and keeps its pre-bundled dependencies in its own cache folder: several people (and agents)
 * edit this tree at once, and a test must neither reload half way through because a file changed nor share the
 * optimiser's cache with another dev server.
 *
 * Run on its own to play or debug by hand: node tools/lib/server.mjs [--dist]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, preview } from 'vite';

/** The project root: the folder with package.json and vite.config.ts. */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The first port tried. */
export const DEFAULT_PORT = 5199;

/** The build `npm run build` writes and `--dist` serves. */
export const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

/**
 * @typedef {object} GameServer
 * @property {string} url The page's address, ending in a slash (http://localhost:5199/).
 * @property {'dev' | 'dist'} kind The dev server (sources) or the preview of dist/.
 * @property {() => Promise<void>} close Stops the server.
 */

/**
 * Starts a server for the game. Throws when `dist` is asked for and there is no build.
 * @param {{ dist?: boolean, port?: number }} [options]
 * @returns {Promise<GameServer>}
 */
export async function startServer({ dist = false, port = DEFAULT_PORT } = {}) {
  if (dist) {
    if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
      throw new Error('dist/index.html is missing: run `npm run build` first.');
    }
    const server = await preview({
      root: PROJECT_ROOT,
      logLevel: 'error',
      clearScreen: false,
      preview: { port, strictPort: false, open: false },
    });
    return { url: urlOf(server.resolvedUrls, server.httpServer), kind: 'dist', close: () => server.close() };
  }
  const server = await createServer({
    root: PROJECT_ROOT,
    logLevel: 'error',
    clearScreen: false,
    // Not node_modules/.vite: a dev server another agent runs would re-optimise it under our feet.
    cacheDir: path.join(PROJECT_ROOT, 'node_modules', '.vite-tools'),
    server: {
      port,
      strictPort: false,
      open: false,
      // A snapshot of the sources as first requested: no reloads while a check runs.
      watch: null,
      warmup: { clientFiles: ['./src/main.ts'] },
    },
  });
  await server.listen();
  return { url: urlOf(server.resolvedUrls, server.httpServer), kind: 'dev', close: () => server.close() };
}

/**
 * The local address a server listens on.
 * @param {{ local: string[] } | null} resolved
 * @param {import('node:http').Server | null | undefined} http
 * @returns {string}
 */
function urlOf(resolved, http) {
  const local = resolved?.local[0];
  if (local) return local.endsWith('/') ? local : `${local}/`;
  const address = http?.address();
  if (address && typeof address === 'object') return `http://localhost:${address.port}/`;
  throw new Error('the server is not listening');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startServer({ dist: process.argv.includes('--dist') });
  console.log(`RUNSHIFT (${server.kind === 'dist' ? 'dist/ build' : 'dev sources, no file watching'}): ${server.url}`);
  console.log('Test URLs: ?debug, ?bot=perfect&seed=7&speed=4 and more (src/debug/hooks.ts). Ctrl+C stops.');
}
