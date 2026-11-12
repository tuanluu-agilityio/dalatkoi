import { CABIN, CLEARING, DECK, STEPS, cabinToWorld, worldToCabin } from './layout';
import { BRIDGE, onBridge, pondNormal, pondSDF } from './pond';
import { SCATTER } from './scatter';

interface Circle {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
}
interface Box {
  kind: 'box';
  x: number;
  z: number;
  hw: number;
  hd: number;
  cos: number;
  sin: number;
}
export type Collider = Circle | Box;

const circle = (x: number, z: number, r: number): Circle => ({ kind: 'circle', x, z, r });
const box = (x: number, z: number, hw: number, hd: number, yaw = 0): Box => ({
  kind: 'box', x, z, hw, hd, cos: Math.cos(yaw), sin: Math.sin(yaw),
});
/** Box given by cabin-frame extents. */
const cabinBox = (x0: number, x1: number, z0: number, z1: number): Box => {
  const [x, z] = cabinToWorld((x0 + x1) / 2, (z0 + z1) / 2);
  return box(x, z, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, CABIN.yaw);
};
const cabinCircle = (lx: number, lz: number, r: number): Circle => circle(...cabinToWorld(lx, lz), r);

/** Cabin-frame positions shared with the renderer so props and colliders agree. */
export const VERANDA_POSTS: [number, number][] = [
  [DECK.x0 + 0.1, DECK.z1 - 0.1],
  [STEPS.x0 - 0.1, DECK.z1 - 0.1],
  [STEPS.x1 + 0.1, DECK.z1 - 0.1],
  [1.9, DECK.z1 - 0.1],
  [DECK.x1 - 0.1, DECK.z1 - 0.1],
];
export const FURNITURE = {
  chairs: [[2.15, 3.72, 0.12], [3.55, 3.75, -0.14]] as [number, number, number][],
  table: [2.85, 3.5] as [number, number],
  pots: [[-4.05, 5.15, 0.3], [-0.2, 3.35, 0.26], [4.05, 5.2, 0.28], [-2.42, 3.32, 0.22], [-2.95, 6.05, 0.24]] as [number, number, number][],
  bench: [-3.4, 3.42] as [number, number],
};
export const CHIMNEY = { lx: DECK.x1 + 0.45, lz: -0.8, hw: 0.5, hd: 0.7 };

const RAIL = 0.06;

function buildColliders(): Collider[] {
  const list: Collider[] = [];
  // cabin body and chimney
  list.push(cabinBox(DECK.x0, DECK.x1, -CABIN.depth / 2, CABIN.depth / 2));
  list.push(cabinBox(CHIMNEY.lx - CHIMNEY.hw, CHIMNEY.lx + CHIMNEY.hw, CHIMNEY.lz - CHIMNEY.hd, CHIMNEY.lz + CHIMNEY.hd));
  // veranda railings: both sides, and the front either side of the steps
  list.push(cabinBox(DECK.x0 - RAIL, DECK.x0 + RAIL, DECK.z0, DECK.z1));
  list.push(cabinBox(DECK.x1 - RAIL, DECK.x1 + RAIL, DECK.z0, DECK.z1));
  list.push(cabinBox(DECK.x0, STEPS.x0, DECK.z1 - RAIL, DECK.z1 + RAIL));
  list.push(cabinBox(STEPS.x1, DECK.x1, DECK.z1 - RAIL, DECK.z1 + RAIL));
  for (const [lx, lz] of VERANDA_POSTS) list.push(cabinCircle(lx, lz, 0.1));
  for (const [lx, lz] of FURNITURE.chairs) list.push(cabinCircle(lx, lz, 0.4));
  list.push(cabinCircle(FURNITURE.table[0], FURNITURE.table[1], 0.28));
  list.push(cabinBox(FURNITURE.bench[0] - 0.7, FURNITURE.bench[0] + 0.7, FURNITURE.bench[1] - 0.25, FURNITURE.bench[1] + 0.25));
  for (const [lx, lz, r] of FURNITURE.pots) list.push(cabinCircle(lx, lz, r));
  // bridge railings
  const mid = (BRIDGE.z0 + BRIDGE.z1) / 2;
  const half = (BRIDGE.z0 - BRIDGE.z1) / 2 - 0.25;
  list.push(box(BRIDGE.x - BRIDGE.halfWidth, mid, 0.05, half));
  list.push(box(BRIDGE.x + BRIDGE.halfWidth, mid, 0.05, half));
  // nature
  for (let i = 0; i < SCATTER.nearPineCount; i++) {
    const p = SCATTER.pines[i];
    list.push(circle(p.x, p.z, 0.3 * p.scale));
  }
  for (const p of SCATTER.smallTrees) list.push(circle(p.x, p.z, 0.2 * p.scale));
  for (const p of SCATTER.boulders) list.push(circle(p.x, p.z, 0.72 * p.scale));
  for (const p of SCATTER.hydrangeas) list.push(circle(p.x, p.z, 0.38 * p.scale));
  for (const p of SCATTER.bushes) list.push(circle(p.x, p.z, 0.45 * p.scale));
  for (const p of SCATTER.tropicals) list.push(circle(p.x, p.z, 0.3 * p.scale));
  return list;
}

export const COLLIDERS = buildColliders();

/** Shore clearance: how close to the waterline a walker may stand. */
const POND_MARGIN = 0.42;

export function inCabinFootprint(x: number, z: number, margin: number): boolean {
  const [lx, lz] = worldToCabin(x, z);
  const inBody = lx > DECK.x0 - margin && lx < DECK.x1 + margin && lz > -DECK.z0 - margin && lz < DECK.z1 + margin;
  const inSteps = lx > STEPS.x0 - margin && lx < STEPS.x1 + margin && lz >= DECK.z1 && lz < STEPS.z1 + margin;
  return inBody || inSteps;
}

export interface Point {
  x: number;
  z: number;
}

/** One relaxation pass: push the circle (x, z, r) out of everything it overlaps. */
function pass(p: Point, r: number): boolean {
  let moved = false;
  for (const c of COLLIDERS) {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    if (c.kind === 'circle') {
      const min = c.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      const nx = d > 1e-5 ? dx / d : 1;
      const nz = d > 1e-5 ? dz / d : 0;
      p.x = c.x + nx * min;
      p.z = c.z + nz * min;
      moved = true;
    } else {
      const reach = c.hw + c.hd + r;
      if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
      const lx = dx * c.cos - dz * c.sin;
      const lz = dx * c.sin + dz * c.cos;
      const qx = Math.min(c.hw, Math.max(-c.hw, lx));
      const qz = Math.min(c.hd, Math.max(-c.hd, lz));
      let ox = lx - qx;
      let oz = lz - qz;
      const d2 = ox * ox + oz * oz;
      if (d2 >= r * r) continue;
      let nlx: number;
      let nlz: number;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        ox /= d;
        oz /= d;
        nlx = qx + ox * r;
        nlz = qz + oz * r;
      } else {
        // centre is inside the box: leave through the nearest face
        const px = c.hw - Math.abs(lx);
        const pz = c.hd - Math.abs(lz);
        if (px < pz) {
          nlx = Math.sign(lx || 1) * (c.hw + r);
          nlz = lz;
        } else {
          nlx = lx;
          nlz = Math.sign(lz || 1) * (c.hd + r);
        }
      }
      p.x = c.x + nlx * c.cos + nlz * c.sin;
      p.z = c.z - nlx * c.sin + nlz * c.cos;
      moved = true;
    }
  }
  // water: only the bridge corridor may cross it
  if (!onBridge(p.x, p.z)) {
    const sd = pondSDF(p.x, p.z);
    if (sd < POND_MARGIN) {
      const [nx, nz] = pondNormal(p.x, p.z);
      const push = Math.min(POND_MARGIN - sd, 6) + 1e-3;
      p.x += nx * push;
      p.z += nz * push;
      moved = true;
    }
  }
  // edge of the clearing
  const cx = p.x - CLEARING.cx;
  const cz = p.z - CLEARING.cz;
  const cd = Math.hypot(cx, cz);
  if (cd > CLEARING.radius) {
    p.x = CLEARING.cx + (cx / cd) * CLEARING.radius;
    p.z = CLEARING.cz + (cz / cd) * CLEARING.radius;
    moved = true;
  }
  return moved;
}

/** Push a walker of radius r out of any obstacle it overlaps (a few relaxation passes). */
export function resolve(x: number, z: number, r: number): Point {
  const p = { x, z };
  for (let i = 0; i < 4 && pass(p, r); i++);
  return p;
}

/** Like `resolve`, but keeps going until the point is free. For spawning and mode changes. */
export function nearestFree(x: number, z: number, r: number): Point {
  const p = { x, z };
  for (let i = 0; i < 40 && pass(p, r); i++);
  return p;
}

/** Move by (dx, dz) in small sub-steps so even a long frame cannot tunnel through a wall. */
export function moveWalker(x: number, z: number, dx: number, dz: number, r: number): Point {
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.min(64, Math.ceil(dist / 0.15)));
  let p: Point = { x, z };
  for (let i = 0; i < steps; i++) p = resolve(p.x + dx / steps, p.z + dz / steps, r);
  return p;
}
