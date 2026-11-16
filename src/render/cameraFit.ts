import { CAMERA } from '../balance';

/** How to frame the track for one aspect ratio. */
export interface CameraFit {
  /** Vertical field of view, degrees. */
  fov: number;
  /** Extra distance back, m (0 unless the screen is too tall for maxFov). */
  pullBack: number;
  /** Extra height, m: CAMERA.fit.pullUp of the pull-back. */
  pullUp: number;
}

/** Narrowest aspect ratio considered (a 1000:1 sliver of a window must not divide by zero). */
const MIN_ASPECT = 1e-3;

/**
 * Pure. The vertical FOV that keeps CAMERA.fit.halfWidth metres either side visible at CAMERA.fit.distance:
 * fov = clamp(2·atan(halfWidth / aspect / distance), minFov, maxFov). When it is clamped at the top the
 * camera pulls back halfWidth / (aspect·tan(fov / 2)) − distance, and up by pullUp of that.
 * 16:9 gives 58° and no pull-back; 390×844 gives 78° and about 4.3 m back (1.5 m up).
 * Writes into `out` when given (the camera calls it every frame) and returns it.
 */
export function fitCamera(aspect: number, out: CameraFit = { fov: 0, pullBack: 0, pullUp: 0 }): CameraFit {
  const { halfWidth, distance, minFov, maxFov, pullUp } = CAMERA.fit;
  const a = Number.isFinite(aspect) ? Math.max(aspect, MIN_ASPECT) : 1;
  const needed = (2 * Math.atan(halfWidth / a / distance) * 180) / Math.PI;
  const fov = Math.min(maxFov, Math.max(minFov, needed));
  const pullBack = needed > maxFov ? halfWidth / (a * Math.tan((fov * Math.PI) / 360)) - distance : 0;
  out.fov = fov;
  out.pullBack = pullBack;
  out.pullUp = pullBack * pullUp;
  return out;
}
