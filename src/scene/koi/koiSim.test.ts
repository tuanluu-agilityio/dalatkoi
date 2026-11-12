import { describe, expect, it } from 'vitest';
import { WATER_LEVEL } from '../../world/layout';
import { pondPoint, pondSDF } from '../../world/pond';
import { KoiSim } from './koiSim';

const run = (sim: KoiSim, seconds: number, visitor: { x: number; z: number } | null = null, onSurface?: () => void) => {
  for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60, visitor, onSurface);
};

describe('KoiSim', () => {
  it('creates the requested number of fish inside the pond', () => {
    const sim = new KoiSim(14, 1);
    expect(sim.fish).toHaveLength(14);
    for (const f of sim.fish) expect(pondSDF(f.x, f.z)).toBeLessThan(-0.3);
  });

  it('keeps every fish in the water for two minutes', () => {
    const sim = new KoiSim(14, 2);
    for (let s = 0; s < 120; s++) {
      run(sim, 1);
      for (const f of sim.fish) {
        expect(pondSDF(f.x, f.z)).toBeLessThan(-0.1);
        expect(f.y).toBeLessThan(WATER_LEVEL);
        expect(f.y).toBeGreaterThan(WATER_LEVEL - 1.3);
      }
    }
  });

  it('keeps speeds within each fish’s limits and fish moving', () => {
    const sim = new KoiSim(10, 3);
    const start = sim.fish.map((f) => [f.x, f.z]);
    for (let s = 0; s < 30; s++) {
      run(sim, 1);
      for (const f of sim.fish) {
        expect(f.speed).toBeGreaterThanOrEqual(f.cruise * 0.25);
        expect(f.speed).toBeLessThanOrEqual(f.cruise * 2.6);
      }
    }
    const moved = sim.fish.filter((f, i) => Math.hypot(f.x - start[i][0], f.z - start[i][1]) > 0.5);
    expect(moved.length).toBeGreaterThan(6);
  });

  it('gives fish different cruising speeds and sizes', () => {
    const sim = new KoiSim(12, 4);
    expect(new Set(sim.fish.map((f) => f.cruise.toFixed(3))).size).toBeGreaterThan(8);
    for (const f of sim.fish) {
      expect(f.size).toBeGreaterThanOrEqual(0.45);
      expect(f.size).toBeLessThanOrEqual(0.8);
    }
  });

  it('clamps a very long frame instead of teleporting', () => {
    const sim = new KoiSim(8, 5);
    const before = sim.fish.map((f) => [f.x, f.z]);
    sim.step(1.0, null);
    sim.fish.forEach((f, i) => {
      expect(Math.hypot(f.x - before[i][0], f.z - before[i][1])).toBeLessThan(0.2);
    });
  });

  it('turns smoothly (no heading jumps)', () => {
    const sim = new KoiSim(10, 6);
    for (let i = 0; i < 60 * 40; i++) {
      const before = sim.fish.map((f) => f.heading);
      sim.step(1 / 60, null);
      sim.fish.forEach((f, k) => {
        let d = Math.abs(f.heading - before[k]) % (Math.PI * 2);
        if (d > Math.PI) d = Math.PI * 2 - d;
        expect(d).toBeLessThan(0.09);
      });
    }
  });

  it('draws fish toward a visitor standing at the bank', () => {
    const sim = new KoiSim(14, 7);
    run(sim, 10);
    const [vx, vz] = pondPoint(1.55, 0.8);
    const mean = () => sim.fish.reduce((s, f) => s + Math.hypot(f.x - vx, f.z - vz), 0) / sim.fish.length;
    const before = mean();
    run(sim, 25, { x: vx, z: vz });
    expect(mean()).toBeLessThan(before - 0.5);
  });

  it('ignores a visitor who is far from the water', () => {
    const a = new KoiSim(6, 8);
    const b = new KoiSim(6, 8);
    run(a, 5);
    run(b, 5, { x: 20, z: 20 });
    a.fish.forEach((f, i) => expect(f.x).toBeCloseTo(b.fish[i].x, 6));
  });

  it('lets fish surface now and then, reporting where', () => {
    const sim = new KoiSim(14, 9);
    const events: number[] = [];
    for (let i = 0; i < 60 * 120; i++) {
      sim.step(1 / 60, null, (f) => {
        events.push(pondSDF(f.x, f.z));
        expect(f.y).toBeGreaterThan(WATER_LEVEL - 0.12);
      });
    }
    expect(events.length).toBeGreaterThan(3);
    expect(events.length).toBeLessThan(120);
    for (const sd of events) expect(sd).toBeLessThan(0);
  });

  it('is deterministic for a given seed', () => {
    const a = new KoiSim(5, 10);
    const b = new KoiSim(5, 10);
    run(a, 3);
    run(b, 3);
    expect(a.fish.map((f) => f.x)).toEqual(b.fish.map((f) => f.x));
  });
});
