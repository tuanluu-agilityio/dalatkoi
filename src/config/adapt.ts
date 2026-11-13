import type { QualityLevel } from './quality';

export interface AdaptState {
  level: QualityLevel;
  /** Resolution multiplier on top of the profile's pixel-ratio cap, 0.6..1. */
  dprScale: number;
  /** Consecutive measurement windows that ran comfortably fast. */
  goodWindows: number;
  /** A lower resolution being tried: where it came from and the frame rate it has to beat. */
  probe: { from: number; fps: number } | null;
  /** Windows to sit still before trying or giving back anything. */
  hold: number;
  /** How long the next hold will be. Doubles each time, so a device that cannot be helped is left alone. */
  backoff: number;
}

export const MIN_DPR_SCALE = 0.6;
/** Clearly under 30, so a display or power mode capped at 30 fps is not read as a slow device. */
const LOW_FPS = 26;
const VERY_LOW_FPS = 18;
/** Below this the scene is playable but not smooth, and resolution is worth trying. */
const TARGET_FPS = 45;
const GOOD_FPS = 56;
const GOOD_WINDOWS_NEEDED = 3;
/** Large enough that a device limited by its GPU answers clearly; a frame-rate cap does not answer at all. */
const PROBE_STEP = 0.2;
/** What counts as an answer. */
const PROBE_GAIN = 1.08;
const FIRST_BACKOFF = 4;
const MAX_BACKOFF = 64;
const LOWER: Record<QualityLevel, QualityLevel | null> = { high: 'medium', medium: 'low', low: null };

const round = (v: number) => Math.round(v * 100) / 100;

export function initialAdapt(level: QualityLevel): AdaptState {
  return { level, dprScale: 1, goodWindows: 0, probe: null, hold: 0, backoff: FIRST_BACKOFF };
}

/**
 * One decision per measurement window. Resolution is the cheap lever, so it
 * goes first; when it is exhausted the whole profile steps down. Resolution
 * comes back slowly; the profile is never raised automatically, because that
 * rebuilds the scene and would oscillate on a borderline device.
 *
 * Three bands. Under 26 fps the device is struggling and resolution is taken
 * without asking. From 26 to 45 the scene is playable but not smooth, and the
 * reason is unknown: a GPU short of fill rate, or a display, power mode or
 * browser that caps the rate. So a lower resolution is tried for one window
 * and kept only if the frame rate answers; if it does not, it is put back and
 * the next try waits twice as long. Above that nothing is taken.
 */
export function adaptQuality(state: AdaptState, fps: number): AdaptState {
  if (!Number.isFinite(fps) || fps <= 0) return state;

  if (fps < LOW_FPS) {
    if (state.dprScale > MIN_DPR_SCALE + 1e-6) {
      const step = fps < VERY_LOW_FPS ? 0.3 : 0.15;
      return { ...state, dprScale: round(Math.max(MIN_DPR_SCALE, state.dprScale - step)), goodWindows: 0, probe: null };
    }
    const lower = LOWER[state.level];
    if (lower) return initialAdapt(lower);
    return state.goodWindows === 0 && !state.probe ? state : { ...state, goodWindows: 0, probe: null };
  }

  if (state.probe) {
    if (fps >= state.probe.fps * PROBE_GAIN) return { ...state, goodWindows: 0, probe: null };
    return {
      ...state,
      dprScale: state.probe.from,
      goodWindows: 0,
      probe: null,
      hold: state.backoff,
      backoff: Math.min(MAX_BACKOFF, state.backoff * 2),
    };
  }

  if (state.hold > 0) return { ...state, goodWindows: 0, hold: state.hold - 1 };

  if (fps < TARGET_FPS && state.dprScale > MIN_DPR_SCALE + 1e-6) {
    return {
      ...state,
      dprScale: round(Math.max(MIN_DPR_SCALE, state.dprScale - PROBE_STEP)),
      goodWindows: 0,
      probe: { from: state.dprScale, fps },
    };
  }

  if (fps >= GOOD_FPS && state.dprScale < 1) {
    const good = state.goodWindows + 1;
    if (good < GOOD_WINDOWS_NEEDED) return { ...state, goodWindows: good };
    // giving resolution back may cost the smoothness it bought; wait before touching it again
    return {
      ...state,
      dprScale: round(Math.min(1, state.dprScale + 0.1)),
      goodWindows: 0,
      hold: state.backoff,
      backoff: Math.min(MAX_BACKOFF, state.backoff * 2),
    };
  }

  return state.goodWindows === 0 ? state : { ...state, goodWindows: 0 };
}
