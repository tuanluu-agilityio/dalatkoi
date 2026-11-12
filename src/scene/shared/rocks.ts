import * as THREE from 'three';
import { getPBR } from '../../assets/textureManager';
import { WATER_LEVEL } from '../../world/layout';
import { fbm2 } from '../../world/noise';
import { patch } from '../shaders/noise';

/** A lumpy, slightly flattened boulder of roughly unit radius. Each seed is a different stone. */
export function rockGeometry(seed: number, detail = 3): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const big = fbm2(v.x * 1.3 + seed * 11.3 + v.y * 0.7, v.z * 1.3 - seed * 5.1 + v.y * 0.9, 3);
    const small = fbm2(v.x * 4.1 + seed * 3.7, v.z * 4.1 + v.y * 3.3 + seed, 2);
    const r = 0.72 + big * 0.5 + small * 0.1;
    // flat-ish base, rounded crown
    const y = v.y * r * (v.y < 0 ? 0.45 : 0.72);
    p.setXYZ(i, v.x * r, y, v.z * r);
    uv.setXY(i, uv.getX(i) * 2.5, uv.getY(i) * 1.5);
  }
  // merged normals give a smooth, weathered look
  geo.deleteAttribute('normal');
  const merged = geo; // icosahedron vertices are unshared; smooth by position
  smoothNormals(merged);
  return merged;
}

function smoothNormals(geo: THREE.BufferGeometry): void {
  geo.computeVertexNormals();
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const sums = new Map<string, THREE.Vector3>();
  const key = (i: number) => `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    const s = sums.get(k) ?? new THREE.Vector3();
    s.add(tmp.fromBufferAttribute(n, i));
    sums.set(k, s);
  }
  for (let i = 0; i < p.count; i++) {
    const s = sums.get(key(i))!;
    tmp.copy(s).normalize();
    n.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
}

/** An irregular flat paving stone, radius ~1, lying on the ground. */
export function flagstoneGeometry(seed: number): THREE.BufferGeometry {
  const sides = 9;
  const geo = new THREE.CylinderGeometry(1, 1.04, 0.05, sides, 1);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 0.78 + 0.34 * fbm2(Math.cos(a) * 1.4 + seed * 9.1, Math.sin(a) * 1.4 + seed * 4.3, 2);
    p.setX(i, x * k);
    p.setZ(i, z * k);
    uv.setXY(i, x * k * 0.5 + 0.5 + seed * 0.37, z * k * 0.5 + 0.5 + seed * 0.61);
  }
  geo.computeVertexNormals();
  return geo;
}

let shared: THREE.MeshStandardMaterial | undefined;
let paving: THREE.MeshStandardMaterial | undefined;

function withWaterline(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWater = { value: WATER_LEVEL };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vRockY;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 rw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            rw = instanceMatrix * rw;
          #endif
          vRockY = (modelMatrix * rw).y;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vRockY;\nuniform float uWater;');
    shader.fragmentShader = patch(
      shader.fragmentShader,
      '#include <roughnessmap_fragment>',
      /* glsl */ `#include <roughnessmap_fragment>
      {
        // wet and dark at the waterline, drying upward
        float wet = 1.0 - smoothstep(uWater + 0.01, uWater + 0.17, vRockY);
        diffuseColor.rgb *= mix(1.0, 0.45, wet);
        roughnessFactor = mix(roughnessFactor, 0.25, wet);
      }`,
      'rock wetness',
    );
  };
  mat.customProgramCacheKey = () => 'rock-wet';
  return mat;
}

/** Mossy stone for boulders and pond rocks; darkens and turns glossy where it meets the water. */
export function rockMaterial(anisotropy: number): THREE.MeshStandardMaterial {
  if (!shared) {
    const pbr = getPBR('rock', 1, 1, anisotropy);
    shared = withWaterline(
      new THREE.MeshStandardMaterial({ map: pbr.map, normalMap: pbr.normalMap, roughnessMap: pbr.roughnessMap, color: '#c9c7bd', roughness: 1 }),
    );
    shared.normalScale.set(1.3, 1.3);
  }
  return shared;
}

/** Paler, drier stone for the flagstones. */
export function pavingMaterial(anisotropy: number): THREE.MeshStandardMaterial {
  if (!paving) {
    const pbr = getPBR('rock', 1, 1, anisotropy);
    paving = new THREE.MeshStandardMaterial({ normalMap: pbr.normalMap, roughnessMap: pbr.roughnessMap, color: '#8f897d', roughness: 1 });
  }
  return paving;
}
