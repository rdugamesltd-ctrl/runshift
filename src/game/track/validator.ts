import { CHUNK, SIM, TIERS, WALL } from '../../balance';
import { ActionBuffer } from '../entities/actions';
import { collide } from '../entities/collision';
import { speedFactor, stepPlayer } from '../entities/player';
import { botAction } from '../systems/bot';
import { createRunState } from '../systems/run';
import { createTestTrack } from './testTrack';
import type { Chunk, CollisionBox, GameEvent, Lane } from '../types';
import { placePattern } from './convert';
import { advanceMovingTrains } from './motion';
import type { Pattern } from './patterns';

/** What the validator says about one pattern at one speed. `tightestGap` is in beats. */
export interface ValidationResult {
  solvable: boolean;
  pathOk: boolean;
  minActions: number;
  tightestGap: number;
}

/**
 * Checks authoring rules and replays the path through the real player and collision code at speed `v`.
 * WP-42 adds a breadth-first search for alternative paths and exact minimum-action counts.
 */
export function validatePattern(pattern: Pattern, v: number): ValidationResult {
  const actions = pattern.path.filter(key => key.act).map(key => key.t);
  let lane: Lane = 0;
  let minActions = actions.length;
  for (const key of pattern.path) {
    if (key.lane !== undefined && key.lane !== lane) {
      minActions += Math.abs(key.lane - lane);
      lane = key.lane;
    }
  }
  let tightestGap = Infinity;
  for (let i = 1; i < actions.length; i++) tightestGap = Math.min(tightestGap, actions[i] - actions[i - 1]);
  const minTierGap = Math.max(...pattern.tiers.map(tier => TIERS[tier].minGap));
  let rules = minActions === pattern.actions && tightestGap + 1e-9 >= minTierGap;
  for (const wall of pattern.walls) {
    const length = wall.t1 - wall.t0;
    if (length < WALL.minLength - 1e-9 || length > WALL.maxLength + 1e-9) rules = false;
    for (const gap of pattern.gaps) {
      if (wall.t1 > gap.t0 && wall.t1 < gap.t1 && !pattern.path.some(key => key.act === 'wallJump' && key.t < wall.t1)) rules = false;
    }
  }
  for (const gap of pattern.gaps) {
    const serving = pattern.walls.filter(wall => wall.t0 < gap.t1 && wall.t1 > gap.t0);
    if (serving.length === 0 && gap.t1 - gap.t0 > 0.45 + 1e-9) rules = false;
    if (serving.length > 0 && !serving.some(wall => wall.t0 <= gap.t0 - WALL.leadIn + 1e-9)) rules = false;
  }
  const chunk: Chunk = {
    index: 0, start: 0, length: CHUNK.length, shell: 'street', district: 'street', tier: 0, seed: 0,
    floors: [{ start: 0, end: CHUNK.length, y: 0 }], walls: [], boxes: [], coins: [], pickups: [],
    path: [{ d: 0, lane: 0 }], patterns: [],
  };
  placePattern(pattern, chunk, v);
  for (const coin of chunk.coins) {
    if (chunk.boxes.some(box => coin.d >= box.d0 && coin.d <= box.d1 && coin.x >= box.x0 && coin.x <= box.x1 && coin.y >= box.y0 && coin.y <= box.y1)) rules = false;
  }
  const track = createTestTrack({
    floors: [{ start: -CHUNK.length, end: 0, y: 0 }, ...chunk.floors, { start: CHUNK.length, end: 2 * CHUNK.length, y: 0 }],
    walls: chunk.walls, boxes: chunk.boxes, coins: chunk.coins, path: chunk.path,
  });
  const state = createRunState();
  state.phase = 'running';
  state.v = v;
  const buffer = new ActionBuffer();
  const events: GameEvent[] = [];
  const boxes: CollisionBox[] = [];
  let survived = true;
  for (let steps = 0; steps < 1000 && state.d < CHUNK.length; steps++) {
    const action = botAction('perfect', state, track);
    if (action) buffer.push(action, state.time);
    state.time += SIM.fixedDt;
    state.prev.d = state.d;
    state.prev.x = state.player.x;
    state.prev.y = state.player.y;
    state.v = v * speedFactor(state.player);
    state.d += state.v * SIM.fixedDt;
    advanceMovingTrains(chunk.boxes, state.d, SIM.fixedDt);
    stepPlayer(state.player, track, state, buffer, SIM.fixedDt, events);
    collide(state, track, events, boxes);
    if (state.player.mode.kind === 'crash' || state.player.mode.kind === 'fall') { survived = false; break; }
  }
  if (state.d < CHUNK.length) survived = false;
  return { solvable: survived, pathOk: survived && rules, minActions, tightestGap };
}
