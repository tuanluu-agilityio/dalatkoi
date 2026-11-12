import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../../state/runtime';
import { patch } from '../shaders/noise';

/** One wind field for every plant, the water, the mist and the audio. */
export const windUniforms = {
  uTime: { value: 0 },
  uGust: { value: 0.4 },
  uWindDir: { value: new THREE.Vector2(0.86, 0.5) },
};

/** Advances the shared clock and gust signal. Mount once inside the Canvas. */
export function WindClock(): null {
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = (windUniforms.uTime.value += dt);
    runtime.time = t;
    const gust = 0.42 + 0.3 * Math.sin(t * 0.13) * Math.sin(t * 0.071 + 1.3) + 0.2 * Math.sin(t * 0.31 + 0.6);
    // rain comes with wind: the same gusts, lifted, and more so the harder it rains
    const storm = runtime.rain * (0.08 + 0.3 * runtime.rainLevel);
    runtime.gust = THREE.MathUtils.clamp(gust + storm, 0.05, 1);
    windUniforms.uGust.value = runtime.gust;
  });
  return null;
}

export const GLSL_WIND = /* glsl */ `
uniform float uTime;
uniform float uGust;
uniform vec2 uWindDir;
/* Horizontal sway for a point at world position wp. "bend" is 0 at the root, 1 at the tip. */
vec3 windSway(vec3 wp, float bend, float strength, float flutter) {
  float phase = dot(wp.xz, uWindDir) * 0.35;
  float slow = sin(uTime * 0.9 + phase) * 0.6 + sin(uTime * 0.37 + phase * 0.6 + 1.7) * 0.4;
  float fast = sin(uTime * 3.7 + wp.x * 2.3 + wp.z * 1.9) * 0.5 + sin(uTime * 5.3 + wp.z * 3.1) * 0.5;
  float amp = strength * (0.35 + 0.9 * uGust);
  vec2 push = uWindDir * (slow * amp + 0.35 * amp) + vec2(fast, -fast) * flutter * (0.4 + uGust);
  float b = bend * bend;
  return vec3(push.x * b, -length(push) * b * 0.18, push.y * b);
}
`;

export interface WindOptions {
  /** Sway amplitude in metres at full bend. */
  strength: number;
  /** Small fast leaf flutter in metres. */
  flutter?: number;
  /** GLSL expression (using 'position' / 'uv') giving 0..1 bend for the vertex. */
  bend: string;
}

/**
 * Adds wind sway to a standard material's vertex shader. Works for meshes and
 * instanced meshes, and keeps shadows in sync (apply to the depth material too).
 */
export function applyWind<T extends THREE.Material>(material: T, opts: WindOptions): T {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uGust = windUniforms.uGust;
    shader.uniforms.uWindDir = windUniforms.uWindDir;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${GLSL_WIND}`);
    shader.vertexShader = patch(
      shader.vertexShader,
      '#include <project_vertex>',
      /* glsl */ `
      {
        vec4 windWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          windWorld = instanceMatrix * windWorld;
        #endif
        windWorld = modelMatrix * windWorld;
        float windBend = clamp(${opts.bend}, 0.0, 1.0);
        vec3 windOffset = windSway(windWorld.xyz, windBend, ${opts.strength.toFixed(4)}, ${(opts.flutter ?? 0).toFixed(4)});
        // offset is in world space; bring it back to the space 'transformed' lives in
        #ifdef USE_INSTANCING
          transformed += (inverse(mat3(instanceMatrix)) * inverse(mat3(modelMatrix)) * windOffset);
        #else
          transformed += inverse(mat3(modelMatrix)) * windOffset;
        #endif
      }
      #include <project_vertex>`,
      'wind project_vertex',
    );
  };
  const key = `wind:${opts.bend}:${opts.strength}:${opts.flutter ?? 0}`;
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + key;
  return material;
}

/** Depth material with the same wind (so shadows sway with the plant) and alpha test. */
export function windDepthMaterial(opts: WindOptions, map?: THREE.Texture, alphaTest = 0.5): THREE.MeshDepthMaterial {
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  if (map) {
    depth.map = map;
    depth.alphaTest = alphaTest;
  }
  return applyWind(depth, opts);
}
