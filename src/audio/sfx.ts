import type { GameEvent } from '../game/types';

/*
 * Sound design as data. Every sound is a recipe of voices that GameAudio (audio.ts) synthesises when it plays, so
 * audio adds nothing to the download. Frequencies are Hz, times seconds, levels peak gains before the output bus.
 * These are presentation constants, like a view's colours, so they live here rather than in balance.ts.
 */

/** A tone: an oscillator gliding from `freq` to `to`, through a low-pass at `cutoff` when given. */
export interface ToneVoice {
  readonly src: 'sine' | 'triangle' | 'square' | 'sawtooth';
  /** Start pitch, Hz. */
  readonly freq: number;
  /** End pitch, Hz, reached by an exponential glide over the voice. Absent: no glide. */
  readonly to?: number;
  /** Low-pass cutoff, Hz, to soften a buzzy wave. Moves with the sound's pitch. */
  readonly cutoff?: number;
  /** From the start of the attack to silence, s. */
  readonly seconds: number;
  /** Peak gain. */
  readonly level: number;
  /** Start this long after the sound starts, s. */
  readonly delay?: number;
  /** Rise to the peak, s (default 5 ms, at most half the voice). */
  readonly attack?: number;
}

/** A noise: the shared white noise through a `filter` whose frequency glides from `freq` to `to`. Other fields as ToneVoice. */
export interface NoiseVoice {
  readonly src: 'noise';
  readonly filter: 'lowpass' | 'highpass' | 'bandpass';
  /** Filter Q (default: the filter's own). */
  readonly q?: number;
  readonly freq: number;
  readonly to?: number;
  readonly seconds: number;
  readonly level: number;
  readonly delay?: number;
  readonly attack?: number;
}

/** One layer of a sound. */
export type SfxVoice = ToneVoice | NoiseVoice;
/** A sound: voices that start together (each with its own delay). */
export type SfxRecipe = readonly SfxVoice[];

/** A sound to play: a recipe transposed by `pitch` (a frequency ratio), scaled by `gain`, panned by `pan` (−1 to 1). */
export interface SfxPlay {
  readonly recipe: SfxRecipe;
  readonly pitch?: number;
  readonly gain?: number;
  readonly pan?: number;
}

/** Gives one GameEvent type its sound: always the same, picked from the event (variant, pitch, side), or null for silence. */
export type SfxEntry<T extends GameEvent['type']> = SfxPlay | ((event: Extract<GameEvent, { type: T }>) => SfxPlay | null) | null;

/** The output level with the sound on (the mute bus). */
export const OUT_LEVEL = 0.8;

/** A background music track: 'menu' plays on the menu and results screens, 'run' during a run. */
export type MusicTrack = 'menu' | 'run';

/** The music files, under the site's `assets/music/` folder. */
export const MUSIC_FILES: Readonly<Record<MusicTrack, string>> = {
  menu: 'main-menu.mp3',
  run: 'highway-jumpers.mp3',
};

/**
 * Background music: `level` is the music bus gain under the mute bus, `paused` the share of it kept while the run
 * is paused, and `fade` the time constant of the cross-fade between tracks, s. A track that fades out stops
 * playing `stopAfter` s later.
 */
export const MUSIC = { level: 0.45, paused: 0.35, fade: 0.4, stopAfter: 2 } as const;

/**
 * Wind: the noise through a band-pass that opens up with speed. `level` is the gain at top speed (it grows with
 * the square of the speed), the band centre runs from `freqLow` (standing) to `freqHigh` (top speed), Hz, with
 * filter `q`; `tau` is the smoothing time constant, s.
 */
export const WIND = { level: 0.1, freqLow: 380, freqHigh: 1500, q: 0.7, tau: 0.25 } as const;

/**
 * Footsteps while running on the floor: steps per second = base + perMps × speed (m/s), so 3.3 a second at the
 * start speed and 4.8 at top speed. The first step comes `first` of a stride after the feet touch down.
 */
export const STEPS = { base: 2.2, perMps: 0.1, first: 0.5 } as const;

/** One footstep: a scuff and a low thud. */
const STEP: SfxRecipe = [
  { src: 'noise', filter: 'lowpass', freq: 1500, to: 600, seconds: 0.05, level: 0.1, attack: 0.002 },
  { src: 'sine', freq: 100, to: 55, seconds: 0.06, level: 0.12, attack: 0.002 },
];

/** Left foot, right foot: the same step a little apart in pitch and weight, so the run gallops instead of ticking. */
export const FOOTSTEPS: readonly [SfxPlay, SfxPlay] = [{ recipe: STEP }, { recipe: STEP, pitch: 1.08, gain: 0.85 }];

/**
 * Sounds that come in bursts (a magnet sweeping up a line of coins) play at least `gap` s apart, queue up to
 * `maxDelay` s ahead, and are dropped past that.
 */
export const SFX_SPACING: Readonly<Partial<Record<GameEvent['type'], { readonly gap: number; readonly maxDelay: number }>>> = {
  coin: { gap: 0.03, maxDelay: 0.24 },
};

/** Lane change: a quick rising whoosh. */
const LANE: SfxRecipe = [
  { src: 'noise', filter: 'bandpass', q: 1.2, freq: 600, to: 2000, seconds: 0.15, level: 0.22, attack: 0.035 },
];

/** Pressing outward from the outer lane with no wall to take it: a dull thud. */
const BUMP: SfxRecipe = [
  { src: 'sine', freq: 160, to: 70, seconds: 0.14, level: 0.32, attack: 0.004 },
  { src: 'noise', filter: 'lowpass', freq: 500, to: 250, seconds: 0.08, level: 0.22, attack: 0.003 },
];

/** Jump: a rising "hup" over a puff of air. */
const JUMP: SfxRecipe = [
  { src: 'triangle', freq: 300, to: 620, seconds: 0.12, level: 0.12, attack: 0.008 },
  { src: 'noise', filter: 'bandpass', q: 1, freq: 800, to: 2400, seconds: 0.16, level: 0.12, attack: 0.02 },
];

/** Landing: a soft thump. */
const LAND: SfxRecipe = [
  { src: 'noise', filter: 'lowpass', freq: 800, to: 300, seconds: 0.09, level: 0.24, attack: 0.003 },
  { src: 'sine', freq: 120, to: 60, seconds: 0.08, level: 0.2, attack: 0.003 },
];

/** A hard landing (out of a fast fall or a long drop): heavier, lower, with grit. */
const LAND_HARD: SfxRecipe = [
  { src: 'noise', filter: 'lowpass', freq: 1000, to: 260, seconds: 0.18, level: 0.42, attack: 0.003 },
  { src: 'sine', freq: 110, to: 42, seconds: 0.2, level: 0.38, attack: 0.003 },
  { src: 'noise', filter: 'bandpass', q: 0.9, freq: 2600, to: 1400, seconds: 0.06, level: 0.12, attack: 0.002 },
];

/** Slide: a scrape that falls away as the hero drops into it. */
const SLIDE: SfxRecipe = [
  { src: 'noise', filter: 'bandpass', q: 1.3, freq: 2600, to: 900, seconds: 0.38, level: 0.17, attack: 0.02 },
  { src: 'noise', filter: 'lowpass', freq: 450, seconds: 0.28, level: 0.12, attack: 0.01 },
];

/** Fast fall (down in the air): a diving whoosh. */
const FAST_FALL: SfxRecipe = [
  { src: 'noise', filter: 'bandpass', q: 1.1, freq: 2600, to: 480, seconds: 0.22, level: 0.22, attack: 0.01 },
  { src: 'sine', freq: 950, to: 240, seconds: 0.18, level: 0.07 },
];

/** Coin: a bright two-note chime (C6 then G6, with a sparkle an octave up). */
const COIN: SfxRecipe = [
  { src: 'triangle', freq: 1047, seconds: 0.07, level: 0.1, attack: 0.003 },
  { src: 'triangle', freq: 1568, seconds: 0.2, level: 0.11, delay: 0.055, attack: 0.003 },
  { src: 'sine', freq: 3136, seconds: 0.1, level: 0.025, delay: 0.055, attack: 0.003 },
];

/** Stumble (clipping an obstacle while changing lanes): a comic "oof" and a knock. */
const STUMBLE: SfxRecipe = [
  { src: 'sawtooth', freq: 280, to: 140, cutoff: 1000, seconds: 0.2, level: 0.12, attack: 0.01 },
  { src: 'sine', freq: 130, to: 55, seconds: 0.16, level: 0.3, attack: 0.003 },
  { src: 'noise', filter: 'lowpass', freq: 700, to: 300, seconds: 0.1, level: 0.2, attack: 0.003 },
];

/** Crash: a heavy smack, a clatter and a low boom. */
const CRASH: SfxRecipe = [
  { src: 'noise', filter: 'lowpass', freq: 600, to: 180, seconds: 0.75, level: 0.55, attack: 0.003 },
  { src: 'noise', filter: 'lowpass', freq: 3000, to: 1200, seconds: 0.25, level: 0.25, attack: 0.002 },
  { src: 'sine', freq: 95, to: 34, seconds: 0.5, level: 0.45, attack: 0.003 },
];

/** Fall (off the track): a cartoon whistle dropping away over rushing air, about as long as the fall. */
const FALL: SfxRecipe = [
  { src: 'sine', freq: 1300, to: 220, seconds: 0.95, level: 0.09, attack: 0.02 },
  { src: 'noise', filter: 'bandpass', q: 0.8, freq: 1400, to: 300, seconds: 0.95, level: 0.14, attack: 0.05 },
];

/** The coin chime climbs a major scale with the streak (semitones above the base note), then holds at the octave. */
const COIN_LADDER = [0, 2, 4, 5, 7, 9, 11, 12] as const;
/** Coins pulled in by the magnet come in crowds, so each is a little quieter. */
const MAGNET_COIN_GAIN = 0.8;

/** The step on the coin ladder for a streak: streak 1 (or less) is the base note, the top holds from then on. */
function coinStep(streak: number): number {
  if (!Number.isFinite(streak)) return 0;
  return Math.min(Math.max(Math.floor(streak) - 1, 0), COIN_LADDER.length - 1);
}

/** The coin chime's pitch for a streak, as a frequency ratio: 1 for streak 1, rising to 2 (an octave). */
export function coinPitch(streak: number): number {
  return 2 ** (COIN_LADDER[coinStep(streak)] / 12);
}

/** Every coin sound, built once: [plain, magnet][ladder step]. */
const COIN_PLAYS: readonly (readonly SfxPlay[])[] = [1, MAGNET_COIN_GAIN].map((gain) =>
  COIN_LADDER.map((semitones) => ({ recipe: COIN, pitch: 2 ** (semitones / 12), gain })),
);

/** A sound for each side, built once: [left, right], panned by `pan` towards the side. */
function sided(recipe: SfxRecipe, pan: number): readonly [SfxPlay, SfxPlay] {
  return [
    { recipe, pan: -pan },
    { recipe, pan },
  ];
}

/** Which of a sided pair: 0 for the left, 1 for the right. */
function sideIndex(side: number): 0 | 1 {
  return side < 0 ? 0 : 1;
}

/** Lane changes lean the way the hero moves; bumps and stumbles come from their side. */
const LANE_PLAYS = sided(LANE, 0.3);
const BUMP_PLAYS = sided(BUMP, 0.5);
const STUMBLE_PLAYS = sided(STUMBLE, 0.4);
const LAND_PLAY: SfxPlay = { recipe: LAND };
const LAND_HARD_PLAY: SfxPlay = { recipe: LAND_HARD };

/**
 * Every GameEvent type and its sound. The M0 set is here: lane, bump, jump, land (soft and hard), slide, fast
 * fall, coin (up the ladder with the streak), stumble, crash and fall; buttons are UI_SFX. The silent entries are
 * WP-35's to fill, with the wall-run grind and the power-up loops. The type lists every event, so a new GameEvent
 * type does not compile until it is given an entry here.
 */
export const SFX: { readonly [T in GameEvent['type']]: SfxEntry<T> } = {
  runStart: null,
  lane: (e) => LANE_PLAYS[sideIndex(e.to - e.from)],
  bump: (e) => BUMP_PLAYS[sideIndex(e.side)],
  jump: { recipe: JUMP },
  land: (e) => (e.hard ? LAND_HARD_PLAY : LAND_PLAY),
  slide: { recipe: SLIDE },
  fastFall: { recipe: FAST_FALL },
  stumble: (e) => STUMBLE_PLAYS[sideIndex(e.side)],
  wallAttach: null,
  wallBand: null,
  wallSlip: null,
  wallJump: null,
  wallExit: null,
  coin: (e) => COIN_PLAYS[e.magnet ? 1 : 0][coinStep(e.streak)],
  pickup: null,
  powerUpEnd: null,
  shieldBreak: null,
  glideSave: null,
  thiefDemo: null,
  thiefDrop: null,
  thiefTaunt: null,
  tier: null,
  district: null,
  milestone: null,
  newBest: null,
  tip: null,
  crash: { recipe: CRASH },
  fall: { recipe: FALL },
  gameOver: null,
};

/** The sound for one event, or null for silence. */
export function soundFor(event: GameEvent): SfxPlay | null {
  const entry = SFX[event.type];
  // Each entry takes its own event type, which TypeScript cannot follow through the lookup by event.type.
  return typeof entry === 'function' ? (entry as (event: GameEvent) => SfxPlay | null)(event) : entry;
}

/** Button sounds: `primary` (play, retry), `normal`, `back` (close, back) and `hover` (a pointer over a button). */
export type UiSound = 'primary' | 'normal' | 'back' | 'hover';

/** A tiny bright tick on top of a button press. */
const TICK: ToneVoice = { src: 'triangle', freq: 3200, to: 3000, seconds: 0.012, level: 0.03, attack: 0.002 };

/** Button sounds, bubbly pops (Rail in the Air's): primary pops up and brighter, back drops down. */
export const UI_SFX: Readonly<Record<UiSound, SfxPlay>> = {
  primary: {
    recipe: [
      { src: 'sine', freq: 620, to: 1240, seconds: 0.09, level: 0.14 },
      { src: 'triangle', freq: 1240, to: 1860, seconds: 0.08, level: 0.06, delay: 0.05 },
      TICK,
    ],
  },
  normal: { recipe: [{ src: 'sine', freq: 900, to: 600, seconds: 0.07, level: 0.12 }, TICK] },
  back: { recipe: [{ src: 'sine', freq: 760, to: 380, seconds: 0.1, level: 0.12 }, TICK] },
  hover: { recipe: [{ src: 'sine', freq: 2100, to: 1900, seconds: 0.035, level: 0.03 }] },
};
