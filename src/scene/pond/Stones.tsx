import { useMemo } from 'react';
import * as THREE from 'three';
import type { QualityProfile } from '../../config/quality';
import { SCATTER } from '../../world/scatter';
import { Instances, trs, type InstanceSpec } from '../shared/Instances';
import { flagstoneGeometry, pavingMaterial, rockGeometry, rockMaterial } from '../shared/rocks';

const tintOf = (t: number, lo = 0.72, hi = 1.08) => new THREE.Color().setScalar(lo + (hi - lo) * t);

/** Ring of mossy rocks that holds the bank, half in and half out of the water. */
export function PondRocks({ profile }: { profile: QualityProfile }) {
  const geometries = useMemo(() => [0, 1, 2].map((s) => rockGeometry(s + 1, profile.reflectionSize ? 3 : 2)), [profile.reflectionSize]);
  const material = rockMaterial(profile.anisotropy);
  const groups = useMemo(() => {
    const lists: InstanceSpec[][] = [[], [], []];
    for (const p of SCATTER.pondRocks) {
      const squash = 0.75 + p.tint * 0.5;
      lists[p.variant].push({
        matrix: trs(p.x, p.y + p.scale * 0.3, p.z, (p.tint - 0.5) * 0.3, p.rot, (p.tint - 0.5) * 0.24, p.scale * (1.1 + p.tint * 0.4), p.scale * squash, p.scale),
        color: tintOf(p.tint),
      });
    }
    return lists;
  }, []);
  return (
    <>
      {groups.map((instances, i) => (
        <Instances key={i} geometry={geometries[i]} material={material} instances={instances} castShadow receiveShadow />
      ))}
    </>
  );
}

/** Flagstones set into the gravel along the entrance path and the patio. */
export function Flagstones({ profile }: { profile: QualityProfile }) {
  const geometries = useMemo(() => [0, 1, 2, 3].map((s) => flagstoneGeometry(s + 1)), []);
  const material = pavingMaterial(profile.anisotropy);
  const groups = useMemo(() => {
    const lists: InstanceSpec[][] = [[], [], [], []];
    for (const p of SCATTER.flagstones) {
      lists[p.variant].push({
        matrix: trs(p.x, p.y + 0.012, p.z, (p.tint - 0.5) * 0.04, p.rot, 0, p.scale * (1.05 + p.tint * 0.3), 1, p.scale),
        color: tintOf(p.tint, 0.78, 1.05),
      });
    }
    return lists;
  }, []);
  return (
    <>
      {groups.map((instances, i) => (
        <Instances key={i} geometry={geometries[i]} material={material} instances={instances} receiveShadow />
      ))}
    </>
  );
}
