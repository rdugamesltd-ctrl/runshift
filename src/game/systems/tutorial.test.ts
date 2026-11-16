import { describe, expect, it, vi } from 'vitest';
import { CHUNK, SIM, TUTORIAL } from '../../balance';
import { Streamer } from '../track/streamer';
import { TUTORIAL_LESSONS, TUTORIAL_PATTERN_IDS, firstLessonChunk, tutorialMarks } from '../track/tutorialTrack';
import type { Action, TipId } from '../types';
import { Run } from './run';
import { TIP_IDS } from './save';
import { Tutorial, tutorialDone } from './tutorial';

function setup(startD = 0) {
  const track = new Streamer({ seed: 7 });
  const run = new Run(track);
  run.reset({ seed: 7, tutorial: true, startD });
  const lesson = new Tutorial();
  lesson.reset(true, startD);
  run.state.phase = 'running';
  return { track, run, lesson };
}

/** Steps the run like the app does, answering each stop with `answer` (null: leave it frozen). */
function play(run: Run, lesson: Tutorial, answer: (stop: string) => Action | null, until: number, early: (d: number) => Action | null = () => null) {
  const stops: string[] = [];
  for (let i = 0; i < 60 * 120 && run.state.d < until && run.state.phase === 'running'; i++) {
    lesson.check(run.state);
    if (lesson.step) {
      const stop = `${lesson.step.tip}:${lesson.step.action}`;
      stops.push(stop);
      lesson.update(run.state, TUTORIAL.readTime);
      const action = answer(stop);
      if (action === null) return stops;
      if (lesson.accept(action, run.state)) run.push({ action, at: 0, source: 'key' });
    } else {
      const action = early(run.state.d);
      if (action && lesson.accept(action, run.state)) run.push({ action, at: 0, source: 'key' });
    }
    run.step(SIM.fixedDt);
  }
  return stops;
}

describe('tutorial track', () => {
  it('lays one lesson per chunk after a plain first chunk, then hands back to the director', () => {
    const { track } = setup();
    for (const [k, id] of TUTORIAL_PATTERN_IDS.entries()) {
      track.update((firstLessonChunk(0) + k) * CHUNK.length, 11, 0, 0);
      expect(track.chunks.find((chunk) => chunk.index === firstLessonChunk(0) + k)?.patterns).toEqual([id]);
    }
    track.update((firstLessonChunk(0) + TUTORIAL_LESSONS.length) * CHUNK.length, 11, 0, 0);
    const after = track.chunks.find((chunk) => chunk.index === firstLessonChunk(0) + TUTORIAL_LESSONS.length + 1);
    expect(after?.patterns.some((id) => id.startsWith('tut-'))).toBe(false);
  });

  it('starts on plain street and puts no power-ups on lesson chunks', () => {
    const { track } = setup();
    expect(track.chunks.find((chunk) => chunk.index === 0)?.patterns).toEqual([]);
    track.update(CHUNK.length * 3, 11, 0, 0);
    const lessons = track.chunks.filter((chunk) => chunk.patterns.some((id) => id.startsWith('tut-')));
    expect(lessons.length).toBeGreaterThan(0);
    for (const chunk of lessons) expect(chunk.pickups).toEqual([]);
  });

  it('teaches every tip, in the save order', () => {
    const tips = TUTORIAL_LESSONS.flatMap((lesson) => lesson.steps.map((step) => step.tip));
    expect([...new Set(tips)]).toEqual([...TIP_IDS]);
  });
});

describe('Tutorial', () => {
  it('stops at every lesson and the right presses carry the runner through without a crash', () => {
    const { run, lesson } = setup();
    const done: TipId[] = [];
    const finish = vi.fn();
    lesson.onComplete = (tip) => done.push(tip);
    lesson.onFinish = finish;
    const marks = tutorialMarks(0);
    const stops = play(run, lesson, (stop) => stop.split(':')[1] as Action, marks[marks.length - 1].d + CHUNK.length);
    expect(stops).toEqual(['lanes:left', 'lanes:right', 'jump:up', 'slide:down', 'wall:right', 'band:up', 'wallJump:left']);
    expect(run.state.phase).toBe('running');
    expect(run.state.player.mode.kind).toBe('run');
    expect(done).toEqual(['lanes', 'lanes', 'jump', 'slide', 'wall', 'band', 'wallJump']);
    expect(finish).toHaveBeenCalledWith(false);
    expect(lesson.active).toBe(false);
  });

  it('works for a run that starts further on', () => {
    const { run, lesson } = setup(640);
    const marks = tutorialMarks(640);
    const stops = play(run, lesson, (stop) => stop.split(':')[1] as Action, marks[marks.length - 1].d + CHUNK.length);
    expect(stops).toHaveLength(7);
    expect(run.state.phase).toBe('running');
  });

  it('holds the run while the card is read and through wrong presses', () => {
    const { run, lesson } = setup();
    const wrong = vi.fn();
    lesson.onWrong = wrong;
    const stops = play(run, lesson, () => null, 400);
    expect(stops).toEqual(['lanes:left']);
    const d = run.state.d;
    expect(run.state.frozen).toBe(true);
    lesson.update(run.state, 0);
    expect(lesson.accept('right', run.state)).toBe(false);
    expect(wrong).toHaveBeenCalledWith('right');
    for (let i = 0; i < 30; i++) {
      lesson.update(run.state, SIM.fixedDt);
      run.step(SIM.fixedDt);
    }
    expect(run.state.d).toBe(d);
    expect(lesson.accept('left', run.state)).toBe(true);
    expect(run.state.frozen).toBe(false);
  });

  it('ignores presses for the reading time after the card appears', () => {
    const { run, lesson } = setup();
    const marks = tutorialMarks(0);
    run.state.d = marks[0].d;
    expect(lesson.update(run.state, SIM.fixedDt)).toBe(true);
    expect(lesson.accept('left', run.state)).toBe(false);
    lesson.update(run.state, TUTORIAL.readTime);
    expect(lesson.accept('left', run.state)).toBe(true);
  });

  it('never stops a player who has already made the move', () => {
    const { run, lesson } = setup();
    const marks = tutorialMarks(0);
    // Move left well before the first lesson.
    let pressed = false;
    const stops = play(run, lesson, (stop) => stop.split(':')[1] as Action, marks[1].d - 1, (d) => {
      if (pressed || d < marks[0].d - 8) return null;
      pressed = true;
      return 'left';
    });
    expect(stops).toEqual([]);
    expect(lesson.progress.done).toBe(1);
  });

  it('stops again when the press did not make the move', () => {
    const { run, lesson } = setup();
    const marks = tutorialMarks(0);
    // From the right lane, one left press only reaches the centre lane, still blocked.
    run.state.player.lane = 1;
    run.state.player.laneFrom = 1;
    run.state.player.x = 2;
    const stops = play(run, lesson, (stop) => stop.split(':')[1] as Action, marks[1].d - 1);
    expect(stops).toEqual(['lanes:left', 'lanes:left']);
    expect(run.state.player.lane).toBe(-1);
    expect(run.state.phase).toBe('running');
  });

  it('skip saves every tip and lets the run go', () => {
    const { run, lesson } = setup();
    const done: TipId[] = [];
    const finish = vi.fn();
    lesson.onComplete = (tip) => done.push(tip);
    lesson.onFinish = finish;
    play(run, lesson, () => null, 400);
    expect(run.state.frozen).toBe(true);
    lesson.skip(run.state);
    expect(run.state.frozen).toBe(false);
    expect(lesson.active).toBe(false);
    expect(tutorialDone(done)).toBe(true);
    expect(finish).toHaveBeenCalledWith(true);
  });

  it('is done only once every tip is saved', () => {
    expect(tutorialDone([])).toBe(false);
    expect(tutorialDone(['lanes', 'jump', 'slide', 'wall', 'band'])).toBe(false);
    expect(tutorialDone([...TIP_IDS])).toBe(true);
  });
});
