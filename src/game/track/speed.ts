import { SPEED } from '../../balance';

/** Run speed after `t` seconds of running, m/s: v(t) = start + gain·(1 − e^(−t/tau)). Before the start it is the start speed. */
export function speedAt(t: number): number {
  const s = Math.max(0, t);
  return SPEED.start - SPEED.gain * Math.expm1(-s / SPEED.tau);
}

/**
 * Metres covered after `t` seconds of running at speedAt: the exact integral
 * start·t + gain·(t − tau·(1 − e^(−t/tau))). Zero before the start.
 */
export function distanceAt(t: number): number {
  const s = Math.max(0, t);
  return SPEED.start * s + SPEED.gain * (s + SPEED.tau * Math.expm1(-s / SPEED.tau));
}

/**
 * Seconds of running needed to cover `d` metres: the inverse of distanceAt, found with Newton's method.
 * distanceAt is increasing and convex and d / start is never below the answer, so starting there every
 * step moves toward the root without overshooting. Accurate to machine precision; zero for d ≤ 0.
 */
export function timeForDistance(d: number): number {
  if (!(d > 0)) return 0;
  let t = d / SPEED.start;
  for (let i = 0; i < 64; i++) {
    const step = (distanceAt(t) - d) / speedAt(t);
    t -= step;
    if (Math.abs(step) <= 1e-12 * Math.max(1, t)) break;
  }
  return t;
}
