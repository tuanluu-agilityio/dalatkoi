import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { wildflowerAtlas } from '../../assets/procedural/plantTextures';
import type { QualityProfile } from '../../config/quality';
import { SCATTER } from '../../world/scatter';
import { foliageMaterial } from '../shared/cards';
import { Instances, trs, type InstanceSpec } from '../shared/Instances';

/** One wildflower: a thin stem and a flower head tilted to the sky. `kind` picks the atlas cell. */
function flowerGeometry(kind: number): THREE.BufferGeometry {
  const u0 = (kind % 2) * 0.5;
  const v0 = 0.5 - Math.floor(kind / 2) * 0.5;
  const head = new THREE.PlaneGeometry(0.11, 0.11);
  head.rotateX(-1.05);
  head.translate(0, 1, 0);
  const huv = head.attributes.uv;
  for (let i = 0; i < huv.count; i++) huv.setXY(i, u0 + huv.getX(i) * 0.5, v0 + huv.getY(i) * 0.5);
  // the stem samples the flower's centre texel area tinted green by vertex position (see colour below)
  const stem = new THREE.PlaneGeometry(0.012, 1, 1, 2);
  stem.translate(0, 0.5, 0);
  const suv = stem.attributes.uv;
  for (let i = 0; i < suv.count; i++) suv.setXY(i, u0 + 0.25, v0 + 0.25);
  const paint = (g: THREE.BufferGeometry, r: number, gr: number, b: number) => {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([r, gr, b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  };
  paint(head, 1, 1, 1);
  paint(stem, 0.16, 0.34, 0.1);
  const merged = mergeGeometries([head, stem])!;
  const n = merged.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return merged;
}

/** Drifts of small wildflowers in the lawn. */
export function Flowers({ profile }: { profile: QualityProfile }) {
  const assets = useMemo(() => {
    const geometries = [0, 1, 2, 3].map(flowerGeometry);
    const mat = foliageMaterial({
      map: wildflowerAtlas(),
      wind: { strength: 0.1, flutter: 0.02, bend: 'position.y' },
      alphaTest: 0.5,
      translucency: 0,
    });
    mat.material.vertexColors = true;
    return { geometries, ...mat };
  }, []);

  const groups = useMemo(() => {
    const lists: InstanceSpec[][] = [[], [], [], []];
    const count = Math.round(SCATTER.flowers.length * Math.min(1, profile.vegetationDensity + 0.1));
    for (let i = 0; i < count; i++) {
      const p = SCATTER.flowers[i];
      const h = 0.14 + p.tint * 0.2;
      lists[p.variant % 4].push({ matrix: trs(p.x, p.y, p.z, 0, p.rot, 0, p.scale, h * p.scale, p.scale) });
    }
    return lists;
  }, [profile.vegetationDensity]);

  return (
    <>
      {groups.map((instances, i) => (
        <Instances key={i} geometry={assets.geometries[i]} material={assets.material} instances={instances} receiveShadow layer={1} />
      ))}
    </>
  );
}
