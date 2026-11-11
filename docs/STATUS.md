# RUNSHIFT status

Integrators update this file after every wave. Last update: WP-00, 2026-11-11.

## Now

- **WP-00 Foundation and contracts: done** (2026-11-11), committed on `main`.
- Next: wave 1 (milestone M0). WP-01, 02, 03, 04, 05 and 06 can start in parallel. WP-21 needs the user's manual
  zips (and optionally a poly.pizza token); WP-T0 needs `TRIPO_API_KEY`. Then WP-I0 integrates and checks M0.

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
| `src/render/world/greybox.ts` | WP-04 → WP-13 | floor slabs from the live chunks, scrolling lane dashes, teal hero capsule, charcoal thief with a gold sack |
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
- **M2 assets, toon, characters.** `assets:fetch`/`assets:world`/`assets:chars` reproducible from `asset-sources`. Every shipped asset has a CREDITS row and licence snapshot. `world-kit.glb` ≤2 MB, each character ≤1.2 MB, `check-kit` passes. Ramp steps visible; hull outlines on hero/thief; baked shells on props; one directional + one hemisphere light. Clips idle/run/jump/fall/slide/hurt/victory play; run cadence follows speed; wall-run shows ~70° roll + spine lean; thief carries the sack. ≤100 draw calls, ≤300k tris in a bot run; `?greybox` still works.
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
- **`npm run patterns`, `stress`, `smoke`, `devices`, `loadtime`, `budget`, `profile`, `assets:*`, `inspect`,
  `icons`, `tripo:*`** fail with exit code 1 until their owners replace the placeholders.
