import type { ChunkStreamer, PlayerState, RunState, Side } from '../../game/types';
import type { View, ViewContext } from '../types';
import { CharacterMotion, type MotionInput, type MotionState } from './characterMotion';
import { CharacterRig } from './characterRig';

/** The hero's animation state from his movement mode. */
export function heroMotionState(p: PlayerState): MotionState {
  if (p.gliding) return 'glide';
  switch (p.mode.kind) {
    case 'jump':
    case 'wallJump':
      return 'jump';
    case 'air':
      return 'air';
    case 'slide':
      return 'slide';
    case 'fall':
      return 'fall';
    case 'crash':
      return 'crash';
    case 'wallAttach':
    case 'wallRun':
      return 'wall';
    default:
      return 'run';
  }
}

/** The wall the hero's body rolls onto: the wall he is on or jumping to, else upright. */
export function heroRollSide(p: PlayerState): Side | 0 {
  const mode = p.mode;
  if (mode.kind === 'wallAttach' || mode.kind === 'wallRun') return mode.side;
  if (mode.kind === 'wallJump' && mode.target.kind === 'wall') return mode.target.side;
  return 0;
}

/**
 * The hero, an original teal and orange speedster: the character asset driven by CharacterMotion from his
 * movement mode (clips, eased wall roll, lean, squash). Hidden while the camera is at his eyes.
 * TODO WP-24: blob shadow.
 */
export class HeroView implements View {
  private readonly rig: CharacterRig;
  private readonly motion: CharacterMotion;
  private readonly input: MotionInput = { state: 'run', x: 0, y: 0, speed: 0, roll: 0 };
  private firstPerson = false;

  /** Hides the full-body model while the camera is at the hero's eyes. */
  setFirstPerson(active: boolean): void { this.firstPerson = active; }

  constructor(ctx: ViewContext) {
    if (!ctx.assets) throw new Error('HeroView needs character assets');
    this.rig = new CharacterRig(ctx.assets.character('hero'));
    this.motion = new CharacterMotion(this.rig);
    ctx.scene.add(this.rig.root);
  }

  update(run: RunState, _track: ChunkStreamer, alpha: number, dt: number): void {
    const player = run.player;
    const input = this.input;
    input.state = heroMotionState(player);
    input.x = run.prev.x + (player.x - run.prev.x) * alpha;
    input.y = run.prev.y + (player.y - run.prev.y) * alpha;
    input.speed = run.v;
    input.roll = heroRollSide(player);
    this.motion.update(input, dt);
    this.rig.root.position.set(input.x, input.y, 0);
    this.rig.root.visible = !this.firstPerson && (player.invulnT <= 0 || Math.floor(run.time * 12) % 2 === 0);
  }

  dispose(): void { this.rig.dispose(); }
}
