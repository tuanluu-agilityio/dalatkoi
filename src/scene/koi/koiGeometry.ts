import * as THREE from 'three';

const FIN_UV: [number, number] = [0.015, 0.035];

/** Half-width of the body at t (0 = tail root, 1 = nose), for a fish of length 1. */
function halfWidth(t: number): number {
  const belly = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.85);
  const nose = t > 0.9 ? 1 - ((t - 0.9) / 0.1) ** 2 * 0.72 : 1;
  return (0.026 + 0.098 * belly) * nose;
}

/**
 * A koi of unit length, nose toward +X: lofted body, forked tail, dorsal and
 * pectoral fins. Fins sample one swatch of the skin texture.
 */
export function koiGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const RINGS = 18;
  const SIDES = 12;

  for (let i = 0; i < RINGS; i++) {
    const t = i / (RINGS - 1);
    const w = halfWidth(t);
    const h = w * (1.12 + 0.5 * (1 - t) * (1 - t));
    const lift = 0.012 * Math.sin(t * Math.PI); // slightly arched back
    for (let j = 0; j <= SIDES; j++) {
      const a = -Math.PI + (j / SIDES) * Math.PI * 2;
      pos.push(-0.5 + t, Math.cos(a) * h + lift, Math.sin(a) * w);
      uv.push(t, j / SIDES);
    }
  }
  for (let i = 0; i < RINGS - 1; i++) {
    for (let j = 0; j < SIDES; j++) {
      const a = i * (SIDES + 1) + j;
      const b = a + SIDES + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  // nose cap
  const noseIndex = pos.length / 3;
  pos.push(0.512, 0.004, 0);
  uv.push(1, 0.5);
  const last = (RINGS - 1) * (SIDES + 1);
  for (let j = 0; j < SIDES; j++) idx.push(last + j, last + j + 1, noseIndex);

  const quadGrid = (cols: number, rows: number, at: (s: number, r: number) => [number, number, number]) => {
    const start = pos.length / 3;
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        pos.push(...at(i / cols, j / rows));
        uv.push(FIN_UV[0], FIN_UV[1]);
      }
    }
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const a = start + i * (rows + 1) + j;
        const b = a + rows + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  };

  // forked tail fin
  quadGrid(4, 4, (s, r) => {
    const v = r * 2 - 1;
    const fork = 1 - 0.3 * (1 - Math.abs(v)) * s;
    return [-0.49 - 0.33 * s * fork, v * (0.04 + 0.17 * Math.pow(s, 0.8)), 0];
  });
  // dorsal fin
  quadGrid(5, 1, (s, r) => {
    const x = -0.12 + s * 0.36;
    const t = x + 0.5;
    const w = halfWidth(t);
    const back = w * (1.12 + 0.5 * (1 - t) * (1 - t)) + 0.012 * Math.sin(t * Math.PI);
    return [x - r * 0.03, back - 0.004 + r * 0.055 * Math.sin(Math.PI * (0.15 + s * 0.8)), 0];
  });
  // pectoral fins
  for (const side of [-1, 1]) {
    quadGrid(2, 2, (s, r) => {
      const w = halfWidth(0.7);
      const spread = (r - 0.5) * 0.11 * (0.3 + s);
      return [0.2 - s * 0.13 + spread * 0.5, -0.045 - s * 0.03, side * (w * 0.8 + s * 0.15) + side * spread * 0.2];
    });
  }
  // pelvic fins
  for (const side of [-1, 1]) {
    quadGrid(1, 1, (s, r) => [-0.02 - s * 0.09 + (r - 0.5) * 0.05, -0.09 - s * 0.03, side * (0.03 + s * 0.07)]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
