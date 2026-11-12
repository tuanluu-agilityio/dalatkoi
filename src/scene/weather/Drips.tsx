import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { QualityProfile } from '../../config/quality';
import { runtime } from '../../state/runtime';
import { WATER_LEVEL, cabinToWorld } from '../../world/layout';
import { pondSDF } from '../../world/pond';
import { createRng } from '../../world/rng';
import { SCATTER } from '../../world/scatter';
import { shelterAt } from '../../world/shelter';
import { walkHeight } from '../../world/terrain';
import { EAVES } from '../cabin/Roof';
import { HAZE_COLOR } from '../lighting/SkyDome';
import { weatherUniforms } from './uniforms';

const vertexShader = /* glsl */ `
  attribute vec4 aOrigin;  // xyz: where the drop lets go, w: how far it falls
  attribute vec3 aCycle;   // period (s), phase (0..1), seed
  uniform float uClock, uRate, uPixel;
  varying vec2 vUv;
  varying float vAlpha;
  float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  void main() {
    vUv = uv;
    float cyc = uClock / aCycle.x + aCycle.y;
    float t = fract(cyc) * aCycle.x;
    float fallTime = sqrt(2.0 * aOrigin.w / 9.8);
    // each cycle is a coin toss weighted by how hard the roof is running
    bool live = t < fallTime && hash11(floor(cyc) + aCycle.z * 91.0) < uRate;
    if (!live) {
      vAlpha = 0.0;
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      return;
    }
    float speed = 9.8 * t;
    float len = clamp(speed * 0.028, 0.025, 0.2);
    vec3 p = aOrigin.xyz - vec3(0.0, 4.9 * t * t, 0.0);
    vec3 toCam = cameraPosition - p;
    float dist = length(toCam);
    vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    float width = 0.011;
    float drawn = max(width, dist * uPixel * 1.15);
    vec3 world = p + vec3(0.0, uv.y * len, 0.0) + side * (uv.x - 0.5) * drawn;
    vAlpha = 0.6 * clamp(width / drawn, 0.2, 1.0) * smoothstep(0.2, 0.9, dist) * (1.0 - smoothstep(45.0, 70.0, dist));
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }`;

const fragmentShader = /* glsl */ `
  uniform vec3 uHaze;
  uniform float uFlash;
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float a = vAlpha * smoothstep(0.0, 0.7, across) * smoothstep(1.0, 0.3, vUv.y);
    gl_FragColor = vec4(uHaze * 1.35 + 0.22 + uFlash * 0.6, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Where drops let go: along the eaves of the cabin, and here and there under the trees. */
function buildOrigins(leafPoints: number): { origin: number[]; cycle: number[] } {
  const rng = createRng(3131);
  const origin: number[] = [];
  const cycle: number[] = [];
  const shelter = { roof: 0, indoors: 0 };
  const landing = (x: number, z: number) => (pondSDF(x, z) < 0 ? WATER_LEVEL : walkHeight(x, z));

  // eaves: one line of drops off the lip of every other tile, several drops in flight per line
  for (const eave of EAVES) {
    for (let lx = -eave.xHalf + 0.1; lx < eave.xHalf; lx += 0.265) {
      const [x, z] = cabinToWorld(lx + rng.range(-0.05, 0.05), eave.z + 0.03);
      const fall = eave.y - landing(x, z);
      if (fall < 0.4) continue;
      for (let k = 0; k < 3; k++) {
        origin.push(x, eave.y, z, fall);
        cycle.push(rng.range(0.55, 1.15), rng(), rng());
      }
    }
  }

  // trees: a few slow, heavy drops gathering on leaves and needles
  const trees = [
    ...SCATTER.pines.slice(0, SCATTER.nearPineCount).map((p) => ({ p, reach: 1.9, low: 2.6, high: 6.5 })),
    ...SCATTER.smallTrees.map((p) => ({ p, reach: 1.5, low: 1.7, high: 3.1 })),
  ];
  for (let i = 0; i < leafPoints && trees.length > 0; i++) {
    const t = trees[i % trees.length];
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * t.reach * t.p.scale;
    const x = t.p.x + Math.cos(a) * r;
    const z = t.p.z + Math.sin(a) * r;
    if (shelterAt(x, z, shelter).roof > 0) continue;
    const ground = landing(x, z);
    const y = Math.max(ground, t.p.y) + rng.range(t.low, t.high) * t.p.scale;
    origin.push(x, y, z, y - ground);
    cycle.push(rng.range(2.2, 6), rng(), rng());
  }
  return { origin, cycle };
}

/** Runoff clock: runs faster in heavier rain. Module level so it never steps backwards on a rebuild. */
let clock = 0;

/**
 * Water coming off things: beads dripping from the eaves of the cabin and from
 * the trees. Every drop is a fixed instance animated in the vertex shader; the
 * rain's intensity decides how many of them are running. They carry on for a
 * few seconds after the rain stops, while everything is still wet.
 */
export function Drips({ profile }: { profile: QualityProfile }) {
  const leafPoints = Math.round(260 * profile.vegetationDensity);

  const mesh = useMemo(() => {
    const { origin, cycle } = buildOrigins(leafPoints);
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    geo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(new Float32Array(origin), 4));
    geo.setAttribute('aCycle', new THREE.InstancedBufferAttribute(new Float32Array(cycle), 3));
    geo.instanceCount = origin.length / 4;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uClock: { value: 0 },
        uRate: { value: 0 },
        uPixel: { value: 0.001 },
        uHaze: { value: HAZE_COLOR },
        uFlash: weatherUniforms.uFlash,
      },
      vertexShader,
      fragmentShader,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = 8;
    m.layers.set(1);
    m.visible = false;
    return m;
  }, [leafPoints]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [mesh],
  );

  useFrame(({ camera, gl }, delta) => {
    const wet = runtime.wet;
    mesh.visible = wet > 0.02;
    if (!mesh.visible) return;
    const level = runtime.rainLevel;
    clock += Math.min(delta, 0.1) * (0.55 + 0.9 * level);
    const u = (mesh.material as THREE.ShaderMaterial).uniforms;
    u.uClock.value = clock;
    u.uRate.value = wet * THREE.MathUtils.lerp(0.3, 1, level);
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 55;
    u.uPixel.value = (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, gl.domElement.height);
  });

  return <primitive object={mesh} />;
}
