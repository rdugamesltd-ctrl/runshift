import type { District } from '../types';
import type { Pattern } from './patterns';

/**
 * Chooses the next pattern. WP-00 stub: none, so every chunk stays plain street.
 * TODO WP-02: weighted no-repeat choice by tier and district, breathers of TIERS[t].minGap·v with lane-change
 * keys, the actions-per-40 m target; WP-12: TIERS[t].wallShare and the pitWalls shell.
 */
export class Director {
  /** The next pattern for this tier and district, or null for plain street. */
  pick(_tier: number, _district: District, _rng: () => number): Pattern | null {
    return null;
  }
}
