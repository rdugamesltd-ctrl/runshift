import { LANES, PLAYER, POWERUPS, STUMBLE, TRAINS } from '../../balance';
import type { CollisionBox, GameEvent, RunState, Side, TrackQuery } from '../types';
import { crashPlayer, playerBox, toLane } from './player';

/** An axis-aligned box in track space, metres: d0..d1 along the run, x0..x1 across, y0..y1 up. CollisionBox is one too. */
export interface Box {
  d0: number;
  d1: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
/** True when two boxes overlap with some volume (touching faces do not count). */
export function overlaps(a: Box, b: Box): boolean {
  return a.d0 < b.d1 && b.d0 < a.d1 && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Checks obstacles swept through this step. A sideways hit stumbles; a hit straight ahead crashes. */
export function collide(state: RunState, track: TrackQuery, events: GameEvent[], candidates: CollisionBox[]): void {
  const p = state.player;
  if (p.mode.kind === 'crash' || p.mode.kind === 'fall' || p.invulnT > 0) return;
  const from = Math.min(state.prev.d, state.d) - PLAYER.depth / 2;
  const to = Math.max(state.prev.d, state.d) + PLAYER.depth / 2;
  track.boxesIn(from, to, candidates);
  const current: Box = { d0: 0, d1: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
  playerBox(p, state.d, current);
  current.d0 = from;
  current.d1 = to;
  const old: Box = { ...current, x0: state.prev.x - PLAYER.width / 2, x1: state.prev.x + PLAYER.width / 2 };
  for (const box of candidates) {
    const wallBox = box.rule === 'bandLow' || box.rule === 'bandHigh' || box.rule === 'wallJump';
    if (p.mode.kind === 'wallRun' ? !wallBox : wallBox) continue;
    // Once the runner's centre passes the rear, the back of their box must not catch on the wagon.
    if (box.kind === 'metroCar' && state.d >= box.d1) continue;
    if (box.kind === 'metroCar' && box.rampLength && state.d >= box.d0 - PLAYER.depth / 2 && state.d < box.d0 + box.rampLength) {
      const u = Math.max(0, (state.d - box.d0) / box.rampLength);
      const rampY = box.y0 + (box.y1 - box.y0) * u;
      if (p.y >= rampY - TRAINS.maxRampStep) continue;
    }
    if (box.broken || !overlaps(current, box)) continue;
    if (state.powerUps.shield > 0) {
      box.broken = true;
      state.powerUps.shield = 0;
      p.invulnT = POWERUPS.shield.invulnerable;
      events.push({ type: 'shieldBreak', boxId: box.id });
      return;
    }
    const sideHit = !wallBox && p.laneT < LANES.changeTime && !overlaps(old, box);
    if (sideHit) {
      if (state.time - p.lastStumble < STUMBLE.secondWithin) {
        crashPlayer(p, 'stumble', events);
        state.cause = 'stumble';
      } else {
        const side: Side = p.x >= state.prev.x ? 1 : -1;
        p.lastStumble = state.time;
        p.stumbleT = STUMBLE.recover;
        p.invulnT = LANES.changeTime;
        const returnLane = toLane(p.laneFrom);
        p.laneFrom = p.x / LANES.width;
        p.lane = returnLane;
        p.laneT = 0;
        p.laneV = 0;
        events.push({ type: 'stumble', side });
      }
    } else {
      const cause = wallBox ? 'wall' : box.kind === 'metroCar' ? 'train' : 'front';
      crashPlayer(p, cause, events);
      state.cause = cause;
    }
    return;
  }
}
