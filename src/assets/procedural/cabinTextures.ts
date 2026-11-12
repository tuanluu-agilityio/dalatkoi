import * as THREE from 'three';
import { canvasTexture, makeCanvas, pixelFill, rgb, tileNoise } from './canvas';

/**
 * What you glimpse through a lit window at dawn: a lamp, curtains, a shelf.
 * Used as the emissive map of the window glass.
 */
export function interiorTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#5a3516');
  g.addColorStop(0.55, '#3a2110');
  g.addColorStop(1, '#170d07');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  // back wall boards
  ctx.strokeStyle = 'rgba(20,10,4,0.35)';
  for (let x = 14; x < 256; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  // shelf with a few objects
  ctx.fillStyle = '#1c1009';
  ctx.fillRect(30, 150, 120, 6);
  for (const [x, w, h, c] of [[40, 14, 26, '#6b3f1f'], [58, 10, 34, '#3d4a2c'], [72, 18, 20, '#7a5a34'], [98, 12, 30, '#5a2e22'], [118, 20, 16, '#8a6a3a']] as const) {
    ctx.fillStyle = c;
    ctx.fillRect(x, 150 - h, w, h);
  }
  // lamp: shade and glow
  const lamp = ctx.createRadialGradient(178, 92, 2, 178, 92, 120);
  lamp.addColorStop(0, 'rgba(255,214,150,1)');
  lamp.addColorStop(0.12, 'rgba(255,180,96,0.85)');
  lamp.addColorStop(0.45, 'rgba(230,130,50,0.32)');
  lamp.addColorStop(1, 'rgba(120,60,20,0)');
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,236,196,0.95)';
  ctx.beginPath();
  ctx.moveTo(160, 104);
  ctx.lineTo(196, 104);
  ctx.lineTo(188, 76);
  ctx.lineTo(168, 76);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1a0f08';
  ctx.fillRect(176, 104, 4, 46);
  // curtains
  for (const side of [0, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = side ? 256 - 8 - i * 7 : i * 7;
      ctx.fillStyle = rgb([112 - i * 9, 56 - i * 5, 34 - i * 3], 0.92);
      ctx.fillRect(x, 0, 8, 256);
    }
  }
  const tex = canvasTexture(canvas, { wrap: false });
  return tex;
}

/** Fired-clay surface for roof tiles: mottled, slightly sooty, with lichen specks. */
export function clayTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128);
  pixelFill(ctx, (u, v) => {
    const n = tileNoise(u, v, 5, 4, 3);
    const speck = tileNoise(u, v, 34, 2, 8);
    const base = 150 + n * 80 + speck * 30;
    const lichen = Math.max(0, tileNoise(u, v, 9, 3, 61) - 0.62) * 3;
    return [base * (1 - lichen * 0.35), base * (0.9 + lichen * 0.12), base * (0.86 - lichen * 0.1)];
  });
  return canvasTexture(canvas, { anisotropy: 4 });
}
