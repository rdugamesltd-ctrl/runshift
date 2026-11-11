import { CHUNK } from '../../balance';
import type {
  Chunk,
  ChunkDecorator,
  ChunkStreamer,
  Coin,
  CollisionBox,
  District,
  PathKey,
  Pickup,
  Side,
  StreamerOptions,
  TrackQuery,
  WallJumpTarget,
  WallSpan,
} from '../types';
import { makeRng, mixSeed } from './random';
import { createTestTrack } from './testTrack';
import { tierForDistance } from './tiers';

/**
 * The live track. WP-00 stub: a flat street with nothing on it, built CHUNK.length metres at a time so that
 * [d − CHUNK.recycleBehind, d + CHUNK.horizon] is always covered, recycled behind the player, and answered
 * by the brute-force queries of testTrack.ts (rebuilt whenever the chunks change).
 * TODO WP-02: chunk pool, shells and patterns through the director, tutorial track, binary-search queries;
 * WP-12: walls and wall-jumps; WP-31: districts.
 */
export class Streamer implements ChunkStreamer {
  chunks: Chunk[] = [];
  decorators: ChunkDecorator[] = [];
  onRecycle: ((chunk: Chunk) => void) | null = null;
  private seed = 0;
  private district: District = 'street';
  private query: TrackQuery = createTestTrack();

  constructor(options: StreamerOptions = { seed: 0 }) {
    this.reset(options);
  }

  /** Throws the track away and builds a new one from `options`. */
  reset(options: StreamerOptions): void {
    for (const chunk of this.chunks) this.onRecycle?.(chunk);
    this.chunks = [];
    this.seed = options.seed;
    this.district = options.district ?? 'street';
    this.fill(options.startD ?? 0);
    this.rebuildQuery();
  }

  /** Recycles chunks that ended CHUNK.recycleBehind behind `d` and builds up to CHUNK.horizon ahead. */
  update(d: number, _v: number, _runTime: number, _dt: number): void {
    let changed = false;
    while (this.chunks.length > 0 && this.chunks[0].start + this.chunks[0].length < d - CHUNK.recycleBehind) {
      const old = this.chunks.shift();
      if (old) this.onRecycle?.(old);
      changed = true;
    }
    const built = this.fill(d);
    if (built || changed) this.rebuildQuery();
  }

  floorAt(d: number, x?: number): number | null {
    return this.query.floorAt(d, x);
  }

  runnableWall(d: number, side: Side): WallSpan | null {
    return this.query.runnableWall(d, side);
  }

  resolveWallJump(d: number, from: Side, v: number): WallJumpTarget {
    return this.query.resolveWallJump(d, from, v);
  }

  boxesIn(d0: number, d1: number, out: CollisionBox[]): number {
    return this.query.boxesIn(d0, d1, out);
  }

  coinsIn(d0: number, d1: number, out: Coin[]): number {
    return this.query.coinsIn(d0, d1, out);
  }

  pickupsIn(d0: number, d1: number, out: Pickup[]): number {
    return this.query.pickupsIn(d0, d1, out);
  }

  pathAt(d: number, out: PathKey): PathKey {
    return this.query.pathAt(d, out);
  }

  nextGap(d: number): { start: number; end: number; walls: boolean } | null {
    return this.query.nextGap(d);
  }

  tierAt(d: number): number {
    return tierForDistance(d);
  }

  /** Builds chunks until the horizon is covered. Returns true if it built any. */
  private fill(d: number): boolean {
    const first = Math.floor((d - CHUNK.recycleBehind) / CHUNK.length);
    const last = Math.floor((d + CHUNK.horizon) / CHUNK.length);
    let next = this.chunks.length > 0 ? this.chunks[this.chunks.length - 1].index + 1 : first;
    const built = next <= last;
    for (; next <= last; next++) this.chunks.push(this.build(next));
    return built;
  }

  /** One chunk of flat street, then every decorator with its own rng. */
  private build(index: number): Chunk {
    const start = index * CHUNK.length;
    const chunk: Chunk = {
      index,
      start,
      length: CHUNK.length,
      shell: 'street',
      district: this.district,
      tier: tierForDistance(start),
      seed: mixSeed(this.seed, index),
      floors: [{ start, end: start + CHUNK.length, y: 0 }],
      walls: [],
      boxes: [],
      coins: [],
      pickups: [],
      path: [{ d: start, lane: 0 }],
      patterns: [],
    };
    this.decorators.forEach((decorate, k) => decorate(chunk, makeRng(mixSeed(chunk.seed, k + 1))));
    return chunk;
  }

  private rebuildQuery(): void {
    const chunks = this.chunks;
    this.query = createTestTrack({
      floors: chunks.flatMap((c) => c.floors),
      walls: chunks.flatMap((c) => c.walls),
      boxes: chunks.flatMap((c) => c.boxes),
      coins: chunks.flatMap((c) => c.coins),
      pickups: chunks.flatMap((c) => c.pickups),
      path: chunks.flatMap((c) => c.path),
    });
  }
}
