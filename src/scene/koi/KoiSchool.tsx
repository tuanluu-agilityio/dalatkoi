import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { KOI_VARIETIES, koiTexture } from '../../assets/procedural/koiTextures';
import type { QualityProfile } from '../../config/quality';
import { events } from '../../state/events';
import { runtime } from '../../state/runtime';
import { WATER_LEVEL } from '../../world/layout';
import { patch } from '../shaders/noise';
import { koiGeometry } from './koiGeometry';
import { KoiSim, type Fish } from './koiSim';

interface KoiUniforms {
  uPhase: { value: number };
  uAmp: { value: number };
  uBend: { value: number };
}

function koiMaterial(fish: Fish): { material: THREE.MeshStandardMaterial; uniforms: KoiUniforms } {
  const variety = KOI_VARIETIES[fish.variety % KOI_VARIETIES.length];
  const uniforms: KoiUniforms = { uPhase: { value: 0 }, uAmp: { value: 1 }, uBend: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({
    map: koiTexture(fish.variety, fish.variety * 1.7 + 0.3),
    roughness: variety.metallic ? 0.28 : 0.42,
    metalness: variety.metallic ? 0.35 : 0.05,
    envMapIntensity: 0.9,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uPhase, uAmp, uBend;');
    shader.vertexShader = patch(
      shader.vertexShader,
      '#include <begin_vertex>',
      /* glsl */ `#include <begin_vertex>
      {
        // travelling wave that grows from the shoulders to the tail tip
        float e = clamp((0.32 - position.x) / 1.14, 0.0, 1.0);
        e = e * e * (3.0 - 2.0 * e);
        float wave = sin(uPhase + position.x * 5.6) * uAmp * (0.012 + e * 0.15);
        transformed.z += wave + uBend * e * e * 0.3;
        transformed.x += abs(wave) * -0.12 * e;
      }`,
      'koi begin_vertex',
    );
  };
  material.customProgramCacheKey = () => 'koi';
  return { material, uniforms };
}

const DEEP_TINT = new THREE.Color(0.42, 0.6, 0.52);
const WHITE = new THREE.Color(1, 1, 1);

/** The koi: simulation in plain TS, one skinned-by-shader mesh per fish. */
export function KoiSchool({ profile }: { profile: QualityProfile }) {
  const { sim, group, entries } = useMemo(() => {
    const sim = new KoiSim(profile.koiCount, 2026);
    const group = new THREE.Group();
    const geometry = koiGeometry();
    const entries = sim.fish.map((fish) => {
      const { material, uniforms } = koiMaterial(fish);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.scale.set(fish.size, fish.size, fish.size * 1.05);
      group.add(mesh);
      return { fish, mesh, material, uniforms, wake: 0 };
    });
    return { sim, group, entries };
  }, [profile.koiCount]);

  useEffect(
    () => () => {
      entries.forEach((e) => {
        e.material.map?.dispose();
        e.material.dispose();
      });
      entries[0]?.mesh.geometry.dispose();
    },
    [entries],
  );

  useFrame((_, delta) => {
    const visitor = runtime.embodied ? { x: runtime.camX, z: runtime.camZ } : null;
    sim.step(delta, visitor, (f) => {
      events.emit('fishSurface', { x: f.x, z: f.z, strength: f.size });
      events.emit('ripple', { x: f.x, z: f.z, strength: 0.7 + f.size * 0.6 });
    });
    const dt = Math.min(delta, 0.05);
    for (const e of entries) {
      const f = e.fish;
      e.mesh.position.set(f.x, f.y, f.z);
      // nose-up while rising to the surface, slight bank into turns
      const pitch = f.surfacing === 1 ? 0.3 : f.surfacing === 2 ? 0.12 : 0;
      e.mesh.rotation.set(-f.turn * 0.12, -f.heading, pitch, 'YZX');
      e.uniforms.uPhase.value = f.phase;
      e.uniforms.uAmp.value = 0.55 + (f.speed / f.cruise) * 0.5;
      e.uniforms.uBend.value = -f.turn * 0.35;
      const murk = Math.min(1, (WATER_LEVEL - f.y) / 0.9);
      e.material.color.copy(WHITE).lerp(DEEP_TINT, murk);
      // a fish cruising just under the surface leaves a faint wake
      if (f.depth < 0.1 && f.surfacing === 0) {
        e.wake -= dt;
        if (e.wake <= 0) {
          events.emit('ripple', { x: f.x, z: f.z, strength: 0.3 });
          e.wake = 1.6 + (f.variety % 3) * 0.5;
        }
      }
    }
  });

  return <primitive object={group} />;
}
