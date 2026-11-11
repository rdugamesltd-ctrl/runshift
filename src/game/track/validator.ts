import type { Pattern } from './patterns';

/** What the validator says about one pattern at one speed. `tightestGap` is in beats. */
export interface ValidationResult {
  solvable: boolean;
  pathOk: boolean;
  minActions: number;
  tightestGap: number;
}

/**
 * Checks a pattern at speed `v`. WP-00 stub: claims nothing is solvable, so nothing passes by accident.
 * TODO WP-12: replay the authored path with the real stepPlayer at the tiers' v_min and v_max, BFS over
 * {none, L, R, U, D} every 0.1 s, and the authoring rules in docs/CONVENTIONS.md; WP-42: the full rule set.
 */
export function validatePattern(_pattern: Pattern, _v: number): ValidationResult {
  return { solvable: false, pathOk: false, minActions: 0, tightestGap: 0 };
}
