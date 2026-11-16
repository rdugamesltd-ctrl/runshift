import type { DebugState } from '../debug/hooks';
import type { GameEvent, RunState } from '../game/types';

/** The run as window.__runshift.state() reports it: a fresh object, so tests can keep it. */
export function debugState(run: RunState): DebugState {
  const p = run.player;
  return {
    phase: run.phase,
    d: run.d,
    v: run.v,
    mode: p.mode.kind,
    lane: p.lane,
    x: p.x,
    y: p.y,
    gold: run.gold,
    score: run.score,
    tier: run.tier,
    district: run.district,
    thiefLead: run.thief.d - run.d,
    powerUps: { ...run.powerUps },
  };
}

/**
 * The events window.__runshift.events() hands out: every GameEvent since the previous call, oldest first. Keeps at
 * most `max`, dropping the oldest, so a page nobody polls does not grow without end.
 */
export class EventLog {
  private events: GameEvent[] = [];
  private readonly max: number;

  constructor(max = 1000) {
    this.max = Math.max(1, max);
  }

  /** Events waiting to be taken. */
  get size(): number {
    return Math.min(this.events.length, this.max);
  }

  /** Records one event. The oldest are trimmed in batches, so recording stays cheap. */
  push(event: GameEvent): void {
    this.events.push(event);
    if (this.events.length > this.max * 2) this.events.splice(0, this.events.length - this.max);
  }

  /** Every event since the last call, oldest first (at most `max`). */
  take(): GameEvent[] {
    const events = this.events.length > this.max ? this.events.slice(-this.max) : this.events;
    this.events = [];
    return events;
  }
}
