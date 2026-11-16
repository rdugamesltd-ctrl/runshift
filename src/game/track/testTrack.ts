import { TIERS, WALL } from '../../balance';
import type {
  Coin,
  CollisionBox,
  FloorSpan,
  HitRule,
  ObstacleKind,
  PathKey,
  Pickup,
  Side,
  TrackQuery,
  WallJumpTarget,
  WallSpan,
} from '../types';

/**
 * What a test track is made of. Every list is optional. The items themselves are not copied, so a test
 * sees what the simulation does to them (taken coins, broken boxes).
 */
export interface TestTrackSpec {
  floors?: FloorSpan[];
  walls?: WallSpan[];
  boxes?: CollisionBox[];
  coins?: Coin[];
  pickups?: Pickup[];
  path?: PathKey[];
  /** One tier for every d. Without it the tier follows TIERS by distance. */
  tier?: number;
}

/** A stretch of track with no floor, and whether any wall runs beside it. */
interface Gap {
  start: number;
  end: number;
  walls: boolean;
}

/** Index into TIERS of the tier that `d` metres falls in. */
function tierFor(d: number): number {
  let tier = 0;
  for (let i = 1; i < TIERS.length; i++) if (d >= TIERS[i].from) tier = i;
  return tier;
}

/** Gaps between the floor spans (the ground before the first span and after the last one is off the track). */
function findGaps(floors: readonly FloorSpan[], walls: readonly WallSpan[]): Gap[] {
  const gaps: Gap[] = [];
  let coveredTo = -Infinity;
  for (const floor of floors) {
    if (coveredTo !== -Infinity && floor.start > coveredTo) {
      const start = coveredTo;
      const end = floor.start;
      gaps.push({ start, end, walls: walls.some((w) => w.start < end && w.end > start) });
    }
    coveredTo = Math.max(coveredTo, floor.end);
  }
  return gaps;
}

/** Writes the items of `items` (sorted by `lo`) that overlap [d0, d1] into out[0..n) and returns n. */
function collect<T>(items: readonly T[], lo: (item: T) => number, hi: (item: T) => number, d0: number, d1: number, out: T[]): number {
  let n = 0;
  for (const item of items) {
    if (lo(item) > d1) break;
    if (hi(item) >= d0) out[n++] = item;
  }
  out.length = n;
  return n;
}

/**
 * A TrackQuery over explicit arrays, answered by brute force: the reference that the real streamer's
 * queries are tested against, and the track for physics tests. Semantics:
 * - floors are half-open [start, end); where spans overlap the highest floor wins; x is ignored;
 * - walls are half-open [start, end) on their side;
 * - `*In(d0, d1, out)` is closed on both ends, in ascending d, hands out the given objects and sets
 *   out.length to the count;
 * - `nextGap` only knows gaps between floor spans: before the first and after the last span is off the track.
 */
export function createTestTrack(spec: TestTrackSpec = {}): TrackQuery {
  const floors = [...(spec.floors ?? [])].sort((a, b) => a.start - b.start);
  const walls = [...(spec.walls ?? [])].sort((a, b) => a.start - b.start);
  const boxes = [...(spec.boxes ?? [])].sort((a, b) => a.d0 - b.d0);
  const coins = [...(spec.coins ?? [])].sort((a, b) => a.d - b.d);
  const pickups = [...(spec.pickups ?? [])].sort((a, b) => a.d - b.d);
  const path = [...(spec.path ?? [])].sort((a, b) => a.d - b.d);
  const gaps = findGaps(floors, walls);

  const floorAt = (d: number): number | null => {
    let y: number | null = null;
    for (const floor of floors) {
      if (floor.start > d) break;
      if (d < floor.end && (y === null || floor.y > y)) y = floor.y;
    }
    return y;
  };

  const runnableWall = (d: number, side: Side): WallSpan | null => {
    for (const wall of walls) {
      if (wall.start > d) break;
      if (wall.side === side && d < wall.end) return wall;
    }
    return null;
  };

  return {
    floorAt,
    platformAt(d, x) {
      let top: number | null = null;
      for (const box of boxes) {
        if (box.kind !== 'metroCar' || box.broken || d < box.d0 || d >= box.d1 || x < box.x0 || x >= box.x1) continue;
        const rise = box.rampLength && d < box.d0 + box.rampLength
          ? box.y0 + (box.y1 - box.y0) * (d - box.d0) / box.rampLength : box.y1;
        if (top === null || rise > top) top = rise;
      }
      return top;
    },
    runnableWall,
    resolveWallJump(d: number, from: Side, v: number): WallJumpTarget {
      const land = d + v * WALL.speedFactor * WALL.jumpTime;
      const side: Side = from === 1 ? -1 : 1;
      const needed = land + v * WALL.minLanding;
      for (const wall of walls) {
        if (wall.side === side && wall.start <= land && wall.end >= needed) return { kind: 'wall', side, d: land };
      }
      if (floorAt(land) !== null) return { kind: 'floor', lane: 0, d: land };
      return { kind: 'none', d: land };
    },
    boxesIn(d0, d1, out) {
      let n = 0;
      for (const box of boxes) if (box.d0 <= d1 && box.d1 >= d0) out[n++] = box;
      out.length = n;
      out.sort((a, b) => a.d0 - b.d0);
      return n;
    },
    coinsIn: (d0, d1, out) => collect(coins, (c) => c.d, (c) => c.d, d0, d1, out),
    pickupsIn: (d0, d1, out) => collect(pickups, (p) => p.d, (p) => p.d, d0, d1, out),
    pathAt(d: number, out: PathKey): PathKey {
      let key: PathKey | null = null;
      for (const k of path) {
        if (k.d > d) break;
        key = k;
      }
      out.d = key ? key.d : d;
      out.lane = key ? key.lane : 0;
      out.act = key?.act;
      out.side = key?.side;
      out.band = key?.band;
      return out;
    },
    nextGap(d: number) {
      for (const gap of gaps) if (gap.end > d) return { start: gap.start, end: gap.end, walls: gap.walls };
      return null;
    },
    tierAt: (d) => spec.tier ?? tierFor(d),
  };
}

/** A floor span from `start` to `end` at height `y`, for test tracks. */
export function floorSpan(start: number, end: number, y = 0): FloorSpan {
  return { start, end, y };
}

/** A wall span on `side` from `start` to `end`, for test tracks. */
export function wallSpan(side: Side, start: number, end: number, surface: WallSpan['surface'] = 'hoarding', blocks: number[] = []): WallSpan {
  return { side, start, end, surface, blocks };
}

let nextBoxId = 1;

/** A collision box for test tracks. Kind 'blocker' and rule 'dodge' unless given; ids count up from 1. */
export function testBox(
  box: Pick<CollisionBox, 'd0' | 'd1' | 'x0' | 'x1' | 'y0' | 'y1'> & { kind?: ObstacleKind; rule?: HitRule; vd?: number; id?: number },
): CollisionBox {
  return {
    id: box.id ?? nextBoxId++,
    kind: box.kind ?? 'blocker',
    rule: box.rule ?? 'dodge',
    d0: box.d0,
    d1: box.d1,
    x0: box.x0,
    x1: box.x1,
    y0: box.y0,
    y1: box.y1,
    vd: box.vd ?? 0,
    broken: false,
  };
}
