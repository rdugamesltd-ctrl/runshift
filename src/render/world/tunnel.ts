import type { ChunkStreamer, RunState } from '../../game/types';
import type { View, ViewContext } from '../types';

/**
 * Subway tunnels: an extruded arch with runnable wall panels and rails. WP-00 stub: draws nothing.
 * TODO WP-31: build it from the active chunks of its district.
 */
export class TunnelView implements View {
  constructor(_ctx: ViewContext) {}
  update(_run: RunState, _track: ChunkStreamer, _alpha: number, _dt: number): void {}
  dispose(): void {}
}
