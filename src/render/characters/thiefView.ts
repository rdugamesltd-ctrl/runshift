import { SIM } from '../../balance';
import type { ChunkStreamer, RunState, ThiefState } from '../../game/types';
import type { View, ViewContext } from '../types';
import { CharacterMotion, type MotionInput, type MotionState } from './characterMotion';
import { CharacterRig } from './characterRig';

/** The thief's animation state from his pose. */
export function thiefMotionState(thief: ThiefState): MotionState {
  switch (thief.pose) {
    case 'jump':
    case 'wallJump':
      return 'jump';
    case 'slide':
      return 'slide';
    case 'wallRun':
      return 'wall';
    case 'taunt':
      return 'taunt';
    default:
      return 'run';
  }
}

/**
 * The masked thief, driven by CharacterMotion from the poses of the route he runs (clips, eased wall roll, lean,
 * squash). The coins he throws down are drawn by CoinsView.
 * TODO WP-34: taunts.
 */
export class ThiefView implements View {
  private readonly rig: CharacterRig;
  private readonly motion: CharacterMotion;
  private readonly input: MotionInput = { state: 'run', x: 0, y: 0, speed: 0, roll: 0 };

  constructor(ctx: ViewContext) {
    if (!ctx.assets) throw new Error('ThiefView needs character assets');
    this.rig = new CharacterRig(ctx.assets.character('thief'));
    this.motion = new CharacterMotion(this.rig);
    ctx.scene.add(this.rig.root);
  }

  update(run: RunState, _track: ChunkStreamer, alpha: number, dt: number): void {
    const thief = run.thief;
    const d = run.prev.d + (run.d - run.prev.d) * alpha;
    const input = this.input;
    input.state = thiefMotionState(thief);
    input.x = run.prev.thiefX + (thief.x - run.prev.thiefX) * alpha;
    input.y = run.prev.thiefY + (thief.y - run.prev.thiefY) * alpha;
    // His own pace (he keeps running when the hero has stopped).
    input.speed = (thief.d - run.prev.thiefD) / SIM.fixedDt;
    input.roll = thief.pose === 'wallRun' && thief.side ? thief.side : 0;
    this.motion.update(input, dt);
    this.rig.root.position.set(input.x, input.y, -(run.prev.thiefD + (thief.d - run.prev.thiefD) * alpha - d));
  }

  dispose(): void { this.rig.dispose(); }
}
