import type { RunState, TipId } from '../types';

/**
 * Freeze-and-tip tutorial (Rail's pattern): stops the run just before something new and waits for the right
 * swipe. WP-00 stub: never shows a tip.
 * TODO WP-14: lanes, jump, slide, wall, band and wallJump tips saved in save.tips, READ_TIME 0.35 s; WP-43:
 * polish and the HOW TO PLAY replay.
 */
export class Tutorial {
  enabled = false;
  /** The tip on screen, or null. */
  tip: TipId | null = null;

  /** Called once per frame before the steps. Returns true while the run must stay frozen. */
  update(_state: RunState, _dt: number): boolean {
    return false;
  }
}
