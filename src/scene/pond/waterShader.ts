import * as THREE from 'three';
import { GLSL_NOISE } from '../shaders/noise';

export const MAX_RIPPLES = 8;

/**
 * Pond surface. A fresnel blend between a planar reflection of the real scene
 * and a depth-tinted, see-through body, with wind ripples, expanding ring
 * ripples from fish, and sun glint.
 */
export const WaterShader = {
  name: 'PondWater',
  uniforms: {
    color: { value: null as THREE.Color | null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: null as THREE.Matrix4 | null },
    uTime: { value: 0 },
    uGust: { value: 0.4 },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 0.85, 0.62) },
    uShallow: { value: new THREE.Color(0.2, 0.3, 0.2) },
    uDeep: { value: new THREE.Color(0.018, 0.06, 0.05) },
    uSkyZenith: { value: new THREE.Color(0.3, 0.5, 0.75) },
    uSkyHorizon: { value: new THREE.Color(0.8, 0.82, 0.78) },
    uUseReflection: { value: 1 },
    uDepthMap: { value: null as THREE.Texture | null },
    /** xy = min corner (x, z) of the depth map in world space, zw = its size. */
    uDepthRect: { value: new THREE.Vector4() },
    uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vReflUv;
    varying vec3 vWorld;
    void main() {
      vReflUv = textureMatrix * vec4(position, 1.0);
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D uDepthMap;
    uniform vec4 uDepthRect;
    uniform float uTime, uGust, uUseReflection, uFogDensity;
    uniform vec3 uSun, uSunColor, uShallow, uDeep, uSkyZenith, uSkyHorizon, uFogColor;
    uniform vec4 uRipples[${MAX_RIPPLES}];
    varying vec4 vReflUv;
    varying vec3 vWorld;
    ${GLSL_NOISE}

    vec2 slope(vec2 p) {
      const float e = 0.07;
      float c = vnoise(p);
      return vec2(vnoise(p + vec2(e, 0.0)) - c, vnoise(p + vec2(0.0, e)) - c) / e;
    }

    void main() {
      vec2 p = vWorld.xz;
      float t = uTime;
      float depth = texture2D(uDepthMap, (p - uDepthRect.xy) / uDepthRect.zw).r * 1.4;

      // wind ripples: three drifting octaves, stronger in gusts, calmer in the shallows
      float chop = (0.45 + 0.85 * uGust) * (0.45 + 0.55 * smoothstep(0.0, 0.5, depth));
      vec2 n = slope(p * 0.9 + vec2(t * 0.09, t * 0.05)) * 0.05;
      n += slope(p * 2.7 + vec2(-t * 0.16, t * 0.12)) * 0.035;
      n += slope(p * 7.1 + vec2(t * 0.25, -t * 0.21)) * 0.016;
      n *= chop;

      // ring ripples from fish and the spout
      for (int i = 0; i < ${MAX_RIPPLES}; i++) {
        vec4 r = uRipples[i];
        float age = t - r.z;
        if (age < 0.0 || age > 5.0) continue;
        vec2 d = p - r.xy;
        float dist = length(d) + 1e-4;
        float radius = age * 0.42;
        float q = (dist - radius) / (0.1 + age * 0.05);
        float band = exp(-q * q);
        float fade = (1.0 - age / 5.0);
        n += (d / dist) * sin((dist - radius) * 30.0) * band * fade * fade * r.w * 0.2;
      }

      vec3 N = normalize(vec3(-n.x, 1.0, -n.y));
      vec3 V = normalize(cameraPosition - vWorld);
      float ndv = max(dot(N, V), 0.0);
      float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

      // reflection
      vec3 refl;
      if (uUseReflection > 0.5) {
        vec2 uv = vReflUv.xy / vReflUv.w + N.xz * 0.045;
        refl = texture2D(tDiffuse, uv).rgb;
      } else {
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.8, R.y));
        refl = mix(vec3(0.07, 0.11, 0.06), sky, smoothstep(0.12, 0.42, R.y + fbm(R.xz * 6.0) * 0.1));
      }

      // body: what you see looking into the water
      vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 0.95, depth));
      float bodyAlpha = mix(0.16, 0.9, smoothstep(0.0, 1.15, depth));
      // looking straight down you see deeper; at a glance the surface takes over
      bodyAlpha *= mix(1.0, 0.72, ndv);

      // sun glint
      vec3 H = normalize(V + uSun);
      float ndh = max(dot(N, H), 0.0);
      vec3 glint = uSunColor * (pow(ndh, 900.0) * 9.0 + pow(ndh, 90.0) * 0.22);

      vec3 col = mix(body, refl, fresnel) + glint;
      float alpha = mix(bodyAlpha, 1.0, fresnel) + dot(glint, vec3(0.33));
      // soft waterline: the surface thins out to nothing where it meets the bank
      alpha *= smoothstep(0.0, 0.05, depth);

      float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dot(cameraPosition - vWorld, cameraPosition - vWorld));
      col = mix(col, uFogColor, fogF);

      gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
