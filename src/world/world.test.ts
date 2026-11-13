import { describe, expect, it } from 'vitest';
import { CABIN, CLEARING, POND, WALKER_RADIUS, WATER_LEVEL, cabinToWorld } from './layout';
import { BRIDGE, pondDepth, pondOutline, pondPoint, pondSDF } from './pond';
import { groundHeight, walkHeight } from './terrain';
import { GRAVEL_PATHS, PATH_HALF_WIDTH, PATIO, STONE_PATHS, distToGravelPath, distToPaths, distToStonePath, type Pt } from './paths';
import { surfaceAt } from './surfaces';
import { inCabinFootprint, moveWalker, nearestFree, resolve } from './colliders';
import { SCATTER } from './scatter';
import { POIS } from './pois';

const bridgeMidZ = (BRIDGE.z0 + BRIDGE.z1) / 2;

describe('pond', () => {
  it('centre is inside and deep', () => {
    expect(pondSDF(POND.cx, POND.cz)).toBeLessThan(-2);
    expect(pondDepth(POND.cx, POND.cz)).toBeGreaterThanOrEqual(0.8);
  });
  it('3 m beyond the outline is outside, with no depth', () => {
    for (let i = 0; i < 24; i++) {
      const [x, z] = pondPoint((i / 24) * Math.PI * 2, 3);
      expect(pondSDF(x, z)).toBeGreaterThan(1.5);
      expect(pondDepth(x, z)).toBe(0);
    }
  });
  it('outline points sit on the zero contour', () => {
    for (const [x, z] of pondOutline(64)) expect(Math.abs(pondSDF(x, z))).toBeLessThan(1e-6);
  });
  it('sdf is roughly metric near the shore', () => {
    for (let i = 0; i < 16; i++) {
      const [x, z] = pondPoint((i / 16) * Math.PI * 2, 1);
      expect(pondSDF(x, z)).toBeGreaterThan(0.6);
      expect(pondSDF(x, z)).toBeLessThan(1.4);
    }
  });
  it('bridge spans water with both ends on land', () => {
    expect(pondSDF(BRIDGE.x, bridgeMidZ)).toBeLessThan(-0.5);
    expect(pondSDF(BRIDGE.x, BRIDGE.z0)).toBeGreaterThan(0.4);
    expect(pondSDF(BRIDGE.x, BRIDGE.z1)).toBeGreaterThan(0.4);
    expect(BRIDGE.z0 - BRIDGE.z1).toBeLessThan(9);
  });
});

describe('terrain', () => {
  it('pond bed is below the water, lawn is above it', () => {
    expect(groundHeight(POND.cx, POND.cz)).toBeLessThan(WATER_LEVEL - 0.8);
    expect(groundHeight(0, 14)).toBeGreaterThan(WATER_LEVEL + 0.1);
  });
  it('clearing is nearly flat', () => {
    expect(Math.abs(groundHeight(0, 14))).toBeLessThan(0.15);
    expect(Math.abs(groundHeight(-14, 2))).toBeLessThan(0.15);
  });
  it('land rises toward the horizon', () => {
    expect(groundHeight(0, -110)).toBeGreaterThan(5);
  });
  it('deck stands 0.6 m up and steps ramp to it', () => {
    const [dx, dz] = cabinToWorld(0, 4.3);
    expect(walkHeight(dx, dz)).toBeCloseTo(CABIN.deckHeight, 5);
    const [sx, sz] = cabinToWorld(CABIN.stepsX, CABIN.depth / 2 + CABIN.deckDepth + CABIN.stepsRun / 2);
    expect(walkHeight(sx, sz)).toBeGreaterThan(0.2);
    expect(walkHeight(sx, sz)).toBeLessThan(0.45);
  });
  it('bridge deck arches above the water', () => {
    expect(walkHeight(BRIDGE.x, bridgeMidZ)).toBeGreaterThan(0.45);
    expect(walkHeight(BRIDGE.x, BRIDGE.z0)).toBeLessThan(0.25);
  });
});

describe('surfaces', () => {
  it('classifies each walkable material', () => {
    expect(surfaceAt(BRIDGE.x, bridgeMidZ)).toBe('bridge');
    const [dx, dz] = cabinToWorld(0, 4.3);
    expect(surfaceAt(dx, dz)).toBe('veranda');
    const [gx, gz] = GRAVEL_PATHS[0][Math.floor(GRAVEL_PATHS[0].length / 2)];
    expect(surfaceAt(gx, gz)).toBe('gravel');
    const [tx, tz] = STONE_PATHS[0][2];
    expect(surfaceAt(tx, tz)).toBe('stone');
    expect(surfaceAt(-16, 14)).toBe('grass');
  });
});

describe('paths', () => {
  /** The plain definition: nearest point on any segment of the line. */
  const bruteForce = (x: number, z: number, pts: Pt[]): number => {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const abx = bx - ax;
      const abz = bz - az;
      const t = Math.min(1, Math.max(0, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz || 1)));
      best = Math.min(best, Math.hypot(x - (ax + abx * t), z - (az + abz * t)));
    }
    return best;
  };

  it('measures distance exactly, however the search is organised', () => {
    // the ground mask and the grass ask this question for every texel and every tuft
    for (let x = -24; x <= 24; x += 0.37) {
      for (let z = -22; z <= 26; z += 0.41) {
        const stone = Math.min(Math.hypot(x - PATIO.x, z - PATIO.z) - PATIO.radius + PATH_HALF_WIDTH, ...STONE_PATHS.map((p) => bruteForce(x, z, p)));
        const gravel = Math.min(...GRAVEL_PATHS.map((p) => bruteForce(x, z, p)));
        const far = distToStonePath(x, z) === 99;
        if (far) {
          // "far away" is only ever reported well clear of every path
          expect(Math.min(stone, gravel)).toBeGreaterThan(6);
          expect(distToGravelPath(x, z)).toBe(99);
        } else {
          expect(distToStonePath(x, z)).toBeCloseTo(stone, 9);
          expect(distToGravelPath(x, z)).toBeCloseTo(gravel, 9);
          expect(distToPaths(x, z)).toBeCloseTo(Math.min(stone, gravel), 9);
        }
      }
    }
  });

  it('never cross the water or the cabin', () => {
    for (const path of [...GRAVEL_PATHS, ...STONE_PATHS]) {
      for (const [x, z] of path) {
        expect(pondSDF(x, z)).toBeGreaterThan(0.7);
        expect(inCabinFootprint(x, z, 0)).toBe(false);
      }
    }
  });
});

describe('collision', () => {
  it('pushes a walker out of the pond', () => {
    const p = nearestFree(POND.cx, POND.cz, WALKER_RADIUS);
    expect(pondSDF(p.x, p.z)).toBeGreaterThan(0.3);
  });
  it('pushes a walker out of the cabin', () => {
    const p = nearestFree(CABIN.x, CABIN.z, WALKER_RADIUS);
    const [lx, lz] = [p.x - CABIN.x, p.z - CABIN.z];
    expect(Math.hypot(lx, lz)).toBeGreaterThan(2.9);
  });
  it('keeps the bridge crossable from end to end', () => {
    let x = BRIDGE.x;
    let z = BRIDGE.z0 + 0.5;
    for (let i = 0; i < 400 && z > BRIDGE.z1 - 0.5; i++) {
      const p = moveWalker(x, z, 0, -0.03, WALKER_RADIUS);
      x = p.x;
      z = p.z;
    }
    expect(z).toBeLessThanOrEqual(BRIDGE.z1 - 0.45);
    expect(Math.abs(x - BRIDGE.x)).toBeLessThan(0.5);
  });
  it('does not let a walker step off the side of the bridge', () => {
    const p = moveWalker(BRIDGE.x, bridgeMidZ, 1.5, 0, WALKER_RADIUS);
    expect(Math.abs(p.x - BRIDGE.x)).toBeLessThan(BRIDGE.halfWidth);
  });
  it('does not tunnel through the cabin on a huge step', () => {
    const [sx, sz] = cabinToWorld(0, -6);
    const [tx, tz] = cabinToWorld(0, 1);
    const p = moveWalker(sx, sz, tx - sx, tz - sz, WALKER_RADIUS);
    expect(inCabinFootprint(p.x, p.z, -0.05)).toBe(false);
    // still on the far side of the back wall
    const back = cabinToWorld(0, -CABIN.depth / 2);
    expect(Math.hypot(p.x - sx, p.z - sz)).toBeLessThan(Math.hypot(back[0] - sx, back[1] - sz) + 0.01);
  });
  it('stops at tree trunks', () => {
    const tree = SCATTER.pines[0];
    const p = resolve(tree.x + 0.05, tree.z, WALKER_RADIUS);
    expect(Math.hypot(p.x - tree.x, p.z - tree.z)).toBeGreaterThan(WALKER_RADIUS + 0.1);
  });
  it('keeps the walker inside the clearing', () => {
    const p = moveWalker(CLEARING.cx, CLEARING.cz + 28, 0, 20, WALKER_RADIUS);
    expect(Math.hypot(p.x - CLEARING.cx, p.z - CLEARING.cz)).toBeLessThanOrEqual(CLEARING.radius + 0.01);
  });
  it('the veranda is reachable up the steps and enclosed by its railing', () => {
    let [x, z] = cabinToWorld(CABIN.stepsX, CABIN.depth / 2 + CABIN.deckDepth + CABIN.stepsRun + 0.6);
    const [tx, tz] = cabinToWorld(CABIN.stepsX, CABIN.depth / 2 + 1.2);
    for (let i = 0; i < 300; i++) {
      const d = Math.hypot(tx - x, tz - z);
      if (d < 0.05) break;
      const p = moveWalker(x, z, ((tx - x) / d) * 0.03, ((tz - z) / d) * 0.03, WALKER_RADIUS);
      x = p.x;
      z = p.z;
    }
    expect(Math.hypot(tx - x, tz - z)).toBeLessThan(0.1);
    expect(surfaceAt(x, z)).toBe('veranda');
    // now try to walk straight off the front, away from the steps
    const [ox, oz] = cabinToWorld(2.5, CABIN.depth / 2 + 1.2);
    const [fx, fz] = cabinToWorld(2.5, CABIN.depth / 2 + CABIN.deckDepth + 2);
    const q = moveWalker(ox, oz, fx - ox, fz - oz, WALKER_RADIUS);
    expect(surfaceAt(q.x, q.z)).toBe('veranda');
  });
});

describe('scatter', () => {
  const solid = [
    ['pines', SCATTER.pines],
    ['smallTrees', SCATTER.smallTrees],
    ['ferns', SCATTER.ferns],
    ['hydrangeas', SCATTER.hydrangeas],
    ['bushes', SCATTER.bushes],
    ['tropicals', SCATTER.tropicals],
    ['boulders', SCATTER.boulders],
  ] as const;
  it.each(solid)('%s stay out of the water, the paths and the cabin', (_name, list) => {
    expect(list.length).toBeGreaterThan(3);
    for (const p of list) {
      expect(pondSDF(p.x, p.z)).toBeGreaterThan(0.3);
      expect(distToPaths(p.x, p.z)).toBeGreaterThan(0.75);
      expect(inCabinFootprint(p.x, p.z, 0)).toBe(false);
    }
  });
  it('lily pads float inside the pond and clear of the bridge', () => {
    expect(SCATTER.lilyPads.length).toBeGreaterThan(15);
    for (const p of SCATTER.lilyPads) {
      expect(pondSDF(p.x, p.z)).toBeLessThan(-0.4);
      expect(Math.abs(p.x - BRIDGE.x)).toBeGreaterThan(1.2);
    }
  });
  it('is deterministic and varied', () => {
    const scales = new Set(SCATTER.pines.map((p) => p.scale.toFixed(6)));
    expect(scales.size).toBeGreaterThan(SCATTER.pines.length * 0.8);
    expect(SCATTER.pines.length).toBeGreaterThanOrEqual(170);
  });
  it('spawn point and every point of interest is standable', () => {
    for (const poi of POIS) {
      const p = nearestFree(poi.x, poi.z, WALKER_RADIUS);
      expect(Math.hypot(p.x - poi.x, p.z - poi.z)).toBeLessThan(poi.radius);
    }
    expect(POIS.length).toBe(6);
  });
});
