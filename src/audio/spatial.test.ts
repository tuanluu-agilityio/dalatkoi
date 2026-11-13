import { describe, expect, it } from 'vitest';
import { LANE_PANS, laneFor, placeSound } from './spatial';

/** Standing at the origin, looking toward −Z (so +X is to the right). */
const ahead = { x: 0, y: 1.6, z: 0, fx: 0, fy: 0, fz: -1 };
const out = { pan: 0, gain: 0 };

describe('placeSound', () => {
  it('centres a sound straight ahead and one straight behind', () => {
    expect(placeSound(ahead, 0, 1.6, -5, 2, 1, out).pan).toBeCloseTo(0, 6);
    expect(placeSound(ahead, 0, 1.6, 5, 2, 1, out).pan).toBeCloseTo(0, 6);
  });

  it('pans fully to the side the sound is on', () => {
    expect(placeSound(ahead, 4, 1.6, 0, 2, 1, out).pan).toBeCloseTo(1, 6);
    expect(placeSound(ahead, -4, 1.6, 0, 2, 1, out).pan).toBeCloseTo(-1, 6);
  });

  it('follows the listener as they turn', () => {
    // facing +X: a sound at −Z is now on the left
    const east = { ...ahead, fx: 1, fz: 0 };
    expect(placeSound(east, 0, 1.6, -4, 2, 1, out).pan).toBeCloseTo(-1, 6);
  });

  it('pans by azimuth, as an equal-power panner does: 45° to the right is half way', () => {
    expect(placeSound(ahead, 3, 1.6, -3, 2, 1, out).pan).toBeCloseTo(0.5, 6);
    // behind and to the right folds onto the same position
    expect(placeSound(ahead, 3, 1.6, 3, 2, 1, out).pan).toBeCloseTo(0.5, 6);
  });

  it('uses the inverse distance model', () => {
    expect(placeSound(ahead, 0, 1.6, -1, 2, 1.3, out).gain).toBe(1); // inside the reference distance
    expect(placeSound(ahead, 0, 1.6, -2, 2, 1.3, out).gain).toBeCloseTo(1, 6);
    expect(placeSound(ahead, 0, 1.6, -6, 2, 1.3, out).gain).toBeCloseTo(2 / (2 + 1.3 * 4), 6);
    expect(placeSound(ahead, 0, 1.6, -6, 2, 0, out).gain).toBe(1);
  });

  it('is safe at the listener position, straight overhead, and with bad numbers', () => {
    expect(placeSound(ahead, 0, 1.6, 0, 2, 1, out)).toEqual({ pan: 0, gain: 1 });
    expect(placeSound(ahead, 0, 9, 0, 2, 1, out).pan).toBeCloseTo(0, 6);
    const bad = placeSound({ ...ahead, fx: Number.NaN }, 1, 1, 1, 2, 1, out);
    expect(Number.isFinite(bad.pan)).toBe(true);
    expect(Number.isFinite(bad.gain)).toBe(true);
    // looking straight up: there is no left or right to speak of, but nothing breaks
    const up = placeSound({ ...ahead, fx: 0, fy: 1, fz: 0 }, 3, 1.6, 0, 2, 1, out);
    expect(Number.isFinite(up.pan)).toBe(true);
  });

  it('writes into the object it is given, so a caller can avoid allocating', () => {
    const target = { pan: 9, gain: 9 };
    expect(placeSound(ahead, 4, 1.6, 0, 2, 1, target)).toBe(target);
    expect(target.pan).toBeCloseTo(1, 6);
  });
});

describe('laneFor', () => {
  it('spreads the lanes evenly from hard left to hard right', () => {
    expect(LANE_PANS[0]).toBe(-1);
    expect(LANE_PANS[LANE_PANS.length - 1]).toBe(1);
    expect(LANE_PANS[(LANE_PANS.length - 1) / 2]).toBe(0);
  });

  it('picks the nearest lane and clamps out-of-range pans', () => {
    for (const pan of [-1, -0.61, -0.1, 0, 0.3, 0.99, 1]) {
      const lane = laneFor(pan);
      const best = Math.min(...LANE_PANS.map((p) => Math.abs(p - pan)));
      expect(Math.abs(LANE_PANS[lane] - pan)).toBeCloseTo(best, 9);
    }
    expect(laneFor(-7)).toBe(0);
    expect(laneFor(7)).toBe(LANE_PANS.length - 1);
    expect(laneFor(Number.NaN)).toBe((LANE_PANS.length - 1) / 2);
  });
});
