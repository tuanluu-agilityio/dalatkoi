/** Continuous layers: wind in the pines, and the bamboo spout running into the pond. */

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
  return {
    update(gust) {
      const t = ctx.currentTime;
      for (const g of bodies) g.gain.setTargetAtTime(0.1 + 0.2 * gust, t, 0.8);
      for (const g of hisses) g.gain.setTargetAtTime(0.012 + 0.1 * Math.pow(gust, 1.6), t, 0.6);
      for (const f of hissFilters) f.frequency.setTargetAtTime(2500 + 1900 * gust, t, 0.9);
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
