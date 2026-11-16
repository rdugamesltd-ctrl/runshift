import { describe, expect, it } from 'vitest';
import { AIR, RESULTS, SIM } from '../../balance';
import { Streamer } from '../track/streamer';
import { Progress } from './progress';
import { Run } from './run';
import { memoryStore } from './save';
import { Session } from './session';

describe('results flow', () => {
  it('holds a fall until the results delay and banks the run once', () => {
    const progress = new Progress(memoryStore());
    const run = new Run(new Streamer());
    const session = new Session(run, progress, { seed: 7 });
    session.play();
    run.state.phase = 'over';
    run.state.cause = 'fall';
    run.state.d = 50;
    run.state.gold = 3;
    run.state.score = 53;
    const wait = RESULTS.fallDelay - AIR.fallTime;
    for (let t = 0; t + SIM.fixedDt < wait - 1e-9; t += SIM.fixedDt) session.step(SIM.fixedDt);
    expect(session.screen).toBe('run');
    session.step(SIM.fixedDt);
    expect(session.screen).toBe('results');
    expect(session.result?.cause).toBe('fall');
    expect(progress.data.totals.runs).toBe(1);
    expect(progress.data.gold).toBe(3);
    session.step(SIM.fixedDt);
    expect(progress.data.totals.runs).toBe(1);
  });
});

describe('back to the menu', () => {
  it('puts a run left half-way back to a still, fresh start', () => {
    const run = new Run(new Streamer());
    const session = new Session(run, new Progress(memoryStore()), { seed: 7 });
    session.play();
    for (let i = 0; i < 300; i++) session.step(SIM.fixedDt);
    expect(run.state.d).toBeGreaterThan(0);
    session.toMenu();
    expect(session.screen).toBe('menu');
    expect(run.state.phase).toBe('intro');
    expect(run.state.d).toBe(0);
    expect(run.state.prev.d).toBe(run.state.d);
    expect(run.state.player.mode.kind).toBe('run');
  });
});

describe('tutorial runs', () => {
  it('lays the lesson track while wantsTutorial says so, and plain runs after', () => {
    const track = new Streamer();
    const run = new Run(track);
    const session = new Session(run, new Progress(memoryStore()), { seed: 7 });
    let wants = true;
    session.wantsTutorial = () => wants;
    session.play();
    expect(session.tutorial).toBe(true);
    expect(track.chunks.find((chunk) => chunk.index === 1)?.patterns).toEqual(['tut-left']);
    wants = false;
    session.retry();
    expect(session.tutorial).toBe(false);
    expect(track.chunks.find((chunk) => chunk.index === 1)?.patterns).not.toEqual(['tut-left']);
  });

  it('always plays it when the options ask (?tutorial)', () => {
    const session = new Session(new Run(new Streamer()), new Progress(memoryStore()), { seed: 7, tutorial: true });
    session.wantsTutorial = () => false;
    session.play();
    expect(session.tutorial).toBe(true);
  });
});
