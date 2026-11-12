import { describe, expect, it } from 'vitest';
import { FLASH_LENGTH, RAIN_LEVEL, TRANSITION, createWeatherState, flashEnvelope, nextStrikeDelay, stepWeather, thunderFor } from './weather';

const run = (state: ReturnType<typeof createWeatherState>, mode: 'morning' | 'rain', seconds: number, intensity: 'drizzle' | 'moderate' | 'heavy' = 'moderate') => {
  for (let t = 0; t < seconds; t += 1 / 60) stepWeather(state, mode, intensity, 1 / 60);
  return state;
};

describe('stepWeather', () => {
  it('starts as a dry morning and stays there', () => {
    const s = run(createWeatherState(), 'morning', 10);
    expect(s.rain).toBe(0);
    expect(s.wet).toBe(0);
  });

  it('brings the rain in over 3–6 seconds, smoothly', () => {
    const s = createWeatherState();
    let last = 0;
    let biggest = 0;
    for (let t = 0; t < 3; t += 1 / 60) {
      stepWeather(s, 'rain', 'moderate', 1 / 60);
      biggest = Math.max(biggest, s.rain - last);
      expect(s.rain).toBeGreaterThanOrEqual(last);
      last = s.rain;
    }
    expect(s.rain).toBeLessThan(1);
    expect(biggest).toBeLessThan(0.01);
    run(s, 'rain', 3);
    expect(s.rain).toBe(1);
    expect(TRANSITION).toBeGreaterThanOrEqual(3);
    expect(TRANSITION).toBeLessThanOrEqual(6);
  });

  it('returns exactly to morning, with surfaces drying after the rain stops', () => {
    const s = run(createWeatherState(), 'rain', 12);
    expect(s.wet).toBe(1);
    run(s, 'morning', 2);
    expect(s.wet).toBeGreaterThanOrEqual(s.rain);
    run(s, 'morning', 8);
    expect(s.rain).toBe(0);
    expect(s.wet).toBe(0);
  });

  it('can be reversed halfway without a jump', () => {
    const s = run(createWeatherState(), 'rain', 2);
    const before = s.rain;
    stepWeather(s, 'morning', 'moderate', 1 / 60);
    expect(Math.abs(s.rain - before)).toBeLessThan(0.01);
    expect(s.rain).toBeLessThan(before);
  });

  it('eases between intensities and holds the last one while clearing', () => {
    const s = run(createWeatherState(), 'rain', 8, 'heavy');
    expect(s.level).toBeCloseTo(RAIN_LEVEL.heavy, 2);
    stepWeather(s, 'rain', 'drizzle', 1 / 60);
    expect(s.level).toBeGreaterThan(0.9);
    run(s, 'rain', 8, 'drizzle');
    expect(s.level).toBeCloseTo(RAIN_LEVEL.drizzle, 2);
    run(s, 'morning', 3, 'heavy');
    expect(s.level).toBeCloseTo(RAIN_LEVEL.drizzle, 2);
  });

  it('survives bad time steps', () => {
    const s = createWeatherState();
    stepWeather(s, 'rain', 'heavy', Number.NaN);
    stepWeather(s, 'rain', 'heavy', -5);
    expect(s.rain).toBe(0);
    stepWeather(s, 'rain', 'heavy', 1000);
    expect(s.rain).toBeLessThan(0.05);
  });
});

describe('lightning', () => {
  it('is occasional, and rarer in lighter rain', () => {
    for (const rnd of [0, 0.5, 1]) {
      expect(nextStrikeDelay(1, rnd)).toBeGreaterThanOrEqual(20);
      expect(nextStrikeDelay(RAIN_LEVEL.drizzle, rnd)).toBeGreaterThan(nextStrikeDelay(1, rnd));
    }
  });

  it('flashes briefly, within 0..1, and never switches on in a single frame', () => {
    expect(flashEnvelope(-1)).toBe(0);
    expect(flashEnvelope(0)).toBe(0);
    expect(flashEnvelope(FLASH_LENGTH)).toBe(0);
    expect(flashEnvelope(Number.NaN)).toBe(0);
    let peak = 0;
    let last = 0;
    for (let t = 0; t <= FLASH_LENGTH; t += 1 / 60) {
      const v = flashEnvelope(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v - last).toBeLessThan(0.4);
      peak = Math.max(peak, v);
      last = v;
    }
    expect(peak).toBeGreaterThan(0.6);
    expect(FLASH_LENGTH).toBeLessThan(1);
  });

  it('delays thunder more, and makes it quieter, the further the strike', () => {
    const near = thunderFor(1.2);
    const far = thunderFor(5.5);
    expect(far.delay).toBeGreaterThan(near.delay);
    expect(far.strength).toBeLessThan(near.strength);
    expect(near.delay).toBeGreaterThan(1);
    expect(far.strength).toBeGreaterThan(0);
    expect(near.strength).toBeLessThanOrEqual(1);
  });
});
