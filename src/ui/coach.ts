import type { TipId } from '../game/types';

/**
 * The tutorial coach: the tip card and the arrow at the wall. WP-00 stub: shows nothing.
 * TODO WP-14: tip cards and the wall arrow; WP-43: polish.
 */
export class Coach {
  show(_tip: TipId | null): void {}
  update(_dt: number): void {}
}
