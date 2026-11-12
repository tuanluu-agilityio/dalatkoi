import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { leafSprayTexture } from '../../assets/procedural/plantTextures';
import { getPBR } from '../../assets/textureManager';
import type { QualityProfile } from '../../config/quality';
import { createRng } from '../../world/rng';
import { SCATTER } from '../../world/scatter';
import { foliageMaterial } from '../shared/cards';
import { Instances, trs, type InstanceSpec } from '../shared/Instances';
import { leafMass } from './foliage';
import { applyWetness } from '../weather/wetness';
import { applyWind, windDepthMaterial, type WindOptions } from './wind';

const SWAY: WindOptions = { strength: 0.1, bend: 'smoothstep(0.6, 4.5, position.y)' };
const LEAF_SWAY: WindOptions = { ...SWAY, flutter: 0.03 };

/** Small ornamental tree: a forking trunk and several canopy lobes. */
function buildTree(seed: number, height: number, spread: number): { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const rng = createRng(seed * 1237);
  const wood: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  const limb = (from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number) => {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1, true);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()));
    g.translate(from.x, from.y, from.z);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * len * 0.8);
    wood.push(g.toNonIndexed());
  };

  const fork = new THREE.Vector3(rng.range(-0.12, 0.12), height * 0.38, rng.range(-0.12, 0.12));
  limb(new THREE.Vector3(0, -0.2, 0), fork, 0.13, 0.09);
  const arms = 4;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const reach = spread * rng.range(0.45, 0.8);
    const mid = fork.clone().add(new THREE.Vector3(Math.cos(a) * reach * 0.5, height * 0.22, Math.sin(a) * reach * 0.5));
    const end = mid.clone().add(new THREE.Vector3(Math.cos(a) * reach * 0.6, height * rng.range(0.14, 0.3), Math.sin(a) * reach * 0.6));
    limb(fork, mid, 0.075, 0.05);
    limb(mid, end, 0.05, 0.02);
    for (const [at, size] of [[mid, 0.75], [end, 1]] as const) {
      const lobe = leafMass(spread * 0.4 * size, 34, spread * 0.36, seed * 10 + i + size, 0.7);
      lobe.translate(at.x, at.y - spread * 0.1, at.z);
      leaves.push(lobe);
    }
  }
  const top = leafMass(spread * 0.48, 38, spread * 0.36, seed * 10 + 9, 0.7);
  top.translate(fork.x, height * 0.72, fork.z);
  leaves.push(top);
  return { wood: mergeGeometries(wood)!, leaves: mergeGeometries(leaves)! };
}

/**
 * Three ornamentals: a red Japanese maple by the water, a green broadleaf,
 * and a mai anh đào, the pink cherry Da Lat is known for.
 */
export function SmallTrees({ profile }: { profile: QualityProfile }) {
  const assets = useMemo(() => {
    const bark = getPBR('bark', 1, 1, profile.anisotropy);
    const wood = applyWetness(
      applyWind(new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, color: '#8f7d70', roughness: 1 }), SWAY),
      { darken: 0.66, roughness: 0.45, facing: false },
    );
    const woodDepth = windDepthMaterial(SWAY);
    const kinds = [
      { geo: buildTree(1, 3.4, 2.5), tex: leafSprayTexture([86, 20, 16], [176, 58, 30], 21, 190, 0.075) },
      { geo: buildTree(2, 4.4, 2.9), tex: leafSprayTexture([24, 50, 22], [78, 112, 46], 22, 170, 0.08) },
      { geo: buildTree(3, 4.0, 3.0), tex: leafSprayTexture([196, 128, 150], [244, 208, 218], 23, 220, 0.06) },
    ].map((k) => ({ ...k, ...foliageMaterial({ map: k.tex, wind: LEAF_SWAY, translucency: 0.9, alphaTest: 0.38 }) }));
    return { wood, woodDepth, kinds };
  }, [profile.anisotropy]);

  const groups = useMemo(() => {
    const lists: InstanceSpec[][] = [[], [], []];
    for (const p of SCATTER.smallTrees) {
      lists[p.variant % 3].push({
        matrix: trs(p.x, p.y, p.z, 0, p.rot, 0, p.scale),
        color: new THREE.Color().setScalar(0.85 + p.tint * 0.2),
      });
    }
    return lists;
  }, []);

  return (
    <>
      {groups.map((instances, i) => (
        <group key={i}>
          <Instances geometry={assets.kinds[i].geo.wood} material={assets.wood} depthMaterial={assets.woodDepth} instances={instances} castShadow receiveShadow />
          <Instances geometry={assets.kinds[i].geo.leaves} material={assets.kinds[i].material} depthMaterial={assets.kinds[i].depth} instances={instances} castShadow receiveShadow />
        </group>
      ))}
    </>
  );
}
