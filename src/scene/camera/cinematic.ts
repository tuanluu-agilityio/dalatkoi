import { CABIN, DECK, POND, cabinToWorld } from '../../world/layout';
import { BRIDGE, pondPoint } from '../../world/pond';

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  /** Look-at target. */
  lx: number;
  ly: number;
  lz: number;
  fov: number;
  /** Depth-of-field focus distance in metres. */
  focus: number;
}

export interface CinematicSample extends CameraPose {
  /** 0 = clear, 1 = fully dark. Reaches 1 on every cut. */
  fade: number;
  shot: number;
}

type V3 = [number, number, number];

export interface Shot {
  name: string;
  duration: number;
  from: V3;
  to: V3;
  lookFrom: V3;
  lookTo: V3;
  fov: [number, number];
  focus: [number, number];
}

/** Seconds spent dipping to dark on each side of a cut. */
export const FADE_TIME = 0.9;

const at = (p: [number, number], y: number): V3 => [p[0], y, p[1]];
const cabinFront = (lx: number, ahead: number, y: number): V3 => at(cabinToWorld(lx, DECK.z1 + ahead), y);

/**
 * The guided tour. Each shot is a slow straight dolly with its own lens and
 * focus distance; cuts are hidden behind a dip to dark.
 */
export const SHOTS: Shot[] = [
  {
    name: 'arrival',
    duration: 10,
    from: [0.3, 3.3, 27],
    to: [0.9, 1.9, 18.6],
    lookFrom: [6.2, 2.6, -6],
    lookTo: [6.4, 2.0, -6],
    fov: [52, 47],
    focus: [30, 24],
  },
  {
    name: 'across the water',
    duration: 9,
    from: at(pondPoint(2.95, -0.9), 0.42),
    to: at(pondPoint(2.35, -1.7), 0.46),
    lookFrom: [CABIN.x - 1.5, 1.5, CABIN.z + 2],
    lookTo: [CABIN.x - 0.5, 1.8, CABIN.z + 2],
    fov: [36, 36],
    focus: [13, 12],
  },
  {
    name: 'koi',
    duration: 8,
    from: [POND.cx - 1.3, 2.5, POND.cz + 3.6],
    to: [POND.cx + 0.9, 2.2, POND.cz + 3.1],
    lookFrom: [POND.cx - 0.6, -0.4, POND.cz + 0.6],
    lookTo: [POND.cx + 0.4, -0.4, POND.cz + 0.4],
    fov: [31, 29],
    focus: [4.6, 4.2],
  },
  {
    name: 'the footbridge',
    duration: 8,
    from: [BRIDGE.x - 2.7, 0.95, BRIDGE.z0 + 2.3],
    to: [BRIDGE.x - 1.7, 1.3, BRIDGE.z0 + 1.0],
    lookFrom: [BRIDGE.x + 0.2, 0.9, (BRIDGE.z0 + BRIDGE.z1) / 2],
    lookTo: [BRIDGE.x + 0.3, 1.0, BRIDGE.z1],
    fov: [40, 38],
    focus: [5.5, 7],
  },
  {
    name: 'the veranda',
    duration: 9,
    from: cabinFront(-3.6, 3.4, 1.45),
    to: cabinFront(-0.4, 2.6, 1.75),
    lookFrom: at(cabinToWorld(0.6, DECK.z0), 1.8),
    lookTo: at(cabinToWorld(1.6, DECK.z0), 1.95),
    fov: [38, 36],
    focus: [6, 4.8],
  },
  {
    name: 'into the pines',
    duration: 9,
    from: [-15.6, 1.3, 4.6],
    to: [-14.7, 1.5, 3.0],
    lookFrom: [-12, 15, -3],
    lookTo: [-10, 17, -1],
    fov: [62, 60],
    focus: [28, 30],
  },
  {
    name: 'the clearing',
    duration: 10,
    from: [-16.5, 6.6, 15],
    to: [-11.2, 5.2, 18.2],
    lookFrom: [3, 1.2, -3],
    lookTo: [3.5, 1.2, -3],
    fov: [44, 44],
    focus: [28, 28],
  },
];

export const CINEMATIC_DURATION = SHOTS.reduce((a, s) => a + s.duration, 0);
/** The opening sequence plays the first two shots, then hands the visitor the controls. */
export const INTRO_DURATION = SHOTS[0].duration + SHOTS[1].duration;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Pose and fade at time `t` (seconds) on the looping timeline. */
export function sampleCinematic(t: number, out: CinematicSample = {} as CinematicSample): CinematicSample {
  let time = Number.isFinite(t) ? t % CINEMATIC_DURATION : 0;
  if (time < 0) time += CINEMATIC_DURATION;

  let index = 0;
  while (index < SHOTS.length - 1 && time >= SHOTS[index].duration) {
    time -= SHOTS[index].duration;
    index++;
  }
  const shot = SHOTS[index];
  const k = Math.min(1, time / shot.duration);
  // mostly linear with a little ease, so the dolly never visibly stops at a cut
  const e = lerp(k, k * k * (3 - 2 * k), 0.5);

  out.x = lerp(shot.from[0], shot.to[0], e);
  out.y = lerp(shot.from[1], shot.to[1], e);
  out.z = lerp(shot.from[2], shot.to[2], e);
  out.lx = lerp(shot.lookFrom[0], shot.lookTo[0], e);
  out.ly = lerp(shot.lookFrom[1], shot.lookTo[1], e);
  out.lz = lerp(shot.lookFrom[2], shot.lookTo[2], e);
  out.fov = lerp(shot.fov[0], shot.fov[1], e);
  out.focus = lerp(shot.focus[0], shot.focus[1], e);

  const edge = Math.min(time, shot.duration - time);
  const f = Math.min(1, Math.max(0, 1 - edge / FADE_TIME));
  out.fade = f * f * (3 - 2 * f);
  out.shot = index;
  return out;
}
