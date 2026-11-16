import { AdditiveBlending, Box3, BoxGeometry, CircleGeometry, Color, DoubleSide, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, Vector3, type Material, type Object3D } from 'three';
import { CHUNK, FOG, TRAINS } from '../../balance';
import type { ChunkStreamer, CollisionBox, ObstacleKind, RunState } from '../../game/types';
import type { KitModel, View, ViewContext } from '../types';
import { InstanceBatch } from './instanceBatch';
import { obstacleGeometry, TRAIN_LIVERIES, trainGeometry, trainRampGeometry } from './obstacleModels';

const CAPACITY = 256;
const BEHIND = CHUNK.recycleBehind;

/** Colours for the optional grey-box view. */
export const OBSTACLE_COLOURS: Readonly<Record<ObstacleKind, string>> = {
  barrierLow: '#ff7a1f', barrierHigh: '#e8402e', blocker: '#5b6478', car: '#ffbf2a',
  metroCar: '#2a9d8f', roofUnit: '#a3a9b4', wallSignHigh: '#e8402e',
  wallVentLow: '#3d8bd9', wallPipeFull: '#2b2f3a',
};

interface AuthoredPart {
  batch: InstanceBatch;
  source: Matrix4;
}
interface AuthoredModel {
  parts: AuthoredPart[];
  centre: Vector3;
  size: Vector3;
}
const KIT_NAMES: Partial<Record<ObstacleKind, KitModel>> = {
  barrierLow: 'barrier-low', blocker: 'blocker',
  car: 'car-taxi', roofUnit: 'roof-unit',
};

/** Detailed, instanced obstacles aligned to their collision boxes. */
export class ObstaclesView implements View {
  private readonly boxes: CollisionBox[] = [];
  private readonly models = new Map<ObstacleKind, InstanceBatch>();
  private readonly ramps: InstanceBatch;
  /** Carriages, one batch per livery; a train keeps the livery of its box id. */
  private readonly trains: InstanceBatch[];
  /** Headlamps and their glow on the near end of oncoming trains. */
  private readonly lamps: InstanceBatch;
  private readonly glows: InstanceBatch;
  private readonly authored = new Map<ObstacleKind, AuthoredModel>();
  private readonly matrix = new Matrix4();
  private readonly scale = new Matrix4();
  private readonly centre = new Matrix4();
  private readonly greybox: InstanceBatch | null;
  private readonly colours = new Map<ObstacleKind, Color>();
  private readonly unknown = new Color('#c8ccd4');

  constructor(ctx: ViewContext) {
    this.ramps = new InstanceBatch(trainRampGeometry(), new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }), CAPACITY, 'train-ramps');
    ctx.scene.add(this.ramps.mesh);
    this.trains = TRAIN_LIVERIES.map((_, i) => {
      const batch = new InstanceBatch(trainGeometry(i), new MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.12 }), CAPACITY, `train-livery-${i}`);
      ctx.scene.add(batch.mesh);
      return batch;
    });
    this.lamps = new InstanceBatch(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: '#fff8d6' }), 32, 'train-lamps');
    this.glows = new InstanceBatch(new CircleGeometry(0.5, 20), new MeshBasicMaterial({
      color: '#ffe58a', transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false }), 32, 'train-lamp-glow');
    ctx.scene.add(this.lamps.mesh, this.glows.mesh);
    if (!ctx.assets) {
      this.greybox = new InstanceBatch(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({ color: '#ffffff' }), CAPACITY, 'obstacles-greybox', { colours: true });
      for (const kind of Object.keys(OBSTACLE_COLOURS) as ObstacleKind[]) this.colours.set(kind, new Color(OBSTACLE_COLOURS[kind]));
      ctx.scene.add(this.greybox.mesh);
      const sign = new InstanceBatch(obstacleGeometry('barrierHigh'), new MeshLambertMaterial({ vertexColors: true }), CAPACITY, 'obstacle-barrierHigh');
      this.models.set('barrierHigh', sign);
      ctx.scene.add(sign.mesh);
      this.shadows();
      return;
    }
    this.greybox = null;
    for (const [kind, name] of Object.entries(KIT_NAMES) as [ObstacleKind, KitModel][]) {
      const template = ctx.assets.extras(name).template as Object3D | undefined;
      if (!template) continue;
      template.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(template);
      const model: AuthoredModel = { parts: [], centre: bounds.getCenter(new Vector3()), size: bounds.getSize(new Vector3()) };
      if (Math.min(model.size.x, model.size.y, model.size.z) <= 0) continue;
      template.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const batch = new InstanceBatch(object.geometry, object.material, CAPACITY, `obstacle-${kind}`);
        ctx.scene.add(batch.mesh);
        model.parts.push({ batch, source: object.matrixWorld.clone() });
      });
      if (model.parts.length) this.authored.set(kind, model);
    }
    for (const kind of Object.keys(OBSTACLE_COLOURS) as ObstacleKind[]) {
      if (this.authored.has(kind) || kind === 'metroCar') continue;
      const batch = new InstanceBatch(obstacleGeometry(kind), new MeshLambertMaterial({ vertexColors: true }), CAPACITY, `obstacle-${kind}`);
      this.models.set(kind, batch);
      ctx.scene.add(batch.mesh);
    }
    this.shadows();
  }

  /** Every solid obstacle casts and takes the sun's shadow (the lamp glow does not). */
  private shadows(): void {
    const solid: InstanceBatch[] = [this.ramps, ...this.trains, ...this.models.values()];
    if (this.greybox) solid.push(this.greybox);
    for (const model of this.authored.values()) for (const { batch } of model.parts) solid.push(batch);
    for (const { mesh } of solid) {
      if (!(mesh instanceof InstancedMesh)) continue;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  }

  update(run: RunState, track: ChunkStreamer, alpha: number, _dt: number): void {
    const d = run.prev.d + (run.d - run.prev.d) * alpha;
    const n = track.boxesIn(d - BEHIND, d + FOG.far, this.boxes);
    this.greybox?.begin();
    this.ramps.begin();
    this.lamps.begin();
    this.glows.begin();
    for (const batch of this.trains) batch.begin();
    for (const batch of this.models.values()) batch.begin();
    for (const model of this.authored.values()) for (const { batch } of model.parts) batch.begin();
    for (let i = 0; i < n; i++) {
      const box = this.boxes[i];
      if (box.broken) continue;
      const x = (box.x0 + box.x1) / 2;
      const y = (box.y0 + box.y1) / 2;
      const z = -((box.d0 + box.d1) / 2 - d);
      const width = Math.max(box.x1 - box.x0, 0.01);
      const height = Math.max(box.y1 - box.y0, 0.01);
      const depth = Math.max(box.d1 - box.d0, 0.01);
      if (box.kind === 'metroCar') {
        const rampDepth = Math.min(box.rampLength ?? 0, depth);
        if (rampDepth > 0) {
          const rampZ = -(box.d0 + rampDepth / 2 - d);
          this.ramps.push(x, y, rampZ, 0, width, height, rampDepth);
        }
        const roofDepth = depth - rampDepth;
        if (roofDepth <= 0) continue;
        const carriages = Math.ceil(roofDepth / TRAINS.carriageLength);
        const carriageDepth = roofDepth / carriages;
        const livery = this.trains[((box.id * 7 + Math.round(box.x0)) % this.trains.length + this.trains.length) % this.trains.length];
        for (let carriage = 0; carriage < carriages; carriage++) {
          const carriageZ = -(box.d0 + rampDepth + (carriage + 0.5) * carriageDepth - d);
          // A small gap between carriages shows the coupling.
          livery.push(x, y, carriageZ, 0, width, height, carriageDepth - (carriages > 1 ? 0.25 : 0));
        }
        if (box.vd < 0) {
          // Oncoming: lit headlamps on the end facing the player.
          const nearZ = -(box.d0 - d) + 0.03;
          for (const side of [-1, 1]) {
            const lx = x + side * width * 0.32;
            const ly = box.y0 + height * 0.26;
            this.lamps.push(lx, ly, nearZ, 0, 0.24, 0.17, 0.04);
            this.glows.push(lx, ly, nearZ + 0.04, 0, 1.1, 1.1, 1);
          }
        }
      } else if (this.greybox && box.kind === 'barrierHigh') {
        this.models.get(box.kind)?.push(x, y, z, 0, width, height, depth);
      } else if (this.greybox) {
        if (this.greybox.push(x, y, z, 0, width, height, depth)) this.greybox.color(this.colours.get(box.kind) ?? this.unknown);
      } else if (this.authored.has(box.kind)) {
        const model = this.authored.get(box.kind)!;
        this.scale.makeScale(width / model.size.x, height / model.size.y, depth / model.size.z);
        this.centre.makeTranslation(-model.centre.x, -model.centre.y, -model.centre.z);
        for (const { batch, source } of model.parts) {
          this.matrix.makeTranslation(x, y, z).multiply(this.scale).multiply(this.centre).multiply(source);
          batch.pushMatrix(this.matrix);
        }
      } else this.models.get(box.kind)?.push(x, y, z, 0, width, height, depth);
    }
    this.greybox?.end();
    this.ramps.end();
    this.lamps.end();
    this.glows.end();
    for (const batch of this.trains) batch.end();
    for (const batch of this.models.values()) batch.end();
    for (const model of this.authored.values()) for (const { batch } of model.parts) batch.end();
  }

  dispose(): void {
    for (const batch of [...this.trains, this.lamps, this.glows]) {
      batch.dispose();
      batch.mesh.geometry.dispose();
      (batch.mesh.material as Material).dispose();
    }
    this.ramps.dispose();
    this.ramps.mesh.geometry.dispose();
    (this.ramps.mesh.material as MeshLambertMaterial).dispose();
    if (this.greybox) {
      this.greybox.dispose();
      this.greybox.mesh.geometry.dispose();
      (this.greybox.mesh.material as MeshLambertMaterial).dispose();
    }
    for (const batch of this.models.values()) {
      batch.dispose();
      batch.mesh.geometry.dispose();
      (batch.mesh.material as MeshLambertMaterial).dispose();
    }
    // Authored geometry and materials belong to the asset registry and can be reused by other views.
    for (const model of this.authored.values()) for (const { batch } of model.parts) batch.dispose();
  }
}
