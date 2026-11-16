import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../game/types';
import { coinPitch, FOOTSTEPS, SFX, soundFor, UI_SFX, type SfxPlay } from './sfx';

/** Every GameEvent type. Typed as a Record, so tsc fails here too when the contract gains a type. */
const EVERY_EVENT: Record<GameEvent['type'], true> = {
  runStart: true,
  lane: true,
  bump: true,
  jump: true,
  land: true,
  slide: true,
  fastFall: true,
  stumble: true,
  wallAttach: true,
  wallBand: true,
  wallSlip: true,
  wallJump: true,
  wallExit: true,
  coin: true,
  pickup: true,
  powerUpEnd: true,
  shieldBreak: true,
  glideSave: true,
  thiefDemo: true,
  thiefDrop: true,
  thiefTaunt: true,
  tier: true,
  district: true,
  milestone: true,
  newBest: true,
  tip: true,
  crash: true,
  fall: true,
  gameOver: true,
};

/** At least one event of every type, with both variants where the sound depends on the event. */
const SAMPLES: GameEvent[] = [
  { type: 'runStart' },
  { type: 'lane', from: 0, to: -1 },
  { type: 'lane', from: -1, to: 0 },
  { type: 'bump', side: -1 },
  { type: 'bump', side: 1 },
  { type: 'jump' },
  { type: 'land', hard: false },
  { type: 'land', hard: true },
  { type: 'slide' },
  { type: 'fastFall' },
  { type: 'stumble', side: -1 },
  { type: 'stumble', side: 1 },
  { type: 'wallAttach', side: -1, band: 'high' },
  { type: 'wallBand', band: 'low' },
  { type: 'wallSlip' },
  { type: 'wallJump', from: -1, to: 'wall' },
  { type: 'wallExit', side: 1 },
  { type: 'coin', d: 10, x: 0, y: 1, streak: 1, magnet: false },
  { type: 'coin', d: 12, x: 0, y: 1, streak: 30, magnet: true },
  { type: 'pickup', kind: 'magnet' },
  { type: 'powerUpEnd', kind: 'shield' },
  { type: 'shieldBreak', boxId: 3 },
  { type: 'glideSave' },
  { type: 'thiefDemo', act: 'wall' },
  { type: 'thiefDrop' },
  { type: 'thiefTaunt' },
  { type: 'tier', tier: 2 },
  { type: 'district', district: 'subway' },
  { type: 'milestone', metres: 500 },
  { type: 'newBest' },
  { type: 'tip', id: 'lanes', on: true },
  { type: 'crash', cause: 'front' },
  { type: 'fall' },
  { type: 'gameOver', cause: 'fall' },
];

/** The M0 sounds WP-03 owes. */
const M0: GameEvent['type'][] = ['lane', 'bump', 'jump', 'land', 'slide', 'fastFall', 'coin', 'stumble', 'crash', 'fall'];

/** Checks that Web Audio can play `sound`: positive frequencies under 20 kHz, positive lengths, sane levels. */
function expectPlayable(sound: SfxPlay, label: string): void {
  const pitch = sound.pitch ?? 1;
  expect(pitch, label).toBeGreaterThan(0);
  expect(sound.gain ?? 1, label).toBeGreaterThan(0);
  expect(Math.abs(sound.pan ?? 0), label).toBeLessThanOrEqual(1);
  expect(sound.recipe.length, label).toBeGreaterThan(0);
  for (const voice of sound.recipe) {
    const frequencies = [voice.freq, voice.to ?? voice.freq];
    if (voice.src !== 'noise' && voice.cutoff !== undefined) frequencies.push(voice.cutoff);
    for (const f of frequencies) {
      expect(f * pitch, label).toBeGreaterThan(20);
      expect(f * pitch, label).toBeLessThan(20000);
    }
    expect(voice.seconds, label).toBeGreaterThan(0);
    expect(voice.seconds, label).toBeLessThanOrEqual(2);
    expect(voice.level, label).toBeGreaterThan(0);
    expect(voice.level * (sound.gain ?? 1), label).toBeLessThanOrEqual(1);
    expect(voice.delay ?? 0, label).toBeGreaterThanOrEqual(0);
    expect(voice.attack ?? 0.005, label).toBeGreaterThan(0);
    expect(voice.attack ?? 0, label).toBeLessThan(voice.seconds);
    if (voice.src === 'noise') expect(voice.q ?? 1, label).toBeGreaterThan(0);
  }
}

/** Sum of the peak levels, and the longest voice: how heavy a sound is. */
function weight(sound: SfxPlay): { level: number; seconds: number } {
  return {
    level: sound.recipe.reduce((sum, v) => sum + v.level, 0) * (sound.gain ?? 1),
    seconds: Math.max(...sound.recipe.map((v) => (v.delay ?? 0) + v.seconds)),
  };
}

function sound(event: GameEvent): SfxPlay {
  const found = soundFor(event);
  if (!found) throw new Error(`${event.type} is silent`);
  return found;
}

describe('sfx table', () => {
  it('has an entry for every GameEvent type and no other', () => {
    expect(Object.keys(SFX).sort()).toEqual(Object.keys(EVERY_EVENT).sort());
  });

  it('the samples cover every GameEvent type', () => {
    expect([...new Set(SAMPLES.map((e) => e.type))].sort()).toEqual(Object.keys(EVERY_EVENT).sort());
  });

  it('gives every event a playable sound or silence', () => {
    for (const event of SAMPLES) {
      const found = soundFor(event);
      if (found) expectPlayable(found, JSON.stringify(event));
      else expect(found, event.type).toBeNull();
    }
  });

  it('sounds every M0 event', () => {
    for (const event of SAMPLES) if (M0.includes(event.type)) expect(soundFor(event), JSON.stringify(event)).not.toBeNull();
  });

  it('footsteps and button sounds are playable', () => {
    FOOTSTEPS.forEach((step, i) => expectPlayable(step, `foot ${i}`));
    expect(Object.keys(UI_SFX).sort()).toEqual(['back', 'hover', 'normal', 'primary']);
    for (const [kind, ui] of Object.entries(UI_SFX)) expectPlayable(ui, kind);
  });
});

describe('sfx variants', () => {
  it('the coin climbs a major scale with the streak and holds at the octave', () => {
    const semitones = [0, 2, 4, 5, 7, 9, 11, 12];
    semitones.forEach((s, i) => expect(coinPitch(i + 1)).toBeCloseTo(2 ** (s / 12), 12));
    for (const streak of [8, 9, 30, 1000]) expect(coinPitch(streak)).toBe(2);
    for (const streak of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) expect(coinPitch(streak)).toBe(1);
    for (let streak = 1; streak < 20; streak++) expect(coinPitch(streak + 1)).toBeGreaterThanOrEqual(coinPitch(streak));
  });

  it('plays the coin at the streak\'s pitch, a little quieter when the magnet pulls it in', () => {
    for (let streak = 1; streak <= 10; streak++) {
      const plain = sound({ type: 'coin', d: 0, x: 0, y: 1, streak, magnet: false });
      const pulled = sound({ type: 'coin', d: 0, x: 0, y: 1, streak, magnet: true });
      expect(plain.pitch ?? 1).toBeCloseTo(coinPitch(streak), 12);
      expect(pulled.pitch ?? 1).toBeCloseTo(coinPitch(streak), 12);
      expect(pulled.gain ?? 1).toBeLessThan(plain.gain ?? 1);
    }
  });

  it('a hard landing is heavier and longer than a soft one', () => {
    const soft = weight(sound({ type: 'land', hard: false }));
    const hard = weight(sound({ type: 'land', hard: true }));
    expect(hard.level).toBeGreaterThan(soft.level);
    expect(hard.seconds).toBeGreaterThan(soft.seconds);
  });

  it('lane changes pan the way the hero moves; bumps and stumbles pan to their side', () => {
    expect(sound({ type: 'lane', from: 0, to: -1 }).pan).toBeLessThan(0);
    expect(sound({ type: 'lane', from: 0, to: 1 }).pan).toBeGreaterThan(0);
    expect(sound({ type: 'lane', from: 1, to: 0 }).pan).toBeLessThan(0);
    expect(sound({ type: 'bump', side: -1 }).pan).toBeLessThan(0);
    expect(sound({ type: 'bump', side: 1 }).pan).toBeGreaterThan(0);
    expect(sound({ type: 'stumble', side: -1 }).pan).toBeLessThan(0);
    expect(sound({ type: 'stumble', side: 1 }).pan).toBeGreaterThan(0);
  });

  it('builds the variants once: the same event gets the same sound object', () => {
    for (const event of SAMPLES) expect(soundFor(event), event.type).toBe(soundFor(event));
  });
});
