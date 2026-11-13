/** Continuous layers: wind in the pines, the bamboo spout running into the pond, and rain. */
import type { Buffers } from './voices';

export interface Bed {
  update(gust: number): void;
}

const loop = (ctx: AudioContext, buffer: AudioBuffer, offset: number): AudioBufferSourceNode => {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start(0, offset);
  return src;
};

/**
 * Moves a group of parameters toward a target, smoothly, and only when the target has moved.
 * An unchanged target schedules nothing: every scheduled event costs the audio thread a little,
 * and a parameter with events pending is computed for every sample instead of once per block.
 */
function steered(ctx: AudioContext, params: AudioParam[], timeConstant: number, tolerance: number): (value: number) => void {
  let last = Number.NaN;
  return (value) => {
    if (Math.abs(value - last) <= tolerance) return;
    last = value;
    const t = ctx.currentTime;
    for (const p of params) p.setTargetAtTime(value, t, timeConstant);
  };
}

/**
 * Wind: a low body that is always there, plus the hiss of needles that rises
 * with each gust. Two decorrelated copies are panned apart for width.
 */
export function createWind(ctx: AudioContext, out: AudioNode, pink: AudioBuffer): Bed {
  const bodies: GainNode[] = [];
  const hisses: GainNode[] = [];
  const hissFilters: BiquadFilterNode[] = [];
  [-0.65, 0.65].forEach((pan, i) => {
    const src = loop(ctx, pink, i * 1.7);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 420;
    low.Q.value = 0.4;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3000;
    band.Q.value = 0.7;
    hissFilters.push(band);
    const body = ctx.createGain();
    const hiss = ctx.createGain();
    body.gain.value = 0.12;
    hiss.gain.value = 0.02;
    bodies.push(body);
    hisses.push(hiss);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    src.connect(low);
    low.connect(body);
    src.connect(band);
    band.connect(hiss);
    body.connect(panner);
    hiss.connect(panner);
    panner.connect(out);
  });
  const body = steered(ctx, bodies.map((g) => g.gain), 0.8, 0.001);
  const hiss = steered(ctx, hisses.map((g) => g.gain), 0.6, 0.0005);
  const tone = steered(ctx, hissFilters.map((f) => f.frequency), 0.9, 8);
  return {
    update(gust) {
      body(0.1 + 0.2 * gust);
      hiss(0.012 + 0.1 * Math.pow(gust, 1.6));
      tone(2500 + 1900 * gust);
    },
  };
}

/** The spout: a thin bright stream and a lower burble, both placed at the point where the water lands. */
export function createSpout(ctx: AudioContext, out: AudioNode, white: AudioBuffer, brown: AudioBuffer): void {
  const stream = loop(ctx, white, 0.3);
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 1100;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2600;
  band.Q.value = 0.9;
  const streamGain = ctx.createGain();
  streamGain.gain.value = 0.34;
  stream.connect(high);
  high.connect(band);
  band.connect(streamGain);
  streamGain.connect(out);

  const burble = loop(ctx, brown, 1.1);
  const res = ctx.createBiquadFilter();
  res.type = 'bandpass';
  res.frequency.value = 640;
  res.Q.value = 3.2;
  // two slow oscillators at unrelated rates wander the resonance, so it never repeats audibly
  [5.3, 8.9].forEach((rate, i) => {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const depth = ctx.createGain();
    depth.gain.value = 150 + i * 90;
    lfo.connect(depth);
    depth.connect(res.frequency);
    lfo.start();
  });
  const burbleGain = ctx.createGain();
  burbleGain.gain.value = 0.5;
  burble.connect(res);
  res.connect(burbleGain);
  burbleGain.connect(out);
}

export interface RainState {
  /** 0..1 presence of the rain. */
  amount: number;
  /** 0..1 intensity: drizzle … heavy. */
  level: number;
  /** 0..1 how much roof is over the listener. */
  roof: number;
  /** 1 when the listener is inside the cabin walls. */
  indoors: number;
  gust: number;
}

export interface RainBed {
  update(state: RainState): void;
}

/** Where the rain layers play: all around, and from the three places that have a sound of their own. */
export interface RainOutputs {
  around: AudioNode;
  roof: AudioNode | null;
  wood: AudioNode | null;
  pond: AudioNode | null;
}

/**
 * Rain as a set of filtered-noise layers, all silent until it rains:
 * the open rainfall, its hiss in the leaves, drumming on the roof above
 * (when there is one), and positioned layers for the cabin roof, the timber
 * bridge and the surface of the pond. Each has its own balance against
 * intensity and shelter, so the sound changes as the visitor moves.
 */
export function createRain(ctx: AudioContext, out: RainOutputs, b: Buffers): RainBed {
  type Filter = [type: BiquadFilterType, frequency: number, q: number];
  const layer = (buffer: AudioBuffer, offset: number, filters: Filter[], dest: AudioNode, pan?: number): GainNode => {
    let node: AudioNode = loop(ctx, buffer, offset);
    for (const [type, frequency, q] of filters) {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = frequency;
      f.Q.value = q;
      node.connect(f);
      node = f;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain);
    if (pan === undefined) {
      gain.connect(dest);
    } else {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      panner.connect(dest);
    }
    return gain;
  };

  const group = (gains: GainNode[]) => steered(ctx, gains.map((g) => g.gain), 0.4, 0.0005);
  const wash = group([-0.7, 0.7].map((pan, i) => layer(b.pink, 0.4 + i * 2.1, [['highpass', 480, 0.5], ['lowpass', 7600, 0.5]], out.around, pan)));
  const leaves = group([-0.5, 0.5].map((pan, i) => layer(b.white, 0.2 + i * 1.3, [['bandpass', 5600, 0.5]], out.around, pan)));
  const overhead = group([
    layer(b.brown, 2.2, [['bandpass', 360, 0.7]], out.around),
    layer(b.pink, 3.1, [['bandpass', 1350, 0.9]], out.around),
  ]);
  const roof = group(out.roof ? [layer(b.pink, 1.6, [['bandpass', 1100, 0.8]], out.roof)] : []);
  const wood = group(out.wood ? [layer(b.pink, 2.8, [['bandpass', 1900, 1.4]], out.wood), layer(b.brown, 0.9, [['bandpass', 300, 1.2]], out.wood)] : []);
  const pond = group(out.pond ? [layer(b.white, 1.9, [['highpass', 4200, 0.6]], out.pond)] : []);

  const set = (steer: (value: number) => void, value: number) => steer(Math.max(0, value));
  return {
    update({ amount, level, roof: cover, indoors, gust }) {
      const open = 1 - 0.3 * cover - 0.45 * indoors;
      set(wash, amount * (0.06 + 0.2 * level) * open);
      set(leaves, amount * (0.014 + 0.06 * level) * (0.75 + 0.5 * gust) * (1 - 0.6 * cover));
      set(overhead, amount * cover * (0.1 + 0.3 * level));
      set(roof, amount * (0.3 + 0.7 * level));
      set(wood, amount * (0.25 + 0.6 * level));
      set(pond, amount * (0.25 + 0.6 * level));
    },
  };
}
