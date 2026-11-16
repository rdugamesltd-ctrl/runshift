import { TRAINS } from '../../balance';
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

/** A raised stretch of floor, in beats; short steps make its front edge readable. */
export interface PatternRise {
  t0: number;
  t1: number;
  height: number;
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
  /** A train with a climbable ramp at the near end. */
  ramp?: boolean;
  /** Override for a short, steep ramp. */
  rampLength?: number;
  /** Train speed along the track; negative values approach the player. */
  vd?: number;
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
  rises?: PatternRise[];
  walls: PatternWall[];
  obstacles: PatternObstacle[];
  coins: PatternCoins[];
  pickups: PatternPickup[];
  path: PatternPathKey[];
  actions: number;
}

/** A small first set of street patterns. WP-02 expands these into the full JSON catalogue. */
export const PATTERNS: readonly Pattern[] = [
  {
    id: 'dodge-left', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.1, shell: 'street', districts: ['street'],
    gaps: [], walls: [], obstacles: [
      { t: 0.7, kind: 'blocker', lanes: [0], len: 0 },
      { t: 0.7, kind: 'barrierLow', lanes: [1], len: 0 },
    ],
    coins: [{ t0: 0.8, t1: 1.1, lane: -1 }], pickups: [],
    path: [{ t: 0.2, lane: -1 }], actions: 1,
  },
  {
    id: 'dodge-right', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.1, shell: 'street', districts: ['street'],
    gaps: [], walls: [], obstacles: [
      { t: 0.7, kind: 'blocker', lanes: [0], len: 0 },
      { t: 0.7, kind: 'barrierLow', lanes: [-1], len: 0 },
    ],
    coins: [{ t0: 0.8, t1: 1.1, lane: 1 }], pickups: [],
    path: [{ t: 0.2, lane: 1 }], actions: 1,
  },
  {
    id: 'jump-low', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.1, shell: 'street', districts: ['street'],
    gaps: [], walls: [], obstacles: [
      { t: 0.7, kind: 'barrierLow', lanes: [0], len: 0 },
      { t: 0.7, kind: 'blocker', lanes: [-1], len: 0 },
    ],
    coins: [], pickups: [], path: [{ t: 0.5, lane: 0, act: 'jump' }], actions: 1,
  },
  {
    id: 'slide-high', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.1, shell: 'street', districts: ['street'],
    gaps: [], walls: [], obstacles: [
      { t: 0.7, kind: 'barrierHigh', lanes: [0], len: 0 },
      { t: 0.7, kind: 'blocker', lanes: [1], len: 0 },
    ],
    coins: [], pickups: [], path: [{ t: 0.5, lane: 0, act: 'slide' }], actions: 1,
  },
  {
    id: 'raised-hurdle', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.1, shell: 'street', districts: ['street'],
    gaps: [], rises: [{ t0: 0.16, t1: 0.96, height: 0.6 }], walls: [],
    obstacles: [{ t: 0.7, kind: 'barrierLow', lanes: [0], len: 0 },
      { t: 0.7, kind: 'blocker', lanes: [1], len: 0 }],
    coins: [{ t0: 0.79, t1: 0.9, lane: -1 }], pickups: [],
    path: [{ t: 0.5, lane: 0, act: 'jump' }], actions: 1,
  },
  {
    id: 'raised-sides', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.1, shell: 'street', districts: ['street'],
    gaps: [], rises: [{ t0: 0.16, t1: 0.96, height: 0.6 }], walls: [],
    obstacles: [{ t: 0.7, kind: 'blocker', lanes: [-1, 1], len: 0 }],
    coins: [{ t0: 0.62, t1: 0.9, lane: 0 }], pickups: [],
    path: [], actions: 0,
  },
  {
    id: 'train-roofs', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.5, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [
      { t: 0.7, kind: 'metroCar', lanes: [0], len: 0.75, ramp: true },
      { t: 0.83, kind: 'metroCar', lanes: [1], len: 0.62, vd: TRAINS.oncomingSpeed },
    ],
    coins: [{ t0: 0.87, t1: 1.35, lane: 0 }], pickups: [],
    path: [], actions: 0,
  },
  {
    id: 'train-left', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.5, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [
      { t: 0.7, kind: 'metroCar', lanes: [0], len: 0.75, ramp: true },
      { t: 0.7, kind: 'metroCar', lanes: [-1], len: 0.75 },
    ],
    coins: [{ t0: 0.87, t1: 1.35, lane: 0 }], pickups: [],
    path: [], actions: 0,
  },
  {
    id: 'train-three', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.5, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [
      { t: 0.7, kind: 'metroCar', lanes: [0], len: 0.75, ramp: true },
      { t: 0.7, kind: 'metroCar', lanes: [-1], len: 0.75 },
      { t: 0.83, kind: 'metroCar', lanes: [1], len: 0.62, vd: TRAINS.oncomingSpeed },
    ],
    coins: [{ t0: 0.87, t1: 1.35, lane: 0 }], pickups: [],
    path: [], actions: 0,
  },
  {
    id: 'train-hop', tiers: [4], weight: 0.7, beats: 1.5, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [
      { t: 0.7, kind: 'metroCar', lanes: [0], len: 0.45, ramp: true, rampLength: 2.4 },
      { t: 0.79, kind: 'metroCar', lanes: [1], len: 0.52 },
      { t: 1.23, kind: 'metroCar', lanes: [0], len: 0.27 },
    ],
    coins: [{ t0: 0.87, t1: 1.08, lane: 0 }, { t0: 1.36, t1: 1.43, lane: 0 }], pickups: [],
    path: [{ t: 1.04, lane: 0, act: 'jump' }], actions: 1,
  },
  // Rail-yard set: rows across all three tracks, zigzags, side-lane ramp climbs and oncoming dodges.
  {
    id: 'row-jump', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.1, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [{ t: 0.7, kind: 'barrierLow', lanes: [-1, 0, 1], len: 0 }],
    coins: [{ t0: 0.2, t1: 0.45, lane: 0 }], pickups: [], path: [{ t: 0.5, lane: 0, act: 'jump' }], actions: 1,
  },
  {
    id: 'row-slide', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.1, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [{ t: 0.7, kind: 'barrierHigh', lanes: [-1, 0, 1], len: 0 }],
    coins: [{ t0: 0.2, t1: 0.45, lane: 0 }], pickups: [], path: [{ t: 0.5, lane: 0, act: 'slide' }], actions: 1,
  },
  {
    id: 'row-mixed', tiers: [1, 2, 3, 4], weight: 1, beats: 1.1, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [
      { t: 0.7, kind: 'barrierLow', lanes: [-1], len: 0 },
      { t: 0.7, kind: 'barrierHigh', lanes: [0], len: 0 },
      { t: 0.7, kind: 'blocker', lanes: [1], len: 0 },
    ],
    coins: [], pickups: [], path: [{ t: 0.5, lane: 0, act: 'slide' }], actions: 1,
  },
  {
    id: 'zigzag-right', tiers: [1, 2, 3, 4], weight: 1, beats: 1.45, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [
      { t: 0.55, kind: 'blocker', lanes: [-1, 0], len: 0 },
      { t: 1.2, kind: 'blocker', lanes: [1], len: 0 },
      { t: 1.2, kind: 'barrierLow', lanes: [-1], len: 0 },
    ],
    coins: [{ t0: 0.35, t1: 0.7, lane: 1 }, { t0: 0.95, t1: 1.4, lane: 0 }], pickups: [],
    path: [{ t: 0.15, lane: 1 }, { t: 0.8, lane: 0 }], actions: 2,
  },
  {
    id: 'zigzag-left', tiers: [1, 2, 3, 4], weight: 1, beats: 1.45, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [
      { t: 0.55, kind: 'blocker', lanes: [0, 1], len: 0 },
      { t: 1.2, kind: 'blocker', lanes: [-1], len: 0 },
      { t: 1.2, kind: 'barrierLow', lanes: [1], len: 0 },
    ],
    coins: [{ t0: 0.35, t1: 0.7, lane: -1 }, { t0: 0.95, t1: 1.4, lane: 0 }], pickups: [],
    path: [{ t: 0.15, lane: -1 }, { t: 0.8, lane: 0 }], actions: 2,
  },
  {
    id: 'train-ramp-left', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.5, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [
      { t: 0.7, kind: 'metroCar', lanes: [-1], len: 0.75, ramp: true },
      { t: 0.7, kind: 'metroCar', lanes: [0], len: 0.75 },
      { t: 1.0, kind: 'blocker', lanes: [1], len: 0 },
    ],
    coins: [{ t0: 0.3, t1: 0.6, lane: -1 }, { t0: 0.87, t1: 1.35, lane: -1 }], pickups: [],
    path: [{ t: 0.15, lane: -1 }], actions: 1,
  },
  {
    id: 'train-ramp-right', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.5, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [
      { t: 0.7, kind: 'metroCar', lanes: [1], len: 0.75, ramp: true },
      { t: 0.7, kind: 'metroCar', lanes: [0], len: 0.75 },
      { t: 1.0, kind: 'blocker', lanes: [-1], len: 0 },
    ],
    coins: [{ t0: 0.3, t1: 0.6, lane: 1 }, { t0: 0.87, t1: 1.35, lane: 1 }], pickups: [],
    path: [{ t: 0.15, lane: 1 }], actions: 1,
  },
  {
    id: 'train-oncoming-left', tiers: [1, 2, 3, 4], weight: 1, beats: 1.5, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [
      { t: 0.83, kind: 'metroCar', lanes: [0, 1], len: 0.62, vd: TRAINS.oncomingSpeed },
    ],
    coins: [{ t0: 0.4, t1: 1.4, lane: -1 }], pickups: [],
    path: [{ t: 0.15, lane: -1 }], actions: 1,
  },
  {
    id: 'train-oncoming-right', tiers: [1, 2, 3, 4], weight: 1, beats: 1.5, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [
      { t: 0.83, kind: 'metroCar', lanes: [-1, 0], len: 0.62, vd: TRAINS.oncomingSpeed },
    ],
    coins: [{ t0: 0.4, t1: 1.4, lane: 1 }], pickups: [],
    path: [{ t: 0.15, lane: 1 }], actions: 1,
  },
  {
    id: 'train-corridor-jump', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.5, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [
      { t: 0.55, kind: 'metroCar', lanes: [-1, 1], len: 0.85 },
      { t: 1.0, kind: 'barrierLow', lanes: [0], len: 0 },
    ],
    coins: [{ t0: 0.3, t1: 0.75, lane: 0 }], pickups: [],
    path: [{ t: 0.8, lane: 0, act: 'jump' }], actions: 1,
  },
  {
    id: 'train-corridor-slide', tiers: [1, 2, 3, 4], weight: 1, beats: 1.5, shell: 'street', districts: ['street', 'subway'],
    gaps: [], walls: [], obstacles: [
      { t: 0.55, kind: 'metroCar', lanes: [-1, 1], len: 0.85 },
      { t: 1.0, kind: 'barrierHigh', lanes: [0], len: 0 },
    ],
    coins: [{ t0: 0.3, t1: 0.75, lane: 0 }], pickups: [],
    path: [{ t: 0.8, lane: 0, act: 'slide' }], actions: 1,
  },
  {
    id: 'wall-right-gap', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.25, shell: 'pitWalls', districts: ['street'],
    gaps: [{ t0: 0.5, t1: 1.0 }], walls: [{ side: 1, t0: 0, t1: 1.25, surface: 'hoarding',
      blocks: [{ t: 0.8, len: 0.1, kind: 'wallSignHigh' }] }],
    obstacles: [], coins: [{ t0: 0.55, t1: 0.7, wall: 1, band: 'low' }], pickups: [],
    path: [{ t: 0.1, lane: 0, act: 'wall', side: 1, band: 'low' }], actions: 1,
  },
  {
    id: 'wall-left-gap', tiers: [0, 1, 2, 3, 4], weight: 1, beats: 1.25, shell: 'pitWalls', districts: ['street'],
    gaps: [{ t0: 0.5, t1: 1.0 }], walls: [{ side: -1, t0: 0, t1: 1.25, surface: 'hoarding', blocks: [] }],
    obstacles: [], coins: [{ t0: 0.55, t1: 0.9, wall: -1, band: 'low' }], pickups: [],
    path: [{ t: 0.1, lane: 0, act: 'wall', side: -1, band: 'low' }], actions: 1,
  },
  {
    id: 'wall-right-swap', tiers: [4], weight: 1, beats: 1.4, shell: 'pitWalls', districts: ['street'],
    gaps: [{ t0: 0.5, t1: 1.1 }], walls: [
      { side: 1, t0: 0, t1: 0.8, surface: 'hoarding', blocks: [{ t: 0.7, len: 0.1, kind: 'wallPipeFull' }] },
      { side: -1, t0: 0.6, t1: 1.4, surface: 'facade', blocks: [] },
    ], obstacles: [], coins: [], pickups: [],
    path: [{ t: 0.1, lane: 0, act: 'wall', side: 1, band: 'low' }, { t: 0.55, lane: 0, act: 'wallJump', side: 1 }], actions: 2,
  },
  {
    id: 'wall-left-swap', tiers: [4], weight: 1, beats: 1.4, shell: 'pitWalls', districts: ['street'],
    gaps: [{ t0: 0.5, t1: 1.1 }], walls: [
      { side: -1, t0: 0, t1: 0.8, surface: 'facade', blocks: [{ t: 0.7, len: 0.1, kind: 'wallPipeFull' }] },
      { side: 1, t0: 0.6, t1: 1.4, surface: 'hoarding', blocks: [] },
    ], obstacles: [], coins: [], pickups: [],
    path: [{ t: 0.1, lane: 0, act: 'wall', side: -1, band: 'low' }, { t: 0.55, lane: 0, act: 'wallJump', side: -1 }], actions: 2,
  },
  {
    id: 'wall-right-vent', tiers: [4], weight: 1, beats: 1.25, shell: 'pitWalls', districts: ['street'],
    gaps: [{ t0: 0.5, t1: 1.0 }], walls: [{ side: 1, t0: 0, t1: 1.25, surface: 'hoarding',
      blocks: [{ t: 0.8, len: 0.1, kind: 'wallVentLow' }] }],
    obstacles: [], coins: [{ t0: 0.8, t1: 0.95, wall: 1, band: 'high' }], pickups: [],
    path: [{ t: 0.1, lane: 0, act: 'wall', side: 1, band: 'low' }, { t: 0.55, lane: 0, act: 'band', band: 'high' }], actions: 2,
  },
];

/** The pattern with this id, or null. */
export function patternById(id: string): Pattern | null {
  return PATTERNS.find((pattern) => pattern.id === id) ?? null;
}
