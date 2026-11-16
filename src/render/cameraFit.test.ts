import { describe, expect, it } from 'vitest';
import { CAMERA, WALL } from '../balance';
import { fitCamera } from './cameraFit';

/** Half the visible width, m, at `depth` metres in front of a camera with this vertical FOV and aspect. */
function halfWidthAt(fovDeg: number, aspect: number, depth: number): number {
  return Math.tan((fovDeg * Math.PI) / 360) * aspect * depth;
}

describe('fitCamera', () => {
  it('frames 16:9 at the minimum FOV of 58° with no pull-back', () => {
    const fit = fitCamera(16 / 9);
    expect(fit.fov).toBe(58);
    expect(fit.pullBack).toBe(0);
    expect(fit.pullUp).toBe(0);
  });

  it('frames a 390×844 phone at the maximum FOV of 78°, pulled about 4.3 m back and 0.35× that up', () => {
    const fit = fitCamera(390 / 844);
    expect(fit.fov).toBe(78);
    expect(fit.pullBack).toBeCloseTo(4.3, 1);
    expect(fit.pullUp).toBeCloseTo(fit.pullBack * CAMERA.fit.pullUp, 9);
  });

  it('keeps halfWidth visible at the fit distance (plus the pull-back) at every aspect', () => {
    for (const aspect of [390 / 844, 0.5, 0.6, 0.75, 1, 4 / 3, 844 / 390, 16 / 9, 21 / 9]) {
      const fit = fitCamera(aspect);
      expect(fit.fov).toBeGreaterThanOrEqual(CAMERA.fit.minFov);
      expect(fit.fov).toBeLessThanOrEqual(CAMERA.fit.maxFov);
      const visible = halfWidthAt(fit.fov, aspect, CAMERA.fit.distance + fit.pullBack);
      expect(visible).toBeGreaterThanOrEqual(CAMERA.fit.halfWidth - 1e-9);
    }
  });

  it('shows both wall planes at the hero in portrait and landscape', () => {
    for (const aspect of [390 / 844, 844 / 390, 16 / 9]) {
      const fit = fitCamera(aspect);
      // The hero stands CAMERA.back (plus the pull-back) in front of the camera.
      expect(halfWidthAt(fit.fov, aspect, CAMERA.back + fit.pullBack)).toBeGreaterThan(WALL.planeX);
    }
  });

  it('opens the FOV between the bounds without pulling back', () => {
    const fit = fitCamera(1);
    expect(fit.fov).toBeGreaterThan(CAMERA.fit.minFov);
    expect(fit.fov).toBeLessThan(CAMERA.fit.maxFov);
    expect(fit.pullBack).toBe(0);
    expect(halfWidthAt(fit.fov, 1, CAMERA.fit.distance)).toBeCloseTo(CAMERA.fit.halfWidth, 9);
  });

  it('survives degenerate aspects and writes into out', () => {
    const out = { fov: 0, pullBack: 0, pullUp: 0 };
    expect(fitCamera(0, out)).toBe(out);
    expect(Number.isFinite(out.pullBack)).toBe(true);
    expect(out.fov).toBe(CAMERA.fit.maxFov);
    expect(fitCamera(Number.NaN).fov).toBeGreaterThanOrEqual(CAMERA.fit.minFov);
  });
});
