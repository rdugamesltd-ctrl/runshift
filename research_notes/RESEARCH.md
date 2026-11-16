# Catch the Thief research notes

The research behind Catch the Thief and the decisions it led to, copied verbatim by WP-00 from the approved
implementation plan (2026-11-11), so later work packages never need the plan file. The copied sections keep
the plan's headings. The plan's architecture, contracts, simulation rules, pattern format and milestones live
in `docs/CONVENTIONS.md`, `docs/STATUS.md` and the contract files themselves.

What changed after the plan was written (keep this list current):

- Git: the user approved `git init`; WP-00 created the repository on branch `main`. Packages work in worktrees
  on `wp/<id>` and the integrator merges.
- Tool versions actually installed by WP-00: three 0.187.0, @types/three 0.187.0, vite 8.3.8 (range ^8.3.6),
  vitest 5.1.0, typescript 7.0.2, @gltf-transform/* 4.5.1, meshoptimizer 1.3.0, sharp 0.35.5,
  puppeteer-core 24.43.1. Node 24.14.

## Context

New game in the empty folder `c:\Users\workp\Documents\game web\RUNSHIFT`. Core loop is Subway Surfers (3 lanes, jump, slide, swipe), with two twists:

1. **Hero chases a thief.** An original cartoon speedster superhero (not the DC Flash) runs after a masked cartoon burglar who stole gold (Talking Tom Hero Dash framing). The thief is always ahead and never caught; he is a visual pacer and scatters gold. Score = distance + gold.
2. **Wall-running.** When the floor is missing, side walls (buildings, billboards, tunnel walls) appear. The player swipes toward a wall to stick to it; the camera rolls; missing the swipe = fall = game over. Hybrid tutorial not requested.

## Decisions (confirmed with user 2026-11-11)

| Topic | Decision |
|---|---|
| Stack | Three.js + Vite + TypeScript (same as Rail in the Air / hero shooter) |
| Chase | Thief always ahead, never caught (pacer + gold trail) |
| Wall-run | Swipe toward wall to enter; skill-based |
| Platform | Full mobile (touch, portrait + landscape) and full PC (keyboard) |
| Art | Cartoon toon-shaded (rounded, bright, outlined) |
| Hero | Original speedster, own colors/logo, speed trail |
| World | City streets + rooftops + subway/tunnels |
| Power-ups MVP | Gold magnet, shield / second chance, score multiplier, hoverboard-style glide (saves one fall) |
| AI 3D tool | Tripo (paid plan) — user generates what free sources lack |
| Animations | CC0 libraries (Quaternius UAL, KayKit) retargeted in Blender to the Tripo rig |
| Meta scope | Core run + localStorage save (gold total, high score, power-up upgrade levels). Shop/missions later |
| Thief | Masked cartoon burglar with gold sack |
| Subagents | User wants implementation work done by Opus subagents at max effort |
| Git | Yes: WP-00 runs `git init`; packages work in worktrees on `wp/<id>`, integrator merges |
| API keys | None for now: WP-21 does manual downloads (user downloads from URLs in `asset-sources/README.md`); WP-T0 is deferred until the user generates Tripo models |
| Blender | Not available: slide/land/knockback use fallback poses + Tripo presets only; `docs/BLENDER-RETARGET.md` stays as an optional later step |
| Hero look | Teal + orange suit, white speed-chevron, goggles, no cape, no mask |

## Research summary (3 Opus agents, 2026-11-11)

### Free 3D assets: what is covered and what the user must generate

| Category | Free? | Picks (CC0 unless noted) |
|---|---|---|
| Hero speedster | **No** | Generate with Tripo. Placeholder: Quaternius Animated Platformer Character https://poly.pizza/m/kKtL4zvS3n |
| Masked burglar | **No** (placeholders only) | Generate with Tripo. Placeholder: Quaternius Ninja https://poly.pizza/m/xGYmeDpfTu; sack = Gold Bag https://poly.pizza/m/vFFblhnHtb |
| City kit | Yes | Quaternius Downtown City MegaKit (153 free) https://quaternius.itch.io/downtown-city-megakit; Kenney City Kit Commercial + Roads; KayKit City Builder Bits; J-Toastie City Pack bundle (CC-BY: fire exit, roof exit, AC, billboard) https://poly.pizza/bundle/City-Pack-kJqRAIGsw0 |
| Subway / tunnel | Partial | Kenney Train Kit; Quaternius Modular Train Pack https://poly.pizza/bundle/Modular-Train-Pack-jYEybkFVr1. Tunnel + wall-run panels: build procedurally. Metro car in house style: Tripo |
| Obstacles | Yes | Kenney Car Kit; Traffic Barrier cM3aJPU9NS, Construction Barrier 4mrO9ueiQr, Cone lAx8JytxGD, Dumpster PKsbolkZSr, Taxi x43lOScTpN, Water Tower tMK8bhapAK, AC amFuyE3IF6, Scaffolding AYQd5RQ8w4 (all poly.pizza/m/ID) |
| Collectibles | Mostly | Coin QHZtj94fvh, Gold Ingots 3jRhAgbc6t, Pickup Thunder fUfTnyvYdl. Magnet dD2RIIea6WR (CC-BY), Hoverboard iJ8ZSLvSUl (CC-BY). Shield = fresnel sphere shader. Magnet/shield/glide-board in house style: Tripo |
| Animations | Mostly | Quaternius UAL1 (45 free) + UAL2 (42 free, has SLIDE, SLIDE_LOOP, NINJUMP_JUMP/LAND, KNOCKBACK); KayKit Character Animations (150+). **No wall-run clip anywhere**: run clip + procedural roll |
| Audio | Yes | Kenney Digital Audio, Interface Sounds, Impact Sounds, Casino Audio, Sci-fi Sounds, Music Jingles |
| Sky | Yes | Poly Haven kloofendal_48d_partly_cloudy_puresky, rooftop_night |

License notes: Quaternius license page became "QAL v1.0" (8/28/2026) while pack pages still say CC0; both allow commercial use with no credit. Snapshot pages at download. CC-BY assets need an in-game credits screen. poly.pizza API: `https://api.poly.pizza/v1.1/model/{id}` with `X-Auth-Token`, fields ID, Title, Attribution, Download, Tri Count, Creator, Licence, Animated. Tripo output must be from the paid plan (free tier is public CC-BY / non-commercial).

### Reusable code from sibling projects (`c:\Users\workp\Documents\game web\`)

- **Rail in the Air**: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` meta; `tools/build-world.mjs` (Poly Pizza GLB bake → one kit GLB), `tools/build-assets.mjs` (Kenney kits), `tools/inspect-models.mjs`, `inspect-prims.mjs`, `model-sheet.html`; `src/render/scene.ts`, `dispose.ts`, `effects.ts`, `kit.ts`/`worldKit.ts`, `clouds.ts`, `paint.ts`, `camera.ts`; `src/main.ts` loop (fixed 1/120, buffered input, adaptive resolution, pause handlers, `?debug`); `src/game/save.ts`, `career.ts`, `session.ts`, `gameState.ts`, `economy.ts` (`intensityOf`), `balance.ts`, `tutorial.ts`, `bot.ts`; `src/track/random.ts`; `src/ui/input.ts` (swipes, extend to 4 directions), `hud.ts`, `styles.css` touch rules; `src/audio/audio.ts`; `docs/UI-DESIGN.md`, `docs/PLAYTEST.md`; `asset-sources/README.md` + `manifest.json` + `assets/CREDITS.md` format.
- **hero shooter**: `src/game/engine/Camera.ts` exp smoothing + trauma shake; `src/game/input.ts` consume/endFrame; `scripts/bake.mjs` self-starting vite + puppeteer; `index.html` boot/error screen; `.gitignore`.
- **race**: `tools/smoke.mjs`, `devices.mjs`, `loadtime.mjs`, `profile.mjs`, `src/perf.js`, `sw.js`, `manifest.webmanifest`, `vercel.json`.
- **container-port-zombies**: `CLAUDE.md` structure, `scripts/touch-smoke.mjs`.
- Nothing in these projects does runtime skeletal animation. Hero/thief `AnimationMixer` code is new.

### Technical decisions

- three@0.187.0, @types/three@0.187.0, vite ^8.3, WebGLRenderer (not WebGPU). `Timer` instead of deprecated `Clock`. `PCFShadowMap`; blob shadows on mobile.
- Toon: `MeshToonMaterial` + 3-4 step `DataTexture` ramp; `OutlineEffect` or hand-made skinned inverted hull on characters only; baked shells for instanced props.
- World moves, player stays at origin. Distance `d` is float64; chunk z = -(start - d). Fixed 60 Hz sim + interpolation. 40 m chunks = shell (street / rooftop / pit / pit-with-walls / tunnel) + pattern (obstacles, coins, walls in beats). Horizon 180 m, fog 60-160, recycle at end < d-15. Swept AABB collision in track space. Coins in one InstancedMesh (256 slots, compacted).
- Speed `v(t) = 11 + 15·(1 − e^(−t/150))` m/s. Tiers by distance: 0-300 tutorial, 300-1200, 1200-3000, 3000-6000, 6000+; wall-run share 10% → 25%.
- Wall-run FSM and parameters (lanes x∈{-2,0,2}, wall plane x=±3.6, bands 0.9/2.1 m, attach 0.18 s, max wall time 2.8 s, wall-jump 0.5 s / 7.2 m, camera roll 18°, entry buffer 0.30 s, coyote 0.15 s, jump apex 1.35 m g≈30). Thief demonstrates the first wall-run.
- Input: pointermove swipe detector (threshold clamp(6% short side, 24-48 px), 280 ms, dominant axis ≥1.25×), action buffer 150-200 ms. Audio unlock on pointerup/touchend/keydown and resume on every gesture.
- Platform adapter (Local now, Poki / CrazyGames later). Budget target 5 MB initial, ≤100 draw calls, ≤300k tris, DPR ≤1.5 mobile.
- Tripo: rig `v3.0-20260909`, `rig_type biped`, `spec mixamo`, GLB; retarget presets in place (idle, run, jump, fall, hurt, turn, dive, climb). Missing clips (slide, land, knockback, victory) retargeted once in Blender 5 with the free Retarget extension from UAL2.

## Facts checked in sibling code that change decisions

1. Working versions: three 0.187.0, vite 8.3.6, vitest 5.1.0, typescript 7.0.2, gltf-transform 4.5.1, meshoptimizer 1.3.0, puppeteer-core 24.43.1. `sharp` 0.35.5 is used by Rail's `build-world.mjs` but undeclared; Catch the Thief declares it.
2. three 0.187: `Timer` exported from `three`; `PCFSoftShadowMap` removed; GLTFLoader handles EXT_ and KHR_meshopt; `SkeletonUtils.clone`/`retargetClip` exist.
3. **OutlineEffect ignores `instanceMatrix`**, so it is wrong for InstancedMesh and renders the scene twice. Decision: hero/thief get a skinned inverted hull (`onBeforeCompile` BackSide material); props get a baked shell appended at the end of the index buffer (low quality hides it with `drawRange`).
4. gltf-transform `quantize()` corrects skin inverse bind matrices, so characters can be quantised.
5. GLTFLoader sanitises names (`mixamorig:Hips` → `mixamorigHips`); clip merging matches bones by lowercase alphanumerics.
6. Node 24 needs `.ts` extensions for TS tools; TS-importing tools run through dedicated vitest configs, file-only tools are `.mjs`.
7. Chrome and Edge are installed. **Blender is not installed** (needed in M5 for the gap-clip retarget).
8. World moves, player at origin: a static sun, no sun-follow.

## Architecture

- Axes: x right, y up, run direction −Z. Track space (d, x, y), `d` float64 metres. Lanes x∈{−2,0,2}; walls x=±3.6; floor y=0. Anything at track distance s renders at `z = −(s − dRender)`.
- `src/game/**` is pure: no three, no DOM. Runs in vitest, validator, bots and browser.
- Loop: `SIM.fixedDt = 1/60`, render interpolation (`alpha`), `MAX_FRAME = 0.1`, buffered one-shot actions, events drained once per frame into `celebrate()`. `Timer` connected to `document`.
- Views read the sim, never write it. Every kit model is drawn by one per-frame `InstanceBatch` (DynamicDrawUsage, `frustumCulled=false`, count compaction). Draw calls scale with distinct models, not chunks.
- Toon: `MeshToonMaterial` + 3-4 step ramp; one DirectionalLight + one HemisphereLight; world models baked to vertex colours so the world shares one material.
- Contracts (`src/game/types.ts`, `src/render/types.ts`, `src/input/types.ts`, `src/platform/platform.ts`) are frozen after WP-00; later changes are additive only and merged by the integrator.

## Asset request list for the user (Tripo, paid plan)

Drop files into `asset-sources/tripo/<asset>/` as `<asset>.glb` (mesh), `<asset>.rig.glb` (rigged), `<asset>.anim.<preset>.glb` (retargeted presets). Generate on the paid plan and keep receipts. Use the `t_pose` image template or an explicit "T-pose, arms straight out, legs slightly apart, neutral face" line. Style line for every prompt: "cartoon game character, stylised toon shading, flat bold colours, simple shapes, no text, no logos, no real brands, clean silhouette, mobile game asset".

| Asset | Prompt | Faces | Rig / presets |
|---|---|---|---|
| **hero** | "Original cartoon speedster superhero, athletic build, sleek teal and orange bodysuit with a stylised white speed-chevron on the chest, small aerodynamic goggles, short spiky hair, orange gloves and boots, no cape, no mask, T-pose" | 10-12k | rig v3.0 biped spec mixamo; presets idle, run, jump, fall, hurt, turn, dive, climb (in place) |
| **thief** | "Cartoon masked burglar, stocky comic proportions, black domino mask, black-and-white striped long-sleeve shirt, black beanie, dark trousers, fingerless gloves, sly grin, T-pose, empty hands" | 8-10k | same as hero |
| **gold-sack** | "Cartoon burglar loot sack, bulging brown cloth bag tied at the top with rope, gold coins and a gold bar poking out, flat colours" | 500-1k | none |
| **metro-car** | "Cartoon subway metro car, single carriage, rounded friendly shape, teal and cream livery with orange stripe, big windows, no text, side view neutral, 12 m long proportion" | 2-3k | none |
| **pickup-magnet** | "Cartoon horseshoe magnet pickup, red with silver tips, chunky rounded, glowing look, game power-up icon in 3D" | 500-800 | none |
| **pickup-shield** | "Cartoon shield power-up token, round badge-like shield, teal with white chevron, chunky rounded" | 500-800 | none |
| **pickup-multiplier** | "Cartoon ×2 token, chunky rounded gold medallion with a bold lightning bolt emboss, no letters" | 500-800 | none |
| **glide-board** | "Cartoon hover board, rounded oblong, teal top with orange underglow fins, no wheels, no logos" | 800-1.2k | none |
| (optional) **wall-sign**, **wall-vent**, **wall-pipe** | Cartoon rooftop billboard sign panel / wall air vent box / thick horizontal pipe, flat colours, chunky | 300-800 each | none |

Blender step (M5, user or agent with Blender 5 installed): retarget UAL2 free clips SLIDE, SLIDE_LOOP, NINJUMP_LAND, KNOCKBACK, WAVE onto each rigged character with the free Retarget extension and export animation-only GLBs to `asset-sources/blender/<asset>/`.

## Verification

- `npm run typecheck`, `npm test` (vitest, pure sim), `npm run patterns` (every pattern solvable at tier speed bounds), `npm run stress` (bots over 10 seeds, wall share), `npm run smoke` (self-starting Vite + puppeteer, 3 viewports, keyboard + CDP touch, bot runs, save, offline reload), `npm run devices` (UI-DESIGN viewports, overlap/safe-area), `npm run loadtime` (10 Mbps / 60 ms / 4× CPU, perf marks), `npm run budget` (≤5 MB initial, ≤8 MB total), `npm run profile`, `npm run build`.
- Manual phone checklist: portrait and landscape framing shows 3 lanes + both walls; swipes register on first attempt ≥95% (count in debug overlay); wall-run entry window feels fair (0.3 s buffer); audio starts on first tap and survives backgrounding; no page scroll/zoom; safe-area respected on a notched phone; 50+ fps on a mid-range Android with adaptive quality.
- Performance targets: ≤100 draw calls (cap 150), ≤300k triangles, DPR ≤1.5 on touch, 60 fps desktop.

## Risks and mitigations

- **Tripo rig naming/rest pose unknown** → WP-T0 spike first; `characters.json` clip map + name normalisation; placeholders keep the game testable regardless.
- **UAL2 retarget quality / Blender not installed** → fallback poses for slide/land; wall-run needs no clip; user does the Blender step or installs Blender 5.
- **Outline fill-rate on mobile** → hulls only on characters, baked shells on props hidden at low quality, no post-process.
- **CC-BY credits** → CREDITS.md + generated credits screen + `check-credits` in build.
- **Quaternius QAL change** → snapshot pack pages at download; both licences allow this use.
- **Float precision** → world moves, float64 `d`, test at 1e6.
- **iOS audio** → resume on every gesture, suspend on hidden.
- **Opus rate limit** → waves sized to the 5-hour budget; resume stopped agents with SendMessage.
