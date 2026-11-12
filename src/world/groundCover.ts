import { CLEARING } from './layout';
import { fbm2, smoothstep } from './noise';
import { distToPaths } from './paths';
import { pondSDF } from './pond';
import { SCATTER } from './scatter';
import { inCabinFootprint } from './colliders';

/** 0..1: how much of the ground at (x, z) is path gravel. */
export function pathWeight(x: number, z: number): number {
  const d = distToPaths(x, z);
  if (d > 1.6) return 0;
  const wobble = (fbm2(x * 1.7, z * 1.7, 2) - 0.5) * 0.35;
  return 1 - smoothstep(0.62, 1.02, d + wobble);
}

/** 0..1: how much of the ground is bare forest floor (needle litter, soil) rather than lawn. */
export function forestWeight(x: number, z: number): number {
  const e = Math.hypot((x - CLEARING.cx) / 17.5, (z - 2.5) / 16);
  let w = smoothstep(0.92, 1.4, e + (fbm2(x * 0.16, z * 0.16, 3) - 0.5) * 0.5);
  if (w >= 1) return 1;
  const sd = pondSDF(x, z);
  if (sd < 0.8) w = Math.max(w, smoothstep(0.8, 0.3, sd));
  if (inCabinFootprint(x, z, 0.45)) return 1;
  for (let i = 0; i < SCATTER.nearPineCount; i++) {
    const p = SCATTER.pines[i];
    const dx = p.x - x;
    const dz = p.z - z;
    if (Math.abs(dx) > 2.6 || Math.abs(dz) > 2.6) continue;
    w = Math.max(w, 1 - smoothstep(0.7, 2.5, Math.hypot(dx, dz)));
  }
  for (const p of SCATTER.boulders) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < 1.6 * p.scale) w = Math.max(w, 1 - smoothstep(0.7 * p.scale, 1.5 * p.scale, d));
  }
  return w;
}

/** 0..1 density of lawn grass at (x, z). */
export function grassDensity(x: number, z: number): number {
  if (pondSDF(x, z) < 0.35) return 0;
  const path = pathWeight(x, z);
  if (path > 0.55) return 0;
  const forest = forestWeight(x, z);
  return (1 - path) * (1 - forest * 0.88);
}

/** World-space square covered by the ground mask texture. */
export const MASK = { cx: 0, cz: 2, size: 84 } as const;
