import { defineConfig } from 'vitest/config';

/** Runs only the pattern report (npm run patterns). See src/dev/patterns.report.test.ts. WP-00 placeholder; WP-12 owns it. */
export default defineConfig({
  define: { __PLATFORM__: JSON.stringify('local') },
  test: {
    environment: 'node',
    include: ['src/dev/patterns.report.test.ts'],
    testTimeout: 600000,
  },
});
