import { GameAudio } from '../audio/audio';
import { botAction } from '../game/systems/bot';
import { installHooks, type DebugState, type RunshiftHooks } from '../debug/hooks';
import { DebugOverlay, overlayText } from '../debug/overlay';
import { parseParams, usesMemoryStore } from '../debug/params';
import { Progress } from '../game/systems/progress';
import { spawnPowerUps } from '../game/systems/powerups';
import { Run } from '../game/systems/run';
import { browserStore, memoryStore } from '../game/systems/save';
import { Session } from '../game/systems/session';
import { Tutorial, tutorialDone } from '../game/systems/tutorial';
import { Streamer } from '../game/track/streamer';
import type { GameEvent, RunState } from '../game/types';
import { Input } from '../input/input';
import type { ActionEvent } from '../input/types';
import { installUnlock } from '../input/unlock';
import { loadPlatform } from '../platform';
import { CameraRig } from '../render/camera';
import { createStage } from '../render/stage';
import { LOWEST_QUALITY, softwareRendering, watchFrameRate } from '../render/quality';
import { CoinsView } from '../render/instancing/coinsView';
import { ObstaclesView } from '../render/instancing/obstaclesView';
import { PickupsView } from '../render/instancing/pickupsView';
import { loadWorldKit } from '../render/assets/worldKit';
import { loadCharacters } from '../render/assets/characters';
import { createEmptyRegistry } from '../render/assets/registry';
import { FirstPersonBody } from '../render/characters/firstPersonBody';
import { HeroView } from '../render/characters/heroView';
import { ThiefView } from '../render/characters/thiefView';
import { GreyboxView } from '../render/world/greybox';
import { WorldView } from '../render/world/worldView';
import { Hud, setMotionPreference } from '../ui/hud';
import { Coach } from '../ui/coach';
import { Menus } from '../ui/menus';
import { mountSettings } from '../ui/settings';
import { mountUpgrades } from '../ui/upgrades';
import { bootDone, mark } from './boot';
import { celebrate } from './celebrate';
import { startLoop, watchContextLoss, watchPageLeave, type Loop } from './loop';
import { fixedQuality, randomSeed, reducedMotion, runOptions } from './options';
import { PauseFlow } from './pause';

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
 * Builds the game, shows its menu, and connects the run, input, pause flow, UI and renderer.
 */
/**
 * True when the browser says it would start an AudioContext now: Firefox answers getAutoplayPolicy, and any
 * browser allows it once the page has had a gesture.
 */
function soundAllowed(): boolean {
  const nav = navigator as Navigator & {
    getAutoplayPolicy?: (type: 'audiocontext') => string;
    userActivation?: { readonly hasBeenActive: boolean };
  };
  return nav.getAutoplayPolicy?.('audiocontext') === 'allowed' || nav.userActivation?.hasBeenActive === true;
}

export async function startApp(): Promise<void> {
  const params = parseParams(location.search);
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  const hudRoot = document.querySelector<HTMLElement>('#hud');
  if (!canvas || !hudRoot) throw new Error('index.html has no #game canvas or #hud');

  const platform = await loadPlatform();
  await platform.init();
  platform.loadingStart();

  const progress = new Progress(usesMemoryStore(params) ? memoryStore() : browserStore());
  setMotionPreference(params.reduced ? 'on' : progress.data.settings.reducedMotion);
  const motionReduced = reducedMotion(params.reduced, progress.data.settings.reducedMotion,
    matchMedia('(prefers-reduced-motion: reduce)').matches);
  /** The fixed quality ('low', 'high'), or null while it adapts. The settings panel changes it. */
  let quality = fixedQuality(params.quality, progress.data.settings.quality);
  // Without a GPU (software WebGL) the game starts at its lowest quality, unless a quality was asked for.
  const slow = quality === 'low' || (quality === null && softwareRendering());
  const stage = createStage(canvas, { antialias: !slow, quality: slow ? LOWEST_QUALITY : progress.data.perf.level });
  const track = new Streamer();
  const run = new Run(track, { decorators: [spawnPowerUps] });
  const session = new Session(run, progress, runOptions(params, randomSeed()));

  const input = new Input();
  const audio = new GameAudio();
  audio.setMuted(progress.data.settings.muted);
  audio.setMusic('menu');
  input.onFirstGesture = () => audio.start();
  input.onGesture = () => audio.resume();
  installUnlock(input);
  // Where the browser already allows sound (a portal whose own play button was the gesture, an earlier gesture on
  // this page), the menu music starts now. Elsewhere this would only print a warning: the first gesture starts it.
  if (platform.name !== 'local' || soundAllowed()) audio.start();
  document.addEventListener('visibilitychange', () => audio.setHidden(document.hidden));

  const hud = new Hud(hudRoot);
  const tutorial = new Tutorial();
  const coach = new Coach(hudRoot, () => {
    if (session.screen === 'run' && !pause.paused) tutorial.skip(run.state);
  });
  const showLessons = () => coach.setProgress(tutorial.active, tutorial.progress.done, tutorial.progress.total);
  tutorial.onTip = (step) => coach.show(step);
  tutorial.onWrong = () => coach.nudge();
  tutorial.onComplete = (tip) => {
    if (!progress.data.tips.includes(tip)) {
      progress.data.tips.push(tip);
      progress.save();
    }
    showLessons();
  };
  tutorial.onFinish = (skipped) => {
    showLessons();
    if (!skipped) hud.banner('YOU\'RE READY!', 'gold', 2200);
  };
  // A new player's runs start with the tutorial until every lesson is done. Test URLs and bots never get it
  // unasked (?tutorial still forces it).
  session.wantsTutorial = () => !params.bot && !usesMemoryStore(params) && !tutorialDone(progress.data.tips);
  const menus = new Menus(hudRoot, () => progress.data);
  const cameraRig = new CameraRig(stage.camera, { reducedMotion: motionReduced });
  const [worldAssets, characters] = params.greybox ? [null, null]
    : await Promise.all([loadWorldKit(), loadCharacters()]);
  const assets = characters ? { ...(worldAssets ?? createEmptyRegistry()), character: (name: 'hero' | 'thief') => characters[name] } : worldAssets;
  const viewContext = { scene: stage.scene, camera: stage.camera, assets, motion: { reduced: motionReduced } };
  const view = new GreyboxView(viewContext, !characters);
  const worldView = worldAssets ? new WorldView(viewContext) : null;
  const heroView = characters ? new HeroView(viewContext) : null;
  const thiefView = characters ? new ThiefView(viewContext) : null;
  const obstaclesView = new ObstaclesView(viewContext);
  const coinsView = new CoinsView(viewContext);
  const pickupsView = new PickupsView(viewContext);
  const firstPersonBody = params.chase ? null : new FirstPersonBody();
  const runCamera = params.chase ? 'chase' : 'firstPerson';
  const targets = { audio, camera: cameraRig, toast: (text: string) => hud.toast(text) };
  mark('runshift:assets');

  let loop: Loop | null = null;
  const pause = new PauseFlow({
    paused() {
      session.setPaused(true);
      if (loop) loop.paused = true;
      input.setActive(false);
      input.releaseAll();
      audio.setPaused(true);
      menus.showPause(true);
    },
    countdown(n) { hud.setCountdown(n ?? 0); },
    resumed() {
      session.setPaused(false);
      if (loop) loop.paused = false;
      input.setActive(true);
      audio.setPaused(false);
      menus.showPause(false);
    },
  });
  const play = () => { pause.clear(); session.play(); tutorial.reset(session.tutorial, run.state.d); showLessons(); platform.gameplayStart(); cameraRig.cut(); mark('runshift:run'); };
  const retry = () => { pause.clear(); session.retry(); tutorial.reset(session.tutorial, run.state.d); showLessons(); platform.gameplayStart(); cameraRig.cut(); mark('runshift:run'); };
  const toMenu = () => { pause.clear(); tutorial.reset(false); showLessons(); session.toMenu(); platform.gameplayStop(); };
  const toggleMute = () => {
    progress.data.settings.muted = !progress.data.settings.muted;
    progress.save();
    audio.setMuted(progress.data.settings.muted);
    menus.setMuted(progress.data.settings.muted);
  };
  menus.on('play', play);
  menus.on('retry', retry);
  menus.on('menu', toMenu);
  menus.on('resume', () => pause.resume());
  menus.on('mute', toggleMute);
  menus.registerPanel('upgrades', (panel) => mountUpgrades(panel, progress, {
    bought: () => audio.uiClick('primary'),
  }));
  menus.registerPanel('settings', (panel) => mountSettings(panel, progress, {
    motion(value) {
      // ?reduced still wins over the setting, as it does at start-up.
      setMotionPreference(params.reduced ? 'on' : value);
      const reduced = reducedMotion(params.reduced, value, matchMedia('(prefers-reduced-motion: reduce)').matches);
      cameraRig.reducedMotion = reduced;
      viewContext.motion.reduced = reduced;
    },
    quality(value) {
      quality = fixedQuality(params.quality, value);
      // Multisampling is fixed when the renderer is made: only the resolution and shadows follow at once.
      stage.setQuality(quality === 'low' || (quality === null && softwareRendering()) ? LOWEST_QUALITY
        : quality === 'high' ? 0 : progress.data.perf.level);
    },
    changed: () => audio.uiClick(),
  }));
  hud.on('pause', () => { if (session.screen === 'run') pause.pause(); });
  input.onPause = () => {
    if (menus.back()) return;
    if (session.screen === 'run') pause.toggle();
  };
  input.onMute = toggleMute;
  input.onConfirm = () => { menus.confirm(); };
  watchPageLeave(() => { if (session.screen === 'run') pause.pause(); });

  session.onScreen = (screen) => {
    if (screen !== 'run') {
      coach.show(null);
      coach.setProgress(false);
      pause.clear();
      if (loop) loop.paused = false;
      audio.setPaused(false);
      platform.gameplayStop();
    }
    audio.setMusic(screen === 'run' ? 'run' : 'menu');
    hud.setVisible(screen === 'run');
    input.setActive(screen === 'run' && !session.paused);
    cameraRig.mode = screen === 'run' ? runCamera : 'menu';
    cameraRig.cut();
    coinsView.setVisible(screen !== 'menu');
    if (screen === 'menu') { menus.showMenu(); mark('runshift:menu'); }
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
    paused: () => pause.paused,
    play,
    retry,
    toMenu,
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
        quality: stage.quality,
      };
    },
    save: () => structuredClone(progress.data),
  };
  if (hooksOn) installHooks(hooks);

  const actions: ActionEvent[] = [];
  input.setActive(false);
  if (params.bot) play();
  else { menus.showMenu(); cameraRig.mode = 'menu'; mark('runshift:menu'); }
  const frameRate = watchFrameRate(() => stage.lowerResolution());

  loop = startLoop({
    frame(elapsed) {
      pause.update(elapsed);
      if (session.screen === 'run' && !pause.paused) tutorial.update(run.state, elapsed);
      const n = input.drain(actions);
      if (session.screen === 'run' && !pause.paused) for (let i = 0; i < n; i++) {
        if (tutorial.accept(actions[i].action, run.state)) run.push(actions[i]);
      }
      frameRate(elapsed, quality === null && session.screen === 'run' && !pause.paused && run.state.phase === 'running');
      fpsFrames++;
      fpsTime += elapsed;
      if (fpsTime >= FPS_WINDOW) {
        fps = Math.round(fpsFrames / fpsTime);
        fpsFrames = 0;
        fpsTime = 0;
      }
    },
    step(dt) {
      if (session.screen === 'run' && !pause.paused) tutorial.check(run.state);
      if (params.bot && session.screen === 'run' && !pause.paused) {
        const action = botAction(params.bot, run.state, track);
        if (action) run.push({ action, at: performance.now(), source: 'bot' });
      }
      session.step(dt);
    },
    render(alpha, elapsed) {
      for (const event of run.drainEvents()) {
        celebrate(event, targets);
        if (!hooksOn) continue;
        eventLog.push(event);
        if (eventLog.length > EVENT_LOG_MAX) eventLog.shift();
      }
      const state = run.state;
      // The head bobs on the drawn legs' footfalls.
      if (firstPersonBody) cameraRig.stridePhase = firstPersonBody.phase;
      cameraRig.update(state, alpha, elapsed);
      // At the eyes the full-body hero is hidden and his own arms and legs are drawn over the world instead.
      const eyes = cameraRig.firstPersonAmount;
      view.setFirstPerson(eyes > 0.5);
      heroView?.setFirstPerson(eyes > 0.5);
      view.update(state, track, alpha, elapsed);
      worldView?.update(state, track, alpha, elapsed);
      heroView?.update(state, track, alpha, elapsed);
      thiefView?.update(state, track, alpha, elapsed);
      obstaclesView.update(state, track, alpha, elapsed);
      coinsView.update(state, track, alpha, elapsed);
      pickupsView.update(state, track, alpha, elapsed);
      if (firstPersonBody) {
        firstPersonBody.amount = eyes;
        firstPersonBody.update(state, track, alpha, elapsed);
      }
      hud.update(state, elapsed);
      audio.update(state, elapsed);
      stage.render();
      firstPersonBody?.render(stage.renderer, stage.camera);
      if (overlay) {
        const { calls, triangles } = stage.renderer.info.render;
        overlay.show(overlayText({ fps, calls, triangles, dpr: stage.renderer.getPixelRatio(), quality: stage.quality,
          d: state.d, v: state.v, tier: state.tier, district: state.district, screen: session.screen,
          paused: pause.paused, phase: state.phase, mode: state.player.mode.kind, lane: state.player.lane,
          x: state.player.x, y: state.player.y, swipes: input.stats.swipes, strokes: input.stats.strokes }));
      }
      if (!hooks.ready) {
        hooks.ready = true;
        // Locally, sound still blocked: ask for a tap so the menu music plays. Not under automation (the tools).
        bootDone(platform.name === 'local' && audio.state !== 'running' && !navigator.webdriver);
        platform.loadingStop();
      }
    },
  });
  loop.timeScale = params.speed;
  watchContextLoss(canvas, () => { loop?.stop(); hud.toast('Graphics stopped. Reload to play again.'); });
}
