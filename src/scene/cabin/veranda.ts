import * as THREE from 'three';
import { FURNITURE, VERANDA_POSTS } from '../../world/colliders';
import { CABIN, DECK, STEPS } from '../../world/layout';
import { FLOOR, HW } from './body';
import { type Builder, place } from './builder';

/** Top of the veranda posts / underside of the front beam. */
export const BEAM_Y = FLOOR + 2.22;
export const LANTERNS: [number, number, number][] = [
  [STEPS.x0 - 0.35, BEAM_Y - 0.42, DECK.z1 - 0.32],
  [STEPS.x1 + 0.35, BEAM_Y - 0.42, DECK.z1 - 0.32],
];
export const CHIME: [number, number, number] = [3.75, BEAM_Y - 0.12, DECK.z1 - 0.3];

function railing(b: Builder, x0: number, z0: number, x1: number, z1: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const rot = Math.atan2(-(z1 - z0), x1 - x0);
  const parent = place((x0 + x1) / 2, FLOOR, (z0 + z1) / 2, rot);
  b.box('trim', len, 0.05, 0.09, 0, 0.94, 0, { parent, uv: 'member' });
  b.box('trim', len, 0.04, 0.05, 0, 0.14, 0, { parent, uv: 'member' });
  const n = Math.max(2, Math.round(len / 0.135));
  for (let i = 1; i < n; i++) {
    const x = -len / 2 + (len * i) / n;
    b.box('trim', 0.034, 0.78, 0.034, x, 0.54, 0, { parent, uv: 'member', tint: b.rng.range(0.85, 1.08) });
  }
}

function chair(b: Builder, x: number, z: number, rotY: number): void {
  const parent = place(x, FLOOR, z, rotY);
  const o = { parent, uv: 'member' as const };
  // slatted seat and reclined back, wide arms: a porch chair made to be sat in for a long time
  for (let i = 0; i < 5; i++) b.box('furniture', 0.1, 0.022, 0.5, -0.22 + i * 0.11, 0.4, 0.02, { ...o, rot: [0.06, 0, 0], tint: b.rng.range(0.9, 1.08) });
  for (let i = 0; i < 5; i++) b.box('furniture', 0.1, 0.62, 0.022, -0.22 + i * 0.11, 0.72, -0.27, { ...o, rot: [-0.26, 0, 0], tint: b.rng.range(0.9, 1.08) });
  b.box('furniture', 0.56, 0.05, 0.03, 0, 1.02, -0.35, { ...o, rot: [-0.26, 0, 0] });
  for (const sx of [-1, 1]) {
    b.box('furniture', 0.05, 0.42, 0.05, sx * 0.27, 0.21, 0.22, o);
    b.box('furniture', 0.05, 0.62, 0.05, sx * 0.27, 0.31, -0.22, o);
    b.box('furniture', 0.09, 0.025, 0.58, sx * 0.3, 0.63, 0, o);
    b.box('furniture', 0.04, 0.22, 0.04, sx * 0.3, 0.52, 0.22, o);
  }
  b.box('fabric', 0.46, 0.05, 0.42, 0, 0.44, 0.03, { parent, rot: [0.06, 0, 0], tint: b.rng.range(0.9, 1.1) });
}

function pot(b: Builder, x: number, z: number, r: number): void {
  const h = r * 1.5;
  const profile = [
    new THREE.Vector2(r * 0.62, 0),
    new THREE.Vector2(r * 0.7, h * 0.08),
    new THREE.Vector2(r * 0.96, h * 0.86),
    new THREE.Vector2(r * 1.06, h * 0.88),
    new THREE.Vector2(r * 1.06, h),
    new THREE.Vector2(r * 0.9, h),
  ];
  b.add('terracotta', new THREE.LatheGeometry(profile, 18), place(x, FLOOR, z), b.rng.range(0.85, 1.1));
  const soil = new THREE.CircleGeometry(r * 0.9, 14);
  soil.rotateX(-Math.PI / 2);
  b.add('soil', soil, place(x, FLOOR + h * 0.93, z));
}

/** Deck, steps, posts, beams, railings, furniture, lantern housings. */
export function buildVeranda(b: Builder): void {
  const midZ = (DECK.z0 + DECK.z1) / 2;

  // deck boards and the frame under them
  b.box('deck', CABIN.width, 0.07, CABIN.deckDepth, 0, FLOOR - 0.035, midZ, { tile: 1.7 });
  b.box('dark', CABIN.width, 0.16, 0.06, 0, FLOOR - 0.15, DECK.z1 - 0.03, { uv: 'member' });
  for (const sx of [-1, 1]) b.box('dark', 0.06, 0.16, CABIN.deckDepth, sx * (HW - 0.03), FLOOR - 0.15, midZ, { uv: 'member' });
  // lattice skirt hiding the void under the deck
  for (let x = -HW + 0.12; x < HW; x += 0.22) {
    if (x > STEPS.x0 - 0.1 && x < STEPS.x1 + 0.1) continue;
    b.box('dark', 0.05, FLOOR - 0.2, 0.025, x, (FLOOR - 0.2) / 2, DECK.z1 - 0.05, { uv: 'member', tint: b.rng.range(0.8, 1.05) });
  }
  for (const sx of [-1, 1]) {
    for (let z = DECK.z0 + 0.12; z < DECK.z1; z += 0.22) {
      b.box('dark', 0.025, FLOOR - 0.2, 0.05, sx * (HW - 0.04), (FLOOR - 0.2) / 2, z, { uv: 'member', tint: b.rng.range(0.8, 1.05) });
    }
  }

  // steps: three treads on two stringers
  const run = CABIN.stepsRun / 3;
  for (let i = 0; i < 3; i++) {
    const y = FLOOR - (i + 1) * (FLOOR / 4);
    const z = STEPS.z0 + run * (i + 0.5);
    b.box('deck', CABIN.stepsWidth, 0.05, run + 0.04, CABIN.stepsX, y, z, { tile: 1.7, tint: 0.95 });
    b.box('dark', CABIN.stepsWidth - 0.1, FLOOR / 4 - 0.05, 0.03, CABIN.stepsX, y - FLOOR / 8, z - run / 2 + 0.02, { uv: 'member' });
  }
  for (const sx of [-1, 1]) {
    b.box('dark', 0.06, 0.2, CABIN.stepsRun * 1.12, CABIN.stepsX + sx * (CABIN.stepsWidth / 2 + 0.01), FLOOR / 2 - 0.08, STEPS.z0 + CABIN.stepsRun / 2, {
      uv: 'member', rot: [Math.atan2(FLOOR, CABIN.stepsRun), 0, 0],
    });
  }

  // posts with small knee braces, front beam, side beams
  for (const [x, z] of VERANDA_POSTS) {
    b.box('trim', 0.15, BEAM_Y - FLOOR, 0.15, x, (BEAM_Y + FLOOR) / 2, z, { uv: 'member' });
    b.box('trim', 0.2, 0.06, 0.2, x, FLOOR + 0.03, z, { uv: 'member', tint: 0.8 });
    for (const s of [-1, 1]) {
      if (Math.abs(x + s * 0.3) > HW) continue;
      b.box('trim', 0.5, 0.07, 0.07, x + s * 0.2, BEAM_Y - 0.2, z, { uv: 'member', rot: [0, 0, s * -0.78] });
    }
  }
  b.box('trim', CABIN.width + 0.5, 0.2, 0.17, 0, BEAM_Y + 0.1, DECK.z1 - 0.1, { uv: 'member' });
  for (const sx of [-1, 1]) b.box('trim', 0.17, 0.2, CABIN.deckDepth, sx * (HW - 0.1), BEAM_Y + 0.1, midZ, { uv: 'member' });

  // railings
  railing(b, DECK.x0 + 0.17, DECK.z1 - 0.1, STEPS.x0 - 0.17, DECK.z1 - 0.1);
  railing(b, STEPS.x1 + 0.17, DECK.z1 - 0.1, 1.9 - 0.07, DECK.z1 - 0.1);
  railing(b, 1.9 + 0.07, DECK.z1 - 0.1, DECK.x1 - 0.17, DECK.z1 - 0.1);
  railing(b, DECK.x0 + 0.1, DECK.z0, DECK.x0 + 0.1, DECK.z1 - 0.17);
  railing(b, DECK.x1 - 0.1, DECK.z0, DECK.x1 - 0.1, DECK.z1 - 0.17);

  // furniture
  for (const [x, z, r] of FURNITURE.chairs) chair(b, x, z, r);
  const [tx, tz] = FURNITURE.table;
  b.add('furniture', new THREE.CylinderGeometry(0.27, 0.27, 0.035, 24), place(tx, FLOOR + 0.5, tz));
  b.add('furniture', new THREE.CylinderGeometry(0.035, 0.05, 0.5, 10), place(tx, FLOOR + 0.25, tz), 0.85);
  b.add('furniture', new THREE.CylinderGeometry(0.16, 0.18, 0.03, 16), place(tx, FLOOR + 0.015, tz), 0.85);
  // tea for two
  const cup = new THREE.CylinderGeometry(0.032, 0.024, 0.045, 12);
  b.add('ceramic', cup.clone(), place(tx - 0.12, FLOOR + 0.54, tz + 0.06));
  b.add('ceramic', cup.clone(), place(tx + 0.13, FLOOR + 0.54, tz + 0.02));
  const teapot = new THREE.SphereGeometry(0.07, 14, 10);
  teapot.scale(1, 0.8, 1);
  b.add('ceramic', teapot, place(tx, FLOOR + 0.575, tz - 0.08), 0.92);
  b.add('ceramic', new THREE.CylinderGeometry(0.012, 0.018, 0.09, 8).rotateZ(1.1), place(tx + 0.085, FLOOR + 0.585, tz - 0.08), 0.92);

  // bench under the left window
  const [bx, bz] = FURNITURE.bench;
  const bp = place(bx, FLOOR, bz);
  for (let i = 0; i < 3; i++) b.box('furniture', 1.4, 0.03, 0.12, 0, 0.44, -0.13 + i * 0.13, { parent: bp, uv: 'member', tint: b.rng.range(0.85, 1.0) });
  for (const sx of [-1, 1]) {
    b.box('furniture', 0.06, 0.43, 0.38, sx * 0.6, 0.215, 0, { parent: bp, uv: 'member', tint: 0.85 });
  }
  b.box('fabric', 0.42, 0.1, 0.34, -0.36, 0.5, 0, { parent: bp, rot: [0, 0.15, 0], tint: 1.25 });

  // potted plants (foliage is added by the vegetation layer)
  for (const [x, z, r] of FURNITURE.pots) pot(b, x, z, r);

  // lantern housings; the glowing panes are a separate material
  for (const [x, y, z] of LANTERNS) {
    b.add('metal', new THREE.CylinderGeometry(0.006, 0.006, 0.3, 5), place(x, y + 0.27, z));
    b.box('metal', 0.17, 0.02, 0.17, x, y + 0.12, z);
    b.box('metal', 0.17, 0.02, 0.17, x, y - 0.12, z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('metal', 0.014, 0.24, 0.014, x + sx * 0.075, y, z + sz * 0.075);
    b.add('metal', new THREE.ConeGeometry(0.14, 0.07, 4).rotateY(Math.PI / 4), place(x, y + 0.165, z));
    b.box('lamp', 0.13, 0.2, 0.13, x, y, z);
  }
}
