import { describe, expect, it } from 'vitest';
import { JUMP, LANES, SIM, THIEF } from '../../balance';
import { createTestTrack, floorSpan, wallSpan } from '../track/testTrack';
import type { PathKey, ThiefState, TrackQuery } from '../types';
import { createThief, stepThief, thiefLead } from './thief';

it('keeps the thief ahead over 10,000 varied steps', () => {
  const track = createTestTrack({ floors: [floorSpan(0, 1_000_000)] });
  const thief = createThief();
  let d = 0;
  let random = 7;
  for (let i = 0; i < 10_000; i++) {
    random = (Math.imul(random, 1664525) + 1013904223) | 0;
    const v = 8 + ((random >>> 0) / 0x100000000) * 30;
    d += v / 60;
    stepThief(thief, track, d, v, 1 / 60);
    expect(thief.d - d).toBeGreaterThanOrEqual(THIEF.minLead - 1e-9);
    expect(thief.d - d).toBeLessThanOrEqual(THIEF.maxLead + 1e-9);
  }
});

/** Runs the thief for `seconds` behind a player at a steady `v`, calling `each` after every step. */
function run(track: TrackQuery, seconds: number, each: (thief: ThiefState, d: number) => void, v = 12): ThiefState {
  const thief = createThief();
  let d = 0;
  for (let i = 0; i < Math.round(seconds / SIM.fixedDt); i++) {
    d += v * SIM.fixedDt;
    stepThief(thief, track, d, v, SIM.fixedDt);
    each(thief, d);
  }
  return thief;
}

describe('the thief runs the route', () => {
  it('changes lane smoothly, never in one jump', () => {
    const path: PathKey[] = [{ d: 0, lane: 0 }, { d: 40, lane: 1 }, { d: 70, lane: 0 }];
    const track = createTestTrack({ floors: [floorSpan(-10, 500)], path });
    let lastX = 0;
    let biggest = 0;
    const thief = run(track, 6, t => {
      biggest = Math.max(biggest, Math.abs(t.x - lastX));
      lastX = t.x;
    });
    expect(thief.x).toBeCloseTo(0, 5);
    // A lane change takes LANES.changeTime: at 60 Hz no step moves more than a fifth of a lane.
    expect(biggest).toBeGreaterThan(0);
    expect(biggest).toBeLessThan(LANES.width / 5);
  });

  it('jumps on a jump key with the hero arc and lands', () => {
    const path: PathKey[] = [{ d: 0, lane: 0 }, { d: 50, lane: 0, act: 'jump' }];
    const track = createTestTrack({ floors: [floorSpan(-10, 500)], path });
    let apex = 0;
    let jumped = false;
    const thief = run(track, 6, t => {
      apex = Math.max(apex, t.y);
      if (t.pose === 'jump') jumped = true;
    });
    expect(jumped).toBe(true);
    expect(apex).toBeCloseTo(JUMP.apex, 1);
    expect(thief.pose).toBe('run');
    expect(thief.y).toBe(0);
  });

  it('slides on a slide key', () => {
    const path: PathKey[] = [{ d: 0, lane: 0 }, { d: 50, lane: 0, act: 'slide' }];
    const track = createTestTrack({ floors: [floorSpan(-10, 500)], path });
    let slid = false;
    run(track, 5, t => { if (t.pose === 'slide') slid = true; });
    expect(slid).toBe(true);
  });

  it('runs a wall where the route says, and comes off it', () => {
    const path: PathKey[] = [{ d: 0, lane: 0 }, { d: 60, lane: 1, act: 'wall', side: 1, band: 'low' }, { d: 80, lane: 1 }];
    const track = createTestTrack({ floors: [floorSpan(-10, 500)], walls: [wallSpan(1, 58, 78)], path });
    let walled = false;
    const thief = run(track, 9, t => { if (t.pose === 'wallRun' && t.side === 1) walled = true; });
    expect(walled).toBe(true);
    expect(thief.pose).toBe('run');
    expect(thief.y).toBe(0);
  });
});

describe('the thief lead', () => {
  it('eases after a stumble instead of snapping back', () => {
    const track = createTestTrack({ floors: [floorSpan(-10, 1000)] });
    const thief = createThief();
    let d = 0;
    for (let i = 0; i < 300; i++) {
      d += 20 * SIM.fixedDt;
      stepThief(thief, track, d, 20, SIM.fixedDt);
    }
    expect(thief.d - d).toBeCloseTo(thiefLead(20), 3);
    const before = thief.d;
    d += 16 * SIM.fixedDt;
    stepThief(thief, track, d, 16, SIM.fixedDt);
    // He keeps running forward at nearly his old pace rather than jumping back to the shorter lead.
    expect(thief.d - before).toBeGreaterThan(18.5 * SIM.fixedDt);
  });

  it('keeps running away once the player has stopped', () => {
    const track = createTestTrack({ floors: [floorSpan(-10, 1000)] });
    const thief = createThief();
    let d = 0;
    for (let i = 0; i < 120; i++) {
      d += 20 * SIM.fixedDt;
      stepThief(thief, track, d, 20, SIM.fixedDt);
    }
    const lead = thief.d - d;
    for (let i = 0; i < 60; i++) stepThief(thief, track, d, 0, SIM.fixedDt);
    expect(thief.d - d).toBeGreaterThan(lead + 10);
  });
});
