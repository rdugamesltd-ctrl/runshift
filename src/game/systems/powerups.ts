import { CHUNK, COINS, LANES, PLAYER, POWERUPS } from '../../balance';
import type { ChunkDecorator, Coin, GameEvent, Lane, PowerUpKind, RunState } from '../types';

/** The four power-ups, in HUD order. */
export const POWER_UP_KINDS: readonly PowerUpKind[] = ['magnet', 'multiplier', 'shield', 'glide'];

/** How long a power-up lasts at an upgrade level, s: base + perLevel × level. */
export function powerUpDuration(kind: PowerUpKind, level: number): number {
  const spec = POWERUPS[kind];
  return spec.base + spec.perLevel * level;
}

/** The kind a draw u in [0, 1) picks, by POWERUPS.weights. */
export function pickKind(u: number): PowerUpKind {
  const weights = POWERUPS.weights;
  const total = POWER_UP_KINDS.reduce((sum, kind) => sum + weights[kind], 0);
  let draw = u * total;
  for (const kind of POWER_UP_KINDS) {
    draw -= weights[kind];
    if (draw < 0) return kind;
  }
  return POWER_UP_KINDS[POWER_UP_KINDS.length - 1];
}

/**
 * The power-up spawner: a chunk gets one with chance CHUNK.length / mean(POWERUPS.spawnEvery), from POWERUPS.firstAt
 * on. It replaces a coin of one of the chunk's lane coin lines, so it always sits on a reachable, obstacle-free spot.
 */
export const spawnPowerUps: ChunkDecorator = (chunk, rng) => {
  const chance = CHUNK.length / ((POWERUPS.spawnEvery[0] + POWERUPS.spawnEvery[1]) / 2);
  if (chunk.start < POWERUPS.firstAt || rng() >= chance) return;
  const candidates: number[] = [];
  chunk.coins.forEach((coin, i) => {
    if (Math.abs(coin.x) <= LANES.width + 1e-6) candidates.push(i);
  });
  if (!candidates.length) return;
  const index = candidates[Math.floor(rng() * candidates.length)];
  const [coin] = chunk.coins.splice(index, 1);
  chunk.pickups.push({ d: coin.d, x: coin.x, y: coin.y, kind: pickKind(rng()), taken: false });
};

/** A cheap deterministic hash of a number to [0, 1), so sky coins do not need an rng in the run. */
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Lays the jet glide's line of sky coins into `out` (cleared first): from `d` + coinsFrom to the distance the
 * glide covers at speed v (its landing), at glide height, switching lane every coinLaneEvery m.
 */
export function layGlideCoins(out: Coin[], d: number, v: number, duration: number): void {
  out.length = 0;
  const spec = POWERUPS.glide;
  const y = glideCoinY();
  const end = d + v * duration;
  let lane: Lane = 0;
  let next = d + spec.coinsFrom + spec.coinLaneEvery;
  for (let s = d + spec.coinsFrom; s < end; s += COINS.spacing) {
    if (s >= next) {
      next += spec.coinLaneEvery;
      const step = hash01(Math.floor(s)) < 0.5 ? -1 : 1;
      lane = (lane + step < -1 || lane + step > 1 ? lane - step : lane + step) as Lane;
    }
    out.push({ d: s, x: lane * LANES.width, y, taken: false, fromThief: true });
  }
}

/** The height of the glide's coins, m: the gliding player's chest. */
export function glideCoinY(): number {
  return POWERUPS.glide.height + PLAYER.height / 2;
}

/** The lane x a coin rises into under the glide: its nearest lane (wall coins come in off the walls). */
export function glideCoinX(coin: Coin): number {
  return Math.max(-1, Math.min(1, Math.round(coin.x / LANES.width))) * LANES.width;
}

/**
 * One step of a track coin rising to the glide's flight line: towards its nearest lane at sky-coin height, closing
 * in at POWERUPS.glide.liftRate 1/s, so the coins in view float up rather than jump (d is left alone, so the track's
 * coins stay sorted).
 */
export function liftCoin(coin: Coin, dt: number): void {
  easeCoin(coin, glideCoinX(coin), glideCoinY(), dt);
}

/**
 * One step of a coin easing towards (x, y) at POWERUPS.glide.liftRate 1/s, snapping once within a millimetre (d is
 * left alone). Returns true once it is there.
 */
export function easeCoin(coin: Coin, x: number, y: number, dt: number): boolean {
  const u = Math.min(1, POWERUPS.glide.liftRate * dt);
  coin.x = Math.abs(x - coin.x) < 1e-3 ? x : coin.x + (x - coin.x) * u;
  coin.y = Math.abs(y - coin.y) < 1e-3 ? y : coin.y + (y - coin.y) * u;
  return coin.x === x && coin.y === y;
}

/**
 * Counts the power-up timers down by dt, pushing powerUpEnd when one runs out, and keeps the score multiplier in
 * step with the multiplier power-up. The glide's end is the run's business (it waits for floor under the feet).
 */
export function tickPowerUps(state: RunState, dt: number, events: GameEvent[]): void {
  for (const kind of POWER_UP_KINDS) {
    if (kind === 'glide') continue;
    const left = state.powerUps[kind];
    if (left <= 0) continue;
    state.powerUps[kind] = Math.max(0, left - dt);
    if (state.powerUps[kind] === 0) events.push({ type: 'powerUpEnd', kind });
  }
  state.multiplier = state.powerUps.multiplier > 0 ? POWERUPS.multiplier.factor : 1;
}

/**
 * The magnet's pull on one coin ahead of the player: x and y close in on the player's at a rate that meets him
 * as he reaches the coin's d (d itself is left alone, so the track's coins stay sorted). Returns true while the
 * coin is in the magnet's reach.
 */
export function pullCoin(coin: Coin, state: RunState, dt: number): boolean {
  const p = state.player;
  const ahead = coin.d - state.d;
  if (ahead > POWERUPS.magnet.ahead || ahead < -COINS.radius) return false;
  const targetY = p.y + p.height / 2;
  if (Math.abs(coin.x - p.x) > POWERUPS.magnet.radius || Math.abs(coin.y - targetY) > POWERUPS.magnet.radius) return false;
  const time = Math.max(dt, ahead / Math.max(state.v, 1));
  const u = Math.min(1, dt / time);
  coin.x += (p.x - coin.x) * u;
  coin.y += (targetY - coin.y) * u;
  return true;
}
