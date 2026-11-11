import type { ChunkStreamer, RunState } from '../../game/types';
import type { View, ViewContext } from '../types';

/**
 * Gold coins. WP-00 stub: draws nothing.
 * TODO WP-04: COINS.maxInstances spinning coins in one InstanceBatch from track.coinsIn; WP-25: the kit's coin model.
 */
export class CoinsView implements View {
  constructor(_ctx: ViewContext) {}
  update(_run: RunState, _track: ChunkStreamer, _alpha: number, _dt: number): void {}
  dispose(): void {}
}
