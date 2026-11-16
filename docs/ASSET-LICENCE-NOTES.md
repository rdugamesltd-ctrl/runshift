# Downtown City MegaKit licence evidence

Checked 2026-11-12 on the publisher's own pages:

- [itch.io pack page](https://quaternius.itch.io/downtown-city-megakit): says the Standard archive is
  223 MB, the Source archive is 918 MB, and lists the asset licence as Creative Commons Zero v1.0 Universal.
- [Quaternius pack page](https://quaternius.com/packs/downtowncitymegakit.html): labels this pack CC0 and
  says it is free to use in personal, educational and commercial projects.
- [Quaternius general licence](https://quaternius.com/license.html): QAL v1.0, updated 2026-08-28,
  permits use in commercial games without attribution and prohibits redistributing the models as a
  standalone asset pack.

The two pack pages explicitly label this particular release CC0. The general QAL page uses broader wording
for Quaternius assets. Keep both statements with the source archive; do not publish the source ZIP as part of
the game.

The supplied Standard ZIP also contains `License_Standard.txt` naming **CC0 1.0 Universal**. A copy and the
archive SHA-256 are saved under `assets/licenses/` by `node tools/assets/snapshot.mjs`.

## Poly Pizza character placeholders

Checked 2026-11-12:

- [Animated Platformer Character](https://poly.pizza/m/kKtL4zvS3n), by Quaternius: page title says free model;
  model page labels it Public Domain (CC0). Used as the temporary hero.
- [Ninja](https://poly.pizza/m/xGYmeDpfTu), by Quaternius: page title says free model; model page labels it
  Public Domain (CC0). Used as the temporary thief.
- [Quaternius general licence](https://quaternius.com/license.html): permits free commercial game use without
  credit, while restricting redistribution of assets as standalone packs.

`npm run assets:chars` writes the downloaded file names and SHA-256 hashes to
`assets/licenses/polypizza-characters.json`. The downloaded GLBs remain excluded from Git; the built character
GLBs are copied into the game bundle.

## Street trees and lamps

Checked 2026-11-12 on the individual Poly Pizza pages:

- [Tree Large](https://poly.pizza/m/ORCbG8dslS), by Kenney: Public Domain (CC0).
- [Street Light](https://poly.pizza/m/nFwrlcLvM5), by Quaternius: Public Domain (CC0).

`node tools/assets/fetch-scenery.mjs` records download URLs and SHA-256 hashes in
`assets/licenses/scenery.json`. `npm run assets:scenery` builds the small game-ready GLB.
