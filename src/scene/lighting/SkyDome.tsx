import { useMemo } from 'react';
import * as THREE from 'three';
import { SUN_DIR } from '../../world/layout';
import { GLSL_NOISE } from '../shaders/noise';
import { windUniforms } from '../vegetation/wind';
import { weatherUniforms } from '../weather/uniforms';

/** Haze of a clear morning, and of a rainy one. */
export const HAZE_MORNING = new THREE.Color('#cfd9d6');
export const HAZE_RAIN = new THREE.Color('#8e999d');
/** Colour the fog and the far mountains fade into right now. The weather controller moves it between the two. */
export const HAZE_COLOR = HAZE_MORNING.clone();

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // always at the far plane
}`;

const fragment = /* glsl */ `
uniform vec3 uSun;
uniform float uTime;
uniform float uClouds;
uniform float uRain, uFlash;
uniform vec2 uFlashDir;
uniform vec3 uHaze;
varying vec3 vDir;
${GLSL_NOISE}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zenith = vec3(0.19, 0.37, 0.66);
  vec3 mid = vec3(0.46, 0.64, 0.82);
  vec3 horizon = vec3(0.86, 0.84, 0.78);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.24, h));
  col = mix(col, zenith, smoothstep(0.16, 0.95, h));

  float s = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.72, 0.42) * pow(s, 5.0) * 0.32;
  col += vec3(1.0, 0.86, 0.62) * pow(s, 48.0) * 0.55;
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9990, 0.9996, s) * 14.0;

  if (uClouds > 0.0 && h > 0.0) {
    vec2 p = d.xz / (h + 0.22) * 1.4 + vec2(uTime * 0.004, 0.0);
    float c = fbm(p * 1.3) * 0.65 + fbm(p * 3.1 + 4.0) * 0.35;
    float cover = smoothstep(0.52, 0.78, c) * smoothstep(0.02, 0.3, h) * uClouds;
    vec3 cloud = mix(vec3(0.95, 0.93, 0.9), vec3(1.0, 0.9, 0.76), pow(s, 3.0));
    col = mix(col, cloud, cover * 0.55);
  }

  if (uRain > 0.0) {
    // overcast: a low grey deck, lighter toward the horizon where it meets the haze
    vec2 p = d.xz / (max(h, 0.0) + 0.3);
    float c = fbm(p * 1.1 + vec2(uTime * 0.011, uTime * 0.004)) * 0.6 + fbm(p * 2.7 - vec2(uTime * 0.016, 0.0)) * 0.4;
    vec3 deck = mix(uHaze, vec3(0.2, 0.225, 0.26), smoothstep(0.0, 0.75, h));
    deck *= 0.86 + 0.3 * c;
    // a flash lights the cloud from inside, brightest toward the strike
    float toward = pow(max(dot(normalize(d.xz + 1e-4), uFlashDir), 0.0), 3.0);
    deck += vec3(0.62, 0.68, 0.82) * uFlash * (0.22 + 0.85 * toward * smoothstep(0.75, 0.05, h)) * (0.6 + 0.8 * c);
    col = mix(col, deck, uRain);
  }

  // below the horizon: hazy ground bounce, used mostly by the environment map
  vec3 ground = mix(mix(horizon, uHaze, uRain) * 0.82, vec3(0.13, 0.17, 0.09), smoothstep(0.0, -0.3, h));
  col = mix(col, ground, step(h, 0.0));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Gradient morning sky with sun glow and thin drifting cloud. */
export function SkyDome({ radius = 900, clouds = true, weather = true }: { radius?: number; clouds?: boolean; weather?: boolean }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uSun: { value: new THREE.Vector3(...SUN_DIR) },
          uTime: windUniforms.uTime,
          uClouds: { value: clouds ? 1 : 0 },
          // the copy that lights the scene stays a clear morning: it is captured once
          uRain: weather ? weatherUniforms.uRain : { value: 0 },
          uFlash: weather ? weatherUniforms.uFlash : { value: 0 },
          uFlashDir: weatherUniforms.uFlashDir,
          uHaze: { value: HAZE_COLOR },
        },
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [clouds, weather],
  );
  return (
    <mesh material={material} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[radius, 48, 24]} />
    </mesh>
  );
}
