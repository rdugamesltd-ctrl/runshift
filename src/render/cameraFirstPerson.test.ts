import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA, PLAYER, SLIDE } from '../balance';
import { createRunState } from '../game/systems/run';
import { CameraRig } from './camera';

describe('first-person camera', () => {
  it('follows the player at eye height through lane changes, jumps and slides', () => {
    const run = createRunState();
    const camera = new PerspectiveCamera(60, 16 / 9, 0.3, 220);
    const rig = new CameraRig(camera);
    rig.mode = 'firstPerson';
    run.player.x = 2;
    run.player.y = 1;
    run.prev.x = 0;
    run.prev.y = 0;
    rig.update(run, 0.5, 1 / 60);
    expect(camera.position.x).toBeCloseTo(1);
    expect(camera.position.y).toBeCloseTo(0.5 + PLAYER.height * CAMERA.firstPerson.eyeHeightRatio);
    expect(camera.position.z).toBe(0);
    expect(camera.getWorldDirection(camera.position.clone()).z).toBeLessThan(-0.99);

    // A slide lowers the eye at once but eases it down, rather than dropping it in one frame.
    run.player.height = SLIDE.height;
    run.prev.x = 2;
    run.prev.y = 1;
    const standing = 1 + PLAYER.height * CAMERA.firstPerson.eyeHeightRatio;
    const sliding = 1 + SLIDE.height * CAMERA.firstPerson.eyeHeightRatio;
    rig.update(run, 1, 1 / 60);
    expect(camera.position.y).toBeLessThan(standing - 0.1);
    expect(camera.position.y).toBeGreaterThan(sliding + 0.1);
    for (let i = 0; i < 30; i++) rig.update(run, 1, 1 / 60);
    expect(camera.position.y).toBeCloseTo(sliding, 3);
  });

  it('dips on landing in proportion to the fall, then settles back', () => {
    const run = createRunState();
    const camera = new PerspectiveCamera(60, 16 / 9, 0.3, 220);
    const rig = new CameraRig(camera);
    rig.mode = 'firstPerson';
    const eye = PLAYER.height * CAMERA.firstPerson.eyeHeightRatio;
    const dipAfter = (fallSpeed: number): number => {
      run.player.mode = { kind: 'jump', t: 0.3, fastFall: false };
      run.player.y = run.prev.y = 0.5;
      rig.cut();
      rig.update(run, 1, 1 / 60);
      run.player.y = run.prev.y = 0.5 - fallSpeed / 60;
      rig.update(run, 1, 1 / 60);
      run.player.mode = { kind: 'run' };
      run.player.y = run.prev.y = 0;
      let lowest = Infinity;
      for (let i = 0; i < 20; i++) {
        rig.update(run, 1, 1 / 60);
        lowest = Math.min(lowest, camera.position.y);
      }
      for (let i = 0; i < 60; i++) rig.update(run, 1, 1 / 60);
      expect(camera.position.y).toBeCloseTo(eye, 3);
      return eye - lowest;
    };
    const soft = dipAfter(4);
    const hard = dipAfter(9);
    expect(soft).toBeGreaterThan(0.02);
    expect(hard).toBeGreaterThan(soft * 1.5);
    expect(hard).toBeLessThanOrEqual(CAMERA.feel.landDipMax + 0.01);
  });

  it('leans into a sideways move, and not at all with reduced motion', () => {
    const roll = (reducedMotion: boolean): number => {
      const run = createRunState();
      const camera = new PerspectiveCamera(60, 16 / 9, 0.3, 220);
      const rig = new CameraRig(camera, { reducedMotion });
      rig.mode = 'firstPerson';
      rig.update(run, 1, 1 / 60);
      for (let i = 1; i <= 6; i++) {
        run.player.x = run.prev.x = i * 0.25;
        rig.update(run, 1, 1 / 60);
      }
      const up = camera.up.clone().applyQuaternion(camera.quaternion);
      return up.x;
    };
    // Moving right, the view's up tilts right (into the move).
    expect(roll(false)).toBeGreaterThan(0.02);
    expect(Math.abs(roll(true))).toBeLessThan(1e-6);
  });

  it('keeps the camera inside the wall-running space and widens portrait framing', () => {
    const run = createRunState();
    run.player.mode = { kind: 'wallRun', side: 1, band: 'high', t: 0, bandY0: 2.1, bandT: 0.15 };
    run.player.x = 2.8;
    run.player.y = 2.1;
    const portrait = new PerspectiveCamera(60, 390 / 844, 0.3, 220);
    const rig = new CameraRig(portrait);
    rig.mode = 'firstPerson';
    rig.update(run, 1, 1);
    expect(portrait.position.x).toBeCloseTo(run.player.x);
    expect(portrait.position.y).toBeCloseTo(run.player.y + CAMERA.firstPerson.wallEyeHeight);
    expect(portrait.fov).toBeGreaterThan(CAMERA.firstPerson.minFov);
  });
});
