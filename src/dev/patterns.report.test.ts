import { expect, it } from 'vitest';
import { SPEED } from '../balance';
import { PATTERNS } from '../game/track/patterns';
import { validatePattern } from '../game/track/validator';

// The pattern report (npm run patterns). Excluded from tsc and npm test.
// WP-42 adds breadth-first search for shortest paths and the full difficulty catalogue.
it('validates every pattern at its tier speed bounds', () => {
  const rows = PATTERNS.flatMap(pattern => [SPEED.start, SPEED.start + SPEED.gain].map(v => {
    const result = validatePattern(pattern, v);
    return { pattern: pattern.id, speed: v, tiers: pattern.tiers.join(','), actions: result.minActions,
      gap: Number.isFinite(result.tightestGap) ? result.tightestGap.toFixed(2) : '—',
      path: result.pathOk ? 'pass' : 'FAIL' };
  }));
  console.table(rows);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(row => row.path === 'pass')).toBe(true);
});
