/** Weather model: pure functions and constants, no rendering and no DOM. */

export type WeatherMode = 'morning' | 'rain';
export type RainIntensity = 'drizzle' | 'moderate' | 'heavy';

export const RAIN_INTENSITIES: readonly RainIntensity[] = ['drizzle', 'moderate', 'heavy'];

/** 0..1 strength of each intensity. Density, speed, wind, ripples, splashes, runoff and loudness all derive from it. */
export const RAIN_LEVEL: Record<RainIntensity, number> = { drizzle: 0.28, moderate: 0.62, heavy: 1 };

/** Seconds for the weather to change fully in either direction. */
export const TRANSITION = 4.5;
/** Seconds for surfaces to become fully wet, and to dry again. */
const WET_TIME = 5;
/** Time constant (s) with which a change of intensity settles. */
const LEVEL_TIME = 1.1;

export interface WeatherState {
  /** Linear progress of the transition, 0 = morning, 1 = rain. */
  progress: number;
  /** Eased presence of the rain, 0..1. */
  rain: number;
  /** Smoothed intensity, 0..1. */
  level: number;
  /** Surface wetness, 0..1. Follows the rain with a short lag. */
  wet: number;
}

export function createWeatherState(): WeatherState {
  return { progress: 0, rain: 0, level: RAIN_LEVEL.moderate, wet: 0 };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => t * t * (3 - 2 * t);

/** Advance the weather toward the requested mode and intensity. Mutates and returns `state`. */
export function stepWeather(state: WeatherState, mode: WeatherMode, intensity: RainIntensity, dt: number): WeatherState {
  const step = Number.isFinite(dt) ? Math.min(0.25, Math.max(0, dt)) : 0;
  const target = mode === 'rain' ? 1 : 0;
  const move = step / TRANSITION;
  state.progress = target > state.progress ? Math.min(target, state.progress + move) : Math.max(target, state.progress - move);
  state.rain = ease(state.progress);

  // intensity only matters while it rains; holding it otherwise keeps the fade-out from changing character
  if (mode === 'rain') state.level += (RAIN_LEVEL[intensity] - state.level) * (1 - Math.exp(-step / LEVEL_TIME));
  state.level = clamp01(state.level);

  const dw = step / WET_TIME;
  state.wet = state.rain > state.wet ? Math.min(state.rain, state.wet + dw) : Math.max(state.rain, state.wet - dw);
  return state;
}

/** Seconds until the next lightning strike. `rnd` is a uniform random number in 0..1. Heavier rain, sooner. */
export function nextStrikeDelay(level: number, rnd: number): number {
  const base = 20 + 24 * clamp01(rnd);
  return base / (0.35 + 0.65 * clamp01(level));
}

/** Length of one lightning flash in seconds. */
export const FLASH_LENGTH = 0.75;

/**
 * Brightness of a flash `age` seconds after it starts: a quick stroke and a
 * weaker return stroke, each rising over a few frames rather than switching on.
 */
export function flashEnvelope(age: number): number {
  if (!(age >= 0) || age >= FLASH_LENGTH) return 0;
  const pulse = (t: number, attack: number, decay: number) => (t < 0 ? 0 : t < attack ? t / attack : Math.exp(-(t - attack) / decay));
  return clamp01(Math.max(pulse(age, 0.05, 0.11), 0.6 * pulse(age - 0.27, 0.05, 0.13)) * (1 - age / FLASH_LENGTH));
}

/** A strike `km` away: how long the thunder takes to arrive (compressed from the real 3 s/km) and how loud it is. */
export function thunderFor(km: number): { delay: number; strength: number } {
  const d = Math.min(8, Math.max(1, km));
  return { delay: 1.2 + d * 1.5, strength: clamp01(1.25 / d + 0.2) };
}
