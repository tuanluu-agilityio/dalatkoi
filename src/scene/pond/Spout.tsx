import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { events } from '../../state/events';
import { WATER_LEVEL } from '../../world/layout';
import { SPOUT } from '../../world/pois';
import { pondNormal } from '../../world/pond';
import { GLSL_NOISE } from '../shaders/noise';
import { windUniforms } from '../vegetation/wind';

const [NX, NZ] = pondNormal(SPOUT[0], SPOUT[1]);
/** Unit vector pointing from the bank into the pond. */
const IN: [number, number] = [-NX, -NZ];
const PIPE_LEN = 1.5;
const PIPE_DROP = 0.2;
const MOUTH_H = 0.5;
/** Where the pipe ends, and where its water lands. */
const MOUTH = new THREE.Vector3(SPOUT[0] + IN[0] * 0.95, WATER_LEVEL + MOUTH_H, SPOUT[1] + IN[1] * 0.95);
export const SPOUT_LANDING = new THREE.Vector3(MOUTH.x + IN[0] * 0.2, WATER_LEVEL, MOUTH.z + IN[1] * 0.2);

function bamboo(length: number, radius: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(radius, radius * 1.06, length, 10, 1, true)];
  const nodes = Math.max(2, Math.round(length / 0.3));
  for (let i = 0; i <= nodes; i++) {
    const ring = new THREE.CylinderGeometry(radius * 1.12, radius * 1.12, 0.012, 10);
    ring.translate(0, -length / 2 + (i / nodes) * length, 0);
    parts.push(ring);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}

/** Split-bamboo spout (kakei) feeding the pond: the source of the trickling sound. */
export function Spout() {
  const stream = useRef<THREE.Mesh>(null);
  const timer = useRef(0);

  const { pipe, pipeMatrix, posts, bambooMat, streamGeo, streamMat } = useMemo(() => {
    const yaw = Math.atan2(-IN[1], IN[0]); // rotate +X onto the inward direction
    const pipe = bamboo(PIPE_LEN, 0.045);
    pipe.rotateZ(Math.PI / 2 - Math.atan2(PIPE_DROP, PIPE_LEN));
    const centre = new THREE.Vector3(MOUTH.x - IN[0] * (PIPE_LEN / 2), MOUTH.y + PIPE_DROP / 2 + 0.02, MOUTH.z - IN[1] * (PIPE_LEN / 2));
    const pipeMatrix = new THREE.Matrix4().compose(centre, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));

    // two crossed supports under the pipe
    const posts: THREE.Matrix4[] = [];
    for (const back of [0.35, 1.15]) {
      const base = new THREE.Vector3(MOUTH.x - IN[0] * back, 0, MOUTH.z - IN[1] * back);
      const y = MOUTH.y + (PIPE_DROP * back) / PIPE_LEN - 0.08;
      for (const side of [-1, 1]) {
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(base.x, (y + WATER_LEVEL - 0.25) / 2 + 0.1, base.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(side * 0.28 * IN[0], yaw, side * 0.28, 'YXZ')),
          new THREE.Vector3(1, 1, 1),
        );
        posts.push(m);
      }
    }

    const bambooMat = new THREE.MeshStandardMaterial({ color: '#a3a45c', roughness: 0.42, side: THREE.DoubleSide });

    // falling water: a thin ribbon along a ballistic arc
    const curve = new THREE.QuadraticBezierCurve3(
      MOUTH.clone().add(new THREE.Vector3(0, -0.02, 0)),
      MOUTH.clone().add(new THREE.Vector3(IN[0] * 0.16, -0.02, IN[1] * 0.16)),
      SPOUT_LANDING.clone(),
    );
    const streamGeo = new THREE.TubeGeometry(curve, 14, 0.016, 6, false);
    const streamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: windUniforms.uTime },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv;
        ${GLSL_NOISE}
        void main(){
          float n = vnoise(vec2(vUv.y * 9.0, vUv.x * 14.0 - uTime * 7.0));
          float a = 0.35 + 0.45 * n;
          gl_FragColor = vec4(vec3(0.86, 0.93, 0.95) * (0.8 + 0.5 * n), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { pipe, pipeMatrix, posts, bambooMat, streamGeo, streamMat };
  }, []);

  const postGeo = useMemo(() => bamboo(0.9, 0.028), []);

  useFrame((_, delta) => {
    timer.current -= delta;
    if (timer.current <= 0) {
      timer.current = 0.55 + Math.random() * 0.25;
      events.emit('ripple', { x: SPOUT_LANDING.x, z: SPOUT_LANDING.z, strength: 0.55 });
    }
  });

  return (
    <group>
      <mesh geometry={pipe} material={bambooMat} matrix={pipeMatrix} matrixAutoUpdate={false} castShadow />
      {posts.map((m, i) => (
        <mesh key={i} geometry={postGeo} material={bambooMat} matrix={m} matrixAutoUpdate={false} castShadow />
      ))}
      <mesh ref={stream} geometry={streamGeo} material={streamMat} renderOrder={3} />
    </group>
  );
}
