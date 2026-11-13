import { STEPS_FOOT } from './layout';
import { BRIDGE } from './pond';

export type Pt = [number, number];

/** Catmull-Rom resampling of a control polyline into ~0.4 m steps. */
function smoothPath(ctrl: Pt[], step = 0.4): Pt[] {
  const out: Pt[] = [];
  const p = (i: number) => ctrl[Math.min(ctrl.length - 1, Math.max(0, i))];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

const FORK_SOUTH: Pt = [2.4, 11.0];
const FORK_EAST: Pt = [3.7, 9.4];

/** Flagstone paths: entrance → bridge, and bridge → veranda steps. */
export const STONE_PATHS: Pt[][] = [
  smoothPath([[0.4, 21], [0.7, 15.5], FORK_SOUTH, FORK_EAST, [BRIDGE.x, BRIDGE.z0 + 0.1]]),
  smoothPath([[BRIDGE.x, BRIDGE.z1 - 0.1], [BRIDGE.x + 0.1, BRIDGE.z1 - 1.3], STEPS_FOOT]),
];

/** Gravel loop: west around the pond, and east around its tip. */
export const GRAVEL_PATHS: Pt[][] = [
  smoothPath([
    FORK_SOUTH,
    [-2, 10.4],
    [-7.6, 10.1],
    [-12.4, 7.6],
    [-13.7, 3.2],
    [-12.2, -1.4],
    [-7.6, -3.9],
    [-2.2, -4.4],
    [1.4, -3.5],
    STEPS_FOOT,
  ]),
  smoothPath([FORK_EAST, [6.7, 8.5], [8.4, 5.2], [8.3, 1.6], [6.6, -1.0], STEPS_FOOT]),
];

export const PATH_HALF_WIDTH = 0.8;
export const PATIO = { x: STEPS_FOOT[0], z: STEPS_FOOT[1], radius: 1.9 } as const;

/**
 * A path cut into short runs of segments, each with its bounding box. The ground mask asks for
 * the distance to the paths once per texel and the grass once per tuft, about a million times
 * while the scene is built; a run whose box is already further away than the best distance found
 * so far cannot hold the answer and is skipped whole. The result is exactly the brute-force one.
 */
interface Run {
  from: number;
  to: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
const RUN_LENGTH = 6;

function runsOf(pts: Pt[]): Run[] {
  const runs: Run[] = [];
  for (let from = 0; from < pts.length - 1; from += RUN_LENGTH) {
    const to = Math.min(pts.length - 1, from + RUN_LENGTH);
    const run: Run = { from, to, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (let i = from; i <= to; i++) {
      run.minX = Math.min(run.minX, pts[i][0]);
      run.maxX = Math.max(run.maxX, pts[i][0]);
      run.minZ = Math.min(run.minZ, pts[i][1]);
      run.maxZ = Math.max(run.maxZ, pts[i][1]);
    }
    runs.push(run);
  }
  return runs;
}

/** Squared distance from (x, z) to the nearest of `paths`, given a squared distance already known. */
function nearest2(x: number, z: number, paths: Pt[][], runs: Run[][], best: number): number {
  for (let p = 0; p < paths.length; p++) {
    const pts = paths[p];
    for (const run of runs[p]) {
      const ox = x < run.minX ? run.minX - x : x > run.maxX ? x - run.maxX : 0;
      const oz = z < run.minZ ? run.minZ - z : z > run.maxZ ? z - run.maxZ : 0;
      if (ox * ox + oz * oz >= best) continue;
      for (let i = run.from; i < run.to; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const abx = b[0] - a[0];
        const abz = b[1] - a[1];
        const len2 = abx * abx + abz * abz || 1;
        const t = Math.min(1, Math.max(0, ((x - a[0]) * abx + (z - a[1]) * abz) / len2));
        const dx = x - (a[0] + abx * t);
        const dz = z - (a[1] + abz * t);
        const d = dx * dx + dz * dz;
        if (d < best) best = d;
      }
    }
  }
  return best;
}

// Bounding box of all path points lets the far-away majority of queries exit early.
const ALL = [...STONE_PATHS, ...GRAVEL_PATHS];
let minX = Infinity;
let maxX = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
for (const path of ALL) {
  for (const [x, z] of path) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
}

function outsideBounds(x: number, z: number, margin: number): boolean {
  return x < minX - margin || x > maxX + margin || z < minZ - margin || z > maxZ + margin;
}

const STONE_RUNS = STONE_PATHS.map(runsOf);
const GRAVEL_RUNS = GRAVEL_PATHS.map(runsOf);

export function distToStonePath(x: number, z: number): number {
  if (outsideBounds(x, z, 6)) return 99;
  const patio = Math.hypot(x - PATIO.x, z - PATIO.z) - PATIO.radius + PATH_HALF_WIDTH;
  return Math.min(patio, Math.sqrt(nearest2(x, z, STONE_PATHS, STONE_RUNS, Infinity)));
}

export function distToGravelPath(x: number, z: number): number {
  if (outsideBounds(x, z, 6)) return 99;
  return Math.sqrt(nearest2(x, z, GRAVEL_PATHS, GRAVEL_RUNS, Infinity));
}

/** Distance to the centre line of the nearest path of either kind (99 when far away). */
export function distToPaths(x: number, z: number): number {
  return Math.min(distToStonePath(x, z), distToGravelPath(x, z));
}
