import { SCORE } from '../../balance';

/**
 * Score for a run's distance and gold: metres × SCORE.perMetre + gold × SCORE.perGold.
 * TODO WP-01: running score with the multiplier (WP-32: ×POWERUPS.multiplier.factor while it runs).
 */
export function scoreFor(metres: number, gold: number): number {
  return Math.floor(metres) * SCORE.perMetre + gold * SCORE.perGold;
}
