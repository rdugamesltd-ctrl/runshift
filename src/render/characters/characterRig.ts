import { Group } from 'three';
import type { CharacterAsset, ClipName } from '../types';

/**
 * One animated character instance. WP-00 stub: an empty group.
 * TODO WP-24: SkeletonUtils.clone, one AnimationMixer, crossFadeTo 0.1 s, run timeScale = v / runNaturalSpeed
 * clamped 0.9-1.4, fallback poses for missing clips.
 */
export class CharacterRig {
  readonly root = new Group();
  readonly asset: CharacterAsset;

  constructor(asset: CharacterAsset) {
    this.asset = asset;
  }

  play(_clip: ClipName): void {}
  update(_dt: number): void {}
  dispose(): void {
    this.root.removeFromParent();
  }
}
