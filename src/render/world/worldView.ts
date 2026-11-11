import type { ChunkStreamer, RunState } from '../../game/types';
import type { View, ViewContext } from '../types';

/**
 * The textured world: shells, buildings and props from the kit. WP-00 stub: draws nothing (grey box instead).
 * TODO WP-25: InstanceBatches per KitModel fed by the active chunks; ?greybox keeps the grey-box view.
 */
export class WorldView implements View {
  constructor(_ctx: ViewContext) {}
  update(_run: RunState, _track: ChunkStreamer, _alpha: number, _dt: number): void {}
  dispose(): void {}
}
