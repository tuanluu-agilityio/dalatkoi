import { describe, expect, it } from 'vitest';
import { adaptQuality, initialAdapt, type AdaptState } from './adapt';

const base: AdaptState = initialAdapt('high');
const at = (patch: Partial<AdaptState>): AdaptState => ({ ...base, ...patch });

describe('adaptQuality', () => {
  it('does nothing while the frame rate is comfortable', () => {
    expect(adaptQuality(base, 48)).toEqual(base);
    expect(adaptQuality(base, 120)).toEqual(base);
  });

  it('lowers resolution first when the frame rate drops', () => {
    const next = adaptQuality(base, 24);
    expect(next.level).toBe('high');
    expect(next.dprScale).toBeCloseTo(0.85, 6);
    expect(next.probe).toBeNull();
  });

  it('takes a bigger resolution step when the frame rate is very low', () => {
    expect(adaptQuality(base, 12).dprScale).toBeCloseTo(0.7, 6);
  });

  it('steps down a profile once resolution is at its floor, and restores resolution', () => {
    const next = adaptQuality(at({ dprScale: 0.6 }), 20);
    expect(next).toEqual(initialAdapt('medium'));
    expect(adaptQuality(at({ level: 'medium', dprScale: 0.6 }), 20).level).toBe('low');
  });

  it('has nowhere lower to go than low at minimum resolution', () => {
    const floor = at({ level: 'low', dprScale: 0.6 });
    expect(adaptQuality(floor, 5)).toEqual(floor);
  });

  it('only gives resolution back after several good windows in a row, and never raises the profile', () => {
    let s = at({ level: 'medium', dprScale: 0.7 });
    s = adaptQuality(s, 60);
    s = adaptQuality(s, 60);
    expect(s.dprScale).toBeCloseTo(0.7, 6);
    s = adaptQuality(s, 60);
    expect(s.dprScale).toBeCloseTo(0.8, 6);
    expect(s.goodWindows).toBe(0);
    for (let i = 0; i < 400; i++) s = adaptQuality(s, 60);
    expect(s.dprScale).toBe(1);
    expect(s.level).toBe('medium');
  });

  it('a mediocre window resets the streak without changing anything else', () => {
    const s = adaptQuality(at({ level: 'medium', dprScale: 0.7, goodWindows: 2 }), 50);
    expect(s).toEqual(at({ level: 'medium', dprScale: 0.7, goodWindows: 0 }));
  });

  it('ignores meaningless measurements', () => {
    for (const fps of [Number.NaN, 0, -3, Number.POSITIVE_INFINITY]) expect(adaptQuality(base, fps)).toEqual(base);
  });
});

describe('adaptQuality between struggling and smooth', () => {
  it('tries a lower resolution and keeps it when the frame rate answers', () => {
    let s = adaptQuality(base, 33);
    expect(s.dprScale).toBeCloseTo(0.8, 6);
    expect(s.probe).toEqual({ from: 1, fps: 33 });
    s = adaptQuality(s, 40);
    expect(s.dprScale).toBeCloseTo(0.8, 6);
    expect(s.probe).toBeNull();
    // still short of smooth: goes on
    s = adaptQuality(s, 40);
    expect(s.dprScale).toBeCloseTo(0.6, 6);
    s = adaptQuality(s, 58);
    expect(s.dprScale).toBeCloseTo(0.6, 6);
    expect(s.probe).toBeNull();
  });

  it('does not mistake a display capped at 30 fps for a struggling device: it puts the resolution back', () => {
    let s = adaptQuality(base, 30);
    expect(s.dprScale).toBeLessThan(1);
    s = adaptQuality(s, 30.2);
    expect(s.dprScale).toBe(1);
    expect(s.probe).toBeNull();
    expect(s.level).toBe('high');
  });

  it('waits twice as long before each new attempt that did not help', () => {
    let s = base;
    const gaps: number[] = [];
    let gap = 0;
    for (let i = 0; i < 400; i++) {
      const before = s.dprScale;
      s = adaptQuality(s, 30);
      if (before === 1 && s.dprScale < 1) {
        gaps.push(gap);
        gap = 0;
      } else gap++;
    }
    expect(gaps.slice(1, 6)).toEqual([5, 9, 17, 33, 65]);
    // and settles there: at most one attempt every 65 windows from then on
    expect(gaps.length).toBeLessThanOrEqual(10);
  });

  it('does not bounce: giving resolution back also makes the next attempt wait', () => {
    let s = at({ level: 'medium', dprScale: 0.6 });
    let changes = 0;
    for (let i = 0; i < 400; i++) {
      const before = s.dprScale;
      // smooth at the floor, short of the target one step up
      s = adaptQuality(s, s.dprScale <= 0.6 ? 60 : 40);
      if (s.dprScale !== before) changes++;
    }
    // 400 windows is over a quarter of an hour; the waits double up to 64 windows
    expect(changes).toBeLessThanOrEqual(18);
  });

  it('a real drop still acts at once, whatever was being tried', () => {
    const probing = adaptQuality(base, 33);
    const s = adaptQuality(probing, 14);
    expect(s.probe).toBeNull();
    expect(s.dprScale).toBeLessThan(probing.dprScale);
    expect(adaptQuality(at({ hold: 40 }), 20).dprScale).toBeCloseTo(0.85, 6);
  });

  it('leaves the resolution alone at the floor', () => {
    const floor = at({ level: 'medium', dprScale: 0.6 });
    expect(adaptQuality(floor, 35)).toEqual(floor);
  });
});
