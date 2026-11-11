import { POWERUPS } from '../../balance';
import type { PowerUpKind } from '../types';

/** How long a power-up lasts at an upgrade level, s: base + perLevel × level. */
export function powerUpDuration(kind: PowerUpKind, level: number): number {
  const spec = POWERUPS[kind];
  return spec.base + spec.perLevel * level;
}

// TODO WP-32: magnet (coins within POWERUPS.magnet.radius fly in), shield (one hit, then invulnerable), multiplier,
// glide (rides gaps, catches one fall), timers in RunState.powerUps, and the spawn decorator (every spawnEvery m).
