import { LANES, THIEF } from '../../balance';
import type { PathKey, ThiefState, TrackQuery } from '../types';

/** The thief's lead over the player at speed v, m: clamp(leadS·v, minLead, maxLead). */
export function thiefLead(v: number): number {
  return Math.min(THIEF.maxLead, Math.max(THIEF.minLead, THIEF.leadS * v));
}

/** A fresh thief, running in the centre lane. */
export function createThief(): ThiefState {
  return { d: 0, x: 0, y: 0, pose: 'run', side: 0, band: 'low', phase: 0 };
}

const key: PathKey = { d: 0, lane: 0 };

/**
 * Places the thief ahead of the player at distance `d` and speed `v`. WP-00 stub: runs the path's lane on
 * the floor. TODO WP-01: pose from pathAt (jump, slide); WP-14: wall acts as functions of the player's
 * kinematics, the tutorial lead (THIEF.tutorialLeadS) and thiefDemo events; WP-34: trail drops, bursts, taunts.
 */
export function stepThief(thief: ThiefState, track: TrackQuery, d: number, v: number, _dt: number): void {
  thief.d = d + thiefLead(v);
  track.pathAt(thief.d, key);
  thief.x = key.lane * LANES.width;
  thief.y = track.floorAt(thief.d, thief.x) ?? 0;
  thief.pose = 'run';
}
