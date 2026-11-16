import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA } from '../balance';
import { createRunState } from '../game/systems/run';
import { CameraRig } from './camera';

describe('wall camera', () => {
  it('leans toward the wall, shifts away, and eases back on exit', () => {
    const run = createRunState();
    run.player.mode = { kind: 'wallRun', side: 1, band: 'low', t: 0, bandY0: 0.9, bandT: 0.15 };
    const rig = new CameraRig(new PerspectiveCamera(60, 16 / 9, 0.3, 220));
    rig.update(run, 1, 1);
    expect(rig.roll * 180 / Math.PI).toBeCloseTo(CAMERA.wall.rollDeg, 1);
    expect(rig.offsetX).toBeCloseTo(-CAMERA.wall.offset, 2);
    run.player.mode = { kind: 'run' };
    rig.update(run, 1, 1);
    expect(Math.abs(rig.roll)).toBeLessThan(0.01);
  });

  it('halves wall roll with reduced motion', () => {
    const run = createRunState();
    run.player.mode = { kind: 'wallRun', side: -1, band: 'low', t: 0, bandY0: 0.9, bandT: 0.15 };
    const rig = new CameraRig(new PerspectiveCamera(60, 9 / 16, 0.3, 220), { reducedMotion: true });
    rig.update(run, 1, 1);
    expect(rig.roll * 180 / Math.PI).toBeCloseTo(-CAMERA.wall.rollDeg * CAMERA.reducedMotionRoll, 1);
  });
});
