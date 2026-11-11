import type { GameEvent } from '../game/types';

/**
 * The sound recipe for an event, by name, or null for silence. WP-00 stub: all silent.
 * TODO WP-35: every GameEvent, wall-run grind loop, power-up loops, a lazy music stub.
 */
export function soundFor(_event: GameEvent): string | null {
  return null;
}
