import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { getTextureProgress, onTextureProgress, texturesSettled } from '../assets/textureManager';
import { QUALITY } from '../config/quality';
import { runtime } from '../state/runtime';
import { useStore } from '../state/store';
import { EYE_HEIGHT, SPAWN } from '../world/layout';
import { CameraRig, PoiWatcher } from './camera/CameraRig';
import { AudioSync } from './systems/AudioSync';
import { PerformanceManager } from './systems/PerformanceManager';
import { Cabin } from './cabin/Cabin';
import { KoiSchool } from './koi/KoiSchool';
import { Pond } from './pond/Pond';
import { PostFX } from './effects/PostFX';
import { Atmosphere } from './environment/Atmosphere';
import { Mountains } from './environment/Mountains';
import { Terrain } from './environment/Terrain';
import { Lighting } from './lighting/Lighting';
import { HAZE_COLOR, SkyDome } from './lighting/SkyDome';
import { Vegetation } from './vegetation/Vegetation';
import { WindClock } from './vegetation/wind';

/** Flags the scene as ready once textures have settled and a few frames have been drawn. */
function ReadySignal() {
  const frames = useRef(0);
  const settled = useRef(false);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    let alive = true;
    // the first 30% of the bar is the scene code arriving; textures fill the rest
    const report = () => {
      const p = getTextureProgress();
      useStore.getState().setLoadProgress(0.3 + 0.65 * (p.total > 0 ? p.done / p.total : 1));
    };
    report();
    const off = onTextureProgress(report);
    const timeout = new Promise<void>((r) => setTimeout(r, 12000));
    Promise.race([texturesSettled(), timeout]).then(() => {
      if (alive) settled.current = true;
    });
    return () => {
      alive = false;
      off();
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

/**
 * Reports a lost graphics context so the app can show its fallback. The listener is removed when
 * the scene unmounts: rebuilding for a new quality level deliberately releases the old context,
 * and that must not be mistaken for a failure.
 */
function ContextGuard(): null {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    let alive = true;
    const onLost = (e: Event) => {
      if (!alive || !canvas.isConnected || runtime.renderer !== gl) return;
      e.preventDefault();
      window.dispatchEvent(new Event('dalat:contextlost'));
    };
    canvas.addEventListener('webglcontextlost', onLost);
    return () => {
      alive = false;
      canvas.removeEventListener('webglcontextlost', onLost);
    };
  }, [gl]);
  return null;
}

/** The main camera also sees layer 1 (grass, flowers, mist); the water reflection camera does not. */
function ReflectionLayers(): null {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.layers.enable(1);
  }, [camera]);
  return null;
}

/** Dev-only: `?off=post,atmo,veg,koi,pond,cabin` disables systems for bisecting. */
const OFF = new Set(import.meta.env.DEV ? (new URLSearchParams(window.location.search).get('off') ?? '').split(',') : []);

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
        runtime.renderer = gl;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.92;
        scene.fog = new THREE.FogExp2(HAZE_COLOR, 0.0105);
        scene.background = HAZE_COLOR;
      }}
    >
      <WindClock />
      <CameraRig />
      <ReflectionLayers />
      <Lighting profile={profile} />
      <SkyDome />
      <Suspense fallback={null}>
        <Terrain profile={profile} />
        <Mountains />
        {!OFF.has('cabin') && <Cabin profile={profile} />}
        {!OFF.has('pond') && <Pond profile={profile} />}
        {!OFF.has('koi') && <KoiSchool profile={profile} />}
        {!OFF.has('veg') && <Vegetation profile={profile} />}
        {!OFF.has('atmo') && <Atmosphere profile={profile} />}
      </Suspense>
      {!OFF.has('post') && <PostFX profile={profile} />}
      <PoiWatcher />
      <AudioSync />
      <PerformanceManager />
      <ReadySignal />
      <ContextGuard />
    </Canvas>
  );
}
