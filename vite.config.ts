import { defineConfig } from 'vitest/config';

/** The platform a Vite mode builds for: `--mode poki` and `--mode crazygames` are portal builds, any other mode is local. */
function platformFor(mode: string): 'local' | 'poki' | 'crazygames' {
  return mode === 'poki' || mode === 'crazygames' ? mode : 'local';
}

export default defineConfig(({ mode }) => ({
  // Relative paths, so the build still works when a portal hosts it in a subfolder.
  base: './',
  // Picks the platform adapter in src/platform/index.ts. Declared in src/vite-env.d.ts.
  define: { __PLATFORM__: JSON.stringify(platformFor(mode)) },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The long reports run on their own: npm run patterns, npm run stress.
    exclude: ['src/dev/**', 'node_modules/**'],
  },
}));
