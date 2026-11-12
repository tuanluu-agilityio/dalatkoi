import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRng } from '../../world/rng';
import { card, softenNormals, sphereNormals } from '../shared/cards';

/**
 * A rounded mass of leaf cards on a squashed dome: the body of a shrub or one
 * lobe of a tree canopy. Centre of the dome base is the origin.
 */
export function leafMass(radius: number, cards: number, cardSize: number, seed: number, squash = 0.8): THREE.BufferGeometry {
  const rng = createRng(seed * 331);
  const parts: THREE.BufferGeometry[] = [];
  const look = new THREE.Matrix4();
  const origin = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < cards; i++) {
    // Fibonacci points over the upper ~80% of a sphere
    const y = 1 - (i / (cards - 1)) * 1.45;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.39996 + rng.range(-0.3, 0.3);
    const dir = new THREE.Vector3(Math.cos(a) * ring, y, Math.sin(a) * ring);
    const r = radius * rng.range(0.62, 1);
    const size = cardSize * rng.range(0.8, 1.25);
    const g = new THREE.PlaneGeometry(size, size);
    const facing = dir.clone().add(new THREE.Vector3(rng.range(-0.5, 0.5), rng.range(-0.2, 0.5), rng.range(-0.5, 0.5))).normalize();
    look.lookAt(facing, origin, up);
    g.applyMatrix4(look);
    g.rotateY(rng.range(-0.3, 0.3));
    g.translate(dir.x * r, Math.max(0.05, dir.y * r * squash + radius * squash * 0.55), dir.z * r);
    parts.push(g);
  }
  const merged = mergeGeometries(parts)!;
  sphereNormals(merged, new THREE.Vector3(0, radius * squash * 0.4, 0), 0.45);
  return merged;
}

/** A fern: fronds arching out of a central crown. */
export function fernGeometry(seed: number, fronds = 9): THREE.BufferGeometry {
  const rng = createRng(seed * 173);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < fronds; i++) {
    const length = rng.range(0.75, 1.1);
    const g = card(length * 0.36, length, 5, 0, 0);
    const p = g.attributes.position;
    // bend the frond into an arch: rises, then curls over and down
    const tilt = rng.range(0.55, 1.05);
    for (let v = 0; v < p.count; v++) {
      const t = p.getY(v) / length;
      const angle = tilt + t * t * 1.25;
      const reach = t * length;
      p.setY(v, Math.cos(angle) * reach * (1 - t * 0.12) + t * 0.12);
      p.setZ(v, Math.sin(angle) * reach);
    }
    g.rotateY((i / fronds) * Math.PI * 2 + rng.range(-0.3, 0.3));
    parts.push(g);
  }
  const merged = mergeGeometries(parts)!;
  merged.computeVertexNormals();
  softenNormals(merged, 0.7);
  return merged;
}

/** Broad tropical leaves rising from a crown and arching outward. */
export function broadPlantGeometry(seed: number, leaves: number, height: number): THREE.BufferGeometry {
  const rng = createRng(seed * 911);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < leaves; i++) {
    const length = height * rng.range(0.7, 1.1);
    const g = card(length * 0.3, length, 6, 0, 0);
    const p = g.attributes.position;
    const tilt = rng.range(0.15, 0.75);
    for (let v = 0; v < p.count; v++) {
      const t = p.getY(v) / length;
      const angle = tilt + t * t * 1.0;
      const reach = t * length;
      // fold the blade slightly along its midrib
      const fold = Math.abs(p.getX(v)) * 0.35 * (1 - t * 0.5);
      p.setY(v, Math.cos(angle) * reach + fold);
      p.setZ(v, Math.sin(angle) * reach);
    }
    g.rotateY((i / leaves) * Math.PI * 2 + rng.range(-0.35, 0.35));
    parts.push(g);
  }
  const merged = mergeGeometries(parts)!;
  merged.computeVertexNormals();
  softenNormals(merged, 0.55);
  return merged;
}
