import { COINS, JUMP, LANES, PLAYER, TRAINS, WALL } from '../../balance';
import type { Chunk, HitRule } from '../types';
import rawShapes from './obstacles.json';
import type { Pattern } from './patterns';
import { jumpArc } from '../entities/player';
import { speedAt } from './speed';

/**
 * Speed the player is predicted to have on reaching `start`, from the run's distance `d`, speed `v` and run
 * time now: speedAt(time + (start − d) / v). Patterns are authored in beats; beats × this = metres.
 */
export function arrivalSpeed(start: number, d: number, v: number, time: number): number {
  return speedAt(time + Math.max(0, start - d) / v);
}

interface Shape { depth: number; width: number; y0: number; y1: number; rule: HitRule }
const shapes = rawShapes as Record<string, Shape>;

/** Places a first-generation street pattern inside one chunk, in metres from beat positions. */
export function placePattern(pattern: Pattern, chunk: Chunk, arrivalV: number): void {
  chunk.patterns.push(pattern.id);
  chunk.shell = pattern.shell;
  for (const gap of pattern.gaps) {
    const gapStart = chunk.start + gap.t0 * arrivalV;
    const gapEnd = chunk.start + gap.t1 * arrivalV;
    chunk.floors = chunk.floors.flatMap(floor => {
      if (gapEnd <= floor.start || gapStart >= floor.end) return [floor];
      const pieces = [];
      if (gapStart > floor.start) pieces.push({ start: floor.start, end: gapStart, y: floor.y });
      if (gapEnd < floor.end) pieces.push({ start: gapEnd, end: floor.end, y: floor.y });
      return pieces;
    });
  }
  for (const rise of pattern.rises ?? []) {
    const start = chunk.start + rise.t0 * arrivalV;
    const end = chunk.start + rise.t1 * arrivalV;
    const step = Math.min((end - start) / 4, 0.8);
    const cuts = [start, start + step, start + 2 * step, start + 3 * step, end];
    chunk.floors = chunk.floors.flatMap(floor => {
      if (end <= floor.start || start >= floor.end) return [floor];
      const pieces = [];
      if (floor.start < start) pieces.push({ start: floor.start, end: start, y: floor.y });
      for (let i = 0; i < 4; i++) {
        const a = Math.max(floor.start, cuts[i]);
        const b = Math.min(floor.end, cuts[i + 1]);
        if (b > a) pieces.push({ start: a, end: b, y: floor.y + rise.height * Math.min(1, (i + 1) / 3) });
      }
      if (floor.end > end) pieces.push({ start: end, end: floor.end, y: floor.y });
      return pieces;
    });
  }
  const floorHeight = (d: number): number => chunk.floors.find(floor => floor.start <= d && d < floor.end)?.y ?? 0;
  const coinSurface = (d: number, x: number): number => {
    const roof = chunk.boxes.find(box => box.kind === 'metroCar' && box.d0 <= d && d < box.d1 && box.x0 <= x && x < box.x1);
    return roof?.y1 ?? floorHeight(d);
  };
  for (const wall of pattern.walls) {
    const span = { side: wall.side, start: chunk.start + wall.t0 * arrivalV, end: chunk.start + wall.t1 * arrivalV,
      surface: wall.surface, blocks: [] as number[] };
    chunk.walls.push(span);
    for (const obstacle of wall.blocks) {
      const shape = shapes[obstacle.kind];
      if (!shape) throw new Error(`No collision shape for ${obstacle.kind}`);
      const near = wall.side * (WALL.planeX - WALL.poseReach);
      const far = wall.side * WALL.planeX;
      const id = chunk.index * 100 + chunk.boxes.length + 1;
      chunk.boxes.push({ id, kind: obstacle.kind, rule: shape.rule,
        d0: chunk.start + obstacle.t * arrivalV, d1: chunk.start + (obstacle.t + obstacle.len) * arrivalV,
        x0: Math.min(near, far), x1: Math.max(near, far), y0: shape.y0, y1: shape.y1, vd: 0, broken: false });
      span.blocks.push(id);
    }
  }
  for (const obstacle of pattern.obstacles) {
    const shape = shapes[obstacle.kind];
    if (!shape) throw new Error(`No collision shape for ${obstacle.kind}`);
    const centre = chunk.start + obstacle.t * arrivalV;
    for (const lane of obstacle.lanes) {
      const x = lane * LANES.width;
      chunk.boxes.push({
        id: chunk.index * 100 + chunk.boxes.length + 1,
        kind: obstacle.kind,
        rule: shape.rule,
        d0: centre - shape.depth / 2,
        d1: centre + shape.depth / 2 + obstacle.len * arrivalV,
        x0: x - shape.width / 2,
        x1: x + shape.width / 2,
        y0: shape.y0 + floorHeight(centre),
        y1: shape.y1 + floorHeight(centre),
        vd: obstacle.vd ?? 0,
        rampLength: obstacle.ramp ? obstacle.rampLength ?? TRAINS.rampLength : undefined,
        broken: false,
      });
    }
  }
  // Bonus coins that teach the moves: an arc over each low barrier, a low line under each high one.
  const coinAt = (d: number, x: number, y: number) => chunk.coins.push({ d, x, y, taken: false, fromThief: true });
  for (const obstacle of pattern.obstacles) {
    if (obstacle.kind !== 'barrierLow' && obstacle.kind !== 'barrierHigh') continue;
    const centre = chunk.start + obstacle.t * arrivalV;
    const base = floorHeight(centre);
    for (const lane of obstacle.lanes) {
      const x = lane * LANES.width;
      if (obstacle.kind === 'barrierLow') {
        const length = JUMP.airtime * arrivalV;
        for (let i = 0; i < COINS.arc; i++) {
          const u = (i + 0.5) / COINS.arc;
          coinAt(centre - length / 2 + u * length, x, base + PLAYER.height / 2 + jumpArc(u));
        }
      } else {
        for (let i = 0; i < COINS.under; i++) coinAt(centre + (i - (COINS.under - 1) / 2) * COINS.spacing * 0.6, x, base + COINS.underY);
      }
    }
  }
  for (const line of pattern.coins) {
    if (line.lane === undefined && line.wall === undefined) continue;
    const first = chunk.start + line.t0 * arrivalV;
    const last = chunk.start + line.t1 * arrivalV;
    const x = line.wall === undefined ? (line.lane ?? 0) * LANES.width : line.wall * (WALL.planeX - WALL.poseReach / 2);
    const y = (line.wall === undefined ? 0 : line.band === 'high' ? WALL.bandHigh : WALL.bandLow) + PLAYER.height / 2;
    for (let d = first; d <= last; d += COINS.spacing) {
      chunk.coins.push({ d, x, y: y + (line.wall === undefined ? coinSurface(d, x) : 0), taken: false, fromThief: true });
    }
  }
  for (const key of pattern.path) {
    chunk.path.push({ d: chunk.start + key.t * arrivalV, lane: key.lane ?? 0, act: key.act, side: key.side, band: key.band });
  }
}
