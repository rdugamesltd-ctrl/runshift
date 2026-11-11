import { speedAt } from './speed';

/**
 * Speed the player is predicted to have on reaching `start`, from the run's distance `d`, speed `v` and run
 * time now: speedAt(time + (start − d) / v). Patterns are authored in beats; beats × this = metres.
 */
export function arrivalSpeed(start: number, d: number, v: number, time: number): number {
  return speedAt(time + Math.max(0, start - d) / v);
}

// TODO WP-02: convert(pattern, chunk, ...) places a pattern's gaps, walls, obstacles (obstacles.json sizes),
// coins (every COINS.spacing m, jump-arc heights from the parabola), pickups and path keys into a chunk.
