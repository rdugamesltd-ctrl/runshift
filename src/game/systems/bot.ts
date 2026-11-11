import type { Action, RunState, TrackQuery } from '../types';

/** The bots: ?bot=perfect|sloppy|random|idle. */
export type BotKind = 'perfect' | 'sloppy' | 'random' | 'idle';

/**
 * The press a bot makes this step, or null. WP-00 stub: every bot idles.
 * TODO WP-01: perfect (acts at each path key's d, lane changes LANES.changeTime + 0.05 s early) and idle;
 * WP-42: sloppy and random.
 */
export function botAction(_kind: BotKind, _state: RunState, _track: TrackQuery): Action | null {
  return null;
}
