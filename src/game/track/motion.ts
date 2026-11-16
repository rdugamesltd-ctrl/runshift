import { TRAINS } from '../../balance';
import type { CollisionBox } from '../types';

/** Moves oncoming trains in track space so rendering and collision read the same position. */
export function advanceMovingTrains(boxes: readonly CollisionBox[], playerD: number, dt: number): void {
  for (const box of boxes) {
    if (box.kind !== 'metroCar' || box.vd === 0) continue;
    if (box.d0 - playerD > TRAINS.activationAhead) continue;
    const shift = box.vd * dt;
    box.d0 += shift;
    box.d1 += shift;
  }
}
