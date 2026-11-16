import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameEvent, PlayerMode, RunPhase, RunState } from '../game/types';
import { GameAudio } from './audio';
import { coinPitch, MUSIC, MUSIC_FILES, OUT_LEVEL, SFX_SPACING } from './sfx';

/* A stand-in AudioContext that records what it is asked to build and schedule. */

class FakeParam {
  value: number;
  /** Automation events scheduled on this parameter. */
  events = 0;
  /** Values given to setValueAtTime and setTargetAtTime, in order. */
  readonly set: number[] = [];
  readonly targets: number[] = [];

  constructor(value: number) {
    this.value = value;
  }

  setValueAtTime(value: number): this {
    this.events++;
    this.set.push(value);
    return this;
  }

  setTargetAtTime(value: number): this {
    this.events++;
    this.targets.push(value);
    return this;
  }

  exponentialRampToValueAtTime(): this {
    this.events++;
    return this;
  }
}

class FakeNode {
  readonly outputs: FakeNode[] = [];

  connect<T extends FakeNode>(node: T): T {
    this.outputs.push(node);
    return node;
  }

  /** The node's AudioParams. */
  params(): FakeParam[] {
    return Object.values(this).filter((value): value is FakeParam => value instanceof FakeParam);
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
}

class FakePanner extends FakeNode {
  readonly pan = new FakeParam(0);
}

class FakeSource extends FakeNode {
  startAt = Number.NaN;
  stopAt = Number.NaN;

  start(when = 0): void {
    this.startAt = when;
  }

  stop(when = 0): void {
    this.stopAt = when;
  }
}

class FakeOscillator extends FakeSource {
  type = 'sine';
  readonly frequency = new FakeParam(440);
}

class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
}

class FakeContext {
  currentTime = 0;
  readonly sampleRate = 8000;
  state = 'suspended';
  readonly destination = new FakeNode();
  readonly nodes: FakeNode[] = [];
  resumes = 0;
  suspends = 0;

  createGain(): FakeGain {
    return this.add(new FakeGain());
  }

  createBiquadFilter(): FakeFilter {
    return this.add(new FakeFilter());
  }

  createStereoPanner(): FakePanner {
    return this.add(new FakePanner());
  }

  createOscillator(): FakeOscillator {
    return this.add(new FakeOscillator());
  }

  createBufferSource(): FakeBufferSource {
    return this.add(new FakeBufferSource());
  }

  createBuffer(_channels: number, length: number): { getChannelData(channel: number): Float32Array } {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }

  resume(): Promise<void> {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.suspends++;
    this.state = 'suspended';
    return Promise.resolve();
  }

  /** The nodes of one kind made since node number `from`. */
  made<T extends FakeNode>(kind: new () => T, from = 0): T[] {
    return this.nodes.slice(from).filter((node): node is T => node instanceof kind);
  }

  private add<T extends FakeNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }
}

function setUp(): { audio: GameAudio; ctx: FakeContext; contexts: () => number } {
  const ctx = new FakeContext();
  let contexts = 0;
  const audio = new GameAudio(() => {
    contexts++;
    return ctx as unknown as AudioContext;
  });
  return { audio, ctx, contexts: () => contexts };
}

/** The mute bus (feeds the speakers) and the pause bus (feeds the mute bus). */
function buses(ctx: FakeContext): { out: FakeGain; master: FakeGain } {
  const gains = ctx.made(FakeGain);
  const out = gains.find((gain) => gain.outputs.includes(ctx.destination));
  const master = gains.find((gain) => out !== undefined && gain.outputs.includes(out));
  if (!out || !master) throw new Error('no buses');
  return { out, master };
}

/** Automation events scheduled on all of `nodes`' parameters. */
function automation(nodes: FakeNode[]): number {
  return nodes.reduce((sum, node) => sum + node.params().reduce((n, param) => n + param.events, 0), 0);
}

function runState(v = 11, mode: PlayerMode = { kind: 'run' }, phase: RunPhase = 'running'): RunState {
  return {
    phase,
    time: 0,
    endTime: 0,
    d: 0,
    v,
    prev: { d: 0, x: 0, y: 0, thiefD: 10, thiefX: 0, thiefY: 0 },
    player: {
      mode,
      lane: 0,
      laneFrom: 0,
      laneT: 1,
      x: 0,
      y: 0,
      vy: 0,
      height: 1.7,
      wallTime: 0,
      stumbleT: 0,
      lastStumble: Number.NEGATIVE_INFINITY,
      invulnT: 0,
      gliding: false,
      glideSaves: 0,
    },
    thief: { d: 10, x: 0, y: 0, pose: 'run', side: 0, band: 'low', phase: 0 },
    gold: 0,
    score: 0,
    multiplier: 1,
    streak: 0,
    powerUps: { magnet: 0, shield: 0, multiplier: 0, glide: 0 },
    tier: 0,
    district: 'street',
    cause: null,
    frozen: false,
    airCoins: [],
  };
}

/** Runs `seconds` of frames at `hz`; the run clock steps at 60 Hz with them unless `still` (paused). */
function drive(audio: GameAudio, ctx: FakeContext, state: RunState, seconds: number, hz = 60, still = false): void {
  const frames = Math.round(seconds * hz);
  for (let i = 0; i < frames; i++) {
    // At 120 Hz every other frame runs no 60 Hz step.
    if (!still && (hz === 60 || i % 2 === 1)) state.time += 1 / 60;
    ctx.currentTime += 1 / hz;
    audio.update(state, 1 / hz);
  }
}

/** Footsteps played over `seconds` of running: each step has one oscillator, and nothing else plays meanwhile. */
function steps(state: RunState, seconds: number, still = false): number {
  const { audio, ctx } = setUp();
  audio.start();
  const from = ctx.nodes.length;
  drive(audio, ctx, state, seconds, 60, still);
  return ctx.made(FakeOscillator, from).length;
}

const M0_EVENTS: GameEvent[] = [
  { type: 'lane', from: 0, to: 1 },
  { type: 'bump', side: 1 },
  { type: 'jump' },
  { type: 'land', hard: false },
  { type: 'land', hard: true },
  { type: 'slide' },
  { type: 'fastFall' },
  { type: 'coin', d: 1, x: 0, y: 1, streak: 3, magnet: false },
  { type: 'stumble', side: -1 },
  { type: 'crash', cause: 'front' },
  { type: 'fall' },
];

describe('GameAudio before start', () => {
  it('does nothing until start(), but remembers mute and pause for it', () => {
    const { audio, ctx, contexts } = setUp();
    audio.setMuted(true);
    audio.setPaused(true);
    for (const event of M0_EVENTS) audio.onEvent(event);
    audio.uiClick('primary');
    audio.update(runState(), 1 / 60);
    audio.resume();
    audio.setHidden(true);
    audio.setHidden(false);
    expect(contexts()).toBe(0);
    expect(ctx.nodes.length).toBe(0);
    expect(audio.state).toBe('none');
    expect(audio.muted).toBe(true);
    audio.start();
    const { out, master } = buses(ctx);
    expect(out.gain.value).toBe(0);
    expect(master.gain.value).toBe(0);
  });

  it('stays silent where Web Audio is missing', () => {
    const audio = new GameAudio(() => null);
    audio.start();
    audio.onEvent({ type: 'jump' });
    audio.update(runState(), 1 / 60);
    audio.uiClick();
    expect(audio.state).toBe('none');
  });
});

describe('GameAudio context', () => {
  it('start() makes one context with the buses at their levels, then only resumes', () => {
    const { audio, ctx, contexts } = setUp();
    audio.start();
    const { out, master } = buses(ctx);
    expect(out.gain.value).toBeCloseTo(OUT_LEVEL, 9);
    expect(master.gain.value).toBe(1);
    expect(ctx.resumes).toBe(1);
    expect(audio.state).toBe('running');
    const built = ctx.nodes.length;
    audio.start();
    expect(contexts()).toBe(1);
    expect(ctx.nodes.length).toBe(built);
    expect(ctx.resumes).toBe(1);
  });

  it('resume() resumes unless running: after the autoplay block and after an iOS interruption, never while hidden', () => {
    const { audio, ctx } = setUp();
    audio.start();
    audio.resume();
    expect(ctx.resumes).toBe(1);
    ctx.state = 'interrupted';
    audio.resume();
    expect(ctx.resumes).toBe(2);
    audio.setHidden(true);
    expect(ctx.suspends).toBe(1);
    audio.resume();
    expect(ctx.resumes).toBe(2);
    audio.setHidden(false);
    expect(ctx.resumes).toBe(3);
    expect(audio.state).toBe('running');
  });

  it('mute and pause schedule a fade only when they change (Safari)', () => {
    const { audio, ctx } = setUp();
    audio.start();
    const { out, master } = buses(ctx);
    audio.setMuted(true);
    audio.setMuted(true);
    expect(out.gain.targets).toEqual([0]);
    audio.muted = false;
    expect(audio.muted).toBe(false);
    expect(out.gain.targets[1]).toBeCloseTo(OUT_LEVEL, 9);
    audio.setPaused(true);
    audio.setPaused(true);
    audio.setPaused(false);
    audio.setPaused(false);
    expect(master.gain.targets).toEqual([0, 1]);
  });
});

describe('GameAudio loops', () => {
  it('steers the wind only when its target changes, even when frames run without a sim step', () => {
    const { audio, ctx } = setUp();
    audio.start();
    const loops = ctx.nodes.slice();
    const state = runState(11, { kind: 'jump', t: 0, fastFall: false });
    drive(audio, ctx, state, 2);
    // The level and the band, once each.
    expect(automation(loops)).toBe(2);
    drive(audio, ctx, state, 2, 120);
    expect(automation(loops)).toBe(2);
    state.v = 26;
    drive(audio, ctx, state, 1);
    expect(automation(loops)).toBe(4);
    state.phase = 'over';
    drive(audio, ctx, state, 1);
    expect(automation(loops)).toBe(6);
    drive(audio, ctx, state, 1);
    expect(automation(loops)).toBe(6);
  });

  it('the wind rises with speed and dies when the run stops', () => {
    const { audio, ctx } = setUp();
    audio.start();
    const level = ctx.made(FakeGain).find((gain) => !gain.outputs.includes(ctx.destination) && gain.gain.value === 0);
    if (!level) throw new Error('no wind level');
    const state = runState(11);
    drive(audio, ctx, state, 0.5);
    state.v = 26;
    drive(audio, ctx, state, 0.5);
    state.phase = 'over';
    drive(audio, ctx, state, 0.5);
    const [slow, fast, stopped] = level.gain.targets;
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(slow);
    expect(stopped).toBe(0);
  });

  it('footsteps follow the speed while the hero runs on the floor', () => {
    // 3.3 steps a second at 11 m/s and 4.8 at 26 m/s, the first half a stride in.
    expect(steps(runState(11), 3)).toBe(10);
    expect(steps(runState(26), 3)).toBe(14);
  });

  it('no footsteps in the air, sliding, before or after the run, or while the run clock stands still', () => {
    expect(steps(runState(20, { kind: 'jump', t: 0, fastFall: false }), 2)).toBe(0);
    expect(steps(runState(20, { kind: 'slide', t: 0 }), 2)).toBe(0);
    expect(steps(runState(20, { kind: 'run' }, 'intro'), 2)).toBe(0);
    expect(steps(runState(20, { kind: 'run' }, 'over'), 2)).toBe(0);
    expect(steps(runState(20), 2, true)).toBe(0);
    const frozen = runState(20);
    frozen.frozen = true;
    expect(steps(frozen, 2)).toBe(0);
  });
});

describe('GameAudio events', () => {
  it('plays every M0 event into the pause bus, each voice stopping after it starts', () => {
    const { audio, ctx } = setUp();
    audio.start();
    const { master } = buses(ctx);
    for (const event of M0_EVENTS) {
      const from = ctx.nodes.length;
      audio.onEvent(event);
      const made = ctx.nodes.slice(from);
      expect(made.length, event.type).toBeGreaterThan(0);
      const sources = made.filter((node): node is FakeSource => node instanceof FakeSource);
      expect(sources.length, event.type).toBeGreaterThan(0);
      for (const source of sources) expect(source.stopAt, event.type).toBeGreaterThan(source.startAt);
      // Each envelope feeds the pause bus, directly or through a panner.
      const ends = made.filter((node) => node.outputs.includes(master) || node instanceof FakePanner);
      expect(ends.length, event.type).toBeGreaterThan(0);
      ctx.currentTime += 1;
    }
  });

  it('silent events build nothing', () => {
    const { audio, ctx } = setUp();
    audio.start();
    const built = ctx.nodes.length;
    const silent: GameEvent[] = [{ type: 'runStart' }, { type: 'tier', tier: 1 }, { type: 'gameOver', cause: 'front' }];
    for (const event of silent) audio.onEvent(event);
    expect(ctx.nodes.length).toBe(built);
  });

  it('pans lane changes the way the hero moves and bumps to their side', () => {
    const { audio, ctx } = setUp();
    audio.start();
    audio.onEvent({ type: 'lane', from: 0, to: -1 });
    audio.onEvent({ type: 'bump', side: 1 });
    expect(ctx.made(FakePanner).map((panner) => panner.pan.value)).toEqual([-0.3, 0.5]);
  });

  it('coins climb the ladder with the streak', () => {
    const { audio, ctx } = setUp();
    audio.start();
    for (let streak = 1; streak <= 9; streak++) {
      const from = ctx.nodes.length;
      audio.onEvent({ type: 'coin', d: streak, x: 0, y: 1, streak, magnet: false });
      const [first] = ctx.made(FakeOscillator, from);
      expect(first.frequency.set[0]).toBeCloseTo(1047 * coinPitch(streak), 6);
      ctx.currentTime += 1;
    }
  });

  it('a burst of coins is spaced out, and what would queue too far ahead is dropped', () => {
    const { audio, ctx } = setUp();
    audio.start();
    ctx.currentTime = 5;
    const from = ctx.nodes.length;
    for (let i = 0; i < 12; i++) audio.onEvent({ type: 'coin', d: i, x: 0, y: 1, streak: 1, magnet: true });
    const spacing = SFX_SPACING.coin;
    if (!spacing) throw new Error('coins are not spaced');
    const starts = ctx
      .made(FakeOscillator, from)
      .filter((osc) => osc.frequency.set[0] === 1047)
      .map((osc) => osc.startAt - 5);
    expect(starts.length).toBeGreaterThan(1);
    expect(starts.length).toBeLessThan(12);
    expect(starts[0]).toBe(0);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(spacing.gap - 1e-9);
    expect(starts[starts.length - 1]).toBeLessThanOrEqual(spacing.maxDelay + 1e-9);
  });

  it('button sounds skip the pause bus, so the pause menu still clicks', () => {
    const { audio, ctx } = setUp();
    audio.start();
    const { out, master } = buses(ctx);
    audio.setPaused(true);
    const from = ctx.nodes.length;
    audio.uiClick('primary');
    const envelopes = ctx.made(FakeGain, from);
    expect(envelopes.length).toBeGreaterThan(0);
    for (const envelope of envelopes) {
      expect(envelope.outputs).toContain(out);
      expect(envelope.outputs).not.toContain(master);
    }
  });
});

/* Background music: stand-in audio elements and a context that can wrap them. */

class FakeElement {
  paused = true;
  currentTime = 0;
  loop = false;
  preload = '';
  plays = 0;

  constructor(readonly file: string) {}

  play(): Promise<void> {
    this.plays++;
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }
}

class FakeMusicContext extends FakeContext {
  readonly sources = new Map<FakeElement, FakeNode>();

  createMediaElementSource(element: FakeElement): FakeNode {
    const node = new FakeNode();
    this.sources.set(element, node);
    return node;
  }
}

function setUpMusic(): { audio: GameAudio; ctx: FakeMusicContext; elements: FakeElement[] } {
  const ctx = new FakeMusicContext();
  const elements: FakeElement[] = [];
  const audio = new GameAudio(
    () => ctx as unknown as AudioContext,
    (file) => {
      const element = new FakeElement(file);
      elements.push(element);
      return element as unknown as HTMLAudioElement;
    },
  );
  return { audio, ctx, elements };
}

/** The level gain a music element plays through. */
function trackGain(ctx: FakeMusicContext, element: FakeElement): FakeGain {
  const gain = ctx.sources.get(element)?.outputs[0];
  if (!(gain instanceof FakeGain)) throw new Error('no track gain');
  return gain;
}

describe('GameAudio music', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('remembers the track before start and plays it, looped, on start', () => {
    const { audio, ctx, elements } = setUpMusic();
    audio.setMusic('menu');
    expect(elements).toHaveLength(0);
    audio.start();
    expect(elements.map((e) => e.file)).toEqual([MUSIC_FILES.menu]);
    const [menu] = elements;
    expect(menu.loop).toBe(true);
    expect(menu.paused).toBe(false);
    expect(trackGain(ctx, menu).gain.targets.at(-1)).toBe(1);
  });

  it('routes the music through the mute bus, not the pause bus', () => {
    const { audio, ctx, elements } = setUpMusic();
    audio.setMusic('menu');
    audio.start();
    const { out, master } = buses(ctx);
    const bus = trackGain(ctx, elements[0]).outputs[0];
    expect(bus.outputs).toContain(out);
    expect(bus.outputs).not.toContain(master);
  });

  it('cross-fades between tracks and stops and rewinds the old one later', () => {
    vi.useFakeTimers();
    const { audio, ctx, elements } = setUpMusic();
    audio.setMusic('menu');
    audio.start();
    audio.setMusic('run');
    const [menu, run] = elements;
    expect(run.file).toBe(MUSIC_FILES.run);
    expect(run.paused).toBe(false);
    expect(trackGain(ctx, run).gain.targets.at(-1)).toBe(1);
    expect(trackGain(ctx, menu).gain.targets.at(-1)).toBe(0);
    menu.currentTime = 30;
    expect(menu.paused).toBe(false);
    vi.advanceTimersByTime(MUSIC.stopAfter * 1000);
    expect(menu.paused).toBe(true);
    expect(menu.currentTime).toBe(0);
  });

  it('keeps a track playing when it is wanted again before it stops', () => {
    vi.useFakeTimers();
    const { audio, elements } = setUpMusic();
    audio.setMusic('menu');
    audio.start();
    audio.setMusic('run');
    audio.setMusic('menu');
    vi.advanceTimersByTime(MUSIC.stopAfter * 1000);
    expect(elements[0].paused).toBe(false);
    expect(elements).toHaveLength(2);
  });

  it('ducks the music while paused', () => {
    const { audio, ctx, elements } = setUpMusic();
    audio.setMusic('run');
    audio.start();
    const bus = trackGain(ctx, elements[0]).outputs[0] as FakeGain;
    expect(bus.gain.value).toBeCloseTo(MUSIC.level);
    audio.setPaused(true);
    expect(bus.gain.targets.at(-1)).toBeCloseTo(MUSIC.level * MUSIC.paused);
    audio.setPaused(false);
    expect(bus.gain.targets.at(-1)).toBeCloseTo(MUSIC.level);
  });

  it('pauses the music while the tab is hidden and plays it again when shown', () => {
    const { audio, elements } = setUpMusic();
    audio.setMusic('menu');
    audio.start();
    audio.setHidden(true);
    expect(elements[0].paused).toBe(true);
    audio.setHidden(false);
    expect(elements[0].paused).toBe(false);
  });

  it('plays no music where the context cannot wrap audio elements', () => {
    const ctx = new FakeContext();
    let made = 0;
    const audio = new GameAudio(() => ctx as unknown as AudioContext, () => {
      made++;
      return null;
    });
    audio.setMusic('menu');
    audio.start();
    audio.setMusic('run');
    expect(made).toBe(0);
    expect(audio.musicTrack).toBe('run');
  });
});
