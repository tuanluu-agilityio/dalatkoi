import * as THREE from 'three';
import { CABIN, DECK } from '../../world/layout';
import { CHIMNEY } from '../../world/colliders';
import { type Builder, place } from './builder';

export const FLOOR = CABIN.deckHeight;
export const WALL_TOP = FLOOR + CABIN.wallHeight + 0.1;
export const HW = CABIN.width / 2;
export const HD = CABIN.depth / 2;
export const RIDGE_Y = WALL_TOP + HD * CABIN.roofPitch;
const T = 0.14; // wall thickness

/** Wall frames: +Z of the frame points out of the wall, origin on the wall's outer face at ground level. */
const WALLS = {
  front: place(0, 0, HD),
  back: place(0, 0, -HD, Math.PI),
  left: place(-HW, 0, 0, -Math.PI / 2),
  right: place(HW, 0, 0, Math.PI / 2),
};

function window_(b: Builder, wall: THREE.Matrix4, x: number, y: number, w: number, h: number, cols = 2, rows = 2): void {
  const parent = wall;
  const f = 0.09; // frame board width
  b.box('trim', w + f * 2, f, 0.07, x, y + h / 2 + f / 2, 0.035, { parent, uv: 'member' });
  b.box('trim', w + f * 2, f, 0.07, x, y - h / 2 - f / 2, 0.035, { parent, uv: 'member' });
  b.box('trim', f, h, 0.07, x - w / 2 - f / 2, y, 0.035, { parent, uv: 'member' });
  b.box('trim', f, h, 0.07, x + w / 2 + f / 2, y, 0.035, { parent, uv: 'member' });
  b.box('trim', w + 0.34, 0.05, 0.16, x, y - h / 2 - f - 0.02, 0.08, { parent, uv: 'member', tint: 0.9 });
  for (let c = 1; c < cols; c++) b.box('trim', 0.035, h, 0.04, x - w / 2 + (w * c) / cols, y, 0.02, { parent, uv: 'member' });
  for (let r = 1; r < rows; r++) b.box('trim', w, 0.035, 0.04, x, y - h / 2 + (h * r) / rows, 0.02, { parent, uv: 'member' });
  const glass = new THREE.PlaneGeometry(w, h);
  b.add('glass', glass, parent.clone().multiply(place(x, y, 0.008)));
}

/** Walls, plinth, gables, windows, door, chimney. */
export function buildBody(b: Builder): void {
  const wallH = WALL_TOP - CABIN.plinthHeight;
  const wallY = CABIN.plinthHeight + wallH / 2;

  // stone plinth, a touch proud of the timber walls, with a capping course
  b.box('stone', CABIN.width + 0.16, CABIN.plinthHeight, CABIN.depth + 0.16, 0, CABIN.plinthHeight / 2, 0, { tile: 1.7 });
  b.box('trim', CABIN.width + 0.22, 0.06, CABIN.depth + 0.22, 0, CABIN.plinthHeight + 0.03, 0, { uv: 'member', tint: 0.8 });

  // lap-sided walls
  b.box('siding', CABIN.width, wallH, T, 0, wallY, HD - T / 2, { tile: 2 });
  b.box('siding', CABIN.width, wallH, T, 0, wallY, -HD + T / 2, { tile: 2 });
  b.box('siding', T, wallH, CABIN.depth - T * 2, -HW + T / 2, wallY, 0, { tile: 2 });
  b.box('siding', T, wallH, CABIN.depth - T * 2, HW - T / 2, wallY, 0, { tile: 2 });

  // gables
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-HD, 0);
    shape.lineTo(HD, 0);
    shape.lineTo(0, RIDGE_Y - WALL_TOP);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2 + 0.37, uv.getY(i) / 2 + 0.11);
    geo.rotateY(Math.PI / 2);
    b.add('siding', geo, place(side > 0 ? HW - T : -HW, WALL_TOP, 0), 0.96);
    // small louvred vent in each gable
    b.box('trim', 0.06, 0.5, 0.5, side * (HW + 0.02), WALL_TOP + 0.75, 0, { uv: 'member', tint: 0.7 });
    for (let k = 0; k < 4; k++) {
      b.box('dark', 0.05, 0.03, 0.4, side * (HW + 0.05), WALL_TOP + 0.58 + k * 0.11, 0, { uv: 'member', rot: [0, 0, side * 0.5] });
    }
  }

  // corner posts and plates
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box('trim', 0.2, wallH + 0.02, 0.2, sx * (HW - 0.04), wallY, sz * (HD - 0.04), { uv: 'member' });
    }
  }
  b.box('trim', CABIN.width + 0.12, 0.14, 0.1, 0, WALL_TOP - 0.07, HD + 0.02, { uv: 'member' });
  b.box('trim', CABIN.width + 0.12, 0.14, 0.1, 0, WALL_TOP - 0.07, -HD - 0.02, { uv: 'member' });

  // windows
  const wy = FLOOR + 1.62;
  window_(b, WALLS.front, 1.15, wy, 1.4, 1.25, 2, 2);
  window_(b, WALLS.front, 3.2, wy, 1.1, 1.25, 2, 2);
  window_(b, WALLS.front, -3.45, wy, 1.1, 1.25, 2, 2);
  window_(b, WALLS.left, 0.2, wy, 1.7, 1.25, 3, 2);
  window_(b, WALLS.right, 1.5, wy, 1.0, 1.25, 2, 2);
  window_(b, WALLS.back, -2.2, wy + 0.1, 1.0, 1.0, 2, 2);
  window_(b, WALLS.back, 2.2, wy + 0.1, 1.0, 1.0, 2, 2);

  // front door
  const door = WALLS.front;
  const dx = CABIN.stepsX;
  const dh = 2.08;
  b.box('dark', 1.0, dh, 0.06, dx, FLOOR + dh / 2, 0.03, { parent: door, uv: 'tileV', tile: 1.6, tint: 1.25 });
  b.box('trim', 0.1, dh + 0.1, 0.1, dx - 0.55, FLOOR + dh / 2 + 0.05, 0.05, { parent: door, uv: 'member' });
  b.box('trim', 0.1, dh + 0.1, 0.1, dx + 0.55, FLOOR + dh / 2 + 0.05, 0.05, { parent: door, uv: 'member' });
  b.box('trim', 1.3, 0.12, 0.12, dx, FLOOR + dh + 0.11, 0.06, { parent: door, uv: 'member' });
  for (const y of [0.3, 1.0, 1.75]) b.box('trim', 0.9, 0.08, 0.03, dx, FLOOR + y, 0.07, { parent: door, uv: 'member', tint: 0.85 });
  b.add('glass', new THREE.PlaneGeometry(0.42, 0.34), door.clone().multiply(place(dx, FLOOR + 1.42, 0.065)));
  b.box('trim', 0.5, 0.42, 0.02, dx, FLOOR + 1.42, 0.058, { parent: door, uv: 'member', tint: 0.8 });
  b.add('brass', new THREE.SphereGeometry(0.035, 12, 8), door.clone().multiply(place(dx + 0.38, FLOOR + 1.0, 0.1)));
  b.box('fabric', 0.9, 0.02, 0.5, dx, FLOOR + 0.012, 0.42, { parent: door });

  // chimney: stone stack on the right-hand wall, corbelled cap
  const top = RIDGE_Y + 0.75;
  b.box('stone', CHIMNEY.hw * 2, top, CHIMNEY.hd * 2, CHIMNEY.lx, top / 2, CHIMNEY.lz, { tile: 1.7, tint: 0.95 });
  b.box('stone', CHIMNEY.hw * 2 + 0.16, 0.12, CHIMNEY.hd * 2 + 0.16, CHIMNEY.lx, top + 0.06, CHIMNEY.lz, { tile: 1.7, tint: 0.7 });
  b.box('metal', 0.36, 0.3, 0.36, CHIMNEY.lx, top + 0.27, CHIMNEY.lz);

  // a stack of split firewood against the left wall, under the eave
  const logs = new THREE.CylinderGeometry(0.07, 0.075, 0.42, 7);
  logs.rotateZ(Math.PI / 2);
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i < 9 - (row % 2); i++) {
      const z = -2.2 + i * 0.15 + (row % 2) * 0.075 + b.rng.range(-0.01, 0.01);
      const m = place(-HW - 0.3, 0.08 + row * 0.135, z);
      b.add(row % 3 === 0 ? 'trim' : 'furniture', logs.clone(), m, b.rng.range(0.6, 1.05));
    }
  }
  void DECK;
}
