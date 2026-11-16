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

/** The ordinary jump clears low obstacles; train roofs are reached by their ramps. */
export const JUMP = {
  /** Height of the feet at the top of a jump, m. */
  apex: 1.35,
  /** Time from take-off to landing on flat floor, s. */
  airtime: 0.6,
  /** Share of the airtime spent rising. Above 0.5 the rise is floatier and the fall heavier (two gravities); the
   *  apex and airtime stay as above, and so does the time spent above any height. */
  riseShare: 0.55,
  /** Swiping down in the air drops at this speed, m/s, then slides on landing. */
  fastFallSpeed: 18,
} as const;

/** Train traffic in the three running lanes. */
export const TRAINS = {
  /** Chance that a generated chunk uses a train formation. */
  chunkChance: 0.7,
  /** Length of each visible carriage in a long train, m. */
  carriageLength: 6,
  /** Length of the climb from ground level to the train roof, m. */
  rampLength: 3.4,
  /** Maximum rise the runner can follow in one fixed step on a ramp, m. */
  maxRampStep: 0.45,
  /** Speed of oncoming trains along track distance, m/s. */
  oncomingSpeed: -5,
  /** Distance ahead at which an oncoming train starts moving, m. */
  activationAhead: 25,
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

/** Camera framing and motion. */
export const CAMERA = {
  /** First-person eye position, aim and field of view during a run. */
  firstPerson: { eyeHeightRatio: 0.94, wallEyeHeight: 0.55, lookAhead: 12, lookDown: 0.25, minFov: 68, maxFov: 100, halfWidth: 3.7, fitDistance: 10 },
  /**
   * How the body moves the eye (visual only). crouchRate: the eye eases between standing and sliding height, 1/s.
   * Landing: the eye dips landDip m per m/s of fall speed (at most landDipMax m) on a spring of springFreq rad/s
   * with damping ratio springDamp; landLook is the share of the dip the aim follows (less than 1 nods the view).
   * Footsteps (on the ground and walls): bob m down at each footfall, sway m side to side, bobRoll degrees.
   * Turning: the view leans laneRoll degrees per m/s of sideways speed (at most laneRollMax) and aims lookLead s
   * ahead of it, the sideways speed smoothed at sideRate 1/s. jumpPitch: the aim rises and falls by this many m per
   * m/s of vertical speed. Reduced motion drops the bob and the lean and halves the dip.
   */
  feel: {
    crouchRate: 22, landDip: 0.014, landDipMax: 0.2, springFreq: 17, springDamp: 0.5, landLook: 0.5,
    bob: 0.035, sway: 0.02, bobRoll: 0.45, laneRoll: 0.16, laneRollMax: 4, lookLead: 0.035, sideRate: 18, jumpPitch: 0.05,
  },
  /** Camera height above the floor, m. */
  height: 4.5,
  /** Distance behind the player, m. */
  back: 6.2,
  /** The camera looks at a point this far ahead of the player, m... */
  lookAhead: 10,
  /** ...at this height, m. */
  lookHeight: 0.1,
  /** Share of the player's x and y the camera follows. */
  followX: 0.7,
  followY: 0.55,
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
  /** While jet-gliding: extra height and pull-back, m, eased in and out with time constant tau, s. */
  glide: { up: 2.6, back: 3.2, tau: 0.4 },
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
  leadS: 1.35,
  /** Lead limits, m. */
  minLead: 12,
  maxLead: 39,
  /** Lead in the tutorial, s, so his demonstrations are easy to watch. */
  tutorialLeadS: 1.6,
  /** His own speed eases at speedRate, 1/s, towards the player's speed plus leadGain × (target lead − lead),
   *  1/s (critically damped at leadGain = speedRate / 4), so a stumble never snaps him backwards. */
  speedRate: 6,
  leadGain: 1.5,
  /** Gold scattered per burst, coins [min, max]. */
  burst: [6, 10],
  /** Run distance between bursts, m [min, max] (like POWERUPS.spawnEvery). */
  burstEvery: [60, 120],
} as const;

/** The first-run tutorial (lessons in src/game/track/tutorialTrack.ts). */
export const TUTORIAL = {
  /** A lesson card ignores presses for this long after it appears, s (so a swipe already on its way is not taken). */
  readTime: 0.35,
  /** After the right press the move must show within this much sim time, s, or the run stops again for it. */
  confirmTime: 0.25,
} as const;

/** Gold coins. */
export const COINS = {
  /** Distance between coins in a line, m. */
  spacing: 2.4,
  /** Pickup radius around the player, m. */
  radius: 0.6,
  /** Coin instances drawn at once. */
  maxInstances: 320,
  /** Coins in the arc over a low barrier (they follow the jump's parabola) and under a high one (at height underY). */
  arc: 5,
  under: 3,
  underY: 0.45,
  /** On plain street: a line in one lane, then (with chance switchChance) a second line in another lane. Each
   *  line is `line` coins long, the second starts `switchGap` m after the first ends. */
  line: 7,
  switchChance: 0.6,
  switchGap: 6,
} as const;

/** Score = metres × perMetre + gold × perGold. */
export const SCORE = { perMetre: 1, perGold: 1 } as const;

/**
 * Power-ups. Durations are base + perLevel × upgrade level, s. Magnet: pulls coins within `radius` m across and
 * up to `ahead` m in front. Shield: takes one hit, then `invulnerable` s of safety. Multiplier: score × factor.
 * Glide: a jet glide `height` m up (above the trains), climbing at `climbRate` 1/s, over a line of sky coins
 * that starts `coinsFrom` m ahead and switches lane every `coinLaneEvery` m; on landing, `landSafe` s of safety. It
 * lands only when no gap starts within `clearAhead` s of running. The track's own coins under the flight rise into
 * the nearest lane at sky-coin height, closing in at `liftRate` 1/s.
 * A power-up spawns on the coin line of roughly one chunk in CHUNK.length / mean(spawnEvery), never before
 * `firstAt` m; `pickRadius` m is the pickup reach and `weights` the odds of each kind.
 */
export const POWERUPS = { magnet: { base: 8, perLevel: 2, radius: 4.5, ahead: 10 }, shield: { base: 15, perLevel: 3, invulnerable: 1 },
  multiplier: { base: 10, perLevel: 2, factor: 2 },
  glide: { base: 5, perLevel: 1, height: 5.2, climbRate: 4, coinsFrom: 14, coinLaneEvery: 26, landSafe: 1.2, clearAhead: 1.6, liftRate: 3 },
  spawnEvery: [170, 280], firstAt: 120, pickRadius: 0.95,
  weights: { magnet: 0.3, multiplier: 0.25, shield: 0.25, glide: 0.2 } } as const;

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
