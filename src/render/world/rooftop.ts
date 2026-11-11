import type { ChunkStreamer, RunState } from '../../game/types';
import type { View, ViewContext } from '../types';

/**
 * Rooftops: building tops with gaps, AC units, water towers, billboards as walls. WP-00 stub: draws nothing.
 * TODO WP-31: build it from the active chunks of its district.
 */
export class RooftopView implements View {
  constructor(_ctx: ViewContext) {}
  update(_run: RunState, _track: ChunkStreamer, _alpha: number, _dt: number): void {}
  dispose(): void {}
}
