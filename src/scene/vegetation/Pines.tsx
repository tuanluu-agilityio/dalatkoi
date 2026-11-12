import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pineSprayTexture } from '../../assets/procedural/plantTextures';
import { getPBR } from '../../assets/textureManager';
import type { QualityProfile } from '../../config/quality';
import { createRng } from '../../world/rng';
import { SCATTER } from '../../world/scatter';
import { foliageMaterial, sphereNormals } from '../shared/cards';
import { Instances, trs, type InstanceSpec } from '../shared/Instances';
import { applyWind, windDepthMaterial, type WindOptions } from './wind';

/** Whole-tree sway: nothing at the base, most at the crown. Shared by bark and needles so they stay attached. */
const SWAY: WindOptions = { strength: 0.3, bend: 'smoothstep(2.0, 22.0, position.y)' };
const NEEDLE_SWAY: WindOptions = { ...SWAY, flutter: 0.035 };

interface PineGeometry {
  bark: THREE.BufferGeometry;
  needles: THREE.BufferGeometry;
}

/**
 * Pinus kesiya, the three-needle pine of the Lang Biang plateau: a tall bare
 * trunk, branches only in the upper part, and an open crown of drooping tufts.
 */
function buildPine(seed: number, detail: 'near' | 'far'): PineGeometry {
  const rng = createRng(seed * 7919);
  const height = rng.range(17, 23);
  const lean = rng.range(-0.5, 0.5);
  const leanDir = rng() * Math.PI * 2;
  const bark: THREE.BufferGeometry[] = [];
  const needles: THREE.BufferGeometry[] = [];

  /** Trunk axis position at height y (gentle S-bend). */
  const axis = (y: number) => {
    const t = y / height;
    const off = lean * t * t + Math.sin(t * 5 + seed) * 0.12 * t;
    return new THREE.Vector3(Math.cos(leanDir) * off, y, Math.sin(leanDir) * off);
  };

  // trunk
  const rings = detail === 'near' ? 10 : 5;
  const sides = detail === 'near' ? 9 : 6;
  const trunk = new THREE.CylinderGeometry(1, 1, height, sides, rings, true);
  trunk.translate(0, height / 2, 0);
  {
    const p = trunk.attributes.position;
    const uv = trunk.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = y / height;
      const flare = Math.exp(-y * 1.6) * 0.16;
      const r = 0.3 * (1 - t * 0.78) + flare;
      const c = axis(y);
      p.setXYZ(i, c.x + p.getX(i) * r, y, c.z + p.getZ(i) * r);
      uv.setXY(i, uv.getX(i) * 2, (y / 2.4) % 64);
    }
    trunk.computeVertexNormals();
  }
  bark.push(trunk);

  const up = new THREE.Vector3(0, 1, 0);
  const addCard = (base: THREE.Vector3, dir: THREE.Vector3, size: number, roll: number) => {
    const g = new THREE.PlaneGeometry(size, size);
    g.translate(0, size / 2, 0);
    const y = dir.clone().normalize();
    const x = new THREE.Vector3().crossVectors(y, up);
    if (x.lengthSq() < 1e-4) x.set(1, 0, 0);
    x.normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    const m = new THREE.Matrix4().makeBasis(x, y, z);
    m.multiply(new THREE.Matrix4().makeRotationY(roll));
    m.setPosition(base);
    g.applyMatrix4(m);
    needles.push(g);
  };

  // branches: longest in the middle of the crown, shorter toward the top
  const crownStart = height * rng.range(0.46, 0.58);
  const count = detail === 'near' ? 17 : 11;
  let azimuth = rng() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const y = crownStart + (height - 1.2 - crownStart) * Math.pow(t, 0.9);
    azimuth += 2.4 + rng.range(-0.4, 0.4);
    const length = (1.6 + 3.6 * Math.sin(Math.PI * (0.12 + t * 0.8))) * rng.range(0.75, 1.15);
    const rise = rng.range(0.05, 0.42) + t * 0.3;
    const dir = new THREE.Vector3(Math.cos(azimuth) * Math.cos(rise), Math.sin(rise), Math.sin(azimuth) * Math.cos(rise));
    const start = axis(y);

    if (detail === 'near') {
      const limb = new THREE.CylinderGeometry(0.018, 0.075 * (1 - t * 0.5), length, 5, 1, true);
      limb.translate(0, length / 2, 0);
      limb.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
      limb.translate(start.x, start.y, start.z);
      const uv = limb.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k), uv.getY(k) * length * 0.5);
      bark.push(limb);
    }

    // needle sprays along the outer part of the limb, fanning sideways and drooping
    const sprays = detail === 'near' ? 6 : 4;
    for (let k = 0; k < sprays; k++) {
      const f = 0.4 + (k / Math.max(1, sprays - 1)) * 0.6;
      const base = start.clone().addScaledVector(dir, length * f);
      const side = rng.range(-1.1, 1.1);
      const sprayDir = dir.clone().applyAxisAngle(up, side);
      sprayDir.y += rng.range(-0.35, 0.15);
      addCard(base, sprayDir, rng.range(1.5, 2.2) * (1 - t * 0.25), rng.range(-0.5, 0.5));
      if (detail === 'near' && k % 2 === 0) {
        // a second, more upright card gives the tuft thickness from the side
        const lift = sprayDir.clone();
        lift.y += 0.7;
        addCard(base, lift, rng.range(1.2, 1.8), Math.PI / 2 + rng.range(-0.4, 0.4));
      }
    }
  }
  // leader: a tuft crowning the tree
  const tip = axis(height - 1.0);
  for (let k = 0; k < (detail === 'near' ? 6 : 4); k++) {
    const a = (k / 6) * Math.PI * 2 + seed;
    addCard(tip, new THREE.Vector3(Math.cos(a) * 0.6, 0.9, Math.sin(a) * 0.6), rng.range(1.5, 2.1), rng.range(-0.6, 0.6));
  }

  const needleGeo = mergeGeometries(needles)!;
  sphereNormals(needleGeo, new THREE.Vector3(0, (crownStart + height) / 2, 0), 0.5);
  const barkGeo = mergeGeometries(bark.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  return { bark: barkGeo, needles: needleGeo };
}

/** The forest: near trees cast shadows and have full detail; distant ones are lighter. */
export function Pines({ profile }: { profile: QualityProfile }) {
  const assets = useMemo(() => {
    const bark = getPBR('bark', 1, 1, profile.anisotropy);
    const barkMat = applyWind(
      new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, roughnessMap: bark.roughnessMap, color: '#b9a391', roughness: 1 }),
      SWAY,
    );
    const barkDepth = windDepthMaterial(SWAY);
    const { material: needleMat, depth: needleDepth } = foliageMaterial({
      map: pineSprayTexture(1),
      wind: NEEDLE_SWAY,
      alphaTest: 0.3,
      roughness: 0.62,
      translucency: 0.7,
    });
    const near = [1, 2, 3].map((s) => buildPine(s, 'near'));
    const far = [1, 2, 3].map((s) => buildPine(s + 10, 'far'));
    return { barkMat, barkDepth, needleMat, needleDepth, near, far };
  }, [profile.anisotropy]);

  const groups = useMemo(() => {
    const total = Math.max(SCATTER.nearPineCount, Math.min(profile.pineCount, SCATTER.pines.length));
    const near: InstanceSpec[][] = [[], [], []];
    const far: InstanceSpec[][] = [[], [], []];
    for (let i = 0; i < total; i++) {
      const p = SCATTER.pines[i];
      const hue = 0.24 + p.tint * 0.07;
      const spec: InstanceSpec = {
        matrix: trs(p.x, p.y - 0.25, p.z, 0, p.rot, 0, p.scale, p.scale * (0.9 + p.tint * 0.25), p.scale),
        color: new THREE.Color().setHSL(hue, 0.22, 0.7 + p.tint * 0.22),
      };
      (i < SCATTER.nearPineCount ? near : far)[p.variant].push(spec);
    }
    return { near, far };
  }, [profile.pineCount]);

  const white = useMemo(() => new THREE.Color(1, 1, 1), []);
  const plain = (list: InstanceSpec[]) => list.map((s) => ({ matrix: s.matrix, color: white }));

  return (
    <>
      {groups.near.map((instances, i) => (
        <group key={`n${i}`}>
          <Instances geometry={assets.near[i].bark} material={assets.barkMat} depthMaterial={assets.barkDepth} instances={plain(instances)} castShadow receiveShadow />
          <Instances geometry={assets.near[i].needles} material={assets.needleMat} depthMaterial={assets.needleDepth} instances={instances} castShadow receiveShadow />
        </group>
      ))}
      {groups.far.map((instances, i) => (
        <group key={`f${i}`}>
          <Instances geometry={assets.far[i].bark} material={assets.barkMat} instances={plain(instances)} />
          <Instances geometry={assets.far[i].needles} material={assets.needleMat} instances={instances} />
        </group>
      ))}
    </>
  );
}
