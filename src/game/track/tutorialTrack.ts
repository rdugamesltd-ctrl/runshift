import { CHUNK } from '../../balance';
import type { Action, PlayerState, Side, TipId } from '../types';
import type { Pattern } from './patterns';
import { speedAt, timeForDistance } from './speed';

/**
 * The tutorial track: after one plain chunk, one lesson chunk per main move, in the order a new player meets
 * them (lanes, jump, slide, wall-run, high band, wall-jump). Each lesson lists the steps the run stops for: the
 * run freezes at the step's beat, shows its card and waits for the step's press. Beats are the step's ideal
 * press moment, so the move lands exactly as authored once the press comes. After the last lesson the track
 * goes back to the director.
 */

/** One move the tutorial waits for. */
export interface TutorialStep {
  /** The tip the step teaches; it is saved once the step is done. */
  tip: TipId;
  /** The press the step waits for. */
  action: Action;
  /** Beat in the lesson's pattern where the run stops for it. */
  at: number;
  /** True once the player has made the move (so a player who is ahead of the lesson is never stopped). */
  done(player: PlayerState): boolean;
}

/** One lesson: its pattern and the steps it stops for, in order. */
export interface TutorialLesson {
  pattern: Pattern;
  steps: TutorialStep[];
}

/** A step placed on the track: the run stops for it at distance d, m. */
export interface TutorialMark {
  d: number;
  step: TutorialStep;
  /** The step's index among all the steps, from 0. */
  index: number;
}

function onWall(p: PlayerState, side: Side): boolean {
  const mode = p.mode;
  return (mode.kind === 'wallAttach' || mode.kind === 'wallRun') && mode.side === side;
}

const ALL_TIERS = [0, 1, 2, 3, 4];

/** The lessons, in order. Patterns here are never picked by the director (they are not in PATTERNS). */
export const TUTORIAL_LESSONS: readonly TutorialLesson[] = [
  {
    // Blocks in the centre and right lanes: move left.
    pattern: {
      id: 'tut-left', tiers: ALL_TIERS, weight: 0, beats: 1.4, shell: 'street', districts: ['street', 'subway'],
      gaps: [], walls: [], obstacles: [{ t: 0.95, kind: 'blocker', lanes: [0, 1], len: 0 }],
      coins: [{ t0: 0.7, t1: 1.4, lane: -1 }], pickups: [], path: [{ t: 0.5, lane: -1 }], actions: 1,
    },
    steps: [{ tip: 'lanes', action: 'left', at: 0.5, done: (p) => p.lane === -1 }],
  },
  {
    // A block in the left lane: move back right.
    pattern: {
      id: 'tut-right', tiers: ALL_TIERS, weight: 0, beats: 1.4, shell: 'street', districts: ['street', 'subway'],
      gaps: [], walls: [], obstacles: [{ t: 0.95, kind: 'blocker', lanes: [-1], len: 0 }],
      coins: [{ t0: 0.7, t1: 1.4, lane: 0 }], pickups: [], path: [{ t: 0.5, lane: 0 }], actions: 1,
    },
    steps: [{ tip: 'lanes', action: 'right', at: 0.5, done: (p) => p.lane !== -1 }],
  },
  {
    // A low barrier across all three lanes: jump (the arc of coins over it comes with the pattern).
    pattern: {
      id: 'tut-jump', tiers: ALL_TIERS, weight: 0, beats: 1.2, shell: 'street', districts: ['street', 'subway'],
      gaps: [], walls: [], obstacles: [{ t: 0.9, kind: 'barrierLow', lanes: [-1, 0, 1], len: 0 }],
      coins: [], pickups: [], path: [{ t: 0.62, lane: 0, act: 'jump' }], actions: 1,
    },
    steps: [{ tip: 'jump', action: 'up', at: 0.62, done: (p) => p.mode.kind === 'jump' }],
  },
  {
    // A high barrier across all three lanes: slide under it.
    pattern: {
      id: 'tut-slide', tiers: ALL_TIERS, weight: 0, beats: 1.2, shell: 'street', districts: ['street', 'subway'],
      gaps: [], walls: [], obstacles: [{ t: 0.9, kind: 'barrierHigh', lanes: [-1, 0, 1], len: 0 }],
      coins: [], pickups: [], path: [{ t: 0.62, lane: 0, act: 'slide' }], actions: 1,
    },
    steps: [{ tip: 'slide', action: 'down', at: 0.62, done: (p) => p.mode.kind === 'slide' }],
  },
  {
    // The floor ends under a wall on the right: run on it, climb to the high band over a low vent, then jump to
    // the left wall before a pipe that blocks the whole right wall, and step down when the floor comes back.
    pattern: {
      id: 'tut-wall', tiers: ALL_TIERS, weight: 0, beats: 2.2, shell: 'pitWalls', districts: ['street'],
      gaps: [{ t0: 0.45, t1: 1.95 }],
      walls: [
        { side: 1, t0: 0, t1: 1.35, surface: 'hoarding', blocks: [
          { t: 0.75, len: 0.12, kind: 'wallVentLow' },
          { t: 1.2, len: 0.15, kind: 'wallPipeFull' },
        ] },
        { side: -1, t0: 1.0, t1: 2.1, surface: 'facade', blocks: [] },
      ],
      obstacles: [],
      coins: [
        { t0: 0.18, t1: 0.42, wall: 1, band: 'low' },
        { t0: 0.6, t1: 1.0, wall: 1, band: 'high' },
        { t0: 1.45, t1: 1.95, wall: -1, band: 'high' },
      ],
      pickups: [],
      path: [
        { t: 0.12, lane: 0, act: 'wall', side: 1, band: 'low' },
        { t: 0.45, lane: 0, act: 'band', band: 'high' },
        { t: 0.85, lane: 0, act: 'wallJump', side: 1 },
      ],
      actions: 3,
    },
    steps: [
      { tip: 'wall', action: 'right', at: 0.12, done: (p) => onWall(p, 1) || p.mode.kind === 'wallJump' },
      { tip: 'band', action: 'up', at: 0.45,
        done: (p) => (p.mode.kind === 'wallRun' && p.mode.band === 'high') || p.mode.kind === 'wallJump' || onWall(p, -1) },
      { tip: 'wallJump', action: 'left', at: 0.85, done: (p) => p.mode.kind === 'wallJump' || onWall(p, -1) },
    ],
  },
];

/** The tutorial's pattern ids, in order. */
export const TUTORIAL_PATTERN_IDS: readonly string[] = TUTORIAL_LESSONS.map((lesson) => lesson.pattern.id);

/** The chunk index that holds lesson 0 for a run that starts at `startD`: the first full chunk after the start. */
export function firstLessonChunk(startD: number): number {
  return Math.floor(startD / CHUNK.length) + 1;
}

/** The lesson built into chunk `index` of a tutorial run that starts at `startD`, or null. */
export function lessonForChunk(index: number, startD: number): TutorialLesson | null {
  return TUTORIAL_LESSONS[index - firstLessonChunk(startD)] ?? null;
}

/** The speed the streamer places a chunk starting at `start` with (the speed curve's prediction), m/s. */
export function placementSpeed(start: number, startD: number): number {
  return speedAt(timeForDistance(Math.max(0, start - startD)));
}

/** Every tutorial step on the track of a run that starts at `startD`, in order along the run. */
export function tutorialMarks(startD: number): TutorialMark[] {
  const marks: TutorialMark[] = [];
  const first = firstLessonChunk(startD);
  TUTORIAL_LESSONS.forEach((lesson, k) => {
    const start = (first + k) * CHUNK.length;
    const v = placementSpeed(start, startD);
    for (const step of lesson.steps) marks.push({ d: start + step.at * v, step, index: marks.length });
  });
  return marks;
}
