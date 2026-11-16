import {
  AdditiveBlending, BoxGeometry, BufferAttribute, type BufferGeometry, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry,
  Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry, RingGeometry, SphereGeometry, TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHUNK, FOG } from '../../balance';
import type { ChunkStreamer, Pickup, PowerUpKind, RunState } from '../../game/types';
import type { View, ViewContext } from '../types';
import { InstanceBatch } from './instanceBatch';

const BEHIND = CHUNK.recycleBehind;
const CAPACITY = 16;
/** Spin, rad/s; bob height, m, and rate, rad/s. */
const SPIN_RATE = 2.4;
const BOB = 0.12;
const BOB_RATE = 3.5;
/** Halo colour behind each pickup, by kind. */
const HALO: Readonly<Record<PowerUpKind, string>> = {
  magnet: '#ff4d5e', multiplier: '#7cff4f', shield: '#3ec9ff', glide: '#ffa12a',
};

/** Paints a geometry one colour (vertex colours) after scaling and moving it. */
function part(geometry: BufferGeometry, colour: string, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): BufferGeometry {
  geometry.applyMatrix4(new Matrix4().makeRotationX(rx));
  geometry.applyMatrix4(new Matrix4().makeRotationZ(rz));
  geometry.applyMatrix4(new Matrix4().makeScale(sx, sy, sz));
  geometry.translate(x, y, z);
  const c = new Color(colour);
  const n = geometry.getAttribute('position').count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i += 3) { data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b; }
  geometry.setAttribute('color', new BufferAttribute(data, 3));
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/** The pickup's icon, about 0.8 m across, centred on its origin. */
export function pickupGeometry(kind: PowerUpKind): BufferGeometry {
  const parts: BufferGeometry[] = [];
  if (kind === 'magnet') {
    // A horseshoe magnet: red arch, two silver tips.
    parts.push(part(new TorusGeometry(0.26, 0.1, 8, 16, Math.PI), '#e8303f', 0, 0.05, 0));
    for (const x of [-0.26, 0.26]) {
      parts.push(part(new CylinderGeometry(0.1, 0.1, 0.22, 10), '#e8303f', x, -0.06, 0));
      parts.push(part(new CylinderGeometry(0.1, 0.1, 0.14, 10), '#eef2f5', x, -0.24, 0));
    }
  } else if (kind === 'multiplier') {
    // A green gem with a gold band: double points.
    parts.push(part(new OctahedronGeometry(0.34, 0), '#4fe05a', 0, 0, 0, 1, 1.25, 0.7));
    parts.push(part(new TorusGeometry(0.3, 0.045, 6, 20), '#ffd23f', 0, 0, 0, 1, 1, 1, Math.PI / 2));
  } else if (kind === 'shield') {
    // A round blue shield with a white rim and a gold star boss.
    parts.push(part(new CylinderGeometry(0.36, 0.36, 0.1, 20), '#2a8dff', 0, 0, 0, 1, 1, 1, Math.PI / 2));
    parts.push(part(new TorusGeometry(0.36, 0.05, 6, 24), '#f4fbff'));
    parts.push(part(new OctahedronGeometry(0.13, 0), '#ffd23f', 0, 0, 0.08, 1, 1, 0.6));
  } else {
    // A twin-tank jet pack with orange nozzles.
    for (const x of [-0.16, 0.16]) {
      parts.push(part(new CylinderGeometry(0.13, 0.13, 0.5, 12), '#eceff3', x, 0.04, 0));
      parts.push(part(new SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#ff7a1f', x, 0.29, 0));
      parts.push(part(new ConeGeometry(0.1, 0.16, 10), '#3a4250', x, -0.28, 0, 1, 1, 1, Math.PI));
    }
    parts.push(part(new BoxGeometry(0.2, 0.3, 0.12), '#ff7a1f', 0, 0.04, -0.04));
  }
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error(`Cannot build the ${kind} pickup`);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Power-ups on the track (one instanced icon per kind, spinning and bobbing in a glowing halo) and their effects
 * on the hero: a shield bubble while the shield holds, jet flames while gliding.
 */
export class PickupsView implements View {
  private readonly pickups: Pickup[] = [];
  private readonly icons = new Map<PowerUpKind, InstanceBatch>();
  private readonly halos: InstanceBatch;
  private readonly haloColours = new Map<PowerUpKind, Color>();
  private readonly bubble: Mesh;
  private readonly jets = new Group();
  private readonly flames: Mesh[] = [];
  private time = 0;

  constructor(ctx: ViewContext) {
    for (const kind of Object.keys(HALO) as PowerUpKind[]) {
      const batch = new InstanceBatch(pickupGeometry(kind), new MeshLambertMaterial({ vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0.18 }), CAPACITY, `pickup-${kind}`);
      this.icons.set(kind, batch);
      this.haloColours.set(kind, new Color(HALO[kind]));
      ctx.scene.add(batch.mesh);
    }
    const halo = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false });
    this.halos = new InstanceBatch(new RingGeometry(0.42, 0.62, 28), halo, CAPACITY * 4, 'pickup-halos', { colours: true });
    ctx.scene.add(this.halos.mesh);

    this.bubble = new Mesh(new IcosahedronGeometry(1, 2), new MeshBasicMaterial({
      color: '#59c8ff', transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false,
    }));
    this.bubble.name = 'shield-bubble';
    this.bubble.visible = false;
    ctx.scene.add(this.bubble);

    const flame = new MeshBasicMaterial({ color: '#ffb23a', transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false });
    const cone = new ConeGeometry(0.13, 0.9, 10);
    cone.rotateX(Math.PI);
    for (const x of [-0.17, 0.17]) {
      const mesh = new Mesh(cone, flame);
      mesh.position.set(x, 0.55, 0.32);
      this.flames.push(mesh);
      this.jets.add(mesh);
    }
    const tank = new Mesh(new CylinderGeometry(0.12, 0.12, 0.5, 10), new MeshLambertMaterial({ color: '#eceff3' }));
    for (const x of [-0.17, 0.17]) {
      const t = tank.clone();
      t.position.set(x, 1.15, 0.3);
      this.jets.add(t);
    }
    this.jets.name = 'glide-jets';
    this.jets.visible = false;
    ctx.scene.add(this.jets);
  }

  update(run: RunState, track: ChunkStreamer, alpha: number, dt: number): void {
    this.time += dt;
    const prev = run.prev;
    const d = prev.d + (run.d - prev.d) * alpha;
    const n = track.pickupsIn(d - BEHIND, d + FOG.far, this.pickups);
    for (const batch of this.icons.values()) batch.begin();
    this.halos.begin();
    const spin = this.time * SPIN_RATE;
    for (let i = 0; i < n; i++) {
      const pickup = this.pickups[i];
      if (pickup.taken) continue;
      const y = pickup.y + Math.sin(this.time * BOB_RATE + pickup.d) * BOB;
      const z = -(pickup.d - d);
      this.icons.get(pickup.kind)?.push(pickup.x, y, z, spin);
      const pulse = 1 + 0.08 * Math.sin(this.time * 6 + pickup.d);
      if (this.halos.push(pickup.x, y, z - 0.05, 0, pulse, pulse, 1)) this.halos.color(this.haloColours.get(pickup.kind)!);
    }
    for (const batch of this.icons.values()) batch.end();
    this.halos.end();

    const p = run.player;
    const x = prev.x + (p.x - prev.x) * alpha;
    const y = prev.y + (p.y - prev.y) * alpha;
    const shielded = run.powerUps.shield > 0 && p.mode.kind !== 'crash';
    this.bubble.visible = shielded;
    if (shielded) {
      const wobble = 1 + 0.04 * Math.sin(this.time * 9);
      this.bubble.position.set(x, y + p.height / 2, 0);
      this.bubble.scale.set(0.85 * wobble, (p.height / 2 + 0.35) / wobble, 0.85 * wobble);
      // Blink in the last two seconds so the end is no surprise.
      const left = run.powerUps.shield;
      (this.bubble.material as MeshBasicMaterial).opacity = left < 2 && Math.floor(this.time * 8) % 2 === 0 ? 0.08 : 0.22;
    }
    this.jets.visible = p.gliding;
    if (p.gliding) {
      this.jets.position.set(x, y, 0);
      for (const flame of this.flames) {
        const flicker = 0.8 + 0.4 * Math.random();
        flame.scale.set(1, flicker, 1);
      }
    }
  }

  dispose(): void {
    for (const batch of this.icons.values()) {
      batch.dispose();
      batch.mesh.geometry.dispose();
      (batch.mesh.material as MeshLambertMaterial).dispose();
    }
    this.halos.dispose();
    this.halos.mesh.geometry.dispose();
    (this.halos.mesh.material as MeshBasicMaterial).dispose();
    this.bubble.removeFromParent();
    this.bubble.geometry.dispose();
    (this.bubble.material as MeshBasicMaterial).dispose();
    this.jets.removeFromParent();
  }
}
