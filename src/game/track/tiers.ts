import { TIERS } from '../../balance';

/** Index into TIERS of the tier that distance `d` falls in (TIERS[i].from ≤ d). */
export function tierForDistance(d: number): number {
  let tier = 0;
  for (let i = 1; i < TIERS.length; i++) if (d >= TIERS[i].from) tier = i;
  return tier;
}

// TODO WP-02: anything else tier-related the director needs (action targets, breathers).
