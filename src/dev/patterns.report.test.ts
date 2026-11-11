import { it } from 'vitest';

// The pattern report (npm run patterns). Excluded from tsc and npm test.
// WP-00 placeholder: fails loudly until WP-12 replaces it, so nobody mistakes it for a passing check.
// TODO WP-12: every pattern solvable at its tiers' v_min and v_max, the wall-length rule, a printed table, failure on
// any violation; WP-42: the full rule set.
it('validates every pattern at its tier speed bounds', () => {
  throw new Error('npm run patterns: not implemented yet: src/dev/patterns.report.test.ts belongs to WP-12 (docs/STATUS.md).');
});
