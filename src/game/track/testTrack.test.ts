import { describe, expect, it } from 'vitest';
import { TIERS, WALL } from '../../balance';
import type { Coin, CollisionBox, PathKey, Pickup } from '../types';
import { createTestTrack, floorSpan, testBox, wallSpan } from './testTrack';

function coin(d: number): Coin {
  return { d, x: 0, y: 0.5, taken: false, fromThief: false };
}

function pickup(d: number): Pickup {
  return { d, x: 0, y: 0.8, kind: 'magnet', taken: false };
}

describe('test track', () => {
  it('floorAt: half-open spans, gaps between them, the highest overlapping floor', () => {
    const track = createTestTrack({ floors: [floorSpan(110, 200), floorSpan(0, 100), floorSpan(150, 160, 1.5)] });
    expect(track.floorAt(0)).toBe(0);
    expect(track.floorAt(99.999)).toBe(0);
    expect(track.floorAt(100)).toBeNull();
    expect(track.floorAt(105, 2)).toBeNull();
    expect(track.floorAt(110)).toBe(0);
    expect(track.floorAt(155)).toBe(1.5);
    expect(track.floorAt(160)).toBe(0);
    expect(track.floorAt(-0.001)).toBeNull();
    expect(track.floorAt(200)).toBeNull();
  });

  it('runnableWall: the span on that side covering d, half-open', () => {
    const left = wallSpan(-1, 50, 80, 'facade');
    const right = wallSpan(1, 60, 70);
    const track = createTestTrack({ walls: [right, left] });
    expect(track.runnableWall(50, -1)).toBe(left);
    expect(track.runnableWall(65, 1)).toBe(right);
    expect(track.runnableWall(55, 1)).toBeNull();
    expect(track.runnableWall(80, -1)).toBeNull();
    expect(track.runnableWall(49.9, -1)).toBeNull();
  });

  it('resolveWallJump: the opposite wall if it covers [land, land + v·minLanding], else the floor, else nothing', () => {
    const v = 20;
    const d = 100;
    const land = d + v * WALL.speedFactor * WALL.jumpTime;
    const needed = land + v * WALL.minLanding;
    expect(land).toBeCloseTo(110.5, 9);

    const wall = createTestTrack({ walls: [wallSpan(-1, 90, 105), wallSpan(1, 105, needed + 1)] });
    expect(wall.resolveWallJump(d, -1, v)).toEqual({ kind: 'wall', side: 1, d: land });

    // The opposite wall ends too soon after the landing point, so the floor below decides.
    const short = createTestTrack({ floors: [floorSpan(108, 200)], walls: [wallSpan(1, 105, needed - 0.5)] });
    expect(short.resolveWallJump(d, -1, v)).toEqual({ kind: 'floor', lane: 0, d: land });

    // A wall on the side being left does not count.
    const sameSide = createTestTrack({ walls: [wallSpan(-1, 90, 200)] });
    expect(sameSide.resolveWallJump(d, -1, v)).toEqual({ kind: 'none', d: land });

    // From the right wall the target is the left wall.
    const mirrored = createTestTrack({ walls: [wallSpan(-1, 105, 140)] });
    expect(mirrored.resolveWallJump(d, 1, v)).toEqual({ kind: 'wall', side: -1, d: land });
  });

  it('boxesIn: closed overlap, ascending d, the track’s own objects, out trimmed to the count', () => {
    const a = testBox({ d0: 10, d1: 12, x0: -1, x1: 1, y0: 0, y1: 1 });
    const b = testBox({ d0: 20, d1: 21, x0: -1, x1: 1, y0: 0, y1: 1, kind: 'barrierLow', rule: 'jump' });
    const c = testBox({ d0: 5, d1: 40, x0: 2, x1: 3, y0: 0, y1: 3 });
    const track = createTestTrack({ boxes: [b, a, c] });
    const out: CollisionBox[] = [a, a, a, a, a];
    expect(track.boxesIn(12, 20, out)).toBe(3);
    expect(out).toEqual([c, a, b]);
    expect(out[1]).toBe(a);
    expect(track.boxesIn(13, 19, out)).toBe(1);
    expect(out).toEqual([c]);
    expect(track.boxesIn(41, 50, out)).toBe(0);
    expect(out.length).toBe(0);
    // The simulation's changes show through.
    a.broken = true;
    track.boxesIn(0, 100, out);
    expect(out.find((box) => box.id === a.id)?.broken).toBe(true);
    expect(b.kind).toBe('barrierLow');
    expect(a.id).not.toBe(b.id);
  });

  it('coinsIn and pickupsIn: closed range, ascending d, taken items included', () => {
    const coins = [coin(30), coin(10), coin(20), coin(20.0001)];
    const track = createTestTrack({ coins, pickups: [pickup(50), pickup(15)] });
    const out: Coin[] = [];
    expect(track.coinsIn(10, 20, out)).toBe(2);
    expect(out.map((c) => c.d)).toEqual([10, 20]);
    coins[1].taken = true;
    expect(track.coinsIn(0, 100, out)).toBe(4);
    expect(out[0].taken).toBe(true);
    const picks: Pickup[] = [];
    expect(track.pickupsIn(0, 49.9, picks)).toBe(1);
    expect(picks[0].d).toBe(15);
  });

  it('pathAt: the last key at or before d, lane 0 before the first, optional fields cleared', () => {
    const track = createTestTrack({
      path: [
        { d: 40, lane: -1, act: 'wall', side: -1, band: 'high' },
        { d: 0, lane: 1 },
        { d: 60, lane: 0 },
      ],
    });
    const out: PathKey = { d: -1, lane: 0 };
    expect(track.pathAt(-5, out)).toEqual({ d: -5, lane: 0, act: undefined, side: undefined, band: undefined });
    expect(track.pathAt(0, out)).toBe(out);
    expect(out).toMatchObject({ d: 0, lane: 1 });
    track.pathAt(45, out);
    expect(out).toMatchObject({ d: 40, lane: -1, act: 'wall', side: -1, band: 'high' });
    track.pathAt(60, out);
    expect(out).toEqual({ d: 60, lane: 0, act: undefined, side: undefined, band: undefined });
  });

  it('nextGap: the gap d is over, else the next one, flagged when a wall runs beside it', () => {
    const track = createTestTrack({
      floors: [floorSpan(0, 100), floorSpan(100, 140), floorSpan(150, 300), floorSpan(320, 400)],
      walls: [wallSpan(1, 290, 330)],
    });
    expect(track.nextGap(0)).toEqual({ start: 140, end: 150, walls: false });
    expect(track.nextGap(145)).toEqual({ start: 140, end: 150, walls: false });
    expect(track.nextGap(150)).toEqual({ start: 300, end: 320, walls: true });
    expect(track.nextGap(320)).toBeNull();
    expect(createTestTrack({ floors: [floorSpan(0, 10)] }).nextGap(0)).toBeNull();
  });

  it('tierAt: TIERS by distance, or the fixed tier', () => {
    const track = createTestTrack();
    expect(track.tierAt(0)).toBe(0);
    for (let i = 1; i < TIERS.length; i++) {
      expect(track.tierAt(TIERS[i].from - 0.01)).toBe(i - 1);
      expect(track.tierAt(TIERS[i].from)).toBe(i);
    }
    expect(track.tierAt(1e6)).toBe(TIERS.length - 1);
    expect(createTestTrack({ tier: 3 }).tierAt(0)).toBe(3);
  });

  it('an empty track has no floor, walls, items or gaps', () => {
    const track = createTestTrack();
    expect(track.floorAt(0)).toBeNull();
    expect(track.runnableWall(0, 1)).toBeNull();
    expect(track.resolveWallJump(0, 1, 11).kind).toBe('none');
    expect(track.boxesIn(-1e9, 1e9, [])).toBe(0);
    expect(track.nextGap(0)).toBeNull();
  });
});
