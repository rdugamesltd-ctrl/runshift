import { Box3, BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Vector3, type Object3D } from 'three';
import { FOG } from '../../balance';
import type { ChunkStreamer, RunState } from '../../game/types';
import type { View, ViewContext } from '../types';

const LOT = 20;
const FIRST = -3;
const LAST = Math.ceil(FOG.far / LOT) + 2;
const LOTS = LAST - FIRST + 1;
const STREET_LENGTH = (LOTS + 2) * LOT;
const PRIMARY_BUILDINGS = ['building-a', 'building-b', 'building-c'] as const;
const EXTRA_BUILDINGS = ['building-d', 'building-e', 'building-f'] as const;
const REAR_BUILDING = 'building-g' as const;
const BUILDINGS = [...PRIMARY_BUILDINGS, ...EXTRA_BUILDINGS, REAR_BUILDING] as const;
const EXTRA_HEIGHTS = { 'building-d': 19, 'building-e': 24, 'building-f': 17, 'building-g': 30 } as const;
const BODY_COLOURS = ['#ef9b78', '#79bdc3', '#f5c66b', '#df847e', '#9fa9d6', '#d6b895'];
const REAR_COLOURS = ['#7198ac', '#8cabb1', '#b5a4a3', '#8597b7'];
const SHOP_COLOURS = ['#ff704e', '#16b5aa', '#f7c33f', '#4c8dcb'];
/** Wall tints for the model buildings, one per lot: a sunny seaside town. */
const WALL_TINTS = ['#ffd49a', '#ffb39c', '#a9e0d2', '#ffe6a0', '#b7d6f5', '#f9c3cf', '#fff0da', '#cbe6a6'].map(c => new Color(c));
type BuildingName = typeof BUILDINGS[number];

interface KitBatch {
  mesh: InstancedMesh;
  /** The lot's wall tint colours this part (its material is marked userData.tint). */
  tint: boolean;
  sourceMatrix: Matrix4;
  name: typeof BUILDINGS[number];
}

type SceneryName = 'street-tree' | 'street-lamp';
interface SceneryBatch {
  mesh: InstancedMesh;
  sourceMatrix: Matrix4;
  name: SceneryName;
}

/** Stable variation for each street lot, including lots behind the origin. */
function variation(index: number, side: number, salt: number): number {
  let n = Math.imul(index + 1013, 73856093) ^ Math.imul(side + 5, 19349663) ^ Math.imul(salt + 1, 83492791);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** A lot keeps its model for the whole run, including while it crosses the streaming anchor. */
export function buildingForLot(lot: number, side: number): BuildingName {
  const phase = ((lot + (side === 1 ? 0 : 7)) % 14 + 14) % 14;
  const district = Math.floor(lot / 20);
  if (phase === 0) return PRIMARY_BUILDINGS[((district % PRIMARY_BUILDINGS.length) + PRIMARY_BUILDINGS.length) % PRIMARY_BUILDINGS.length];
  if (phase === 2 || phase === 6 || phase === 10) return 'building-e';
  if (phase === 4 || phase === 8 || phase === 12) return 'building-f';
  return 'building-d';
}

/** Dense city scenery beside the playable track. All changing scenery is batched by material. */
export class WorldView implements View {
  private readonly group = new Group();
  private readonly box = new BoxGeometry(1, 1, 1);
  private readonly ownedMaterials: MeshLambertMaterial[] = [];
  private readonly bodies: InstancedMesh;
  private readonly roofs: InstancedMesh;
  private readonly windows: InstancedMesh;
  private readonly poles: InstancedMesh;
  private readonly lamps: InstancedMesh;
  private readonly trees: InstancedMesh;
  private readonly markings: InstancedMesh;
  private readonly awnings: InstancedMesh;
  private readonly shopSigns: InstancedMesh;
  private readonly signBands: InstancedMesh;
  private readonly kit: KitBatch[] = [];
  private readonly scenery: SceneryBatch[] = [];
  private readonly sceneryAvailable = new Set<SceneryName>();
  private readonly transform = new Matrix4();
  private readonly modelScale = new Matrix4();
  private anchor = Number.NaN;

  constructor(ctx: ViewContext) {
    const material = (colour: string) => {
      const result = new MeshLambertMaterial({ color: colour });
      this.ownedMaterials.push(result);
      return result;
    };
    const batch = (count: number, colour: string, name: string) => {
      const mesh = new InstancedMesh(this.box, material(colour), count);
      mesh.name = name;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    };
    this.bodies = batch(LOTS * 4, '#ffffff', 'city-buildings');
    this.roofs = batch(LOTS * 4, '#ded4bc', 'city-roofs');
    this.windows = batch(LOTS * 2 * 36, '#dce9ed', 'city-windows');
    this.poles = batch(LOTS * 2 * 3, '#53616b', 'street-lamp-posts');
    this.lamps = batch(LOTS * 2, '#ffe0a0', 'street-lamp-heads');
    this.trees = batch(LOTS * 2 * 2, '#547b63', 'street-trees');
    this.markings = batch(LOTS * 2, '#e2d5ae', 'street-markings');
    this.awnings = batch(LOTS * 2, '#ffffff', 'shop-awnings');
    this.shopSigns = batch(LOTS * 2, '#ffffff', 'shop-signs');
    this.signBands = batch(LOTS * 2, '#fff0ca', 'shop-sign-bands');

    // Pavements and side streets sit outside the run's collision walls.
    const ground = new Mesh(new BoxGeometry(90, 0.2, STREET_LENGTH), material('#8f9aa3'));
    ground.position.set(0, -1.35, -STREET_LENGTH / 2 + 3 * LOT);
    ground.name = 'city-ground';
    this.group.add(ground);
    for (const side of [-1, 1]) {
      const pavement = new Mesh(new BoxGeometry(3.4, 0.2, STREET_LENGTH), material('#d8cfc0'));
      pavement.position.set(side * 5.45, -0.17, -STREET_LENGTH / 2 + 3 * LOT);
      const road = new Mesh(new BoxGeometry(4.5, 0.05, STREET_LENGTH), material('#666a73'));
      road.position.set(side * 9.35, -0.28, pavement.position.z);
      pavement.receiveShadow = true;
      road.receiveShadow = true;
      this.group.add(pavement, road);
    }

    for (const name of BUILDINGS) {
      const template = ctx.assets?.extras(name).template as Object3D | undefined;
      if (!template) continue;
      template.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(template);
      const size = bounds.getSize(new Vector3());
      const centre = bounds.getCenter(new Vector3());
      const normalise = name in EXTRA_HEIGHTS && Math.min(size.x, size.y, size.z) > 0
        ? new Matrix4().makeTranslation(0, EXTRA_HEIGHTS[name as keyof typeof EXTRA_HEIGHTS] / 2 - 0.3, 0)
          .multiply(new Matrix4().makeScale(12 / size.x, EXTRA_HEIGHTS[name as keyof typeof EXTRA_HEIGHTS] / size.y, 15 / size.z))
          .multiply(new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z))
        : new Matrix4();
      template.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const mesh = new InstancedMesh(object.geometry, object.material, LOTS * 2);
        mesh.frustumCulled = false;
        mesh.name = `city-${name}`;
        this.group.add(mesh);
        mesh.receiveShadow = true;
        const material = Array.isArray(object.material) ? object.material[0] : object.material;
        this.kit.push({ mesh, sourceMatrix: normalise.clone().multiply(object.matrixWorld), name, tint: material?.userData?.tint === true });
      });
    }
    for (const [name, height] of [['street-tree', 4.6], ['street-lamp', 4.5]] as const) {
      const template = ctx.assets?.extras(name).template as Object3D | undefined;
      if (!template) continue;
      template.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(template);
      const size = bounds.getSize(new Vector3());
      if (size.y <= 0 || !Number.isFinite(size.y)) continue;
      this.sceneryAvailable.add(name);
      const centre = bounds.getCenter(new Vector3());
      const scale = height / size.y;
      const normalise = new Matrix4().makeScale(scale, scale, scale)
        .multiply(new Matrix4().makeTranslation(-centre.x, -bounds.min.y, -centre.z));
      template.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const mesh = new InstancedMesh(object.geometry, object.material, LOTS * 2);
        mesh.frustumCulled = false;
        mesh.name = `city-${name}`;
        mesh.castShadow = true;
        this.group.add(mesh);
        this.scenery.push({ mesh, sourceMatrix: normalise.clone().multiply(object.matrixWorld), name });
      });
    }
    this.group.name = 'city-infrastructure';
    ctx.scene.add(this.group);
  }

  update(run: RunState, _track: ChunkStreamer, alpha: number, _dt: number): void {
    const d = run.prev.d + (run.d - run.prev.d) * alpha;
    const anchor = Math.floor(d / LOT);
    if (anchor !== this.anchor) {
      this.anchor = anchor;
      this.populate(anchor);
    }
    this.group.position.z = d - anchor * LOT;
  }

  private populate(anchor: number): void {
    const counts = new Map<InstancedMesh, number>();
    const push = (mesh: InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, colour?: string) => {
      const index = counts.get(mesh) ?? 0;
      this.transform.makeScale(sx, sy, sz);
      this.transform.setPosition(x, y, z);
      mesh.setMatrixAt(index, this.transform);
      if (colour) mesh.setColorAt(index, new Color(colour));
      counts.set(mesh, index + 1);
    };
    const kitSlots = new Map<BuildingName, { x: number; y: number; z: number; sx: number; sy: number; sz: number; tint: Color }[]>(BUILDINGS.map(name => [name, []]));
    const scenerySlots = new Map<SceneryName, { x: number; y: number; z: number }[]>([['street-tree', []], ['street-lamp', []]]);
    const available = new Set(this.kit.map(batch => batch.name));
    for (let offset = FIRST; offset <= LAST; offset++) {
      const lot = anchor + offset;
      const z = -offset * LOT;
      for (const side of [-1, 1]) {
        const stagger = side === 1 ? 0 : -5;
        const centreZ = z + stagger;
        const name = buildingForLot(lot, side);
        if (available.has(name)) {
          kitSlots.get(name)?.push({ x: side * 18, y: 0, z: centreZ + 6, sx: 1, sy: 1, sz: 1,
            tint: WALL_TINTS[Math.floor(variation(lot, side, 7) * WALL_TINTS.length)] });
        } else {
          const height = 11 + Math.floor(variation(lot, side, 1) * 5) * 3.6;
          const width = 10 + variation(lot, side, 2) * 3;
          const colour = BODY_COLOURS[Math.floor(variation(lot, side, 3) * BODY_COLOURS.length)];
          push(this.bodies, side * 17.8, height / 2 - 0.3, centreZ, width, height, 15.5, colour);
          push(this.roofs, side * 17.8, height - 0.2, centreZ, width + 0.55, 0.42, 16.1);
          const front = side * (17.8 - width / 2 - 0.05);
          const shopColour = SHOP_COLOURS[Math.floor(variation(lot, side, 10) * SHOP_COLOURS.length)];
          push(this.shopSigns, front - side * 0.11, 3.45, centreZ, 0.22, 1.12, width * 0.73, shopColour);
          push(this.signBands, front - side * 0.24, 3.45, centreZ, 0.08, 0.16, width * 0.57);
          push(this.awnings, front - side * 0.8, 2.55, centreZ, 1.65, 0.18, width * 0.83, shopColour);
          for (let floor = 2; floor < height - 1.5; floor += 3.1) {
            for (let column = -2; column <= 2; column++) {
              const shade = variation(lot, column, floor) > 0.24 ? '#bfeefa' : '#446886';
              push(this.windows, front, floor, centreZ + column * 2.45, 0.07, 1.48, 1.32, shade);
            }
          }
        }

        // A real, lower-poly tower fills every rear lot of the skyline.
        const rearHeight = 22 + Math.floor(variation(lot, side, 4) * 6) * 5;
        if (available.has(REAR_BUILDING)) {
          const sy = rearHeight / EXTRA_HEIGHTS[REAR_BUILDING];
          kitSlots.get(REAR_BUILDING)?.push({ x: side * 35, y: -0.5 + 0.3 * sy, z: centreZ + 4,
            sx: 13 / 12, sy, sz: 17 / 15, tint: WALL_TINTS[Math.floor(variation(lot, side, 8) * WALL_TINTS.length)] });
        } else {
          const rearColour = REAR_COLOURS[Math.floor(variation(lot, side, 5) * REAR_COLOURS.length)];
          push(this.bodies, side * 35, rearHeight / 2 - 0.5, centreZ + 4, 13, rearHeight, 17, rearColour);
          push(this.roofs, side * 35, rearHeight - 0.25, centreZ + 4, 13.6, 0.5, 17.6);
        }

        // Regular street furniture gives the street a readable scale at speed.
        const poleZ = centreZ - 7;
        const poleX = side * 6.7;
        if (this.sceneryAvailable.has('street-lamp')) scenerySlots.get('street-lamp')?.push({ x: poleX, y: -0.07, z: poleZ });
        else {
          push(this.poles, poleX, 2.25, poleZ, 0.13, 4.5, 0.13);
          push(this.poles, side * 7.35, 4.45, poleZ, 1.4, 0.13, 0.13);
          push(this.lamps, side * 8, 4.35, poleZ, 0.65, 0.18, 0.42);
        }
        push(this.markings, side * 9.35, -0.235, centreZ, 0.1, 0.015, 3.5);
        if (variation(lot, side, 6) > 0.42) {
          if (this.sceneryAvailable.has('street-tree')) scenerySlots.get('street-tree')?.push({ x: side * 5.25, y: -0.07, z: centreZ + 3 });
          else {
            push(this.poles, side * 5.25, 0.65, centreZ + 3, 0.2, 1.3, 0.2);
            push(this.trees, side * 5.25, 2.05, centreZ + 3, 1.9, 2.6, 1.9);
            push(this.trees, side * 5.25, 3.3, centreZ + 3, 1.25, 1.3, 1.25);
          }
        }
      }
    }
    for (const [name, positions] of kitSlots) {
      for (const { mesh, sourceMatrix, tint } of this.kit.filter(batch => batch.name === name)) {
        positions.forEach((slot, index) => {
          const { x, y, z, sx, sy, sz } = slot;
          this.transform.makeTranslation(x, y, z).multiply(this.modelScale.makeScale(sx, sy, sz)).multiply(sourceMatrix);
          mesh.setMatrixAt(index, this.transform);
          if (tint) mesh.setColorAt(index, slot.tint);
        });
        mesh.count = positions.length;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    for (const { mesh, sourceMatrix, name } of this.scenery) {
      const positions = scenerySlots.get(name) ?? [];
      positions.forEach(({ x, y, z }, index) => {
        this.transform.makeTranslation(x, y, z).multiply(sourceMatrix);
        mesh.setMatrixAt(index, this.transform);
      });
      mesh.count = positions.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of [this.bodies, this.roofs, this.windows, this.poles, this.lamps, this.trees, this.markings, this.awnings, this.shopSigns, this.signBands]) {
      mesh.count = counts.get(mesh) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.box.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    for (const object of this.group.children) {
      if (object instanceof Mesh && object.geometry !== this.box && !(object instanceof InstancedMesh)) object.geometry.dispose();
    }
  }
}
