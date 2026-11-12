import type { QualityLevel } from './quality';

export interface AdaptState {
  level: QualityLevel;
  /** Resolution multiplier on top of the profile's pixel-ratio cap, 0.6..1. */
  dprScale: number;
  /** Consecutive measurement windows that ran comfortably fast. */
  goodWindows: number;
}

export const MIN_DPR_SCALE = 0.6;
/** Clearly under 30, so a display or power mode capped at 30 fps is not read as a slow device. */
const LOW_FPS = 26;
const VERY_LOW_FPS = 18;
const GOOD_FPS = 56;
const GOOD_WINDOWS_NEEDED = 3;
const LOWER: Record<QualityLevel, QualityLevel | null> = { high: 'medium', medium: 'low', low: null };

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * One decision per measurement window. Resolution is the cheap lever, so it
 * goes first; when it is exhausted the whole profile steps down. Resolution
 * comes back slowly; the profile is never raised automatically, because that
 * rebuilds the scene and would oscillate on a borderline device.
 */
export function adaptQuality(state: AdaptState, fps: number): AdaptState {
  if (!Number.isFinite(fps) || fps <= 0) return state;

  if (fps < LOW_FPS) {
    if (state.dprScale > MIN_DPR_SCALE + 1e-6) {
      const step = fps < VERY_LOW_FPS ? 0.3 : 0.15;
      return { level: state.level, dprScale: round(Math.max(MIN_DPR_SCALE, state.dprScale - step)), goodWindows: 0 };
    }
    const lower = LOWER[state.level];
    if (lower) return { level: lower, dprScale: 1, goodWindows: 0 };
    return state.goodWindows === 0 ? state : { ...state, goodWindows: 0 };
  }

  if (fps >= GOOD_FPS && state.dprScale < 1) {
    const good = state.goodWindows + 1;
    if (good >= GOOD_WINDOWS_NEEDED) return { level: state.level, dprScale: round(Math.min(1, state.dprScale + 0.1)), goodWindows: 0 };
    return { ...state, goodWindows: good };
  }

  return state.goodWindows === 0 ? state : { ...state, goodWindows: 0 };
}
