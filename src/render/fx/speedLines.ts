import type { ChunkStreamer, RunState } from '../../game/types';
import type { View, ViewContext } from '../types';

/**
 * Speed lines at the edges of the screen at high speed. WP-00 stub: draws nothing.
 * TODO WP-33 (all of src/render/fx together: at most 8 draw calls).
 */
export class SpeedLines implements View {
  constructor(_ctx: ViewContext) {}
  update(_run: RunState, _track: ChunkStreamer, _alpha: number, _dt: number): void {}
  dispose(): void {}
}
