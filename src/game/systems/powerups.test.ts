import { describe, expect, it } from 'vitest';
import { CHUNK, COINS, PLAYER, POWERUPS, SIM } from '../../balance';
import { Streamer } from '../track/streamer';
import type { Chunk, GameEvent, PowerUpKind } from '../types';
import { botAction } from './bot';
import { layGlideCoins, pickKind, powerUpDuration, spawnPowerUps } from './powerups';
import { Run } from './run';
import { scoreFor } from './scoring';

/** A run whose first chunk holds one power-up of `kind` 8 m in, in the centre lane at coin height. */
function runWith(kind: PowerUpKind, levels: Partial<Record<PowerUpKind, number>> = {}): Run {
  const run = new Run(new Streamer(), { decorators: [chunk => {
    if (chunk.start === 0) chunk.pickups.push({ d: 8, x: 0, y: PLAYER.height / 2, kind, taken: false });
  }] });
  run.setUpgrades({ magnet: 0, shield: 0, multiplier: 0, glide: 0, ...levels });
  run.reset({ seed: 3 });
  return run;
}

/** One step with the perfect bot at the controls, collecting events. */
function botStep(run: Run, events: GameEvent[]): void {
  const action = botAction('perfect', run.state, run.track);
  if (action) run.push({ action, at: 0, source: 'bot' });
  run.step(SIM.fixedDt);
  events.push(...run.drainEvents());
}

/** Steps with the perfect bot until the run reaches distance d (or `limit` steps), collecting events. */
function runTo(run: Run, d: number, events: GameEvent[] = [], limit = 5000): GameEvent[] {
  for (let i = 0; i < limit && run.state.d < d && run.state.phase !== 'over'; i++) botStep(run, events);
  return events;
}

function emptyChunk(start: number): Chunk {
  return { index: start / 40, start, length: 40, shell: 'street', district: 'street', tier: 0, seed: 1, floors: [{ start, end: start + 40, y: 0 }],
    walls: [], boxes: [], coins: [], pickups: [], path: [], patterns: [] };
}

describe('power-ups', () => {
  it('durations grow with the upgrade level', () => {
    expect(powerUpDuration('magnet', 0)).toBe(POWERUPS.magnet.base);
    expect(powerUpDuration('glide', 3)).toBe(POWERUPS.glide.base + 3 * POWERUPS.glide.perLevel);
  });

  it('picks every kind by weight', () => {
    const seen = new Set<PowerUpKind>();
    for (let u = 0; u < 1; u += 0.01) seen.add(pickKind(u));
    expect([...seen].sort()).toEqual(['glide', 'magnet', 'multiplier', 'shield']);
    expect(pickKind(0)).toBe('magnet');
    expect(pickKind(0.9999)).toBe('glide');
  });

  it('the spawner swaps a lane coin for a power-up, and never spawns too early', () => {
    const chunk = emptyChunk(400);
    for (let d = 402; d < 440; d += COINS.spacing) chunk.coins.push({ d, x: 2, y: 0.85, taken: false, fromThief: false });
    const coins = chunk.coins.length;
    spawnPowerUps(chunk, () => 0);
    expect(chunk.pickups).toHaveLength(1);
    expect(chunk.coins).toHaveLength(coins - 1);
    expect(chunk.pickups[0]).toMatchObject({ x: 2, y: 0.85, kind: 'magnet', taken: false });
    const early = emptyChunk(0);
    early.coins.push({ d: 10, x: 0, y: 0.85, taken: false, fromThief: false });
    spawnPowerUps(early, () => 0);
    expect(early.pickups).toHaveLength(0);
  });

  it('a pickup starts its timer at the upgraded duration, which runs out with powerUpEnd', () => {
    const run = runWith('magnet', { magnet: 2 });
    const events = runTo(run, 9);
    expect(events).toContainEqual({ type: 'pickup', kind: 'magnet' });
    const left = run.state.powerUps.magnet;
    expect(left).toBeGreaterThan(powerUpDuration('magnet', 2) - 0.2);
    for (let i = 0; i < Math.ceil(left / SIM.fixedDt) + 2; i++) botStep(run, events);
    expect(run.state.phase).toBe('running');
    expect(run.state.powerUps.magnet).toBe(0);
    expect(events.filter(e => e.type === 'powerUpEnd')).toEqual([{ type: 'powerUpEnd', kind: 'magnet' }]);
  });

  it('the magnet pulls in coins from the side lanes', () => {
    const run = runWith('magnet');
    runTo(run, 9);
    // A coin two lanes over, a little ahead: without the magnet it is out of reach.
    const coin = { d: run.state.d + 6, x: 4, y: 0.85, taken: false, fromThief: false };
    run.track.chunks.find(c => c.start <= coin.d && coin.d < c.start + c.length)!.coins.push(coin);
    (run.track as unknown as { rebuildQuery(): void }).rebuildQuery();
    const gold = run.state.gold;
    const events = runTo(run, coin.d + 1);
    expect(coin.taken).toBe(true);
    expect(run.state.gold).toBeGreaterThan(gold);
    expect(events.some(e => e.type === 'coin' && e.magnet)).toBe(true);
  });

  it('the multiplier doubles the score earned while it runs', () => {
    const run = runWith('multiplier');
    runTo(run, 9);
    expect(run.state.multiplier).toBe(POWERUPS.multiplier.factor);
    const startScore = run.state.score;
    const startD = run.state.d;
    const startGold = run.state.gold;
    runTo(run, 30);
    const plain = scoreFor(run.state.d, run.state.gold) - scoreFor(startD, startGold);
    expect(run.state.score - startScore).toBeGreaterThanOrEqual(2 * plain - 2);
  });

  it('the shield breaks the first obstacle instead of a crash', () => {
    const run = runWith('shield');
    runTo(run, 9);
    expect(run.state.powerUps.shield).toBeGreaterThan(0);
    run.track.chunks.find(c => c.start === 0)!.boxes.push({ id: 999, kind: 'blocker', rule: 'dodge', d0: 20, d1: 21, x0: -0.6, x1: 0.6, y0: 0, y1: 2.2, vd: 0, broken: false });
    (run.track as unknown as { rebuildQuery(): void }).rebuildQuery();
    const events = runTo(run, 25);
    expect(events).toContainEqual({ type: 'shieldBreak', boxId: 999 });
    expect(run.state.player.mode.kind).not.toBe('crash');
    expect(run.state.powerUps.shield).toBe(0);
  });

  it('the jet glide climbs above the trains, lays sky coins, steers, and lands safely when it ends', () => {
    const run = runWith('glide');
    const events = runTo(run, 9);
    expect(run.state.player.gliding).toBe(true);
    expect(run.state.airCoins.length).toBeGreaterThan(10);
    runTo(run, 30);
    expect(run.state.player.y).toBeGreaterThan(POWERUPS.glide.height - 0.3);
    run.push({ action: 'right', at: 0, source: 'key' });
    run.push({ action: 'up', at: 0, source: 'key' });
    for (let i = 0; i < 30; i++) run.step(SIM.fixedDt);
    expect(run.state.player.lane).toBe(1);
    const gold = run.state.gold;
    for (let i = 0; i < 2000 && run.state.player.gliding; i++) {
      run.step(SIM.fixedDt);
      events.push(...run.drainEvents());
    }
    expect(run.state.gold).toBeGreaterThan(gold);
    expect(run.state.player.gliding).toBe(false);
    expect(run.state.airCoins).toHaveLength(0);
    expect(run.state.player.invulnT).toBeGreaterThan(0);
    expect(events).toContainEqual({ type: 'powerUpEnd', kind: 'glide' });
  });

  it('the jet glide raises the track coins under the flight to the sky line, and leaves those past the landing', () => {
    const run = runWith('glide');
    runTo(run, 9);
    expect(run.state.player.gliding).toBe(true);
    for (let i = 0; i < 120; i++) run.step(SIM.fixedDt);
    const s = run.state;
    const end = s.d + s.v * s.powerUps.glide;
    const coins: Parameters<typeof layGlideCoins>[0] = [];
    const n = run.track.coinsIn(s.d + 2, end, coins);
    expect(n).toBeGreaterThan(0);
    for (const coin of coins) {
      expect([-2, 0, 2]).toContain(coin.x);
      expect(coin.y).toBeCloseTo(POWERUPS.glide.height + PLAYER.height / 2, 1);
    }
    for (const sky of s.airCoins) {
      if (sky.taken) continue;
      for (const coin of coins) expect(coin.x === sky.x && Math.abs(coin.d - sky.d) < COINS.spacing * 0.75 && !coin.taken).toBe(false);
    }
    const past = run.track.coinsIn(end + 30, end + 120, coins);
    expect(past).toBeGreaterThan(0);
    for (const coin of coins) expect(coin.y).toBeLessThan(POWERUPS.glide.height);
    const gold = s.gold;
    for (let i = 0; i < 2000 && s.player.gliding; i++) run.step(SIM.fixedDt);
    expect(s.gold).toBeGreaterThan(gold);
  });

  it('a flying player never sees a coin on the floor, and the risen coins sink back after the landing', () => {
    const sky = POWERUPS.glide.height + PLAYER.height / 2;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const startD = 1500;
      const run = new Run(new Streamer(), { decorators: [chunk => {
        const at = startD + 8;
        if (chunk.start <= at && at < chunk.start + chunk.length) chunk.pickups.push({ d: at, x: 0, y: PLAYER.height / 2, kind: 'glide', taken: false });
      }] });
      run.reset({ seed, startD });
      const s = run.state;
      const coins: Parameters<typeof layGlideCoins>[0] = [];
      const home = new Map(coins.slice(0, run.track.coinsIn(startD, startD + CHUNK.horizon, coins)).map(c => [c, c.y]));
      runTo(run, startD + 9);
      expect(s.player.gliding).toBe(true);
      let flying = 0;
      for (let i = 0; i < 2000 && s.player.gliding; i++, flying++) {
        run.step(SIM.fixedDt);
        // Once the climb is done, every coin the thief has shown (passed) ahead of the player is up at the sky line.
        if (flying < 60 || !s.player.gliding) continue;
        const n = run.track.coinsIn(s.d + 1, s.thief.d, coins);
        for (let k = 0; k < n; k++) if (!coins[k].taken) expect(coins[k].y).toBeGreaterThan(sky - 0.5);
      }
      expect(s.player.gliding).toBe(false);
      const ahead = coins.slice(0, run.track.coinsIn(s.d + 4, s.d + 40, coins));
      for (let i = 0; i < 120; i++) run.step(SIM.fixedDt);
      let checked = 0;
      for (const coin of ahead) {
        const y = home.get(coin);
        if (coin.taken || coin.d < s.d || y === undefined) continue;
        expect(coin.y).toBeCloseTo(y, 1);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    }
  });

  it('sky coins stay in lanes and ahead of the start', () => {
    const coins: Parameters<typeof layGlideCoins>[0] = [];
    layGlideCoins(coins, 100, 15, 6);
    expect(coins.length).toBeGreaterThan(20);
    for (const coin of coins) {
      expect([-2, 0, 2]).toContain(coin.x);
      expect(coin.d).toBeGreaterThanOrEqual(100 + POWERUPS.glide.coinsFrom);
    }
  });
});
