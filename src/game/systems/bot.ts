import { createRouteMemo, routeAction, type RouteMemo } from '../entities/route';
import type { Action, RunState, TrackQuery } from '../types';

/** The bots: ?bot=perfect|sloppy|random|idle. */
export type BotKind = 'perfect' | 'sloppy' | 'random' | 'idle';

/** Each run's route memory, so a path act fires once per key. */
const memos = new WeakMap<RunState, RouteMemo>();

/**
 * A single bot press for this step, or null. The perfect bot follows the authored path ahead of the runner
 * (routeAction, the same controller the thief runs); a path act fires once per key, even if the next frame sees the
 * same key. WP-42 adds deliberately imperfect sloppy and random bots.
 */
export function botAction(kind: BotKind, state: RunState, track: TrackQuery): Action | null {
  if (kind !== 'perfect' || state.phase !== 'running') return null;
  let memo = memos.get(state);
  if (!memo) {
    memo = createRouteMemo();
    memos.set(state, memo);
  }
  return routeAction(memo, state.player, state.d, state.v, state.time, track);
}
