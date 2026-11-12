/**
 * Test double for AudioContext: every node and parameter accepts the calls the
 * engine makes and does nothing. Counts node creation so tests can assert on it.
 */
export function createFakeContext() {
  const created: Record<string, number> = { oscillator: 0, bufferSource: 0, gain: 0, panner: 0 };

  const param = () => {
    const p = {
      value: 0,
      setValueAtTime: () => p,
      linearRampToValueAtTime: () => p,
      exponentialRampToValueAtTime: () => p,
      setTargetAtTime: () => p,
      cancelScheduledValues: () => p,
    };
    return p;
  };
  const METHODS = new Set(['connect', 'disconnect', 'start', 'stop', 'setPosition', 'setOrientation', 'addEventListener', 'removeEventListener']);
  const PLAIN = new Set(['buffer', 'loop', 'type', 'onended', 'panningModel', 'distanceModel', 'refDistance', 'rolloffFactor', 'maxDistance', 'curve', 'oversample', 'normalize', 'loopStart', 'loopEnd']);
  const node = () =>
    new Proxy({} as Record<string, unknown>, {
      get(target, key: string) {
        if (key in target) return target[key];
        if (METHODS.has(key)) return (target[key] = () => undefined);
        if (PLAIN.has(key)) return undefined;
        return (target[key] = param());
      },
      set(target, key: string, value) {
        target[key] = value;
        return true;
      },
    });

  const state = { time: 0 };
  const ctx = {
    state: 'running' as string,
    sampleRate: 8000,
    destination: node(),
    listener: node(),
    get currentTime() {
      return state.time;
    },
    createGain: () => (created.gain++, node()),
    createOscillator: () => (created.oscillator++, node()),
    createBufferSource: () => (created.bufferSource++, node()),
    createPanner: () => (created.panner++, node()),
    createBiquadFilter: node,
    createStereoPanner: node,
    createConvolver: node,
    createDynamicsCompressor: node,
    createWaveShaper: node,
    createBuffer: (channels: number, length: number, sampleRate: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate, getChannelData: (c: number) => data[c] };
    },
    resume: async () => {
      if (ctx.state !== 'closed') ctx.state = 'running';
    },
    suspend: async () => {
      if (ctx.state !== 'closed') ctx.state = 'suspended';
    },
    close: async () => {
      ctx.state = 'closed';
    },
  };

  return {
    ctx: ctx as unknown as AudioContext,
    created,
    advance: (seconds: number) => {
      state.time += seconds;
    },
  };
}
