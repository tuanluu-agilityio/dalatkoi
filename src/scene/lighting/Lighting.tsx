import { Environment } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { QualityProfile } from '../../config/quality';
import { runtime } from '../../state/runtime';
import { CLEARING, SUN_DIR } from '../../world/layout';
import { SkyDome } from './SkyDome';

const SUN_COLOR = new THREE.Color('#ffd7a3');
const SUN_INTENSITY = 3.4;
const FILL_INTENSITY = 0.5;
const ENV_INTENSITY = 0.62;
const SKY_FILL = new THREE.Color('#c9dcec');
const GROUND_FILL = new THREE.Color('#55603c');
/** Under cloud: the sun is a weak, cool key and most of the light comes from the whole sky. */
const OVERCAST = {
  sun: new THREE.Color('#c3ccd6'),
  sunIntensity: 0.5,
  sky: new THREE.Color('#aebccb'),
  ground: new THREE.Color('#4c564a'),
  fill: 1.25,
  env: 0.5,
};

/** Morning sun (the only shadow caster), sky fill, and image-based lighting from the sky dome. */
export function Lighting({ profile }: { profile: QualityProfile }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.HemisphereLight>(null);
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

  // weather: blend between the morning rig and an overcast one; lightning briefly lifts the fill
  useFrame(() => {
    const l = light.current;
    const h = fill.current;
    if (!l || !h) return;
    const r = runtime.rain;
    const flash = runtime.flash;
    l.intensity = THREE.MathUtils.lerp(SUN_INTENSITY, OVERCAST.sunIntensity, r);
    l.color.copy(SUN_COLOR).lerp(OVERCAST.sun, r);
    h.intensity = THREE.MathUtils.lerp(FILL_INTENSITY, OVERCAST.fill, r) + flash * 1.5;
    h.color.copy(SKY_FILL).lerp(OVERCAST.sky, r);
    h.groundColor.copy(GROUND_FILL).lerp(OVERCAST.ground, r);
    scene.environmentIntensity = THREE.MathUtils.lerp(ENV_INTENSITY, OVERCAST.env, r) + flash * 0.4;
  });

  return (
    <>
      <directionalLight
        ref={light}
        color={SUN_COLOR}
        intensity={SUN_INTENSITY}
        castShadow
        shadow-mapSize-width={profile.shadowMapSize}
        shadow-mapSize-height={profile.shadowMapSize}
      />
      <hemisphereLight ref={fill} args={[SKY_FILL, GROUND_FILL, FILL_INTENSITY]} />
      <Environment resolution={profile.reflectionSize ? 256 : 128} frames={1} environmentIntensity={ENV_INTENSITY}>
        <SkyDome radius={50} clouds={false} weather={false} />
      </Environment>
    </>
  );
}
