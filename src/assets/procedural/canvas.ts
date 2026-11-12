import * as THREE from 'three';
import { fbm2 } from '../../world/noise';

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  return [canvas, ctx];
}

/** Fill every pixel from a function of (u, v) in 0..1 that returns [r, g, b, a?] in 0..255. */
export function pixelFill(ctx: Ctx, fn: (u: number, v: number, x: number, y: number) => readonly number[]): void {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x / w, y / h, x, y);
      const i = (y * w + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Tileable fractal noise in 0..1 (wraps at u,v = 1). */
export function tileNoise(u: number, v: number, freq: number, octaves = 4, seed = 0): number {
  const a = fbm2(u * freq + seed, v * freq + seed, octaves);
  const b = fbm2((u - 1) * freq + seed, v * freq + seed, octaves);
  const c = fbm2(u * freq + seed, (v - 1) * freq + seed, octaves);
  const d = fbm2((u - 1) * freq + seed, (v - 1) * freq + seed, octaves);
  const top = a * (1 - u) + b * u;
  const bottom = c * (1 - u) + d * u;
  return top * (1 - v) + bottom * v;
}

export interface TexOptions {
  srgb?: boolean;
  repeat?: [number, number];
  wrap?: boolean;
  anisotropy?: number;
}

export function canvasTexture(canvas: HTMLCanvasElement, opts: TexOptions = {}): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.wrap !== false) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  tex.anisotropy = opts.anisotropy ?? 4;
  tex.needsUpdate = true;
  return tex;
}

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export function mixRgb(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}
export const rgb = (c: readonly number[], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/** Soft round sprite, white with radial alpha falloff. */
export function softSpriteCanvas(size = 64, power = 2): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(size);
  pixelFill(ctx, (u, v) => {
    const d = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
    const a = Math.pow(1 - d, power);
    return [255, 255, 255, a * 255];
  });
  return canvas;
}
