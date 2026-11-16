import { SPEED } from '../balance';
import type { GameEvent, RunState } from '../game/types';
import { FOOTSTEPS, MUSIC, MUSIC_FILES, OUT_LEVEL, SFX_SPACING, soundFor, STEPS, UI_SFX, WIND } from './sfx';
import type { MusicTrack, SfxPlay, SfxVoice, UiSound } from './sfx';

/** Seconds of white noise in the buffer every noise voice and loop plays from. */
const NOISE_SECONDS = 2;
/** Exponential ramps cannot reach zero: this counts as silence. */
const SILENT = 0.0001;
/** A voice's attack when its recipe gives none, s. */
const ATTACK = 0.005;
/** Sources stop this long after their envelope reaches silence, s. */
const STOP_PAD = 0.02;
/** Time constant of the mute and pause fades, s. */
const FADE_TAU = 0.02;
/** update() only reschedules a gain when its target moves by this much, and a frequency by this many Hz. */
const GAIN_STEP = 0.002;
const FREQ_STEP = 10;
/** The mute and pause levels are switches: any change at all reschedules them. */
const SWITCH_STEP = 0.001;
/**
 * The run counts as moving while its clock advanced this recently, real seconds. On a 120 Hz screen every other
 * frame runs no 60 Hz step, so a single still frame must not stop the wind.
 */
const STILL_AFTER = 0.15;
/** One update counts at most this much run time towards footsteps, s: a reset or a long hitch is not a burst. */
const MAX_ADVANCE = 0.25;
/** The top of the speed curve, m/s: the wind's full-speed reference. */
const TOP_SPEED = SPEED.start + SPEED.gain;

/** Swallows the rejection of a resume() or suspend() the browser refuses: the next gesture tries again. */
function ignore(): void {}

/** The page's AudioContext (webkitAudioContext on old Safari), or null where Web Audio is missing or refused. */
function browserContext(): AudioContext | null {
  const scope = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Context) return null;
  try {
    return new Context();
  } catch {
    return null;
  }
}

/** A streaming audio element for a music file (`file` under assets/music/), or null where there is none (Node). */
function browserMusic(file: string): HTMLAudioElement | null {
  if (typeof Audio !== 'function') return null;
  return new Audio(`${import.meta.env.BASE_URL}assets/music/${file}`);
}

/** One music track: its streaming element, its cross-fade level, and the timer that stops it after a fade-out. */
interface MusicPlayer {
  readonly element: HTMLAudioElement;
  readonly level: Steered;
  stopTimer: ReturnType<typeof setTimeout> | null;
}

/** `seconds` of white noise. */
function makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Sets `param` to `from` at `start` and glides it exponentially to `to` by `end`. */
function glide(param: AudioParam, from: number, to: number, start: number, end: number): void {
  param.setValueAtTime(from, start);
  if (to !== from) param.exponentialRampToValueAtTime(to, end);
}

/**
 * An AudioParam steered towards a target. A new target is scheduled only when it moves by a whole `step`: Safari
 * slows down as automation events pile up, so nothing is scheduled while the target holds still.
 */
class Steered {
  private readonly param: AudioParam;
  private readonly tau: number;
  private readonly step: number;
  private target: number;

  /** Starts `param` at `value` (rounded to the step) without scheduling anything. */
  constructor(param: AudioParam, value: number, tau: number, step: number) {
    this.param = param;
    this.tau = tau;
    this.step = step;
    this.target = this.round(value);
    param.value = this.target;
  }

  /** Aims at `value`, rounded to the step, from `now`, if that is a new target. */
  set(value: number, now: number): void {
    const target = this.round(value);
    if (target === this.target) return;
    this.target = target;
    this.param.setTargetAtTime(target, now, this.tau);
  }

  private round(value: number): number {
    return Math.round(value / this.step) * this.step;
  }
}

/**
 * All game sound, synthesised (Rail in the Air's GameAudio): two buses, a shared noise buffer, one-shot voices
 * from the recipes in sfx.ts, and loops that follow the run.
 *
 * - `out` is the mute bus and feeds the speakers; `master` carries every game sound into it and is silenced while
 *   paused. Button sounds (uiClick) skip `master`, so the pause menu still clicks.
 * - The AudioContext is made on the first user gesture (start) and resumed on every gesture unless it is running
 *   (resume): browsers block audio until a gesture, and iOS 'interrupts' it after a call or another app's sound.
 *   It is suspended while the tab is hidden (setHidden).
 * - update() runs the loops: wind that rises with speed, and footsteps at a cadence set by speed.
 * - Background music (setMusic) streams from audio elements through its own `music` bus into `out`, so mute
 *   silences it; tracks cross-fade, and the music ducks while paused. Elements are made on demand after start(),
 *   so the files are not part of the first load.
 *
 * Every method is safe to call before start() (and where Web Audio is missing): it does nothing, but mute and
 * pause are remembered and applied when the context is made.
 */
export class GameAudio {
  private readonly makeContext: () => AudioContext | null;
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private outLevel: Steered | null = null;
  private masterLevel: Steered | null = null;
  private windLevel: Steered | null = null;
  private windBand: Steered | null = null;
  private isMuted = false;
  private paused = false;
  private hidden = false;
  /** The run clock at the last update, s, and real seconds since it last moved. */
  private runTime = 0;
  private stillFor = Infinity;
  /** Progress of the stride towards the next footstep (0-1), and the foot that steps next. */
  private stride: number = STEPS.first;
  private foot: 0 | 1 = 0;
  /** When each spaced sound (SFX_SPACING) may next start, context seconds. */
  private readonly nextAt = new Map<GameEvent['type'], number>();
  private readonly makeMusic: (file: string) => HTMLAudioElement | null;
  private musicLevel: Steered | null = null;
  private music: GainNode | null = null;
  /** The track that should be playing, remembered before start(). */
  private wantedMusic: MusicTrack | null = null;
  private readonly players = new Map<MusicTrack, MusicPlayer>();

  /**
   * `makeContext` builds the AudioContext on start() and `makeMusic` a music file's audio element; tests pass
   * stand-ins.
   */
  constructor(
    makeContext: () => AudioContext | null = browserContext,
    makeMusic: (file: string) => HTMLAudioElement | null = browserMusic,
  ) {
    this.makeContext = makeContext;
    this.makeMusic = makeMusic;
  }

  /** The background music track asked for, or null for none. */
  get musicTrack(): MusicTrack | null {
    return this.wantedMusic;
  }

  /** Cross-fades to `track` (null fades the music out). Remembered before start(). */
  setMusic(track: MusicTrack | null): void {
    if (track === this.wantedMusic) return;
    this.wantedMusic = track;
    this.applyMusic();
  }

  /** True while the sound is off. Setting it is setMuted. */
  get muted(): boolean {
    return this.isMuted;
  }

  set muted(muted: boolean) {
    this.setMuted(muted);
  }

  /** The AudioContext's state ('running', 'suspended', 'interrupted' on iOS, 'closed'), or 'none' before start(). */
  get state(): string {
    return this.ctx ? this.ctx.state : 'none';
  }

  /** Makes the AudioContext, the buses and the loops. Call from the first user gesture; after that it only resumes. */
  start(): void {
    if (this.ctx) {
      this.resume();
      return;
    }
    const ctx = this.makeContext();
    if (!ctx) return;
    this.ctx = ctx;
    const out = ctx.createGain();
    this.outLevel = new Steered(out.gain, this.isMuted ? 0 : OUT_LEVEL, FADE_TAU, SWITCH_STEP);
    out.connect(ctx.destination);
    const master = ctx.createGain();
    this.masterLevel = new Steered(master.gain, this.paused ? 0 : 1, FADE_TAU, SWITCH_STEP);
    master.connect(out);
    this.out = out;
    this.master = master;
    this.noise = makeNoise(ctx, NOISE_SECONDS);

    // Wind: the noise through a band-pass that opens with speed; silent until update() sees the run moving.
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = WIND.q;
    this.windBand = new Steered(band.frequency, WIND.freqLow, WIND.tau, FREQ_STEP);
    const level = ctx.createGain();
    this.windLevel = new Steered(level.gain, 0, WIND.tau, GAIN_STEP);
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    wind.connect(band).connect(level).connect(master);
    wind.start();

    const music = ctx.createGain();
    this.musicLevel = new Steered(music.gain, this.musicTarget(), FADE_TAU, SWITCH_STEP);
    music.connect(out);
    this.music = music;
    this.applyMusic();
    this.resume();
  }

  /**
   * Resumes the context unless it is already running: it is blocked until a gesture, and iOS 'interrupts' it.
   * Call on every gesture.
   */
  resume(): void {
    const ctx = this.ctx;
    if (!ctx || this.hidden) return;
    // A play() the browser refused (no gesture yet) is tried again on every gesture.
    this.playWanted();
    if (ctx.state === 'running') return;
    ctx.resume().catch(ignore);
  }

  /** Turns all sound off or on, buttons included. Remembered before start(). */
  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.ctx) this.outLevel?.set(muted ? 0 : OUT_LEVEL, this.ctx.currentTime);
  }

  /** Quiet while paused or frozen: every game sound fades out; button sounds still play. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!this.ctx) return;
    this.masterLevel?.set(paused ? 0 : 1, this.ctx.currentTime);
    this.musicLevel?.set(this.musicTarget(), this.ctx.currentTime);
  }

  /** Suspends the context while the tab is hidden (no sound, no processing) and resumes it when shown. */
  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    const ctx = this.ctx;
    if (!ctx) return;
    if (hidden) {
      // The elements would keep streaming (and advancing) into a suspended graph.
      for (const player of this.players.values()) player.element.pause();
      ctx.suspend().catch(ignore);
    } else {
      this.resume();
    }
  }

  /** Plays the sound for one event (the table in sfx.ts). Bursts of one sound are spaced out (SFX_SPACING). */
  onEvent(event: GameEvent): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const sound = soundFor(event);
    if (!sound) return;
    let delay = 0;
    const spacing = SFX_SPACING[event.type];
    if (spacing) {
      const now = ctx.currentTime;
      delay = Math.max(0, (this.nextAt.get(event.type) ?? 0) - now);
      if (delay > spacing.maxDelay) return;
      this.nextAt.set(event.type, now + delay + spacing.gap);
    }
    this.play(ctx, sound, master, delay);
  }

  /** A button sound. It skips the pause bus, so the pause menu still clicks. */
  uiClick(kind: UiSound = 'normal'): void {
    if (this.ctx && this.out) this.play(this.ctx, UI_SFX[kind], this.out, 0);
  }

  /**
   * Steers the loops from the run, once per frame: wind rises with speed, and footsteps follow the speed while the
   * hero runs on the floor. Both go by the run's own clock, so they stop when the run pauses or freezes, follow
   * ?speed, and never run on menus. `dt` is the frame time, s.
   */
  update(state: RunState, dt: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const advanced = Math.min(Math.max(state.time - this.runTime, 0), MAX_ADVANCE);
    this.runTime = state.time;
    this.stillFor = advanced > 0 ? 0 : this.stillFor + dt;
    const moving = state.phase === 'running' && !state.frozen && this.stillFor < STILL_AFTER;
    const now = ctx.currentTime;
    const speed = moving ? Math.min(Math.max(state.v / TOP_SPEED, 0), 1) : 0;
    this.windLevel?.set(WIND.level * speed * speed, now);
    this.windBand?.set(WIND.freqLow + (WIND.freqHigh - WIND.freqLow) * speed, now);
    if (moving && state.player.mode.kind === 'run') {
      this.stride += advanced * (STEPS.base + STEPS.perMps * state.v);
      if (this.stride >= 1) {
        this.stride -= Math.floor(this.stride);
        this.play(ctx, FOOTSTEPS[this.foot], master, 0);
        this.foot = this.foot === 0 ? 1 : 0;
      }
    } else {
      this.stride = STEPS.first;
    }
  }

  /** The music bus level: ducked while paused. */
  private musicTarget(): number {
    return this.paused ? MUSIC.level * MUSIC.paused : MUSIC.level;
  }

  /**
   * Fades the wanted track in (from the start if it had stopped) and every other track out; a faded-out track
   * stops and rewinds MUSIC.stopAfter s later, unless it is wanted again first.
   */
  private applyMusic(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (this.wantedMusic) this.musicPlayer(this.wantedMusic);
    for (const [track, player] of this.players) {
      if (track === this.wantedMusic) {
        if (player.stopTimer !== null) clearTimeout(player.stopTimer);
        player.stopTimer = null;
        player.level.set(1, now);
      } else {
        player.level.set(0, now);
        if (player.stopTimer === null && !player.element.paused) {
          player.stopTimer = setTimeout(() => {
            player.stopTimer = null;
            player.element.pause();
            player.element.currentTime = 0;
          }, MUSIC.stopAfter * 1000);
        }
      }
    }
    if (!this.hidden) this.playWanted();
  }

  /** The player for `track`, made on first use; null where audio elements or MediaElementSource are missing. */
  private musicPlayer(track: MusicTrack): MusicPlayer | null {
    const existing = this.players.get(track);
    if (existing) return existing;
    const ctx = this.ctx;
    const bus = this.music;
    if (!ctx || !bus || typeof ctx.createMediaElementSource !== 'function') return null;
    const element = this.makeMusic(MUSIC_FILES[track]);
    if (!element) return null;
    element.loop = true;
    element.preload = 'auto';
    const gain = ctx.createGain();
    const player: MusicPlayer = { element, level: new Steered(gain.gain, 0, MUSIC.fade, GAIN_STEP), stopTimer: null };
    ctx.createMediaElementSource(element).connect(gain).connect(bus);
    this.players.set(track, player);
    return player;
  }

  /** Starts the wanted track's element if it is not playing. A refused play() waits for the next gesture. */
  private playWanted(): void {
    const player = this.wantedMusic ? this.players.get(this.wantedMusic) : undefined;
    if (!player || !player.element.paused) return;
    const playing = player.element.play();
    // Old browsers return nothing from play().
    if (playing) playing.catch(ignore);
  }

  /** Plays a sound into `bus`, `delay` s from now. */
  private play(ctx: AudioContext, sound: SfxPlay, bus: AudioNode, delay: number): void {
    const at = ctx.currentTime + delay;
    let dest = bus;
    const pan = sound.pan ?? 0;
    // Old Safari has no StereoPannerNode: the sound plays centred.
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.min(Math.max(pan, -1), 1);
      panner.connect(bus);
      dest = panner;
    }
    const pitch = sound.pitch ?? 1;
    const gain = sound.gain ?? 1;
    for (const voice of sound.recipe) this.voice(ctx, voice, at, pitch, gain, dest);
  }

  /** One voice: a source (an oscillator, or the noise through a filter) into its own envelope, then `dest`. */
  private voice(ctx: AudioContext, v: SfxVoice, at: number, pitch: number, gain: number, dest: AudioNode): void {
    const start = at + (v.delay ?? 0);
    const end = start + v.seconds;
    const peak = start + Math.min(v.attack ?? ATTACK, v.seconds / 2);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(SILENT, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(v.level * gain, SILENT), peak);
    envelope.gain.exponentialRampToValueAtTime(SILENT, end);
    envelope.connect(dest);
    const from = v.freq * pitch;
    const to = (v.to ?? v.freq) * pitch;
    let source: AudioScheduledSourceNode;
    if (v.src === 'noise') {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noise;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = v.filter;
      if (v.q !== undefined) filter.Q.value = v.q;
      glide(filter.frequency, from, to, start, end);
      noise.connect(filter).connect(envelope);
      // A different stretch of the noise each time, so repeats never sound identical.
      noise.start(start, Math.random() * NOISE_SECONDS * 0.5);
      source = noise;
    } else {
      const osc = ctx.createOscillator();
      osc.type = v.src;
      glide(osc.frequency, from, to, start, end);
      if (v.cutoff !== undefined) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = v.cutoff * pitch;
        osc.connect(filter).connect(envelope);
      } else {
        osc.connect(envelope);
      }
      osc.start(start);
      source = osc;
    }
    source.stop(end + STOP_PAD);
  }
}
