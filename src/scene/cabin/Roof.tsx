import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clayTexture } from '../../assets/procedural/cabinTextures';
import { CABIN, DECK } from '../../world/layout';
import { fbm2 } from '../../world/noise';
import { createRng } from '../../world/rng';
import { HD, HW, RIDGE_Y, WALL_TOP } from './body';
import { Builder } from './builder';

const TILE_W = 0.265;
const TILE_L = 0.44;
const EXPOSE = 0.3;

interface Slope {
  zTop: number;
  yTop: number;
  zBottom: number;
  pitch: number;
  /** +1 descends toward +Z (front), −1 toward −Z (back). */
  dir: 1 | -1;
  xHalf: number;
}

const MAIN_OVERHANG_X = 0.6;
export const VERANDA_PITCH = 0.25;
const VERANDA_TOP_Y = WALL_TOP - 0.08;

const SLOPES: Slope[] = [
  { zTop: 0, yTop: RIDGE_Y, zBottom: HD + 0.16, pitch: CABIN.roofPitch, dir: 1, xHalf: HW + MAIN_OVERHANG_X },
  { zTop: 0, yTop: RIDGE_Y, zBottom: -(HD + CABIN.roofOverhang), pitch: CABIN.roofPitch, dir: -1, xHalf: HW + MAIN_OVERHANG_X },
  { zTop: HD + 0.04, yTop: VERANDA_TOP_Y, zBottom: DECK.z1 + 0.55, pitch: VERANDA_PITCH, dir: 1, xHalf: HW + 0.4 },
];

/** A single barrel tile: a shallow arch, slightly tapered. */
function tileGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(TILE_W * 1.06, 0.018, TILE_L, 6, 1, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const taper = 1 - (z / TILE_L + 0.5) * 0.06;
    p.setX(i, x * taper);
    p.setY(i, p.getY(i) + Math.cos((x / TILE_W) * Math.PI) * 0.036);
  }
  geo.computeVertexNormals();
  return geo;
}

function ridgeGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.115, 0.135, 0.44, 10, 1, true, -Math.PI / 2, Math.PI);
  geo.rotateZ(Math.PI / 2);
  return geo;
}

/** Clay-tile roof: every tile is an instance, so the eaves have a real, irregular edge. */
export function Roof({ materials }: { materials: Record<string, THREE.Material> }) {
  const tiles = useRef<THREE.InstancedMesh>(null);
  const ridge = useRef<THREE.InstancedMesh>(null);

  const { tileGeo, ridgeGeo, clay, transforms, colors, ridgeTransforms, ridgeColors, timber } = useMemo(() => {
    const rng = createRng(4411);
    const dummy = new THREE.Object3D();
    const transforms: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const base = new THREE.Color('#8e452f');
    const sooty = new THREE.Color('#5c3526');
    const mossy = new THREE.Color('#6a6a3c');
    const pale = new THREE.Color('#b2704e');

    const tint = (x: number, s: number, slope: number) => {
      const c = base.clone().lerp(pale, rng() * 0.45);
      c.lerp(sooty, Math.max(0, fbm2(x * 0.6 + slope * 9, s * 0.6, 3) - 0.42) * 1.5);
      c.lerp(mossy, Math.max(0, fbm2(x * 0.9 + 30 + slope * 5, s * 0.9 + 7, 3) - 0.6) * 2.2);
      return c.multiplyScalar(rng.range(0.8, 1.08));
    };

    SLOPES.forEach((s, si) => {
      const theta = Math.atan(s.pitch);
      const run = Math.abs(s.zBottom - s.zTop);
      const len = run / Math.cos(theta);
      const rows = Math.ceil((len - TILE_L * 0.4) / EXPOSE) + 1;
      const cols = Math.ceil((s.xHalf * 2) / TILE_W);
      for (let r = 0; r < rows; r++) {
        // distance of the tile centre from the top of the slope
        const d = len - TILE_L / 2 - r * EXPOSE + 0.04;
        if (d < TILE_L * 0.2) continue;
        const half = r % 2 ? TILE_W / 2 : 0;
        for (let c = 0; c <= cols; c++) {
          const x = -s.xHalf + c * TILE_W + half + rng.range(-0.006, 0.006);
          if (x > s.xHalf + TILE_W * 0.3) continue;
          dummy.position.set(x, s.yTop - d * Math.sin(theta) + 0.05, s.zTop + s.dir * d * Math.cos(theta));
          dummy.rotation.set(theta - 0.075 + rng.range(-0.012, 0.012), s.dir > 0 ? 0 : Math.PI, rng.range(-0.012, 0.012), 'YXZ');
          const slipped = rng() < 0.012 ? rng.range(0.02, 0.05) : 0;
          dummy.translateZ(slipped);
          dummy.updateMatrix();
          transforms.push(dummy.matrix.clone());
          colors.push(tint(x, d, si));
        }
      }
    });

    const ridgeTransforms: THREE.Matrix4[] = [];
    const ridgeColors: THREE.Color[] = [];
    const span = (HW + MAIN_OVERHANG_X) * 2;
    const n = Math.ceil(span / 0.36);
    for (let i = 0; i < n; i++) {
      dummy.position.set(-span / 2 + 0.2 + i * 0.36, RIDGE_Y + 0.045 + (i % 2) * 0.006, 0);
      dummy.rotation.set(rng.range(-0.02, 0.02), 0, 0.035);
      dummy.updateMatrix();
      ridgeTransforms.push(dummy.matrix.clone());
      ridgeColors.push(tint(i, 0, 5).multiplyScalar(0.92));
    }

    // timber under the tiles: sheathing, fascia, barge boards, rafter tails
    const b = new Builder(99);
    for (const s of SLOPES) {
      const theta = Math.atan(s.pitch);
      const run = Math.abs(s.zBottom - s.zTop);
      const len = run / Math.cos(theta);
      const midZ = (s.zTop + s.zBottom) / 2;
      const midY = s.yTop - (len / 2) * Math.sin(theta);
      const rot: [number, number, number] = [s.dir * theta, 0, 0];
      b.box('dark', s.xHalf * 2 - 0.04, 0.05, len, 0, midY - 0.02, midZ, { rot, uv: 'tile', tile: 2 });
      // fascia along the eave
      const eaveY = s.yTop - len * Math.sin(theta);
      b.box('trim', s.xHalf * 2, 0.16, 0.035, 0, eaveY - 0.08, s.zBottom, { uv: 'member', tint: 0.85 });
      // barge boards on both gable ends
      for (const sx of [-1, 1]) {
        b.box('trim', 0.04, 0.2, len + 0.06, sx * s.xHalf, midY - 0.08, midZ, { rot, uv: 'member', tint: 0.9 });
      }
      // exposed rafters
      const count = Math.round((s.xHalf * 2) / 0.62);
      for (let i = 0; i <= count; i++) {
        const x = -s.xHalf + 0.12 + (i * (s.xHalf * 2 - 0.24)) / count;
        b.box('trim', 0.07, 0.13, len, x, midY - 0.11, midZ, { rot, uv: 'member', tint: rng.range(0.75, 0.95) });
      }
    }
    return {
      tileGeo: tileGeometry(),
      ridgeGeo: ridgeGeometry(),
      clay: new THREE.MeshStandardMaterial({ map: clayTexture(), roughness: 0.84, metalness: 0, side: THREE.DoubleSide }),
      transforms,
      colors,
      ridgeTransforms,
      ridgeColors,
      timber: b.build(),
    };
  }, []);

  useLayoutEffect(() => {
    const fill = (mesh: THREE.InstancedMesh | null, ms: THREE.Matrix4[], cs: THREE.Color[]) => {
      if (!mesh) return;
      ms.forEach((m, i) => {
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, cs[i]);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    fill(tiles.current, transforms, colors);
    fill(ridge.current, ridgeTransforms, ridgeColors);
  }, [transforms, colors, ridgeTransforms, ridgeColors]);

  return (
    <group>
      <instancedMesh ref={tiles} args={[tileGeo, clay, transforms.length]} castShadow receiveShadow />
      <instancedMesh ref={ridge} args={[ridgeGeo, clay, ridgeTransforms.length]} castShadow receiveShadow />
      {Object.entries(timber).map(([name, geo]) => (
        <mesh key={name} geometry={geo} material={materials[name]} castShadow receiveShadow />
      ))}
    </group>
  );
}
