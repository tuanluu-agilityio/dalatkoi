import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyWind, windDepthMaterial, type WindOptions } from '../vegetation/wind';
import { applyWetness } from '../weather/wetness';

/**
 * One textured card standing on its base (y = 0 … height), `segments` rows so
 * it can bend. `curve` leans the top forward (+Z) by that many metres.
 * Normals are tilted toward the sky so foliage shades softly from both sides.
 */
export function card(width: number, height: number, segments = 3, curve = 0, droop = 0): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, height, 1, segments);
  geo.translate(0, height / 2, 0);
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / height;
    p.setZ(i, curve * t * t);
    p.setY(i, p.getY(i) - droop * t * t * t);
    n.setXYZ(i, 0, 0.75, 0.66);
  }
  return geo;
}

/** `count` cards crossed around the vertical axis: the classic volume-from-planes plant. */
export function crossCards(width: number, height: number, count = 2, segments = 3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const g = card(width, height, segments);
    g.rotateY((i / count) * Math.PI);
    parts.push(g);
  }
  const merged = mergeGeometries(parts)!;
  softenNormals(merged, 0.8);
  return merged;
}

/** Blend every normal toward straight up; 1 = fully up. Hides the planar look of card foliage. */
export function softenNormals(geo: THREE.BufferGeometry, amount: number): void {
  const n = geo.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) {
    v.fromBufferAttribute(n, i).multiplyScalar(1 - amount);
    v.y += amount;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
}

/** Point every normal away from `centre`, as if the geometry were a rounded canopy. */
export function sphereNormals(geo: THREE.BufferGeometry, centre: THREE.Vector3, upBias = 0.35): void {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(centre).normalize();
    v.y += upBias;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
}

/** How leaves take the rain: a little darker and richer, with a wet shine. */
export const LEAF_WET = { facing: false, darken: 0.84, deepen: 1.22, roughness: 0.26 } as const;

export interface FoliageOptions {
  map: THREE.Texture;
  wind: WindOptions;
  color?: THREE.ColorRepresentation;
  alphaTest?: number;
  roughness?: number;
  /** Strength of the light that seems to pass through leaves when the sun is behind them. */
  translucency?: number;
}

/**
 * Alpha-cutout, double-sided, wind-animated leaf material plus the matching
 * depth material so shadows follow the cutout and the sway.
 */
export function foliageMaterial(opts: FoliageOptions): { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const material = new THREE.MeshStandardMaterial({
    map: opts.map,
    color: opts.color ?? '#ffffff',
    alphaTest: opts.alphaTest ?? 0.42,
    side: THREE.DoubleSide,
    roughness: opts.roughness ?? 0.72,
    metalness: 0,
  });
  const translucency = opts.translucency ?? 0.5;
  if (translucency > 0) {
    material.onBeforeCompile = (shader) => {
      // cheap back-lighting: add a little of the leaf's own colour when looking toward the sun
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        #if NUM_DIR_LIGHTS > 0
        {
          float back = pow(max(dot(normalize(vViewPosition), directionalLights[0].direction), 0.0), 3.0);
          outgoingLight += diffuseColor.rgb * directionalLights[0].color * back * ${translucency.toFixed(3)} * 0.35;
        }
        #endif
        #include <opaque_fragment>`,
      );
    };
    material.customProgramCacheKey = () => `foliage:${translucency}`;
  }
  applyWind(material, opts.wind);
  applyWetness(material, LEAF_WET);
  const depth = windDepthMaterial(opts.wind, opts.map, opts.alphaTest ?? 0.42);
  return { material, depth };
}
