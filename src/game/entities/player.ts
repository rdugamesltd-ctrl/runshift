import { LANES, PLAYER } from '../../balance';
import type { GameEvent, PlayerState, TrackQuery } from '../types';
import type { ActionBuffer } from './actions';
import type { Box } from './collision';

/** What a player step needs from the run: distance, speed and run time. */
export interface StepContext {
  d: number;
  v: number;
  time: number;
}

/** A fresh player, running in the centre lane. */
export function createPlayer(): PlayerState {
  return {
    mode: { kind: 'run' },
    lane: 0,
    laneFrom: 0,
    laneT: 0,
    x: 0,
    y: 0,
    vy: 0,
    height: PLAYER.height,
    wallTime: 0,
    stumbleT: 0,
    lastStumble: -Infinity,
    invulnT: 0,
    gliding: false,
    glideSaves: 0,
  };
}

/** Copies one player state into another (the mode is copied, not shared). */
export function copyPlayer(from: PlayerState, to: PlayerState): void {
  Object.assign(to, from);
  to.mode = { ...from.mode };
}

/**
 * Advances the player one fixed step. WP-00 stub: keeps the player on the floor in its lane and drops
 * every press. TODO WP-01: ground modes (lane change, jump, fast fall, slide, air, coyote, fall, crash);
 * WP-11: wall modes, the W1 attach rule and the glide hook.
 */
export function stepPlayer(p: PlayerState, track: TrackQuery, ctx: StepContext, buf: ActionBuffer, _dt: number, _events: GameEvent[]): void {
  buf.clear();
  p.x = p.lane * LANES.width;
  const floor = track.floorAt(ctx.d, p.x);
  if (floor !== null) p.y = floor;
}

/**
 * The player's collision box at distance d, written into `out`. WP-00 stub: the ground box only.
 * TODO WP-11: the wall box (x from side·(planeX − poseReach) to side·planeX, y from WALL.bandBox) and the
 * wall-jump box.
 */
export function playerBox(p: PlayerState, d: number, out: Box): Box {
  out.d0 = d - PLAYER.depth / 2;
  out.d1 = d + PLAYER.depth / 2;
  out.x0 = p.x - PLAYER.width / 2;
  out.x1 = p.x + PLAYER.width / 2;
  out.y0 = p.y;
  out.y1 = p.y + p.height;
  return out;
}
