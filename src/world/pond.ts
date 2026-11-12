import { POND } from './layout';
import { fbm2, smoothstep } from './noise';

/** Outline radius (in the pond's unstretched frame) at polar angle theta. */
export function pondRadius(theta: number): number {
  return (
    5.2 +
    0.7 * Math.cos(2 * theta + 0.6) +
    0.45 * Math.cos(3 * theta - 1.1) +
    0.25 * Math.cos(5 * theta + 2.0)
  );
}

/**
 * Signed distance to the shoreline, negative inside the water.
 * Exact on the outline and approximately metric within a few metres of it.
 */
export function pondSDF(x: number, z: number): number {
  const u = (x - POND.cx) / POND.sx;
  const v = (z - POND.cz) / POND.sz;
  const r = Math.hypot(u, v);
  if (r < 1e-6) return -pondRadius(0) * POND.sz;
  const c = u / r;
  const s = v / r;
  const metric = Math.hypot(c * POND.sx, s * POND.sz);
  return (r - pondRadius(Math.atan2(v, u))) * metric;
}

/** World point on the outline at `theta`, pushed `offset` metres outward (negative = inward). */
export function pondPoint(theta: number, offset = 0): [number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const metric = Math.hypot(c * POND.sx, s * POND.sz);
  const r = pondRadius(theta) + offset / metric;
  return [POND.cx + c * r * POND.sx, POND.cz + s * r * POND.sz];
}

export function pondOutline(n: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) pts.push(pondPoint((i / n) * Math.PI * 2));
  return pts;
}

/** Water depth in metres (0 on land). Shelves gently, then drops to a silty basin. */
export function pondDepth(x: number, z: number): number {
  const d = -pondSDF(x, z);
  if (d <= 0) return 0;
  const shelf = smoothstep(0, 0.9, d) * 0.22;
  const basin = smoothstep(0.5, 3.2, d) * (POND.maxDepth - 0.22);
  const lumps = (fbm2(x * 0.55, z * 0.55, 3) - 0.5) * 0.22 * smoothstep(0.6, 2, d);
  return Math.max(0.02, shelf + basin + lumps);
}

/** Unit vector pointing out of the pond at (x, z). */
export function pondNormal(x: number, z: number): [number, number] {
  const e = 0.05;
  const gx = pondSDF(x + e, z) - pondSDF(x - e, z);
  const gz = pondSDF(x, z + e) - pondSDF(x, z - e);
  const l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l];
}

function bridgeSpan(x: number): [number, number] {
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let z = POND.cz - 9; z <= POND.cz + 9; z += 0.02) {
    if (pondSDF(x, z) < 0) {
      zMin = Math.min(zMin, z);
      zMax = Math.max(zMax, z);
    }
  }
  return [zMin, zMax];
}

const BRIDGE_X = POND.cx + 7.0;
const [spanMin, spanMax] = bridgeSpan(BRIDGE_X);
const LANDING = 0.85;

/**
 * Arched footbridge over the pond's right-hand arm, running along Z.
 * z0 is the south (entrance-side) end, z1 the north (cabin-side) end.
 */
export const BRIDGE = {
  x: BRIDGE_X,
  z0: spanMax + LANDING,
  z1: spanMin - LANDING,
  halfWidth: 0.72,
  rise: 0.62,
  baseY: 0.1,
} as const;

/** Height of the bridge deck at z (only meaningful between z1 and z0). */
export function bridgeDeckY(z: number): number {
  const t = Math.min(1, Math.max(0, (z - BRIDGE.z1) / (BRIDGE.z0 - BRIDGE.z1)));
  return BRIDGE.baseY + BRIDGE.rise * 4 * t * (1 - t);
}

export function onBridge(x: number, z: number, margin = 0): boolean {
  return Math.abs(x - BRIDGE.x) < BRIDGE.halfWidth + margin && z > BRIDGE.z1 - margin && z < BRIDGE.z0 + margin;
}
