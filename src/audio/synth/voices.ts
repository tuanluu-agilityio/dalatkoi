import type { Surface } from '../../world/surfaces';

/** One-shot sounds. Each function schedules its nodes and returns how long the sound lasts. */

export interface Buffers {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** Attack / exponential decay envelope on a gain parameter. */
function envelope(g: AudioParam, t: number, attack: number, peak: number, decay: number): void {
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function burst(
  ctx: AudioContext,
  out: AudioNode,
  buffer: AudioBuffer,
  t: number,
  o: { type: BiquadFilterType; freq: number; q: number; attack: number; decay: number; gain: number; rate?: number },
): void {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = o.rate ?? 1;
  const filter = ctx.createBiquadFilter();
  filter.type = o.type;
  filter.frequency.value = o.freq;
  filter.Q.value = o.q;
  const gain = ctx.createGain();
  envelope(gain.gain, t, o.attack, o.gain, o.decay);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(t, Math.random() * 2);
  src.stop(t + o.attack + o.decay + 0.05);
}

function thump(ctx: AudioContext, out: AudioNode, t: number, from: number, to: number, decay: number, gain: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + decay);
  const g = ctx.createGain();
  envelope(g.gain, t, 0.004, gain, decay);
  osc.connect(g);
  g.connect(out);
  osc.start(t);
  osc.stop(t + decay + 0.06);
}

/** A footfall. Each surface has its own recipe; small random changes keep steps from sounding stamped out. */
export function footstep(ctx: AudioContext, out: AudioNode, b: Buffers, surface: Surface, speed: number): number {
  const t = ctx.currentTime + 0.005;
  const force = Math.min(1.35, 0.7 + speed * 0.18) * rand(0.85, 1.1);
  const tune = rand(0.9, 1.12);
  switch (surface) {
    case 'grass':
      burst(ctx, out, b.pink, t, { type: 'lowpass', freq: 700 * tune, q: 0.5, attack: 0.012, decay: 0.13, gain: 0.5 * force });
      burst(ctx, out, b.white, t + 0.015, { type: 'bandpass', freq: 3800 * tune, q: 0.8, attack: 0.02, decay: 0.11, gain: 0.07 * force });
      thump(ctx, out, t, 95, 55, 0.07, 0.22 * force);
      return 0.25;
    case 'gravel': {
      // the heel, then the roll of the sole: a handful of small stones shifting
      const grains = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < grains; i++) {
        burst(ctx, out, b.white, t + i * rand(0.014, 0.03), {
          type: 'bandpass', freq: rand(1700, 5200), q: rand(1.2, 3), attack: 0.003, decay: rand(0.03, 0.07), gain: 0.2 * force * (1 - i * 0.1),
        });
      }
      burst(ctx, out, b.pink, t, { type: 'lowpass', freq: 500, q: 0.5, attack: 0.006, decay: 0.09, gain: 0.3 * force });
      return 0.3;
    }
    case 'stone':
      thump(ctx, out, t, 150 * tune, 70, 0.05, 0.3 * force);
      burst(ctx, out, b.white, t, { type: 'bandpass', freq: 1900 * tune, q: 2.2, attack: 0.002, decay: 0.035, gain: 0.16 * force });
      burst(ctx, out, b.pink, t + 0.02, { type: 'highpass', freq: 2500, q: 0.5, attack: 0.01, decay: 0.06, gain: 0.03 * force });
      return 0.15;
    case 'bridge':
    case 'veranda': {
      // hollow boards: two resonances under a dull knock; the bridge rings longer than the deck
      const hollow = surface === 'bridge' ? 1 : 0.7;
      thump(ctx, out, t, 140 * tune, 62, 0.09 * hollow + 0.03, 0.42 * force);
      burst(ctx, out, b.brown, t, { type: 'bandpass', freq: 210 * tune, q: 5, attack: 0.004, decay: 0.16 * hollow, gain: 0.9 * force });
      burst(ctx, out, b.pink, t, { type: 'bandpass', freq: 420 * tune, q: 4, attack: 0.003, decay: 0.09 * hollow, gain: 0.3 * force });
      burst(ctx, out, b.white, t, { type: 'bandpass', freq: 2400, q: 1.5, attack: 0.002, decay: 0.025, gain: 0.06 * force });
      return 0.3;
    }
  }
}

/** A koi breaking the surface. */
export function plop(ctx: AudioContext, out: AudioNode, b: Buffers, strength: number): number {
  const t = ctx.currentTime + 0.005;
  const s = Math.min(1, Math.max(0.2, strength));
  thump(ctx, out, t, 520 - s * 160, 150, 0.09, 0.5 * s);
  // the bubble that follows rises in pitch
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(380, t + 0.07);
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.13);
  const g = ctx.createGain();
  envelope(g.gain, t + 0.07, 0.006, 0.16 * s, 0.07);
  osc.connect(g);
  g.connect(out);
  osc.start(t + 0.07);
  osc.stop(t + 0.22);
  burst(ctx, out, b.white, t, { type: 'bandpass', freq: 2600, q: 0.9, attack: 0.004, decay: 0.16, gain: 0.12 * s });
  return 0.35;
}

/** A single water drop into the pond, for the spout. */
export function drip(ctx: AudioContext, out: AudioNode): number {
  const t = ctx.currentTime + 0.005;
  const f = rand(900, 2100);
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.exponentialRampToValueAtTime(f * rand(1.5, 2.1), t + 0.045);
  const g = ctx.createGain();
  envelope(g.gain, t, 0.003, rand(0.04, 0.1), 0.05);
  osc.connect(g);
  g.connect(out);
  osc.start(t);
  osc.stop(t + 0.12);
  return 0.12;
}

type Note = [start: number, duration: number, from: number, to: number, level: number];

/** Invented songs in the registers of highland birds: whistles, trills, warbles and a distant dove. */
const SONGS: (() => Note[])[] = [
  // two- or three-note whistle
  () => {
    const f = rand(2500, 3300);
    const n = 2 + Math.floor(Math.random() * 2);
    return Array.from({ length: n }, (_, i): Note => [i * 0.3, 0.19, f * (i % 2 ? 1.18 : 1), f * (i % 2 ? 1.22 : 0.96), 1]);
  },
  // fast trill
  () => {
    const f = rand(3900, 5200);
    const n = 7 + Math.floor(Math.random() * 8);
    return Array.from({ length: n }, (_, i): Note => [i * 0.075, 0.05, f * (i % 2 ? 1.07 : 1), f * (i % 2 ? 1 : 1.07), 0.75]);
  },
  // falling warble
  () => {
    const f = rand(3400, 4300);
    return Array.from({ length: 5 }, (_, i): Note => [i * 0.14, 0.11, f * (1 - i * 0.08), f * (1 - i * 0.08) * 0.88, 0.9]);
  },
  // bulbul-like chatter: irregular leaps
  () => {
    const n = 4 + Math.floor(Math.random() * 4);
    let t = 0;
    return Array.from({ length: n }, (): Note => {
      const start = t;
      const d = rand(0.07, 0.16);
      t += d + rand(0.03, 0.09);
      const f = rand(1900, 3700);
      return [start, d, f, f * rand(0.82, 1.25), 0.85];
    });
  },
  // dove, far away
  () => {
    const f = rand(440, 520);
    return [
      [0, 0.42, f, f * 0.93, 1],
      [0.62, 0.3, f * 0.98, f * 0.9, 0.85],
      [1.05, 0.5, f, f * 0.9, 1],
    ];
  },
];

/** One bird phrase on a single oscillator, with its notes written into the frequency and gain curves. */
export function birdsong(ctx: AudioContext, out: AudioNode, loudness: number): number {
  const t0 = ctx.currentTime + 0.02;
  const notes = pick(SONGS)();
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  let end = 0;
  for (const [start, duration, from, to, level] of notes) {
    const t = t0 + start;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(loudness * level, t + Math.min(0.02, duration * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    end = Math.max(end, start + duration);
  }
  osc.connect(g);
  g.connect(out);
  osc.start(t0);
  osc.stop(t0 + end + 0.05);
  return end + 0.1;
}

/** Pentatonic tubes: whatever the wind picks will sit well together. */
const CHIME_NOTES = [1046.5, 1174.7, 1318.5, 1568.0, 1760.0, 2093.0];
/** Overtones of a free metal tube. */
const TUBE_PARTIALS: [ratio: number, level: number, decay: number][] = [
  [1, 1, 2.8],
  [2.76, 0.45, 1.6],
  [5.4, 0.22, 0.9],
  [8.93, 0.1, 0.45],
];

export function chime(ctx: AudioContext, out: AudioNode, level: number): number {
  const t = ctx.currentTime + 0.01;
  const f = pick(CHIME_NOTES);
  for (const [ratio, amount, decay] of TUBE_PARTIALS) {
    const osc = ctx.createOscillator();
    osc.frequency.value = f * ratio * rand(0.998, 1.002);
    const g = ctx.createGain();
    envelope(g.gain, t, 0.002, level * amount, decay);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + decay + 0.1);
  }
  return 2.9;
}

/** Old timber settling: a stick-slip rasp squeezed through a narrow, sliding resonance. */
export function creak(ctx: AudioContext, out: AudioNode, level: number): number {
  const t = ctx.currentTime + 0.01;
  const length = rand(0.35, 0.8);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 9;
  const f = rand(650, 1100);
  filter.frequency.setValueAtTime(f, t);
  filter.frequency.linearRampToValueAtTime(f * rand(0.75, 1.3), t + length);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + length * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  for (const base of [rand(52, 66), rand(84, 99)]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * rand(0.8, 1.2), t + length);
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }
  filter.connect(g);
  g.connect(out);
  return length + 0.1;
}
