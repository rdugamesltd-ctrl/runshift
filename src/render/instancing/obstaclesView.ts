import type { ChunkStreamer, RunState } from '../../game/types';
import type { View, ViewContext } from '../types';

/**
 * Obstacles. WP-00 stub: draws nothing.
 * TODO WP-04: grey-box unit boxes from track.boxesIn; WP-25: one InstanceBatch per KitModel.
 */
export class ObstaclesView implements View {
  constructor(_ctx: ViewContext) {}
  update(_run: RunState, _track: ChunkStreamer, _alpha: number, _dt: number): void {}
  dispose(): void {}
}
