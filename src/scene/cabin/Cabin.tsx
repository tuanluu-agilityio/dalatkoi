import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { softSpriteCanvas } from '../../assets/procedural/canvas';
import type { QualityProfile } from '../../config/quality';
import { runtime } from '../../state/runtime';
import { CABIN } from '../../world/layout';
import { FLOOR, HD, buildBody } from './body';
import { Builder } from './builder';
import { getCabinMaterials } from './materials';
import { Roof } from './Roof';
import { CHIME, LANTERNS, buildVeranda } from './veranda';

const NO_SHADOW = new Set(['glass', 'lamp']);
const WARM = new THREE.Color('#ffb46b');

/** Five brass tubes on a ring; they swing with the shared gust signal. */
function WindChime({ materials }: { materials: Record<string, THREE.Material> }) {
  const group = useRef<THREE.Group>(null);
  const tubes = useMemo(() => [0.2, 0.24, 0.17, 0.28, 0.21], []);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = runtime.time;
    const k = 0.04 + runtime.gust * 0.16;
    g.rotation.x = Math.sin(t * 1.7) * k;
    g.rotation.z = Math.sin(t * 1.3 + 1) * k;
  });
  return (
    <group position={CHIME}>
      <group ref={group}>
        <mesh material={materials.metal} position={[0, -0.06, 0]}>
          <cylinderGeometry args={[0.004, 0.004, 0.12, 4]} />
        </mesh>
        <mesh material={materials.furniture} position={[0, -0.12, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.012, 14]} />
        </mesh>
        {tubes.map((len, i) => {
          const a = (i / tubes.length) * Math.PI * 2;
          return (
            <mesh key={i} material={materials.brass} position={[Math.cos(a) * 0.045, -0.14 - len / 2, Math.sin(a) * 0.045]} castShadow>
              <cylinderGeometry args={[0.007, 0.007, len, 6]} />
            </mesh>
          );
        })}
        <mesh material={materials.furniture} position={[0, -0.5, 0]}>
          <boxGeometry args={[0.05, 0.07, 0.004]} />
        </mesh>
      </group>
    </group>
  );
}

/** The cabin: merged static geometry, instanced roof, warm practical lights. */
export function Cabin({ profile }: { profile: QualityProfile }) {
  const materials = useMemo(() => getCabinMaterials(profile.anisotropy), [profile.anisotropy]);
  const parts = useMemo(() => {
    const b = new Builder(7);
    buildBody(b);
    buildVeranda(b);
    return b.build();
  }, []);
  const glow = useMemo(() => {
    const tex = new THREE.CanvasTexture(softSpriteCanvas(64, 2.4));
    return new THREE.SpriteMaterial({ map: tex, color: WARM, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  }, []);
  const rich = profile.shadowMapSize >= 2048;

  return (
    <group position={[CABIN.x, 0, CABIN.z]} rotation={[0, CABIN.yaw, 0]}>
      {Object.entries(parts).map(([name, geo]) => (
        <mesh key={name} geometry={geo} material={materials[name]} castShadow={!NO_SHADOW.has(name)} receiveShadow={!NO_SHADOW.has(name)} />
      ))}
      <Roof materials={materials} />
      <WindChime materials={materials} />

      {LANTERNS.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <sprite material={glow} scale={[0.9, 0.9, 0.9]} />
          {(rich || i === 0) && <pointLight color={WARM} intensity={7} distance={9} decay={1.7} />}
        </group>
      ))}
      {/* light spilling from the big front window onto the deck */}
      {rich && <pointLight color={WARM} position={[1.3, FLOOR + 1.5, HD + 0.6]} intensity={3.2} distance={5.5} decay={1.8} />}
    </group>
  );
}
