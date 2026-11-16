# Catch the Thief conventions

How every work package (WP) builds Catch the Thief: ownership, code style, the contracts and the rules they encode.
Written by WP-00. Sections marked *(from the plan)* are copied verbatim from the approved plan; the rest is
WP-00's reading of it. Integrators keep this file current.

## Briefing for every package *(from the plan)*

**Briefing for every package.** Read `CLAUDE.md`, `docs/CONVENTIONS.md`, `research_notes/RESEARCH.md`, the four contract files, `src/balance.ts`, and your WP section. Edit only owned files; contract changes additive only and listed in the report; edit only your `balance.ts` section; after M0 never edit `src/app/app.ts` or `celebrate.ts` (export a factory and report the one-line hook-up); `src/game/**` imports no three/DOM; Rail code style (semicolons, single quotes, 2-space, British English comments, JSDoc on exports, `import type`); on Windows use `npm.cmd` if `npm.ps1` is blocked. Done = `npm run typecheck` clean, `npm test` green with new tests, self-verification output pasted. Report: summary, files, contract changes, hook-up lines, tests, verification output, screenshot paths, known issues.

In practice:

1. Read `CLAUDE.md`, this file, `research_notes/RESEARCH.md`, `docs/STATUS.md`, the four contract files
   (`src/game/types.ts`, `src/render/types.ts`, `src/input/types.ts`, `src/platform/platform.ts`), the test
   contract `src/debug/hooks.ts`, `src/balance.ts`, and your WP section.
2. Work in your worktree on branch `wp/<id>` (for example `wp/01`), branched from `main`.
3. Most files you own already exist as WP-00 stubs with the planned exports and `TODO WP-xx` comments. Replace
   the stub bodies, keep the export names and signatures that other packages and `src/app/app.ts` already use,
   and remove the TODO lines you fulfil. If you must change an export that `app.ts` or `celebrate.ts` uses,
   report the replacement line instead of editing those files (after M0 only integrators edit them).
4. Done means `npm run typecheck` clean and `npm test` green with your new tests; paste the output in your report.

## Ownership *(from the plan)*

`[WP-xx]` is the owner; `[a→b]` means a first, then b.

```
RUNSHIFT/
├─ index.html, package.json, tsconfig.json, vite.config.ts, .gitignore, .editorconfig   [00]
├─ CLAUDE.md [00 skeleton → integrators → 55]
├─ research_notes/RESEARCH.md [00]  tripo-spike.md [T0]
├─ docs/ CONVENTIONS.md [00] TRIPO-ASSETS.md [00→51] UI-DESIGN.md [05] PATTERNS.md [12→41]
│        ASSET-PIPELINE.md [21/22] BLENDER-RETARGET.md [51] PLAYTEST.md [55] STATUS.md [integrators]
├─ assets/CREDITS.md [21; read by 52]
├─ asset-sources/ (never shipped) README.md, polypizza/{manifest.json,<id>.glb} [21]
│  ├─ quaternius/{downtown-megakit,ual2,modular-train}/ kenney/{city-kit-commercial,city-kit-roads,car-kit,train-kit}/
│  │  kaykit/city-builder-bits/ (manual zips, gitignored) [21]
│  ├─ tripo/<asset>/ (user drops, see Asset request list)  blender/<asset>/ [51]
│  └─ snapshots/<date>-<slug>.{png,html} [21]
├─ public/assets/world-kit.glb [22]  characters/{hero,thief}.glb [24]  manifest.webmanifest, icons/, sw.js [53]
├─ src/
│  ├─ main.ts [00→04]  vite-env.d.ts [00]  balance.ts [00; each WP edits only its section]
│  ├─ app/ boot.ts loop.ts app.ts celebrate.ts [04; after M0 only integrators edit app.ts/celebrate.ts]
│  ├─ game/ types.ts [00]
│  │  ├─ track/ random.ts speed.ts testTrack.ts [00]  streamer.ts convert.ts director.ts tiers.ts obstacles.json
│  │  │   patterns.ts pattern.schema.json tutorialTrack.ts patterns/*.json [02→12→31→41]
│  │  │   walls.ts validator.ts [12→42]  districts.ts [31]  thiefTrail.ts [34]
│  │  ├─ entities/ player.ts actions.ts collision.ts [01→11]  thief.ts [01→14→34]
│  │  └─ systems/ run.ts scoring.ts session.ts save.ts progress.ts [01; run/progress→32]
│  │       bot.ts [01→42]  powerups.ts [32]  tutorial.ts [14→43]
│  ├─ render/ types.ts [00]  dispose.ts [00, Rail copy]
│  │  ├─ stage.ts cameraFit.ts [04]  camera.ts [04→13]  quality.ts [04→44]
│  │  ├─ toon/ ramp.ts toonify.ts outline.ts palette.ts [23]
│  │  ├─ instancing/ instanceBatch.ts [04]  coinsView.ts obstaclesView.ts [04→25]
│  │  ├─ assets/ loaders.ts worldKit.ts registry.ts [22]  characters.ts animationLibrary.ts [24]
│  │  ├─ characters/ characterRig.ts heroView.ts thiefView.ts wallPose.ts [24; thiefView→34]
│  │  ├─ world/ greybox.ts [04→13]  worldView.ts shells.ts sky.ts blobShadow.ts [25]  tunnel.ts rooftop.ts [31]
│  │  └─ fx/ sparks.ts speedTrail.ts speedLines.ts shieldBubble.ts glideBoard.ts pickupsView.ts magnetFlight.ts [33]
│  ├─ input/ types.ts [00]  swipe.ts keyboard.ts input.ts unlock.ts [03]
│  ├─ audio/ audio.ts sfx.ts [03→35]
│  ├─ platform/ platform.ts [00]  local.ts index.ts [03]  poki.ts crazygames.ts [53]
│  ├─ ui/ styles.css hud.ts menus.ts icons.ts fonts/ [05]  coach.ts [14→43]  settings.ts [43]
│  │     upgrades.ts powerups.css [33]  credits.ts credits.generated.ts [52]
│  ├─ debug/ hooks.ts [00 contract, 04 impl]  params.ts overlay.ts [04]
│  └─ dev/ (excluded from tsc) patterns.report.test.ts [12→42]  stress.test.ts [42]
└─ tools/
   ├─ lib/ browser.mjs server.mjs [06]  smoke.mjs devices.mjs [06→45]  budget.mjs [06→45→54]
   ├─ loadtime.mjs [45] profile.mjs [44] postbuild.mjs make-icons.mjs [53] stress.config.mjs [42]
   ├─ assets/ sources.json fetch-polypizza.mjs snapshot.mjs [21]  build-world.mjs lib/{bake,shell,palette}.mjs
   │   check-kit.mjs inspect-models.mjs inspect-prims.mjs model-sheet.html toon-sheet.html [22/23]
   │   build-characters.mjs [24→51]  credits.mjs check-credits.mjs [52]
   ├─ tripo/ client.mjs rig.mjs retarget.mjs status.mjs README.md [T0→51]
   ├─ blender/ export_actions.py [51]
   └─ patterns/ vitest.config.mjs [12]
```

`package.json` is frozen after WP-00 and pre-declares all scripts: `dev`, `build` (`tsc --noEmit && vite build && node tools/postbuild.mjs`), `build:poki`, `build:crazygames`, `preview`, `typecheck`, `test`, `patterns`, `stress`, `smoke`, `devices`, `loadtime`, `budget`, `profile`, `assets:fetch`, `assets:world`, `assets:chars`, `assets:credits`, `assets:all`, `inspect`, `icons`, `tripo:rig`, `tripo:retarget`. Deps: `three ^0.187.0`. Dev: `@types/three 0.187.0`, `typescript ^7.0.2`, `vite ^8.3.6`, `vitest ^5.1.0`, `@gltf-transform/{core,extensions,functions} ^4.5.1`, `meshoptimizer ^1.3.0`, `sharp ^0.35.5`, `puppeteer-core ^24.43.1`.

Notes on the tree:

- `ui/upgrades.ts` and `ui/powerups.css` are marked [33] in the tree, but the WP-32 section lists them as WP-32's
  deliverables (the upgrade panel spends gold on power-ups). WP-00 treats them as WP-32's; the integrator decides.
- `tools/postbuild.mjs` [53] already exists as a no-op so `npm run build` passes; every other tool script named in
  `package.json` exists as a placeholder that exits with code 1 and names its owner, as do `src/dev/*.test.ts`.
- Data files are not stubbed: `src/game/track/obstacles.json`, `pattern.schema.json` and `patterns/*.json` are
  created by WP-02.

### `src/balance.ts` sections

Each package edits only its own section. The plan does not name the section owners; this is WP-00's reading of
which package uses each value. Ask the integrator before touching another section.

| Section | Owner | Section | Owner |
|---|---|---|---|
| `SIM` | WP-04 | `CHUNK` | WP-02 |
| `SPEED` | WP-01 | `FOG` | WP-04 → WP-25 |
| `LANES`, `PLAYER`, `JUMP`, `SLIDE`, `AIR`, `STUMBLE` | WP-01 → WP-11 | `TIERS` | WP-02 → WP-41 |
| `INPUT.buffer` | WP-01 | `THIEF` | WP-01 → WP-14 → WP-34 |
| `INPUT.swipe` | WP-03 | `COINS`, `SCORE` | WP-01 |
| `WALL` (FSM values) | WP-11 | `POWERUPS`, `UPGRADES` | WP-32 |
| `WALL.minLength`, `maxLength`, `leadIn`, `minLanding` | WP-12 | `RESULTS` | WP-01 (`resumeCountdown`: WP-04) |
| `WALL.rootRollDeg`, `spineLeanDeg` | WP-24 | `QUALITY` | WP-04 → WP-44 |
| `CAMERA` | WP-04 → WP-13 (`wall`, `reducedMotionRoll`) | `BUDGET` | WP-06 → WP-54 |
| | | `TOON` | WP-23 |

## Code style

The house style of Rail in the Air (`c:\Users\workp\Documents\game web\Rail in the Air`):

- TypeScript, `strict`, `noUnusedLocals`, `noUnusedParameters` (prefix an unused parameter with `_`),
  `isolatedModules`. No `any`; `unknown` plus narrowing instead. No enums, no namespaces.
- Semicolons, single quotes, 2-space indent, LF line endings (`.editorconfig`, `.gitattributes`), lines up to about
  130 characters.
- `import type` for type-only imports.
- JSDoc on every export; comments in British English (colour, behaviour, metres), saying why rather than what.
- No tuning numbers outside `src/balance.ts`. Purely visual constants (a dash length in the grey box, a colour) may
  live in the view as named constants.
- `src/game/**` is pure: it never imports `three` and never touches the DOM (the save's `browserStore()` guards
  `localStorage` with try/catch, Rail's pattern). Views read the simulation and never write it.
- Unit tests sit next to the code as `*.test.ts` and run in Node (`npm test`). Long reports live in `src/dev/`
  (excluded from `tsc` and `npm test`) and run through their own vitest configs (`npm run patterns`, `npm run stress`).
- Tools are `.mjs`. Node 24 cannot import the extensionless `.ts` sources directly, so a tool that needs game code
  runs through a dedicated vitest config.
- Per-frame code avoids allocation: reuse `out` objects and arrays, as the contracts do.

## Contracts

`src/game/types.ts`, `src/render/types.ts`, `src/input/types.ts`, `src/platform/platform.ts` and the test contract
`src/debug/hooks.ts` are frozen after WP-00. Changes are additive only (a new union member, a new optional field, a
new interface), listed in your report, and merged by the integrator. Never rename or remove anything in them.

Units and time bases:

- Track space: `d` metres along the run (float64, never rebased), x metres right, y metres up. Lanes at
  x = lane × `LANES.width` (−2, 0, 2), walls at x = side × `WALL.planeX` (±3.6), street floor y = 0. Render:
  z = −(s − dRender), run direction −Z, the player stays at the origin and the world moves.
- Sim time: seconds (`RunState.time`), fixed steps of `SIM.fixedDt`. `ActionBuffer` works in sim seconds.
- `ActionEvent.at` and the `SwipeDetector` times are `performance.now()` milliseconds, the DOM's time base.
- Beats: seconds of travel at the predicted arrival speed; metres = beats × `speedAt(...)`.
- Speed curve: `src/game/track/speed.ts` (`speedAt`, `distanceAt`, `timeForDistance`).

`TrackQuery` semantics (the reference implementation is `createTestTrack` in `src/game/track/testTrack.ts`, and its
tests pin them down):

- `floorAt(d, x?)`: floors are half-open `[start, end)`; where spans overlap the highest wins; `null` over a gap.
  `x` is reserved for per-lane floors; `FloorSpan` has no x extent, so the test track ignores it.
- `runnableWall(d, side)`: the wall span on that side with `start ≤ d < end`, or `null`.
- `resolveWallJump(d, from, v)`: land = d + v·`WALL.speedFactor`·`WALL.jumpTime`; the opposite wall if one covers
  `[land, land + v·WALL.minLanding]` → `wall`; else a floor at `land` → `floor`, lane 0; else `none`.
- `boxesIn`, `coinsIn`, `pickupsIn(d0, d1, out)`: closed overlap with `[d0, d1]`, ascending d, the track's own
  objects (taken coins and broken boxes included; callers filter), written to `out[0..n)` with
  `out.length = n`; returns n.
- `pathAt(d, out)`: copies the last key with `key.d ≤ d` into `out` (optional fields reset to `undefined`), or
  `{ d, lane: 0 }` before the first key; returns `out`.
- `nextGap(d)`: the gap d is over, else the next gap ahead, else `null`; `walls` is true when any wall span overlaps
  it. Only gaps between floor spans count (the test track's ends are off the track).
- `tierAt(d)`: index into `TIERS` by distance (`TIERS[i].from ≤ d`).

## Simulation rules (normative) *(from the plan)*

- **W1 attach rule.** A left/right press attaches to that side's wall when: `runnableWall(d + v·attachTime, side)` exists; `|x − side·planeX| ≤ attachReach` (centre lane qualifies, far lane does not); mode is run, jump, slide, or air with `y > minAttachY`. Otherwise it is a lane change. In the outer lane pressing outward stays buffered for `entryBuffer` 0.30 s with W1 rechecked each step; on expiry it becomes a cosmetic `bump`.
- **Modes:** run (L/R lane change 0.14 s smoothstep or W1; up jump; down slide) → air when floor ends. A press during a lane change starts a new one from the current x; it keeps the sideways speed when it goes the same way (cubic Hermite, capped so it never overshoots; `laneCurve`) and starts from rest when it turns back. jump: apex 1.35 m, airtime 0.6 s, rising for `JUMP.riseShare` 0.55 of it under the lighter `GRAVITY_UP` and falling under `GRAVITY` (`jumpArc` gives the curve; the time above any height is airtime·√(1 − h/apex), as for one gravity); down = fast fall vy −18 then slide on landing. slide 0.7 s height 0.8 (up cancels into jump). air (up while t<0.15 = coyote jump; W1 while y>−0.6) → fall at y<−0.6. fall → gameOver after 0.9 s; glide catches once (`glideSave`). wallAttach 0.18 s → wallRun. wallRun: up/down band change 0.15 s; away = wallJump to `resolveWallJump`; toward ignored; speed ×1.05; `wallTime` accumulates across chained walls, slips from 2.0 s at 2.6 m/s, detaches at 2.8 s or y<0.25; leaves to wallJump / wallExit (span ends with floor) / air (span ends over gap or timeout) / crash (block in player band). wallJump 0.5 s, 7.2 m lateral, apex +0.6 → wallRun opposite (keeps band) | run lane 0 | air→fall. wallExit 0.25 s → run in lane = side. crash → gameOver after 1.4 s.
- **`resolveWallJump`:** land = d + v·1.05·0.5; opposite wall covering [land, land + v·0.3] → `wall`; else floor at land → `floor` lane 0; else `none`. `v` is the speed curve's value (the player passes `ctx.v / 1.05`) and `d` the distance the jump starts from: the previous step's, since the press is used in the step that already flies the first part of the arc. A jump that finds nothing at its end falls on with the arc's downward speed and glides to the nearest lane.
- **Collisions:** ground box 0.8×0.6×height (1.7 / 0.8 sliding); on wall x from side·(planeX−1.6) to side·planeX, y = bandBox[band] (follows slip); wall-jump 0.8×1.2 centred on arc. Sweep boxes in [dPrev−0.3, d+0.3]. Overlap already present at dPrev = front crash. Overlap caused by x change during lane change = stumble: bounce to `laneFrom`, speed ×0.8 recovering over 1.2 s; second stumble within 5 s = crash. `jump` box passed when feet ≥ y1; `slide` box passed when head ≤ y0. `invulnT>0` or `broken` = no collision. Shield: crash breaks the box instead (`shieldBreak`), shield → 0, invulnerable 1 s.
- **`Run.step` order:** intro/over → time, `v = speedAt(time)`×modifiers → prev snapshot → `d += v·dt` → streamer.update → stepPlayer → collisions → coins/pickups (magnet) → power-up timers, `p.gliding` → thief (target lead `clamp(0.9·v, 8, 26)`, tutorial lead 1.6 s; his own speed eases at `THIEF.speedRate` towards v + `leadGain`·(target − lead), the lead held within [8, 26] m, and keeps his pace once the player stops; he moves as a ghost runner, a `PlayerState` stepped by `stepPlayer` and pressed along `pathAt` by `routeAction`, the perfect bot's controller, with no collisions; never caught) → score/tier/district/milestone/newBest → game over check. The thief runs the same validated path keys the perfect bot replays.

Signatures every package honours *(from the plan)*:

Signatures every package honours: `stepPlayer(p, track, ctx: { d; v; time }, buf: ActionBuffer, dt, events)`, `copyPlayer(from, to)`, `playerBox(p, d, out)`, `class Run { state; track; constructor(track, { decorators }); reset(opts); push(a: ActionEvent); step(dt); drainEvents() }`, `class Session { screen: 'menu'|'run'|'results'; run; progress; result; paused; play(); retry(); toMenu(); setPaused(); step(dt); onScreen }`, `cleanSave(raw)`, `browserStore()`, `memoryStore()` (Rail `save.ts` pattern).

## Pattern JSON *(from the plan)*

`src/game/track/patterns/*.json` + `pattern.schema.json`. WP-00's TypeScript reading of it is in
`src/game/track/patterns.ts` (WP-02 owns and may refine it).

```jsonc
{ "id": "t2-wall-left-sign", "tiers": [2, 3], "weight": 1, "beats": 2.6, "shell": "pitWalls", "districts": ["street", "rooftop"],
  "gaps": [{ "t0": 0.5, "t1": 2.1 }],
  "walls": [{ "side": -1, "t0": 0.2, "t1": 2.3, "surface": "hoarding", "blocks": [{ "t": 1.2, "len": 0.25, "kind": "wallSignHigh" }] }],
  "obstacles": [{ "t": 0.1, "kind": "barrierLow", "lanes": [1], "len": 0 }],
  "coins": [{ "t0": 0.6, "t1": 1.0, "wall": -1, "band": "high" }, { "t0": 1.4, "t1": 2.0, "wall": -1, "band": "low" }],
  "pickups": [{ "t": 2.45, "lane": 0, "kind": "random" }],
  "path": [{ "t": 0.0, "lane": -1 }, { "t": 0.3, "act": "wall", "side": -1, "band": "high" }, { "t": 1.0, "act": "band", "band": "low" }, { "t": 2.3, "act": "exit" }],
  "actions": 3 }
```

Times `t` are beats (seconds of travel, metres = beats × predicted arrival speed); coin spacing is metres. Validator rules: wall length in [0.8, 2.4] beats; a wall serving a gap starts ≥ `WALL.leadIn` 0.3 beats before it; a gap without walls ≤ 0.45 beats; longer gaps fully covered by walls or wall-jump chains; a wall ending over a pit needs a `wallJump` path to an opposite wall; coins never inside a box; the authored path survives at v_min and v_max of its tiers; the tightest action gap ≥ `TIERS[t].minGap`.

## Test contract *(from the plan)*

Types in `src/debug/hooks.ts` (`RunshiftHooks`, `DebugState`, `DebugStats`, `UrlParams`, `DataAct`, `DataHud`,
`PerfMark`); `src/debug/params.ts` parses the URL; the WP-00 stub of `src/app/app.ts` already installs a working
`window.__runshift`.

`window.__runshift` exists with `?debug` or `?bot`: `ready`, `screen()`, `paused()`, `play()`, `retry()`, `toMenu()`, `act(action)`, `events()`, `state()` → `{ phase, d, v, mode, lane, x, y, gold, score, tier, district, thiefLead, powerUps }`, `stats()` → `{ fps, calls, triangles, geometries, textures, dpr, quality }`, `save()`.
DOM selectors: `.scr-menu`, `.scr-results`, `.scr-pause`; `[data-act=play|retry|menu|pause|resume|mute|settings|howto|credits|upgrades|back|buy-<kind>]`; `[data-hud=score|gold|multiplier|powerups]`.
URL params: `?debug`, `?bot=perfect|sloppy|random|idle`, `?seed=N`, `?d=metres`, `?tier=N`, `?pattern=id`, `?district=…`, `?speed=x`, `?greybox`, `?quality=low|high`, `?reduced`, `?tutorial` (forces the tutorial; a new player gets it anyway on a real save), `?powerups=all`, `?nosw`. Any of seed/d/tier/pattern/district/bot/tutorial switches to `memoryStore`. Performance marks: `runshift:main|assets|menu|run`.

## Git and worktrees

- `main` is the integration branch. Each package works in a worktree on `wp/<id>` and commits there; the
  integrator merges. Do not commit on `main` from a package.
- Commit messages: short imperative summary, then the attribution line your instructions give.
- Never commit `node_modules/`, `dist/`, `artifacts/` (screenshots and tool output), `.env` files or API keys.
  `TRIPO_API_KEY` and `POLYPIZZA_TOKEN` come from the environment and are never logged.
- Gitignored files are not in a worktree. The manual asset zips (`asset-sources/quaternius/`, `kenney/`, `kaykit/`)
  exist only in the main checkout, `c:\Users\workp\Documents\game web\RUNSHIFT`; asset tools should read them
  from there. Files the user drops in `asset-sources/tripo/` reach worktrees only once they are committed.
- A new worktree needs its own `npm.cmd install` (or a junction to the main checkout's `node_modules`).

## Windows notes

- PowerShell may block `npm.ps1`: use `npm.cmd` (and `npx.cmd`).
- In Git Bash, one command line holds only about 8 KB: a long heredoc gets cut off and fails with "unexpected EOF".
  Write big files with the editor tool instead.
- `python3` may be the Microsoft Store alias, which hangs waiting for input. Use Node for scripts.
- Headless Chrome is at `C:\Program Files\Google\Chrome\Application\chrome.exe` (Edge at
  `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`); WebGL needs `--use-angle=swiftshader
  --enable-unsafe-swiftshader`.
