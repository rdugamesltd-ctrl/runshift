import type { ChunkStreamer, RunState } from '../../game/types';
import type { View, ViewContext } from '../types';

/**
 * The masked thief with his gold sack. WP-00 stub: draws nothing (the grey-box capsule stands in).
 * TODO WP-24: CharacterRig from the thief asset, poses from ThiefState; WP-34: taunts and sack bobbing.
 */
export class ThiefView implements View {
  constructor(_ctx: ViewContext) {}
  update(_run: RunState, _track: ChunkStreamer, _alpha: number, _dt: number): void {}
  dispose(): void {}
}
