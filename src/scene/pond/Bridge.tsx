import { useMemo } from 'react';
import * as THREE from 'three';
import type { QualityProfile } from '../../config/quality';
import { WATER_LEVEL } from '../../world/layout';
import { BRIDGE, bridgeDeckY } from '../../world/pond';
import { Builder, place } from '../cabin/builder';
import { getCabinMaterials } from '../cabin/materials';

/** Slope of the deck at z as a rotation about X (box local +Z follows the arch). */
const tilt = (z: number) => -Math.atan2(bridgeDeckY(z + 0.05) - bridgeDeckY(z - 0.05), 0.1);

/** Arched timber footbridge: individual planks on two bent beams, posts and handrails. */
export function Bridge({ profile }: { profile: QualityProfile }) {
  const materials = getCabinMaterials(profile.anisotropy);
  const parts = useMemo(() => {
    const b = new Builder(31);
    const len = BRIDGE.z0 - BRIDGE.z1;
    const width = BRIDGE.halfWidth * 2;

    // deck planks, each a little different
    const planks = Math.round(len / 0.165);
    for (let i = 0; i < planks; i++) {
      const z = BRIDGE.z1 + ((i + 0.5) / planks) * len;
      b.box('furniture', width + 0.16 + b.rng.range(-0.03, 0.03), 0.045, len / planks - 0.012, BRIDGE.x + b.rng.range(-0.012, 0.012), bridgeDeckY(z) - 0.0225, z, {
        rot: [tilt(z), b.rng.range(-0.01, 0.01), 0],
        uv: 'member',
        tint: b.rng.range(0.62, 0.95),
      });
    }

    // segmented arch: beams, handrails, mid rails
    const SEG = 16;
    for (let i = 0; i < SEG; i++) {
      const za = BRIDGE.z1 + (i / SEG) * len;
      const zb = BRIDGE.z1 + ((i + 1) / SEG) * len;
      const z = (za + zb) / 2;
      const y = (bridgeDeckY(za) + bridgeDeckY(zb)) / 2;
      const segLen = Math.hypot(zb - za, bridgeDeckY(zb) - bridgeDeckY(za)) + 0.02;
      const rot: [number, number, number] = [tilt(z), 0, 0];
      for (const sx of [-1, 1]) {
        const x = BRIDGE.x + sx * BRIDGE.halfWidth;
        b.box('dark', 0.11, 0.18, segLen, BRIDGE.x + sx * (BRIDGE.halfWidth - 0.14), y - 0.135, z, { rot, uv: 'member' });
        b.box('trim', 0.085, 0.055, segLen, x, y + 0.93, z, { rot, uv: 'member' });
        b.box('trim', 0.04, 0.04, segLen, x, y + 0.5, z, { rot, uv: 'member', tint: 0.9 });
      }
    }

    // posts
    const posts = 7;
    for (let i = 0; i < posts; i++) {
      const z = BRIDGE.z1 + 0.12 + (i / (posts - 1)) * (len - 0.24);
      const end = i === 0 || i === posts - 1;
      for (const sx of [-1, 1]) {
        const x = BRIDGE.x + sx * BRIDGE.halfWidth;
        const h = end ? 1.12 : 0.96;
        const w = end ? 0.13 : 0.075;
        b.box('trim', w, h + 0.2, w, x, bridgeDeckY(z) + h / 2 - 0.1, z, { uv: 'member' });
        if (end) {
          b.box('dark', w + 0.05, 0.04, w + 0.05, x, bridgeDeckY(z) + h + 0.02, z, { uv: 'member' });
          b.add('dark', new THREE.SphereGeometry(0.055, 10, 8), place(x, bridgeDeckY(z) + h + 0.08, z));
        }
      }
    }

    // piles standing in the water under the arch
    for (const t of [0.3, 0.7]) {
      const z = BRIDGE.z1 + t * len;
      for (const sx of [-1, 1]) {
        const top = bridgeDeckY(z) - 0.2;
        const bottom = WATER_LEVEL - 1.1;
        b.add('dark', new THREE.CylinderGeometry(0.07, 0.08, top - bottom, 8), place(BRIDGE.x + sx * (BRIDGE.halfWidth - 0.14), (top + bottom) / 2, z), 0.8);
      }
      b.box('dark', width, 0.1, 0.1, BRIDGE.x, bridgeDeckY(z) - 0.28, z, { uv: 'member' });
    }

    // stone thresholds where the bridge meets the path
    for (const [z, s] of [[BRIDGE.z0 + 0.22, 1], [BRIDGE.z1 - 0.22, -1]] as const) {
      b.box('stone', width + 0.5, 0.14, 0.55, BRIDGE.x, 0.03, z, { tile: 1.4, rot: [s * -0.05, 0, 0], tint: 0.9 });
    }
    return b.build();
  }, []);

  return (
    <group>
      {Object.entries(parts).map(([name, geo]) => (
        <mesh key={name} geometry={geo} material={materials[name]} castShadow receiveShadow />
      ))}
    </group>
  );
}
