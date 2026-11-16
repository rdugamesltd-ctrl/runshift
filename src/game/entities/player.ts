import { AIR, JUMP, LANES, PLAYER, SIM, SLIDE, STUMBLE, TRAINS, WALL } from '../../balance';
import type { Action, CrashCause, GameEvent, Lane, PlayerMode, PlayerState, Side, TrackQuery } from '../types';
import type { ActionBuffer } from './actions';
import type { Box } from './collision';

/** What a player step needs from the run: distance, speed and run time. */
export interface StepContext {
  d: number;
  v: number;
  time: number;
}

/** A jump rises for this long, s, and falls back to flat floor for FALL_TIME. */
export const RISE_TIME = JUMP.airtime * JUMP.riseShare;
export const FALL_TIME = JUMP.airtime - RISE_TIME;
/** Gravity while rising, m/s²: 2·apex/RISE_TIME², so a jump peaks at JUMP.apex after RISE_TIME. */
export const GRAVITY_UP = (2 * JUMP.apex) / RISE_TIME ** 2;
/** Gravity while falling, m/s²: 2·apex/FALL_TIME², so a jump lands on its take-off floor after JUMP.airtime. */
export const GRAVITY = (2 * JUMP.apex) / FALL_TIME ** 2;
/** Take-off speed of a jump, m/s: 2·apex/RISE_TIME. */
export const JUMP_SPEED = (2 * JUMP.apex) / RISE_TIME;

/**
 * Height of the feet above the take-off floor at `u` (0-1 of JUMP.airtime) into a jump on flat floor, m: the two
 * half-parabolas fly() traces. For laying coins along the arc.
 */
export function jumpArc(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  const r = JUMP.riseShare;
  const k = c < r ? (r - c) / r : (c - r) / (1 - r);
  return JUMP.apex * (1 - k * k);
}

/** Rounding tolerance for heights and timers, so a jump that lands exactly on the floor lands this step. */
const EPS = 1e-9;

/** A fresh player, standing in the centre lane with no lane change under way. */
export function createPlayer(): PlayerState {
  return {
    mode: { kind: 'run' },
    lane: 0,
    laneFrom: 0,
    laneT: LANES.changeTime,
    x: 0,
    y: 0,
    vy: 0,
    height: PLAYER.height,
    wallTime: 0,
    stumbleT: 0,
    lastStumble: -Infinity,
    invulnT: 0,
    gliding: false,
    glideSaves: 0,
  };
}

/** Copies one player state into another (the mode is copied, not shared). */
export function copyPlayer(from: PlayerState, to: PlayerState): void {
  Object.assign(to, from);
  to.mode = { ...from.mode };
}

/** 0 → 0, 1 → 1, with zero slope at both ends; clamped outside [0, 1]. Lane changes ease with it. */
export function smoothstep(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
}

/** The lane nearest the sign of `n`: negative → −1, zero → 0, positive → 1. */
export function toLane(n: number): Lane {
  return n < 0 ? -1 : n > 0 ? 1 : 0;
}

/**
 * The player's share of the speed curve: none in a crash, STUMBLE.speedFactor right after a stumble,
 * recovering linearly to 1 over STUMBLE.recover. TODO WP-11: × WALL.speedFactor while on a wall.
 */
export function speedFactor(p: PlayerState): number {
  if (p.mode.kind === 'crash') return 0;
  const recovery = 1 - (1 - STUMBLE.speedFactor) * Math.min(1, p.stumbleT / STUMBLE.recover);
  return recovery * (p.mode.kind === 'wallRun' || p.mode.kind === 'wallJump' ? WALL.speedFactor : 1);
}

/**
 * The player's collision box at distance d, written into `out`: PLAYER.width across, PLAYER.depth along the
 * run, from the feet up p.height (PLAYER.height standing, SLIDE.height sliding).
 * TODO WP-11: the wall box (x from side·(planeX − poseReach) to side·planeX, y from WALL.bandBox, following the
 * slip) and the wall-jump box (0.8 × 1.2 centred on the arc).
 */
export function playerBox(p: PlayerState, d: number, out: Box): Box {
  out.d0 = d - PLAYER.depth / 2;
  out.d1 = d + PLAYER.depth / 2;
  if (p.mode.kind === 'wallRun') {
    const mode = p.mode;
    const x0 = mode.side * (WALL.planeX - WALL.poseReach);
    const x1 = mode.side * WALL.planeX;
    const band = WALL.bandBox[mode.band];
    const slip = p.y - (mode.band === 'low' ? WALL.bandLow : WALL.bandHigh);
    out.x0 = Math.min(x0, x1);
    out.x1 = Math.max(x0, x1);
    out.y0 = band[0] + slip;
    out.y1 = band[1] + slip;
    return out;
  }
  out.x0 = p.x - PLAYER.width / 2;
  out.x1 = p.x + PLAYER.width / 2;
  if (p.mode.kind === 'wallJump') {
    out.y0 = p.y - WALL.jumpApex;
    out.y1 = p.y + WALL.jumpApex;
    return out;
  }
  out.y0 = p.y;
  out.y1 = p.y + p.height;
  return out;
}

/** Ends the run in a crash: the crash mode plays out (the run ends it after RESULTS.crashDelay). */
export function crashPlayer(p: PlayerState, cause: CrashCause, events: GameEvent[]): void {
  p.mode = { kind: 'crash', t: 0, cause };
  // Whatever was hit stops the rise; the hero drops back to the floor.
  p.vy = Math.min(p.vy, 0);
  events.push({ type: 'crash', cause });
}

/**
 * Advances the player one fixed step of `dt` seconds at the run's distance ctx.d (already moved this step).
 * First every live press in the buffer is offered to the current mode, oldest first (used ones leave the
 * buffer); then the mode advances. Each mode's rules live in one entry of the MODES table below, so the wall
 * modes (WP-11) slot in beside the ground modes. Allocates nothing except a new mode object on a change of mode.
 */
export function stepPlayer(p: PlayerState, track: TrackQuery, ctx: StepContext, buf: ActionBuffer, dt: number, events: GameEvent[]): void {
  p.invulnT = Math.max(0, p.invulnT - dt);
  p.stumbleT = Math.max(0, p.stumbleT - dt);
  for (let i = 0, n = buf.live(ctx.time, action => events.push({ type: 'bump', side: action === 'left' ? -1 : 1 })); i < n; ) {
    if (pressIn(p.mode.kind, p, p.mode, buf.actionAt(i), track, ctx, events)) {
      buf.removeAt(i);
      n--;
    } else {
      const action = buf.actionAt(i);
      const side = action === 'left' ? -1 : action === 'right' ? 1 : 0;
      if (side !== 0 && p.lane === side && (p.mode.kind === 'run' || p.mode.kind === 'jump' || p.mode.kind === 'slide' || p.mode.kind === 'air')) {
        buf.holdOuter(i, WALL.entryBuffer);
      }
      i++;
    }
  }
  stepIn(p.mode.kind, p, p.mode, track, ctx, dt, events);
}

/**
 * One step of the jet glide (power-up): left and right change lane, up and down are used up and do nothing, and the
 * feet climb towards `height` m. The mode stays 'run' with p.gliding set, so views pose a flight from that flag.
 */
export function stepGlide(p: PlayerState, ctx: StepContext, buf: ActionBuffer, height: number, climbRate: number, dt: number, events: GameEvent[]): void {
  p.invulnT = Math.max(0, p.invulnT - dt);
  p.stumbleT = Math.max(0, p.stumbleT - dt);
  for (let n = buf.live(ctx.time); n > 0; n--) {
    const action = buf.actionAt(0);
    buf.removeAt(0);
    const side = action === 'left' ? -1 : action === 'right' ? 1 : 0;
    const to = p.lane + side;
    if (side !== 0 && to >= -1 && to <= 1) changeLane(p, toLane(to), events);
  }
  steer(p, dt);
  p.y += (height - p.y) * Math.min(1, climbRate * dt);
  p.vy = 0;
}

/** Starts the jet glide from any ground or air mode: standing height, no vertical speed. */
export function startGlide(p: PlayerState): void {
  p.gliding = true;
  p.mode = { kind: 'run' };
  p.height = PLAYER.height;
  p.vy = 0;
}

/** Ends the jet glide: the player drops from where he is (past any coyote time), safe for `safe` s. */
export function endGlide(p: PlayerState, safe: number): void {
  p.gliding = false;
  p.mode = { kind: 'air', t: AIR.coyote + 1 };
  p.vy = 0;
  p.invulnT = Math.max(p.invulnT, safe);
}

// ---------------------------------------------------------------------------------------------------------------
// The mode table.

/** A player mode's kind. */
export type ModeKind = PlayerMode['kind'];
/** The player mode of one kind. */
export type ModeOf<K extends ModeKind> = Extract<PlayerMode, { kind: K }>;

/**
 * How one mode behaves. `press` is offered each live buffered press, oldest first, and returns true when it used
 * the press (false leaves it waiting in the buffer for a later step). `step` then advances the mode by `dt`;
 * either may switch `p.mode` to another mode.
 */
export interface ModeRules<M extends PlayerMode> {
  press(p: PlayerState, mode: M, action: Action, track: TrackQuery, ctx: StepContext, events: GameEvent[]): boolean;
  step(p: PlayerState, mode: M, track: TrackQuery, ctx: StepContext, dt: number, events: GameEvent[]): void;
}

/** The rules of every mode, by kind. */
export type ModeTable = { [K in ModeKind]: ModeRules<ModeOf<K>> };

function pressIn<K extends ModeKind>(
  kind: K,
  p: PlayerState,
  mode: ModeOf<K>,
  action: Action,
  track: TrackQuery,
  ctx: StepContext,
  events: GameEvent[],
): boolean {
  return MODES[kind].press(p, mode, action, track, ctx, events);
}

function stepIn<K extends ModeKind>(
  kind: K,
  p: PlayerState,
  mode: ModeOf<K>,
  track: TrackQuery,
  ctx: StepContext,
  dt: number,
  events: GameEvent[],
): void {
  MODES[kind].step(p, mode, track, ctx, dt, events);
}

// ---------------------------------------------------------------------------------------------------------------
// Moves shared by the modes.

/**
 * Where a lane change is at `u` (0-1 of LANES.changeTime), in lanes: the cubic Hermite from `from` (leaving at
 * `v0` lanes/s) to `to` (arriving at rest). With v0 = 0 it is exactly smoothstep.
 */
export function laneCurve(from: number, to: number, v0: number, u: number): number {
  const c = Math.min(1, Math.max(0, u));
  const c2 = c * c;
  const c3 = c2 * c;
  return from + (to - from) * (3 * c2 - 2 * c3) + v0 * LANES.changeTime * (c3 - 2 * c2 + c);
}

/** The sideways speed of the lane change under way, lanes/s (0 once it is complete). */
export function laneSpeed(p: PlayerState): number {
  if (p.laneT >= LANES.changeTime) return 0;
  const u = Math.max(0, p.laneT / LANES.changeTime);
  const v0 = p.laneV ?? 0;
  const perU = (p.lane - p.laneFrom) * 6 * u * (1 - u) + v0 * LANES.changeTime * (3 * u * u - 4 * u + 1);
  return perU / LANES.changeTime;
}

/** Moves x along the lane change under way: laneCurve from laneFrom to lane over LANES.changeTime. */
function steer(p: PlayerState, dt: number): void {
  if (p.laneT < LANES.changeTime) p.laneT = Math.min(LANES.changeTime, p.laneT + dt);
  p.x = LANES.width * laneCurve(p.laneFrom, p.lane, p.laneV ?? 0, p.laneT / LANES.changeTime);
}

/**
 * Starts a lane change from wherever the player is now (laneFrom may be fractional: a second press during a
 * change turns it from the current x) to lane `to`. A press the same way keeps the sideways momentum, so a double
 * swipe sweeps two lanes without stopping half way; a press back the other way starts from rest, so a dodge
 * never drifts on towards what it dodges. The momentum is capped so the change never overshoots its lane.
 */
function changeLane(p: PlayerState, to: Lane, events: GameEvent[]): void {
  events.push({ type: 'lane', from: p.lane, to });
  const from = p.x / LANES.width;
  const span = to - from;
  const speed = laneSpeed(p);
  const towards = span !== 0 && Math.sign(speed) === Math.sign(span) ? speed : 0;
  p.laneV = Math.sign(towards) * Math.min(Math.abs(towards), (3 * Math.abs(span)) / LANES.changeTime);
  p.laneFrom = from;
  p.lane = to;
  p.laneT = 0;
}

/**
 * The W1 attach rule (docs/CONVENTIONS.md): does a left or right press attach to that side's wall? WP-01 has no
 * wall modes, so it never does, and every sideways press is a lane change or a bump.
 * TODO WP-11: runnableWall(d + v·WALL.attachTime, side), WALL.attachReach, the mode and WALL.minAttachY checks,
 * the wallAttach mode; and in the outer lane an outward press waits WALL.entryBuffer for a wall (ActionBuffer.hold)
 * before it becomes a bump.
 */
function attachesToWall(p: PlayerState, side: Side, track: TrackQuery, ctx: StepContext, events: GameEvent[]): boolean {
  const mode = p.mode.kind;
  if (mode !== 'run' && mode !== 'jump' && mode !== 'slide' && mode !== 'air') return false;
  if (mode === 'air' && p.y <= WALL.minAttachY) return false;
  if (Math.abs(p.x - side * WALL.planeX) > WALL.attachReach) return false;
  if (!track.runnableWall(ctx.d + ctx.v * WALL.attachTime, side)) return false;
  const band = p.y >= WALL.bandLow ? 'high' : 'low';
  p.mode = { kind: 'wallAttach', side, band, t: 0, x0: p.x, y0: p.y };
  p.lane = side;
  p.laneFrom = side;
  p.laneT = LANES.changeTime;
  p.height = PLAYER.height;
  p.vy = 0;
  p.wallTime = 0;
  events.push({ type: 'wallAttach', side, band });
  return true;
}

/** A left or right press: a wall attach (WP-11), a lane change, or a bump against the edge of the outer lane. */
function pressSideways(p: PlayerState, side: Side, track: TrackQuery, ctx: StepContext, events: GameEvent[]): boolean {
  if (attachesToWall(p, side, track, ctx, events)) return true;
  const to = p.lane + side;
  if (to < -1 || to > 1) return false;
  changeLane(p, toLane(to), events);
  return true;
}

/** Jumps from wherever the feet are: JUMP_SPEED up, standing height. */
function takeOff(p: PlayerState, events: GameEvent[]): void {
  p.mode = { kind: 'jump', t: 0, fastFall: false };
  p.vy = JUMP_SPEED;
  p.height = PLAYER.height;
  events.push({ type: 'jump' });
}

/** Starts a slide: SLIDE.height for SLIDE.time. */
function startSlide(p: PlayerState, events: GameEvent[]): void {
  p.mode = { kind: 'slide', t: 0 };
  p.vy = 0;
  p.height = SLIDE.height;
  events.push({ type: 'slide' });
}

/** Runs off the floor (an edge, or a step down): airborne from rest, coyote time starting now. */
function leaveFloor(p: PlayerState): void {
  p.mode = { kind: 'air', t: 0 };
  p.vy = 0;
  p.height = PLAYER.height;
}

/** Falls for good: the run ends after AIR.fallTime. */
function startFall(p: PlayerState, events: GameEvent[]): void {
  // TODO WP-32: while p.glideSaves > 0 the glide catches this fall instead (glideSave event), once.
  p.mode = { kind: 'fall', t: 0 };
  p.height = PLAYER.height;
  events.push({ type: 'fall' });
}

/**
 * Ballistic flight: GRAVITY_UP while rising, GRAVITY while falling. Exact for each piece (a step that passes the
 * apex is split there), so the jump's apex and airtime do not depend on dt.
 */
function fly(p: PlayerState, dt: number): void {
  let rest = dt;
  if (p.vy > 0) {
    const rise = Math.min(rest, p.vy / GRAVITY_UP);
    p.y += p.vy * rise - 0.5 * GRAVITY_UP * rise * rise;
    p.vy -= GRAVITY_UP * rise;
    rest -= rise;
    if (rest <= 0) return;
    p.vy = Math.min(p.vy, 0);
  }
  p.y += p.vy * rest - 0.5 * GRAVITY * rest * rest;
  p.vy -= GRAVITY * rest;
}

/**
 * Whether falling feet meet a floor they can land on: on the way down, at or below the floor's top, and no more
 * than −AIR.loseY below it (that much of a missed floor still catches the player, like a short gap's far edge).
 */
function canLand(p: PlayerState, floor: number | null): floor is number {
  return floor !== null && p.vy <= 0 && p.y <= floor + EPS && p.y >= floor + AIR.loseY;
}

/** Lands on `floor`: a hard landing (from a fast fall) goes straight into a slide. */
function land(p: PlayerState, floor: number, hard: boolean, events: GameEvent[]): void {
  p.y = floor;
  p.vy = 0;
  events.push({ type: 'land', hard });
  if (hard) startSlide(p, events);
  else p.mode = { kind: 'run' };
}

/**
 * One airborne step: fly, then land, or start falling for good once the feet are AIR.loseY below the floor under
 * them (below y = AIR.loseY over a gap).
 */
function airborne(p: PlayerState, track: TrackQuery, ctx: StepContext, dt: number, hard: boolean, events: GameEvent[]): void {
  const previousY = p.y;
  fly(p, dt);
  const platform = track.platformAt(ctx.d, p.x);
  if (platform !== null && p.y <= platform + EPS) {
    // A ramp rises under a runner faster than a jump's feet, so it can pass up through them between two steps:
    // judge "was above the surface" against the surface as it was a step ago, and let a ramp catch feet up to
    // TRAINS.maxRampStep under it, as when running onto it.
    const before = track.platformAt(ctx.d - ctx.v * dt, p.x);
    const wasAbove = previousY >= (before ?? platform) - EPS;
    if (wasAbove || platform - p.y <= TRAINS.maxRampStep) {
      if (p.vy <= 0) {
        land(p, platform, hard, events);
        return;
      }
      // Still rising: the ramp lifts the feet and the jump carries on from its surface.
      p.y = platform;
    }
  }
  const floor = track.floorAt(ctx.d, p.x);
  if (canLand(p, floor)) land(p, floor, hard, events);
  else if (p.y < (floor ?? 0) + AIR.loseY) startFall(p, events);
}

/** Holds the feet on the floor, or leaves it when it ends or drops away. Returns false when the player left it. */
function keepFloor(p: PlayerState, track: TrackQuery, ctx: StepContext): boolean {
  const platform = track.platformAt(ctx.d, p.x);
  if (platform !== null && platform >= p.y - EPS && platform - p.y <= TRAINS.maxRampStep) {
    p.y = platform;
    p.vy = 0;
    return true;
  }
  const floor = track.floorAt(ctx.d, p.x);
  if (floor === null || floor < p.y - EPS) {
    leaveFloor(p);
    return false;
  }
  // A higher floor is stepped onto. TODO WP-31: decide how rooftop steps (roofUp) are passed.
  p.y = floor;
  p.vy = 0;
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// The modes. Rules in docs/CONVENTIONS.md (simulation rules, normative).

/** run: left/right change lane (or W1), up jumps, down slides; off the floor → air. */
const RUN: ModeRules<ModeOf<'run'>> = {
  press(p, _mode, action, track, ctx, events) {
    switch (action) {
      case 'left':
        return pressSideways(p, -1, track, ctx, events);
      case 'right':
        return pressSideways(p, 1, track, ctx, events);
      case 'up':
        takeOff(p, events);
        return true;
      case 'down':
        startSlide(p, events);
        return true;
    }
  },
  step(p, _mode, track, ctx, dt) {
    steer(p, dt);
    keepFloor(p, track, ctx);
  },
};

/** jump: lanes still change; down is a fast fall (then a slide on landing); up waits in the buffer for the landing. */
const JUMPING: ModeRules<ModeOf<'jump'>> = {
  press(p, mode, action, track, ctx, events) {
    if (action === 'left' || action === 'right') return pressSideways(p, action === 'left' ? -1 : 1, track, ctx, events);
    if (action === 'up') return false;
    if (!mode.fastFall) {
      mode.fastFall = true;
      p.vy = Math.min(p.vy, -JUMP.fastFallSpeed);
      events.push({ type: 'fastFall' });
    }
    return true;
  },
  step(p, mode, track, ctx, dt, events) {
    steer(p, dt);
    mode.t += dt;
    airborne(p, track, ctx, dt, mode.fastFall, events);
  },
};

/** slide: SLIDE.time at SLIDE.height; up cancels it into a jump, down starts it again, lanes still change. */
const SLIDING: ModeRules<ModeOf<'slide'>> = {
  press(p, mode, action, track, ctx, events) {
    switch (action) {
      case 'left':
        return pressSideways(p, -1, track, ctx, events);
      case 'right':
        return pressSideways(p, 1, track, ctx, events);
      case 'up':
        takeOff(p, events);
        return true;
      case 'down':
        mode.t = 0;
        return true;
    }
  },
  step(p, mode, track, ctx, dt) {
    steer(p, dt);
    mode.t += dt;
    if (!keepFloor(p, track, ctx)) return;
    if (mode.t >= SLIDE.time - EPS) {
      p.height = PLAYER.height;
      p.mode = { kind: 'run' };
    }
  },
};

/**
 * air (ran off the floor): up within AIR.coyote is a jump (coyote time), later it waits for a landing; down waits
 * for a landing too (then slides); lanes still change (W1 too, while y > WALL.minAttachY: WP-11).
 */
const AIRBORNE: ModeRules<ModeOf<'air'>> = {
  press(p, mode, action, track, ctx, events) {
    if (action === 'left' || action === 'right') return pressSideways(p, action === 'left' ? -1 : 1, track, ctx, events);
    if (action === 'up' && mode.t < AIR.coyote) {
      takeOff(p, events);
      return true;
    }
    return false;
  },
  step(p, mode, track, ctx, dt, events) {
    steer(p, dt);
    mode.t += dt;
    airborne(p, track, ctx, dt, false, events);
  },
};

/** fall: out of reach; the run ends after AIR.fallTime. Presses are dropped. */
const FALLING: ModeRules<ModeOf<'fall'>> = {
  press: () => true,
  step(p, mode, _track, _ctx, dt) {
    steer(p, dt);
    mode.t += dt;
    fly(p, dt);
  },
};

/** crash: plays out where it happened (the run ends after RESULTS.crashDelay); a crash in the air drops to the floor. */
const CRASHED: ModeRules<ModeOf<'crash'>> = {
  press: () => true,
  step(p, mode, track, ctx, dt) {
    mode.t += dt;
    const floor = track.floorAt(ctx.d, p.x);
    if (canLand(p, floor)) {
      p.y = floor;
      p.vy = 0;
    } else fly(p, dt);
  },
};

/**
 * Wall movement: attach, run in two bands, jump to a landing, or leave toward the floor.
 */
/** The centre of the body against a wall plane. */
function wallX(side: Side): number { return side * (WALL.planeX - WALL.poseReach / 2); }

/** Feet height of a wall band before slipping. */
function wallY(band: 'low' | 'high'): number { return band === 'low' ? WALL.bandLow : WALL.bandHigh; }

/** Leaves a wall toward its outer floor lane, or into the air when there is no floor. */
function leaveWall(p: PlayerState, track: TrackQuery, ctx: StepContext, side: Side, events: GameEvent[]): void {
  if (track.floorAt(ctx.d, side * LANES.width) !== null) {
    p.mode = { kind: 'wallExit', side, t: 0, x0: p.x, y0: p.y };
    events.push({ type: 'wallExit', side });
  } else {
    p.mode = { kind: 'air', t: AIR.coyote };
    p.vy = 0;
    p.height = PLAYER.height;
  }
}

/** Attaching eases the runner from a ground lane onto the wall. */
const WALL_ATTACH: ModeRules<ModeOf<'wallAttach'>> = {
  press: () => false,
  step(p, mode, _track, _ctx, dt) {
    mode.t += dt;
    const u = smoothstep(mode.t / WALL.attachTime);
    p.x = mode.x0 + (wallX(mode.side) - mode.x0) * u;
    p.y = mode.y0 + (wallY(mode.band) - mode.y0) * u;
    if (mode.t >= WALL.attachTime - EPS) {
      p.mode = { kind: 'wallRun', side: mode.side, band: mode.band, t: 0, bandY0: wallY(mode.band), bandT: WALL.bandSwitchTime };
    }
  },
};

/** On the wall: switch bands, jump away, slip after two seconds, or leave when the span ends. */
const WALL_RUNNING: ModeRules<ModeOf<'wallRun'>> = {
  press(p, mode, action, track, ctx, events) {
    if ((action === 'left' && mode.side === -1) || (action === 'right' && mode.side === 1)) return true;
    if (action === 'left' || action === 'right') {
      // The rule takes the speed curve's value and applies the wall factor itself; ctx.v already has it. The jump's
      // first step is this one (the press is used before the mode steps), so it starts from the last step's d.
      const target = track.resolveWallJump(ctx.d - ctx.v * SIM.fixedDt, mode.side, ctx.v / WALL.speedFactor);
      p.mode = { kind: 'wallJump', from: mode.side, target, t: 0, x0: p.x, y0: p.y };
      events.push({ type: 'wallJump', from: mode.side, to: target.kind });
      return true;
    }
    const band = action === 'up' ? 'high' : 'low';
    if (mode.band !== band) {
      const slip = Math.max(0, p.wallTime - WALL.slipFrom) * WALL.slipSpeed;
      mode.bandY0 = p.y + slip;
      mode.band = band;
      mode.bandT = 0;
      events.push({ type: 'wallBand', band });
    }
    return true;
  },
  step(p, mode, track, ctx, dt, events) {
    if (!track.runnableWall(ctx.d, mode.side)) { leaveWall(p, track, ctx, mode.side, events); return; }
    const wasSlipping = p.wallTime >= WALL.slipFrom;
    p.wallTime += dt;
    mode.t += dt;
    mode.bandT = Math.min(WALL.bandSwitchTime, mode.bandT + dt);
    if (!wasSlipping && p.wallTime >= WALL.slipFrom) events.push({ type: 'wallSlip' });
    const u = smoothstep(mode.bandT / WALL.bandSwitchTime);
    const slip = Math.max(0, p.wallTime - WALL.slipFrom) * WALL.slipSpeed;
    p.x = wallX(mode.side);
    p.y = mode.bandY0 + (wallY(mode.band) - mode.bandY0) * u - slip;
    if (p.wallTime >= WALL.maxTime || p.y < 0.25) leaveWall(p, track, ctx, mode.side, events);
  },
};

/** A half-second arc to the opposite wall, the centre floor, or a fall. */
const WALL_JUMPING: ModeRules<ModeOf<'wallJump'>> = {
  press: () => false,
  step(p, mode, track, ctx, dt) {
    mode.t += dt;
    const u = Math.min(1, (mode.t + EPS) / WALL.jumpTime);
    const target = mode.target;
    const endX = target.kind === 'wall' ? wallX(target.side) : 0;
    const band = mode.y0 >= (WALL.bandLow + WALL.bandHigh) / 2 ? 'high' : 'low';
    const endY = target.kind === 'wall' ? wallY(band) : (track.floorAt(target.d, 0) ?? 0);
    p.x = mode.x0 + (endX - mode.x0) * smoothstep(u);
    p.y = mode.y0 + (endY - mode.y0) * u + 4 * WALL.jumpApex * u * (1 - u);
    if (u < 1) return;
    p.laneT = LANES.changeTime;
    if (target.kind === 'wall' && track.runnableWall(ctx.d, target.side)) {
      p.y = wallY(band);
      p.mode = { kind: 'wallRun', side: target.side, band, t: 0, bandY0: p.y, bandT: WALL.bandSwitchTime };
      p.lane = target.side;
      p.laneFrom = target.side;
    } else if (target.kind === 'floor' && track.floorAt(ctx.d, 0) !== null) {
      p.x = 0;
      p.y = track.floorAt(ctx.d, 0) ?? 0;
      p.vy = 0;
      p.lane = 0;
      p.laneFrom = 0;
      p.mode = { kind: 'run' };
    } else {
      // Nothing to land on here: fall on from the arc's own downward speed, gliding to the nearest lane from where
      // the arc ended (the lane the jump left from would snap x across).
      p.mode = { kind: 'air', t: AIR.coyote };
      p.vy = Math.min(0, (endY - mode.y0 - 4 * WALL.jumpApex) / WALL.jumpTime);
      p.laneFrom = p.x / LANES.width;
      p.lane = toLane(Math.round(p.laneFrom));
      p.laneT = 0;
      p.laneV = 0;
    }
  },
};

/** A wall ending over floor eases back to its outer lane. */
const WALL_EXITING: ModeRules<ModeOf<'wallExit'>> = {
  press: () => false,
  step(p, mode, track, ctx, dt) {
    mode.t += dt;
    const u = smoothstep(mode.t / WALL.exitTime);
    const floor = track.floorAt(ctx.d, mode.side * LANES.width);
    if (floor === null) { p.mode = { kind: 'air', t: AIR.coyote }; p.vy = 0; return; }
    p.x = mode.x0 + (mode.side * LANES.width - mode.x0) * u;
    p.y = mode.y0 + (floor - mode.y0) * u;
    if (mode.t >= WALL.exitTime - EPS) {
      p.x = mode.side * LANES.width;
      p.y = floor;
      p.vy = 0;
      p.lane = mode.side;
      p.laneFrom = mode.side;
      p.laneT = LANES.changeTime;
      p.mode = { kind: 'run' };
    }
  },
};

/** Every mode's rules. */
const MODES: ModeTable = {
  run: RUN,
  jump: JUMPING,
  slide: SLIDING,
  air: AIRBORNE,
  fall: FALLING,
  crash: CRASHED,
  wallAttach: WALL_ATTACH,
  wallRun: WALL_RUNNING,
  wallJump: WALL_JUMPING,
  wallExit: WALL_EXITING,
};
