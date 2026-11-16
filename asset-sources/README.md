# Source archives for RUNSHIFT

## Downtown City MegaKit (required for M2)

Download the free **Downtown City MegaKit[Standard].zip** (223 MB) from
[Quaternius on itch.io](https://quaternius.itch.io/downtown-city-megakit). Place the ZIP in
`asset-sources/quaternius/downtown-megakit/`. Keep its original file name. The 918 MB Source ZIP is optional.

The pack page and the [Quaternius pack page](https://quaternius.com/packs/downtowncitymegakit.html)
both identify the pack as CC0 and allow commercial projects. Quaternius also publishes a
[general QAL license](https://quaternius.com/license.html), which permits incorporating assets into a game
without attribution but restricts redistribution as a standalone asset pack. Checked 2026-11-12;
see `docs/ASSET-LICENCE-NOTES.md` for the source links and distinction.

Archives under this directory are inputs to the asset build and are excluded from the browser bundle.

## Character placeholders (next M2 input)

Download the **GLTF** version from these Poly Pizza pages and put each downloaded archive or model in its folder:

- [Animated Platformer Character](https://poly.pizza/m/kKtL4zvS3n) → `asset-sources/polypizza/kKtL4zvS3n/` (hero placeholder).
- [Ninja](https://poly.pizza/m/xGYmeDpfTu) → `asset-sources/polypizza/xGYmeDpfTu/` (thief placeholder).

Both model pages label the assets CC0. Keep the original downloads; the character build will inspect their rig,
animations and licence before generating the game files. The custom Tripo hero and thief can replace them later.

## Authored obstacle models

`node tools/assets/fetch-obstacles.mjs` downloads five public CC0 GLBs from Poly Pizza into
`asset-sources/polypizza/` and records source URLs and SHA-256 hashes in `assets/licenses/obstacles.json`.
`npm run assets:obstacles` bakes them into the small `public/assets/obstacles.glb` runtime kit.

`node tools/assets/fetch-buildings.mjs` downloads four additional CC0 city buildings and records
their source URLs and hashes in `assets/licenses/buildings.json`. `npm run assets:buildings` bakes
them into `public/assets/city-buildings.glb` for the middle distance.
