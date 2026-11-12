import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { QualityProfile } from '../../config/quality';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';
import { WATER_LEVEL } from '../../world/layout';
import { pondSDF } from '../../world/pond';
import { shelterAt } from '../../world/shelter';
import { walkHeight } from '../../world/terrain';
import { HAZE_COLOR } from '../lighting/SkyDome';
import { windUniforms } from '../vegetation/wind';
import { weatherUniforms } from './uniforms';

/** Seconds a splash lasts. */
const LIFE = 0.3;
/** Splashes are spawned within this distance of the camera. */
const RADIUS = 13;

const vertexShader = /* glsl */ `
  attribute vec4 aSpawn;  // xyz: where the drop landed, w: when
  attribute float aSize;
  uniform float uTime;
  varying vec2 vUv;
  varying float vLife;
  void main() {
    vUv = uv;
    float life = (uTime - aSpawn.w) / ${LIFE.toFixed(2)};
    vLife = life;
    if (life < 0.0 || life >= 1.0) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }
    // a small crown that opens and rises, always turned to the camera
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    float w = aSize * mix(0.55, 1.5, life);
    float h = aSize * (0.5 + 1.5 * sin(life * 3.14159));
    vec3 world = aSpawn.xyz + right * (uv.x - 0.5) * 2.0 * w + vec3(0.0, uv.y * h, 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }`;

const fragmentShader = /* glsl */ `
  uniform vec3 uHaze;
  uniform float uFlash;
  varying vec2 vUv;
  varying float vLife;
  void main() {
    vec2 q = vec2((vUv.x - 0.5) * 2.0, vUv.y);
    float cup = abs(q.y - (0.12 + 0.8 * q.x * q.x));
    float a = smoothstep(0.24, 0.0, cup) * smoothstep(1.0, 0.72, abs(q.x));
    a *= (1.0 - vLife) * (1.0 - vLife) * 0.6;
    gl_FragColor = vec4(uHaze * 1.3 + 0.2 + uFlash * 0.6, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * Where raindrops land: a fixed pool of small sprites, reused as a ring. Each
 * frame a few are placed on whatever is under the sky near the visitor (lawn,
 * path, deck, bridge or pond) and the shader plays them out.
 */
export function Splashes({ profile }: { profile: QualityProfile }) {
  const isTouch = useStore((s) => s.isTouch);
  const count = Math.round(profile.rainSplashes * (isTouch ? 0.6 : 1));
  const cursor = useRef({ next: 0, owed: 0 });
  const forward = useMemo(() => new THREE.Vector3(), []);
  const shelter = useMemo(() => ({ roof: 0, indoors: 0 }), []);

  const mesh = useMemo(() => {
    const spawn = new Float32Array(count * 4);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      spawn[i * 4 + 3] = -100;
      size[i] = 0.022 + Math.random() * 0.03;
    }
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    const spawnAttr = new THREE.InstancedBufferAttribute(spawn, 4);
    spawnAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSpawn', spawnAttr);
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
    geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: windUniforms.uTime, uHaze: { value: HAZE_COLOR }, uFlash: weatherUniforms.uFlash },
      vertexShader,
      fragmentShader,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = 8;
    m.layers.set(1);
    m.visible = false;
    return m;
  }, [count]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [mesh],
  );

  useFrame(({ camera }, delta) => {
    const rain = runtime.rain;
    const c = cursor.current;
    // stay drawn until the last splashes have played out
    mesh.visible = rain > 0 || c.owed > -1;
    if (rain <= 0) {
      c.owed = Math.max(-2, c.owed - delta / LIFE);
      return;
    }
    const rate = (count / LIFE) * rain * THREE.MathUtils.lerp(0.22, 1, runtime.rainLevel);
    c.owed = Math.max(0, c.owed) + rate * Math.min(delta, 0.1);
    let n = Math.min(Math.floor(c.owed), count);
    if (n <= 0) return;
    c.owed -= n;

    const attr = mesh.geometry.getAttribute('aSpawn') as THREE.InstancedBufferAttribute;
    const data = attr.array as Float32Array;
    const now = windUniforms.uTime.value;
    camera.getWorldDirection(forward);
    const heading = Math.atan2(forward.z, forward.x);
    while (n-- > 0) {
      // mostly in front of the visitor and close, where a splash can actually be seen
      const ahead = Math.random() < 0.75;
      const a = ahead ? heading + (Math.random() - 0.5) * 2.4 : Math.random() * Math.PI * 2;
      const u = Math.random();
      const r = 0.7 + (RADIUS - 0.7) * u * u;
      const x = camera.position.x + Math.cos(a) * r;
      const z = camera.position.z + Math.sin(a) * r;
      if (shelterAt(x, z, shelter).roof > 0.5) continue;
      const y = pondSDF(x, z) < 0 ? WATER_LEVEL : walkHeight(x, z);
      const k = c.next * 4;
      data[k] = x;
      data[k + 1] = y + 0.008;
      data[k + 2] = z;
      data[k + 3] = now - Math.random() * delta;
      c.next = (c.next + 1) % count;
    }
    attr.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}
