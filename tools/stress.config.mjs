import { defineConfig } from 'vitest/config';

/** Runs only the stress report (npm run stress). See src/dev/stress.test.ts. WP-00 placeholder; WP-42 owns it. */
export default defineConfig({
  define: { __PLATFORM__: JSON.stringify('local') },
  test: {
    environment: 'node',
    include: ['src/dev/stress.test.ts'],
    testTimeout: 3600000,
  },
});
