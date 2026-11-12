import { CLEARING, DECK, SPAWN, STEPS, WATER_LEVEL, cabinToWorld, worldToCabin } from './layout';
import { fbm2 } from './noise';
import { PATH_HALF_WIDTH, PATIO, STONE_PATHS, distToPaths } from './paths';
import { BRIDGE, pondPoint, pondSDF } from './pond';
import { createRng } from './rng';
import { groundHeight } from './terrain';

export interface Placement {
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
  /** Which model / colour group to use. */
  variant: number;
  /** 0..1 random value for per-instance colour variation. */
  tint: number;
}

function inFootprint(x: number, z: number, margin: number): boolean {
  const [lx, lz] = worldToCabin(x, z);
  const inBody = lx > DECK.x0 - margin && lx < DECK.x1 + margin && lz > -DECK.z0 - margin && lz < DECK.z1 + margin;
  const inSteps = lx > STEPS.x0 - margin && lx < STEPS.x1 + margin && lz >= DECK.z1 && lz < STEPS.z1 + margin;
  return inBody || inSteps;
}

/** True when a solid object with the given clearance may stand at (x, z). */
export function isOpen(x: number, z: number, margin = 0): boolean {
  if (pondSDF(x, z) < 0.6 + margin) return false;
  if (distToPaths(x, z) < PATH_HALF_WIDTH + 0.05 + margin) return false;
  if (inFootprint(x, z, 0.3 + margin)) return false;
  if (Math.abs(x - BRIDGE.x) < 1.3 + margin && z > BRIDGE.z1 - 2 && z < BRIDGE.z0 + 2) return false;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 1.6 + margin) return false;
  return true;
}

function place(x: number, z: number, scale: number, rot: number, variant: number, tint: number): Placement {
  return { x, y: groundHeight(x, z), z, scale, rot, variant, tint };
}

const TAU = Math.PI * 2;

function build() {
  const rng = createRng(20261112);

  /* ───────────── pines ───────────── */
  const pines: Placement[] = [];
  const farEnough = (list: Placement[], x: number, z: number, d: number) =>
    list.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > d * d);

  const framing: [number, number][] = [
    [-14.6, 14.4], [12.8, 14.2], [-18.2, 6.2], [16.8, 6.8], [-16.8, -6.2], [-8.2, -12.6],
    [-1.6, -15.2], [15.8, -3.6], [14.4, -15.4], [4.2, -17.2], [-13.2, -11.4], [-6.5, 17.5],
    [7.2, 18.6], [18.5, -10.5], [-20.5, -1.5], [10.5, -17.5],
  ];
  for (const [x, z] of framing) {
    if (isOpen(x, z, 0.5)) pines.push(place(x, z, rng.range(0.95, 1.3), rng() * TAU, rng.int(0, 3), rng()));
  }
  let guard = 0;
  while (pines.length < 330 && guard++ < 40000) {
    const a = rng() * TAU;
    const r = 16.5 + 92 * Math.pow(rng(), 1.55);
    const x = CLEARING.cx + Math.cos(a) * r;
    const z = CLEARING.cz + Math.sin(a) * r;
    if ((x / 18) ** 2 + ((z - 2.5) / 16.5) ** 2 < 1) continue;
    if (!isOpen(x, z, 0.6)) continue;
    const spacing = 2.7 + r * 0.028;
    if (!farEnough(pines, x, z, spacing)) continue;
    pines.push(place(x, z, rng.range(0.8, 1.35), rng() * TAU, rng.int(0, 3), rng()));
  }
  // Trees a visitor can reach come first so they are never culled by a quality budget.
  const distC = (p: Placement) => Math.hypot(p.x - CLEARING.cx, p.z - CLEARING.cz);
  const near = pines.filter((p) => distC(p) < CLEARING.radius + 4).sort((a, b) => distC(a) - distC(b));
  const far = pines.filter((p) => distC(p) >= CLEARING.radius + 4);
  pines.length = 0;
  pines.push(...near, ...far);

  /* ───────────── small trees ───────────── */
  const smallTrees: Placement[] = [];
  const treeSpots: [number, number, number][] = [
    [-9.8, -6.6, 0], [12.9, 2.6, 1], [-15.4, 10.6, 1], [14.2, -0.6, 2], [-5.6, 13.6, 2], [9.8, 11.8, 0], [-17.5, 1.5, 2],
  ];
  for (const [x, z, v] of treeSpots) {
    if (isOpen(x, z, 0.4) && farEnough(pines, x, z, 2)) {
      smallTrees.push(place(x, z, rng.range(0.9, 1.2), rng() * TAU, v, rng()));
    }
  }

  /* ───────────── boulders ───────────── */
  const boulders: Placement[] = [];
  guard = 0;
  while (boulders.length < 14 && guard++ < 4000) {
    const a = rng() * TAU;
    const r = rng.range(9, 27);
    const x = CLEARING.cx + Math.cos(a) * r;
    const z = CLEARING.cz + Math.sin(a) * r;
    const scale = rng.range(0.45, 1.25);
    if (!isOpen(x, z, scale * 0.8)) continue;
    if (!farEnough(pines, x, z, 1.6) || !farEnough(boulders, x, z, 4) || !farEnough(smallTrees, x, z, 2)) continue;
    boulders.push(place(x, z, scale, rng() * TAU, rng.int(0, 3), rng()));
  }

  const solids = () => [...pines.slice(0, near.length), ...smallTrees, ...boulders];

  /* ───────────── hydrangeas ───────────── */
  const hydrangeas: Placement[] = [];
  const clusters: [number, number, number][] = [];
  for (const lx of [-3.9, 0.3, 1.6, 2.9, 4.1]) clusters.push([...cabinToWorld(lx, DECK.z1 + 0.75), 2]);
  clusters.push([...cabinToWorld(DECK.x0 - 1.0, 3.2), 3], [...cabinToWorld(DECK.x0 - 1.1, 0.4), 3]);
  clusters.push([...cabinToWorld(DECK.x1 + 1.0, 2.6), 3]);
  for (const [theta, off] of [[1.15, 1.7], [1.85, 1.6], [2.55, 1.9], [3.3, 2.0], [4.25, 1.7], [5.75, 1.5]] as const) {
    clusters.push([...pondPoint(theta, off), 4]);
  }
  clusters.push([-0.9, 13.2, 4], [4.6, 12.6, 3], [-14.6, -3.2, 4], [10.4, 5.6, 3]);
  for (const [cx, cz, n] of clusters) {
    const group = Math.floor(fbm2(cx * 0.21 + 9, cz * 0.21 - 4, 2) * 3.4) % 3;
    for (let i = 0; i < n; i++) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const x = cx + rng.gauss() * 0.95;
        const z = cz + rng.gauss() * 0.95;
        if (!isOpen(x, z, 0.12) || !farEnough(hydrangeas, x, z, 0.95) || !farEnough(solids(), x, z, 1.1)) continue;
        const variant = rng() < 0.75 ? group : rng.int(0, 3);
        hydrangeas.push(place(x, z, rng.range(0.75, 1.25), rng() * TAU, variant, rng()));
        break;
      }
    }
  }

  /* ───────────── tropical broad-leaf plants ───────────── */
  const tropicals: Placement[] = [];
  const tropSpots: [number, number][] = [
    cabinToWorld(DECK.x0 - 1.4, 5.2), cabinToWorld(DECK.x0 - 1.7, -1.6), cabinToWorld(DECK.x1 + 1.5, 4.6),
    cabinToWorld(DECK.x1 + 1.6, -0.5), pondPoint(0.3, 2.2), pondPoint(5.25, 1.9), pondPoint(3.75, 2.6),
    [-15.5, 12.8], [11.6, 9.4], [-18.2, -3.4], [15.4, 3.4], [-11.2, -8.4], [6.6, 14.6], [-9.4, 14.2],
  ];
  for (const [x, z] of tropSpots) {
    if (isOpen(x, z, 0.3) && farEnough(solids(), x, z, 1.4) && farEnough(hydrangeas, x, z, 1.1)) {
      tropicals.push(place(x, z, rng.range(0.8, 1.3), rng() * TAU, rng.int(0, 2), rng()));
    }
  }

  /* ───────────── bushes ───────────── */
  const bushes: Placement[] = [];
  guard = 0;
  while (bushes.length < 70 && guard++ < 8000) {
    const a = rng() * TAU;
    const r = rng.range(12.5, 33);
    const x = CLEARING.cx + Math.cos(a) * r;
    const z = CLEARING.cz + Math.sin(a) * r;
    // favour the forest edge and the neighbourhood of tree trunks
    const edge = r > 16.5 || !farEnough(pines, x, z, 4.5);
    if (!edge && rng() < 0.8) continue;
    if (!isOpen(x, z, 0.45)) continue;
    if (!farEnough(solids(), x, z, 1.3) || !farEnough(bushes, x, z, 2.1)) continue;
    if (!farEnough(hydrangeas, x, z, 1.4) || !farEnough(tropicals, x, z, 1.5)) continue;
    bushes.push(place(x, z, rng.range(0.7, 1.5), rng() * TAU, rng.int(0, 3), rng()));
  }

  /* ───────────── ferns ───────────── */
  const ferns: Placement[] = [];
  guard = 0;
  while (ferns.length < 340 && guard++ < 40000) {
    const a = rng() * TAU;
    const r = rng.range(4, 36);
    const x = CLEARING.cx + Math.cos(a) * r;
    const z = CLEARING.cz + Math.sin(a) * r;
    const sd = pondSDF(x, z);
    const nearTree = !farEnough(pines, x, z, 3.6);
    const nearPond = sd > 0.75 && sd < 2.3;
    const nearRock = !farEnough(boulders, x, z, 2.2);
    if (!(nearTree || nearRock || (nearPond && rng() < 0.35) || rng() < 0.03)) continue;
    if (!isOpen(x, z, 0.15)) continue;
    if (!farEnough(solids(), x, z, 0.7) || !farEnough(ferns, x, z, 0.62)) continue;
    if (!farEnough(hydrangeas, x, z, 0.8) || !farEnough(bushes, x, z, 0.9)) continue;
    ferns.push(place(x, z, rng.range(0.6, 1.3), rng() * TAU, rng.int(0, 3), rng()));
  }

  /* ───────────── small flowers ───────────── */
  const flowers: Placement[] = [];
  for (let patch = 0; patch < 46; patch++) {
    let cx = 0;
    let cz = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      const a = rng() * TAU;
      const r = rng.range(5, 27);
      cx = CLEARING.cx + Math.cos(a) * r;
      cz = CLEARING.cz + Math.sin(a) * r;
      if (isOpen(cx, cz, 0.5)) break;
    }
    const variant = patch % 4;
    const count = rng.int(16, 38);
    const spread = rng.range(0.8, 1.9);
    for (let i = 0; i < count; i++) {
      const x = cx + rng.gauss() * spread;
      const z = cz + rng.gauss() * spread;
      if (!isOpen(x, z, 0) || !farEnough(solids(), x, z, 0.5)) continue;
      flowers.push(place(x, z, rng.range(0.7, 1.35), rng() * TAU, variant, rng()));
    }
  }

  /* ───────────── pond-edge rocks ───────────── */
  const pondRocks: Placement[] = [];
  const ROCKS = 190;
  for (let i = 0; i < ROCKS; i++) {
    const theta = ((i + rng.range(-0.35, 0.35)) / ROCKS) * TAU;
    const big = rng() < 0.16;
    const offset = big ? rng.range(-0.05, 0.4) : rng.range(-0.3, 0.42);
    const [x, z] = pondPoint(theta, offset);
    if (Math.abs(x - BRIDGE.x) < 1.05) continue;
    const scale = big ? rng.range(0.42, 0.72) : rng.range(0.14, 0.36);
    const p = place(x, z, scale, rng() * TAU, rng.int(0, 3), rng());
    p.y = Math.max(p.y, WATER_LEVEL - 0.1) - scale * 0.28;
    pondRocks.push(p);
  }

  /* ───────────── lily pads ───────────── */
  const lilyPads: Placement[] = [];
  const padCentres: [number, number][] = [];
  guard = 0;
  while (padCentres.length < 7 && guard++ < 3000) {
    const [x, z] = pondPoint(rng() * TAU, -rng.range(1.5, 3.2));
    if (Math.abs(x - BRIDGE.x) < 2.4) continue;
    if (padCentres.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.6)) continue;
    padCentres.push([x, z]);
  }
  for (const [cx, cz] of padCentres) {
    const count = rng.int(5, 10);
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const x = cx + rng.gauss() * 0.85;
        const z = cz + rng.gauss() * 0.85;
        const scale = rng.range(0.17, 0.34);
        if (pondSDF(x, z) > -0.55 || Math.abs(x - BRIDGE.x) < 1.4) continue;
        if (!lilyPads.every((p) => Math.hypot(p.x - x, p.z - z) > (p.scale + scale) * 0.95)) continue;
        const p = place(x, z, scale, rng() * TAU, rng() < 0.16 ? 1 : 0, rng());
        p.y = WATER_LEVEL + 0.012;
        lilyPads.push(p);
        break;
      }
    }
  }

  /* ───────────── reeds and irises at the waterline ───────────── */
  const reeds: Placement[] = [];
  for (const theta of [0.85, 2.15, 2.95, 3.65, 4.55, 5.5, 1.5]) {
    const [cx, cz] = pondPoint(theta, -0.35);
    if (Math.abs(cx - BRIDGE.x) < 1.6) continue;
    const count = rng.int(9, 16);
    const variant = rng.int(0, 2);
    for (let i = 0; i < count; i++) {
      const x = cx + rng.gauss() * 0.5;
      const z = cz + rng.gauss() * 0.5;
      const sd = pondSDF(x, z);
      if (sd > 0.05 || sd < -0.9) continue;
      const p = place(x, z, rng.range(0.7, 1.3), rng() * TAU, variant, rng());
      p.y = Math.min(p.y, WATER_LEVEL) - 0.05;
      reeds.push(p);
    }
  }

  /* ───────────── flagstones ───────────── */
  const flagstones: Placement[] = [];
  for (const path of STONE_PATHS) {
    let acc = 0.35;
    let side = 1;
    for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1];
      const [bx, bz] = path[i];
      const seg = Math.hypot(bx - ax, bz - az);
      acc += seg;
      if (acc < 0.68) continue;
      acc = 0;
      const nx = -(bz - az) / (seg || 1);
      const nz = (bx - ax) / (seg || 1);
      const off = side * rng.range(0.1, 0.26);
      side = -side;
      const x = bx + nx * off;
      const z = bz + nz * off;
      if (Math.hypot(x - PATIO.x, z - PATIO.z) < PATIO.radius || inFootprint(x, z, 0.1)) continue;
      if (z > 19.5) continue;
      flagstones.push(place(x, z, rng.range(0.3, 0.42), rng() * TAU, rng.int(0, 4), rng()));
    }
  }
  guard = 0;
  let patioCount = 0;
  while (patioCount < 26 && guard++ < 3000) {
    const a = rng() * TAU;
    const r = Math.sqrt(rng()) * (PATIO.radius - 0.2);
    const x = PATIO.x + Math.cos(a) * r;
    const z = PATIO.z + Math.sin(a) * r;
    const scale = rng.range(0.27, 0.4);
    if (inFootprint(x, z, 0.05)) continue;
    if (!flagstones.every((p) => Math.hypot(p.x - x, p.z - z) > (p.scale + scale) * 0.93)) continue;
    flagstones.push(place(x, z, scale, rng() * TAU, rng.int(0, 4), rng()));
    patioCount++;
  }

  return {
    pines,
    /** Number of pines close enough to walk into; these always render and collide. */
    nearPineCount: near.length,
    smallTrees,
    boulders,
    hydrangeas,
    tropicals,
    bushes,
    ferns,
    flowers,
    pondRocks,
    lilyPads,
    reeds,
    flagstones,
  };
}

export const SCATTER = build();
