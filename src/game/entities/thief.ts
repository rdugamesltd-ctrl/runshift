import { LANES, THIEF } from '../../balance';
import type { GameEvent, PathKey, PlayerState, ThiefState, TrackQuery } from '../types';
import { ActionBuffer } from './actions';
import { createPlayer, stepPlayer } from './player';
import { createRouteMemo, routeAction, type RouteMemo } from './route';

/** The thief's lead over the player at speed v, m: clamp(leadS·v, minLead, maxLead). */
export function thiefLead(v: number, tutorial = false): number {
  return Math.min(THIEF.maxLead, Math.max(THIEF.minLead, (tutorial ? THIEF.tutorialLeadS : THIEF.leadS) * v));
}

/** A fresh thief, running in the centre lane. */
export function createThief(): ThiefState {
  return { d: 0, x: 0, y: 0, pose: 'run', side: 0, band: 'low', phase: 0 };
}

/**
 * The runner inside the thief: a player state stepped by the same movement rules as the hero, pressed along the
 * authored route by the same controller as the perfect bot, but never collided. So the thief changes lanes with the
 * hero's ease, jumps the hero's arc, slides, climbs train ramps, runs off roofs and runs the walls, and every pose a
 * view shows comes from real motion.
 */
interface Ghost {
  player: PlayerState;
  buffer: ActionBuffer;
  memo: RouteMemo;
  events: GameEvent[];
  /** The thief's own speed over the last step, m/s. */
  speed: number;
  time: number;
}

/** One ghost per thief object (a run's reset makes a new thief, and so a new ghost). */
const ghosts = new WeakMap<ThiefState, Ghost>();
const key: PathKey = { d: 0, lane: 0 };

function createGhost(thief: ThiefState, v: number): Ghost {
  const player = createPlayer();
  const lane = Math.max(-1, Math.min(1, Math.round(thief.x / LANES.width))) as -1 | 0 | 1;
  player.lane = lane;
  player.laneFrom = lane;
  player.x = lane * LANES.width;
  player.y = thief.y;
  return { player, buffer: new ActionBuffer(), memo: createRouteMemo(), events: [], speed: v, time: 0 };
}

/** Puts the ghost back on its feet in the route's lane (after a fall the route could not save). */
function recover(ghost: Ghost, track: TrackQuery, d: number): void {
  track.pathAt(d, key);
  const player = createPlayer();
  player.lane = key.lane;
  player.laneFrom = key.lane;
  player.x = key.lane * LANES.width;
  player.y = track.platformAt(d, player.x) ?? track.floorAt(d, player.x) ?? 0;
  ghost.player = player;
  ghost.buffer.clear();
}

/** The thief's pose, side and band from the ghost's movement mode. */
function poseFrom(thief: ThiefState, player: PlayerState): void {
  const mode = player.mode;
  thief.side = 0;
  switch (mode.kind) {
    case 'jump':
    case 'air':
      thief.pose = 'jump';
      break;
    case 'slide':
      thief.pose = 'slide';
      break;
    case 'wallAttach':
    case 'wallRun':
      thief.pose = 'wallRun';
      thief.side = mode.side;
      thief.band = mode.band;
      break;
    case 'wallJump':
      thief.pose = 'wallJump';
      thief.side = mode.from;
      break;
    default:
      thief.pose = 'run';
  }
}

/**
 * Moves the thief one step ahead of the player at distance `d` and speed `v`. His own speed eases (THIEF.speedRate)
 * towards the speed that closes on thiefLead(v), the lead staying within its limits, so a stumble or a speed
 * change never snaps him back; once the player stops
 * (a crash) he keeps his pace and gets away. He runs the route as a ghost runner (see Ghost).
 * TODO WP-34: trail drops, bursts, taunts.
 */
export function stepThief(thief: ThiefState, track: TrackQuery, d: number, v: number, dt: number, tutorial = false): void {
  const target = thiefLead(v, tutorial);
  let ghost = ghosts.get(thief);
  const fresh = !ghost;
  if (!ghost) {
    ghost = createGhost(thief, v);
    ghosts.set(thief, ghost);
  }
  // A fresh thief may stand anywhere (a new run places him by hand): he starts at his lead and the player's speed.
  const before = fresh ? d + target - v * dt : thief.d;
  if (v > 0) {
    // The lead as it stood after the last step (d has already moved on by v·dt).
    const desired = v + THIEF.leadGain * (target - (before - d + v * dt));
    ghost.speed = Math.max(0, ghost.speed + (desired - ghost.speed) * (1 - Math.exp(-THIEF.speedRate * dt)));
    thief.d = Math.min(d + THIEF.maxLead, Math.max(d + THIEF.minLead, before + ghost.speed * dt));
    if (dt > 0) ghost.speed = Math.max(0, (thief.d - before) / dt);
  } else thief.d = before + ghost.speed * dt;
  if (dt > 0) ghost.time += dt;
  const player = ghost.player;
  const action = routeAction(ghost.memo, player, thief.d, ghost.speed, ghost.time, track);
  if (action) ghost.buffer.push(action, ghost.time);
  stepPlayer(player, track, { d: thief.d, v: ghost.speed, time: ghost.time }, ghost.buffer, dt, ghost.events);
  ghost.events.length = 0;
  if (ghost.player.mode.kind === 'fall' || ghost.player.mode.kind === 'crash') recover(ghost, track, thief.d);
  thief.x = ghost.player.x;
  thief.y = ghost.player.y;
  poseFrom(thief, ghost.player);
}
