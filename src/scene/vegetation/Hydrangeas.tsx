import { useMemo } from 'react';
import * as THREE from 'three';
import { hydrangeaTexture, leafSprayTexture } from '../../assets/procedural/plantTextures';
import { createRng } from '../../world/rng';
import { SCATTER } from '../../world/scatter';
import { foliageMaterial } from '../shared/cards';
import { Instances, trs, type InstanceSpec } from '../shared/Instances';
import { leafMass } from './foliage';
import { LEAF_WET } from '../shared/cards';
import { applyWetness } from '../weather/wetness';
import { applyWind, windDepthMaterial, type WindOptions } from './wind';

/** Soil chemistry decides the colour: blue and violet in acid highland soil, pink where it is limed. */
const PALETTE = [
  ['#5f7fe6', '#7f9cf0', '#4f63cf'],
  ['#8d6fd8', '#a98be6', '#6f56c0'],
  ['#e07fb0', '#ee9fc4', '#cf5f95'],
];
const YOUNG = new THREE.Color('#cfe0a8');
const HEAD_SWAY: WindOptions = { strength: 0.035, flutter: 0.006, bend: '0.8' };

/** Hydrangea shrubs: a mound of large leaves carrying round flower heads. */
export function Hydrangeas() {
  const assets = useMemo(() => {
    const leafGeo = [1, 2].map((s) => leafMass(0.5, 30, 0.5, s + 20, 0.82));
    const leaves = foliageMaterial({
      map: leafSprayTexture([28, 70, 30], [86, 140, 60], 9, 30, 0.3),
      wind: { strength: 0.05, flutter: 0.015, bend: 'clamp(position.y * 1.3, 0.0, 1.0)' },
      translucency: 0.7,
    });
    const headGeo = new THREE.IcosahedronGeometry(1, 2);
    headGeo.scale(1, 0.82, 1);
    const tex = hydrangeaTexture();
    tex.repeat.set(3, 2);
    const headMat = applyWetness(applyWind(new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 1.6, roughness: 0.75 }), HEAD_SWAY), LEAF_WET);
    const headDepth = windDepthMaterial(HEAD_SWAY);
    return { leafGeo, leaves, headGeo, headMat, headDepth };
  }, []);

  const { bushes, heads } = useMemo(() => {
    const rng = createRng(8080);
    const bushes: InstanceSpec[][] = [[], []];
    const heads: InstanceSpec[] = [];
    const c = new THREE.Color();
    for (const p of SCATTER.hydrangeas) {
      const s = p.scale;
      bushes[Math.floor(p.tint * 2) % 2].push({
        matrix: trs(p.x, p.y - 0.03, p.z, 0, p.rot, 0, s * 1.15, s, s * 1.15),
        color: new THREE.Color().setHSL(0.3, 0.18, 0.66 + p.tint * 0.24),
      });
      const count = 7 + Math.floor(p.tint * 7);
      for (let i = 0; i < count; i++) {
        // heads sit on the outside of the mound, mostly on its upper half
        const y = rng.range(0.25, 1);
        const ring = Math.sqrt(1 - y * y * 0.85);
        const a = rng() * Math.PI * 2;
        const r = 0.53 * s;
        const size = rng.range(0.1, 0.165) * s;
        const palette = PALETTE[p.variant % 3];
        c.set(rng.pick(palette));
        if (rng() < 0.12) c.lerp(YOUNG, 0.7);
        c.offsetHSL(rng.range(-0.02, 0.02), 0, rng.range(-0.05, 0.08));
        heads.push({
          matrix: trs(p.x + Math.cos(a) * ring * r * 1.1, p.y + 0.12 * s + y * r * 0.95, p.z + Math.sin(a) * ring * r * 1.1, rng.range(-0.4, 0.4), rng() * 6.28, rng.range(-0.4, 0.4), size),
          color: c.clone(),
        });
      }
    }
    return { bushes, heads };
  }, []);

  return (
    <>
      {bushes.map((instances, i) => (
        <Instances key={i} geometry={assets.leafGeo[i]} material={assets.leaves.material} depthMaterial={assets.leaves.depth} instances={instances} castShadow receiveShadow />
      ))}
      <Instances geometry={assets.headGeo} material={assets.headMat} depthMaterial={assets.headDepth} instances={heads} castShadow receiveShadow />
    </>
  );
}
