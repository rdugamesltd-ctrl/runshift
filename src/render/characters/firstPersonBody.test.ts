import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { createRunState } from '../../game/systems/run';
import { CameraRig } from '../camera';
import { bodyPose, emptyPose, FirstPersonBody } from './firstPersonBody';

describe('first-person body pose', () => {
  it('pumps the arms against the legs while running', () => {
    const run = createRunState();
    const pose = bodyPose(run, Math.PI / 2, emptyPose());
    const [left, right] = pose.limbs;
    // The right fist is up and forward at π/2 and the left down and back; the left knee drives with the right arm.
    expect(right.handY).toBeGreaterThan(left.handY + 0.1);
    expect(right.handZ).toBeLessThan(left.handZ);
    expect(right.handX).toBeGreaterThan(0);
    expect(left.handX).toBeLessThan(0);
    expect(left.hip).toBeGreaterThan(right.hip);
    const later = bodyPose(run, (3 * Math.PI) / 2, emptyPose());
    expect(later.limbs[0].handY).toBeCloseTo(right.handY);
  });

  it('reaches for the wall with the wall-side hand only', () => {
    const run = createRunState();
    run.player.mode = { kind: 'wallRun', side: -1, band: 'low', t: 0, bandY0: 0, bandT: 0 };
    const [left, right] = bodyPose(run, 0, emptyPose()).limbs;
    expect(-left.handX).toBeGreaterThan(right.handX + 0.1);
  });

  it('stretches the lead leg ahead on a slide and tucks both knees in a jump', () => {
    const run = createRunState();
    run.player.mode = { kind: 'slide', t: 0.2 };
    const slide = bodyPose(run, 0, emptyPose());
    expect(slide.limbs[1].knee).toBeLessThan(0.3);
    expect(slide.limbs[0].knee).toBeGreaterThan(1.5);
    run.player.mode = { kind: 'jump', t: 0.3, fastFall: false };
    const jump = bodyPose(run, 0, emptyPose());
    for (const limb of jump.limbs) expect(limb.knee).toBeGreaterThan(1.5);
  });

  it('builds and updates without a renderer', () => {
    const body = new FirstPersonBody();
    body.amount = 1;
    expect(() => body.update(createRunState(), null, 1, 1 / 60)).not.toThrow();
    body.dispose();
  });
});

describe('first-person amount', () => {
  it('is 1 at the eyes, 0 on the menu and in the chase view', () => {
    const rig = new CameraRig(new PerspectiveCamera(60, 16 / 9, 0.3, 220));
    const run = createRunState();
    rig.mode = 'firstPerson';
    rig.update(run, 1, 1 / 60);
    expect(rig.firstPersonAmount).toBe(1);
    rig.mode = 'menu';
    expect(rig.firstPersonAmount).toBe(0);
    rig.mode = 'chase';
    expect(rig.firstPersonAmount).toBe(0);
  });
});
