import { describe, expect, it } from 'vitest';
import { CABIN, DECK, POND, SPAWN, cabinToWorld } from './layout';
import { BRIDGE } from './pond';
import { shelterAt } from './shelter';

describe('shelterAt', () => {
  it('is open sky in the garden, on the bridge and over the pond', () => {
    for (const [x, z] of [[SPAWN.x, SPAWN.z], [BRIDGE.x, (BRIDGE.z0 + BRIDGE.z1) / 2], [POND.cx, POND.cz]]) {
      expect(shelterAt(x, z)).toEqual({ roof: 0, indoors: 0 });
    }
  });

  it('is fully covered, but not indoors, on the veranda', () => {
    const [x, z] = cabinToWorld(0, (DECK.z0 + DECK.z1) / 2);
    const s = shelterAt(x, z);
    expect(s.roof).toBeGreaterThan(0.95);
    expect(s.indoors).toBe(0);
  });

  it('is indoors inside the cabin walls', () => {
    expect(shelterAt(CABIN.x, CABIN.z)).toEqual({ roof: 1, indoors: 1 });
  });

  it('fades out across the edge of the veranda roof rather than switching', () => {
    let last = 1;
    for (let lz = DECK.z1 - 0.5; lz < DECK.z1 + 2; lz += 0.1) {
      const [x, z] = cabinToWorld(0, lz);
      const roof = shelterAt(x, z).roof;
      expect(roof).toBeLessThanOrEqual(last + 1e-9);
      expect(last - roof).toBeLessThan(0.3);
      last = roof;
    }
    expect(last).toBe(0);
  });

  it('writes into the object it is given', () => {
    const out = { roof: 0.5, indoors: 0.5 };
    expect(shelterAt(SPAWN.x, SPAWN.z, out)).toBe(out);
    expect(out).toEqual({ roof: 0, indoors: 0 });
  });
});
