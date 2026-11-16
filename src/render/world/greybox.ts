import { BoxGeometry, CapsuleGeometry, Color, Group, Mesh, MeshLambertMaterial, MeshStandardMaterial, type Vector3 } from 'three';
import { CHUNK, FOG, LANES, PLAYER, SLIDE, WALL } from '../../balance';
import type { ChunkStreamer, RunState, WallSpan } from '../../game/types';
import { disposeObject } from '../dispose';
import { InstanceBatch } from '../instancing/instanceBatch';
import type { View, ViewContext } from '../types';
import { concreteTexture, gravelTexture, muralAtlas, muralMaterial, projectOnTrack, setTrackScroll, wallRunTexture } from './trackSurfaces';

/** Slab under each floor span, m: thick enough that the far edge of a pit reads as a cliff. */
const FLOOR_THICKNESS = 1.2;
/** Kerb along each wall plane, on the floor: width and height, m. Its outer face is the wall plane. */
const KERB_WIDTH = 0.28;
const KERB_HEIGHT = 0.14;
/** Wall panels stand just outside the wall plane: thickness, top and bottom, m. */
const WALL_THICKNESS = 0.3;
const WALL_TOP = 3.6;
const WALL_BOTTOM = -FLOOR_THICKNESS;
/** Things this far behind the player are still drawn, m (the camera stands behind him). */
const BEHIND = CHUNK.recycleBehind;
/** Copies per batch: a few spans per chunk, CHUNK.maxActive chunks. */
const MAX_SPANS = CHUNK.maxActive * 8;
const RAIL_X = [-LANES.width - 0.55, -LANES.width + 0.55, -0.55, 0.55, LANES.width - 0.55, LANES.width + 0.55] as const;
/** The yard is sunken: the gravel's top sits this far below the running surface (y = 0), m. Ballast beds, sleepers and
 *  rails build back up to it, so the feet and the trains' wheels sit on the rails. */
const YARD_DROP = 0.14;
const BED_WIDTH = 1.9;
const BED_HEIGHT = 0.06;
const SLEEPER_EVERY = 0.95;
const SLEEPER_HEIGHT = 0.06;
const RAIL_HEIGHT = 0.11;
const MAX_SLEEPERS = 3 * (Math.ceil((BEHIND + FOG.far) / SLEEPER_EVERY) + 4);
/** The painted retaining wall behind each kerb: panel length, height and thickness, and its x, m. */
const FENCE_EVERY = 5;
const FENCE_HEIGHT = 1.1;
const FENCE_THICKNESS = 0.3;
const FENCE_X = WALL.planeX + 0.75;
const MAX_FENCE = 2 * (Math.ceil((BEHIND + FOG.far) / FENCE_EVERY) + 2);
/** Concrete pilasters stand over the joints between mural panels: width across and along, height above the cap, m. */
const PILASTER = { across: 0.46, along: 0.5, rise: 0.22 } as const;
/** A yellow safety line along each platform edge: width, m. */
const EDGE_LINE = 0.1;
/** Overhead line gantries: one every `every` m; posts at ±postX, the beam's height, the contact wires' height, m. */
const GANTRY = { every: 40, postX: FENCE_X + 0.62, post: 0.26, beamY: 9.4, beam: 0.34, wireY: 8.6, wire: 0.035 } as const;
const MAX_GANTRY = (Math.ceil((BEHIND + FOG.far) / GANTRY.every) + 2) * 9 + 3;
/** A crash tips the hero back this far, radians, over this long, s. */
const CRASH_TILT = 1.35;
const CRASH_TILT_TIME = 0.3;
/** Squashing the capsule (sliding) widens it by this share of the squash, like a cartoon. */
const SQUASH_WIDEN = 0.35;
/** While invulnerable the hero blinks this many times a second. */
const BLINK_RATE = 12;

const COLOURS = {
  floor: '#ffffff',
  floorRaised: '#d9cdbd',
  gravel: '#7b6c60',
  ballast: '#a39485',
  sleeper: '#6d4d39',
  kerb: '#ebe2d2',
  concrete: '#d6ccbb',
  steel: '#465c69',
  edgeLine: '#ffc629',
  wall: '#ffffff',
  hero: '#17b3a3',
  thief: '#2f3440',
};

/** Wall panels by surface (WP-13 and WP-25 bring the real ones). */
const WALL_COLOURS: Readonly<Record<WallSpan['surface'], string>> = {
  hoarding: '#ffad42',
  facade: '#ff8266',
  billboard: '#ffd447',
  tunnel: '#93a8ba',
};

/** Scales a capsule `full` m tall down to `height` m, widening it as it squashes (writes into `scale`). */
export function setSquash(scale: Vector3, height: number, full: number): Vector3 {
  const up = Math.min(1.2, Math.max(0.3, height / full));
  const across = 1 + (1 - up) * SQUASH_WIDEN;
  return scale.set(across, up, across);
}

/** A capsule `height` m tall standing on its origin (the feet). */
function capsule(height: number, radius: number): CapsuleGeometry {
  const geometry = new CapsuleGeometry(radius, height - 2 * radius, 4, 12);
  geometry.translate(0, height / 2, 0);
  return geometry;
}

/**
 * The track, drawn from the live chunks in a handful of draw calls: a sunken gravel yard slab per FloorSpan (pits are
 * simply gaps) with a ballast bed, dense sleepers and two rails per lane, a concrete kerb along each wall plane
 * (x = ±WALL.planeX), a painted retaining wall behind each kerb, a panel per WallSpan just outside its plane, and in
 * grey-box mode a teal capsule for the hero (x, y, squashed to his box height when sliding, tipped back on a crash)
 * and a charcoal capsule for the thief. Obstacles and
 * coins are their own views (ObstaclesView, CoinsView). Everything at track distance s renders at
 * z = −(s − dRender), with dRender interpolated between the last two steps.
 * WP-13: wall panels with hazard edges, the pit void, band colours, the 70° wall roll.
 */
export class GreyboxView implements View {
  private readonly group = new Group();
  private readonly floors: InstanceBatch;
  private readonly floorNormal = new Color(COLOURS.floor);
  private readonly floorRaised = new Color(COLOURS.floorRaised);
  private readonly beds: InstanceBatch;
  private readonly fence: InstanceBatch;
  /** Wall caps and pilasters, in one batch of cast concrete. */
  private readonly fenceCaps: InstanceBatch;
  private readonly edgeLines: InstanceBatch;
  /** Overhead line gantries and wires (not in grey-box mode). */
  private readonly gantries: InstanceBatch | null;
  private readonly kerbs: InstanceBatch;
  private readonly rails: InstanceBatch;
  private readonly sleepers: InstanceBatch;
  private readonly walls: InstanceBatch;
  private readonly wallColours = new Map<WallSpan['surface'], Color>();
  private readonly hero: Mesh;
  private readonly thief = new Group();
  private time = 0;
  private readonly drawCharacters: boolean;
  private firstPerson = false;

  /** Hides the placeholder hero while the camera is at his eyes. */
  setFirstPerson(active: boolean): void { this.firstPerson = active; }

  constructor(ctx: ViewContext, drawCharacters = true) {
    this.drawCharacters = drawCharacters;
    const box = new BoxGeometry(1, 1, 1);
    const gravel = projectOnTrack(new MeshLambertMaterial({ color: COLOURS.gravel, map: gravelTexture('#e9e4dc', '#ffffff', '#b9afa3') }), 4, 'top');
    const ballast = projectOnTrack(new MeshLambertMaterial({ color: COLOURS.ballast, map: gravelTexture('#ece7df', '#ffffff', '#c2b9ad', 19) }), 2, 'top');
    const kerb = projectOnTrack(new MeshLambertMaterial({ color: COLOURS.kerb, map: concreteTexture('#f6f2ea') }), 2, 'top');
    const mural = muralMaterial(new MeshLambertMaterial({ color: '#ffffff', map: muralAtlas() }));
    const boards = projectOnTrack(new MeshLambertMaterial({ color: COLOURS.wall, map: wallRunTexture() }), 4, 'side');
    // Polished rail heads mirror the sky.
    const steel = new MeshStandardMaterial({ color: '#d9dcdd', metalness: 0.35, roughness: 0.5, envMapIntensity: 0.6 });
    this.floors = new InstanceBatch(box, gravel, MAX_SPANS, 'greybox-floors', { colours: true });
    this.kerbs = new InstanceBatch(box, kerb, MAX_SPANS * 2, 'greybox-kerbs');
    this.rails = new InstanceBatch(box, steel, MAX_SPANS * RAIL_X.length, 'track-rails');
    this.sleepers = new InstanceBatch(box, new MeshLambertMaterial({ color: COLOURS.sleeper }), MAX_SLEEPERS, 'track-sleepers');
    this.beds = new InstanceBatch(box, ballast, MAX_SPANS * 3, 'track-ballast');
    this.fence = new InstanceBatch(box, mural, MAX_FENCE, 'yard-wall');
    this.fenceCaps = new InstanceBatch(box, new MeshLambertMaterial({ color: COLOURS.concrete }), MAX_FENCE * 2, 'yard-wall-caps');
    this.edgeLines = new InstanceBatch(box, new MeshLambertMaterial({ color: COLOURS.edgeLine, emissive: COLOURS.edgeLine, emissiveIntensity: 0.25 }), MAX_SPANS * 2, 'platform-edge-lines');
    this.walls = new InstanceBatch(box, boards, MAX_SPANS, 'greybox-walls', { colours: true });
    this.gantries = ctx.assets ? new InstanceBatch(box, new MeshLambertMaterial({ color: COLOURS.steel }), MAX_GANTRY, 'overhead-gantries') : null;
    for (const batch of [this.floors, this.kerbs, this.sleepers, this.beds, this.fence, this.fenceCaps, this.walls]) batch.mesh.receiveShadow = true;
    for (const batch of [this.fence, this.fenceCaps, this.walls, this.gantries]) if (batch) batch.mesh.castShadow = true;
    for (const surface of Object.keys(WALL_COLOURS) as WallSpan['surface'][]) this.wallColours.set(surface, new Color(WALL_COLOURS[surface]));

    const radius = PLAYER.width / 2;
    const body = capsule(PLAYER.height, radius);
    this.hero = new Mesh(body, new MeshLambertMaterial({ color: COLOURS.hero }));
    this.hero.name = 'greybox-hero';

    const thiefBody = new Mesh(body, new MeshLambertMaterial({ color: COLOURS.thief }));
    this.thief.add(thiefBody);
    this.thief.name = 'greybox-thief';

    this.group.name = 'greybox';
    this.group.add(this.floors.mesh, this.kerbs.mesh, this.rails.mesh, this.sleepers.mesh, this.walls.mesh,
      this.beds.mesh, this.fence.mesh, this.fenceCaps.mesh, this.edgeLines.mesh);
    if (this.gantries) this.group.add(this.gantries.mesh);
    if (drawCharacters) this.group.add(this.hero, this.thief);
    ctx.scene.add(this.group);
  }

  update(run: RunState, track: ChunkStreamer, alpha: number, dt: number): void {
    this.time += dt;
    const prev = run.prev;
    const d = prev.d + (run.d - prev.d) * alpha;
    setTrackScroll(d);
    this.drawTrack(track, d);
    if (this.drawCharacters) {
      this.drawHero(run, alpha);
      this.drawThief(run, alpha, d);
    }
  }

  dispose(): void {
    disposeObject(this.group);
  }

  private drawTrack(track: ChunkStreamer, d: number): void {
    const lo = d - BEHIND;
    const hi = d + FOG.far;
    const { floors, kerbs, rails, sleepers, walls, beds, fence, fenceCaps, edgeLines, gantries } = this;
    const kerbX = WALL.planeX - KERB_WIDTH / 2;
    beds.begin();
    fence.begin();
    fenceCaps.begin();
    // The retaining walls run the whole drawn stretch, panels at whole multiples of FENCE_EVERY so they stay put.
    for (let s = Math.floor(lo / FENCE_EVERY) * FENCE_EVERY; s < hi; s += FENCE_EVERY) {
      for (const side of [-1, 1]) {
        const z = -(s + FENCE_EVERY / 2 - d);
        // The mural shader picks each panel's painting from where it stands (trackSurfaces.muralMaterial).
        fence.push(side * FENCE_X, FENCE_HEIGHT / 2 - 0.4, z, 0, FENCE_THICKNESS, FENCE_HEIGHT + 0.8, FENCE_EVERY);
        fenceCaps.push(side * FENCE_X, FENCE_HEIGHT + 0.06, z, 0, FENCE_THICKNESS + 0.14, 0.12, FENCE_EVERY);
        fenceCaps.push(side * FENCE_X, (FENCE_HEIGHT + PILASTER.rise) / 2 - 0.4, -(s - d), 0, PILASTER.across, FENCE_HEIGHT + PILASTER.rise + 0.8, PILASTER.along);
      }
    }
    if (gantries) {
      gantries.begin();
      const span = 2 * GANTRY.postX;
      for (let s = Math.floor(lo / GANTRY.every) * GANTRY.every + GANTRY.every / 2; s < hi; s += GANTRY.every) {
        const z = -(s - d);
        for (const side of [-1, 1]) {
          gantries.push(side * GANTRY.postX, GANTRY.beamY / 2 - 0.2, z, 0, GANTRY.post, GANTRY.beamY + 0.4, GANTRY.post);
          // A short bracket from each post under the beam's lower chord.
          gantries.push(side * (GANTRY.postX - 0.55), GANTRY.beamY - 0.62, z, 0, 1.1, 0.12, 0.12);
        }
        gantries.push(0, GANTRY.beamY, z, 0, span + 0.5, GANTRY.beam, GANTRY.beam);
        gantries.push(0, GANTRY.beamY - 0.62, z, 0, span, 0.1, 0.16);
        // A dropper over each lane holds the contact wire.
        for (const lane of [-1, 0, 1]) gantries.push(lane * LANES.width, (GANTRY.beamY + GANTRY.wireY) / 2, z, 0, 0.07, GANTRY.beamY - GANTRY.wireY, 0.07);
      }
      for (const lane of [-1, 0, 1]) gantries.push(lane * LANES.width, GANTRY.wireY, -((lo + hi) / 2 - d), 0, GANTRY.wire, GANTRY.wire, hi - lo);
      gantries.end();
    }
    floors.begin();
    edgeLines.begin();
    kerbs.begin();
    rails.begin();
    sleepers.begin();
    walls.begin();
    for (const chunk of track.chunks) {
      if (chunk.start > hi || chunk.start + chunk.length < lo) continue;
      for (const floor of chunk.floors) {
        if (floor.end < lo || floor.start > hi) continue;
        const length = floor.end - floor.start;
        const z = -((floor.start + floor.end) / 2 - d);
        const top = floor.y - YARD_DROP;
        if (floors.push(0, top - FLOOR_THICKNESS / 2, z, 0, 2 * WALL.planeX, FLOOR_THICKNESS, length)) {
          floors.color(floor.y > 0 ? this.floorRaised : this.floorNormal);
        }
        const sleeperTop = top + BED_HEIGHT + SLEEPER_HEIGHT;
        for (const lane of [-1, 0, 1]) beds.push(lane * LANES.width, top + BED_HEIGHT / 2, z, 0, BED_WIDTH, BED_HEIGHT, length);
        for (const x of RAIL_X) rails.push(x, sleeperTop + RAIL_HEIGHT / 2, z, 0, 0.09, RAIL_HEIGHT, length);
        const firstSleeper = Math.ceil(Math.max(floor.start, lo) / SLEEPER_EVERY) * SLEEPER_EVERY;
        for (let s = firstSleeper; s + 0.2 < Math.min(floor.end, hi); s += SLEEPER_EVERY) {
          for (const lane of [-1, 0, 1]) sleepers.push(lane * LANES.width, top + BED_HEIGHT + SLEEPER_HEIGHT / 2, -(s - d), 0, 1.6, SLEEPER_HEIGHT, 0.26);
        }
        kerbs.push(-kerbX, floor.y + KERB_HEIGHT / 2 - YARD_DROP / 2, z, 0, KERB_WIDTH, KERB_HEIGHT + YARD_DROP, length);
        kerbs.push(kerbX, floor.y + KERB_HEIGHT / 2 - YARD_DROP / 2, z, 0, KERB_WIDTH, KERB_HEIGHT + YARD_DROP, length);
        for (const side of [-1, 1]) edgeLines.push(side * (kerbX - KERB_WIDTH / 2 + EDGE_LINE / 2 + 0.02), floor.y + KERB_HEIGHT + 0.004, z, 0, EDGE_LINE, 0.012, length);
      }
      for (const wall of chunk.walls) {
        if (wall.end < lo || wall.start > hi) continue;
        const pushed = walls.push(
          wall.side * (WALL.planeX + WALL_THICKNESS / 2),
          (WALL_TOP + WALL_BOTTOM) / 2,
          -((wall.start + wall.end) / 2 - d),
          0,
          WALL_THICKNESS,
          WALL_TOP - WALL_BOTTOM,
          wall.end - wall.start,
        );
        const colour = this.wallColours.get(wall.surface);
        if (pushed && colour) walls.color(colour);
      }
    }
    floors.end();
    edgeLines.end();
    beds.end();
    fence.end();
    fenceCaps.end();
    kerbs.end();
    rails.end();
    sleepers.end();
    walls.end();
  }

  private drawHero(run: RunState, alpha: number): void {
    const p = run.player;
    const prev = run.prev;
    const hero = this.hero;
    hero.position.set(prev.x + (p.x - prev.x) * alpha, prev.y + (p.y - prev.y) * alpha, 0);
    setSquash(hero.scale, p.height, PLAYER.height);
    const mode = p.mode;
    hero.rotation.x = mode.kind === 'crash' ? CRASH_TILT * Math.min(1, mode.t / CRASH_TILT_TIME) : 0;
    const wallRoll = mode.kind === 'wallRun' ? mode.side : mode.kind === 'wallAttach' ? mode.side * Math.min(1, mode.t / WALL.attachTime)
      : mode.kind === 'wallExit' ? mode.side * (1 - Math.min(1, mode.t / WALL.exitTime))
      : mode.kind === 'wallJump' ? mode.from * (1 - Math.min(1, mode.t / WALL.jumpTime)) : 0;
    hero.rotation.z = wallRoll * WALL.rootRollDeg * Math.PI / 180;
    hero.visible = !this.firstPerson && !(p.invulnT > 0 && Math.floor(this.time * BLINK_RATE) % 2 === 0);
  }

  private drawThief(run: RunState, alpha: number, d: number): void {
    const t = run.thief;
    const prev = run.prev;
    const thiefD = prev.thiefD + (t.d - prev.thiefD) * alpha;
    this.thief.position.set(prev.thiefX + (t.x - prev.thiefX) * alpha, prev.thiefY + (t.y - prev.thiefY) * alpha, -(thiefD - d));
    setSquash(this.thief.scale, t.pose === 'slide' ? SLIDE.height : PLAYER.height, PLAYER.height);
  }
}
