import { BoxGeometry, CapsuleGeometry, Group, Matrix4, Mesh, MeshLambertMaterial, SphereGeometry } from 'three';
import { CHUNK, LANES, PLAYER, WALL } from '../../balance';
import type { ChunkStreamer, RunState } from '../../game/types';
import { disposeObject } from '../dispose';
import { InstanceBatch } from '../instancing/instanceBatch';
import type { View, ViewContext } from '../types';

/** Slab under each floor span, m. */
const FLOOR_THICKNESS = 0.4;
/** Lane divider dashes: length and spacing along the run, width across, m. */
const DASH_LENGTH = 3;
const DASH_EVERY = 8;
const DASH_WIDTH = 0.12;
/** Dashes run between the lanes. */
const DASH_X = [-LANES.width / 2, LANES.width / 2] as const;

const COLOURS = {
  floor: '#8b9099',
  dash: '#e4e7ec',
  hero: '#17b3a3',
  thief: '#2f3440',
  sack: '#ffbf2a',
};

/**
 * The grey-box world: floor slabs for every floor span of the live chunks, lane dashes that scroll with the
 * run, a teal capsule for the hero and a charcoal capsule with a gold sack for the thief. Five draw calls.
 * WP-00 stub of the view WP-04 owns. TODO WP-04: obstacle and coin boxes; WP-13: wall panels at
 * x = ±(planeX + 0.15) with hazard edges, the pit void, band colours, the 70° wall roll.
 */
export class GreyboxView implements View {
  private readonly group = new Group();
  private readonly floors: InstanceBatch;
  private readonly dashes: InstanceBatch;
  private readonly hero: Mesh;
  private readonly thief = new Group();
  private readonly matrix = new Matrix4();

  constructor(ctx: ViewContext) {
    const box = new BoxGeometry(1, 1, 1);
    this.floors = new InstanceBatch(box, new MeshLambertMaterial({ color: COLOURS.floor }), CHUNK.maxActive * 4, 'greybox-floors');
    this.dashes = new InstanceBatch(box, new MeshLambertMaterial({ color: COLOURS.dash }), 96, 'greybox-dashes');

    const radius = PLAYER.width / 2;
    const body = new CapsuleGeometry(radius, PLAYER.height - 2 * radius, 4, 12);
    body.translate(0, PLAYER.height / 2, 0);
    this.hero = new Mesh(body, new MeshLambertMaterial({ color: COLOURS.hero }));
    this.hero.name = 'greybox-hero';

    const thiefBody = new Mesh(body, new MeshLambertMaterial({ color: COLOURS.thief }));
    // The sack rides on his back, the side facing the camera.
    const sack = new Mesh(new SphereGeometry(0.32, 12, 8), new MeshLambertMaterial({ color: COLOURS.sack }));
    sack.position.set(0.15, 1.2, 0.38);
    this.thief.add(thiefBody, sack);
    this.thief.name = 'greybox-thief';

    this.group.name = 'greybox';
    this.group.add(this.floors.mesh, this.dashes.mesh, this.hero, this.thief);
    ctx.scene.add(this.group);
  }

  update(run: RunState, track: ChunkStreamer, alpha: number, _dt: number): void {
    const prev = run.prev;
    const d = prev.d + (run.d - prev.d) * alpha;
    const m = this.matrix;

    this.floors.begin();
    for (const chunk of track.chunks) {
      for (const floor of chunk.floors) {
        const length = floor.end - floor.start;
        const mid = (floor.start + floor.end) / 2;
        m.makeScale(2 * WALL.planeX, FLOOR_THICKNESS, length).setPosition(0, floor.y - FLOOR_THICKNESS / 2, -(mid - d));
        this.floors.push(m);
      }
    }
    this.floors.end();

    this.dashes.begin();
    const first = Math.ceil((d - CHUNK.recycleBehind) / DASH_EVERY) * DASH_EVERY;
    for (let s = first; s < d + CHUNK.horizon; s += DASH_EVERY) {
      const y = track.floorAt(s);
      if (y === null) continue;
      for (const x of DASH_X) {
        m.makeScale(DASH_WIDTH, 0.02, DASH_LENGTH).setPosition(x, y + 0.01, -(s + DASH_LENGTH / 2 - d));
        this.dashes.push(m);
      }
    }
    this.dashes.end();

    const p = run.player;
    this.hero.position.set(prev.x + (p.x - prev.x) * alpha, prev.y + (p.y - prev.y) * alpha, 0);
    const t = run.thief;
    const thiefD = prev.thiefD + (t.d - prev.thiefD) * alpha;
    this.thief.position.set(prev.thiefX + (t.x - prev.thiefX) * alpha, prev.thiefY + (t.y - prev.thiefY) * alpha, -(thiefD - d));
  }

  dispose(): void {
    disposeObject(this.group);
  }
}
