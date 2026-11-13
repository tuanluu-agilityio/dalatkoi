import type { VolumeBus } from '../state/store';
import type { Surface } from '../world/surfaces';
import { createRain, createSpout, createWind, type Bed, type RainBed } from './synth/beds';
import { LANE_PANS, laneFor, placeSound, type Placement } from './spatial';
import { impulseResponse, noiseBuffer } from './synth/noise';
import { birdsong, chime, creak, drip, footstep, plop, raindrop, thunder, type Buffers, type Raindrop } from './synth/voices';

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

export interface WeatherSignals {
  /** 0..1 presence of the rain. */
  rain: number;
  /** 0..1 intensity: drizzle … heavy. */
  level: number;
  /** 0..1 wetness of surfaces: the eaves keep dripping for a while after the rain. */
  wet: number;
  /** 0..1 how much roof is over the listener, and 1 when inside the cabin. */
  roof: number;
  indoors: number;
}

/** World positions of the fixed sound sources. */
export interface SoundSources {
  spout: [number, number, number];
  chime: [number, number, number];
  cabin: [number, number, number];
  waterLevel: number;
  /** Where rain has its own sound: the cabin roof, the middle of the pond, the middle of the bridge. */
  roof: [number, number, number];
  pond: [number, number, number];
  bridge: [number, number, number];
  /** The two ends of the veranda's dripping edge. */
  eave: [[number, number, number], [number, number, number]];
}

const DEFAULT_SOURCES: SoundSources = {
  spout: [-8, -0.2, 0],
  chime: [9, 2.7, -5],
  cabin: [8, 1.5, -8.5],
  waterLevel: -0.18,
  roof: [8, 4, -8.5],
  pond: [-2.5, -0.18, 3.5],
  bridge: [4.5, 0.6, 3.5],
  eave: [[4.5, 2.9, -4], [13, 2.9, -1.4]],
};

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
    rain: curve(volumes.rain),
  };
}

/**
 * Output buffering asked of the browser, in seconds. This is an ambient soundscape, not an
 * instrument: a few hundredths of a second of extra latency cannot be heard, and it is what lets
 * the audio thread ride out a busy frame without a dropout. ('interactive' gave 10 ms buffers,
 * which underran whenever rendering was heavy.) A number rather than 'playback', because
 * 'playback' means very different sizes on different systems and footsteps should stay in step.
 */
const OUTPUT_LATENCY = 0.04;
/** Seconds between adjustments of the continuous layers. Their own smoothing is 0.25 s or slower. */
const CONTROL_INTERVAL = 0.1;
/** A finished voice stays connected this much longer, so nothing is cut while it rings out. */
const RELEASE_MARGIN = 0.5;
const MAX_VOICES = 18;
/** Rain's one-shots have a budget of their own, so a downpour never crowds out a footstep. */
const MAX_RAIN_VOICES = 8;
const DRY: WeatherSignals = { rain: 0, level: 0, wet: 0, roof: 0, indoors: 0 };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * All sound in the experience. Nothing is created until `start` is called from
 * a user gesture, so browser autoplay rules are respected; every other method
 * is a safe no-op before that, and if Web Audio is unavailable the visit is
 * simply silent.
 */
export class AudioEngine {
  started = false;
  levels: Volumes = busGains({ master: 0.8, ambient: 0.8, environment: 0.85, footsteps: 0.7, rain: 0.85 }, false);

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
  /** Context time at which the opening fade-in ends. */
  private fadeInEnd = 0;
  private rainBed: RainBed | null = null;
  /** Low-pass after the rain bus: closes under a roof, and further indoors. */
  private rainMuffle: BiquadFilterNode | null = null;
  private thunderOut: GainNode | null = null;
  private thunderOn = true;
  private weather: WeatherSignals = DRY;
  private rainVoices: number[] = [];
  private rainTimers = { eave: 0.5, pond: 0.3, leaf: 0.4, wood: 0.6 };
  /** Fixed stereo positions that short placed sounds share, instead of a panner each. */
  private lanes: AudioNode[] = [];
  private placement: Placement = { pan: 0, gain: 1 };
  /** Where the listener was at the last update: short sounds are placed against it. */
  private pose: ListenerPose = { x: 0, y: 1.65, z: 0, fx: 0, fy: 0, fz: -1 };
  private heard = [Number.NaN, 0, 0, 0, 0, 0];
  /** Nodes built for one voice, to be taken out of the graph when it has finished. */
  private live: { end: number; nodes: AudioNode[] }[] = [];
  /** Seconds until the continuous layers are adjusted again. */
  private control = 0;
  private muffleAt = 18000;
  /** False while the app itself has suspended the sound (a hidden tab). */
  private wantRunning = false;
  private autoResumes = 0;
  private readonly onState = () => {
    const ctx = this.ctx;
    if (!ctx || !this.wantRunning || ctx.state === 'running' || ctx.state === 'closed') return;
    // the browser stopped it (a call, a device change): ask a few times at most, never in a loop
    if (this.autoResumes++ < 3) void ctx.resume().catch(() => undefined);
  };

  /** 'off' before `start`, otherwise the state of the context. */
  get state(): 'off' | AudioContextState {
    return this.ctx ? this.ctx.state : 'off';
  }

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
        : new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({ latencyHint: OUTPUT_LATENCY });
      this.ctx = ctx;
      this.build(ctx);
      this.started = true;
      this.wantRunning = true;
      this.autoResumes = 0;
      ctx.addEventListener?.('statechange', this.onState);
      if (ctx.state !== 'running') void ctx.resume?.();
      return true;
    } catch (error) {
      console.warn('[audio] unavailable, continuing without sound', error);
      void this.ctx?.close?.().catch(() => undefined);
      this.ctx = null;
      this.buses = null;
      this.lanes = [];
      this.started = false;
      this.wantRunning = false;
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
    // rain passes through a low-pass on its way out, so shelter can soften it
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 18000;
    muffle.Q.value = 0.4;
    muffle.connect(master);
    this.rainMuffle = muffle;
    const rain = ctx.createGain();
    rain.gain.value = this.levels.rain;
    rain.connect(muffle);
    this.buses = { master, ambient: bus(this.levels.ambient), environment: bus(this.levels.environment), footsteps: bus(this.levels.footsteps), rain };

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

    const at = (p: [number, number, number], refDistance: number, rolloff: number) => {
      const node = this.panner(p[0], p[1], p[2], refDistance, rolloff);
      node?.connect(rain);
      return node;
    };
    this.rainBed = createRain(
      ctx,
      { around: rain, roof: at(this.sources.roof, 4.5, 1.3), wood: at(this.sources.bridge, 2.2, 1.6), pond: at(this.sources.pond, 3.5, 1.5) },
      this.buffers,
    );
    this.lanes = LANE_PANS.map((pan) => {
      const lane = ctx.createStereoPanner();
      lane.pan.value = pan;
      lane.connect(rain);
      return lane;
    });
    this.thunderOut = ctx.createGain();
    this.thunderOut.gain.value = this.thunderOn ? 1 : 0;
    this.thunderOut.connect(master);
    const rumble = ctx.createGain();
    rumble.gain.value = 0.3;
    this.thunderOut.connect(rumble);
    rumble.connect(this.reverb);

    // rise gently out of silence rather than switching on
    master.gain.setValueAtTime(0, ctx.currentTime);
    this.fadeInEnd = ctx.currentTime + 2.5;
    master.gain.linearRampToValueAtTime(this.levels.master, this.fadeInEnd);
  }

  /** A positioned source. HRTF panning lets headphones place it around the listener's head. */
  private panner(x: number, y: number, z: number, refDistance: number, rolloff: number, model: PanningModelType = 'HRTF'): PannerNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const p = ctx.createPanner();
    p.panningModel = model;
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

  /**
   * A one-shot positioned source feeding the environment bus and the shared reverb, lasting
   * `duration` seconds. Null when too many voices are already sounding. The nodes are taken out
   * of the graph again by `sweep` once the voice has finished.
   */
  private placed(duration: number, x: number, y: number, z: number, refDistance: number, send: number): AudioNode | null {
    if (!this.buses || !this.reverb || !this.ctx || !this.claim(duration)) return null;
    const p = this.panner(x, y, z, refDistance, 1.1);
    if (!p) return null;
    p.connect(this.buses.environment);
    const s = this.ctx.createGain();
    s.gain.value = send;
    p.connect(s);
    s.connect(this.reverb);
    this.live.push({ end: this.ctx.currentTime + duration + RELEASE_MARGIN, nodes: [p, s] });
    return p;
  }

  /** Disconnects what finished voices left behind, rather than waiting for garbage collection to do it. */
  private sweep(now: number): void {
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].end > now) continue;
      for (const node of live[i].nodes) node.disconnect();
      live[i] = live[live.length - 1];
      live.pop();
    }
  }

  /**
   * A raindrop landing at a point, routed through the rain bus. A drop lasts about a tenth of a
   * second, so its place is worked out once, here, with the same law a panner applies, and it
   * plays through the nearest of a few fixed stereo positions. A panner per drop (about 25 a
   * second) was what the audio thread could not keep up with.
   */
  private rainDrop(kind: Raindrop, x: number, y: number, z: number, refDistance: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.buses || !this.buffers || this.lanes.length === 0) return;
    const now = ctx.currentTime;
    this.rainVoices = this.rainVoices.filter((end) => end > now);
    if (this.rainVoices.length >= MAX_RAIN_VOICES) return;
    const at = placeSound(this.pose, x, y, z, refDistance, 1.3, this.placement);
    this.rainVoices.push(now + raindrop(ctx, this.lanes[laneFor(at.pan)], this.buffers, kind, at.gain));
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
      if (key === 'master' && t < this.fadeInEnd) {
        // still rising out of silence: keep the slow ramp, just aim it at the new level
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(this.levels.master, this.fadeInEnd);
      } else {
        g.setTargetAtTime(this.levels[key], t, 0.12);
      }
    }
  }

  /** The weather right now. Safe to call every frame; takes effect in `update`. */
  setWeather(weather: WeatherSignals): void {
    this.weather = weather;
  }

  /** Thunder can be switched off on its own; a roll already under way fades out. */
  setThunderEnabled(on: boolean): void {
    this.thunderOn = on;
    if (this.ctx && this.thunderOut) this.thunderOut.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.15);
  }

  /** A strike somewhere beyond the hills: the sound arrives `delay` seconds later. */
  thunder(delay: number, strength: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.buffers || !this.thunderOut || !this.thunderOn) return;
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.6, 0.6);
    pan.connect(this.thunderOut);
    // a roof takes the edge off it; walls take more
    const heard = clamp01(strength) * (1 - 0.15 * this.weather.roof - 0.3 * this.weather.indoors);
    const length = thunder(ctx, pan, this.buffers, heard, Number.isFinite(delay) ? Math.max(0, delay) : 0);
    this.live.push({ end: ctx.currentTime + length + RELEASE_MARGIN, nodes: [pan] });
  }

  /**
   * The listener follows the camera. Values are set directly, once per frame and only when they
   * have changed: scheduling them (`setTargetAtTime`) makes them sample-accurate, and then every
   * panner in the graph recomputes its position 48 000 times a second.
   */
  private moveListener(pose: ListenerPose): void {
    const h = this.heard;
    const eps = 1e-4;
    const same =
      Math.abs(h[0] - pose.x) < eps && Math.abs(h[1] - pose.y) < eps && Math.abs(h[2] - pose.z) < eps &&
      Math.abs(h[3] - pose.fx) < eps && Math.abs(h[4] - pose.fy) < eps && Math.abs(h[5] - pose.fz) < eps;
    if (same) return;
    h[0] = pose.x;
    h[1] = pose.y;
    h[2] = pose.z;
    h[3] = pose.fx;
    h[4] = pose.fy;
    h[5] = pose.fz;
    const l = this.ctx!.listener;
    if (l.positionX) {
      l.positionX.value = pose.x;
      l.positionY.value = pose.y;
      l.positionZ.value = pose.z;
      l.forwardX.value = pose.fx;
      l.forwardY.value = pose.fy;
      l.forwardZ.value = pose.fz;
    } else {
      l.setPosition(pose.x, pose.y, pose.z);
      l.setOrientation(pose.fx, pose.fy, pose.fz, 0, 1, 0);
    }
  }

  /** Rain: the continuous layers, the shelter filter, and single drops landing around the listener. */
  private updateRain(step: number, pose: ListenerPose, gust: number, steer: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.rainBed || !this.rainMuffle) return;
    const w = this.weather;
    const amount = clamp01(w.rain);
    const level = clamp01(w.level);
    const roof = clamp01(w.roof);
    const indoors = clamp01(w.indoors);
    if (steer) {
      this.rainBed.update({ amount, level, roof, indoors, gust });
      const cutoff = lerp(lerp(18000, 6500, roof), 950, indoors);
      if (Math.abs(cutoff - this.muffleAt) > 1) {
        this.muffleAt = cutoff;
        this.rainMuffle.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.25);
      }
    }

    const pace = 0.35 + level;
    const timers = this.rainTimers;
    const wet = clamp01(w.wet);
    if (wet > 0.1) {
      timers.eave -= step;
      if (timers.eave <= 0) {
        timers.eave = rand(0.1, 0.5) / (pace * wet);
        const [a, b] = this.sources.eave;
        const k = Math.random();
        this.rainDrop('eave', lerp(a[0], b[0], k), 0.2, lerp(a[2], b[2], k), 1.6);
      }
    }
    if (amount < 0.1) return;
    timers.pond -= step;
    if (timers.pond <= 0) {
      timers.pond = rand(0.08, 0.35) / (pace * amount);
      const [x, y, z] = this.sources.pond;
      this.rainDrop('water', x + rand(-6, 6), y, z + rand(-3.5, 3.5), 2.2);
    }
    timers.wood -= step;
    if (timers.wood <= 0) {
      timers.wood = rand(0.15, 0.6) / (pace * amount);
      const [x, y, z] = this.sources.bridge;
      this.rainDrop('wood', x + rand(-0.6, 0.6), y, z + rand(-3, 3), 1.8);
    }
    timers.leaf -= step;
    if (timers.leaf <= 0 && indoors < 0.5) {
      timers.leaf = rand(0.1, 0.45) / (pace * amount);
      const a = Math.random() * Math.PI * 2;
      const d = rand(1.5, 6);
      this.rainDrop('leaf', pose.x + Math.cos(a) * d, pose.y + rand(-1.2, 3), pose.z + Math.sin(a) * d, 2);
    }
  }

  /** Per frame: move the listener, breathe the wind, and let the place make its occasional sounds. */
  update(dt: number, pose: ListenerPose, world: WorldSignals): void {
    const ctx = this.ctx;
    if (!ctx || !this.buses || !this.buffers || ctx.state !== 'running') return;
    const step = Number.isFinite(dt) ? Math.min(0.25, Math.max(0, dt)) : 0;

    if (Number.isFinite(pose.x + pose.y + pose.z + pose.fx + pose.fy + pose.fz)) {
      const p = this.pose;
      p.x = pose.x;
      p.y = pose.y;
      p.z = pose.z;
      p.fx = pose.fx;
      p.fy = pose.fy;
      p.fz = pose.fz;
      this.moveListener(p);
    }
    this.sweep(ctx.currentTime);

    // the continuous layers smooth their own changes over a quarter of a second or more,
    // so they are steered ten times a second, not once per frame
    const gust = clamp01(world.gust);
    this.control -= step;
    const steer = this.control <= 0;
    if (steer) {
      this.control = CONTROL_INTERVAL;
      this.wind?.update(gust);
    }
    this.updateRain(step, pose, gust, steer);
    const rain = clamp01(this.weather.rain);

    const timers = this.timers;
    timers.bird -= step;
    if (timers.bird <= 0) {
      // birds sit out the rain, calling only now and then
      timers.bird = rand(1.6, 6.5) * (1 + 5 * rain);
      // somewhere up in the crowns around the clearing
      const a = Math.random() * Math.PI * 2;
      const d = rand(14, 44);
      const out = this.placed(2, Math.cos(a) * d, rand(7, 19), 2 + Math.sin(a) * d, 9, 0.5);
      if (out) birdsong(ctx, out, rand(0.16, 0.34) * (1 - 0.45 * rain));
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
        const out = this.placed(2.9, x, y, z, 2.2, 0.35);
        if (out) chime(ctx, out, rand(0.05, 0.11) * (0.6 + gust));
      }
    }

    timers.creak -= step;
    if (timers.creak <= 0) {
      timers.creak = rand(16, 42);
      const [x, y, z] = this.sources.cabin;
      const out = this.placed(1, x + rand(-3, 3), y, z + rand(-2, 2), 2.5, 0.2);
      if (out) creak(ctx, out, rand(0.05, 0.1));
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
    const out = this.placed(0.35, x, this.sources.waterLevel, z, 2.6, 0.3);
    if (out) plop(ctx, out, this.buffers, strength);
  }

  /** The app wants silence for now (the tab is hidden). */
  suspend(): void {
    this.wantRunning = false;
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (!this.ctx) return;
    this.wantRunning = true;
    this.autoResumes = 0;
    // 'interrupted' is what iOS reports after a call or Siri
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume().catch(() => undefined);
  }

  /**
   * Call from any click or key press. If the browser has stopped the sound and would not let it
   * resume without a gesture, this is the gesture. Checks the state first; does nothing otherwise.
   */
  nudge(): void {
    const ctx = this.ctx;
    if (!ctx || !this.wantRunning || ctx.state === 'running' || ctx.state === 'closed') return;
    this.autoResumes = 0;
    void ctx.resume().catch(() => undefined);
  }

  dispose(): void {
    this.ctx?.removeEventListener?.('statechange', this.onState);
    this.wantRunning = false;
    this.lanes = [];
    this.live = [];
    this.heard[0] = Number.NaN;
    void this.ctx?.close?.();
    this.ctx = null;
    this.buses = null;
    this.buffers = null;
    this.wind = null;
    this.spoutOut = null;
    this.reverb = null;
    this.rainBed = null;
    this.rainMuffle = null;
    this.thunderOut = null;
    this.rainVoices = [];
    this.voices = [];
    this.started = false;
  }
}

/** The single engine instance used by the app. */
export const audio = new AudioEngine();
