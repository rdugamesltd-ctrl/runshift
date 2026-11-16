# Tripo asset requests

What to generate in Tripo for Catch the Tief, and where to put the files. Free sources cover the city, obstacles,
coins, sounds and most animations (see `research_notes/RESEARCH.md`); the pieces below are the ones no free
source has in Catch the Tief's style. Until they arrive the game uses placeholders (the grey box now, Quaternius
characters from M2), so nothing waits on them.

## Before you start

- **Use the paid plan.** Free-tier output is public and CC-BY / non-commercial, which Catch the Tief cannot ship. Keep
  the receipts and note the date of each generation.
- **Characters in T-pose.** Use the `t_pose` image template, or add the line "T-pose, arms straight out, legs
  slightly apart, neutral face".
- **Style line for every prompt** (append it to each prompt below): "cartoon game character, stylised toon
  shading, flat bold colours, simple shapes, no text, no logos, no real brands, clean silhouette, mobile game asset".
- **Export GLB.**

## Where the files go

One folder per asset under `asset-sources/tripo/`, named exactly as in the table below:

| File | What |
|---|---|
| `asset-sources/tripo/<asset>/<asset>.glb` | the generated mesh |
| `asset-sources/tripo/<asset>/<asset>.rig.glb` | the rigged character (characters only) |
| `asset-sources/tripo/<asset>/<asset>.anim.<preset>.glb` | one file per retargeted animation preset (characters only) |

For example, the hero:

```
asset-sources/tripo/hero/hero.glb
asset-sources/tripo/hero/hero.rig.glb
asset-sources/tripo/hero/hero.anim.idle.glb
asset-sources/tripo/hero/hero.anim.run.glb
asset-sources/tripo/hero/hero.anim.jump.glb
asset-sources/tripo/hero/hero.anim.fall.glb
asset-sources/tripo/hero/hero.anim.hurt.glb
asset-sources/tripo/hero/hero.anim.turn.glb
asset-sources/tripo/hero/hero.anim.dive.glb
asset-sources/tripo/hero/hero.anim.climb.glb
```

The asset names match the game's model names (`KitModel` and `CharacterName` in `src/render/types.ts`).

## Rig and animation settings (hero and thief)

- Rig: version `v3.0-20260909`, rig type `biped`, spec `mixamo`, output GLB.
- Retarget these presets **in place** (no forward motion baked in): idle, run, jump, fall, hurt, turn, dive, climb.
- The hero's look: teal and orange suit, white speed-chevron on the chest, goggles, no cape, no mask.

## The list

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

Blender is not installed on this machine, so this step is optional: without it the game uses fallback poses for
slide, land and knockback.

## What happens next

- With a Tripo API key (`TRIPO_API_KEY` in the environment, never committed), WP-T0 can script the rig and
  retarget steps (`npm run tripo:rig`, `npm run tripo:retarget`) and records what the rig looks like (bone names,
  rest pose, scale, clip names) in `research_notes/tripo-spike.md`. Without a key, generate in the Tripo web app and
  drop the files as above.
- WP-51 switches the game from the placeholder characters to yours through `asset-sources/tripo/characters.json`.
- After dropping files, commit them (or tell the integrator): agents work in git worktrees and only see committed
  files.

## Checklist

- [ ] hero: mesh, rig, 8 presets
- [ ] thief: mesh, rig, 8 presets
- [ ] gold-sack
- [ ] metro-car
- [ ] pickup-magnet
- [ ] pickup-shield
- [ ] pickup-multiplier
- [ ] glide-board
- [ ] (optional) wall-sign, wall-vent, wall-pipe
- [ ] receipts saved with their dates
