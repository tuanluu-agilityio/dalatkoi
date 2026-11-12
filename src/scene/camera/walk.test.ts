import { describe, expect, it } from 'vitest';
import { inCabinFootprint } from '../../world/colliders';
import { CABIN, SPAWN } from '../../world/layout';
import { POND } from '../../world/layout';
import { pondSDF } from '../../world/pond';
import { RUN_SPEED, WALK_SPEED, createWalkState, stepWalk, type WalkInput } from './walk';

const idle: WalkInput = { forward: 0, strafe: 0, run: false };
const ahead: WalkInput = { forward: 1, strafe: 0, run: false };

/** Yaw that faces from (x, z) toward (tx, tz). Yaw 0 looks down -Z. */
const yawToward = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));

function run(state: ReturnType<typeof createWalkState>, input: WalkInput, seconds: number, dt = 1 / 60) {
  const steps: string[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const s = stepWalk(state, input, dt);
    if (s) steps.push(s);
  }
  return steps;
}

describe('walk controller', () => {
  it('starts at the spawn point facing the cabin', () => {
    const s = createWalkState();
    expect(s.x).toBeCloseTo(SPAWN.x, 6);
    expect(s.z).toBeCloseTo(SPAWN.z, 6);
    expect(-Math.cos(s.yaw)).toBeLessThan(0); // facing -Z (north, toward the cabin)
  });

  it('stands still and makes no footsteps without input', () => {
    const s = createWalkState();
    const steps = run(s, idle, 2);
    expect(s.x).toBeCloseTo(SPAWN.x, 6);
    expect(s.z).toBeCloseTo(SPAWN.z, 6);
    expect(s.speed).toBe(0);
    expect(steps).toHaveLength(0);
  });

  it('walks at a relaxed pace and reports a footstep roughly every stride', () => {
    const s = createWalkState();
    s.yaw = 0;
    const z0 = s.z;
    const steps = run(s, ahead, 3);
    const travelled = z0 - s.z;
    expect(travelled).toBeGreaterThan(WALK_SPEED * 3 * 0.8);
    expect(travelled).toBeLessThanOrEqual(WALK_SPEED * 3 + 1e-6);
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(steps.length).toBeLessThanOrEqual(9);
  });

  it('runs faster with the run modifier, and diagonals are not faster than straight', () => {
    const a = createWalkState();
    a.yaw = 0;
    run(a, { forward: 1, strafe: 0, run: true }, 2);
    expect(a.speed).toBeCloseTo(RUN_SPEED, 1);
    const b = createWalkState();
    b.yaw = 0;
    run(b, { forward: 1, strafe: 1, run: false }, 2);
    expect(b.speed).toBeLessThanOrEqual(WALK_SPEED + 1e-6);
  });

  it('cannot walk into the pond', () => {
    const s = createWalkState();
    s.yaw = yawToward(s.x, s.z, POND.cx, POND.cz);
    run(s, ahead, 20);
    expect(pondSDF(s.x, s.z)).toBeGreaterThan(0.3);
  });

  it('cannot walk through the cabin walls', () => {
    const s = createWalkState();
    s.x = CABIN.x + 12;
    s.z = CABIN.z;
    s.yaw = yawToward(s.x, s.z, CABIN.x, CABIN.z);
    for (let i = 0; i < 60 * 15; i++) {
      stepWalk(s, { forward: 1, strafe: 0, run: true }, 1 / 60);
      // the veranda is walkable, the closed body behind it is not
      expect(Math.hypot(s.x - CABIN.x, s.z - CABIN.z)).toBeGreaterThan(1.5);
    }
    expect(inCabinFootprint(s.x, s.z, -0.4) && Math.hypot(s.x - CABIN.x, s.z - CABIN.z) < 2).toBe(false);
  });

  it('survives a stalled frame and bad input without teleporting', () => {
    const s = createWalkState();
    s.yaw = 0;
    stepWalk(s, ahead, 5);
    expect(SPAWN.z - s.z).toBeLessThan(0.5);
    stepWalk(s, { forward: Number.NaN, strafe: Number.POSITIVE_INFINITY, run: false }, Number.NaN);
    expect(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.eyeY)).toBe(true);
  });

  it('keeps the eyes at standing height above whatever is underfoot', () => {
    const s = createWalkState();
    run(s, idle, 1);
    expect(s.eyeY - s.footY).toBeGreaterThan(1.55);
    expect(s.eyeY - s.footY).toBeLessThan(1.75);
  });
});
