/**
 * The simulation contract (WP-00). Frozen: later changes are additive only and go through the integrator.
 * Pure types, no runtime code, no three, no DOM, so it can be imported from anywhere.
 *
 * Track space: `d` is metres along the run (float64, never rebased), x is metres to the right, y is metres
 * up. Lanes sit at x = lane * LANES.width, walls at x = side * WALL.planeX, the street floor at y = 0.
 * Anything at track distance s renders at z = -(s - dRender). Times are seconds, speeds m/s.
 */

/** A running lane: -1 left, 0 centre, 1 right. */
export type Lane = -1 | 0 | 1; // x = lane * LANES.width
/** A side of the track: -1 left, 1 right. */
export type Side = -1 | 1; // wall plane at x = side * WALL.planeX
/** Height band on a wall: low runs at WALL.bandLow, high at WALL.bandHigh. */
export type Band = 'low' | 'high';
/** The four swipe and key directions. */
export type Action = 'left' | 'right' | 'up' | 'down';
/** The four power-ups. */
export type PowerUpKind = 'magnet' | 'shield' | 'multiplier' | 'glide';
/** Tutorial tips. Each shows once and is remembered in the save. */
export type TipId = 'lanes' | 'jump' | 'slide' | 'wall' | 'band' | 'wallJump';
/** The three city districts. */
export type District = 'street' | 'rooftop' | 'subway';
/** The base geometry of one chunk: a full floor, a pit (no floor), a pit with side walls, a tunnel, or a transition. */
export type ShellKind = 'street' | 'rooftop' | 'pit' | 'pitWalls' | 'tunnel' | 'tunnelIn' | 'tunnelOut' | 'roofUp' | 'roofDown';
/** Obstacles mounted on a wall. They block the high band, the low band, or both. */
export type WallObstacleKind = 'wallSignHigh' | 'wallVentLow' | 'wallPipeFull';
/** Every obstacle kind. Sizes live in src/game/track/obstacles.json. */
export type ObstacleKind = 'barrierLow' | 'barrierHigh' | 'blocker' | 'car' | 'metroCar' | 'roofUnit' | WallObstacleKind;
/** How an obstacle is passed (see the collision rules in docs/CONVENTIONS.md). */
export type HitRule = 'jump' | 'slide' | 'dodge' | 'bandLow' | 'bandHigh' | 'wallJump';

/** An obstacle's box in track space: d0..d1 along the run, x0..x1 across, y0..y1 up, all metres. */
export interface CollisionBox {
  id: number;
  kind: ObstacleKind;
  rule: HitRule;
  d0: number;
  d1: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Speed along the track, m/s: non-zero for moving boxes such as oncoming metro cars. */
  vd: number;
  /** Length of a climbable ramp at the near end of a train. */
  rampLength?: number;
  /** Set when a shield broke it. Broken boxes never collide. */
  broken: boolean;
}

/** Floor from `start` to `end` (track metres) at height `y`. Where no span covers d there is no floor. */
export interface FloorSpan {
  start: number;
  end: number;
  y: number;
}

/** A runnable wall on one side from `start` to `end`. `blocks` are the ids of the wall obstacles on it. */
export interface WallSpan {
  side: Side;
  start: number;
  end: number;
  surface: 'hoarding' | 'facade' | 'billboard' | 'tunnel';
  blocks: number[];
}

/** Where a wall-jump lands: the opposite wall, the floor (centre lane), or nothing (a fall). `d` is the landing distance. */
export type WallJumpTarget = { kind: 'wall'; side: Side; d: number } | { kind: 'floor'; lane: Lane; d: number } | { kind: 'none'; d: number };

/**
 * A gold coin. `fromThief` coins are dropped by the thief: hidden and out of reach until he has passed their d, then
 * thrown down to their spot (every coin the track lays is one).
 */
export interface Coin {
  d: number;
  x: number;
  y: number;
  taken: boolean;
  fromThief: boolean;
}

/** A power-up waiting on the track. */
export interface Pickup {
  d: number;
  x: number;
  y: number;
  kind: PowerUpKind;
  taken: boolean;
}

/** What a path key asks for at its distance: the act the authored route makes there. */
export type PathAct = 'jump' | 'slide' | 'wall' | 'band' | 'wallJump' | 'exit';

/** One key of the authored safe route. The thief runs it and the perfect bot replays it. */
export interface PathKey {
  d: number;
  lane: Lane;
  act?: PathAct;
  side?: Side;
  band?: Band;
}

/** One stretch of track, CHUNK.length metres from `start`: its shell, content and authored route. */
export interface Chunk {
  index: number;
  start: number;
  length: number;
  shell: ShellKind;
  district: District;
  tier: number;
  seed: number;
  floors: FloorSpan[];
  walls: WallSpan[];
  boxes: CollisionBox[];
  coins: Coin[];
  pickups: Pickup[];
  path: PathKey[];
  /** Ids of the patterns placed in this chunk. */
  patterns: string[];
}

/**
 * Questions the simulation asks about the track. The `*In(d0, d1, out)` queries write every item that
 * overlaps [d0, d1] into out[0..n), in ascending d, set out.length = n and return n. They hand out the
 * track's own objects, taken coins and broken boxes included. src/game/track/testTrack.ts is the reference
 * implementation of every method.
 */
export interface TrackQuery {
  /** Floor height at d, or null over a gap. */
  floorAt(d: number, x?: number): number | null;
  /** Top of a wagon beneath x at d, or null when there is no wagon. */
  platformAt(d: number, x: number): number | null;
  /** The wall span on `side` covering d, or null. */
  runnableWall(d: number, side: Side): WallSpan | null;
  /** Where a wall-jump off the `from` wall at d and speed v lands (rule in docs/CONVENTIONS.md). */
  resolveWallJump(d: number, from: Side, v: number): WallJumpTarget;
  boxesIn(d0: number, d1: number, out: CollisionBox[]): number;
  coinsIn(d0: number, d1: number, out: Coin[]): number;
  pickupsIn(d0: number, d1: number, out: Pickup[]): number;
  /** Copies the path key in force at d (the last key at or before d; lane 0 if none) into out and returns out. */
  pathAt(d: number, out: PathKey): PathKey;
  /** The gap (stretch with no floor) d is over, or else the next one ahead, or null. */
  nextGap(d: number): { start: number; end: number; walls: boolean } | null;
  /** Difficulty tier at d: an index into TIERS. */
  tierAt(d: number): number;
}

/** Adds content to a freshly built chunk (power-ups, the thief's trail). Gets its own seeded rng. */
export type ChunkDecorator = (chunk: Chunk, rng: () => number) => void;

/** How a run's track starts: its seed, and the test hooks (?d, ?tutorial, ?pattern, ?district). */
export interface StreamerOptions {
  seed: number;
  startD?: number;
  tutorial?: boolean;
  pattern?: string;
  district?: District;
}

/** The live track: chunks built ahead of the player up to CHUNK.horizon and recycled behind. */
export interface ChunkStreamer extends TrackQuery {
  readonly chunks: readonly Chunk[];
  decorators: ChunkDecorator[];
  onRecycle: ((chunk: Chunk) => void) | null;
  reset(options: StreamerOptions): void;
  update(d: number, v: number, runTime: number, dt: number): void;
}

/** Why a run ended. */
export type CrashCause = 'front' | 'stumble' | 'wall' | 'train' | 'fall';

/** The player's movement state machine (rules in docs/CONVENTIONS.md). `t` is seconds in the mode. */
export type PlayerMode =
  | { kind: 'run' }
  | { kind: 'jump'; t: number; fastFall: boolean }
  | { kind: 'slide'; t: number }
  | { kind: 'air'; t: number }
  | { kind: 'fall'; t: number }
  | { kind: 'wallAttach'; side: Side; band: Band; t: number; x0: number; y0: number }
  | { kind: 'wallRun'; side: Side; band: Band; t: number; bandY0: number; bandT: number }
  | { kind: 'wallJump'; from: Side; target: WallJumpTarget; t: number; x0: number; y0: number }
  | { kind: 'wallExit'; side: Side; t: number; x0: number; y0: number }
  | { kind: 'crash'; t: number; cause: CrashCause };

/** The player. x and y are metres in track space (y = feet); height is the current box height. */
export interface PlayerState {
  mode: PlayerMode;
  lane: Lane;
  laneFrom: number;
  laneT: number;
  /** Sideways speed when the lane change under way began, lanes/s (a press during a change keeps its momentum).
   *  Absent means 0. */
  laneV?: number;
  x: number;
  y: number;
  vy: number;
  height: number;
  wallTime: number;
  stumbleT: number;
  lastStumble: number;
  invulnT: number;
  gliding: boolean;
  glideSaves: number;
}

/** The thief: always ahead, never caught. Kinematic, posed from the authored path. */
export interface ThiefState {
  d: number;
  x: number;
  y: number;
  pose: 'run' | 'jump' | 'slide' | 'wallRun' | 'wallJump' | 'taunt';
  side: Side | 0;
  band: Band;
  phase: number;
}

/** A run's phase: the intro before running, running, and over (a crash or fall plays out, then results). */
export type RunPhase = 'intro' | 'running' | 'over';

/** Everything about one run. Views read it and never write it. `prev` is the last step, for interpolation. */
export interface RunState {
  phase: RunPhase;
  time: number;
  endTime: number;
  d: number;
  v: number;
  prev: { d: number; x: number; y: number; thiefD: number; thiefX: number; thiefY: number };
  player: PlayerState;
  thief: ThiefState;
  gold: number;
  score: number;
  multiplier: number;
  streak: number;
  powerUps: Record<PowerUpKind, number>;
  tier: number;
  district: District;
  cause: CrashCause | null;
  frozen: boolean;
  /** The jet glide's sky coins, owned by the run (not the track); empty when not gliding. Additive (power-ups). */
  airCoins: Coin[];
}

/** Something that happened in a step. Drained once per frame and routed by src/app/celebrate.ts. */
export type GameEvent =
  | { type: 'runStart' }
  | { type: 'lane'; from: Lane; to: Lane }
  | { type: 'bump'; side: Side }
  | { type: 'jump' }
  | { type: 'land'; hard: boolean }
  | { type: 'slide' }
  | { type: 'fastFall' }
  | { type: 'stumble'; side: Side }
  | { type: 'wallAttach'; side: Side; band: Band }
  | { type: 'wallBand'; band: Band }
  | { type: 'wallSlip' }
  | { type: 'wallJump'; from: Side; to: WallJumpTarget['kind'] }
  | { type: 'wallExit'; side: Side }
  | { type: 'coin'; d: number; x: number; y: number; streak: number; magnet: boolean }
  | { type: 'pickup'; kind: PowerUpKind }
  | { type: 'powerUpEnd'; kind: PowerUpKind }
  | { type: 'shieldBreak'; boxId: number }
  | { type: 'glideSave' }
  | { type: 'thiefDemo'; act: PathAct }
  | { type: 'thiefDrop' }
  | { type: 'thiefTaunt' }
  | { type: 'tier'; tier: number }
  | { type: 'district'; district: District }
  | { type: 'milestone'; metres: number }
  | { type: 'newBest' }
  | { type: 'tip'; id: TipId; on: boolean }
  | { type: 'crash'; cause: CrashCause }
  | { type: 'fall' }
  | { type: 'gameOver'; cause: CrashCause };

/** The localStorage save. */
export interface SaveData {
  version: number;
  gold: number;
  highScore: number;
  bestDistance: number;
  upgrades: Record<PowerUpKind, number>;
  settings: { muted: boolean; reducedMotion: 'auto' | 'on' | 'off'; quality: 'auto' | 'high' | 'low' };
  tips: TipId[];
  totals: { runs: number; metres: number; goldEarned: number; wallRuns: number };
  perf: { level: number; low: boolean };
} // SAVE_VERSION 1, key 'runshift-save'

/** What the results screen shows after a run. */
export interface RunResult {
  score: number;
  distance: number;
  gold: number;
  best: number;
  newBest: boolean;
  cause: CrashCause;
}
