import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { makeCanvas, pixelFill } from '../../assets/procedural/canvas';
import type { QualityProfile } from '../../config/quality';
import { events } from '../../state/events';
import { runtime } from '../../state/runtime';
import { POND, SUN_DIR, WATER_LEVEL } from '../../world/layout';
import { pondDepth, pondOutline } from '../../world/pond';
import { windUniforms } from '../vegetation/wind';
import { MAX_RIPPLES, WaterShader } from './waterShader';

/** World-space square the depth map covers. */
const RECT = { x: POND.cx - 10.5, z: POND.cz - 7.5, w: 21, h: 15 };

function depthTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 192);
  pixelFill(ctx, (u, v) => {
    const d = Math.min(1, pondDepth(RECT.x + u * RECT.w, RECT.z + v * RECT.h) / 1.4) * 255;
    return [d, d, d];
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

function surfaceGeometry(): THREE.BufferGeometry {
  // The Reflector's plane normal is local +Z, so the shape is drawn in XY and laid flat.
  const shape = new THREE.Shape(pondOutline(128).map(([x, z]) => new THREE.Vector2(x - POND.cx, -(z - POND.cz))));
  return new THREE.ShapeGeometry(shape, 1);
}

/** The pond surface: planar reflection on High/Medium, analytic sky reflection on Low. */
export function Water({ profile }: { profile: QualityProfile }) {
  const scene = useThree((s) => s.scene);

  const mesh = useMemo(() => {
    const geometry = surfaceGeometry();
    let m: THREE.Mesh;
    if (profile.reflectionSize > 0) {
      m = new Reflector(geometry, {
        textureWidth: profile.reflectionSize,
        textureHeight: profile.reflectionSize,
        clipBias: 0.02,
        multisample: 0,
        shader: WaterShader,
      });
    } else {
      m = new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
          uniforms: THREE.UniformsUtils.clone(WaterShader.uniforms),
          vertexShader: WaterShader.vertexShader,
          fragmentShader: WaterShader.fragmentShader,
        }),
      );
      const mat = m.material as THREE.ShaderMaterial;
      mat.uniforms.textureMatrix.value = new THREE.Matrix4();
      mat.uniforms.uUseReflection.value = 0;
    }
    const mat = m.material as THREE.ShaderMaterial;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.uniforms.uSun.value.set(...SUN_DIR);
    mat.uniforms.uDepthMap.value = depthTexture();
    mat.uniforms.uDepthRect.value.set(RECT.x, RECT.z, RECT.w, RECT.h);
    m.rotation.x = -Math.PI / 2;
    m.position.set(POND.cx, WATER_LEVEL, POND.cz);
    m.renderOrder = 2;
    return m;
  }, [profile.reflectionSize]);

  useEffect(() => {
    const u = (mesh.material as THREE.ShaderMaterial).uniforms;
    let next = 0;
    const off = events.on('ripple', ({ x, z, strength }) => {
      (u.uRipples.value as THREE.Vector4[])[next].set(x, z, windUniforms.uTime.value, strength);
      next = (next + 1) % MAX_RIPPLES;
    });
    return () => {
      off();
      (mesh as Partial<Reflector>).dispose?.();
      mesh.geometry.dispose();
    };
  }, [mesh]);

  useFrame(() => {
    const u = (mesh.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value = windUniforms.uTime.value;
    u.uGust.value = windUniforms.uGust.value;
    u.uRain.value = runtime.rain;
    u.uRainLevel.value = runtime.rainLevel;
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      u.uFogColor.value.copy(fog.color);
      u.uFogDensity.value = fog.density;
    }
  });

  return <primitive object={mesh} />;
}
