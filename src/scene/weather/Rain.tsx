import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { QualityProfile } from '../../config/quality';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';
import { CABIN } from '../../world/layout';
import { createRng } from '../../world/rng';
import { ROOF_SLOPES } from '../cabin/Roof';
import { HAZE_COLOR } from '../lighting/SkyDome';
import { windUniforms } from '../vegetation/wind';
import { weatherUniforms } from './uniforms';

/** The volume of rain that follows the camera, in metres. Far streaks use a box three times as wide. */
const BOX = new THREE.Vector3(34, 24, 34);
/** Drops fall at one of five speeds (6/8 … 10/8 of the base), so the offsets below can wrap exactly. */
const WRAP = 24;
const FAR_SHARE = 0.22;

const f = (n: number) => n.toFixed(4);
const [MAIN_FRONT, MAIN_BACK, VERANDA] = ROOF_SLOPES;

const vertexShader = /* glsl */ `
  attribute vec4 aSeed;   // xyz: place in the box, w: per-drop variation
  attribute float aKind;  // 0 near, 1 far
  uniform vec3 uBox, uVel;
  uniform vec2 uDrift;
  uniform vec4 uCabin;    // x, z, cos(yaw), sin(yaw)
  uniform float uFall, uRain, uRainLevel, uPixel;
  varying vec2 vUv;
  varying float vAlpha;

  /* Height of the cabin's roofs above a point given in the cabin's own frame; far below ground elsewhere. */
  float roofHeight(vec2 l) {
    float h = -100.0;
    if (abs(l.x) < ${f(MAIN_FRONT.xHalf)} && l.y > ${f(MAIN_BACK.zBottom)} && l.y < ${f(MAIN_FRONT.zBottom)})
      h = ${f(MAIN_FRONT.yTop)} - abs(l.y) * ${f(MAIN_FRONT.pitch)};
    if (abs(l.x) < ${f(VERANDA.xHalf)} && l.y >= ${f(VERANDA.zTop)} && l.y < ${f(VERANDA.zBottom)})
      h = max(h, ${f(VERANDA.yTop)} - (l.y - ${f(VERANDA.zTop)}) * ${f(VERANDA.pitch)});
    return h;
  }

  void main() {
    vUv = uv;
    vec3 box = uBox * mix(vec3(1.0), vec3(3.0, 1.5, 3.0), aKind);
    float mult = (6.0 + floor(aSeed.w * 4.999)) / 8.0;
    vec3 p = aSeed.xyz * box;
    p.y -= uFall * mult;
    p.xz += uDrift * mult;
    // wrap around the camera, with more of the box above the eye than below
    vec3 centre = cameraPosition + vec3(0.0, uBox.y * 0.2, 0.0);
    vec3 rel = mod(p - centre, box) - 0.5 * box;
    p = centre + rel;

    vec3 dir = normalize(uVel);
    float len = mix(0.2, 0.58, uRainLevel) * (0.7 + 0.6 * fract(aSeed.w * 7.31)) * mix(1.0, 2.4, aKind);
    vec3 toCam = cameraPosition - p;
    float dist = length(toCam);
    vec3 side = normalize(cross(dir, toCam));
    // never thinner than a pixel: a far streak keeps its width and loses opacity instead
    float width = mix(0.0035, 0.0085, fract(aSeed.w * 3.17)) * mix(1.0, 3.0, aKind);
    float drawn = max(width, dist * uPixel * 1.15);
    vec3 world = p - dir * uv.y * len + side * (uv.x - 0.5) * drawn;

    float a = uRain * mix(0.28, 0.58, uRainLevel) * clamp(width / drawn, 0.28, 1.0);
    a *= smoothstep(0.25, 1.3, dist);
    a *= 1.0 - smoothstep(0.38, 0.5, max(abs(rel.x), abs(rel.z)) / box.x);
    a *= smoothstep(-0.5, -0.4, rel.y / box.y);
    a *= mix(1.0, 0.55, aKind);

    vec2 d = p.xz - uCabin.xy;
    vec2 local = vec2(d.x * uCabin.z - d.y * uCabin.w, d.x * uCabin.w + d.y * uCabin.z);
    if (p.y < roofHeight(local) + 0.05) a = 0.0;

    vAlpha = a;
    gl_Position = a > 0.002 ? projectionMatrix * viewMatrix * vec4(world, 1.0) : vec4(0.0, 0.0, 2.0, 1.0);
  }`;

const fragmentShader = /* glsl */ `
  uniform vec3 uHaze;
  uniform float uFlash;
  varying vec2 vUv;
  varying float vAlpha;
  void main() {
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float a = vAlpha * smoothstep(0.0, 0.7, across) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
    vec3 col = uHaze * 1.3 + 0.16 + uFlash * 0.7;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Accumulated fall and drift. Module level, so the rain does not jump when the scene is rebuilt. */
const motion = { fall: 0, driftX: 0, driftZ: 0 };

/**
 * Falling rain: one instanced draw call of camera-facing streaks. The drops
 * live in a box that wraps around the camera and are moved entirely in the
 * vertex shader. Intensity sets how many are drawn, how fast they fall, how
 * long the streaks are and how far the wind slants them.
 */
export function Rain({ profile }: { profile: QualityProfile }) {
  const isTouch = useStore((s) => s.isTouch);
  const count = Math.round(profile.rainDrops * (isTouch ? 0.6 : 1));

  const mesh = useMemo(() => {
    const rng = createRng(9091);
    const seed = new Float32Array(count * 4);
    const kind = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      seed.set([rng(), rng(), rng(), rng()], i * 4);
      kind[i] = rng() < FAR_SHARE ? 1 : 0;
    }
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
    geo.instanceCount = 0;

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uBox: { value: BOX },
        uVel: { value: new THREE.Vector3(0, -9, 0) },
        uDrift: { value: new THREE.Vector2() },
        uFall: { value: 0 },
        uPixel: { value: 0.001 },
        uCabin: { value: new THREE.Vector4(CABIN.x, CABIN.z, Math.cos(CABIN.yaw), Math.sin(CABIN.yaw)) },
        uHaze: { value: HAZE_COLOR },
        uRain: weatherUniforms.uRain,
        uRainLevel: weatherUniforms.uRainLevel,
        uFlash: weatherUniforms.uFlash,
      },
      vertexShader,
      fragmentShader,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = 9;
    m.layers.set(1); // not drawn in the water reflection
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

  useFrame(({ camera, gl }, delta) => {
    const rain = runtime.rain;
    const geo = mesh.geometry as THREE.InstancedBufferGeometry;
    const drawn = rain <= 0 ? 0 : Math.floor(count * rain * THREE.MathUtils.lerp(0.2, 1, runtime.rainLevel));
    geo.instanceCount = drawn;
    mesh.visible = drawn > 0;
    if (!mesh.visible) return;

    const dt = Math.min(delta, 0.1);
    const u = (mesh.material as THREE.ShaderMaterial).uniforms;
    const level = runtime.rainLevel;
    const fall = THREE.MathUtils.lerp(6.5, 12, level);
    const wind = (0.4 + 3.3 * level) * (0.45 + runtime.gust);
    const dir = windUniforms.uWindDir.value;
    motion.fall = (motion.fall + fall * dt) % (BOX.y * WRAP);
    motion.driftX = (motion.driftX + dir.x * wind * dt) % (BOX.x * WRAP);
    motion.driftZ = (motion.driftZ + dir.y * wind * dt) % (BOX.z * WRAP);
    u.uFall.value = motion.fall;
    (u.uDrift.value as THREE.Vector2).set(motion.driftX, motion.driftZ);
    (u.uVel.value as THREE.Vector3).set(dir.x * wind, -fall, dir.y * wind);
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 55;
    u.uPixel.value = (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(1, gl.domElement.height);
  });

  return <primitive object={mesh} />;
}
