import { WALL } from '../../balance';
import type { Side } from '../../game/types';

/** Root roll for wall-running on `side`, radians: ±WALL.rootRollDeg. TODO WP-24: sign convention, pivot at the feet. */
export function wallRollAngle(side: Side): number {
  return (side * WALL.rootRollDeg * Math.PI) / 180;
}

// TODO WP-24: additive spine lean (WALL.spineLeanDeg) and the wall-jump flip.
