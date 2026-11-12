import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bladeTuftTexture, lilyPadTexture } from '../../assets/procedural/plantTextures';
import { SCATTER } from '../../world/scatter';
import { crossCards, foliageMaterial } from '../shared/cards';
import { Instances, trs, type InstanceSpec } from '../shared/Instances';

function padGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CircleGeometry(1, 22, 0.2, Math.PI * 2 - 0.4);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    // faintly cupped, with a wavy rim
    p.setY(i, r * r * 0.03 + (r > 0.9 ? Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 7) * 0.012 : 0));
  }
  geo.computeVertexNormals();
  return geo;
}

/** Water-lily blossom: three whorls of pointed petals around a yellow heart. */
function blossomGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, base: THREE.Color, tip: THREE.Color, length: number) => {
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      c.copy(base).lerp(tip, THREE.MathUtils.clamp(p.getY(i) / length, 0, 1));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  };
  const whorls = [
    { n: 9, len: 0.5, tilt: 1.15, base: '#f6eef0', tip: '#f3b8cc' },
    { n: 8, len: 0.42, tilt: 0.75, base: '#fbf4f2', tip: '#f6cdd8' },
    { n: 6, len: 0.32, tilt: 0.35, base: '#fffaf2', tip: '#fbe3e0' },
  ];
  whorls.forEach((w, k) => {
    for (let i = 0; i < w.n; i++) {
      const g = new THREE.PlaneGeometry(0.2, w.len, 2, 3);
      g.translate(0, w.len / 2, 0);
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const t = p.getY(v) / w.len;
        p.setX(v, p.getX(v) * Math.sin(Math.PI * (0.12 + t * 0.88)) * 1.15); // pointed tip
        p.setZ(v, Math.abs(p.getX(v)) * 0.5 - t * t * 0.06); // cupped
      }
      paint(g, new THREE.Color(w.base), new THREE.Color(w.tip), w.len);
      g.rotateX(w.tilt);
      g.rotateY((i / w.n) * Math.PI * 2 + k * 0.4);
      parts.push(g);
    }
  });
  const heart = new THREE.SphereGeometry(0.075, 10, 6);
  heart.translate(0, 0.06, 0);
  const hc = new Float32Array(heart.attributes.position.count * 3);
  for (let i = 0; i < hc.length; i += 3) hc.set([0.95, 0.72, 0.12], i);
  heart.setAttribute('color', new THREE.BufferAttribute(hc, 3));
  parts.push(heart);
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  merged.computeVertexNormals();
  return merged;
}

/** Lily pads with a few blossoms, and reed clumps at the waterline. */
export function PondPlants() {
  const pad = useMemo(() => {
    const geometry = padGeometry();
    const material = new THREE.MeshStandardMaterial({ map: lilyPadTexture(), roughness: 0.38, side: THREE.DoubleSide });
    const instances: InstanceSpec[] = SCATTER.lilyPads.map((p) => ({
      matrix: trs(p.x, p.y, p.z, (p.tint - 0.5) * 0.05, p.rot, 0, p.scale),
      color: new THREE.Color().setHSL(0.27 + p.tint * 0.05, 0.5, 0.42 + p.tint * 0.14),
    }));
    return { geometry, material, instances };
  }, []);

  const blossom = useMemo(() => {
    const geometry = blossomGeometry();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
    const instances: InstanceSpec[] = SCATTER.lilyPads.filter((p) => p.variant === 1).map((p) => ({
      matrix: trs(p.x + p.scale * 0.5, p.y + 0.02, p.z + p.scale * 0.35, 0, p.rot, 0, 0.3 + p.tint * 0.12),
    }));
    return { geometry, material, instances };
  }, []);

  const reeds = useMemo(() => {
    const geometry = crossCards(0.5, 1.05, 3, 4);
    const { material, depth } = foliageMaterial({
      map: bladeTuftTexture(3),
      wind: { strength: 0.16, flutter: 0.012, bend: 'position.y / 1.05' },
      roughness: 0.6,
    });
    const instances: InstanceSpec[] = SCATTER.reeds.map((p) => ({
      matrix: trs(p.x, p.y, p.z, (p.tint - 0.5) * 0.2, p.rot, 0, p.scale * 0.9, p.scale * (0.85 + p.tint * 0.5)),
      color: new THREE.Color().setHSL(0.24 + p.tint * 0.06, 0.4, 0.34 + p.tint * 0.16),
    }));
    return { geometry, material, depth, instances };
  }, []);

  return (
    <>
      <Instances geometry={pad.geometry} material={pad.material} instances={pad.instances} receiveShadow />
      <Instances geometry={blossom.geometry} material={blossom.material} instances={blossom.instances} castShadow />
      <Instances geometry={reeds.geometry} material={reeds.material} depthMaterial={reeds.depth} instances={reeds.instances} castShadow receiveShadow />
    </>
  );
}
