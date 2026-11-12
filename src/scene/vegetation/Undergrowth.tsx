import { useMemo } from 'react';
import * as THREE from 'three';
import { broadLeafTexture, fernFrondTexture, leafSprayTexture } from '../../assets/procedural/plantTextures';
import type { QualityProfile } from '../../config/quality';
import { FURNITURE } from '../../world/colliders';
import { CABIN, cabinToWorld } from '../../world/layout';
import { SCATTER, type Placement } from '../../world/scatter';
import { foliageMaterial } from '../shared/cards';
import { Instances, trs, type InstanceSpec } from '../shared/Instances';
import { rockGeometry, rockMaterial } from '../shared/rocks';
import { broadPlantGeometry, fernGeometry, leafMass } from './foliage';

const keep = <T,>(list: T[], density: number) => list.slice(0, Math.max(1, Math.round(list.length * density)));
const byVariant = (list: Placement[], variants: number, make: (p: Placement) => InstanceSpec): InstanceSpec[][] => {
  const out: InstanceSpec[][] = Array.from({ length: variants }, () => []);
  for (const p of list) out[p.variant % variants].push(make(p));
  return out;
};

/** Ferns, shrubs, broad-leaf plants, boulders, and the plants in the veranda pots. */
export function Undergrowth({ profile }: { profile: QualityProfile }) {
  const d = profile.vegetationDensity;

  const ferns = useMemo(() => {
    const geometries = [1, 2, 3].map((s) => fernGeometry(s));
    const mat = foliageMaterial({
      map: fernFrondTexture(2),
      wind: { strength: 0.09, flutter: 0.014, bend: 'clamp(length(position.xz) * 1.2, 0.0, 1.0)' },
      roughness: 0.6,
      translucency: 0.9,
    });
    const placed = keep(SCATTER.ferns, Math.min(1, d + 0.15));
    // the potted ferns on the veranda use the same model
    const pots: Placement[] = FURNITURE.pots.filter((_, i) => i % 2 === 0).map(([lx, lz, r], i) => {
      const [x, z] = cabinToWorld(lx, lz);
      return { x, z, y: CABIN.deckHeight + r * 1.4, scale: r * 2.1, rot: i * 1.7, variant: i % 3, tint: 0.6 };
    });
    const groups = byVariant([...placed, ...pots], 3, (p) => ({
      matrix: trs(p.x, p.y - 0.02, p.z, 0, p.rot, 0, p.scale, p.scale * (0.85 + p.tint * 0.35), p.scale),
      color: new THREE.Color().setHSL(0.27 + p.tint * 0.06, 0.42, 0.5 + p.tint * 0.22),
    }));
    return { geometries, ...mat, groups };
  }, [d]);

  const bushes = useMemo(() => {
    const geometries = [1, 2, 3].map((s) => leafMass(0.62, 34, 0.62, s, 0.78));
    const palettes: [readonly [number, number, number], readonly [number, number, number]][] = [
      [[26, 58, 26], [74, 124, 52]],
      [[36, 70, 30], [108, 150, 62]],
      [[30, 62, 36], [86, 130, 74]],
    ];
    const mats = palettes.map(([dark, light], i) =>
      foliageMaterial({
        map: leafSprayTexture(dark, light, i + 1, 52, 0.19),
        wind: { strength: 0.06, flutter: 0.02, bend: 'clamp(position.y * 1.1, 0.0, 1.0)' },
        translucency: 0.6,
      }),
    );
    const placed = keep(SCATTER.bushes, d);
    // leafy pot plants on the veranda
    const pots: Placement[] = FURNITURE.pots.filter((_, i) => i % 2 === 1).map(([lx, lz, r], i) => {
      const [x, z] = cabinToWorld(lx, lz);
      return { x, z, y: CABIN.deckHeight + r * 1.3, scale: r * 1.25, rot: i * 2.1, variant: (i + 1) % 3, tint: 0.7 };
    });
    const groups = byVariant([...placed, ...pots], 3, (p) => ({
      matrix: trs(p.x, p.y - 0.04, p.z, 0, p.rot, 0, p.scale * (1 + p.tint * 0.3), p.scale * (0.85 + p.tint * 0.3), p.scale),
      color: new THREE.Color().setHSL(0.28, 0.2, 0.62 + p.tint * 0.3),
    }));
    return { geometries, mats, groups };
  }, [d]);

  const tropicals = useMemo(() => {
    const geometries = [broadPlantGeometry(1, 9, 1.25), broadPlantGeometry(2, 7, 1.9)];
    const mat = foliageMaterial({
      map: broadLeafTexture(),
      wind: { strength: 0.12, flutter: 0.01, bend: 'clamp(length(position.xz) * 0.9 + position.y * 0.2, 0.0, 1.0)' },
      roughness: 0.45,
      translucency: 1,
    });
    const groups = byVariant(SCATTER.tropicals, 2, (p) => ({
      matrix: trs(p.x, p.y - 0.03, p.z, 0, p.rot, 0, p.scale),
      color: new THREE.Color().setHSL(0.29 + p.tint * 0.04, 0.3, 0.6 + p.tint * 0.25),
    }));
    return { geometries, ...mat, groups };
  }, []);

  const boulders = useMemo(() => {
    const geometries = [11, 12, 13].map((s) => rockGeometry(s, 3));
    const groups = byVariant(SCATTER.boulders, 3, (p) => ({
      matrix: trs(p.x, p.y - p.scale * 0.12, p.z, (p.tint - 0.5) * 0.25, p.rot, (p.tint - 0.5) * 0.2, p.scale * (1 + p.tint * 0.35), p.scale * (0.7 + p.tint * 0.4), p.scale),
      color: new THREE.Color().setScalar(0.72 + p.tint * 0.3),
    }));
    return { geometries, groups };
  }, []);
  const stone = rockMaterial(profile.anisotropy);

  return (
    <>
      {ferns.groups.map((instances, i) => (
        <Instances key={`f${i}`} geometry={ferns.geometries[i]} material={ferns.material} depthMaterial={ferns.depth} instances={instances} castShadow receiveShadow layer={1} />
      ))}
      {bushes.groups.map((instances, i) => (
        <Instances key={`b${i}`} geometry={bushes.geometries[i]} material={bushes.mats[i].material} depthMaterial={bushes.mats[i].depth} instances={instances} castShadow receiveShadow />
      ))}
      {tropicals.groups.map((instances, i) => (
        <Instances key={`t${i}`} geometry={tropicals.geometries[i]} material={tropicals.material} depthMaterial={tropicals.depth} instances={instances} castShadow receiveShadow />
      ))}
      {boulders.groups.map((instances, i) => (
        <Instances key={`r${i}`} geometry={boulders.geometries[i]} material={stone} instances={instances} castShadow receiveShadow />
      ))}
    </>
  );
}
