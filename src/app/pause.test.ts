import { describe, expect, it } from 'vitest';
import { RESULTS } from '../balance';
import { PauseFlow } from './pause';

function makeFlow(seconds?: number) {
  const log: string[] = [];
  const flow = new PauseFlow(
    {
      paused: () => log.push('paused'),
      countdown: (n) => log.push(`count ${n}`),
      resumed: () => log.push('resumed'),
    },
    seconds,
  );
  return { flow, log };
}

describe('PauseFlow', () => {
  it('pauses at once and resumes only after a tap and a 3-2-1 countdown', () => {
    const { flow, log } = makeFlow();
    expect(RESULTS.resumeCountdown).toBe(3);
    expect(flow.paused).toBe(false);
    expect(flow.pause()).toBe(true);
    expect(flow.phase).toBe('paused');
    // Time alone never resumes a pause.
    flow.update(10);
    expect(flow.phase).toBe('paused');
    expect(flow.resume()).toBe(true);
    expect(flow.phase).toBe('countdown');
    expect(flow.paused).toBe(true);
    for (let i = 0; i < 59; i++) flow.update(1 / 60);
    expect(log).toEqual(['paused', 'count 3']);
    flow.update(1 / 60 + 1e-9);
    expect(log).toEqual(['paused', 'count 3', 'count 2']);
    flow.update(1);
    expect(flow.phase).toBe('countdown');
    flow.update(1);
    expect(flow.phase).toBe('running');
    expect(log).toEqual(['paused', 'count 3', 'count 2', 'count 1', 'count null', 'resumed']);
  });

  it('ignores a second pause and a resume when not paused', () => {
    const { flow, log } = makeFlow();
    expect(flow.resume()).toBe(false);
    flow.pause();
    expect(flow.pause()).toBe(false);
    expect(log).toEqual(['paused']);
  });

  it('a pause during the countdown stops it and needs a new tap', () => {
    const { flow, log } = makeFlow();
    flow.pause();
    flow.resume();
    flow.update(1.5);
    flow.pause();
    expect(flow.phase).toBe('paused');
    flow.update(5);
    expect(flow.phase).toBe('paused');
    expect(log).toEqual(['paused', 'count 3', 'count 2', 'count null', 'paused']);
  });

  it('toggles like Esc: pause, resume into the countdown, pause again', () => {
    const { flow } = makeFlow();
    flow.toggle();
    expect(flow.phase).toBe('paused');
    flow.toggle();
    expect(flow.phase).toBe('countdown');
    flow.toggle();
    expect(flow.phase).toBe('paused');
  });

  it('clears quietly for a new run or the menu', () => {
    const { flow, log } = makeFlow();
    flow.pause();
    flow.resume();
    flow.clear();
    expect(flow.phase).toBe('running');
    expect(log).toEqual(['paused', 'count 3', 'count null']);
  });

  it('resumes at once with no countdown', () => {
    const { flow, log } = makeFlow(0);
    flow.pause();
    flow.resume();
    expect(flow.phase).toBe('running');
    expect(log).toEqual(['paused', 'resumed']);
  });
});
