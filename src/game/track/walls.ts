import { WALL } from '../../balance';

/** Where a wall-jump launched at distance `d` and speed `v` lands: d + v·WALL.speedFactor·WALL.jumpTime. */
export function wallJumpLanding(d: number, v: number): number {
  return d + v * WALL.speedFactor * WALL.jumpTime;
}

// TODO WP-12: wall spans from patterns (lengths clamped to [v·minLength, v·maxLength]), wall obstacles
// (wallSignHigh y1.5-3.0, wallVentLow y0.2-1.45, wallPipeFull y0-3.4; x from side·(planeX − 1.5) to side·planeX),
// and resolveWallJump for the streamer (reference: createTestTrack in testTrack.ts).
