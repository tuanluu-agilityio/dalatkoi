export type NoiseColor = 'white' | 'pink' | 'brown';

/** A loopable buffer of generated noise. Everything the visitor hears is built from these and from oscillators. */
export function noiseBuffer(ctx: BaseAudioContext, seconds: number, color: NoiseColor): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  if (color === 'white') {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  } else if (color === 'pink') {
    // Paul Kellet's economy filter
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    }
  } else {
    let last = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  }
  // short crossfade so the loop point is inaudible
  const fade = Math.min(length >> 1, Math.floor(ctx.sampleRate * 0.05));
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    data[i] = data[i] * k + data[length - fade + i] * (1 - k);
  }
  return buffer;
}

/** Exponentially decaying noise: a small, diffuse room for distance cues among the trees. */
export function impulseResponse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (t < 0.01 ? t / 0.01 : 1);
    }
  }
  return buffer;
}
