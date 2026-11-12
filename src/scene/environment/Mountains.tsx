import { useMemo } from 'react';
import * as THREE from 'three';
import { fbm2 } from '../../world/noise';
import { HAZE_COLOR, HAZE_MORNING } from '../lighting/SkyDome';
import { weatherUniforms } from '../weather/uniforms';

interface Ridge {
  radius: number;
  base: number;
  height: number;
  rough: number;
  color: string;
  seed: number;
}

/** Near → far. Each ridge is paler and bluer than the one in front: aerial perspective. */
const RIDGES: Ridge[] = [
  { radius: 210, base: -6, height: 52, rough: 1.0, color: '#5f7a69', seed: 3 },
  { radius: 300, base: -8, height: 86, rough: 0.8, color: '#86a096', seed: 19 },
  { radius: 420, base: -10, height: 128, rough: 0.6, color: '#a9bcbb', seed: 47 },
  { radius: 560, base: -10, height: 170, rough: 0.45, color: '#c1ced0', seed: 71 },
];

function ridgeGeometry(r: Ridge): THREE.BufferGeometry {
  const steps = 360;
  const rows = 6;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const top = new THREE.Color(r.color);
  const haze = HAZE_MORNING;
  const c = new THREE.Color();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const wrap = (f: number, o: number) => fbm2(Math.cos(a) * f + o, Math.sin(a) * f + o, 4);
    // taller behind the cabin (−Z) and to the left, lower toward the entrance
    const facing = 0.62 + 0.38 * Math.max(0, -Math.sin(a) * 0.8 - Math.cos(a) * 0.35 + 0.25);
    const crest = r.height * facing * (0.35 + 0.95 * wrap(2.1, r.seed)) + r.height * 0.05 * r.rough * wrap(26, r.seed + 9);
    for (let j = 0; j <= rows; j++) {
      const t = j / rows;
      const rad = r.radius - t * 26;
      pos.push(Math.cos(a) * rad, r.base + crest * Math.pow(t, 0.8), Math.sin(a) * rad);
      c.copy(haze).lerp(top, 0.15 + 0.85 * Math.pow(t, 1.3));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = a + rows + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

/** Layered, haze-separated ridge lines that close the horizon. */
export function Mountains() {
  const ridges = useMemo(() => RIDGES.map(ridgeGeometry), []);
  const material = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
    // in rain the ridges sink most of the way into the grey haze
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uHaze = { value: HAZE_COLOR };
      shader.uniforms.uRain = weatherUniforms.uRain;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uHaze;\nuniform float uRain;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uHaze, uRain * 0.8);');
    };
    return mat;
  }, []);
  return (
    <group>
      {ridges.map((geo, i) => (
        <mesh key={i} geometry={geo} material={material} renderOrder={-5 + i * -1} frustumCulled={false} />
      ))}
    </group>
  );
}
