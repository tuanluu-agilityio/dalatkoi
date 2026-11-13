/**
 * Test double for AudioContext: every node and parameter accepts the calls the
 * engine makes and does nothing. Counts node creation, scheduled automation and
 * disconnections per kind of node, so tests can assert on them.
 */
export function createFakeContext() {
  const created: Record<string, number> = { oscillator: 0, bufferSource: 0, gain: 0, panner: 0, stereoPanner: 0, biquad: 0 };
  /** Automation calls (`setTargetAtTime` and friends) by the kind of node that owns the parameter. */
  const automation: Record<string, number> = {};
  const disconnected: Record<string, number> = {};
  const bump = (tally: Record<string, number>, kind: string) => {
    tally[kind] = (tally[kind] ?? 0) + 1;
  };

  const param = (kind: string) => {
    const scheduled = () => {
      bump(automation, kind);
      return p;
    };
    const p = {
      value: 0,
      setValueAtTime: scheduled,
      linearRampToValueAtTime: scheduled,
      exponentialRampToValueAtTime: scheduled,
      setTargetAtTime: scheduled,
      cancelScheduledValues: scheduled,
    };
    return p;
  };
  const METHODS = new Set(['connect', 'start', 'stop', 'setPosition', 'setOrientation', 'addEventListener', 'removeEventListener']);
  const PLAIN = new Set(['buffer', 'loop', 'type', 'onended', 'panningModel', 'distanceModel', 'refDistance', 'rolloffFactor', 'maxDistance', 'curve', 'oversample', 'normalize', 'loopStart', 'loopEnd']);
  const node = (kind = 'other') =>
    new Proxy({} as Record<string, unknown>, {
      get(target, key: string) {
        if (key in target) return target[key];
        if (key === 'disconnect') return (target[key] = () => bump(disconnected, kind));
        if (METHODS.has(key)) return (target[key] = () => undefined);
        if (PLAIN.has(key)) return undefined;
        return (target[key] = param(kind));
      },
      set(target, key: string, value) {
        target[key] = value;
        return true;
      },
    });

  const state = { time: 0 };
  const stateListeners = new Set<() => void>();
  const setState = (next: string) => {
    if (ctx.state === next) return;
    ctx.state = next;
    stateListeners.forEach((fn) => fn());
  };
  const ctx = {
    state: 'running' as string,
    sampleRate: 8000,
    destination: node('destination'),
    listener: node('listener'),
    get currentTime() {
      return state.time;
    },
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'statechange') stateListeners.add(fn);
    },
    removeEventListener: (_type: string, fn: () => void) => {
      stateListeners.delete(fn);
    },
    createGain: () => (created.gain++, node('gain')),
    createOscillator: () => (created.oscillator++, node('oscillator')),
    createBufferSource: () => (created.bufferSource++, node('bufferSource')),
    createPanner: () => (created.panner++, node('panner')),
    createBiquadFilter: () => (created.biquad++, node('biquad')),
    createStereoPanner: () => (created.stereoPanner++, node('stereoPanner')),
    createConvolver: () => node('convolver'),
    createDynamicsCompressor: () => node('compressor'),
    createWaveShaper: () => node('waveShaper'),
    createBuffer: (channels: number, length: number, sampleRate: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate, getChannelData: (c: number) => data[c] };
    },
    resume: async () => {
      if (ctx.state !== 'closed') setState('running');
    },
    suspend: async () => {
      if (ctx.state !== 'closed') setState('suspended');
    },
    close: async () => {
      setState('closed');
    },
  };

  return {
    ctx: ctx as unknown as AudioContext,
    created,
    automation,
    disconnected,
    /** What the browser does behind the page's back: a phone call, a device change, a policy. */
    interrupt: (next: 'suspended' | 'interrupted' = 'interrupted') => setState(next),
    advance: (seconds: number) => {
      state.time += seconds;
    },
  };
}
