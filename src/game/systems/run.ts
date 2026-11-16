import { AIR, COINS, PLAYER, POWERUPS, RESULTS, SCORE } from '../../balance';
import type { ActionEvent } from '../../input/types';
import { ActionBuffer } from '../entities/actions';
import { collide } from '../entities/collision';
import { createPlayer, endGlide, speedFactor, startGlide, stepGlide, stepPlayer } from '../entities/player';
import { createThief, stepThief, thiefLead } from '../entities/thief';
import { speedAt } from '../track/speed';
import type { ChunkDecorator, ChunkStreamer, Coin, CollisionBox, GameEvent, Pickup, PowerUpKind, RunState, StreamerOptions } from '../types';
import { glideCoinX, layGlideCoins, liftCoin, powerUpDuration, pullCoin, tickPowerUps } from './powerups';
import { scoreFor } from './scoring';

/** How a Run is built. */
export interface RunOptions {
  /** Chunk decorators to install on the track (power-ups, the thief's trail). */
  decorators?: ChunkDecorator[];
}

/** A fresh run state at distance `startD`, in the intro. */
export function createRunState(startD = 0): RunState {
  const v = speedAt(0);
  const player = createPlayer();
  const thief = createThief();
  thief.d = startD + thiefLead(v);
  return {
    phase: 'intro',
    time: 0,
    endTime: 0,
    d: startD,
    v,
    prev: { d: startD, x: player.x, y: player.y, thiefD: thief.d, thiefX: thief.x, thiefY: thief.y },
    player,
    thief,
    gold: 0,
    score: 0,
    multiplier: 1,
    streak: 0,
    powerUps: { magnet: 0, shield: 0, multiplier: 0, glide: 0 },
    tier: 0,
    district: 'street',
    cause: null,
    frozen: false,
    airCoins: [],
  };
}

/**
 * One run of the game, stepped at SIM.fixedDt: movement, collisions, coins, thief, score and the end delay.
 * Power-ups: pickups on the track start timers (upgrade levels from setUpgrades), the magnet pulls coins in, the
 * multiplier scales the score earned while it runs, and the jet glide lifts the player over everything.
 */
export class Run {
  readonly state: RunState = createRunState();
  readonly track: ChunkStreamer;
  private readonly buffer = new ActionBuffer();
  private events: GameEvent[] = [];
  private introT = 0;
  private startD = 0;
  private tutorial = false;
  private readonly nearbyBoxes: CollisionBox[] = [];
  private readonly nearbyCoins: Coin[] = [];
  private readonly nearbyPickups: Pickup[] = [];
  /** Track coins already risen (or rising) to the glide's flight line; cleared when the glide ends. */
  private readonly lifted = new Set<Coin>();
  private upgrades: Record<PowerUpKind, number> = { magnet: 0, shield: 0, multiplier: 0, glide: 0 };
  /** Score earned on top of scoreFor() by the multiplier, unrounded. */
  private bonus = 0;

  constructor(track: ChunkStreamer, { decorators = [] }: RunOptions = {}) {
    this.track = track;
    track.decorators.push(...decorators);
  }

  /** Upgrade levels for the power-up durations of the next pickups. */
  setUpgrades(levels: Record<PowerUpKind, number>): void {
    this.upgrades = { ...levels };
  }

  /** Starts a new run on a fresh track. */
  reset(options: StreamerOptions): void {
    this.startD = options.startD ?? 0;
    this.tutorial = options.tutorial === true;
    this.track.reset(options);
    Object.assign(this.state, createRunState(this.startD));
    if (this.tutorial) {
      this.state.thief.d = this.startD + thiefLead(this.state.v, true);
      this.state.prev.thiefD = this.state.thief.d;
    }
    this.state.tier = this.track.tierAt(this.startD);
    this.state.district = options.district ?? 'street';
    this.buffer.clear();
    this.events = [];
    this.introT = 0;
    this.bonus = 0;
    this.lifted.clear();
  }

  /** Queues a press; it waits in the action buffer until the player can use it. */
  push(action: ActionEvent): void {
    this.buffer.push(action.action, this.state.time);
  }

  /** Advances the run one fixed step of `dt` seconds. */
  step(dt: number): void {
    const s = this.state;
    if (s.frozen || s.phase === 'over') return;
    if (s.phase === 'intro') {
      this.introT += dt;
      if (this.introT >= RESULTS.introTime) {
        s.phase = 'running';
        this.events.push({ type: 'runStart' });
      }
      return;
    }
    s.time += dt;
    s.v = speedAt(s.time) * speedFactor(s.player);
    const p = s.player;
    const thief = s.thief;
    s.prev.d = s.d;
    s.prev.x = p.x;
    s.prev.y = p.y;
    s.prev.thiefD = thief.d;
    s.prev.thiefX = thief.x;
    s.prev.thiefY = thief.y;
    s.d += s.v * dt;
    this.track.update(s.d, s.v, s.time, dt);
    const goldBefore = s.gold;
    if (p.gliding) this.glide(dt);
    else {
      stepPlayer(p, this.track, s, this.buffer, dt, this.events);
      collide(s, this.track, this.events, this.nearbyBoxes);
    }
    tickPowerUps(s, dt, this.events);
    if (p.mode.kind !== 'crash' && p.mode.kind !== 'fall') {
      const magnet = s.powerUps.magnet > 0;
      const reach = magnet ? POWERUPS.magnet.ahead : COINS.radius;
      this.track.coinsIn(s.d - COINS.radius, s.d + reach, this.nearbyCoins);
      for (const coin of this.nearbyCoins) {
        if (coin.taken || (coin.fromThief && coin.d > thief.d)) continue;
        const pulled = magnet && pullCoin(coin, s, dt);
        this.take(coin, pulled);
      }
      for (const coin of s.airCoins) if (!coin.fromThief || coin.d <= thief.d) this.take(coin, false);
      this.collectPickups();
    }
    const thiefPose = thief.pose;
    stepThief(thief, this.track, s.d, s.v, dt, this.tutorial);
    if (this.tutorial && thiefPose !== 'wallRun' && thief.pose === 'wallRun') this.events.push({ type: 'thiefDemo', act: 'wall' });
    if (s.multiplier > 1) this.bonus += ((s.d - s.prev.d) * SCORE.perMetre + (s.gold - goldBefore) * SCORE.perGold) * (s.multiplier - 1);
    s.score = scoreFor(s.d - this.startD, s.gold) + Math.floor(this.bonus);
    const tier = this.track.tierAt(s.d);
    if (tier !== s.tier) {
      s.tier = tier;
      this.events.push({ type: 'tier', tier });
    }
    if (p.mode.kind === 'crash' && p.mode.t >= RESULTS.crashDelay) this.end(p.mode.cause);
    else if (p.mode.kind === 'fall' && p.mode.t >= AIR.fallTime) this.end('fall');
  }

  /** Takes a coin the player touches (a magnet's coin counts as touched once it is pulled close). */
  private take(coin: Coin, magnet: boolean): void {
    const s = this.state;
    const p = s.player;
    if (coin.taken) return;
    if (Math.hypot(coin.d - s.d, coin.x - p.x, coin.y - (p.y + p.height / 2)) > COINS.radius) return;
    coin.taken = true;
    s.gold++;
    s.streak++;
    this.events.push({ type: 'coin', d: coin.d, x: coin.x, y: coin.y, streak: s.streak, magnet });
  }

  /** Picks up power-ups within POWERUPS.pickRadius and starts their timers. */
  private collectPickups(): void {
    const s = this.state;
    const p = s.player;
    const r = POWERUPS.pickRadius;
    this.track.pickupsIn(s.d - r, s.d + r, this.nearbyPickups);
    for (const pickup of this.nearbyPickups) {
      if (pickup.taken || Math.hypot(pickup.d - s.d, pickup.x - p.x, pickup.y - (p.y + p.height / 2)) > r) continue;
      pickup.taken = true;
      const duration = powerUpDuration(pickup.kind, this.upgrades[pickup.kind]);
      s.powerUps[pickup.kind] = duration;
      if (pickup.kind === 'glide' && !p.gliding) {
        const mode = p.mode.kind;
        if (mode === 'run' || mode === 'jump' || mode === 'slide' || mode === 'air') {
          startGlide(p);
          layGlideCoins(s.airCoins, s.d, s.v, duration);
        } else s.powerUps.glide = 0;
      }
      this.events.push({ type: 'pickup', kind: pickup.kind });
    }
  }

  /** One step of the jet glide; it ends when its timer runs out over floor (never over a gap). */
  private glide(dt: number): void {
    const s = this.state;
    const p = s.player;
    stepGlide(p, s, this.buffer, POWERUPS.glide.height, POWERUPS.glide.climbRate, dt, this.events);
    s.powerUps.glide = Math.max(0, s.powerUps.glide - dt);
    this.liftCoins(dt);
    if (s.powerUps.glide > 0 || this.track.floorAt(s.d, p.x) === null) return;
    // Never set down just before a gap (or a wall-run stretch), nor into anything in the lane: fly on until the
    // way ahead is plain, empty floor.
    const gap = this.track.nextGap(s.d);
    if (gap && gap.start - s.d < s.v * POWERUPS.glide.clearAhead) return;
    const n = this.track.boxesIn(s.d - PLAYER.depth, s.d + s.v * POWERUPS.glide.clearAhead, this.nearbyBoxes);
    for (let i = 0; i < n; i++) {
      const box = this.nearbyBoxes[i];
      if (!box.broken && box.x0 < p.x + PLAYER.width && box.x1 > p.x - PLAYER.width) return;
    }
    endGlide(p, POWERUPS.glide.landSafe);
    s.airCoins.length = 0;
    this.lifted.clear();
    this.events.push({ type: 'powerUpEnd', kind: 'glide' });
  }

  /**
   * Raises the track's coins to the flight line, from the player to where the sky coins stop (the glide's remaining
   * distance less coinsFrom, so the coins past the landing stay on the floor). A sky coin that a risen coin would sit
   * on is put away, so no two coins overlap.
   */
  private liftCoins(dt: number): void {
    const s = this.state;
    const end = s.d + s.v * s.powerUps.glide - POWERUPS.glide.coinsFrom;
    const n = end > s.d ? this.track.coinsIn(s.d - COINS.radius, end, this.nearbyCoins) : 0;
    for (let i = 0; i < n; i++) {
      const coin = this.nearbyCoins[i];
      if (coin.taken) continue;
      if (!this.lifted.has(coin)) {
        this.lifted.add(coin);
        const x = glideCoinX(coin);
        for (const sky of s.airCoins) {
          if (!sky.taken && sky.x === x && Math.abs(sky.d - coin.d) < COINS.spacing * 0.75) sky.taken = true;
        }
      }
      liftCoin(coin, dt);
    }
  }

  private end(cause: NonNullable<RunState['cause']>): void {
    this.state.phase = 'over';
    this.state.cause = cause;
    this.state.endTime = this.state.time;
    this.events.push({ type: 'gameOver', cause });
  }

  /** Every event since the last call, oldest first. Called once per frame. */
  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}
