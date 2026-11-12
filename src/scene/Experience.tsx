import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { texturesSettled } from '../assets/textureManager';
import { QUALITY } from '../config/quality';
import { runtime } from '../state/runtime';
import { useStore } from '../state/store';
import { EYE_HEIGHT, SPAWN } from '../world/layout';
import { CameraRig } from './camera/CameraRig';
import { Cabin } from './cabin/Cabin';
import { Mountains } from './environment/Mountains';
import { Terrain } from './environment/Terrain';
import { Lighting } from './lighting/Lighting';
import { HAZE_COLOR, SkyDome } from './lighting/SkyDome';
import { WindClock } from './vegetation/wind';

/** Flags the scene as ready once textures have settled and a few frames have been drawn. */
function ReadySignal() {
  const frames = useRef(0);
  const settled = useRef(false);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    let alive = true;
    const timeout = new Promise<void>((r) => setTimeout(r, 12000));
    Promise.race([texturesSettled(), timeout]).then(() => {
      if (alive) settled.current = true;
    });
    return () => {
      alive = false;
    };
  }, []);
  useFrame(() => {
    if (!settled.current || frames.current < 0) return;
    if (++frames.current > 8) {
      frames.current = -1;
      useStore.getState().setSceneReady();
    }
  });
  return null;
}

export default function Experience() {
  const quality = useStore((s) => s.quality);
  const dprScale = useStore((s) => s.dprScale);
  const profile = QUALITY[quality];
  const dpr = Math.min(window.devicePixelRatio || 1, profile.dpr) * dprScale;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__dalat = { store: useStore, runtime };
  }, []);

  return (
    <Canvas
      key={quality}
      shadows
      dpr={dpr}
      gl={{ antialias: !profile.smaa, powerPreference: 'high-performance', stencil: false, alpha: false }}
      camera={{ fov: 55, near: 0.08, far: 1400, position: [SPAWN.x, EYE_HEIGHT, SPAWN.z] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.92;
        scene.fog = new THREE.FogExp2(HAZE_COLOR, 0.0105);
        scene.background = HAZE_COLOR;
      }}
    >
      <WindClock />
      <CameraRig />
      <Lighting profile={profile} />
      <SkyDome />
      <Suspense fallback={null}>
        <Terrain profile={profile} />
        <Mountains />
        <Cabin profile={profile} />
      </Suspense>
      <ReadySignal />
    </Canvas>
  );
}
