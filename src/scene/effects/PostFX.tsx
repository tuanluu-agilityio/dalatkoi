import { useFrame } from '@react-three/fiber';
import { Bloom, DepthOfField, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import type { DepthOfFieldEffect } from 'postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useRef } from 'react';
import * as THREE from 'three';
import type { QualityProfile } from '../../config/quality';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';

/** Depth of field that follows the focus distance requested by the cinematic camera. */
function CinematicFocus() {
  const ref = useRef<DepthOfFieldEffect>(null);
  const smooth = useRef(12);
  useFrame((_, delta) => {
    const effect = ref.current;
    if (!effect) return;
    smooth.current += (runtime.focus - smooth.current) * Math.min(1, delta * 2);
    effect.cocMaterial.worldFocusDistance = smooth.current;
    effect.cocMaterial.worldFocusRange = Math.max(2.5, smooth.current * 0.9);
  });
  return <DepthOfField ref={ref} worldFocusDistance={12} worldFocusRange={10} bokehScale={2.6} resolutionScale={0.5} />;
}

/**
 * Screen-space finishing: contact shadows (AO), cinematic depth of field,
 * soft bloom on practical lights and sun glints, filmic tone mapping, vignette.
 */
export function PostFX({ profile }: { profile: QualityProfile }) {
  const cinematic = useStore((s) => s.cameraMode === 'cinematic');
  if (!profile.post) return null;
  const dof = profile.dof && cinematic;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false} frameBufferType={THREE.HalfFloatType}>
      {profile.ao ? <N8AO aoRadius={1.1} distanceFalloff={1.4} intensity={2.4} quality="performance" color="#1a2012" /> : <></>}
      {dof ? <CinematicFocus /> : <></>}
      {profile.bloom ? <Bloom mipmapBlur intensity={0.42} luminanceThreshold={0.92} luminanceSmoothing={0.25} radius={0.72} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.32} darkness={0.5} eskil={false} />
      {profile.smaa ? <SMAA /> : <></>}
    </EffectComposer>
  );
}
