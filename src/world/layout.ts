/**
 * Fixed layout of the retreat. Units are metres; +X is right, +Y up, and the
 * entrance looks toward −Z. Everything else in `world/` derives from these.
 */
export const WATER_LEVEL = -0.18;
export const EYE_HEIGHT = 1.65;
export const WALKER_RADIUS = 0.32;

/** Organic pond: a polar outline stretched along X. */
export const POND = { cx: -2.5, cz: 3.5, sx: 1.45, sz: 0.95, maxDepth: 1.15 } as const;

/** Walkable clearing; the forest beyond is scenery. */
export const CLEARING = { cx: 0, cz: 2, radius: 31 } as const;

/**
 * Cabin, described in its own frame: origin at the centre of the body,
 * +Z is the front (veranda side). `yaw` turns the front toward the pond.
 */
export const CABIN = {
  x: 8,
  z: -8.5,
  yaw: -0.3,
  width: 9,
  depth: 6,
  wallHeight: 3.0,
  plinthHeight: 0.95,
  deckDepth: 2.6,
  deckHeight: 0.6,
  /** Centre X (cabin frame) and size of the front steps. */
  stepsX: -1.5,
  stepsWidth: 2.0,
  stepsRun: 1.2,
  roofPitch: 0.62,
  roofOverhang: 0.7,
} as const;

const COS = Math.cos(CABIN.yaw);
const SIN = Math.sin(CABIN.yaw);

export function cabinToWorld(lx: number, lz: number): [number, number] {
  return [CABIN.x + lx * COS + lz * SIN, CABIN.z - lx * SIN + lz * COS];
}

export function worldToCabin(x: number, z: number): [number, number] {
  const dx = x - CABIN.x;
  const dz = z - CABIN.z;
  return [dx * COS - dz * SIN, dx * SIN + dz * COS];
}

/** Derived cabin-frame extents. */
export const DECK = {
  x0: -CABIN.width / 2,
  x1: CABIN.width / 2,
  z0: CABIN.depth / 2,
  z1: CABIN.depth / 2 + CABIN.deckDepth,
} as const;

export const STEPS = {
  x0: CABIN.stepsX - CABIN.stepsWidth / 2,
  x1: CABIN.stepsX + CABIN.stepsWidth / 2,
  z0: DECK.z1,
  z1: DECK.z1 + CABIN.stepsRun,
} as const;

/** World position of the bottom of the veranda steps. */
export const STEPS_FOOT = cabinToWorld(CABIN.stepsX, STEPS.z1 + 0.25);

/** Where the visitor first stands, and where they look. */
export const SPAWN = { x: 0.6, z: 16.2, lookX: 2.5, lookZ: -4 } as const;

/** Direction *toward* the sun (normalised below). Low, warm, from the front-left. */
const sun = [-0.74, 0.47, 0.4];
const sl = Math.hypot(sun[0], sun[1], sun[2]);
export const SUN_DIR: readonly [number, number, number] = [sun[0] / sl, sun[1] / sl, sun[2] / sl];
