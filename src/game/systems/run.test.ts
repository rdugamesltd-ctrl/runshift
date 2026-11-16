import { describe, expect, it } from 'vitest';
import { SIM } from '../../balance';
import { Streamer } from '../track/streamer';
import { testBox } from '../track/testTrack';
import { Run } from './run';

describe('run integration', () => {
  it('collects gold, hits an obstacle, and ends once after the crash delay', () => {
    const run = new Run(new Streamer(), { decorators: [chunk => {
      if (chunk.start !== 0) return;
      chunk.coins.push({ d: 5, x: 0, y: 0.85, taken: false, fromThief: false });
      chunk.boxes.push(testBox({ d0: 10, d1: 11, x0: -0.5, x1: 0.5, y0: 0, y1: 2 }));
    }] });
    run.reset({ seed: 7, tutorial: true });
    const events = [] as ReturnType<Run['drainEvents']>;
    for (let i = 0; i < 400 && run.state.phase !== 'over'; i++) {
      run.step(SIM.fixedDt);
      events.push(...run.drainEvents());
    }
    expect(run.state.gold).toBeGreaterThanOrEqual(1);
    expect(run.state.score).toBeGreaterThanOrEqual(1);
    expect(run.state.phase).toBe('over');
    expect(run.state.cause).toBe('front');
    expect(events.filter(event => event.type === 'coin')).toHaveLength(run.state.gold);
    expect(events.filter(event => event.type === 'gameOver')).toEqual([{ type: 'gameOver', cause: 'front' }]);
    run.step(SIM.fixedDt);
    expect(run.drainEvents()).toEqual([]);
  });
});
