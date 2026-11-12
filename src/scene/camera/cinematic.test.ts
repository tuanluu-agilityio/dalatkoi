import { describe, expect, it } from 'vitest';
import { inCabinFootprint, resolve } from '../../world/colliders';
import { CLEARING, WATER_LEVEL } from '../../world/layout';
import { pondSDF } from '../../world/pond';
import { groundHeight } from '../../world/terrain';
import { CINEMATIC_DURATION, FADE_TIME, INTRO_DURATION, SHOTS, sampleCinematic } from './cinematic';

const times = (step: number) => {
  const out: number[] = [];
  for (let t = 0; t < CINEMATIC_DURATION; t += step) out.push(t);
  return out;
};

describe('cinematic timeline', () => {
  it('has seven shots whose durations add up to the loop length', () => {
    expect(SHOTS).toHaveLength(7);
    expect(SHOTS.reduce((a, s) => a + s.duration, 0)).toBeCloseTo(CINEMATIC_DURATION, 6);
  });

  it('the intro ends exactly on a cut, before the loop ends', () => {
    expect(INTRO_DURATION).toBeCloseTo(SHOTS[0].duration + SHOTS[1].duration, 6);
    expect(INTRO_DURATION).toBeLessThan(CINEMATIC_DURATION);
    expect(sampleCinematic(INTRO_DURATION).fade).toBeCloseTo(1, 3);
  });

  it('dips fully to dark on every cut and is clear mid-shot', () => {
    let start = 0;
    for (const shot of SHOTS) {
      expect(sampleCinematic(start + 1e-4).fade).toBeGreaterThan(0.99);
      expect(sampleCinematic(start + shot.duration - 1e-4).fade).toBeGreaterThan(0.99);
      expect(sampleCinematic(start + shot.duration / 2).fade).toBe(0);
      expect(shot.duration).toBeGreaterThan(FADE_TIME * 4);
      start += shot.duration;
    }
  });

  it('reports the shot index and loops', () => {
    expect(sampleCinematic(0.5).shot).toBe(0);
    expect(sampleCinematic(CINEMATIC_DURATION - 0.5).shot).toBe(6);
    const a = sampleCinematic(3.25);
    const b = sampleCinematic(3.25 + CINEMATIC_DURATION * 2);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.ly).toBeCloseTo(a.ly, 6);
    expect(b.shot).toBe(a.shot);
  });

  it('treats negative and non-finite times as a valid point on the loop', () => {
    for (const t of [-3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = sampleCinematic(t);
      for (const v of [s.x, s.y, s.z, s.lx, s.ly, s.lz, s.fov, s.focus, s.fade]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('keeps the camera above the ground and the water', () => {
    for (const t of times(0.1)) {
      const s = sampleCinematic(t);
      const floor = Math.max(groundHeight(s.x, s.z), WATER_LEVEL);
      expect(s.y - floor, `t=${t.toFixed(1)} shot ${s.shot}`).toBeGreaterThan(0.3);
    }
  });

  it('never passes through the cabin, a tree trunk or a boulder, and stays in the clearing', () => {
    for (const t of times(0.1)) {
      const s = sampleCinematic(t);
      expect(Math.hypot(s.x - CLEARING.cx, s.z - CLEARING.cz)).toBeLessThan(CLEARING.radius);
      if (s.y < 7) expect(inCabinFootprint(s.x, s.z, 0.3), `cabin t=${t.toFixed(1)}`).toBe(false);
      if (s.y < 12 && pondSDF(s.x, s.z) > 0.6) {
        const free = resolve(s.x, s.z, 0.25);
        expect(Math.hypot(free.x - s.x, free.z - s.z), `obstacle t=${t.toFixed(1)} shot ${s.shot}`).toBeLessThan(1e-6);
      }
    }
  });

  it('moves smoothly inside a shot and always has something to look at', () => {
    let prev = sampleCinematic(0);
    for (const t of times(0.05)) {
      const s = sampleCinematic(t);
      if (s.shot === prev.shot) expect(Math.hypot(s.x - prev.x, s.y - prev.y, s.z - prev.z)).toBeLessThan(0.12);
      expect(Math.hypot(s.lx - s.x, s.ly - s.y, s.lz - s.z)).toBeGreaterThan(1);
      expect(s.fov).toBeGreaterThanOrEqual(25);
      expect(s.fov).toBeLessThanOrEqual(70);
      expect(s.focus).toBeGreaterThan(1);
      prev = s;
    }
  });
});
