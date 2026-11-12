import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../../state/runtime';
import { EYE_HEIGHT, SPAWN } from '../../world/layout';

const look = new THREE.Vector3();

/** Placeholder rig (replaced in Task 9): spawn view, or the debug pose when set. */
export function CameraRig(): null {
  useFrame(({ camera }) => {
    const p = runtime.debugPose;
    if (p) {
      camera.position.set(p[0], p[1], p[2]);
      camera.lookAt(look.set(p[3], p[4], p[5]));
      const cam = camera as THREE.PerspectiveCamera;
      if (p[6] && cam.fov !== p[6]) {
        cam.fov = p[6];
        cam.updateProjectionMatrix();
      }
    } else {
      camera.position.set(SPAWN.x, EYE_HEIGHT, SPAWN.z);
      camera.lookAt(look.set(SPAWN.lookX, 1.4, SPAWN.lookZ));
    }
    runtime.camX = camera.position.x;
    runtime.camY = camera.position.y;
    runtime.camZ = camera.position.z;
  }, -1);
  return null;
}
