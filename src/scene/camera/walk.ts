import { moveWalker, nearestFree } from '../../world/colliders';
import { EYE_HEIGHT, SPAWN, WALKER_RADIUS } from '../../world/layout';
import { surfaceAt, type Surface } from '../../world/surfaces';
import { walkHeight } from '../../world/terrain';

/** A slow stroll: this is a place to linger, not to cross. */
export const WALK_SPEED = 1.9;
export const RUN_SPEED = 3.4;
const ACCELERATION = 9;
const STRIDE_WALK = 0.72;
const STRIDE_RUN = 1.02;

export interface WalkInput {
  /** -1..1, positive is forward. */
  forward: number;
  /** -1..1, positive is to the right. */
  strafe: number;
  run: boolean;
}

export interface WalkState {
  x: number;
  z: number;
  /** Heading in radians; 0 looks down -Z, positive turns left. */
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  speed: number;
  /** Height of the surface underfoot. */
  footY: number;
  /** Smoothed eye height, without head bob. */
  eyeY: number;
  /** Distance walked since the last footfall. */
  stride: number;
  /** 0..1 phase of the current step, for head bob. */
  bobPhase: number;
}

export function createWalkState(): WalkState {
  const p = nearestFree(SPAWN.x, SPAWN.z, WALKER_RADIUS);
  const footY = walkHeight(p.x, p.z);
  return {
    x: p.x,
    z: p.z,
    yaw: Math.atan2(-(SPAWN.lookX - p.x), -(SPAWN.lookZ - p.z)),
    pitch: -0.02,
    vx: 0,
    vz: 0,
    speed: 0,
    footY,
    eyeY: footY + EYE_HEIGHT,
    stride: STRIDE_WALK * 0.5,
    bobPhase: 0,
  };
}

const axis = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : v > 0 ? 1 : v < 0 ? -1 : 0);

/**
 * Advance the walker by `dt` seconds. Returns the surface under the foot when
 * a footstep lands during this step, otherwise null.
 */
export function stepWalk(s: WalkState, input: WalkInput, dt: number): Surface | null {
  const step = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0;
  let f = axis(input.forward);
  let r = axis(input.strafe);
  const len = Math.hypot(f, r);
  if (len > 1) {
    f /= len;
    r /= len;
  }
  const top = input.run ? RUN_SPEED : WALK_SPEED;
  const sin = Math.sin(s.yaw);
  const cos = Math.cos(s.yaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  const tx = (-sin * f + cos * r) * top;
  const tz = (-cos * f - sin * r) * top;
  const blend = Math.min(1, step * ACCELERATION);
  s.vx += (tx - s.vx) * blend;
  s.vz += (tz - s.vz) * blend;
  if (len === 0 && Math.hypot(s.vx, s.vz) < 0.05) {
    s.vx = 0;
    s.vz = 0;
  }

  const moved = moveWalker(s.x, s.z, s.vx * step, s.vz * step, WALKER_RADIUS);
  const dist = Math.hypot(moved.x - s.x, moved.z - s.z);
  s.x = moved.x;
  s.z = moved.z;
  // actual ground speed: sliding along a wall is slower than the intent
  s.speed = step > 0 ? Math.min(top, dist / step) : 0;
  if (s.speed < 0.02) s.speed = 0;

  s.footY = walkHeight(s.x, s.z);
  s.eyeY += (s.footY + EYE_HEIGHT - s.eyeY) * Math.min(1, step * 10);

  const strideLength = s.speed > WALK_SPEED * 1.25 ? STRIDE_RUN : STRIDE_WALK;
  let landed: Surface | null = null;
  if (dist > 0) {
    s.stride += dist;
    if (s.stride >= strideLength) {
      s.stride %= strideLength;
      landed = surfaceAt(s.x, s.z);
    }
    s.bobPhase = s.stride / strideLength;
  } else {
    // settle the head when standing still
    s.bobPhase += (0 - s.bobPhase) * Math.min(1, step * 6);
  }
  return landed;
}
