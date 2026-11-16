import { LANES, WALL } from '../../balance';
import type { Action, PathKey, PlayerState, TrackQuery } from '../types';

/** What a route follower remembers between steps: the last path key it acted on and the time it last looked. */
export interface RouteMemo {
  /** Distance of the last key acted on, m (−Infinity before the first). */
  d: number;
  /** Run time of the last look, s: a smaller time means a new run, which forgets the last key. */
  time: number;
}

/** A memo that has acted on nothing yet. */
export function createRouteMemo(): RouteMemo {
  return { d: -Infinity, time: -Infinity };
}

const current: PathKey = { d: 0, lane: 0 };
const ahead: PathKey = { d: 0, lane: 0 };

/**
 * The press that follows the authored safe route from distance `d` at speed `v`, or null. Pure apart from `memo`:
 * each path act fires once per key, even when the next step sees the same key. Wall acts are taken where the key
 * is; lane changes, jumps and slides are taken LANES.changeTime + 0.05 s early so they are complete in time.
 * The perfect bot and the thief (who runs the route ahead of the player) both use it.
 */
export function routeAction(memo: RouteMemo, player: PlayerState, d: number, v: number, time: number, track: TrackQuery): Action | null {
  if (time < memo.time) memo.d = -Infinity;
  memo.time = time;
  const mode = player.mode.kind;
  track.pathAt(d, current);
  if (current.d > memo.d && current.act === 'wall' && current.side &&
    (mode === 'run' || mode === 'jump' || mode === 'slide' || mode === 'air') &&
    track.runnableWall(d + v * WALL.attachTime, current.side)) {
    memo.d = current.d;
    return current.side === 1 ? 'right' : 'left';
  }
  if (current.d > memo.d && current.act === 'wallJump' && player.mode.kind === 'wallRun') {
    memo.d = current.d;
    return player.mode.side === 1 ? 'left' : 'right';
  }
  if (current.d > memo.d && current.act === 'band' && current.band && mode === 'wallRun') {
    memo.d = current.d;
    return current.band === 'high' ? 'up' : 'down';
  }
  track.pathAt(d + v * (LANES.changeTime + 0.05), ahead);
  if (mode === 'wallAttach' || mode === 'wallRun' || mode === 'wallJump' || mode === 'wallExit' ||
    ahead.act === 'wall' || ahead.act === 'wallJump' || ahead.act === 'band') return null;
  if (player.lane > ahead.lane) return 'left';
  if (player.lane < ahead.lane) return 'right';
  if (ahead.d <= memo.d || !ahead.act) return null;
  memo.d = ahead.d;
  if (ahead.act === 'jump') return 'up';
  if (ahead.act === 'slide') return 'down';
  return null;
}
