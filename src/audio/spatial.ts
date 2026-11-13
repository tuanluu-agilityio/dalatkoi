/**
 * Where a short sound sits for the listener, worked out once on the main thread.
 *
 * This is the arithmetic an equal-power `PannerNode` with the inverse distance
 * model performs, so a sound that lasts a tenth of a second can be placed
 * without a panner of its own. Pure: no Web Audio, no DOM.
 */

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Unit forward vector. */
  fx: number;
  fy: number;
  fz: number;
}

export interface Placement {
  /** −1 hard left … 1 hard right, linear in azimuth as the Web Audio panner defines it. */
  pan: number;
  /** Distance attenuation, 0..1. */
  gain: number;
}

const HALF_PI = Math.PI / 2;

/**
 * Pan and distance gain for a source at (x, y, z), heard from `listener` (up is +Y).
 * Sources behind the listener fold onto the front, as they do in an equal-power panner.
 */
export function placeSound(listener: Pose, x: number, y: number, z: number, refDistance: number, rolloff: number, out: Placement): Placement {
  out.pan = 0;
  out.gain = 1;
  const dx = x - listener.x;
  const dy = y - listener.y;
  const dz = z - listener.z;
  const distance = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(distance) || distance < 1e-6) return out;

  const ref = Math.max(1e-6, refDistance);
  out.gain = ref / (ref + Math.max(0, rolloff) * (Math.max(distance, ref) - ref));

  // right = forward × up, with up = (0, 1, 0)
  let rx = -listener.fz;
  let rz = listener.fx;
  const rl = Math.hypot(rx, rz);
  if (!Number.isFinite(rl) || rl < 1e-6) return out; // looking straight up or down
  rx /= rl;
  rz /= rl;
  // the listener's own up: right × forward
  const ux = -rz * listener.fy;
  const uy = rz * listener.fx - rx * listener.fz;
  const uz = rx * listener.fy;
  // drop the part of the direction that points along it, leaving the direction around the head
  const along = (dx * ux + dy * uy + dz * uz) / distance;
  const px = dx / distance - along * ux;
  const pz = dz / distance - along * uz;
  const py = dy / distance - along * uy;
  const pl = Math.hypot(px, py, pz);
  if (!Number.isFinite(pl) || pl < 1e-6) return out; // directly overhead
  const side = Math.min(1, Math.max(-1, (px * rx + pz * rz) / pl));
  out.pan = Math.asin(side) / HALF_PI;
  return out;
}

/** Fixed stereo positions shared by all short placed sounds: 12° apart at most from where the sound belongs. */
export const LANE_PANS: readonly number[] = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];

/** Index of the lane nearest to `pan`. */
export function laneFor(pan: number): number {
  const last = LANE_PANS.length - 1;
  if (!Number.isFinite(pan)) return last / 2;
  return Math.min(last, Math.max(0, Math.round(((pan + 1) / 2) * last)));
}
