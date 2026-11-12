import { useMemo } from 'react';
import * as THREE from 'three';
import { getPBR } from '../../assets/textureManager';
import { makeCanvas, pixelFill } from '../../assets/procedural/canvas';
import type { QualityProfile } from '../../config/quality';
import { MASK, forestWeight, pathWeight } from '../../world/groundCover';
import { CLEARING, WATER_LEVEL } from '../../world/layout';
import { fbm2 } from '../../world/noise';
import { groundHeight } from '../../world/terrain';
import { GLSL_NOISE, patch } from '../shaders/noise';
import { windUniforms } from '../vegetation/wind';
import { weatherUniforms } from '../weather/uniforms';
import { GLSL_RAIN_RINGS } from '../weather/wetness';

/** Grid spacing is ~0.23 m in the clearing and grows toward the horizon. */
const warp = (t: number) => Math.sign(t) * (34 * Math.abs(t) + 104 * Math.abs(t) ** 3);

function buildGeometry(segments: number): THREE.BufferGeometry {
  const n = segments + 1;
  const pos = new Float32Array(n * n * 3);
  const uv = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = CLEARING.cx + warp((i / segments) * 2 - 1);
      const z = CLEARING.cz + warp((j / segments) * 2 - 1);
      const k = j * n + i;
      pos[k * 3] = x;
      pos[k * 3 + 1] = groundHeight(x, z);
      pos[k * 3 + 2] = z;
      uv[k * 2] = x * 0.31;
      uv[k * 2 + 1] = z * 0.31;
    }
  }
  const index = new Uint32Array(segments * segments * 6);
  let p = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      index[p++] = a;
      index[p++] = c;
      index[p++] = b;
      index[p++] = b;
      index[p++] = c;
      index[p++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  return geo;
}

/** R = path gravel, G = forest floor, B = slow lawn colour variation. */
function buildMask(size: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(size);
  pixelFill(ctx, (u, v) => {
    const x = MASK.cx + (u - 0.5) * MASK.size;
    const z = MASK.cz + (v - 0.5) * MASK.size;
    return [pathWeight(x, z) * 255, forestWeight(x, z) * 255, fbm2(x * 0.09 + 5, z * 0.09 - 3, 3) * 255];
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function Terrain({ profile }: { profile: QualityProfile }) {
  const geometry = useMemo(() => buildGeometry(profile.terrainSegments), [profile.terrainSegments]);

  const material = useMemo(() => {
    const a = profile.anisotropy;
    const grass = getPBR('grass', 1, 1, a);
    const forest = getPBR('forest', 1, 1, a);
    const gravel = getPBR('gravel', 1, 1, a);
    const pebbles = getPBR('pebbles', 1, 1, a);
    const mask = buildMask(profile.terrainSegments >= 220 ? 768 : 512);

    const mat = new THREE.MeshStandardMaterial({ map: grass.map, normalMap: grass.normalMap, roughness: 0.95, metalness: 0 });
    mat.normalScale.set(0.9, 0.9);
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uMask: { value: mask },
        uMaskRect: { value: new THREE.Vector3(MASK.cx, MASK.cz, MASK.size) },
        uForest: { value: forest.map },
        uForestN: { value: forest.normalMap },
        uGravel: { value: gravel.map },
        uGravelN: { value: gravel.normalMap },
        uPebbles: { value: pebbles.map },
        uPebblesN: { value: pebbles.normalMap },
        uWater: { value: WATER_LEVEL },
        uTime: windUniforms.uTime,
        uWet: weatherUniforms.uWet,
        uRain: weatherUniforms.uRain,
        uRainLevel: weatherUniforms.uRainLevel,
      });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');

      const header = /* glsl */ `
        varying vec3 vTerrainPos;
        uniform sampler2D uMask, uForest, uForestN, uGravel, uGravelN, uPebbles, uPebblesN;
        uniform vec3 uMaskRect;
        uniform float uWater, uTime, uWet, uRain, uRainLevel;
        float twForest, twPath, twUnder, twPuddle;
        ${GLSL_NOISE}
        ${GLSL_RAIN_RINGS}
        float caustics(vec2 p, float t) {
          vec2 q = p + 0.35 * vec2(sin(p.y * 1.7 + t * 0.9), cos(p.x * 1.9 - t * 0.8));
          float a = sin(q.x * 3.1 + t) + sin(q.y * 2.7 - t * 1.1) + sin((q.x + q.y) * 2.2 + t * 0.7);
          return pow(smoothstep(1.1, 2.9, abs(a)), 2.0);
        }
        vec4 terrainNormalTexel() {
          vec2 wp = vTerrainPos.xz;
          vec4 n = texture2D(normalMap, wp * 0.31);
          n = mix(n, texture2D(uForestN, wp * 0.21), twForest);
          n = mix(n, texture2D(uGravelN, wp * 0.47), twPath);
          n = mix(n, texture2D(uPebblesN, wp * 0.55), twUnder);
          // standing water lies flat, and the rain rings it
          n = mix(n, vec4(0.5, 0.5, 1.0, 1.0), twPuddle);
          if (twPuddle > 0.01) n.xy += rainRings(wp * 3.1, uTime * 1.4, uRain * mix(0.4, 1.0, uRainLevel)) * 0.1 * twPuddle;
          return n;
        }`;
      let fs = shader.fragmentShader.replace('#include <normalmap_pars_fragment>', `#include <normalmap_pars_fragment>\n${header}`);
      fs = patch(
        fs,
        '#include <map_fragment>',
        /* glsl */ `
        {
          vec2 wp = vTerrainPos.xz;
          vec2 muv = (wp - uMaskRect.xy) / uMaskRect.z + 0.5;
          vec4 mask = texture2D(uMask, clamp(muv, 0.0, 1.0));
          float inside = step(abs(muv.x - 0.5), 0.5) * step(abs(muv.y - 0.5), 0.5);
          twForest = mix(1.0, mask.g, inside);
          twPath = mask.r * inside;
          twUnder = smoothstep(uWater + 0.03, uWater - 0.09, vTerrainPos.y);

          vec3 gA = texture2D(map, wp * 0.31).rgb;
          vec3 gB = texture2D(map, wp * 0.067 + 3.7).rgb;
          vec3 grassCol = mix(gA, gB, 0.45) * mix(vec3(0.5, 0.86, 0.36), vec3(0.72, 0.92, 0.42), mask.b);
          vec3 forestCol = mix(texture2D(uForest, wp * 0.21).rgb, texture2D(uForest, wp * 0.053 + 1.3).rgb, 0.5) * vec3(0.6, 0.6, 0.5);
          forestCol = mix(forestCol, grassCol * 0.55, smoothstep(0.3, 0.62, gB.g) * 0.8);
          vec3 gravelCol = texture2D(uGravel, wp * 0.47).rgb * vec3(1.0, 0.96, 0.9);
          vec3 pebbleCol = texture2D(uPebbles, wp * 0.55).rgb;

          vec3 col = mix(grassCol, forestCol, twForest);
          col = mix(col, gravelCol, twPath);
          float depth = max(uWater - vTerrainPos.y, 0.0);
          vec3 bed = pebbleCol * mix(vec3(0.74, 0.8, 0.66), vec3(0.2, 0.3, 0.24), smoothstep(0.0, 1.1, depth));
          bed += vec3(0.9, 1.0, 0.8) * caustics(wp * 1.6, uTime * 0.8) * 0.07 * (1.0 - smoothstep(0.0, 1.3, depth) * 0.7);
          // damp, darker soil right at the waterline
          col *= mix(1.0, 0.62, smoothstep(uWater + 0.16, uWater + 0.02, vTerrainPos.y));
          col = mix(col, bed, twUnder);
          // rain: soaked ground deepens in colour, and puddles spread from the low spots of the paths
          float land = 1.0 - twUnder;
          col = mix(col, pow(col, vec3(1.3)) * 0.82, uWet * land);
          float grow = mix(0.82, 0.55, uWet);
          twPuddle = smoothstep(grow, grow + 0.1, fbm(wp * 0.6 + 7.3)) * mix(0.1, 1.0, twPath) * (1.0 - twForest) * land * smoothstep(0.0, 0.5, uWet);
          col = mix(col, col * 0.38, twPuddle);
          diffuseColor.rgb *= col;
        }`,
        'terrain map_fragment',
      );
      fs = patch(
        fs,
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(0.9, 0.97, twForest), 0.86, twPath);
        roughnessFactor = mix(roughnessFactor, 0.5, twUnder);
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.6, uWet * (1.0 - twUnder));
        roughnessFactor = mix(roughnessFactor, 0.05, twPuddle);`,
        'terrain roughness',
      );
      fs = patch(
        fs,
        '#include <normal_fragment_maps>',
        patch(
          THREE.ShaderChunk.normal_fragment_maps,
          'texture2D( normalMap, vNormalMapUv )',
          'terrainNormalTexel()',
          'terrain normal texel',
        ),
        'terrain normal_fragment_maps',
      );
      shader.fragmentShader = fs;
    };
    return mat;
  }, [profile.anisotropy, profile.terrainSegments]);

  return <mesh geometry={geometry} material={material} receiveShadow />;
}
