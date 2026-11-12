import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

export interface InstanceSpec {
  matrix: THREE.Matrix4;
  color?: THREE.Color;
}

interface Props {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  instances: InstanceSpec[];
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Custom depth material so alpha-tested, wind-blown foliage casts correct shadows. */
  depthMaterial?: THREE.Material;
  /** Render layer. Layer 1 is skipped by the water reflection pass. */
  layer?: number;
  frustumCulled?: boolean;
  renderOrder?: number;
}

/** Thin wrapper over InstancedMesh: fills matrices and colours once from a list. */
export function Instances({ geometry, material, instances, castShadow, receiveShadow, depthMaterial, layer = 0, frustumCulled = true, renderOrder = 0 }: Props) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    instances.forEach((inst, i) => {
      mesh.setMatrixAt(i, inst.matrix);
      if (inst.color) mesh.setColorAt(i, inst.color);
    });
    mesh.count = instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    mesh.layers.set(layer);
    if (depthMaterial) mesh.customDepthMaterial = depthMaterial;
  }, [instances, layer, depthMaterial]);
  if (instances.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, instances.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={frustumCulled}
      renderOrder={renderOrder}
    />
  );
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/** Compose a transform from position, Euler rotation (YXZ order) and scale. */
export function trs(x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
}
