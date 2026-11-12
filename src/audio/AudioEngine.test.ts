import { describe, expect, it } from 'vitest';
import { AudioEngine, busGains } from './AudioEngine';
import { createFakeContext } from './fakeContext';

const volumes = { master: 0.8, ambient: 0.8, environment: 0.85, footsteps: 0.7, rain: 0.85 };
const listener = { x: 0, y: 1.65, z: 16, fx: 0, fy: 0, fz: -1 };
const world = { gust: 0.5, walkSpeed: 0, embodied: true };

describe('busGains', () => {
  it('silences the master when muted and leaves the buses alone', () => {
    const g = busGains(volumes, true);
    expect(g.master).toBe(0);
    expect(g.ambient).toBeGreaterThan(0);
  });
  it('uses a perceptual curve and clamps bad values', () => {
    expect(busGains({ ...volumes, master: 0.5 }, false).master).toBeCloseTo(0.25, 6);
    expect(busGains({ ...volumes, master: 4 }, false).master).toBe(1);
    expect(busGains({ ...volumes, ambient: Number.NaN }, false).ambient).toBe(0);
    expect(busGains({ ...volumes, footsteps: -1 }, false).footsteps).toBe(0);
  });
});

describe('AudioEngine', () => {
  it('makes no sound and throws nothing before it is started', () => {
    const engine = new AudioEngine();
    expect(engine.started).toBe(false);
    expect(() => {
      engine.update(0.016, listener, world);
      engine.footstep('gravel', 1.9);
      engine.plop(1, 2, 0.5);
      engine.setLevels(volumes, false);
      engine.suspend();
      engine.resume();
      engine.dispose();
    }).not.toThrow();
  });

  it('creates exactly one context, only when start is called', () => {
    const engine = new AudioEngine();
    let made = 0;
    const factory = () => {
      made++;
      return createFakeContext().ctx;
    };
    expect(made).toBe(0);
    expect(engine.start(factory)).toBe(true);
    expect(engine.start(factory)).toBe(true);
    expect(made).toBe(1);
    expect(engine.started).toBe(true);
  });

  it('stays silent, without throwing, when the browser has no Web Audio', () => {
    const engine = new AudioEngine();
    expect(
      engine.start(() => {
        throw new Error('no audio device');
      }),
    ).toBe(false);
    expect(engine.started).toBe(false);
    expect(() => engine.footstep('grass', 1)).not.toThrow();
  });

  it('applies mute and volume to the master gain', () => {
    const fake = createFakeContext();
    const engine = new AudioEngine();
    engine.setLevels(volumes, true); // set before start: remembered
    engine.start(() => fake.ctx);
    expect(engine.levels.master).toBe(0);
    engine.setLevels({ ...volumes, master: 1 }, false);
    expect(engine.levels.master).toBe(1);
    expect(engine.levels.footsteps).toBeCloseTo(0.49, 6);
  });

  it('runs every voice against a context without errors', () => {
    const fake = createFakeContext();
    const engine = new AudioEngine();
    engine.start(() => fake.ctx);
    expect(() => {
      for (const surface of ['grass', 'gravel', 'stone', 'bridge', 'veranda'] as const) engine.footstep(surface, 2);
      engine.plop(-2, 3, 0.8);
      // ten simulated minutes: birds, chimes and creaks all get scheduled
      for (let i = 0; i < 6000; i++) {
        fake.advance(0.1);
        engine.update(0.1, listener, { gust: 0.5 + 0.5 * Math.sin(i * 0.01), walkSpeed: 1, embodied: true });
      }
    }).not.toThrow();
    expect(fake.created.oscillator).toBeGreaterThan(10);
  });

  it('never lets one-shot voices pile up without limit', () => {
    const fake = createFakeContext();
    const engine = new AudioEngine();
    engine.start(() => fake.ctx);
    const before = fake.created.bufferSource;
    for (let i = 0; i < 500; i++) engine.footstep('gravel', 3);
    expect(fake.created.bufferSource - before).toBeLessThan(60);
  });

  it('does not build a positioned source for a voice it will refuse', () => {
    const fake = createFakeContext();
    const engine = new AudioEngine();
    engine.start(() => fake.ctx);
    for (let i = 0; i < 40; i++) engine.plop(0, 0, 1);
    const before = fake.created.panner;
    for (let i = 0; i < 40; i++) engine.plop(0, 0, 1);
    expect(fake.created.panner).toBe(before);
  });

  it('resumes from an interrupted context as well as a suspended one', () => {
    const fake = createFakeContext();
    const engine = new AudioEngine();
    engine.start(() => fake.ctx);
    (fake.ctx as unknown as { state: string }).state = 'interrupted';
    engine.resume();
    expect(fake.ctx.state).toBe('running');
  });

  it('suspends, resumes and closes the context', () => {
    const fake = createFakeContext();
    const engine = new AudioEngine();
    engine.start(() => fake.ctx);
    engine.suspend();
    expect(fake.ctx.state).toBe('suspended');
    engine.resume();
    expect(fake.ctx.state).toBe('running');
    engine.dispose();
    expect(fake.ctx.state).toBe('closed');
    expect(engine.started).toBe(false);
  });
  describe('rain', () => {
    const rain = { rain: 1, level: 1, wet: 1, roof: 0, indoors: 0 };

    it('accepts weather and thunder before it is started', () => {
      const engine = new AudioEngine();
      expect(() => {
        engine.setWeather(rain);
        engine.setThunderEnabled(false);
        engine.thunder(2, 0.8);
        engine.update(0.016, listener, world);
      }).not.toThrow();
    });

    it('adds no one-shot voices on a dry morning', () => {
      const dry = createFakeContext();
      const wet = createFakeContext();
      const a = new AudioEngine();
      const b = new AudioEngine();
      a.start(() => dry.ctx);
      b.start(() => wet.ctx);
      b.setWeather(rain);
      const before = [dry.created.panner, wet.created.panner];
      for (let i = 0; i < 100; i++) {
        dry.advance(0.1);
        wet.advance(0.1);
        a.update(0.1, listener, world);
        b.update(0.1, listener, world);
      }
      // ten seconds: the dry engine places a few birds at most; the wet one hears drops everywhere
      expect(dry.created.panner - before[0]).toBeLessThan(12);
      expect(wet.created.panner - before[1]).toBeGreaterThan(30);
    });

    it('runs a long downpour, under a roof and indoors, without errors', () => {
      const fake = createFakeContext();
      const engine = new AudioEngine();
      engine.start(() => fake.ctx);
      expect(() => {
        for (let i = 0; i < 3000; i++) {
          fake.advance(0.1);
          engine.setWeather({ rain: 1, level: (i % 300) / 300, wet: 1, roof: i % 2, indoors: i % 3 === 0 ? 1 : 0 });
          engine.update(0.1, listener, world);
          if (i % 200 === 0) engine.thunder(3, 0.9);
        }
        engine.setWeather({ rain: 0, level: 0.5, wet: 0.6, roof: 0, indoors: 0 });
        for (let i = 0; i < 100; i++) engine.update(0.1, listener, world);
      }).not.toThrow();
    });

    it('caps the drops sounding at once', () => {
      const fake = createFakeContext();
      const engine = new AudioEngine();
      engine.start(() => fake.ctx);
      engine.setWeather(rain);
      const before = fake.created.panner;
      // time does not advance, so nothing ever finishes
      for (let i = 0; i < 2000; i++) engine.update(0.1, listener, world);
      expect(fake.created.panner - before).toBeLessThan(30);
    });

    it('makes no thunder while thunder is switched off', () => {
      const fake = createFakeContext();
      const engine = new AudioEngine();
      engine.start(() => fake.ctx);
      engine.setThunderEnabled(false);
      const before = fake.created.bufferSource;
      engine.thunder(2, 1);
      expect(fake.created.bufferSource).toBe(before);
      engine.setThunderEnabled(true);
      engine.thunder(2, 1);
      expect(fake.created.bufferSource).toBeGreaterThan(before);
    });
  });
});
