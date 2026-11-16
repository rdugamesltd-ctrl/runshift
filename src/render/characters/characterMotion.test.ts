import { AnimationClip, Group } from 'three';
import { describe, expect, it } from 'vitest';
import { WALL } from '../../balance';
import { createAnimationLibrary } from '../assets/animationLibrary';
import type { CharacterAsset, ClipName } from '../types';
import { CharacterMotion, type MotionInput } from './characterMotion';
import { CharacterRig } from './characterRig';

const DT = 1 / 60;

/** A rig over an empty model whose clips are empty but named and timed like the placeholders'. */
function makeRig(): CharacterRig {
  const lengths: Partial<Record<ClipName, number>> = { idle: 2, run: 0.7, jump: 0.46, fall: 0.63, land: 0.46, slide: 2, knockback: 0.9 };
  const clips: Partial<Record<ClipName, AnimationClip>> = {};
  for (const [name, length] of Object.entries(lengths) as [ClipName, number][]) clips[name] = new AnimationClip(name, length, []);
  const asset: CharacterAsset = {
    template: new Group(),
    clips: createAnimationLibrary(clips),
    bones: { hips: 'Hips', spine: null, chest: null, head: null, handL: null, handR: null, footL: null, footR: null },
    height: 1.8,
    runNaturalSpeed: 11,
  };
  return new CharacterRig(asset);
}

function input(partial: Partial<MotionInput>): MotionInput {
  return { state: 'run', x: 0, y: 0, speed: 11, roll: 0, ...partial };
}

describe('character motion', () => {
  it('plays the jump once over the rise, loops mid-air, lands, then runs', () => {
    const rig = makeRig();
    const motion = new CharacterMotion(rig);
    motion.update(input({}), DT);
    expect(rig.playing).toBe('run');
    const seen: (ClipName | null)[] = [];
    for (let i = 0; i < 36; i++) {
      const u = i / 36;
      motion.update(input({ state: 'jump', y: 1.35 * 4 * u * (1 - u) }), DT);
      if (seen[seen.length - 1] !== rig.playing) seen.push(rig.playing);
    }
    expect(seen).toEqual(['jump', 'fall']);
    motion.update(input({}), DT);
    expect(rig.playing).toBe('land');
    for (let i = 0; i < 20; i++) motion.update(input({}), DT);
    expect(rig.playing).toBe('run');
  });

  it('squashes on landing in proportion to the fall, then springs back', () => {
    const squashAfter = (fallSpeed: number): number => {
      const rig = makeRig();
      const motion = new CharacterMotion(rig);
      motion.update(input({ state: 'air', y: 1 }), DT);
      motion.update(input({ state: 'air', y: 1 - fallSpeed * DT }), DT);
      motion.update(input({ y: 0 }), DT);
      let lowest = Infinity;
      for (let i = 0; i < 12; i++) {
        motion.update(input({}), DT);
        lowest = Math.min(lowest, rig.root.scale.y);
      }
      for (let i = 0; i < 90; i++) motion.update(input({}), DT);
      expect(rig.root.scale.y).toBeCloseTo(1, 3);
      return 1 - lowest;
    };
    const soft = squashAfter(3);
    const hard = squashAfter(9);
    expect(soft).toBeGreaterThan(0.01);
    expect(hard).toBeGreaterThan(soft * 1.5);
  });

  it('eases onto a wall instead of snapping the roll', () => {
    const rig = makeRig();
    const motion = new CharacterMotion(rig);
    const full = WALL.rootRollDeg * Math.PI / 180;
    motion.update(input({}), DT);
    motion.update(input({ state: 'wall', roll: 1, x: 2.8 }), DT);
    expect(rig.root.rotation.z).toBeGreaterThan(0);
    expect(rig.root.rotation.z).toBeLessThan(full * 0.5);
    for (let i = 0; i < 60; i++) motion.update(input({ state: 'wall', roll: 1, x: 2.8 }), DT);
    expect(rig.root.rotation.z).toBeCloseTo(full, 3);
  });

  it('leans and turns into a lane change, and leans back into a slide', () => {
    const rig = makeRig();
    const motion = new CharacterMotion(rig);
    motion.update(input({}), DT);
    for (let i = 1; i <= 5; i++) motion.update(input({ x: i * 0.3 }), DT);
    // Moving right (+x): the top tips right (negative roll) and the body turns right (negative yaw).
    expect(rig.root.rotation.z).toBeLessThan(-0.05);
    expect(rig.root.rotation.y).toBeLessThan(-0.05);
    for (let i = 0; i < 30; i++) motion.update(input({ state: 'slide', x: 1.5 }), DT);
    expect(rig.playing).toBe('slide');
    expect(rig.root.rotation.x).toBeLessThan(-0.8);
  });
});
