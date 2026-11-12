import { POND, WATER_LEVEL } from '../../world/layout';
import { clamp, smoothstep } from '../../world/noise';
import { pondDepth, pondNormal, pondPoint, pondSDF } from '../../world/pond';
import { createRng, type Rng } from '../../world/rng';

export interface Fish {
  x: number;
  y: number;
  z: number;
  /** Direction of travel: (cos heading, sin heading) in the XZ plane. */
  heading: number;
  speed: number;
  /** Preferred speed in m/s; differs per fish. */
  cruise: number;
  /** Body length in metres. */
  size: number;
  /** Tail-beat phase, advanced faster when swimming faster. */
  phase: number;
  /** Current turn rate in rad/s (also used to bend the body). */
  turn: number;
  variety: number;
  /** 0..1: how strongly this fish is drawn to a visitor. */
  curiosity: number;
  /** Depth below the surface in metres. */
  depth: number;

  turnTarget: number;
  speedTarget: number;
  wanderTimer: number;
  depthTarget: number;
  depthTimer: number;
  surfaceTimer: number;
  /** 0 = swimming, 1 = rising to the surface, 2 = at the surface. */
  surfacing: 0 | 1 | 2;
  side: 1 | -1;
}

export interface Visitor {
  x: number;
  z: number;
}

const MAX_DT = 0.05;
const MAX_TURN = 2.4;
const TAU = Math.PI * 2;

function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/**
 * Steering simulation for the koi: wander, avoid the banks and each other,
 * drift up and down, surface now and then, and come to a visitor at the bank.
 * Pure logic with a seeded RNG; rendering reads `fish` each frame.
 */
export class KoiSim {
  readonly fish: Fish[] = [];
  private rng: Rng;

  constructor(count: number, seed = 1) {
    const rng = (this.rng = createRng(seed));
    let guard = 0;
    while (this.fish.length < count && guard++ < 5000) {
      const [x, z] = pondPoint(rng() * TAU, -rng.range(0.9, 3.4));
      if (pondSDF(x, z) > -0.8) continue;
      if (this.fish.some((f) => Math.hypot(f.x - x, f.z - z) < 0.5)) continue;
      const cruise = rng.range(0.16, 0.42);
      const depth = rng.range(0.15, 0.5);
      this.fish.push({
        x,
        z,
        y: WATER_LEVEL - depth,
        heading: rng() * TAU,
        speed: cruise,
        cruise,
        size: rng.range(0.45, 0.8),
        phase: rng() * TAU,
        turn: 0,
        variety: this.fish.length,
        curiosity: rng.range(0.45, 1),
        depth,
        turnTarget: 0,
        speedTarget: cruise,
        wanderTimer: rng.range(0, 3),
        depthTarget: depth,
        depthTimer: rng.range(2, 8),
        surfaceTimer: rng.range(4, 40),
        surfacing: 0,
        side: rng() < 0.5 ? 1 : -1,
      });
    }
  }

  step(dtRaw: number, visitor: Visitor | null, onSurface?: (fish: Fish) => void): void {
    const dt = Math.min(Math.max(dtRaw, 0), MAX_DT);
    if (dt === 0) return;
    const rng = this.rng;

    // A visitor only matters when they stand near the bank; the lure is a point just inside the water.
    let lureX = 0;
    let lureZ = 0;
    let lure = false;
    if (visitor) {
      const sd = pondSDF(visitor.x, visitor.z);
      if (sd < 2.4) {
        const [nx, nz] = pondNormal(visitor.x, visitor.z);
        lureX = visitor.x - nx * (Math.max(sd, 0) + 1.0);
        lureZ = visitor.z - nz * (Math.max(sd, 0) + 1.0);
        if (pondSDF(lureX, lureZ) > -0.5) {
          lureX = POND.cx + (lureX - POND.cx) * 0.8;
          lureZ = POND.cz + (lureZ - POND.cz) * 0.8;
        }
        lure = true;
      }
    }

    for (const f of this.fish) {
      /* wander */
      f.wanderTimer -= dt;
      if (f.wanderTimer <= 0) {
        f.turnTarget = rng.gauss() * 0.7;
        f.speedTarget = f.cruise * rng.range(0.6, 1.3);
        f.wanderTimer = rng.range(1.2, 4.5);
        if (rng() < 0.06) f.speedTarget = f.cruise * 2.1; // a short dart
      }
      let desired = f.turnTarget;
      let speedTarget = f.speedTarget;
      const cos = Math.cos(f.heading);
      const sin = Math.sin(f.heading);

      /* banks: look ahead and turn along the shore before reaching it */
      const reach = 0.5 + f.size * 1.2;
      const sdHere = pondSDF(f.x, f.z);
      const sdAhead = pondSDF(f.x + cos * reach, f.z + sin * reach);
      const margin = -0.55 - f.size * 0.3;
      const urgency = smoothstep(margin - 0.9, margin + 0.1, Math.max(sdAhead, sdHere + 0.15));
      if (urgency > 0) {
        const [nx, nz] = pondNormal(f.x, f.z);
        const cross = cos * -nz - sin * -nx; // heading × inward
        if (Math.abs(cross) > 0.15) f.side = cross > 0 ? 1 : -1;
        desired = desired * (1 - urgency) + f.side * 2.2 * urgency;
        speedTarget *= 1 - urgency * 0.25;
      }

      /* keep a little distance from the others */
      for (const o of this.fish) {
        if (o === f) continue;
        const dx = f.x - o.x;
        const dz = f.z - o.z;
        const r = (f.size + o.size) * 0.55;
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const cross = cos * (dz / d) - sin * (dx / d);
        desired += Math.sign(cross || 1) * 0.9 * (1 - d / r);
      }

      /* a person on the bank usually means food */
      let nearLure = false;
      if (lure) {
        const dx = lureX - f.x;
        const dz = lureZ - f.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 10) {
          if (dist > 1.2) {
            const diff = wrapAngle(Math.atan2(dz, dx) - f.heading);
            const pull = f.curiosity * smoothstep(10, 4, dist) * (1 - urgency * 0.7);
            desired = desired * (1 - pull * 0.8) + clamp(diff * 1.6, -1.8, 1.8) * pull;
            speedTarget = Math.max(speedTarget, f.cruise * (1 + 0.5 * pull));
          } else {
            nearLure = true;
            speedTarget *= 0.6;
          }
        }
      }

      /* integrate heading and position */
      f.turn += (clamp(desired, -MAX_TURN, MAX_TURN) - f.turn) * Math.min(1, dt * 3);
      f.heading = wrapAngle(f.heading + f.turn * dt);
      f.speed += (speedTarget - f.speed) * Math.min(1, dt * 1.5);
      f.speed = clamp(f.speed, f.cruise * 0.3, f.cruise * 2.4);
      f.x += Math.cos(f.heading) * f.speed * dt;
      f.z += Math.sin(f.heading) * f.speed * dt;

      /* hard limit: never leave the water */
      const limit = -0.25 - f.size * 0.15;
      const sd = pondSDF(f.x, f.z);
      if (sd > limit) {
        const [nx, nz] = pondNormal(f.x, f.z);
        f.x -= nx * (sd - limit);
        f.z -= nz * (sd - limit);
      }

      /* depth */
      const floor = Math.max(0.1, Math.min(0.8, pondDepth(f.x, f.z) - 0.13 - f.size * 0.08));
      f.depthTimer -= dt;
      if (f.depthTimer <= 0) {
        f.depthTarget = rng.range(0.14, 0.7);
        f.depthTimer = rng.range(3, 10);
      }
      f.surfaceTimer -= dt;
      let target = clamp(nearLure ? 0.12 : f.depthTarget, 0.09, floor);
      let rate = 1.2;
      if (f.surfacing === 0 && f.surfaceTimer <= 0) f.surfacing = 1;
      if (f.surfacing === 1) {
        target = 0.035;
        rate = 2.2;
        if (f.depth < 0.06) {
          f.surfacing = 2;
          f.surfaceTimer = 0.45;
          onSurface?.(f);
        }
      } else if (f.surfacing === 2) {
        target = 0.04;
        if (f.surfaceTimer <= 0) {
          f.surfacing = 0;
          f.surfaceTimer = rng.range(14, 45);
          f.depthTarget = rng.range(0.3, 0.6);
        }
      }
      f.depth += (target - f.depth) * Math.min(1, dt * rate);
      f.depth = Math.max(0.03, f.depth);
      f.y = WATER_LEVEL - f.depth;

      f.phase += dt * (2.5 + f.speed * 11);
    }
  }
}
