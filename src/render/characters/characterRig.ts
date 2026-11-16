import { AnimationMixer, Group, LoopOnce, LoopRepeat, type AnimationAction } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { CharacterAsset, ClipName } from '../types';

/** How a clip is played: once (holding its last frame) or looped, the cross-fade in, s, and its speed. */
export interface PlayOptions {
  once?: boolean;
  fade?: number;
  rate?: number;
}

/** Run cadence: the clip speeds up with the square root of speed over the asset's natural speed, within these. */
const RUN_RATE = { min: 0.9, max: 1.6 } as const;

/**
 * One animated character instance: a SkeletonUtils clone of the asset with one AnimationMixer. Clips cross-fade
 * (0.1 s unless told otherwise), one-shots hold their last frame, and the run clip's cadence follows the speed
 * (stride length grows too, as a sprinter's does, so the cadence rises with the square root of speed). A missing
 * clip falls back to idle.
 */
export class CharacterRig {
  readonly root = new Group();
  readonly asset: CharacterAsset;
  private readonly mixer: AnimationMixer;
  private current: AnimationAction | null = null;
  private currentName: ClipName | null = null;
  private rate = 1;

  constructor(asset: CharacterAsset) {
    this.asset = asset;
    const model = clone(asset.template);
    model.scale.setScalar(1.8 / asset.height);
    model.rotation.y = Math.PI;
    this.root.add(model);
    this.mixer = new AnimationMixer(model);
  }

  /** The clip now playing, or null. */
  get playing(): ClipName | null {
    return this.currentName;
  }

  /** The length of a clip at speed 1, s (0 when the asset lacks it). */
  duration(clip: ClipName): number {
    return this.asset.clips.get(clip)?.duration ?? 0;
  }

  /** Whether the current one-shot clip has played to its end (always false for a looped clip). */
  get finished(): boolean {
    const action = this.current;
    return action !== null && action.loop === LoopOnce && action.time >= action.getClip().duration - 1e-3;
  }

  /** Cross-fades to `clip` unless it is already playing. */
  play(clip: ClipName, { once = false, fade = 0.1, rate = 1 }: PlayOptions = {}): void {
    if (clip === this.currentName) return;
    const animation = this.asset.clips.get(clip) ?? this.asset.clips.get('idle');
    if (!animation) return;
    const next = this.mixer.clipAction(animation);
    next.reset();
    next.setLoop(once ? LoopOnce : LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.timeScale = rate;
    next.play();
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, fade, false);
    this.current = next;
    this.currentName = clip;
    this.rate = rate;
  }

  /** Advances the animation by `dt` s; `speed` (m/s) sets the run clip's cadence. */
  update(dt: number, speed = 11): void {
    if (this.current) {
      this.current.timeScale = this.currentName === 'run'
        ? Math.min(RUN_RATE.max, Math.max(RUN_RATE.min, Math.sqrt(Math.max(0, speed) / this.asset.runNaturalSpeed)))
        : this.rate;
    }
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
  }
}
