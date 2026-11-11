import type { ChunkStreamer, RunState } from '../../game/types';
import type { View, ViewContext } from '../types';

/**
 * The hero, an original teal and orange speedster. WP-00 stub: draws nothing (the grey-box capsule stands in).
 * TODO WP-24: CharacterRig from the hero asset, clip choice from the player mode, wall pose, blob shadow.
 */
export class HeroView implements View {
  constructor(_ctx: ViewContext) {}
  update(_run: RunState, _track: ChunkStreamer, _alpha: number, _dt: number): void {}
  dispose(): void {}
}
