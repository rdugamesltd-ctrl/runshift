import { describe, expect, it } from 'vitest';
import { LANES, SIM, WALL } from '../../balance';
import { createTestTrack, floorSpan, wallSpan } from '../track/testTrack';
import type { GameEvent, PlayerState, TrackQuery } from '../types';
import { ActionBuffer } from './actions';
import { createPlayer, speedFactor, stepPlayer } from './player';

const floor = floorSpan(-20, 200);

function step(p: PlayerState, track: TrackQuery, buf: ActionBuffer, events: GameEvent[], t: number, d = 0): void {
  stepPlayer(p, track, { d, v: 11, time: t }, buf, SIM.fixedDt, events);
}

function attach(track: TrackQuery, side: -1 | 1 = 1): { p: PlayerState; buf: ActionBuffer; events: GameEvent[] } {
  const p = createPlayer();
  const buf = new ActionBuffer();
  const events: GameEvent[] = [];
  buf.push(side === 1 ? 'right' : 'left', 0);
  for (let i = 1; i <= Math.ceil(WALL.attachTime / SIM.fixedDt); i++) step(p, track, buf, events, i * SIM.fixedDt);
  return { p, buf, events };
}

describe('wall movement', () => {
  it('attaches from the centre, runs low, and switches to the high band', () => {
    const track = createTestTrack({ floors: [floor], walls: [wallSpan(1, 0, 100)] });
    const { p, buf, events } = attach(track);
    expect(p.mode.kind).toBe('wallRun');
    expect(p.x).toBeCloseTo(WALL.planeX - WALL.poseReach / 2);
    expect(p.y).toBeCloseTo(WALL.bandLow);
    expect(speedFactor(p)).toBe(WALL.speedFactor);
    buf.push('up', WALL.attachTime);
    for (let i = 1; i <= Math.ceil(WALL.bandSwitchTime / SIM.fixedDt); i++) step(p, track, buf, events, WALL.attachTime + i * SIM.fixedDt);
    expect(p.mode.kind).toBe('wallRun');
    expect(p.y).toBeCloseTo(WALL.bandHigh);
    expect(events).toContainEqual({ type: 'wallAttach', side: 1, band: 'low' });
    expect(events).toContainEqual({ type: 'wallBand', band: 'high' });
  });

  it('rejects a wall on the far side and keeps an outer press for the entry buffer', () => {
    const far = createPlayer();
    far.lane = -1;
    far.laneFrom = -1;
    far.x = -LANES.width;
    const rightWall = createTestTrack({ floors: [floor], walls: [wallSpan(1, 0, 100)] });
    const buf = new ActionBuffer();
    const events: GameEvent[] = [];
    buf.push('right', 0);
    step(far, rightWall, buf, events, SIM.fixedDt);
    expect(far.mode.kind).toBe('run');
    expect(far.lane).toBe(0);

    const p = createPlayer();
    p.lane = 1;
    p.laneFrom = 1;
    p.x = LANES.width;
    const late = createTestTrack({ floors: [floor], walls: [wallSpan(1, 3, 100)] });
    const held = new ActionBuffer();
    held.push('right', 0);
    step(p, late, held, events, SIM.fixedDt);
    expect(held.size).toBe(1);
    step(p, late, held, events, 0.1, 1.1);
    expect(p.mode.kind).toBe('wallAttach');

    const missing = createTestTrack({ floors: [floor] });
    const edge = createPlayer();
    edge.lane = 1;
    edge.laneFrom = 1;
    edge.x = LANES.width;
    const expired = new ActionBuffer();
    const expiryEvents: GameEvent[] = [];
    expired.push('right', 0);
    step(edge, missing, expired, expiryEvents, SIM.fixedDt);
    step(edge, missing, expired, expiryEvents, WALL.entryBuffer + SIM.fixedDt);
    expect(expiryEvents).toContainEqual({ type: 'bump', side: 1 });
    expect(expired.size).toBe(0);
  });

  it('attaches at 0.29 seconds but expires at 0.31 seconds', () => {
    const start = 11 * (0.29 + WALL.attachTime);
    const track = createTestTrack({ floors: [floor], walls: [wallSpan(1, start, 100)] });
    const early = createPlayer();
    early.lane = 1;
    early.laneFrom = 1;
    early.x = LANES.width;
    const pending = new ActionBuffer();
    const events: GameEvent[] = [];
    pending.push('right', 0);
    step(early, track, pending, events, SIM.fixedDt);
    step(early, track, pending, events, 0.29, 11 * 0.29);
    expect(early.mode.kind).toBe('wallAttach');

    const late = createPlayer();
    late.lane = 1;
    late.laneFrom = 1;
    late.x = LANES.width;
    const expired = new ActionBuffer();
    expired.push('right', 0);
    step(late, track, expired, events, SIM.fixedDt);
    step(late, track, expired, events, 0.31, 11 * 0.31);
    expect(late.mode.kind).toBe('run');
    expect(events).toContainEqual({ type: 'bump', side: 1 });
  });

  it('jumps to the opposite wall and keeps wall time across the chain', () => {
    const track = createTestTrack({ floors: [floor], walls: [wallSpan(1, 0, 100), wallSpan(-1, 0, 100)] });
    const { p, buf, events } = attach(track);
    p.wallTime = 0.5;
    buf.push('left', WALL.attachTime);
    for (let i = 1; i <= Math.ceil(WALL.jumpTime / SIM.fixedDt); i++) step(p, track, buf, events, WALL.attachTime + i * SIM.fixedDt);
    expect(p.mode.kind).toBe('wallRun');
    if (p.mode.kind === 'wallRun') expect(p.mode.side).toBe(-1);
    expect(p.wallTime).toBe(0.5);
    expect(events).toContainEqual({ type: 'wallJump', from: 1, to: 'wall' });
  });

  it('lands a wall jump on the floor, or falls when there is no landing', () => {
    const floorTrack = createTestTrack({ floors: [floor], walls: [wallSpan(1, 0, 100)] });
    const onFloor = attach(floorTrack);
    onFloor.buf.push('left', WALL.attachTime);
    for (let i = 1; i <= Math.ceil(WALL.jumpTime / SIM.fixedDt); i++) step(onFloor.p, floorTrack, onFloor.buf, onFloor.events, WALL.attachTime + i * SIM.fixedDt);
    expect(onFloor.p.mode.kind).toBe('run');
    expect(onFloor.p.lane).toBe(0);

    const noFloor = createTestTrack({ floors: [floorSpan(-20, 1)], walls: [wallSpan(1, 0, 100)] });
    const falling = attach(noFloor);
    falling.buf.push('left', WALL.attachTime);
    for (let i = 1; i <= Math.ceil(WALL.jumpTime / SIM.fixedDt); i++) step(falling.p, noFloor, falling.buf, falling.events, WALL.attachTime + i * SIM.fixedDt);
    expect(falling.p.mode.kind).toBe('air');
  });

  it('can attach during coyote time and exits a finished wall onto the floor', () => {
    const gap = createTestTrack({ floors: [floorSpan(-20, 0)], walls: [wallSpan(1, 0, 100)] });
    const p = createPlayer();
    const buf = new ActionBuffer();
    const events: GameEvent[] = [];
    step(p, gap, buf, events, SIM.fixedDt, 0.1);
    expect(p.mode.kind).toBe('air');
    buf.push('right', SIM.fixedDt);
    step(p, gap, buf, events, 2 * SIM.fixedDt, 0.2);
    expect(p.mode.kind).toBe('wallAttach');

    const ending = createTestTrack({ floors: [floor], walls: [wallSpan(1, 0, 3)] });
    const run = attach(ending);
    step(run.p, ending, run.buf, run.events, 1, 3.1);
    expect(run.p.mode.kind).toBe('wallExit');
    for (let i = 1; i <= Math.ceil(WALL.exitTime / SIM.fixedDt); i++) step(run.p, ending, run.buf, run.events, 1 + i * SIM.fixedDt, 3.1);
    expect(run.p.mode.kind).toBe('run');
    expect(run.p.lane).toBe(1);
  });

  it('slips once and leaves after the wall timer runs out', () => {
    const track = createTestTrack({ floors: [floor], walls: [wallSpan(1, 0, 100)] });
    const { p, buf, events } = attach(track);
    p.wallTime = WALL.slipFrom - SIM.fixedDt;
    step(p, track, buf, events, 1);
    expect(events.filter(e => e.type === 'wallSlip')).toHaveLength(1);
    p.wallTime = WALL.maxTime - SIM.fixedDt;
    step(p, track, buf, events, 2);
    expect(p.mode.kind).toBe('wallExit');
  });
});

describe('wall-jump landings', () => {
  /** Runs a player along `track` from d = 0 at the speed curve's 11 m/s (× the player's own factor), pressing
   *  `presses` at their distances; calls `each` after every step with the step's distance. */
  function runAlong(track: TrackQuery, presses: [number, 'left' | 'right'][], until: number,
    each: (p: PlayerState, d: number) => void): void {
    const p = createPlayer();
    const buf = new ActionBuffer();
    const events: GameEvent[] = [];
    let d = 0;
    let t = 0;
    const queue = [...presses];
    while (d < until) {
      t += SIM.fixedDt;
      const v = 11 * speedFactor(p);
      d += v * SIM.fixedDt;
      while (queue.length && queue[0][0] <= d) buf.push(queue.shift()![1], t);
      stepPlayer(p, track, { d, v, time: t }, buf, SIM.fixedDt, events);
      each(p, d);
    }
  }

  it('ends exactly where the jump was resolved to land', () => {
    const track = createTestTrack({ floors: [floorSpan(-20, 300)], walls: [wallSpan(1, 0, 20)] });
    let target = Number.NaN;
    let landedAt = Number.NaN;
    let jumping = false;
    runAlong(track, [[0.1, 'right'], [8, 'left']], 30, (p, d) => {
      if (p.mode.kind === 'wallJump') {
        jumping = true;
        target = p.mode.target.d;
      } else if (jumping) {
        jumping = false;
        landedAt = d;
      }
    });
    expect(Number.isNaN(landedAt)).toBe(false);
    expect(Math.abs(landedAt - target)).toBeLessThan(1e-6);
  });

  it('falls on from the arc with nothing to land on, never snapping sideways', () => {
    const track = createTestTrack({ floors: [floorSpan(-20, 4)], walls: [wallSpan(1, 0, 14)] });
    let lastX = 0;
    let biggest = 0;
    let lastY = 0;
    let fallSpeedAtEnd = Number.NaN;
    let wasJumping = false;
    runAlong(track, [[0.1, 'right'], [8, 'left']], 30, (p) => {
      biggest = Math.max(biggest, Math.abs(p.x - lastX));
      if (wasJumping && p.mode.kind !== 'wallJump') fallSpeedAtEnd = p.vy;
      wasJumping = p.mode.kind === 'wallJump';
      lastX = p.x;
      lastY = p.y;
    });
    expect(lastY).toBeLessThan(-1);
    expect(biggest).toBeLessThan(0.45);
    expect(fallSpeedAtEnd).toBeLessThan(-3);
  });
});
