import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { makeCanvas, pixelFill, softSpriteCanvas, tileNoise } from '../../assets/procedural/canvas';
import type { QualityProfile } from '../../config/quality';
import { CLEARING, POND, SUN_DIR, WATER_LEVEL } from '../../world/layout';
import { createRng } from '../../world/rng';
import { groundHeight } from '../../world/terrain';
import { HAZE_COLOR } from '../lighting/SkyDome';
import { windUniforms } from '../vegetation/wind';

const SUN = new THREE.Vector3(...SUN_DIR);

function noiseTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256);
  pixelFill(ctx, (u, v) => {
    const n = tileNoise(u, v, 4, 5, 13);
    const g = Math.min(255, Math.max(0, (n - 0.25) * 1.9 * 255));
    return [g, g, g];
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/* ───────────────────────── mist ───────────────────────── */

/** Drifting sheets of morning mist between the trunks and low over the water. */
export function Mist({ profile }: { profile: QualityProfile }) {
  const mesh = useMemo(() => {
    const rng = createRng(606);
    const count = profile.mistLayers;
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count * 2);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const overPond = i < count * 0.18;
      let x: number;
      let z: number;
      let w: number;
      let h: number;
      if (overPond) {
        x = POND.cx + rng.range(-7, 6);
        z = POND.cz + rng.range(-3.5, 3.5);
        w = rng.range(7, 12);
        h = rng.range(0.9, 1.6);
      } else {
        const a = rng() * Math.PI * 2;
        const r = rng.range(17, 78);
        x = CLEARING.cx + Math.cos(a) * r;
        z = CLEARING.cz + Math.sin(a) * r;
        w = rng.range(16, 38) * (0.7 + r / 90);
        h = rng.range(3.5, 9) * (0.8 + r / 110);
      }
      const base = overPond ? WATER_LEVEL : groundHeight(x, z);
      pos.set([x, base + h * 0.42, z], i * 3);
      size.set([w, h], i * 2);
      seed[i] = rng();
    }
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 2));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    geo.instanceCount = count;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 200);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: windUniforms.uTime,
        uNoise: { value: noiseTexture() },
        uSun: { value: SUN },
        uHaze: { value: HAZE_COLOR },
        uOpacity: { value: 0.3 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aPos; attribute vec2 aSize; attribute float aSeed;
        uniform float uTime;
        varying vec2 vUv; varying float vSeed; varying float vDist; varying vec3 vDir;
        void main() {
          vUv = uv; vSeed = aSeed;
          vec3 centre = aPos;
          centre.x += sin(uTime * 0.021 + aSeed * 40.0) * 3.0 + uTime * 0.05 * (aSeed - 0.5);
          centre.z += cos(uTime * 0.017 + aSeed * 27.0) * 3.0;
          centre.y += sin(uTime * 0.05 + aSeed * 11.0) * 0.25;
          vec3 toCam = cameraPosition - centre;
          vDist = length(toCam);
          vDir = -toCam / vDist;
          vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
          vec3 world = centre + right * position.x * aSize.x + vec3(0.0, 1.0, 0.0) * position.y * aSize.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uNoise; uniform float uTime, uOpacity; uniform vec3 uSun, uHaze;
        varying vec2 vUv; varying float vSeed; varying float vDist; varying vec3 vDir;
        void main() {
          vec2 q = vUv - 0.5;
          float n = texture2D(uNoise, vUv * vec2(1.3, 0.6) + vec2(uTime * 0.006 + vSeed * 3.0, vSeed)).r;
          float m = texture2D(uNoise, vUv * vec2(2.7, 1.2) - vec2(uTime * 0.009, vSeed * 5.0)).r;
          // soft on every edge, densest toward the ground
          float shape = smoothstep(0.5, 0.12, abs(q.x)) * smoothstep(0.5, 0.2, q.y) * smoothstep(-0.5, -0.34, q.y);
          shape *= mix(1.0, 0.55, smoothstep(-0.3, 0.4, q.y));
          float a = shape * (0.35 + 0.65 * n) * (0.6 + 0.4 * m) * uOpacity;
          // never a hard plane in front of the lens, and thinner far away where the fog already is
          a *= smoothstep(2.0, 12.0, vDist) * (1.0 - smoothstep(70.0, 130.0, vDist) * 0.5);
          float toSun = pow(max(dot(vDir, uSun), 0.0), 2.0);
          vec3 col = mix(uHaze * 1.02, vec3(1.25, 1.08, 0.86), toSun * 0.8);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 6;
    m.layers.set(1);
    return m;
  }, [profile.mistLayers]);

  return <primitive object={mesh} />;
}

/* ───────────────────────── light shafts ───────────────────────── */

/** Columns of sunlight coming down through the canopy, visible in the mist. */
export function SunShafts({ profile }: { profile: QualityProfile }) {
  const mesh = useMemo(() => {
    const rng = createRng(1717);
    const count = profile.shafts;
    const start = new Float32Array(count * 3);
    const dims = new Float32Array(count * 2);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // where each shaft meets the ground: across the lawn, the pond and the near forest edge
      const gx = rng.range(-21, 9);
      const gz = rng.range(-9, 17);
      const length = rng.range(20, 30);
      start.set([gx + SUN.x * length, groundHeight(gx, gz) + SUN.y * length, gz + SUN.z * length], i * 3);
      dims.set([rng.range(0.9, 3.0), length * 1.04], i * 2);
      seed[i] = rng();
    }
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, -0.5, 0); // y: 0 at the canopy end, −1 at the ground end
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    geo.setAttribute('aStart', new THREE.InstancedBufferAttribute(start, 3));
    geo.setAttribute('aDims', new THREE.InstancedBufferAttribute(dims, 2));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    geo.instanceCount = count;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), 120);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: windUniforms.uTime, uSun: { value: SUN }, uGust: windUniforms.uGust },
      vertexShader: /* glsl */ `
        attribute vec3 aStart; attribute vec2 aDims; attribute float aSeed;
        uniform vec3 uSun;
        varying vec2 vUv; varying float vSeed; varying float vFacing; varying float vDist;
        void main() {
          vUv = uv; vSeed = aSeed;
          vec3 axis = -uSun;
          vec3 onAxis = aStart + axis * (-position.y) * aDims.y;
          vec3 toCam = cameraPosition - onAxis;
          vDist = length(toCam);
          vec3 side = normalize(cross(axis, toCam));
          vec3 world = onAxis + side * position.x * aDims.x;
          vFacing = max(dot(normalize(-toCam), uSun), 0.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uGust;
        varying vec2 vUv; varying float vSeed; varying float vFacing; varying float vDist;
        void main() {
          float ax = (vUv.x - 0.5) * 3.4;
          float across = exp(-ax * ax * 2.0);
          // streaks inside the shaft, as if cut by individual branches
          across *= 0.7 + 0.3 * sin(vUv.x * 31.0 + vSeed * 50.0) * sin(vUv.x * 13.0 + vSeed * 20.0);
          float along = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
          float breathe = 0.75 + 0.25 * sin(uTime * 0.23 + vSeed * 30.0);
          float a = across * along * breathe * (0.05 + 0.2 * pow(vFacing, 1.6));
          a *= smoothstep(1.5, 7.0, vDist);
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 7;
    m.layers.set(1);
    return m;
  }, [profile.shafts]);

  return <primitive object={mesh} />;
}

/* ───────────────────────── pollen and dust ───────────────────────── */

/** Specks of pollen and dust that catch the sun as they drift. */
export function Motes({ profile }: { profile: QualityProfile }) {
  const points = useMemo(() => {
    const rng = createRng(2323);
    const count = profile.motes;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos.set([rng.range(-20, 15), rng.range(0.3, 7.5), rng.range(-9, 19)], i * 3);
      seed[i] = rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 4), 40);
    const sprite = new THREE.CanvasTexture(softSpriteCanvas(32, 2));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: windUniforms.uTime, uSprite: { value: sprite }, uSun: { value: SUN }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uScale; uniform vec3 uSun;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          float t = uTime * (0.12 + aSeed * 0.2);
          p.x += sin(t + aSeed * 60.0) * 0.9 + uTime * 0.06;
          p.y += sin(t * 0.7 + aSeed * 33.0) * 0.5;
          p.z += cos(t * 0.9 + aSeed * 47.0) * 0.9;
          p.x = mod(p.x + 20.0, 35.0) - 20.0;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float dist = -mv.z;
          gl_PointSize = uScale * (0.9 + aSeed * 1.8) * 22.0 / max(dist, 0.5);
          float twinkle = 0.55 + 0.45 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 90.0);
          float toSun = pow(max(dot(normalize(p - cameraPosition), uSun), 0.0), 3.0);
          vAlpha = twinkle * (0.12 + 0.75 * toSun) * smoothstep(0.6, 2.5, dist) * smoothstep(34.0, 16.0, dist);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSprite; varying float vAlpha;
        void main() {
          float a = texture2D(uSprite, gl_PointCoord).a * vAlpha;
          gl_FragColor = vec4(vec3(1.0, 0.9, 0.68) * a, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const p = new THREE.Points(geo, mat);
    p.renderOrder = 8;
    p.layers.set(1);
    return p;
  }, [profile.motes]);

  useFrame(({ gl }) => {
    (points.material as THREE.ShaderMaterial).uniforms.uScale.value = gl.getPixelRatio() * (gl.domElement.clientHeight / 900);
  });
  return <primitive object={points} />;
}

/* ───────────────────────── birds ───────────────────────── */

const FLOCKS = [
  { size: 6, radius: 95, height: 44, speed: 0.085, phase: 0.4, period: 64 },
  { size: 4, radius: 130, height: 58, speed: -0.06, phase: 3.1, period: 91 },
];

/** Small flocks that cross the sky above the far forest every minute or so. */
export function Birds() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const total = FLOCKS.reduce((n, f) => n + f.size, 0);
  const { geometry, material, offsets } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    // body and two swept wings, wingspan 1
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0.14, -0.5, 0, -0.06, 0, 0, -0.1, 0, 0, 0.14, 0, 0, -0.1, 0.5, 0, -0.06], 3),
    );
    const rng = createRng(77);
    const phase = new Float32Array(total);
    const offsets: THREE.Vector3[] = [];
    for (let i = 0; i < total; i++) {
      phase[i] = rng() * 6.28;
      offsets.push(new THREE.Vector3(rng.range(-7, 7), rng.range(-2.5, 2.5), rng.range(-7, 7)));
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uTime: windUniforms.uTime, uHaze: { value: HAZE_COLOR } },
      vertexShader: /* glsl */ `
        attribute float aPhase; uniform float uTime; varying float vDist;
        void main() {
          vec3 p = position;
          // flap, with short glides
          float beat = sin(uTime * 7.0 + aPhase) * smoothstep(-0.3, 0.3, sin(uTime * 0.5 + aPhase * 2.0));
          p.y += abs(p.x) * beat * 0.75;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uHaze; varying float vDist;
        void main() {
          vec3 col = mix(vec3(0.07, 0.07, 0.08), uHaze, smoothstep(40.0, 320.0, vDist) * 0.75);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geometry: geo, material: mat, offsets };
  }, [total]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = windUniforms.uTime.value;
    let k = 0;
    for (const f of FLOCKS) {
      // each flock is only in the sky for part of its period
      const cycle = (t / f.period + f.phase) % 1;
      const visible = cycle < 0.6;
      const a = f.phase * 2 + cycle * Math.PI * 2 * 0.9 * Math.sign(f.speed) + Math.floor(t / f.period) * 1.9;
      for (let i = 0; i < f.size; i++, k++) {
        const o = offsets[k];
        const lag = i * 0.012 * Math.sign(f.speed);
        dummy.position.set(
          CLEARING.cx + Math.cos(a - lag) * f.radius + o.x,
          visible ? f.height + o.y + Math.sin(t * 0.3 + i) * 1.5 : -500,
          CLEARING.cz + Math.sin(a - lag) * f.radius + o.z,
        );
        dummy.rotation.set(0, -a + (f.speed > 0 ? 0 : Math.PI), 0);
        dummy.scale.setScalar(1.5);
        dummy.updateMatrix();
        mesh.setMatrixAt(k, dummy.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geometry, material, total]} frustumCulled={false} />;
}

/** Everything in the air. */
export function Atmosphere({ profile }: { profile: QualityProfile }) {
  return (
    <group>
      <Mist profile={profile} />
      <SunShafts profile={profile} />
      <Motes profile={profile} />
      <Birds />
    </group>
  );
}
