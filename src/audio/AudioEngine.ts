import type { VolumeBus } from '../state/store';
import type { Surface } from '../world/surfaces';
import { createSpout, createWind, type Bed } from './synth/beds';
import { impulseResponse, noiseBuffer } from './synth/noise';
import { birdsong, chime, creak, drip, footstep, plop, type Buffers } from './synth/voices';

export type Volumes = Record<VolumeBus, number>;

export interface ListenerPose {
  x: number;
  y: number;
  z: number;
  /** Unit forward vector. */
  fx: number;
  fy: number;
  fz: number;
}

export interface WorldSignals {
  /** 0..1 strength of the current gust, shared with the visuals. */
  gust: number;
  walkSpeed: number;
  embodied: boolean;
}

/** World positions of the fixed sound sources. */
export interface SoundSources {
  spout: [number, number, number];
  chime: [number, number, number];
  cabin: [number, number, number];
  waterLevel: number;
}

const DEFAULT_SOURCES: SoundSources = { spout: [-8, -0.2, 0], chime: [9, 2.7, -5], cabin: [8, 1.5, -8.5], waterLevel: -0.18 };

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Slider position (0..1) to gain: squared, so the lower half of the slider is still useful. */
export function busGains(volumes: Volumes, muted: boolean): Volumes {
  const curve = (v: number) => {
    const c = clamp01(v);
    return c * c;
  };
  return {
    master: muted ? 0 : curve(volumes.master),
    ambient: curve(volumes.ambient),
    environment: curve(volumes.environment),
    footsteps: curve(volumes.footsteps),
  };
}

const MAX_VOICES = 18;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * All sound in the experience. Nothing is created until `start` is called from
 * a user gesture, so browser autoplay rules are respected; every other method
 * is a safe no-op before that, and if Web Audio is unavailable the visit is
 * simply silent.
 */
export class AudioEngine {
  started = false;
  levels: Volumes = busGains({ master: 0.8, ambient: 0.8, environment: 0.85, footsteps: 0.7 }, false);

  private ctx: AudioContext | null = null;
  private buses: Record<VolumeBus, GainNode> | null = null;
  private reverb: GainNode | null = null;
  private buffers: Buffers | null = null;
  private wind: Bed | null = null;
  private spoutOut: AudioNode | null = null;
  private sources = DEFAULT_SOURCES;
  /** End times of the one-shot voices still sounding. */
  private voices: number[] = [];
  private lastStep = -1;
  private timers = { bird: 2.5, drip: 0.4, creak: 14, chime: 6 };

  /** Where the fixed sources are. Takes effect for sources created after the call, so set it before `start`. */
  setSources(sources: SoundSources): void {
    this.sources = sources;
  }

  /** Call from a click or key handler. Returns false (and stays silent) if audio cannot start. */
  start(factory?: () => AudioContext): boolean {
    if (this.started) return true;
    try {
      const ctx = factory
        ? factory()
        : new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.build(ctx);
      this.started = true;
      void ctx.resume?.();
      return true;
    } catch (error) {
      console.warn('[audio] unavailable, continuing without sound', error);
      void this.ctx?.close?.().catch(() => undefined);
      this.ctx = null;
      this.buses = null;
      this.started = false;
      return false;
    }
  }

  private build(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 12;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ctx.destination);

    const bus = (level: number) => {
      const g = ctx.createGain();
      g.gain.value = level;
      g.connect(master);
      return g;
    };
    this.buses = { master, ambient: bus(this.levels.ambient), environment: bus(this.levels.environment), footsteps: bus(this.levels.footsteps) };

    this.buffers = { white: noiseBuffer(ctx, 3, 'white'), pink: noiseBuffer(ctx, 5, 'pink'), brown: noiseBuffer(ctx, 4, 'brown') };

    // a short diffuse tail shared by everything that should sound "out there"
    const convolver = ctx.createConvolver();
    convolver.buffer = impulseResponse(ctx, 1.9);
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    convolver.connect(wet);
    wet.connect(this.buses.environment);
    this.reverb = ctx.createGain();
    this.reverb.connect(convolver);

    this.wind = createWind(ctx, this.buses.ambient, this.buffers.pink);

    const spoutPanner = this.panner(this.sources.spout[0], this.sources.spout[1], this.sources.spout[2], 2.4, 1.5);
    if (spoutPanner) {
      spoutPanner.connect(this.buses.ambient);
      createSpout(ctx, spoutPanner, this.buffers.white, this.buffers.brown);
      this.spoutOut = spoutPanner;
    }

    // rise gently out of silence rather than switching on
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(this.levels.master, ctx.currentTime + 2.5);
  }

  /** A positioned source. HRTF panning lets headphones place it around the listener's head. */
  private panner(x: number, y: number, z: number, refDistance: number, rolloff: number): PannerNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.rolloffFactor = rolloff;
    p.maxDistance = 90;
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else {
      p.setPosition(x, y, z);
    }
    return p;
  }

  /** A one-shot positioned source feeding the environment bus and the shared reverb. */
  private placed(x: number, y: number, z: number, refDistance: number, send: number): AudioNode | null {
    const p = this.panner(x, y, z, refDistance, 1.1);
    if (!p || !this.buses || !this.reverb || !this.ctx) return null;
    p.connect(this.buses.environment);
    const s = this.ctx.createGain();
    s.gain.value = send;
    p.connect(s);
    s.connect(this.reverb);
    return p;
  }

  /** Reserve a voice. False when too many one-shots are already sounding. */
  private claim(duration: number): boolean {
    const now = this.ctx!.currentTime;
    this.voices = this.voices.filter((end) => end > now);
    if (this.voices.length >= MAX_VOICES) return false;
    this.voices.push(now + duration);
    return true;
  }

  setLevels(volumes: Volumes, muted: boolean): void {
    this.levels = busGains(volumes, muted);
    if (!this.ctx || !this.buses) return;
    const t = this.ctx.currentTime;
    for (const key of Object.keys(this.buses) as VolumeBus[]) {
      const g = this.buses[key].gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(this.levels[key], t, 0.12);
    }
  }

  /** Per frame: move the listener, breathe the wind, and let the place make its occasional sounds. */
  update(dt: number, pose: ListenerPose, world: WorldSignals): void {
    const ctx = this.ctx;
    if (!ctx || !this.buses || !this.buffers || ctx.state !== 'running') return;
    const step = Number.isFinite(dt) ? Math.min(0.25, Math.max(0, dt)) : 0;

    const l = ctx.listener;
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setTargetAtTime(pose.x, t, 0.03);
      l.positionY.setTargetAtTime(pose.y, t, 0.03);
      l.positionZ.setTargetAtTime(pose.z, t, 0.03);
      l.forwardX.setTargetAtTime(pose.fx, t, 0.03);
      l.forwardY.setTargetAtTime(pose.fy, t, 0.03);
      l.forwardZ.setTargetAtTime(pose.fz, t, 0.03);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(pose.x, pose.y, pose.z);
      l.setOrientation(pose.fx, pose.fy, pose.fz, 0, 1, 0);
    }

    const gust = clamp01(world.gust);
    this.wind?.update(gust);

    const timers = this.timers;
    timers.bird -= step;
    if (timers.bird <= 0) {
      timers.bird = rand(1.6, 6.5);
      // somewhere up in the crowns around the clearing
      const a = Math.random() * Math.PI * 2;
      const d = rand(14, 44);
      const out = this.placed(Math.cos(a) * d, rand(7, 19), 2 + Math.sin(a) * d, 9, 0.5);
      if (out && this.claim(2)) birdsong(ctx, out, rand(0.16, 0.34));
    }

    timers.drip -= step;
    if (timers.drip <= 0 && this.spoutOut) {
      timers.drip = rand(0.12, 0.7);
      if (this.claim(0.15)) drip(ctx, this.spoutOut);
    }

    timers.chime -= step;
    if (timers.chime <= 0) {
      // the stronger the gust, the sooner the next strike
      timers.chime = gust > 0.55 ? rand(0.5, 3.2) / (0.4 + gust) : rand(2, 5);
      if (gust > 0.55 && Math.random() < 0.75) {
        const [x, y, z] = this.sources.chime;
        const out = this.placed(x, y, z, 2.2, 0.35);
        if (out && this.claim(2.9)) chime(ctx, out, rand(0.05, 0.11) * (0.6 + gust));
      }
    }

    timers.creak -= step;
    if (timers.creak <= 0) {
      timers.creak = rand(16, 42);
      const [x, y, z] = this.sources.cabin;
      const out = this.placed(x + rand(-3, 3), y, z + rand(-2, 2), 2.5, 0.2);
      if (out && this.claim(1)) creak(ctx, out, rand(0.05, 0.1));
    }
  }

  footstep(surface: Surface, speed: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.buses || !this.buffers) return;
    // one foot at a time: ignore anything closer together than a very fast run
    if (ctx.currentTime - this.lastStep < 0.12) return;
    if (!this.claim(0.3)) return;
    this.lastStep = ctx.currentTime;
    footstep(ctx, this.buses.footsteps, this.buffers, surface, Number.isFinite(speed) ? speed : 1.9);
  }

  plop(x: number, z: number, strength: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.buffers) return;
    const out = this.placed(x, this.sources.waterLevel, z, 2.6, 0.3);
    if (out && this.claim(0.35)) plop(ctx, out, this.buffers, strength);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  dispose(): void {
    void this.ctx?.close?.();
    this.ctx = null;
    this.buses = null;
    this.buffers = null;
    this.wind = null;
    this.spoutOut = null;
    this.reverb = null;
    this.voices = [];
    this.started = false;
  }
}

/** The single engine instance used by the app. */
export const audio = new AudioEngine();
