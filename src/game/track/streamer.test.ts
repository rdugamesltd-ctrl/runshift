import { describe, expect, it } from 'vitest';
import { CHUNK, SIM } from '../../balance';
import { botAction } from '../systems/bot';
import { Run } from '../systems/run';
import { Streamer } from './streamer';
import type { CollisionBox } from '../types';

describe('seeded street content', () => {
  it('builds the same pattern, boxes and coins from the same seed', () => {
    const a = new Streamer({ seed: 7 });
    const b = new Streamer({ seed: 7 });
    expect(a.chunks).toEqual(b.chunks);
    expect(a.chunks.some(chunk => chunk.patterns.length > 0)).toBe(true);
  });

  it('places raised platforms and hazards in both outer lanes', () => {
    const track = new Streamer({ seed: 7, pattern: 'raised-sides' });
    const chunk = track.chunks.find(item => item.start === 0);
    expect(chunk).toBeDefined();
    expect(track.floorAt(0)).toBe(0);
    expect(track.floorAt(8)).toBeCloseTo(0.6);
    expect(track.floorAt(12)).toBe(0);
    expect(chunk?.boxes.map(box => (box.x0 + box.x1) / 2).sort()).toEqual([-2, 2]);
    expect(chunk?.boxes.every(box => box.y0 === 0.6)).toBe(true);
    expect(chunk?.coins.some(coin => coin.y > 1)).toBe(true);
  });

  it('places two wagons with roofs that can be landed on', () => {
    const track = new Streamer({ seed: 7, pattern: 'train-roofs' });
    const wagons = track.chunks.find(item => item.start === 0)?.boxes.filter(box => box.kind === 'metroCar') ?? [];
    expect(wagons).toHaveLength(2);
    const middle = (wagons[0].d0 + wagons[0].d1) / 2;
    expect(track.platformAt(middle, 0)).toBe(2.25);
    expect(track.platformAt(middle, 2)).toBe(2.25);
    expect(track.platformAt(middle, -2)).toBeNull();
    expect(track.floorAt(middle)).toBe(0);
    expect(wagons[0].d1 - wagons[0].d0).toBeGreaterThan(8);
    expect(wagons[0].rampLength).toBeGreaterThan(0);
    expect(track.platformAt(wagons[0].d0 + 0.1, 0)).toBeLessThan(0.2);
    expect(track.chunks.find(item => item.start === 0)?.coins.some(coin => coin.y > 1.7)).toBe(true);
  });

  it('moves an oncoming train and keeps its collision query at the new position', () => {
    const track = new Streamer({ seed: 7, pattern: 'train-roofs' });
    const train = track.chunks.find(chunk => chunk.index === 0)?.boxes.find(box => box.vd < 0);
    expect(train).toBeDefined();
    const start = train!.d0;
    track.update(0, 11, 0, 0.5);
    expect(train!.d0).toBeCloseTo(start - 2.5);
    const nearby: CollisionBox[] = [];
    expect(track.boxesIn(train!.d0, train!.d0, nearby)).toBeGreaterThan(0);
    expect(nearby).toContain(train);
  });

  it('crashes into an oncoming train in its lane', () => {
    const run = new Run(new Streamer());
    run.reset({ seed: 7, pattern: 'train-roofs' });
    run.state.player.lane = 1;
    run.state.player.laneFrom = 1;
    run.state.player.x = 2;
    run.state.prev.x = 2;
    for (let frame = 0; frame < 240 && run.state.cause === null; frame++) run.step(SIM.fixedDt);
    expect(run.state.cause).toBe('train');
  });

  it('keeps tall train formations frequent after the opening stretch', () => {
    const track = new Streamer({ seed: 7 });
    const counts: number[] = [];
    for (let index = 0; index < 10; index++) {
      track.update(index * CHUNK.length, 11, 0, SIM.fixedDt);
      counts.push(track.chunks.find(chunk => chunk.index === index)?.boxes.filter(box => box.kind === 'metroCar').length ?? 0);
    }
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBe(3);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBeGreaterThanOrEqual(12);
    for (let index = 2; index < counts.length; index++) expect(counts[index - 1] + counts[index]).toBeGreaterThan(0);
  });

  it('jumps from one train roof to the next', () => {
    const run = new Run(new Streamer());
    run.reset({ seed: 7, pattern: 'train-hop' });
    let jumpedFromRoof = false;
    let landedOnNextRoof = false;
    for (let frame = 0; frame < 500 && run.state.d < CHUNK.length && run.state.phase !== 'over'; frame++) {
      const action = botAction('perfect', run.state, run.track);
      if (action) run.push({ action, at: 0, source: 'bot' });
      run.step(SIM.fixedDt);
      const events = run.drainEvents();
      if (events.some(event => event.type === 'jump') && run.state.player.y > 2) jumpedFromRoof = true;
      if (jumpedFromRoof && events.some(event => event.type === 'land') && run.state.player.y > 2.2) landedOnNextRoof = true;
    }
    expect(jumpedFromRoof).toBe(true);
    expect(landedOnNextRoof).toBe(true);
    expect(run.state.phase).toBe('running');
  });

  it('lets the perfect route jump onto a wagon and run off its roof', () => {
    const run = new Run(new Streamer());
    run.reset({ seed: 7, pattern: 'train-roofs' });
    let landedOnRoof = false;
    let leftRoof = false;
    for (let frame = 0; frame < 500 && run.state.phase !== 'over'; frame++) {
      const action = botAction('perfect', run.state, run.track);
      if (action) run.push({ action, at: 0, source: 'bot' });
      run.step(SIM.fixedDt);
      const player = run.state.player;
      if (player.mode.kind === 'run' && player.y > 2.2) landedOnRoof = true;
      if (landedOnRoof && player.y < 0.1) leftRoof = true;
    }
    expect(landedOnRoof).toBe(true);
    expect(leftRoof).toBe(true);
    expect(run.state.phase).toBe('running');
  });

  it.each([0, 400])('lands on a ramp jumped onto from anywhere before or along it (time %i s)', time => {
    const offsets: number[] = [];
    for (let offset = -4; offset <= 3.2; offset += 0.2) offsets.push(offset);
    const failures: number[] = [];
    for (const offset of offsets) {
      const run = new Run(new Streamer());
      run.reset({ seed: 7, pattern: 'train-roofs' });
      const wagon = run.track.chunks.find(chunk => chunk.start === 0)?.boxes
        .find(box => box.kind === 'metroCar' && box.vd === 0 && box.x0 <= 0 && box.x1 > 0 && box.rampLength);
      expect(wagon).toBeDefined();
      run.state.time = time;
      let jumped = false;
      for (let frame = 0; frame < 2000 && run.state.d < wagon!.d0 + wagon!.rampLength! + 3 && run.state.phase !== 'over'; frame++) {
        if (!jumped && run.state.phase === 'running' && run.state.d >= wagon!.d0 + offset) {
          run.push({ action: 'up', at: 0, source: 'bot' });
          jumped = true;
        }
        run.step(SIM.fixedDt);
      }
      if (run.state.cause !== null || run.state.player.y < 2) failures.push(Math.round(offset * 10) / 10);
    }
    expect(failures).toEqual([]);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])('gives the perfect bot a route through 600 m (seed %i)', seed => {
    const run = new Run(new Streamer());
    run.reset({ seed });
    for (let frame = 0; frame < 5000 && run.state.d < 600 && run.state.phase !== 'over'; frame++) {
      const action = botAction('perfect', run.state, run.track);
      if (action) run.push({ action, at: 0, source: 'bot' });
      run.step(SIM.fixedDt);
    }
    expect(run.state.d).toBeGreaterThanOrEqual(600);
    expect(run.state.phase).toBe('running');
  });

  it('keeps the horizon covered and queries precise at a million metres', () => {
    const track = new Streamer({ seed: 23, startD: 1_000_000 });
    for (const d of [1_000_000, 1_000_007.5, 1_000_041, 1_000_119.25]) {
      track.update(d, 26, 100, SIM.fixedDt);
      expect(track.chunks.length).toBeLessThanOrEqual(CHUNK.maxActive);
      expect(track.chunks[0].start).toBeLessThanOrEqual(d - CHUNK.recycleBehind);
      const last = track.chunks[track.chunks.length - 1];
      expect(last.start + last.length).toBeGreaterThan(d + CHUNK.horizon);
      expect(track.floorAt(d)).toBe(0);
      expect(track.floorAt(d + 0.001)).toBe(0);
    }
  });

  it.each(['wall-right-swap', 'wall-left-swap'])('replays %s through several wall jumps', pattern => {
    const run = new Run(new Streamer());
    run.reset({ seed: 7, pattern });
    const events = [] as ReturnType<Run['drainEvents']>;
    for (let frame = 0; frame < 2500 && run.state.d < 160 && run.state.phase !== 'over'; frame++) {
      const action = botAction('perfect', run.state, run.track);
      if (action) run.push({ action, at: 0, source: 'bot' });
      run.step(SIM.fixedDt);
      events.push(...run.drainEvents());
    }
    expect(run.state.d).toBeGreaterThanOrEqual(160);
    expect(run.state.phase).toBe('running');
    expect(events.filter(event => event.type === 'wallAttach').length).toBeGreaterThanOrEqual(3);
    expect(events.filter(event => event.type === 'wallJump').length).toBeGreaterThanOrEqual(1);
  });
});
