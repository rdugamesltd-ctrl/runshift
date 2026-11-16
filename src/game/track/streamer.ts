import { CHUNK, COINS, LANES, PLAYER } from '../../balance';
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
import { Director } from './director';
import { placePattern } from './convert';
import { patternById } from './patterns';
import { TUTORIAL_LESSONS, firstLessonChunk, lessonForChunk, placementSpeed } from './tutorialTrack';
import { advanceMovingTrains } from './motion';

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
  private startD = 0;
  private patternId: string | null = null;
  private tutorial = false;
  private readonly director = new Director();
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
    this.startD = options.startD ?? 0;
    this.patternId = options.pattern ?? null;
    this.tutorial = options.tutorial === true;
    this.director.reset();
    this.district = options.district ?? 'street';
    this.fill(options.startD ?? 0);
    this.rebuildQuery();
  }

  /** Recycles chunks that ended CHUNK.recycleBehind behind `d` and builds up to CHUNK.horizon ahead. */
  update(d: number, _v: number, _runTime: number, dt: number): void {
    for (const chunk of this.chunks) advanceMovingTrains(chunk.boxes, d, dt);
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

  platformAt(d: number, x: number): number | null {
    return this.query.platformAt(d, x);
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

  /** One street chunk with a safe first stretch, seeded content, then every decorator with its own rng. */
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
    const startingIndex = Math.floor(this.startD / CHUNK.length);
    const rng = makeRng(chunk.seed);
    // A tutorial run: plain street up to the lessons, one lesson per chunk, then the director.
    const tutorialStretch = this.tutorial && !this.patternId && index < firstLessonChunk(this.startD) + TUTORIAL_LESSONS.length;
    const lesson = tutorialStretch ? lessonForChunk(index, this.startD) : null;
    const pattern = this.patternId ? patternById(this.patternId)
      : tutorialStretch ? lesson?.pattern ?? null
      : index === startingIndex ? null : index === startingIndex + 1 ? patternById('train-three') : this.director.pick(chunk.tier, chunk.district, rng);
    if (pattern) {
      const predictedV = placementSpeed(start, this.startD);
      placePattern(pattern, chunk, predictedV);
    } else {
      // Plain street: a line of coins in one lane, often a second one in another lane.
      const firstLane = Math.floor(rng() * 3) - 1;
      const lineEnd = start + COINS.spacing * COINS.line;
      for (let i = 1; i <= COINS.line; i++) chunk.coins.push({ d: start + i * COINS.spacing, x: firstLane * LANES.width, y: PLAYER.height / 2, taken: false, fromThief: true });
      if (rng() < COINS.switchChance) {
        const secondLane = firstLane === 0 ? (rng() < 0.5 ? -1 : 1) : 0;
        for (let d = lineEnd + COINS.switchGap; d < start + CHUNK.length; d += COINS.spacing) {
          chunk.coins.push({ d, x: secondLane * LANES.width, y: PLAYER.height / 2, taken: false, fromThief: true });
        }
      }
    }
    // No power-ups during the lessons: a jet glide would carry the player over them.
    if (!lesson) this.decorators.forEach((decorate, k) => decorate(chunk, makeRng(mixSeed(chunk.seed, k + 1))));
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
