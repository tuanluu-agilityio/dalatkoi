import { Environment } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { QualityProfile } from '../../config/quality';
import { CLEARING, SUN_DIR } from '../../world/layout';
import { SkyDome } from './SkyDome';

const SUN_COLOR = new THREE.Color('#ffd7a3');

/** Morning sun (the only shadow caster), sky fill, and image-based lighting from the sky dome. */
export function Lighting({ profile }: { profile: QualityProfile }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  const target = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const l = light.current;
    if (!l) return;
    target.position.set(CLEARING.cx + 1, 0, CLEARING.cz - 1);
    scene.add(target);
    l.target = target;
    l.position.set(target.position.x + SUN_DIR[0] * 80, SUN_DIR[1] * 80, target.position.z + SUN_DIR[2] * 80);
    const cam = l.shadow.camera;
    cam.left = -34;
    cam.right = 34;
    cam.top = 34;
    cam.bottom = -34;
    cam.near = 5;
    cam.far = 190;
    cam.updateProjectionMatrix();
    l.shadow.bias = -0.00035;
    l.shadow.normalBias = 0.045;
    l.shadow.radius = 2.2;
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  return (
    <>
      <directionalLight
        ref={light}
        color={SUN_COLOR}
        intensity={3.4}
        castShadow
        shadow-mapSize-width={profile.shadowMapSize}
        shadow-mapSize-height={profile.shadowMapSize}
      />
      <hemisphereLight args={['#c9dcec', '#55603c', 0.5]} />
      <Environment resolution={profile.reflectionSize ? 256 : 128} frames={1} environmentIntensity={0.62}>
        <SkyDome radius={50} clouds={false} />
      </Environment>
    </>
  );
}
