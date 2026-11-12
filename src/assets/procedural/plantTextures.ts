import * as THREE from 'three';
import { createRng } from '../../world/rng';
import { canvasTexture, makeCanvas, mixRgb, pixelFill, rgb, tileNoise, type Ctx } from './canvas';

type Rgb = readonly [number, number, number];

/** Alpha-cutout textures need colour bleeding into the transparent area, or mipmaps show dark fringes. */
function bleed(ctx: Ctx, fill: Rgb): void {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) {
      d[i] = fill[0];
      d[i + 1] = fill[1];
      d[i + 2] = fill[2];
    }
  }
  ctx.putImageData(img, 0, 0);
}

function cutout(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = canvasTexture(canvas, { wrap: false, anisotropy: 4 });
  tex.premultiplyAlpha = false;
  return tex;
}

/** Lily pad seen from above: waxy green disc with pale radial veins. */
export function lilyPadTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128);
  pixelFill(ctx, (u, v) => {
    const x = u - 0.5;
    const y = v - 0.5;
    const r = Math.hypot(x, y) * 2;
    const a = Math.atan2(y, x);
    const vein = Math.pow(Math.abs(Math.sin(a * 9)), 26) * (1 - r * 0.4);
    const n = tileNoise(u, v, 6, 3, 5);
    const base = mixRgb([52, 96, 38], [108, 150, 62], n * 0.7 + (1 - r) * 0.3);
    const c = mixRgb(base, [168, 190, 110], vein * 0.55);
    const rim = r > 0.88 ? 0.72 : 1;
    return [c[0] * rim, c[1] * rim, c[2] * rim];
  });
  return canvasTexture(canvas, { wrap: false });
}

/**
 * A pine branch tip seen flat: a twig with dense tufts of long needles.
 * Da Lat's three-needle pine carries its needles in drooping brush-like clusters.
 */
export function pineBranchTexture(seed = 1): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  const rng = createRng(seed * 977);
  ctx.lineCap = 'round';
  // twig along the vertical axis, base at the bottom
  const twigs: [number, number, number, number][] = [[0.5, 1.0, 0.5, 0.2]];
  for (let i = 0; i < 5; i++) {
    const t = rng.range(0.25, 0.8);
    const side = i % 2 ? 1 : -1;
    twigs.push([0.5, 1 - t * 0.8, 0.5 + side * rng.range(0.16, 0.36), 1 - t * 0.8 - rng.range(0.12, 0.26)]);
  }
  for (const [x0, y0, x1, y1] of twigs) {
    ctx.strokeStyle = rgb([70, 50, 34]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0 * size, y0 * size);
    ctx.lineTo(x1 * size, y1 * size);
    ctx.stroke();
    // needle tufts along the outer two thirds of each twig
    const tufts = 9;
    for (let k = 2; k <= tufts; k++) {
      const f = k / tufts;
      const cx = (x0 + (x1 - x0) * f) * size;
      const cy = (y0 + (y1 - y0) * f) * size;
      const dir = Math.atan2(y1 - y0, x1 - x0);
      for (let nIdx = 0; nIdx < 26; nIdx++) {
        const a = dir + rng.range(-1.25, 1.25);
        const len = rng.range(0.11, 0.2) * size;
        const shade = rng();
        ctx.strokeStyle = rgb(mixRgb([30, 62, 30], [104, 142, 62], shade), 0.95);
        ctx.lineWidth = rng.range(0.9, 1.7);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.5 + 3, cx + Math.cos(a) * len, cy + Math.sin(a) * len + 7);
        ctx.stroke();
      }
    }
  }
  bleed(ctx, [48, 84, 40]);
  return cutout(canvas);
}

/** A fern frond: tapering rachis with paired, toothed pinnae. Base at the bottom centre. */
export function fernFrondTexture(seed = 1): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  const rng = createRng(seed * 131);
  ctx.lineCap = 'round';
  const pairs = 22;
  for (let i = 0; i < pairs; i++) {
    const t = i / (pairs - 1);
    const y = h * (0.96 - t * 0.92);
    const reach = w * 0.47 * Math.sin(Math.PI * Math.pow(t * 0.94 + 0.05, 0.72));
    const tone = rng();
    for (const side of [-1, 1]) {
      const tipX = w / 2 + side * reach;
      const tipY = y - reach * 0.32;
      ctx.fillStyle = rgb(mixRgb([42, 92, 34], [110, 160, 62], tone * 0.6 + t * 0.4));
      ctx.beginPath();
      ctx.moveTo(w / 2, y + 3.4);
      ctx.quadraticCurveTo(w / 2 + side * reach * 0.5, y + 4.5 - reach * 0.1, tipX, tipY);
      ctx.quadraticCurveTo(w / 2 + side * reach * 0.5, y - 5.5 - reach * 0.16, w / 2, y - 3.4);
      ctx.fill();
      // midrib of the pinna
      ctx.strokeStyle = rgb([30, 70, 26], 0.6);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(w / 2, y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = rgb([64, 84, 34]);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(w / 2, h);
  ctx.lineTo(w / 2, h * 0.04);
  ctx.stroke();
  bleed(ctx, [60, 110, 44]);
  return cutout(canvas);
}

/** A spray of broad leaves on a twig, for bushes, hedges and small trees. */
export function leafSprayTexture(dark: Rgb, light: Rgb, seed = 1, count = 46, leafLen = 0.2): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  const rng = createRng(seed * 613);
  const leaf = (x: number, y: number, a: number, len: number, tone: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    const c = mixRgb(dark, light, tone);
    ctx.fillStyle = rgb(c);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -len * 0.34, len, 0);
    ctx.quadraticCurveTo(len * 0.5, len * 0.34, 0, 0);
    ctx.fill();
    ctx.strokeStyle = rgb([c[0] * 0.6, c[1] * 0.7, c[2] * 0.6], 0.8);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.restore();
  };
  // back layer first (darker), then front
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(rng()) * 0.4;
      const a = rng() * Math.PI * 2;
      const x = (0.5 + Math.cos(a) * r) * size;
      const y = (0.5 + Math.sin(a) * r) * size;
      const outward = a + rng.range(-0.9, 0.9);
      leaf(x, y, outward, rng.range(0.7, 1.15) * leafLen * size, layer ? rng.range(0.35, 1) : rng.range(0, 0.4));
    }
  }
  bleed(ctx, mixRgb(dark, light, 0.4));
  return cutout(canvas);
}

/** One long arching tropical leaf (banana / canna style) with a pale midrib. Base at the bottom centre. */
export function broadLeafTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, '#2f6a2a');
  g.addColorStop(0.6, '#4f9440');
  g.addColorStop(1, '#7fb556');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w / 2, h);
  ctx.bezierCurveTo(w * 0.02, h * 0.82, w * 0.0, h * 0.3, w / 2, 2);
  ctx.bezierCurveTo(w * 1.0, h * 0.3, w * 0.98, h * 0.82, w / 2, h);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = 'rgba(30,70,28,0.35)';
  ctx.lineWidth = 1;
  for (let y = h * 0.95; y > 8; y -= 7) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w / 2, y);
      ctx.quadraticCurveTo(w / 2 + side * w * 0.3, y - 10, w / 2 + side * w * 0.5, y - 26);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(190,214,130,0.9)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(w / 2, h);
  ctx.lineTo(w / 2, 4);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  bleed(ctx, [70, 130, 60]);
  return cutout(canvas);
}

/**
 * Hydrangea flower head wrapped on a sphere: tightly packed four-petalled florets.
 * Greyscale-ish so instance colour chooses blue, violet or pink.
 */
export function hydrangeaTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  const rng = createRng(4242);
  ctx.fillStyle = '#8f93a2';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 520; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = rng.range(7, 11);
    const tone = rng.range(0.72, 1);
    const rot = rng() * Math.PI;
    for (let dx = -size; dx <= size; dx += size) {
      for (let dy = -size; dy <= size; dy += size) {
        if (x + dx < -r * 2 || x + dx > size + r * 2 || y + dy < -r * 2 || y + dy > size + r * 2) continue;
        ctx.save();
        ctx.translate(x + dx, y + dy);
        ctx.rotate(rot);
        for (let p = 0; p < 4; p++) {
          ctx.rotate(Math.PI / 2);
          const g = ctx.createRadialGradient(r * 0.5, 0, 0, r * 0.5, 0, r * 0.75);
          g.addColorStop(0, rgb([255 * tone, 255 * tone, 255 * tone]));
          g.addColorStop(1, rgb([190 * tone, 192 * tone, 205 * tone]));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(r * 0.52, 0, r * 0.56, r * 0.46, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(245,240,200,0.9)';
        ctx.beginPath();
        ctx.arc(0, 0, 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  return canvasTexture(canvas);
}

/** Four small wildflowers in a 2×2 atlas: daisy, buttercup, pink cosmos, violet. */
export function wildflowerAtlas(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size);
  const kinds: { petals: number; color: Rgb; tip: Rgb; centre: Rgb; len: number; wide: number }[] = [
    { petals: 14, color: [250, 248, 240], tip: [236, 232, 220], centre: [236, 180, 40], len: 0.4, wide: 0.09 },
    { petals: 5, color: [250, 212, 50], tip: [242, 180, 30], centre: [206, 140, 20], len: 0.36, wide: 0.2 },
    { petals: 8, color: [240, 150, 180], tip: [226, 100, 150], centre: [246, 210, 70], len: 0.42, wide: 0.15 },
    { petals: 5, color: [150, 120, 220], tip: [110, 80, 190], centre: [250, 230, 120], len: 0.36, wide: 0.19 },
  ];
  kinds.forEach((k, i) => {
    const cx = ((i % 2) + 0.5) * (size / 2);
    const cy = (Math.floor(i / 2) + 0.5) * (size / 2);
    const half = size / 2;
    for (let p = 0; p < k.petals; p++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((p / k.petals) * Math.PI * 2);
      const g = ctx.createLinearGradient(0, 0, k.len * half, 0);
      g.addColorStop(0, rgb(k.color));
      g.addColorStop(1, rgb(k.tip));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(k.len * half * 0.55, 0, k.len * half * 0.5, k.wide * half * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = rgb(k.centre);
    ctx.beginPath();
    ctx.arc(cx, cy, half * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });
  bleed(ctx, [230, 220, 200]);
  return cutout(canvas);
}

/** Bundle of grass-like blades for reeds and ornamental tufts (base at bottom). */
export function bladeTuftTexture(seed = 1): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  const rng = createRng(seed * 71);
  for (let i = 0; i < 26; i++) {
    const x0 = w / 2 + rng.range(-10, 10);
    const lean = rng.range(-0.42, 0.42) * w;
    const top = h * rng.range(0.02, 0.4);
    const width = rng.range(2.4, 5);
    ctx.fillStyle = rgb(mixRgb([52, 92, 36], [150, 176, 84], rng()));
    ctx.beginPath();
    ctx.moveTo(x0 - width, h);
    ctx.quadraticCurveTo(x0 + lean * 0.3, h * 0.55, x0 + lean, top);
    ctx.quadraticCurveTo(x0 + lean * 0.3 + width, h * 0.55, x0 + width, h);
    ctx.fill();
  }
  bleed(ctx, [86, 126, 52]);
  return cutout(canvas);
}

/**
 * A pine spray: a twig with side shoots, each ending in a pom-pom of long
 * needles with sky showing between them. Base of the twig at the bottom centre.
 */
export function pineSprayTexture(seed = 1): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = makeCanvas(size);
  const rng = createRng(seed * 4099);
  ctx.lineCap = 'round';

  const tuft = (cx: number, cy: number, radius: number, aim: number) => {
    const needles = 64;
    for (let i = 0; i < needles; i++) {
      // needles spray mostly forward of the shoot, a few backward
      const a = aim + rng.gauss() * 1.35;
      const len = radius * rng.range(0.55, 1.05);
      const droop = radius * 0.22;
      const ex = cx + Math.cos(a) * len;
      const ey = cy + Math.sin(a) * len + droop;
      const g = ctx.createLinearGradient(cx, cy, ex, ey);
      const tone = rng();
      g.addColorStop(0, rgb(mixRgb([70, 96, 40], [118, 142, 60], tone)));
      g.addColorStop(1, rgb(mixRgb([34, 70, 34], [84, 124, 52], tone)));
      ctx.strokeStyle = g;
      ctx.lineWidth = rng.range(1.5, 2.6);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo((cx + ex) / 2, (cy + ey) / 2 - droop * 0.4, ex, ey);
      ctx.stroke();
    }
  };

  const shoots: { x0: number; y0: number; x1: number; y1: number }[] = [{ x0: 0.5, y0: 1, x1: 0.5, y1: 0.24 }];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = 0.18 + (i / (n - 1)) * 0.62;
    const side = i % 2 ? 1 : -1;
    const y0 = 1 - t * 0.76;
    const reach = rng.range(0.2, 0.34) * (1 - t * 0.35);
    shoots.push({ x0: 0.5, y0, x1: 0.5 + side * reach, y1: y0 - rng.range(0.1, 0.2) });
  }
  // wood first, needles on top
  for (const s of shoots) {
    ctx.strokeStyle = rgb([78, 58, 40]);
    ctx.lineWidth = s.x0 === s.x1 ? 5 : 3.2;
    ctx.beginPath();
    ctx.moveTo(s.x0 * size, s.y0 * size);
    ctx.lineTo(s.x1 * size, s.y1 * size);
    ctx.stroke();
  }
  for (const s of shoots) {
    const aim = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
    tuft(s.x1 * size, s.y1 * size, size * rng.range(0.105, 0.14), aim);
    const mx = s.x0 + (s.x1 - s.x0) * 0.6;
    const my = s.y0 + (s.y1 - s.y0) * 0.6;
    if (s.x0 !== s.x1 && rng() < 0.6) tuft(mx * size, my * size, size * rng.range(0.07, 0.1), aim + rng.range(-0.8, 0.8));
  }
  bleed(ctx, [60, 96, 44]);
  const tex = cutout(canvas);
  tex.anisotropy = 8;
  return tex;
}
