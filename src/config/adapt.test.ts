import { describe, expect, it } from 'vitest';
import { adaptQuality, type AdaptState } from './adapt';

const base: AdaptState = { level: 'high', dprScale: 1, goodWindows: 0 };

describe('adaptQuality', () => {
  it('does nothing while the frame rate is comfortable', () => {
    expect(adaptQuality(base, 48)).toEqual({ level: 'high', dprScale: 1, goodWindows: 0 });
  });

  it('lowers resolution first when the frame rate drops', () => {
    const next = adaptQuality(base, 24);
    expect(next.level).toBe('high');
    expect(next.dprScale).toBeCloseTo(0.85, 6);
  });

  it('takes a bigger resolution step when the frame rate is very low', () => {
    expect(adaptQuality(base, 12).dprScale).toBeCloseTo(0.7, 6);
  });

  it('steps down a profile once resolution is at its floor, and restores resolution', () => {
    const next = adaptQuality({ level: 'high', dprScale: 0.6, goodWindows: 0 }, 20);
    expect(next).toEqual({ level: 'medium', dprScale: 1, goodWindows: 0 });
    expect(adaptQuality({ level: 'medium', dprScale: 0.6, goodWindows: 0 }, 20).level).toBe('low');
  });

  it('has nowhere lower to go than low at minimum resolution', () => {
    const floor: AdaptState = { level: 'low', dprScale: 0.6, goodWindows: 0 };
    expect(adaptQuality(floor, 5)).toEqual(floor);
  });

  it('only gives resolution back after several good windows in a row, and never raises the profile', () => {
    let s: AdaptState = { level: 'medium', dprScale: 0.7, goodWindows: 0 };
    s = adaptQuality(s, 60);
    s = adaptQuality(s, 60);
    expect(s.dprScale).toBeCloseTo(0.7, 6);
    s = adaptQuality(s, 60);
    expect(s.dprScale).toBeCloseTo(0.8, 6);
    expect(s.goodWindows).toBe(0);
    for (let i = 0; i < 30; i++) s = adaptQuality(s, 60);
    expect(s.dprScale).toBe(1);
    expect(s.level).toBe('medium');
  });

  it('a mediocre window resets the streak without changing anything else', () => {
    const s = adaptQuality({ level: 'medium', dprScale: 0.7, goodWindows: 2 }, 45);
    expect(s).toEqual({ level: 'medium', dprScale: 0.7, goodWindows: 0 });
  });

  it('does not mistake a display capped at 30 fps for a struggling device', () => {
    for (const fps of [29.6, 29.9, 30, 30.2]) expect(adaptQuality(base, fps)).toEqual(base);
  });

  it('ignores meaningless measurements', () => {
    for (const fps of [Number.NaN, 0, -3, Number.POSITIVE_INFINITY]) expect(adaptQuality(base, fps)).toEqual(base);
  });
});
