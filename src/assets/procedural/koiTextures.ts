import * as THREE from 'three';
import { fbm2, smoothstep } from '../../world/noise';
import { canvasTexture, makeCanvas, mixRgb, pixelFill } from './canvas';

type Rgb = readonly [number, number, number];

interface Variety {
  name: string;
  base: Rgb;
  belly: Rgb;
  fin: Rgb;
  /** Colour patches painted on the back, in order. */
  patches: { color: Rgb; threshold: number; freq: number }[];
  /** Round crown mark on the head (tancho). */
  crown?: Rgb;
  metallic?: boolean;
}

const WHITE: Rgb = [244, 240, 232];
const RED: Rgb = [214, 52, 26];
const ORANGE: Rgb = [236, 112, 30];
const BLACK: Rgb = [26, 24, 26];

export const KOI_VARIETIES: Variety[] = [
  { name: 'Kohaku', base: WHITE, belly: [250, 248, 244], fin: [240, 232, 222], patches: [{ color: RED, threshold: 0.45, freq: 2.2 }] },
  { name: 'Sanke', base: WHITE, belly: [250, 248, 244], fin: [236, 230, 222], patches: [{ color: RED, threshold: 0.46, freq: 2.0 }, { color: BLACK, threshold: 0.58, freq: 4.2 }] },
  { name: 'Showa', base: BLACK, belly: [70, 66, 66], fin: [60, 56, 58], patches: [{ color: RED, threshold: 0.45, freq: 2.4 }, { color: WHITE, threshold: 0.55, freq: 3.1 }] },
  { name: 'Yamabuki Ogon', base: [240, 190, 62], belly: [250, 226, 150], fin: [246, 214, 130], patches: [], metallic: true },
  { name: 'Orenji Ogon', base: ORANGE, belly: [246, 180, 110], fin: [244, 160, 90], patches: [{ color: [226, 84, 22], threshold: 0.5, freq: 1.6 }], metallic: true },
  { name: 'Tancho', base: WHITE, belly: [250, 248, 244], fin: [240, 234, 226], patches: [], crown: RED },
  { name: 'Asagi', base: [96, 122, 150], belly: [226, 110, 52], fin: [222, 128, 74], patches: [{ color: [62, 84, 112], threshold: 0.45, freq: 5 }] },
  { name: 'Chagoi', base: [150, 104, 60], belly: [190, 150, 104], fin: [168, 122, 80], patches: [{ color: [118, 78, 42], threshold: 0.46, freq: 2.6 }] },
  { name: 'Hi Utsuri', base: BLACK, belly: [60, 54, 54], fin: [52, 48, 50], patches: [{ color: ORANGE, threshold: 0.44, freq: 2.0 }] },
  { name: 'Platinum Ogon', base: [232, 232, 226], belly: [248, 248, 246], fin: [236, 236, 232], patches: [], metallic: true },
];

/**
 * Skin for one koi. U runs tail → nose, V wraps the body with the back at 0.5.
 * `seed` makes every individual's markings unique.
 */
export function koiTexture(varietyIndex: number, seed: number): THREE.CanvasTexture {
  const v = KOI_VARIETIES[varietyIndex % KOI_VARIETIES.length];
  const [canvas, ctx] = makeCanvas(256, 128);
  pixelFill(ctx, (u, w) => {
    const top = 1 - Math.abs(w - 0.5) * 2;
    let col: Rgb = v.base;
    for (let i = 0; i < v.patches.length; i++) {
      const patch = v.patches[i];
      const n = fbm2(u * patch.freq * 2.4 + seed * 7.3 + i * 31, w * patch.freq * 1.5 + seed * 3.1, 3);
      const mask = smoothstep(patch.threshold, patch.threshold + 0.035, n) * smoothstep(0.1, 0.32, top);
      col = mixRgb(col, patch.color, mask);
    }
    if (v.crown) {
      const d = Math.hypot((u - 0.86) * 2.6, w - 0.5);
      col = mixRgb(col, v.crown, 1 - smoothstep(0.1, 0.13, d));
    }
    col = mixRgb(v.belly, col, smoothstep(0.02, 0.34, top));
    // scale reticulation
    const row = Math.floor(u * 46);
    const s = Math.sin(u * 46 * Math.PI) * Math.sin((w * 30 + (row % 2) * 0.5) * Math.PI * 2);
    const shade = 1 - 0.09 * Math.max(0, s) * smoothstep(0.92, 0.8, u);
    // eyes
    const eye = Math.min(Math.hypot((u - 0.9) * 2, w - 0.27), Math.hypot((u - 0.9) * 2, w - 0.73));
    if (eye < 0.03) return [14, 12, 12];
    if (eye < 0.042) return mixRgb(col, [200, 180, 120], 0.6);
    // swatch sampled by the fins
    if (u < 0.04 && w < 0.08) return v.fin;
    return [col[0] * shade, col[1] * shade, col[2] * shade];
  });
  return canvasTexture(canvas, { wrap: false, anisotropy: 4 });
}
