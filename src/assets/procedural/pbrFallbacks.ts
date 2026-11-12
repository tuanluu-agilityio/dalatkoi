import { makeCanvas, mixRgb, pixelFill, tileNoise } from './canvas';

/**
 * Generated stand-ins for the file-based PBR textures. They are what the scene
 * is first drawn with, and what stays if a file cannot be loaded.
 */
export type PBRName = 'planks' | 'deck' | 'stonewall' | 'bark' | 'grass' | 'forest' | 'gravel' | 'rock' | 'pebbles';

type Rgb = readonly [number, number, number];

function speckle(dark: Rgb, light: Rgb, freq: number, grain: number, seed: number) {
  return (u: number, v: number) => {
    const n = tileNoise(u, v, freq, 4, seed);
    const g = tileNoise(u, v, freq * 9, 2, seed + 31);
    return mixRgb(dark, light, Math.min(1, Math.max(0, n * (1 - grain) + g * grain)));
  };
}

function boards(dark: Rgb, light: Rgb, count: number, vertical: boolean, seed: number) {
  return (u: number, v: number) => {
    const across = vertical ? u : v;
    const along = vertical ? v : u;
    const board = Math.floor(across * count);
    const edge = Math.abs(across * count - board - 0.5) * 2;
    const tone = tileNoise((board + 0.5) / count, 0.3, 3.1, 1, seed + board * 7.3);
    const grain = tileNoise(across * 24, along * 1.6, 5, 3, seed + board * 13.1);
    const gap = edge > 0.93 ? 0.35 : 1;
    const c = mixRgb(dark, light, Math.min(1, tone * 0.55 + grain * 0.55));
    return [c[0] * gap, c[1] * gap, c[2] * gap];
  };
}

function stones(mortar: Rgb, dark: Rgb, light: Rgb, cells: number, seed: number) {
  return (u: number, v: number) => {
    // jittered-grid Voronoi, wrapped so the texture tiles
    const x = u * cells;
    const y = v * cells * 1.6;
    let best = 9;
    let second = 9;
    let id = 0;
    const cy = cells * 1.6;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const gx = Math.floor(x) + i;
        const gy = Math.floor(y) + j;
        const wx = ((gx % cells) + cells) % cells;
        const wy = ((gy % cy) + cy) % cy;
        const h = Math.sin(wx * 127.1 + wy * 311.7 + seed) * 43758.5453;
        const h2 = Math.sin(wx * 269.5 + wy * 183.3 + seed) * 43758.5453;
        const px = gx + 0.5 + (h - Math.floor(h) - 0.5) * 0.7;
        const py = gy + 0.5 + (h2 - Math.floor(h2) - 0.5) * 0.7;
        const d = Math.hypot(x - px, (y - py) * 1.35);
        if (d < best) {
          second = best;
          best = d;
          id = h - Math.floor(h);
        } else if (d < second) second = d;
      }
    }
    const edge = second - best;
    if (edge < 0.07) return mortar;
    const n = tileNoise(u, v, 14, 3, seed);
    return mixRgb(dark, light, Math.min(1, id * 0.6 + n * 0.5));
  };
}

const RECIPES: Record<PBRName, (u: number, v: number) => readonly number[]> = {
  planks: boards([70, 46, 30], [138, 98, 66], 7, true, 3),
  deck: boards([88, 62, 42], [150, 112, 78], 6, false, 11),
  stonewall: stones([58, 54, 50], [96, 92, 86], [158, 150, 138], 5, 5),
  bark: (u, v) => {
    const ridge = tileNoise(u, v * 0.22, 9, 4, 21);
    const fine = tileNoise(u, v, 40, 2, 4);
    return mixRgb([44, 30, 24], [128, 88, 62], Math.min(1, Math.pow(ridge, 1.6) * 1.3 + fine * 0.2));
  },
  grass: speckle([44, 68, 26], [96, 128, 52], 7, 0.45, 1),
  forest: speckle([58, 42, 28], [128, 98, 62], 8, 0.5, 9),
  gravel: speckle([96, 90, 82], [182, 174, 160], 26, 0.55, 17),
  rock: (u, v) => {
    const n = tileNoise(u, v, 6, 5, 2);
    const moss = tileNoise(u, v, 4, 3, 77);
    const stone = mixRgb([78, 76, 72], [150, 146, 138], n);
    return mixRgb(stone, [70, 96, 44], Math.max(0, moss - 0.55) * 2.2);
  },
  pebbles: stones([54, 50, 44], [104, 96, 84], [172, 164, 148], 9, 41),
};

const cache = new Map<PBRName, HTMLCanvasElement>();

export function fallbackAlbedo(name: PBRName): HTMLCanvasElement {
  let canvas = cache.get(name);
  if (!canvas) {
    const [c, ctx] = makeCanvas(256);
    pixelFill(ctx, RECIPES[name]);
    canvas = c;
    cache.set(name, c);
  }
  return canvas;
}

let flatNormal: HTMLCanvasElement | undefined;
let flatArm: HTMLCanvasElement | undefined;

export function fallbackNormal(): HTMLCanvasElement {
  if (!flatNormal) {
    const [c, ctx] = makeCanvas(4);
    ctx.fillStyle = 'rgb(128,128,255)';
    ctx.fillRect(0, 0, 4, 4);
    flatNormal = c;
  }
  return flatNormal;
}

/** R = ambient occlusion, G = roughness, B = metalness. */
export function fallbackArm(): HTMLCanvasElement {
  if (!flatArm) {
    const [c, ctx] = makeCanvas(4);
    ctx.fillStyle = 'rgb(255,215,0)';
    ctx.fillRect(0, 0, 4, 4);
    flatArm = c;
  }
  return flatArm;
}
