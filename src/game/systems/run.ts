import { RESULTS } from '../../balance';
import type { ActionEvent } from '../../input/types';
import { ActionBuffer } from '../entities/actions';
import { createPlayer, stepPlayer } from '../entities/player';
import { createThief, stepThief, thiefLead } from '../entities/thief';
import { speedAt } from '../track/speed';
import type { ChunkDecorator, ChunkStreamer, GameEvent, RunState, StreamerOptions } from '../types';
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
  };
}

/**
 * One run of the game, stepped at SIM.fixedDt. WP-00 stub: after the intro it runs forever along the
 * speed curve (d += speedAt(time)·dt), the player keeps to the floor and the thief keeps his lead.
 * TODO WP-01: the full step order (docs/CONVENTIONS.md): collisions, coins, game over, results delay;
 * WP-32: power-ups and speed modifiers.
 */
export class Run {
  readonly state: RunState = createRunState();
  readonly track: ChunkStreamer;
  private readonly buffer = new ActionBuffer();
  private events: GameEvent[] = [];
  private introT = 0;
  private startD = 0;

  constructor(track: ChunkStreamer, { decorators = [] }: RunOptions = {}) {
    this.track = track;
    track.decorators.push(...decorators);
  }

  /** Starts a new run on a fresh track. */
  reset(options: StreamerOptions): void {
    this.startD = options.startD ?? 0;
    this.track.reset(options);
    Object.assign(this.state, createRunState(this.startD));
    this.state.tier = this.track.tierAt(this.startD);
    this.state.district = options.district ?? 'street';
    this.buffer.clear();
    this.events = [];
    this.introT = 0;
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
    s.v = speedAt(s.time);
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
    stepPlayer(p, this.track, s, this.buffer, dt, this.events);
    stepThief(thief, this.track, s.d, s.v, dt);
    s.score = scoreFor(s.d - this.startD, s.gold);
    const tier = this.track.tierAt(s.d);
    if (tier !== s.tier) {
      s.tier = tier;
      this.events.push({ type: 'tier', tier });
    }
  }

  /** Every event since the last call, oldest first. Called once per frame. */
  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }
}
