import { GameAudio } from '../audio/audio';
import { installHooks, type DebugState, type RunshiftHooks } from '../debug/hooks';
import { DebugOverlay } from '../debug/overlay';
import { parseParams, usesMemoryStore } from '../debug/params';
import { Progress } from '../game/systems/progress';
import { Run } from '../game/systems/run';
import { browserStore, memoryStore } from '../game/systems/save';
import { Session } from '../game/systems/session';
import { Streamer } from '../game/track/streamer';
import type { GameEvent, RunState } from '../game/types';
import { Input } from '../input/input';
import type { ActionEvent } from '../input/types';
import { installUnlock } from '../input/unlock';
import { loadPlatform } from '../platform';
import { CameraRig } from '../render/camera';
import { createStage } from '../render/stage';
import { GreyboxView } from '../render/world/greybox';
import { Hud } from '../ui/hud';
import { Menus } from '../ui/menus';
import { bootDone, mark } from './boot';
import { celebrate } from './celebrate';
import { startLoop } from './loop';

/** Events kept for window.__runshift.events() between two calls. */
const EVENT_LOG_MAX = 1000;
/** The fps readout averages over this long, s. */
const FPS_WINDOW = 0.5;

/** The run as window.__runshift.state() reports it. */
function debugState(run: RunState): DebugState {
  const p = run.player;
  return {
    phase: run.phase,
    d: run.d,
    v: run.v,
    mode: p.mode.kind,
    lane: p.lane,
    x: p.x,
    y: p.y,
    gold: run.gold,
    score: run.score,
    tier: run.tier,
    district: run.district,
    thiefLead: run.thief.d - run.d,
    powerUps: { ...run.powerUps },
  };
}

/**
 * Builds the game and starts it. WP-00 stub of the composition root WP-04 owns: every wave-1 module is built
 * through its planned export, the run starts at once (there is no menu yet) and the grey-box view draws it.
 * window.__runshift is installed with ?debug or ?bot. TODO WP-04: menu first, pause and resume, bots, quality,
 * the overlay contents; integrators wire later packages here and in celebrate.ts.
 */
export async function startApp(): Promise<void> {
  const params = parseParams(location.search);
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  const hudRoot = document.querySelector<HTMLElement>('#hud');
  if (!canvas || !hudRoot) throw new Error('index.html has no #game canvas or #hud');

  const platform = await loadPlatform();
  await platform.init();
  platform.loadingStart();

  const stage = createStage(canvas);
  const progress = new Progress(usesMemoryStore(params) ? memoryStore() : browserStore());
  const track = new Streamer();
  const run = new Run(track);
  const session = new Session(run, progress, {
    seed: params.seed ?? Math.floor(Math.random() * 0x7fffffff),
    startD: params.d ?? 0,
    tutorial: params.tutorial,
    pattern: params.pattern ?? undefined,
    district: params.district ?? undefined,
  });

  const input = new Input();
  const audio = new GameAudio();
  audio.setMuted(progress.data.settings.muted);
  input.onFirstGesture = () => audio.start();
  input.onGesture = () => audio.resume();
  installUnlock(input);
  document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden));

  const hud = new Hud(hudRoot);
  const menus = new Menus(hudRoot);
  const cameraRig = new CameraRig(stage.camera);
  const view = new GreyboxView({ scene: stage.scene, camera: stage.camera, assets: null, motion: { reduced: params.reduced } });
  const targets = { audio, camera: cameraRig, hud };
  // No assets to load yet (WP-22, WP-24): the grey box is drawn from code.
  mark('runshift:assets');

  session.onScreen = (screen) => {
    hud.setVisible(screen === 'run');
    input.setActive(screen === 'run');
    if (screen === 'menu') menus.showMenu();
    else if (screen === 'results' && session.result) menus.showResults(session.result);
    else menus.hideAll();
  };

  const hooksOn = params.debug || params.bot !== null;
  const eventLog: GameEvent[] = [];
  const overlay = params.debug ? new DebugOverlay(hudRoot) : null;
  let fps = 0;
  let fpsFrames = 0;
  let fpsTime = 0;

  const hooks: RunshiftHooks = {
    ready: false,
    screen: () => session.screen,
    paused: () => session.paused,
    play: () => session.play(),
    retry: () => session.retry(),
    toMenu: () => session.toMenu(),
    act: (action) => input.inject(action),
    events: () => eventLog.splice(0),
    state: () => debugState(run.state),
    stats: () => {
      const info = stage.renderer.info;
      return {
        fps,
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        dpr: stage.renderer.getPixelRatio(),
        quality: 0,
      };
    },
    save: () => structuredClone(progress.data),
  };
  if (hooksOn) installHooks(hooks);

  const actions: ActionEvent[] = [];
  // Until the menus exist (WP-05) the stub starts running at once.
  session.play();
  platform.gameplayStart();

  const loop = startLoop({
    frame(elapsed) {
      const n = input.drain(actions);
      if (session.screen === 'run' && !session.paused) for (let i = 0; i < n; i++) run.push(actions[i]);
      fpsFrames++;
      fpsTime += elapsed;
      if (fpsTime >= FPS_WINDOW) {
        fps = Math.round(fpsFrames / fpsTime);
        fpsFrames = 0;
        fpsTime = 0;
      }
    },
    step: (dt) => session.step(dt),
    render(alpha, elapsed) {
      for (const event of run.drainEvents()) {
        celebrate(event, targets);
        if (!hooksOn) continue;
        eventLog.push(event);
        if (eventLog.length > EVENT_LOG_MAX) eventLog.shift();
      }
      const state = run.state;
      view.update(state, track, alpha, elapsed);
      cameraRig.update(state, alpha, elapsed);
      hud.update(state, elapsed);
      audio.update(state, elapsed);
      stage.render();
      if (overlay) {
        const { calls, triangles } = stage.renderer.info.render;
        overlay.show(`${fps} fps | ${calls} calls | ${triangles} tris | d ${state.d.toFixed(1)} m | v ${state.v.toFixed(2)} m/s | tier ${state.tier} | ${state.phase}/${state.player.mode.kind}`);
      }
      if (!hooks.ready) {
        hooks.ready = true;
        bootDone();
        platform.loadingStop();
        mark('runshift:run');
      }
    },
  });
  loop.timeScale = params.speed;
}
