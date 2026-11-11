import type { Band, District, Lane, ObstacleKind, PathAct, PowerUpKind, ShellKind, Side, WallObstacleKind, WallSpan } from '../types';

/*
 * A pattern is a few beats of authored content (src/game/track/patterns/*.json, schema in pattern.schema.json).
 * Times `t` are beats: seconds of travel at the predicted arrival speed, so metres = beats × speed. Coin spacing
 * is in metres. The types below follow the example in docs/CONVENTIONS.md; WP-02 owns them and may refine them.
 */

/** A stretch with no floor, beats [t0, t1]. */
export interface PatternGap {
  t0: number;
  t1: number;
}

/** An obstacle on a wall, from beat t for len beats. */
export interface PatternWallBlock {
  t: number;
  len: number;
  kind: WallObstacleKind;
}

/** A runnable wall on one side, beats [t0, t1]. */
export interface PatternWall {
  side: Side;
  t0: number;
  t1: number;
  surface: WallSpan['surface'];
  blocks: PatternWallBlock[];
}

/** A ground obstacle at beat t in the given lanes; len is extra length in beats (0 for a single box). */
export interface PatternObstacle {
  t: number;
  kind: ObstacleKind;
  lanes: Lane[];
  len: number;
}

/** A line of coins from beat t0 to t1: in a lane, or on a wall in a band. */
export interface PatternCoins {
  t0: number;
  t1: number;
  lane?: Lane;
  wall?: Side;
  band?: Band;
}

/** A power-up at beat t in a lane; 'random' lets the spawner choose. */
export interface PatternPickup {
  t: number;
  lane: Lane;
  kind: PowerUpKind | 'random';
}

/** A key of the authored safe route at beat t. */
export interface PatternPathKey {
  t: number;
  lane?: Lane;
  act?: PathAct;
  side?: Side;
  band?: Band;
}

/** One authored pattern. `actions` is how many player actions it takes. */
export interface Pattern {
  id: string;
  tiers: number[];
  weight: number;
  beats: number;
  shell: ShellKind;
  districts: District[];
  gaps: PatternGap[];
  walls: PatternWall[];
  obstacles: PatternObstacle[];
  coins: PatternCoins[];
  pickups: PatternPickup[];
  path: PatternPathKey[];
  actions: number;
}

/** Every pattern, parsed at load. WP-00 stub: none. TODO WP-02: parse patterns/*.json, throwing with id + field. */
export const PATTERNS: readonly Pattern[] = [];

/** The pattern with this id, or null. */
export function patternById(id: string): Pattern | null {
  return PATTERNS.find((pattern) => pattern.id === id) ?? null;
}
