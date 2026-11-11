/**
 * Every gameplay tuning value lives here, so tuning never touches logic. No tuning numbers anywhere else.
 * Each work package edits only its own section (owners in docs/CONVENTIONS.md).
 *
 * Units unless a name or comment says otherwise: distances and heights in metres, times in seconds,
 * speeds in m/s, angles in degrees. A "beat" is one second of travel at the speed the player is
 * predicted to have there, so beats × speed = metres (patterns are authored in beats).
 */

/** The fixed-step loop. */
export const SIM = {
  /** One simulation step, s (60 Hz). Rendering interpolates between steps. */
  fixedDt: 1 / 60,
  /** A longer frame (a hitch, a tab coming back) is cut to this, s, so the sim never spirals. */
  maxFrame: 0.1,
} as const;

/** Run speed over run time: v(t) = start + gain·(1 − e^(−t/tau)). See src/game/track/speed.ts. */
export const SPEED = {
  /** Speed at the start of a run, m/s. */
  start: 11,
  /** Speed added on the way to the top speed (start + gain = 26 m/s). */
  gain: 15,
  /** Time constant, s: 63% of the gain is reached after tau seconds of running. */
  tau: 150,
} as const;

/** The three lanes. */
export const LANES = {
  /** Distance between lane centres, m: lanes sit at x = −2, 0, 2. */
  width: 2,
  /** A lane change takes this long, s (smoothstep). */
  changeTime: 0.14,
} as const;

/** The player's collision box on the ground, m. */
export const PLAYER = {
  /** Across the track (x). */
  width: 0.8,
  /** Along the track (d). */
  depth: 0.6,
  /** Standing height (y). Sliding uses SLIDE.height. */
  height: 1.7,
} as const;

/** The jump: g = 8·apex/airtime² = 30 m/s², take-off speed 4·apex/airtime = 9 m/s. */
export const JUMP = {
  /** Height of the feet at the top of a jump, m. */
  apex: 1.35,
  /** Time from take-off to landing on flat floor, s. */
  airtime: 0.6,
  /** Swiping down in the air drops at this speed, m/s, then slides on landing. */
  fastFallSpeed: 18,
} as const;

/** The slide. */
export const SLIDE = {
  /** A slide lasts this long, s. Swiping up cancels it into a jump. */
  time: 0.7,
  /** Box height while sliding, m. */
  height: 0.8,
} as const;

/** Running off the floor. */
export const AIR = {
  /** A jump pressed this long after the floor ends still counts (coyote time), s. */
  coyote: 0.15,
  /** Below this height the player is falling for good, m. */
  loseY: -0.6,
  /** A fall ends the run after this long, s (unless the glide catches it). */
  fallTime: 0.9,
} as const;

/** Input. */
export const INPUT = {
  /** A press waits this long for the moment it can be used, s. */
  buffer: 0.18,
  /** Swipe detection: threshold = clamp(thresholdFrac × short side, minPx, maxPx) CSS px, covered within
   *  windowMs ms, with the dominant axis at least `dominance` times the other. */
  swipe: { thresholdFrac: 0.06, minPx: 24, maxPx: 48, windowMs: 280, dominance: 1.25 },
} as const;

/** Wall-running. Rules in docs/CONVENTIONS.md (W1 attach rule, modes, collisions). */
export const WALL = {
  /** Wall planes stand at x = ±planeX, m. */
  planeX: 3.6,
  /** Moving from the floor onto the wall takes this long, s. */
  attachTime: 0.18,
  /** A press attaches only from within this lateral distance of the wall plane, m: the centre lane qualifies,
   *  the far lane does not. */
  attachReach: 3.8,
  /** In the outer lane, a press toward a wall that is not there yet waits this long for one, s. */
  entryBuffer: 0.3,
  /** In the air, the player can still attach above this height, m. */
  minAttachY: -0.6,
  /** Feet height while running the low band, m. */
  bandLow: 0.9,
  /** Feet height while running the high band, m. */
  bandHigh: 2.1,
  /** Switching bands takes this long, s. */
  bandSwitchTime: 0.15,
  /** The player's box height range on the wall per band, m [y0, y1]. The two never overlap. */
  bandBox: { low: [0.45, 1.35], high: [1.65, 2.55] },
  /** On the wall the box reaches this far out from the plane, m: x from side·(planeX − poseReach) to side·planeX. */
  poseReach: 1.6,
  /** Running speed on a wall, as a share of the speed curve. */
  speedFactor: 1.05,
  /** Wall time after which the player starts to slip down, s (accumulates across chained walls). */
  slipFrom: 2.0,
  /** Wall time after which the player comes off, s. */
  maxTime: 2.8,
  /** Slip speed, m/s down. */
  slipSpeed: 2.6,
  /** A wall-jump to the other side takes this long, s. */
  jumpTime: 0.5,
  /** Lateral distance of a wall-jump, m (wall plane to wall plane). */
  jumpLateral: 7.2,
  /** Extra height at the top of a wall-jump arc, m. */
  jumpApex: 0.6,
  /** Stepping off a wall onto the floor takes this long, s. */
  exitTime: 0.25,
  /** Shortest and longest authored wall, beats. */
  minLength: 0.8,
  maxLength: 2.4,
  /** A wall serving a gap starts at least this long before the gap, beats. */
  leadIn: 0.3,
  /** Wall or floor still needed after a landing point, beats (a wall-jump lands on a wall only if it
   *  covers [land, land + v·minLanding]). */
  minLanding: 0.3,
  /** Character root roll toward the wall while wall-running, degrees (visual). */
  rootRollDeg: 70,
  /** Extra spine lean while wall-running, degrees (visual). */
  spineLeanDeg: 12,
} as const;

/** Clipping an obstacle with a lane change. */
export const STUMBLE = {
  /** Speed share right after a stumble. */
  speedFactor: 0.8,
  /** Seconds to recover full speed. */
  recover: 1.2,
  /** A second stumble within this many seconds is a crash. */
  secondWithin: 5,
} as const;

/** The chase camera. */
export const CAMERA = {
  /** Camera height above the floor, m. */
  height: 3.6,
  /** Distance behind the player, m. */
  back: 6.0,
  /** The camera looks at a point this far ahead of the player, m... */
  lookAhead: 10,
  /** ...at this height, m. */
  lookHeight: 0.4,
  /** Share of the player's x and y the camera follows. */
  followX: 0.55,
  followY: 0.3,
  /** Exponential smoothing rate, 1/s. */
  stiffness: 9,
  /** Framing for any aspect ratio (src/render/cameraFit.ts): keep halfWidth m either side visible at
   *  `distance` m, vertical FOV clamped to [minFov, maxFov] degrees; a taller screen pulls the camera back,
   *  and up by pullUp of the pull-back. */
  fit: { halfWidth: 4.6, distance: 8, minFov: 58, maxFov: 78, pullUp: 0.35 },
  /** Extra FOV at top speed, degrees. */
  speedFov: 8,
  /** FOV kick on big moments, degrees. */
  kickFov: 6,
  /** While wall-running: roll toward the wall (degrees), easing time constants in and out (s), sideways
   *  offset away from the wall (m), extra FOV (degrees). */
  wall: { rollDeg: 18, tauIn: 0.1, tauOut: 0.18, offset: 0.9, fov: 4 },
  /** Share of the wall roll kept with reduced motion. */
  reducedMotionRoll: 0.5,
  /** Far clipping plane, m. */
  far: 220,
} as const;

/** Track streaming. */
export const CHUNK = {
  /** Length of one chunk, m. */
  length: 40,
  /** Track is built this far ahead of the player, m. */
  horizon: 180,
  /** A chunk is recycled once its end is this far behind the player, m. */
  recycleBehind: 15,
  /** Never more chunks alive than this. */
  maxActive: 8,
} as const;

/** Distance fog, m. */
export const FOG = { near: 60, far: 160 } as const;

/**
 * Difficulty tiers by distance. `from`: first metre of the tier. `actionsPer40`: target player actions per
 * 40 m. `minGap`: tightest allowed gap between two actions, beats. `wallShare`: share of wall-run content.
 */
export const TIERS = [ { from: 0, actionsPer40: 0.5, minGap: 1.2, wallShare: 0.10 }, { from: 300, actionsPer40: 0.9, minGap: 0.9, wallShare: 0.12 },
  { from: 1200, actionsPer40: 1.3, minGap: 0.7, wallShare: 0.17 }, { from: 3000, actionsPer40: 1.7, minGap: 0.55, wallShare: 0.21 },
  { from: 6000, actionsPer40: 2.1, minGap: 0.45, wallShare: 0.25 } ] as const;

/** The thief: d_thief = d + clamp(leadS·v, minLead, maxLead). Always ahead, never caught. */
export const THIEF = {
  /** Lead in seconds of travel at the current speed. */
  leadS: 0.9,
  /** Lead limits, m. */
  minLead: 8,
  maxLead: 26,
  /** Lead in the tutorial, s, so his demonstrations are easy to watch. */
  tutorialLeadS: 1.6,
  /** Gold scattered per burst, coins [min, max]. */
  burst: [6, 10],
  /** Run distance between bursts, m [min, max] (like POWERUPS.spawnEvery). */
  burstEvery: [60, 120],
} as const;

/** Gold coins. */
export const COINS = {
  /** Distance between coins in a line, m. */
  spacing: 2.4,
  /** Pickup radius around the player, m. */
  radius: 0.6,
  /** Coin instances drawn at once. */
  maxInstances: 256,
} as const;

/** Score = metres × perMetre + gold × perGold. */
export const SCORE = { perMetre: 1, perGold: 1 } as const;

/**
 * Power-ups. Durations are base + perLevel × upgrade level, s. Magnet: pulls coins within `radius` m and
 * up to `ahead` m in front. Shield: takes one hit, then `invulnerable` s of safety. Multiplier: score and
 * gold × factor. Glide: rides over gaps and catches one fall. A power-up spawns every `spawnEvery` m.
 */
export const POWERUPS = { magnet: { base: 8, perLevel: 2, radius: 4.5, ahead: 10 }, shield: { base: 15, perLevel: 3, invulnerable: 1 },
  multiplier: { base: 10, perLevel: 2, factor: 2 }, glide: { base: 5, perLevel: 1 }, spawnEvery: [300, 450] } as const;

/** Power-up upgrades bought with gold. `cost[n]` buys level n + 1. */
export const UPGRADES = { maxLevel: 5, cost: [300, 800, 2000, 4500, 9000] } as const;

/** Timing around the start and end of a run. */
export const RESULTS = {
  /** A crash plays out this long before the run is over, s. */
  crashDelay: 1.4,
  /** Delay before the results after a fall, s. */
  fallDelay: 1.2,
  /** The intro before running, s. */
  introTime: 1.0,
  /** Resuming after a pause counts down this many seconds (3-2-1). */
  resumeCountdown: 3,
} as const;

/** Adaptive quality. */
export const QUALITY = {
  /** Below this frame rate... */
  slowFps: 42,
  /** ...measured over this many seconds, the render scale steps down. */
  window: 3,
  /** Device pixel ratio caps on touch screens and desktops. */
  dprTouch: 1.5,
  dprDesktop: 2,
  /** Render scale per quality level, best first. */
  scales: [1, 0.85, 0.72, 0.6],
  /** Seconds to wait after a change before measuring again. */
  settle: 2.5,
} as const;

/** Performance budget (tools/budget.mjs and the debug stats). */
export const BUDGET = {
  /** Draw calls: average target and peak cap. */
  drawCalls: 100,
  drawCallsCap: 150,
  /** Triangles drawn per frame. */
  triangles: 300_000,
  /** Download before the menu and in total, MB. */
  initialMB: 5,
  totalMB: 8,
} as const;

/** Toon shading. */
export const TOON = {
  /** Brightness of each light step on the ramp, darkest first (0-1). */
  ramp: [0.32, 0.6, 0.85, 1],
  /** Character outline (inverted hull) thickness. */
  outline: 0.0035,
  /** Baked outline shell thickness on props. */
  propShell: 0.035,
  /** Outline colour. */
  ink: '#1c2340',
} as const;
