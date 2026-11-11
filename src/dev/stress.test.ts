import { it } from 'vitest';

// The stress report (npm run stress). Excluded from tsc and npm test.
// WP-00 placeholder: fails loudly until WP-42 replaces it, so nobody mistakes it for a passing check.
// TODO WP-42: perfect bot 8 km on 10 seeds, sloppy bot death distribution, wall share within ±3%, written to
// reports/stress-report.txt.
it('runs the bots over 10 seeds and writes reports/stress-report.txt', () => {
  throw new Error('npm run stress: not implemented yet: src/dev/stress.test.ts belongs to WP-42 (docs/STATUS.md).');
});
