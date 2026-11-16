# RUNSHIFT status

Integrators update this file after every wave. Last update: M1 verified, 2026-11-12.

## Now

- **Art direction pass (2026-11-15).** The look moved from flat grey-box lighting to a sunny toy town.
  *Rendering* (`src/render/stage.ts`, `world/sky.ts`): Khronos neutral tone mapping; one soft sun shadow map over
  the near track (the world scrolls, so the light never moves; off at quality levels 2 and 3); warm sun against
  cool sky light; the sky is painted once on a canvas as an equirectangular panorama (gradient, sun glow, cumulus
  clouds, two hazy rows of far towers) and is also the prefiltered reflection environment; the fog takes the
  horizon's colour. *Track* (`world/greybox.ts`, `world/trackSurfaces.ts`): canvas-painted gravel, ballast and
  concrete laid out in track space by a shader patch (`projectOnTrack`, one scroll uniform, so scaled instances
  never stretch a texture); eight original murals in one atlas on the yard walls, picked per panel in the shader
  from where the panel stands (`muralMaterial`); pilasters, yellow platform-edge lines, chevron boards on wall-run
  panels, overhead-line gantries with contact wires every 40 m (not in grey-box mode). *Models*: trains are a
  lofted body with curved roof shoulders, glazing, doors, cab ends, lamp clusters and round wheels
  (`instancing/trainModel.ts`, built with the new `MeshBuilder`); coins are minted (rim, recessed face, star) in
  polished gold; city models are repainted by material name and tinted per lot (`assets/worldKit.ts` `REPAINT`,
  `WorldView` `WALL_TINTS`). *Characters* (`characters/characterBuilder.ts`): the hero (teal courier, helmet) and
  the thief (striped jumper, mask, beanie; no sack: every coin is his, thrown down behind him as he passes, see CoinsView) are our own bodies, rounded painted
  pieces with ink outlines, bound to the CC0 Ninja rig's skeleton so its clips still drive them; both load from
  `characters/thief.glb` (the rig); `hero.glb` is no longer loaded. *First person*: the fists follow authored
  targets through a two-bone reach (`FirstPersonBody.reach`), pump in the lower corners and leave the centre of
  the view clear; gloves have thumbs and knuckles; on portrait screens the body is set back so the fists stay
  small. *Quality*: a browser that draws WebGL on the CPU (SwiftShader, llvmpipe) starts at the lowest quality
  (`softwareRendering()`), which is also what keeps the headless checks at a playable frame rate. Typecheck, 306
  tests, build, smoke and devices pass; a headless frame samples 74-94 calls and about 290k (low) to 335k (high,
  with the shadow pass) triangles. Open: the triangle count at high quality is over the 300k budget (the three
  MegaKit facades are the bulk); the obstacle kit models and the pickups still have their earlier look; no
  coin-collect or speed-line VFX yet; `public/assets/characters/hero.glb` is shipped but unused.
- **Movement, physics and animation pass (2026-11-12).** The thief is now a ghost runner: a `PlayerState` stepped by
  the hero's own `stepPlayer`, pressed along the route by `routeAction` (the perfect bot's controller, moved to
  `src/game/entities/route.ts`), never collided. He changes lanes, jumps, slides, climbs train ramps, runs off roofs,
  runs and swaps walls; his speed eases (`THIEF.speedRate`, `leadGain`) so a stumble never snaps him back, and he
  keeps running when the hero crashes. Jumps rise for 55% of the airtime under lighter gravity and fall under heavier
  (`JUMP.riseShare`; apex and airtime unchanged; coin arcs follow `jumpArc`). A second lane press the same way keeps
  its momentum (`laneCurve`, additive `PlayerState.laneV`). Fixed a wall-jump bug: the landing was predicted 5% plus
  one step too far (the wall factor was applied twice), so the swap patterns' jump fell short to the floor and a
  missed landing snapped x 2 m to the old wall lane; it now lands on the opposite wall, and a missed landing falls on
  smoothly. First-person camera (`CAMERA.feel`): the eye eases into slides, dips on landings by fall speed, bobs and
  sways on the drawn legs' footfalls, leans into sideways moves (not on walls) and pitches with jumps; reduced motion
  drops the bob and lean. The view-model arms dip on landing and flinch on a stumble. `CharacterMotion` drives both
  rigs: the jump clip plays once into the mid-air loop, a landing clip, the knock-down on a crash, an eased wall roll
  instead of a 70° snap, lean and heading into lane changes, a back-leaning slide, take-off stretch and landing
  squash; the run cadence rises with √speed; every coin is dropped by the thief: it flies from his hand to its spot, lands with a bounce and waits to be picked up. Typecheck, 305 tests, patterns, build, smoke
  and devices pass; a headless perfect bot survives 5 km on 10 of 10 seeds with zero player or thief teleports.
- **Rail-yard genre pass (2026-11-12).** Power-ups (WP-32's simulation part) now work: `spawnPowerUps` swaps a
  lane coin for a pickup about every 170-280 m from 120 m; magnet (pulls coins in x and y, leaving d so the track
  stays sorted), ×2 multiplier (score bonus on top of `scoreFor`), shield (one hit, existing collision rule) and
  glide, played as a jet glide 5.2 m up over a line of sky coins (`RunState.airCoins`, additive). The glide lands
  only over plain, empty floor. `PickupsView` draws the icons, halos, shield bubble and jet flames; the camera
  lifts and pulls back while gliding (`CAMERA.glide`); `Session.play` passes upgrade levels. The track is now a
  sunken rail yard (ballast beds, sleepers every 0.95 m, raised rails, painted retaining walls) with no road dashes;
  trains have four liveries, window bands, doors, bogies, roof units, coloured roofs, hazard-striped ramps and lit
  headlamps on oncoming trains. Coins: arcs over low barriers, low lines under high ones, plain chunks with one or
  two lane lines. Eleven new patterns (rows, zigzags, side-lane ramps, oncoming dodges, train corridors) bring the
  catalogue to 26, all passing `npm run patterns` at 11 and 26 m/s. Camera raised (4.5 m, follows 70% of x and 55%
  of y). Empty instance batches hide themselves (no draw call); the grey-box smoke cap is 20 calls. The HUD coin
  icon got its missing CSS. Typecheck, 281 tests, patterns, build, smoke and devices pass; a headless perfect bot
  survives 5 km on 10 of 10 seeds with power-ups. Open: HUD timers are uncoloured chips; no upgrade shop UI yet;
  power-up sounds use the existing `pickup` routing only.
- **M1 wall-run: verified (2026-11-12).** Wall attach, buffered entry, two height bands, slips, exits and wall
  jumps to a wall, floor or fall are implemented. Nine authored patterns include gaps, wall signs, vents and pipes;
  the validator replays each at 11 and 26 m/s. The camera rolls up to 18 degrees (half in reduced motion), and
  the hero leans onto the wall. The first-wall tutorial shows the thief's demonstration, freezes before entry,
  rejects an incorrect swipe and resumes on the correct one. Typecheck, 222 unit tests, pattern validation and
  production build pass. Dev and production browser smoke pass both wall orientations (four attaches and four
  jumps each), the tutorial, 600 m perfect bot, and save persistence. `git diff --check` is clean.
- **M2 in progress:** the supplied Downtown City MegaKit Standard archive has been inspected (153 glTF models,
  complete dependencies, CC0 licence in the ZIP). `assets:world` reproducibly bakes a 1.85 MB meshopt kit with
  three building models and two props; `check-kit` verifies this subset and says full model coverage is pending.
  The game loads the kit, toonifies it and instances buildings beside the track, with `?greybox` and load failure
  falling back to the original scene. Browser smoke passes at 40 draw calls on desktop, landscape and portrait,
  including the 600 m bot, wall patterns, tutorial and save. The ZIP licence and SHA-256 are captured under
  `assets/licenses/`. An over-aggressive simplification pass tore holes in the facade; it was removed, and
  `check-kit` now guards the visible building's triangle count. The two free Poly Pizza CC0 placeholders are
  copied reproducibly with rig/clip and size checks (18 hero clips, 14 thief clips; each GLB under 0.5 MB),
  SHA-256 and source links in `assets/licenses/polypizza-characters.json`. Both play in the game, including
  wall poses, while `?greybox` skips model loading. The thief now has a procedural sack. The hero is a blue rabbit
  character and the Ninja thief still carries built-in swords; they remain placeholders pending the custom designs. Other KitModels and full M2 art
  acceptance remain open.
- **M2 scenery pass (2026-11-12):** the three authored MegaKit buildings are mixed into the street lots;
  four more CC0 city models fill the remaining lots and rear skyline (0.20 MB kit).
  Five CC0 Poly Pizza obstacle models (barrier, scaffold, dumpster, taxi, wagon) are baked into a 0.14 MB kit,
  with source hashes and credits. The MegaKit AC unit is used as a roof obstacle; procedural obstacle meshes
  remain as a load fallback. Browser smoke passed on desktop and both phone orientations; the final production
  scene sampled at 92 calls and 169k triangles, with no browser errors. The 229 tests and build passed.
- **City streaming correction (2026-11-12):** building selection is now tied to the permanent lot index, so a
  building keeps its model when the streaming anchor advances every 20 m. A regression test covers that boundary;
  production Chrome checks at 0, 19, 21 and 100 m showed no page errors and 65-85 draw calls.
- **Fully modelled city (2026-11-12):** every foreground and rear skyline lot now has an authored building model.
  The new CC0 Kenney skyscraper is part of the 0.20 MB extra building kit. Deterministic lot assignment avoids
  changing already visible buildings; procedural facades are retained only if an optional asset fails to load.
  Production Chrome checks across several districts showed no page errors, 76-94 draw calls and at most 276k
  triangles in the sampled frames. Heavy facades are limited to two per visible 14-lot stretch.
- **First-run tutorial (2026-11-16):** a new player's runs start with seven lessons, one chunk each after a plain
  first chunk (`src/game/track/tutorialTrack.ts`): swipe left, swipe right, jump, slide, wall-run, high band and
  wall-jump. At each new obstacle the run freezes, a card says what to press (keys on a keyboard, swipes on touch)
  and only that press resumes it; a wrong press shakes the card, a player who already made the move is not stopped,
  and a press that did not make it (a lane change from the far lane) stops the run again. Tips are saved as each
  step is done; until all six are saved, every run starts with the tutorial. A top pill shows the lesson count and
  a SKIP button. Lesson chunks get no power-ups. Test URLs and bots skip it unless `?tutorial`. Unit tests play the
  whole tutorial through without a crash (also from 640 m); the smoke test walks all seven lessons and the first-run
  SKIP flow in Chrome.
- **M0 grey-box runner: verified (2026-11-12).** The app now opens on the menu; the HUD, input, sound, pause countdown,
  adaptive resolution, camera and grey-box views are connected. The ground player moves, jumps and slides;
  collisions, gold collection and game-over timing run in the simulation. Four seeded street patterns give the
  player dodge, jump and slide challenges, with a safe path for the perfect bot. Typecheck, 184 unit tests and the
  local build pass. `npm run smoke` passes on dev and `dist` at 1280×720, 844×390 and 390×844: keyboard and CDP touch lane/jump/slide input,
  pause/resume, crash/results/retry/menu, perfect bot ≥600 m, and banked gold and score surviving reload. Draw calls
  stay at nine; the thief's lead stays within its bounds over 10,000 varied steps. `npm run devices` checks menu and HUD bounds and overlaps at the same sizes; it caught and led to a
  fix for landscape menu controls. The larger pattern catalogue, difficulty director and remaining placeholder tools
  belong to later milestones.
- **WP-00 Foundation and contracts: done** (2026-11-11), committed on `main`.
- Next: M2 asset pipeline, toon art and characters. WP-21 needs the user's manual asset zips for the visual milestones;
  WP-T0 needs `TRIPO_API_KEY` for the optional Tripo pipeline.

## WP-00 verification (2026-11-11)

| Check | Result |
|---|---|
| `npm.cmd install` | 146 packages, no errors (vite resolved to 8.3.8 under `^8.3.6`) |
| `npm run typecheck` | clean: 92 files under `src/` (all but `src/dev`) plus `vite.config.ts` |
| `npm test` | 3 files, 27 tests passed (`balance.test.ts`, `speed.test.ts`, `testTrack.test.ts`) |
| `npm run build` | passes; one 557 kB chunk (three.js core: the >500 kB warning is expected); `build:poki` and `build:crazygames` pass too, and the local bundle holds no portal code |
| `npm run dev` | boot screen, then the grey-box run. Headless Chrome at 1280×720, 390×844 and 844×390: no page errors or console warnings, 60 fps, 5 draw calls, 1.2k triangles, `d` advancing along the speed curve, the thief 10 m ahead; `window.__runshift` present with `?debug` only |
| `balance.ts` | every value deep-equal to the plan's block (23 sections) |

## What is real and what is a stub

Finished by WP-00 (frozen or reference code):

- Contracts: `src/game/types.ts`, `src/render/types.ts`, `src/input/types.ts`, `src/platform/platform.ts`, and the test
  contract `src/debug/hooks.ts`.
- `src/balance.ts` (each package edits only its section: owners in `docs/CONVENTIONS.md`).
- `src/game/track/speed.ts`, `testTrack.ts` (the reference `TrackQuery`), `random.ts` (Rail copy),
  `src/render/dispose.ts` (Rail copy), `src/ui/fonts/` (Fredoka and Lilita One with their OFL licences).
- `index.html` (boot and error screen, touch rules), `package.json` (frozen: every script and dependency),
  `tsconfig.json`, `vite.config.ts`, `src/vite-env.d.ts`, `.gitignore`, `.gitattributes`, `.editorconfig`.

Working stubs WP-00 wrote in other packages' files. They have the planned exports and `TODO WP-xx` comments; owners
replace the bodies and keep the exports:

| File | Owner | What the stub does now |
|---|---|---|
| `src/main.ts`, `src/app/{app,boot,loop,celebrate}.ts` | WP-04 | builds every wave-1 module, starts a run at once (no menu yet), fixed 1/60 loop with `Timer` and interpolation, boot screen hand-off, perf marks, `window.__runshift` with `?debug`/`?bot`; celebrate routes events to audio only |
| `src/render/{stage,camera,cameraFit,quality}.ts` | WP-04 (camera → WP-13, quality → WP-44) | stage with fog and a static sun; fixed chase camera framed by `fitCamera` (the real formula) |
| `src/render/instancing/instanceBatch.ts` | WP-04 | real: begin/push/end, overflow warns once |
| `src/render/world/greybox.ts` | WP-04 → WP-13 | floor slabs from the live chunks, scrolling lane dashes, teal hero capsule, charcoal thief |
| `src/debug/{params,overlay}.ts` | WP-04 | every URL parameter parsed; a one-line overlay with `?debug` |
| `src/game/systems/run.ts` | WP-01 | intro for `RESULTS.introTime`, then runs forever: `d += speedAt(time)·dt`, `runStart` and `tier` events, score from distance |
| `src/game/systems/{session,progress,save,scoring}.ts` | WP-01 | menu → run → results flow, banking, Rail-style save with `cleanSave`, `browserStore`, `memoryStore` |
| `src/game/entities/{player,actions,collision,thief}.ts` | WP-01 → WP-11 (thief → WP-14, WP-34) | player stays on the floor in its lane and drops every press; `ActionBuffer`; `playerBox` ground box; thief keeps `clamp(0.9·v, 8, 26)` ahead |
| `src/game/systems/bot.ts` | WP-01 → WP-42 | every bot idles |
| `src/game/track/streamer.ts` | WP-02 | flat street in 40 m chunks covering `[d − 15, d + 180]` (at most 6 alive), recycling, decorators with their own rng, queries via `createTestTrack` |
| `src/game/track/{tiers,convert,director,patterns,tutorialTrack}.ts` | WP-02 | tier by distance, `arrivalSpeed`; `Pattern` types from the plan's example; no patterns yet |
| `src/game/track/{walls,validator}.ts` | WP-12 → WP-42 | wall-jump landing distance; a validator that passes nothing |
| `src/input/{input,swipe,keyboard,unlock}.ts` | WP-03 | input queue fed only by `inject()` (no DOM listeners yet); simplified swipe detector; key map; real gesture unlock |
| `src/audio/{audio,sfx}.ts` | WP-03 → WP-35 | silent |
| `src/platform/{local,index}.ts` | WP-03 | real: local adapter, adapter chosen by `__PLATFORM__` |
| `src/platform/{poki,crazygames}.ts` | WP-53 | behave like local |
| `src/ui/{styles.css,hud,menus,icons}.ts` | WP-05 | fonts and palette variables; HUD and menus show nothing; `registerPanel` stores panels |
| `src/ui/{coach,settings,upgrades,credits,credits.generated}.ts`, `powerups.css` | WP-14/43, WP-43, WP-32, WP-52 | empty |
| `src/render/{toon,assets,characters,fx}/*`, `world/{worldView,shells,sky,blobShadow,tunnel,rooftop}.ts` | WP-22 to WP-33 | no-op views and loaders; `makeRamp`, `PALETTE`, `createAnimationLibrary` are real |
| `src/game/systems/{powerups,tutorial}.ts`, `track/{districts,thiefTrail}.ts` | WP-32, WP-14, WP-31, WP-34 | durations real (`base + perLevel·level`); the rest empty |
| `tools/postbuild.mjs` | WP-53 | no-op, so `npm run build` passes |
| Every other `tools/*.mjs` named in `package.json`, `tools/patterns/vitest.config.mjs`, `tools/stress.config.mjs`, `src/dev/*.test.ts` | WP-06, 12, 21, 22, 24, 42, 44, 45, 52, 53, T0 | placeholders that exit with code 1 and name their owner |

## Wave 1 hook-ups

`src/app/app.ts` already builds every wave-1 module through its planned export. If a package keeps these names and
signatures there is nothing to hook up; if it changes one, it reports the replacement line for WP-04 (until M0) or
the integrator.

- **WP-01**: keep `new Progress(store)`, `new Run(track)`, `new Session(run, progress, options)`, `session.step(dt)`,
  `session.play()`, `run.push(actionEvent)`, `run.drainEvents()` and `run.state`. Export the bot as
  `botAction(kind, state, track)` (or report its replacement); WP-04 calls it for `?bot`.
- **WP-02**: keep `new Streamer()` implementing `ChunkStreamer`; `Run.reset` calls `track.reset({ seed, startD,
  tutorial, pattern, district })` straight from the URL parameters.
- **WP-03**: keep `new Input()`, `installUnlock(input)`, `input.drain(out)`, `input.inject(action)`,
  `input.setActive(on)`, `new GameAudio()` with `start`, `resume`, `setMuted`, `setHidden`, `update`, `onEvent`, and
  `loadPlatform()`. Attach the DOM listeners in the `Input` constructor, or report the line (for example
  `input.attach(window)`). `onPause`, `onMute` and `onConfirm` are not wired yet: WP-04 connects them.
- **WP-04**: owns `startApp()` and the rest of `src/app`; keep `window.__runshift` exactly as `hooks.ts` describes.
  Still to do: menu first, pause on `visibilitychange`/`blur`/`pagehide` with tap and 3-2-1 resume, `?bot`,
  `watchFrameRate`, quality, the camera and the grey box in full.
- **WP-05**: keep `new Hud(hudRoot)`, `hud.setVisible`, `hud.update(state, dt)`, `new Menus(hudRoot)`, `showMenu`,
  `showResults(result)`, `hideAll`, `showPause`, `registerPanel(id, mount)`. Menus will need the session or
  callbacks for `[data-act]` buttons: report the new constructor line.
- **WP-06**: replace `tools/smoke.mjs`, `devices.mjs`, `budget.mjs` and add `tools/lib/{browser,server}.mjs`. The stub
  app already answers `window.__runshift` with `?debug` and `?bot`; the DOM selectors arrive with WP-05.

## Milestones and acceptance criteria *(from the plan)*

- **M0 grey-box runner.** typecheck, `npm test` (60+ tests), build pass. Physics tests: jump apex 1.35±0.03, airtime 0.60±0.02, lane change 0.14 s, slide box 0.8, coyote 0.15; front → crash, side during lane change → stumble, second stumble within 5 s → crash. Streaming: [d−15, d+180] always covered, ≤8 chunks, deterministic per seed, precise at d=1e6. Smoke at 1280×720, 844×390, 390×844: menu→play, keyboard + CDP touch swipes change lane/jump/slide via `state()`, `?bot=perfect&seed=7` reaches ≥600 m, crash→results→retry, save persists, zero page errors. Devices: HUD readable, no overlaps. Thief ≥8 m ahead over 10k random steps. ≤40 draw calls.
- **M1 wall-run.** FSM tests: entry buffer (0.29 s attaches, 0.31 s not), attach during coyote, band switch, slip at 2.0, detach 2.8, wall-jump to wall/floor/none, exit 0.25, ×1.05, every wall obstacle. `npm run patterns` green at both speed bounds incl. wall-length rule. Smoke: perfect bot ≥3 wallAttach and ≥1 wallJump in both orientations; screenshots show 18° roll. Tutorial: thief demonstrates first wall-run, wall tip freezes, correct swipe attaches. Reduced motion halves roll (test).
- **M2 assets, toon, characters.** `assets:fetch`/`assets:world`/`assets:chars` reproducible from `asset-sources`. Every shipped asset has a CREDITS row and licence snapshot. `world-kit.glb` ≤2 MB, each character ≤1.2 MB, `check-kit` passes. Ramp steps visible; hull outlines on hero/thief; baked shells on props; one directional + one hemisphere light. Clips idle/run/jump/fall/slide/hurt/victory play; run cadence follows speed; wall-run shows ~70° roll + spine lean; thief drops every coin as he passes. ≤100 draw calls, ≤300k tris in a bot run; `?greybox` still works.
- **M3 subway, power-ups, trail, VFX, audio.** Subway district with runnable tunnel walls, rooftop district, transitions, metro cars. Magnet, shield (one hit), multiplier, glide (rides gaps, saves one fall) unit-tested; HUD timers; upgrade levels change durations. Trail coins revealed only after the thief passes, never inside obstacles. VFX: speed trail, coin burst, shield bubble, glide board, wall sparks. Every GameEvent has a sound; smoke asserts AudioContext `running` after gesture and suspended when hidden. ≤100 draw calls in every district.
- **M4 difficulty, patterns, tooling.** 5 tiers, ≥45 validated patterns. Director enforces actions/40 m, min gap, 10→25% wall share (stress report within ±3%). Perfect bot survives 8 km on 10 seeds; sloppy bot median death 600-2000 m. 6 tips show once and save; HOW TO PLAY replays. Settings reduced motion + quality. Adaptive quality steps down under 6× CPU throttle and persists. smoke/devices/loadtime/budget green; menu within 4 s at 10 Mbps / 60 ms / 4× CPU.
- **M5 Tripo, credits, PWA, platforms, docs.** Rig/retarget scripts + docs; `asset-sources/tripo/characters.json` switches placeholder ↔ Tripo; with user files all clips mapped, without them a dry run passes. Credits screen lists every CC-BY attribution; `check-credits` in build. PWA installable, offline second load (smoke via CDP offline). Platform adapter chosen by `--mode`; local build makes no external requests. ≤5 MB initial, ≤8 MB total; ≤100 draw calls avg, ≤150 peak; ≤300k tris. CLAUDE.md, PLAYTEST.md, README complete; final report with phone + desktop screenshots.

## Schedule *(from the plan)*

| Wave | Gate | Parallel packages | Starts when |
|---|---|---|---|
| 0 | — | WP-00 | now |
| 1 | M0 | WP-01, 02, 03, 04, 05, 06; early: WP-21 (needs poly.pizza token + zips), WP-T0 (needs Tripo key) | WP-00 done |
| 2 | M1 | WP-11, 12, 13, 14; early: WP-22, 23 | WP-I0 green |
| 3 | M2 | WP-24, 25; early: WP-32, 35 | WP-I1 green, WP-21 done |
| 4 | M3 | WP-31, 33, 34 | WP-I2 green |
| 5 | M4 | WP-41, 42, 43, 44, 45 | WP-I3 green |
| 6 | M5 | WP-51 (swap needs user files), 52, 53, 54, 55 | WP-I4 green |

Dependencies: 11←01; 12←02 (+11 interface); 13←04; 14←01+02. 22←21; 24←21+23; 25←22+23. 31←25+12; 32←01+11; 33←24+25; 34←14+25; 35←03. 41←31+12; 42←12; 43←14; 44←25+33; 45←06. 51←24+T0; 52←21; 53←04; 54←all.

## Open questions and known issues

- **Ownership of `ui/upgrades.ts` and `ui/powerups.css`**: [33] in the folder tree, but the WP-32 section lists them.
  WP-00 treats them as WP-32's.
- **`balance.ts` section owners** are WP-00's reading (table in `docs/CONVENTIONS.md`); the plan names none.
- **Meanings WP-00 had to pick** (documented in the code; the owners confirm or change them):
  `WallSpan.blocks` holds `CollisionBox.id`s; `THIEF.burstEvery` is in metres; `RESULTS.fallDelay` is the delay
  before the results after a fall (the plan does not say from when it counts; `AIR.fallTime` ends the run);
  `ActionEvent.at` is in `performance.now()` milliseconds while the `ActionBuffer` counts sim seconds; `pathAt`
  before the first key gives lane 0; `resolveWallJump` uses `WALL.minLanding` for the plan's "v·0.3".
- **The stub run integrates `d` with explicit Euler** (`d += v·dt` after `v = speedAt(time)`), so after 120 s it is
  0.07 m ahead of `distanceAt(time)`. The plan's step order implies the same; WP-01 decides.
- **Gitignored manual asset zips are not in worktrees**: asset tools read them from the main checkout.
- **`npm run patterns`, `stress`, `loadtime`, `budget`, `profile`, `assets:*`, `inspect`, `icons`, `tripo:*`**
  still fail with exit code 1 until their owners replace the placeholders. `smoke` and `devices` now run.
