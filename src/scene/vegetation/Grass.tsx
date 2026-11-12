import { useMemo } from 'react';
import * as THREE from 'three';
import type { QualityProfile } from '../../config/quality';
import { forestWeight, grassDensity } from '../../world/groundCover';
import { fbm2 } from '../../world/noise';
import { createRng } from '../../world/rng';
import { groundHeight } from '../../world/terrain';
import { patch } from '../shaders/noise';
import { GLSL_WIND, windUniforms } from './wind';

const AREA = { cx: 0, cz: 2.5, half: 24 };
const CELLS = 5;

/** A tuft: three tapered blades fanned from one root. y runs 0..1 and is scaled per instance. */
function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const ROWS = 3;
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + 0.4;
    const ox = Math.cos(a) * 0.022;
    const oz = Math.sin(a) * 0.022;
    const start = pos.length / 3;
    for (let r = 0; r <= ROWS; r++) {
      const t = r / ROWS;
      const w = 0.013 * (1 - t * 0.88);
      // blade faces outward from the tuft centre and splays as it rises
      const fx = -Math.sin(a) * w;
      const fz = Math.cos(a) * w;
      const splay = t * t * 0.3;
      pos.push(ox - fx + Math.cos(a) * splay, t, oz - fz + Math.sin(a) * splay);
      pos.push(ox + fx + Math.cos(a) * splay, t, oz + fz + Math.sin(a) * splay);
    }
    for (let r = 0; r < ROWS; r++) {
      const i = start + r * 2;
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

function grassMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      /* glsl */ `#include <common>
      attribute vec3 aOffset;
      attribute vec4 aParams; // rotation, height, width scale, tint
      varying vec3 vGrass;
      ${GLSL_WIND}`,
    );
    shader.vertexShader = patch(
      shader.vertexShader,
      '#include <beginnormal_vertex>',
      // lit like the ground it grows from, with a hint of each blade's facing
      /* glsl */ `vec3 objectNormal = normalize(vec3(sin(aParams.x) * 0.3, 1.0, cos(aParams.x) * 0.3));`,
      'grass normal',
    );
    shader.vertexShader = patch(
      shader.vertexShader,
      '#include <begin_vertex>',
      /* glsl */ `
      float gt = position.y;
      float gc = cos(aParams.x);
      float gs = sin(aParams.x);
      vec3 gp = vec3(position.x * aParams.z, gt * aParams.y, position.z * aParams.z);
      gp = vec3(gp.x * gc - gp.z * gs, gp.y, gp.x * gs + gp.z * gc);
      vec3 groot = aOffset;
      vec3 transformed = groot + gp + windSway(groot, gt, 0.04 + aParams.y * 0.3, 0.006);
      vec3 rootCol = mix(vec3(0.045, 0.1, 0.022), vec3(0.075, 0.115, 0.03), aParams.w);
      vec3 tipCol = mix(vec3(0.2, 0.36, 0.075), vec3(0.42, 0.47, 0.13), aParams.w);
      vGrass = mix(rootCol, tipCol, gt * (0.7 + 0.3 * gt));`,
      'grass begin_vertex',
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGrass;');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <color_fragment>', 'diffuseColor.rgb *= vGrass;', 'grass colour');
  };
  mat.customProgramCacheKey = () => 'grass';
  return mat;
}

/** The lawn: tens of thousands of instanced tufts, split into cells so off-screen grass is culled. */
export function Grass({ profile }: { profile: QualityProfile }) {
  const meshes = useMemo(() => {
    const rng = createRng(555);
    const base = tuftGeometry();
    const material = grassMaterial();
    const cells: { offset: number[]; params: number[] }[] = Array.from({ length: CELLS * CELLS }, () => ({ offset: [], params: [] }));
    let placed = 0;
    let guard = 0;
    const limit = profile.grassCount * 12;
    while (placed < profile.grassCount && guard++ < limit) {
      const x = AREA.cx + rng.range(-AREA.half, AREA.half);
      const z = AREA.cz + rng.range(-AREA.half, AREA.half);
      const density = grassDensity(x, z);
      if (density <= 0 || rng() > density) continue;
      const meadow = fbm2(x * 0.22 + 11, z * 0.22 - 5, 3);
      const edge = forestWeight(x, z);
      const height = (0.07 + rng() * 0.08 + Math.max(0, meadow - 0.55) * 0.32 + edge * 0.1) * (0.8 + rng() * 0.4);
      const dry = fbm2(x * 0.11 - 3, z * 0.11 + 8, 3);
      const cx = Math.min(CELLS - 1, Math.floor(((x - AREA.cx + AREA.half) / (AREA.half * 2)) * CELLS));
      const cz = Math.min(CELLS - 1, Math.floor(((z - AREA.cz + AREA.half) / (AREA.half * 2)) * CELLS));
      const cell = cells[cz * CELLS + cx];
      cell.offset.push(x, groundHeight(x, z) - 0.01, z);
      cell.params.push(rng() * Math.PI * 2, height, 0.8 + rng() * 0.6, THREE.MathUtils.clamp(dry * 1.3 - 0.25 + rng() * 0.25, 0, 1));
      placed++;
    }
    const size = (AREA.half * 2) / CELLS;
    return cells
      .map((cell, i) => {
        if (cell.offset.length === 0) return null;
        const geo = new THREE.InstancedBufferGeometry();
        geo.index = base.index;
        geo.setAttribute('position', base.attributes.position);
        geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(cell.offset), 3));
        geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(new Float32Array(cell.params), 4));
        geo.instanceCount = cell.offset.length / 3;
        const centre = new THREE.Vector3(AREA.cx - AREA.half + ((i % CELLS) + 0.5) * size, 0.2, AREA.cz - AREA.half + (Math.floor(i / CELLS) + 0.5) * size);
        geo.boundingSphere = new THREE.Sphere(centre, size * 0.75);
        const mesh = new THREE.Mesh(geo, material);
        mesh.receiveShadow = true;
        mesh.layers.set(1); // not drawn in the water reflection
        return mesh;
      })
      .filter((m) => m !== null) as THREE.Mesh[];
  }, [profile.grassCount]);

  return (
    <group>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  );
}
