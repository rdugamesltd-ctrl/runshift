import { describe, expect, it } from 'vitest';
import { AIR, JUMP, LANES, SIM, SLIDE } from '../../balance';
import { createTestTrack, floorSpan } from '../track/testTrack';
import type { GameEvent } from '../types';
import { ActionBuffer } from './actions';
import { createPlayer, FALL_TIME, GRAVITY, GRAVITY_UP, jumpArc, laneCurve, laneSpeed, RISE_TIME, smoothstep, stepPlayer } from './player';

const flat = createTestTrack({ floors: [floorSpan(-100, 100)] });

describe('ground movement', () => {
  it('reaches the jump apex and lands at the authored airtime', () => {
    const player = createPlayer();
    const buffer = new ActionBuffer();
    const events: GameEvent[] = [];
    buffer.push('up', 0);
    let apex = 0;
    let landedAt = 0;
    for (let frame = 1; frame <= 60; frame++) {
      stepPlayer(player, flat, { d: 0, v: 11, time: frame * SIM.fixedDt }, buffer, SIM.fixedDt, events);
      apex = Math.max(apex, player.y);
      if (events.some(e => e.type === 'land')) { landedAt = frame * SIM.fixedDt; break; }
    }
    expect(apex).toBeCloseTo(JUMP.apex, 2);
    expect(landedAt).toBeCloseTo(JUMP.airtime, 2);
    expect(player.mode.kind).toBe('run');
  });

  it('changes a lane smoothly and slides with a shorter collision box', () => {
    const player = createPlayer();
    const buffer = new ActionBuffer();
    const events: GameEvent[] = [];
    buffer.push('right', 0);
    for (let frame = 1; frame <= 9; frame++) stepPlayer(player, flat, { d: 0, v: 11, time: frame * SIM.fixedDt }, buffer, SIM.fixedDt, events);
    expect(player.x).toBeCloseTo(LANES.width, 5);
    buffer.push('down', 0.15);
    stepPlayer(player, flat, { d: 0, v: 11, time: 0.16 }, buffer, SIM.fixedDt, events);
    expect(player.mode.kind).toBe('slide');
    expect(player.height).toBe(SLIDE.height);
  });

  it('allows a jump shortly after the floor ends', () => {
    const track = createTestTrack({ floors: [floorSpan(-10, 0)] });
    const player = createPlayer();
    const buffer = new ActionBuffer();
    const events: GameEvent[] = [];
    stepPlayer(player, track, { d: 0.1, v: 11, time: SIM.fixedDt }, buffer, SIM.fixedDt, events);
    expect(player.mode.kind).toBe('air');
    buffer.push('up', SIM.fixedDt);
    stepPlayer(player, track, { d: 0.2, v: 11, time: SIM.fixedDt * 2 }, buffer, SIM.fixedDt, events);
    expect(player.mode.kind).toBe('jump');
    expect(AIR.coyote).toBeGreaterThan(SIM.fixedDt);
  });
});

describe('lane changes', () => {
  /** Steps the player once at time `t`, returning its x. */
  function stepAt(player: ReturnType<typeof createPlayer>, buffer: ActionBuffer, t: number): number {
    stepPlayer(player, flat, { d: 0, v: 11, time: t }, buffer, SIM.fixedDt, []);
    return player.x;
  }

  it('the curve is smoothstep from rest and ends at rest', () => {
    for (const u of [0, 0.25, 0.5, 0.75, 1]) expect(laneCurve(0, 1, 0, u)).toBeCloseTo(smoothstep(u), 12);
    expect(laneCurve(0.4, 2, 9, 1)).toBeCloseTo(2, 12);
  });

  it('a double swipe sweeps two lanes without stopping half way', () => {
    const player = createPlayer();
    player.lane = -1;
    player.laneFrom = -1;
    player.x = -LANES.width;
    const buffer = new ActionBuffer();
    buffer.push('right', 0);
    let t = SIM.fixedDt;
    let x = stepAt(player, buffer, t);
    let last = x;
    let lastSpeed = 0;
    let minSpeed = Infinity;
    for (let frame = 2; frame <= 30; frame++) {
      t = frame * SIM.fixedDt;
      if (frame === 5) buffer.push('right', t);
      x = stepAt(player, buffer, t);
      const speed = (x - last) / SIM.fixedDt;
      // Between the presses' peaks the speed never collapses to a standstill.
      if (frame >= 4 && frame <= 10) minSpeed = Math.min(minSpeed, speed);
      expect(x).toBeLessThanOrEqual(LANES.width + 1e-9);
      lastSpeed = speed;
      last = x;
    }
    expect(player.x).toBeCloseTo(LANES.width, 9);
    expect(lastSpeed).toBeCloseTo(0, 9);
    expect(minSpeed).toBeGreaterThan(LANES.width / LANES.changeTime);
  });

  it('a swipe back starts from rest and never drifts further out', () => {
    const player = createPlayer();
    const buffer = new ActionBuffer();
    buffer.push('right', 0);
    for (let frame = 1; frame <= 4; frame++) stepAt(player, buffer, frame * SIM.fixedDt);
    const turnX = player.x;
    buffer.push('left', 5 * SIM.fixedDt);
    for (let frame = 5; frame <= 20; frame++) expect(stepAt(player, buffer, frame * SIM.fixedDt)).toBeLessThanOrEqual(turnX + 1e-9);
    expect(player.x).toBeCloseTo(0, 9);
  });

  it('still takes LANES.changeTime for one lane', () => {
    const player = createPlayer();
    const buffer = new ActionBuffer();
    buffer.push('left', 0);
    expect(laneSpeed(player)).toBe(0);
    let frame = 0;
    while (Math.abs(player.x + LANES.width) > 1e-9 && frame < 60) stepAt(player, buffer, ++frame * SIM.fixedDt);
    expect(frame * SIM.fixedDt).toBeCloseTo(LANES.changeTime, 1);
  });
});

describe('the jump arc', () => {
  it('rises for longer than it falls, and the coin arc follows the flight', () => {
    const player = createPlayer();
    const buffer = new ActionBuffer();
    buffer.push('up', 0);
    let apexAt = 0;
    let apex = 0;
    for (let frame = 1; frame <= 36; frame++) {
      const t = frame * SIM.fixedDt;
      stepPlayer(player, flat, { d: 0, v: 11, time: t }, buffer, SIM.fixedDt, []);
      if (player.mode.kind !== 'jump') break;
      // The take-off step already flies, so after frame n the feet are where the arc is at n steps.
      expect(player.y).toBeCloseTo(jumpArc(t / JUMP.airtime), 9);
      if (player.y > apex) {
        apex = player.y;
        apexAt = t;
      }
    }
    expect(apexAt).toBeGreaterThan(JUMP.airtime / 2);
    expect(RISE_TIME).toBeGreaterThan(FALL_TIME);
    expect(GRAVITY).toBeGreaterThan(GRAVITY_UP);
    expect(jumpArc(0)).toBe(0);
    expect(jumpArc(JUMP.riseShare)).toBeCloseTo(JUMP.apex, 12);
    expect(jumpArc(1)).toBeCloseTo(0, 12);
  });
});
