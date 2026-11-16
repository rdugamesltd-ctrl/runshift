import { Euler, ExtrudeGeometry, Matrix4, MeshStandardMaterial, Quaternion, Shape, TorusGeometry, Vector3, type BufferGeometry } from 'three';
import { CHUNK, COINS, FOG, LANES, POWERUPS, SIM } from '../../balance';
import type { ChunkStreamer, Coin, RunState } from '../../game/types';
import type { View, ViewContext } from '../types';
import { InstanceBatch } from './instanceBatch';
import { MeshBuilder, place } from './meshBuilder';

/** The coin: radius and thickness, m. */
const COIN_RADIUS = 0.34;
const COIN_THICKNESS = 0.09;
/** Spin, rad/s, and the phase step per metre along the track, so a line of coins ripples. */
const SPIN_RATE = 3.2;
const SPIN_PHASE_PER_METRE = 0.35;
/** Coins this far behind the player are still drawn, m (the camera stands behind him). */
const BEHIND = CHUNK.recycleBehind;
/** The thief's throw leaves his hand this high, m (lower while he slides), and this far to the side. */
const HAND_HEIGHT = 0.95;
const HAND_HEIGHT_SLIDE = 0.45;
const HAND_SIDE = 0.35;
/** A throw lasts this long, s, plus FLIGHT_PER_METRE for each metre it goes sideways; it runs on the sim clock. */
const FLIGHT_TIME = 0.5;
const FLIGHT_PER_METRE = 0.04;
/** The throw falls under this gravity, m/s² (a little more than real, so it reads as a toss, not a float). */
const GRAVITY = 22;
/** On the floor it bounces with this restitution until a bounce would be lower than MIN_BOUNCE_SPEED m/s. */
const RESTITUTION = 0.38;
const MIN_BOUNCE_SPEED = 0.6;
/** Each impact squashes it this much (share of its height) and the squash springs back over SQUASH_TIME s. */
const SQUASH = 0.22;
const SQUASH_TIME = 0.12;
/** It leaves the hand spinning this much faster, rad/s, and the extra spin dies away with this time constant, s. */
const SPIN_BOOST = 16;
const SPIN_DECAY = 0.45;
/** It tumbles this far off upright, rad, swinging at WOBBLE_RATE Hz and settling with time constant WOBBLE_DECAY s. */
const WOBBLE = 0.85;
const WOBBLE_RATE = 2.4;
const WOBBLE_DECAY = 0.32;
/** A coin thrown to a spot in the air (arcs, walls, sky) rises at most this far above the straight line, m. */
const HANG_ARC = 0.5;
/** It grows from this size to full over POP_TIME s, overshooting a little. */
const POP_FROM = 0.45;
const POP_TIME = 0.22;
/** After this long, s, a landed coin is at rest and drawn the cheap way. */
const SETTLE_TIME = 1.6;
/** A lane coin whose centre is this high over the surface under it [min, max], m, is drawn standing on the floor. */
const GROUND_BAND: readonly [number, number] = [0.25, 0.95];
/** A coin on the floor stands on its rim, this high at its centre, m. */
const FLOOR_REST = COIN_RADIUS + 0.02;
/** Coins further out than this are on the walls, m. */
const LANE_REACH = LANES.width + 0.5;

/** A thief coin as drawn: where it rests, and the throw that brought it there. */
interface Drop {
  /** The coin's spot when first seen; the magnet moves x and y later, and a coin object reused elsewhere starts over. */
  d: number;
  x: number;
  y: number;
  /** Centre height at rest: on the floor for lane coins, else where the coin hangs (arcs, walls, sky). */
  restY: number;
  /** Whether it lands on a floor and bounces, or eases into the spot where it hangs. */
  floor: boolean;
  /** Where it left his hand. */
  fromD: number;
  fromX: number;
  fromY: number;
  /** Sim time it left his hand, s: NaN while it is still his, −Infinity when it was down before it was seen. */
  at: number;
  /** Seconds in the air, and its upward speed as it leaves the hand, m/s. */
  flight: number;
  vy: number;
}

/** Scratch objects for the coins drawn with a full transform (in the air or settling). */
const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const euler = new Euler(0, 0, 0, 'YXZ');
const scale = new Vector3();

/**
 * A minted coin standing on its edge, faces towards the run: a raised rim round a recessed face, with a five-point
 * star struck on both sides.
 */
export function coinGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  b.cylinder('#f4a908', 0, 0, 0, COIN_RADIUS - 0.02, COIN_THICKNESS * 0.62, 'z', 18);
  b.add(new TorusGeometry(COIN_RADIUS - COIN_THICKNESS / 2, COIN_THICKNESS / 2, 6, 18), '#ffd640');
  const star = new Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.185 : 0.082;
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  star.closePath();
  const depth = COIN_THICKNESS * 0.9;
  b.add(new ExtrudeGeometry(star, { depth, bevelEnabled: false }), '#ffe26a', place(0, 0, -depth / 2));
  return b.build();
}

/**
 * The run's coins: up to COINS.maxInstances spinning coins in one InstanceBatch (one draw call), from
 * track.coinsIn() between just behind the player and the fog, plus the glide's sky coins. Taken coins are skipped.
 * Every coin is the thief's (fromThief): hidden until he passes it, then tossed from his hand on the sim clock (so a
 * throw never stalls with his pace and pauses with the run), spinning and tumbling. Lane coins fall under gravity and
 * land standing on the floor with a few shrinking, squashy bounces and a wobble on the rim (the run still collects
 * them at chest height, so running over one takes it); arc, wall and sky coins ease into the spot where they hang. A
 * coin the magnet pulls rises from the floor towards the hero. Rendered at z = −(coin.d − dRender).
 * WP-33: magnet flight.
 */
export class CoinsView implements View {
  private readonly batch: InstanceBatch;
  private readonly coins: Coin[] = [];
  private drops = new WeakMap<Coin, Drop>();
  private spin = 0;
  private lastTime = -1;
  /** Sim time this frame, interpolated between steps, s: the throws run on it, so they pause with the run. */
  private now = 0;
  /** The thief this frame, interpolated: distance, his hands, and his pace (m/s). */
  private thiefD = 0;
  private handX = 0;
  private handY = 0;
  private thiefSpeed = 0;

  constructor(ctx: ViewContext) {
    // Polished gold: it mirrors the sky, and glows a little so a coin in a train's shadow still reads.
    const material = new MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.3, emissive: '#c47a00', emissiveIntensity: 0.45 });
    this.batch = new InstanceBatch(coinGeometry(), material, COINS.maxInstances, 'coins');
    this.batch.visible = false;
    ctx.scene.add(this.batch.mesh);
  }

  /** Keeps the menu portrait clear while leaving the run's coins in place. */
  setVisible(visible: boolean): void {
    this.batch.visible = visible;
  }

  update(run: RunState, track: ChunkStreamer, alpha: number, dt: number): void {
    // A clock that went back is a new run: forget the old throws.
    if (run.time < this.lastTime) this.drops = new WeakMap();
    this.lastTime = run.time;
    this.now = run.time - (1 - alpha) * SIM.fixedDt;
    this.spin = (this.spin + SPIN_RATE * dt) % (Math.PI * 2);
    const prev = run.prev;
    const thief = run.thief;
    const d = prev.d + (run.d - prev.d) * alpha;
    this.thiefD = prev.thiefD + (thief.d - prev.thiefD) * alpha;
    this.handX = prev.thiefX + (thief.x - prev.thiefX) * alpha;
    this.handY = prev.thiefY + (thief.y - prev.thiefY) * alpha + (thief.pose === 'slide' ? HAND_HEIGHT_SLIDE : HAND_HEIGHT);
    this.thiefSpeed = Math.max(0, (thief.d - prev.thiefD) / SIM.fixedDt);
    const coins = this.coins;
    const n = track.coinsIn(d - BEHIND, d + FOG.far, coins);
    const batch = this.batch;
    batch.begin();
    for (let i = 0; i < n; i++) this.draw(coins[i], track, d);
    for (const coin of run.airCoins) this.draw(coin, track, d);
    batch.end();
  }

  dispose(): void {
    this.batch.dispose();
    this.batch.mesh.geometry.dispose();
    (this.batch.mesh.material as MeshStandardMaterial).dispose();
  }

  /** Pushes one coin: at rest, in the thief's throw, or not at all (taken, or still his). */
  private draw(coin: Coin, track: ChunkStreamer, d: number): void {
    if (coin.taken) return;
    let spin = this.spin + coin.d * SPIN_PHASE_PER_METRE;
    if (!coin.fromThief) {
      this.batch.push(coin.x, coin.y, -(coin.d - d), spin);
      return;
    }
    const drop = this.drop(coin, track);
    if (Number.isNaN(drop.at)) {
      const thrown = this.thiefD - coin.d;
      if (thrown < 0) return;
      this.launch(coin, drop, thrown);
    }
    const age = Math.max(0, this.now - drop.at);
    // The throw's extra spin dies away smoothly, so there is no jolt when it lands or comes to rest.
    spin += SPIN_BOOST * SPIN_DECAY * (1 - Math.exp(-age / SPIN_DECAY));
    const flight = drop.flight;
    if (age >= flight && (coin.x !== drop.x || coin.y !== drop.y)) {
      // The magnet has it: it rises from the floor as the hero closes in.
      const lift = Math.min(1, Math.max(0, (coin.d - d) / POWERUPS.magnet.ahead));
      this.batch.push(coin.x, coin.y - (drop.y - drop.restY) * lift, -(coin.d - d), spin);
      return;
    }
    if (age >= flight + SETTLE_TIME) {
      this.batch.push(coin.x, drop.restY, -(coin.d - d), spin);
      return;
    }
    let x = coin.x;
    let y = drop.restY;
    let dd = coin.d;
    let squash = 0;
    if (age < flight) {
      // In the air: gravity on the way down, drifting out to its spot and slowing as it gets there.
      const u = age / flight;
      const h = 1 - (1 - u) * (1 - u);
      x = drop.fromX + (coin.x - drop.fromX) * h;
      dd = drop.fromD + (coin.d - drop.fromD) * h;
      y = drop.floor
        ? drop.fromY + drop.vy * age - 0.5 * GRAVITY * age * age
        : drop.fromY + (drop.restY - drop.fromY) * h + 6.75 * HANG_ARC * u * (1 - u) * (1 - u);
    } else if (drop.floor) {
      // Down: bounces that lose height each time, each impact squashing it a little.
      const hit = GRAVITY * flight - drop.vy;
      let t = age - flight;
      let v = hit;
      for (;;) {
        const up = v * RESTITUTION;
        if (up < MIN_BOUNCE_SPEED) break;
        const hop = (2 * up) / GRAVITY;
        if (t < hop) {
          y += up * t - 0.5 * GRAVITY * t * t;
          break;
        }
        t -= hop;
        v = up;
      }
      if (t < SQUASH_TIME && hit > 0) squash = SQUASH * Math.min(1, v / hit) * Math.sin((Math.PI * t) / SQUASH_TIME);
    }
    // Tumbling off upright as it leaves his hand, then wobbling on its rim until it settles.
    const tilt = WOBBLE * Math.exp(-age / WOBBLE_DECAY) * Math.cos(Math.PI * 2 * WOBBLE_RATE * age);
    const size = age < POP_TIME ? POP_FROM + (1 - POP_FROM) * easeOutBack(age / POP_TIME) : 1;
    position.set(x, y - FLOOR_REST * squash, -(dd - d));
    rotation.setFromEuler(euler.set(tilt, spin, 0));
    scale.set(size * (1 + squash * 0.5), size * (1 - squash), size * (1 + squash * 0.5));
    this.batch.pushMatrix(matrix.compose(position, rotation, scale));
  }

  /** The coin's drop record, made when it is first seen. */
  private drop(coin: Coin, track: ChunkStreamer): Drop {
    let drop = this.drops.get(coin);
    if (!drop || drop.d !== coin.d) {
      const restY = restHeight(coin, track);
      drop = { d: coin.d, x: coin.x, y: coin.y, restY, floor: restY !== coin.y, fromD: 0, fromX: 0, fromY: 0, at: Number.NaN, flight: 0, vy: 0 };
      this.drops.set(coin, drop);
    }
    return drop;
  }

  /**
   * He has passed the coin, `thrown` metres ago: it left the hand on its side that long ago at his pace. A coin long
   * passed when first seen is simply down.
   */
  private launch(coin: Coin, drop: Drop, thrown: number): void {
    const lean = coin.x - this.handX;
    const side = Math.abs(lean) > 0.1 ? Math.sign(lean) : Math.floor(coin.d / COINS.spacing) % 2 === 0 ? 1 : -1;
    const fromX = this.handX + side * HAND_SIDE;
    const flight = FLIGHT_TIME + FLIGHT_PER_METRE * Math.abs(coin.x - fromX);
    const ago = this.thiefSpeed > 0 ? thrown / this.thiefSpeed : 0;
    drop.flight = flight;
    if (ago > flight * 0.5) {
      drop.at = Number.NEGATIVE_INFINITY;
      return;
    }
    drop.at = this.now - ago;
    drop.fromD = this.thiefD;
    drop.fromX = fromX;
    drop.fromY = this.handY;
    // The upward speed that brings it down on its spot exactly when the flight ends.
    drop.vy = (drop.restY - drop.fromY) / flight + 0.5 * GRAVITY * flight;
  }
}

/** Eases 0 → 1, overshooting a little before it settles. */
function easeOutBack(u: number): number {
  const c = 1.70158;
  const v = u - 1;
  return 1 + (c + 1) * v * v * v + c * v * v;
}

/** Where a coin's centre is drawn at rest: lane coins at chest height stand on the floor or roof under them. */
function restHeight(coin: Coin, track: ChunkStreamer): number {
  if (Math.abs(coin.x) > LANE_REACH) return coin.y;
  const surface = track.platformAt(coin.d, coin.x) ?? track.floorAt(coin.d, coin.x);
  if (surface === null) return coin.y;
  const over = coin.y - surface;
  return over > GROUND_BAND[0] && over < GROUND_BAND[1] ? surface + FLOOR_REST : coin.y;
}
