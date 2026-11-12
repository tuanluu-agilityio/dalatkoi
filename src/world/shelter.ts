import { CABIN, DECK, worldToCabin } from './layout';
import { smoothstep } from './noise';

/** How far the veranda roof reaches past the deck (cabin frame), matching the roof model. */
export const VERANDA_ROOF = { xHalf: CABIN.width / 2 + 0.4, z1: DECK.z1 + 0.55 } as const;

export interface Shelter {
  /** 0 under open sky … 1 well under a roof. */
  roof: number;
  /** 1 inside the cabin walls. */
  indoors: number;
}

const OPEN: Shelter = { roof: 0, indoors: 0 };

/** What is overhead at (x, z): open sky, the veranda roof, or the cabin itself. */
export function shelterAt(x: number, z: number, out: Shelter = { roof: 0, indoors: 0 }): Shelter {
  const [lx, lz] = worldToCabin(x, z);
  const hw = CABIN.width / 2;
  const hd = CABIN.depth / 2;
  if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
    out.roof = 1;
    out.indoors = 1;
    return out;
  }
  // distance inside the veranda roof's edge; negative outside it
  const inside = Math.min(VERANDA_ROOF.xHalf - Math.abs(lx), VERANDA_ROOF.z1 - lz, lz - (hd - 0.2));
  out.roof = inside <= -0.3 ? OPEN.roof : smoothstep(-0.3, 0.6, inside);
  out.indoors = 0;
  return out;
}
