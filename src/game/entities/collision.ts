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

// TODO WP-01: swept collisions over [dPrev − 0.3, d + 0.3]: front crash, stumble during a lane change, second
// stumble within STUMBLE.secondWithin, jump/slide passes, shield breaks, invulnerability. WP-11: wall boxes and
// wall obstacles per band.
