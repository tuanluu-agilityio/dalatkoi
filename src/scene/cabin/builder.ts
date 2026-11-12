import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRng, type Rng } from '../../world/rng';

export type UvMode =
  /** World-scale tiling; `tile` metres per texture repeat. Board lines run along the face's horizontal axis. */
  | 'tile'
  /** As `tile`, rotated 90° so board lines run vertically. */
  | 'tileV'
  /** One board of the plank texture stretched along the part's longest axis (posts, rails, beams). */
  | 'member';

export interface BoxOptions {
  rot?: [number, number, number];
  uv?: UvMode;
  tile?: number;
  /** Brightness multiplier baked into vertex colour. */
  tint?: number;
  /** Parent transform applied after the box's own position/rotation. */
  parent?: THREE.Matrix4;
}

const BOARDS_PER_TILE = 13;
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const one = new THREE.Vector3(1, 1, 1);

/**
 * Collects many small pieces of static geometry and merges them into one
 * mesh per material, so a detailed building costs a handful of draw calls.
 */
export class Builder {
  readonly rng: Rng;
  private lists = new Map<string, THREE.BufferGeometry[]>();

  constructor(seed = 7) {
    this.rng = createRng(seed);
  }

  /** Add any geometry. It is baked with `matrix` and given a uniform vertex colour. */
  add(material: string, geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4, tint = 1): void {
    let geo = geometry.index ? geometry.toNonIndexed() : geometry;
    if (matrix) geo = geo.applyMatrix4(matrix);
    for (const name of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    }
    const count = geo.attributes.position.count;
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    const colors = new Float32Array(count * 3).fill(tint);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    let list = this.lists.get(material);
    if (!list) this.lists.set(material, (list = []));
    list.push(geo);
  }

  /** Axis-aligned box centred at (x, y, z), with texture coordinates chosen by `uv`. */
  box(material: string, w: number, h: number, d: number, x: number, y: number, z: number, opts: BoxOptions = {}): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    this.boxUv(geo, [w, h, d], opts.uv ?? 'tile', opts.tile ?? 2);
    const rot = opts.rot ?? [0, 0, 0];
    m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rot[0], rot[1], rot[2])), one);
    const matrix = opts.parent ? opts.parent.clone().multiply(m4) : m4.clone();
    const jitter = opts.tint ?? 1;
    this.add(material, geo, matrix, jitter);
  }

  private boxUv(geo: THREE.BoxGeometry, size: [number, number, number], mode: UvMode, tile: number): void {
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const ou = this.rng();
    const ov = this.rng();
    const long = size[0] >= size[1] && size[0] >= size[2] ? 0 : size[1] >= size[2] ? 1 : 2;
    const band = Math.floor(this.rng() * BOARDS_PER_TILE);
    // BoxGeometry faces: +x, −x, +y, −y, +z, −z; four vertices each
    const axes: [number, number][] = [[2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1]];
    for (let face = 0; face < 6; face++) {
      const [ua, va] = axes[face];
      for (let k = 0; k < 4; k++) {
        const i = face * 4 + k;
        const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
        if (mode === 'member') {
          const other = ua === long ? va : ua;
          const along = ua === long || va === long ? p[long] : p[ua];
          const across = (p[other] / (size[other] || 1) + 0.5) * 0.8 + 0.1;
          uv.setXY(i, along / 2 + ou, (band + across) / BOARDS_PER_TILE);
        } else if (mode === 'tileV') {
          uv.setXY(i, p[va] / tile + ou, p[ua] / tile + ov);
        } else {
          uv.setXY(i, p[ua] / tile + ou, p[va] / tile + ov);
        }
      }
    }
  }

  /** Merge everything collected so far: one geometry per material name. */
  build(): Record<string, THREE.BufferGeometry> {
    const out: Record<string, THREE.BufferGeometry> = {};
    for (const [name, list] of this.lists) {
      const merged = mergeGeometries(list, false);
      if (merged) out[name] = merged;
      list.forEach((g) => g.dispose());
    }
    return out;
  }
}

/** Convenience: translation (and optional Y rotation) matrix. */
export function place(x: number, y: number, z: number, rotY = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)),
    new THREE.Vector3(1, 1, 1),
  );
}
