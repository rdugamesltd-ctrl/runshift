# CLAUDE.md

RUNSHIFT: a browser endless runner built with Three.js r187, TypeScript 7 and Vite 8, for phones (touch, portrait and
landscape) and desktops (keyboard). An original cartoon police officer (a Tripo model, `public/assets/characters/cop.glb`) chases a masked thief who stole gold down three
lanes (Subway Surfers style: swipe to change lane, jump and slide), and runs on the side walls where the floor is
missing. A run is seen in first person: the hero's own arms and legs are drawn over the world
(`src/render/characters/firstPersonBody.ts`), and `?chase` brings back the third-person chase camera. There is no
backend; progress is saved in `localStorage`.

M0 and M1 (wall-running) are verified; M2 art is in progress, with a rail-yard track, liveried trains and working power-ups (magnet, ×2, shield, jet glide). Integrators keep this file current;
WP-55 writes the final version. The project is built in
work packages (WP-xx): ownership, style and the normative rules are in `docs/CONVENTIONS.md`, progress in
`docs/STATUS.md`.

## Commands

On Windows, PowerShell may block `npm.ps1`. If it does, use `npm.cmd` (and `npx.cmd`).

- `npm run dev` starts the Vite dev server (port 5173 by default). It shows the boot screen, then the menu and
  grey-box run. URL parameters for testing (`?debug`, `?bot=`, `?seed=`, `?d=` and more) are listed in `src/debug/hooks.ts`.
- `npm run typecheck` (`tsc --noEmit`) is the fast correctness check.
- `npm test` runs the vitest unit tests (`src/**/*.test.ts`, Node environment, everything but `src/dev`).
- `npm run build` type-checks, builds `dist/` with relative paths, then runs `tools/postbuild.mjs`. The warning about a
  chunk over 500 kB is expected (three.js). `npm run build:poki` and `npm run build:crazygames` build the portal
  versions (`--mode`, which sets `__PLATFORM__`). `npm run preview` serves `dist/`.
- `npm run patterns` and `npm run stress` run the long reports in `src/dev/` through their own vitest configs.
- `npm run smoke` checks menu, input, pause, results, bot survival and save persistence in headless Chrome;
  `npm run devices` checks menu and HUD geometry at desktop and phone sizes. `loadtime`, `budget`, `profile`,
  `assets:*`, `inspect`, `icons` and `tripo:*` are still placeholders owned by later packages (see `docs/STATUS.md`).
- Check a change in the browser with headless Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`, flags
  `--use-angle=swiftshader --enable-unsafe-swiftshader`) and `window.__runshift` (with `?debug` or `?bot`).
  Screenshots go to `artifacts/`, which is gitignored.

## Architecture

`index.html` shows the boot screen, written in plain ES5 so that it can report a start-up failure on any browser.
`src/main.ts` calls `startApp()` in `src/app/app.ts`, which builds the platform adapter, the stage, the save, the
track streamer, the run and the session, input, audio, HUD, menus, camera and views, then starts the loop. The loop
(`src/app/loop.ts`) runs fixed steps of `SIM.fixedDt` (1/60 s) with frames capped at `SIM.maxFrame`, and draws with
interpolation. Each frame: drain input into the run → fixed steps (`session.step`) → drain the run's events into
`celebrate()` → update the views → render.

The world moves and the player stays at the origin. Track space is (d, x, y) in metres, with `d` a float64 that is
never rebased; something at distance s renders at z = −(s − dRender).

| Path | Role |
|---|---|
| `src/balance.ts` | Every gameplay tuning value, in sections owned by packages. Change numbers here, not inline. |
| `src/game/types.ts` | The simulation contract: track, chunk, player, thief, run state, events, save. Frozen, additive changes only. |
| `src/game/track/` | Track generation and queries: `speed.ts` (speed curve), `streamer.ts` (40 m chunks), `testTrack.ts` (reference `TrackQuery`), `random.ts` (seeded rng), patterns, director, validator, walls, districts. |
| `src/game/entities/` | Player state machine, action buffer, collisions, the thief. |
| `src/game/systems/` | `Run` (one run, fixed steps), `Session` (screens), save and progress, scoring, bots, power-ups, the first-run tutorial (`tutorial.ts`; its lesson track is `track/tutorialTrack.ts`). |
| `src/render/types.ts` | The render contract: kit model names, assets, `View`, `ViewContext`. |
| `src/render/` | Stage, chase camera and aspect fit, quality, instancing (`InstanceBatch`), toon materials, asset loading, character rigs, world views (grey box first), VFX. |
| `src/input/` | Contract (`types.ts`), swipe detector, keyboard map, the input port, the audio unlock. |
| `src/audio/` | Synthesised sound. |
| `src/platform/` | Contract (`platform.ts`) and adapters: local now, Poki and CrazyGames later; chosen by `__PLATFORM__`. |
| `src/ui/` | DOM HUD, menus, icons, coach, settings, upgrades, credits; bundled fonts. |
| `src/debug/` | The test contract `hooks.ts` (`window.__runshift`, selectors, URL parameters, perf marks), `params.ts`, the overlay. |
| `src/dev/` | Long reports (patterns, stress), excluded from `tsc` and `npm test`. |
| `tools/` | Node `.mjs` tools: browser checks, asset pipeline, Tripo, postbuild. |

## Conventions and gotchas

- `src/game/**` is pure: it never imports three and never touches the DOM, so it runs in vitest, bots and the
  validator. Views read the run and never write it.
- Contracts (`src/game/types.ts`, `src/render/types.ts`, `src/input/types.ts`, `src/platform/platform.ts`,
  `src/debug/hooks.ts`) are frozen: additive changes only, through the integrator.
- No tuning numbers outside `src/balance.ts`; each package edits only its own section.
- Code style (Rail in the Air's): semicolons, single quotes, 2-space indent, LF, British English comments, JSDoc on
  every export, `import type` for types, strict TypeScript with no `any`.
- `TrackQuery` list queries write into `out[0..n)`, set `out.length = n` and return n; they hand out the track's own
  objects, taken coins and broken boxes included. `src/game/track/testTrack.ts` is the reference.
- Time bases: the sim counts seconds (`RunState.time`); `ActionEvent.at` is `performance.now()` milliseconds.
- Node 24 cannot import the extensionless `.ts` sources, so tools that need game code run through vitest configs.
- Git: `main` is the integration branch; packages work in worktrees on `wp/<id>`. Gitignored files (the manual asset
  zips under `asset-sources/`) exist only in the main checkout.
- In Git Bash a single command line holds about 8 KB, so a long heredoc fails with "unexpected EOF": write big files
  with the editor tool. `python3` may be the Microsoft Store alias and hang.

## Assets

- Fonts: `src/ui/fonts/` (Fredoka and Lilita One, SIL OFL; the licences sit beside them).
- No models yet: the game runs in grey-box mode. The world kit (`public/assets/world-kit.glb`, WP-22) and the
  characters (`public/assets/characters/{hero,thief}.glb`, WP-24) are baked from `asset-sources/` (WP-21), which is
  never shipped. Every third-party asset needs a row in `assets/CREDITS.md`; CC-BY assets also need the in-game
  credits screen.
- Music: `public/assets/music/` (`main-menu.mp3` on the menu and results, `highway-jumpers.mp3` during a run), streamed
  by `GameAudio.setMusic` (`src/audio/audio.ts`); file names and levels are in `src/audio/sfx.ts`. Browsers block
  sound until a gesture, so the local build ends its boot screen with "tap to start" (`bootDone` in
  `src/app/boot.ts`); portals and automated browsers (`navigator.webdriver`) skip it.
- The user generates the hero, the thief and a few props in Tripo (paid plan): `docs/TRIPO-ASSETS.md`.

## Docs

- `docs/CONVENTIONS.md`: briefing, ownership, code style, contract semantics, the normative simulation rules, the
  pattern format, the test contract.
- `docs/STATUS.md`: what is done, what is still a stub, hook-ups, milestones and schedule.
- `research_notes/RESEARCH.md`: the research and decisions behind the plan (assets, licences, technical choices).
- `docs/TRIPO-ASSETS.md`: the asset request list for the user.
