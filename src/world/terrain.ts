import { CABIN, CLEARING, DECK, STEPS, WATER_LEVEL, worldToCabin } from './layout';
import { fbm2, lerp, smoothstep } from './noise';
import { bridgeDeckY, onBridge, pondDepth, pondSDF } from './pond';

const BANK = 0.75;

/** Height of the land without the pond carved into it. */
export function landHeight(x: number, z: number): number {
  const d = Math.hypot(x - CLEARING.cx, z - CLEARING.cz);
  const outside = smoothstep(24, 95, d);
  const rolling = (fbm2(x * 0.07 + 3.1, z * 0.07 - 1.7, 3) - 0.5) * (0.06 + 1.6 * smoothstep(16, 40, d));
  const hills = Math.pow(outside, 1.35) * (7 + 13 * fbm2(x * 0.011 + 40, z * 0.011 + 12, 4));
  const backRise = smoothstep(18, 130, -z) * 5;
  const leftRise = smoothstep(30, 140, -x) * 3;
  return rolling + hills + backRise * outside + leftRise * outside;
}

/** Terrain surface height, including the pond bowl. */
export function groundHeight(x: number, z: number): number {
  const land = landHeight(x, z);
  const sd = pondSDF(x, z);
  if (sd >= BANK) return land;
  if (sd > 0) return lerp(WATER_LEVEL + 0.01, land, smoothstep(0, BANK, sd));
  return WATER_LEVEL + 0.01 - pondDepth(x, z);
}

export function onDeck(x: number, z: number, margin = 0): boolean {
  const [lx, lz] = worldToCabin(x, z);
  return lx > DECK.x0 - margin && lx < DECK.x1 + margin && lz > DECK.z0 - margin && lz < DECK.z1 + margin;
}

export function onSteps(x: number, z: number): boolean {
  const [lx, lz] = worldToCabin(x, z);
  return lx > STEPS.x0 && lx < STEPS.x1 && lz >= DECK.z1 && lz < STEPS.z1;
}

/** Height a walker's feet rest at: terrain, veranda deck, steps, or bridge. */
export function walkHeight(x: number, z: number): number {
  const [lx, lz] = worldToCabin(x, z);
  if (lx > DECK.x0 && lx < DECK.x1 && lz > DECK.z0 - 0.3 && lz <= DECK.z1) return CABIN.deckHeight;
  if (lx > STEPS.x0 && lx < STEPS.x1 && lz > DECK.z1 && lz < STEPS.z1) {
    const t = (lz - STEPS.z0) / (STEPS.z1 - STEPS.z0);
    return Math.max(groundHeight(x, z), CABIN.deckHeight * (1 - t));
  }
  const ground = groundHeight(x, z);
  if (onBridge(x, z)) return Math.max(ground, bridgeDeckY(z));
  return ground;
}
