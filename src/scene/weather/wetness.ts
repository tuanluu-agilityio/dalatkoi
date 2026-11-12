import * as THREE from 'three';
import { windUniforms } from '../vegetation/wind';
import { weatherUniforms } from './uniforms';

export interface WetOptions {
  /** Brightness kept when soaked (1 = no darkening). */
  darken?: number;
  /** Exponent applied to the colour when soaked: above 1 deepens and saturates it. */
  deepen?: number;
  /** Roughness a soaked surface drops to (it never gets rougher). */
  roughness?: number;
  /**
   * True for solid things: faces turned to the sky get fully wet, walls and
   * undersides less. False for leaves and other two-sided cards.
   */
  facing?: boolean;
}

/**
 * Makes a standard material respond to rain: darker, more saturated and
 * glossier as `uWet` rises, and exactly as authored when it is 0. Chains with
 * any `onBeforeCompile` already on the material. Depth materials pass through
 * untouched.
 */
export function applyWetness<T extends THREE.Material>(material: T, opts: WetOptions = {}): T {
  const darken = opts.darken ?? 0.8;
  const deepen = opts.deepen ?? 1.3;
  const roughness = opts.roughness ?? 0.3;
  const facing = opts.facing ?? true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    const at = '#include <roughnessmap_fragment>';
    if (!shader.fragmentShader.includes(at)) return;
    shader.uniforms.uWet = weatherUniforms.uWet;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet;')
      .replace(
        at,
        /* glsl */ `${at}
        {
          float wetK = uWet;
          ${
            facing
              ? /* glsl */ `#ifndef FLAT_SHADED
            vec3 wetUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
            wetK *= mix(0.5, 1.0, smoothstep(-0.25, 0.55, dot(normalize(vNormal), wetUp)));
          #endif`
              : ''
          }
          vec3 soaked = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(${deepen.toFixed(3)})) * ${darken.toFixed(3)};
          diffuseColor.rgb = mix(diffuseColor.rgb, soaked, wetK);
          roughnessFactor = mix(roughnessFactor, min(roughnessFactor, ${roughness.toFixed(3)}), wetK);
        }`,
      );
  };
  const key = `wet:${darken}:${deepen}:${roughness}:${facing}`;
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + key;
  return material;
}

/**
 * Rain on a lit window: beads that sit on the pane and a few that run down
 * it, each acting as a small lens on the warm room behind. Needs the
 * material's emissive map, whose texture coordinates span one pane.
 */
export function applyWindowRain<T extends THREE.Material>(material: T): T {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    const at = '#include <emissivemap_fragment>';
    if (!shader.fragmentShader.includes(at)) return;
    shader.uniforms.uWet = weatherUniforms.uWet;
    shader.uniforms.uTime = windUniforms.uTime;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uWet, uTime;
        float paneHash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }`,
      )
      .replace(
        at,
        /* glsl */ `${at}
        #ifdef USE_EMISSIVEMAP
        if (uWet > 0.0) {
          vec2 pane = vEmissiveMapUv * vec2(22.0, 16.0);
          // beads
          vec2 cell = floor(pane);
          vec2 inCell = fract(pane) - 0.5 - (vec2(paneHash(cell), paneHash(cell + 7.3)) - 0.5) * 0.55;
          float bead = smoothstep(0.2, 0.06, length(inCell)) * step(0.5, paneHash(cell + 3.1));
          // runs: a drop sliding down its column, leaving a short trail above it
          float column = floor(pane.x * 0.6);
          float pick = paneHash(vec2(column, 4.2));
          float along = fract(vEmissiveMapUv.y * 1.3 + uTime * (0.05 + 0.12 * pick) + pick * 9.0);
          float inColumn = abs(fract(pane.x * 0.6) - 0.5 - (pick - 0.5) * 0.5);
          float run = smoothstep(0.0, 0.02, along) * smoothstep(0.3, 0.02, along) * smoothstep(0.1, 0.02, inColumn) * step(0.55, pick);
          float water = max(bead, run) * uWet;
          totalEmissiveRadiance *= 1.0 + 0.22 * uWet + water * 0.75;
          diffuseColor.rgb += water * 0.05;
          roughnessFactor = mix(roughnessFactor, 0.35, water * 0.6);
        }
        #endif`,
      );
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + 'window-rain';
  return material;
}

/**
 * GLSL: slope contributed by raindrop rings on a water surface. Space is cut
 * into cells; in each, a drop lands at a random point, a ring spreads from it
 * and dies before it reaches the cell's edge, and then the next one lands.
 * Requires `hash21` (see shaders/noise).
 */
export const GLSL_RAIN_RINGS = /* glsl */ `
vec2 rainRings(vec2 p, float t, float density) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float h = hash21(cell + 0.37);
  float cyc = t * (0.75 + 0.6 * h) + h * 11.0;
  float k = floor(cyc);
  float age = fract(cyc);
  if (hash21(cell + k * 3.71 + 11.0) > density) return vec2(0.0);
  vec2 centre = 0.31 + 0.38 * vec2(hash21(cell + k * 17.13), hash21(cell * 1.7 + k * 5.31 + 3.1));
  vec2 d = f - centre;
  float dist = length(d) + 1e-4;
  float radius = age * 0.3;
  float q = (dist - radius) / 0.04;
  float fade = 1.0 - age;
  return (d / dist) * sin((dist - radius) * 55.0) * exp(-q * q) * fade * fade;
}
`;
