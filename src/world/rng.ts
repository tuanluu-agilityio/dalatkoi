/** Small deterministic PRNG (mulberry32) so the world is identical on every load. */
export interface Rng {
  (): number;
  range(min: number, max: number): number;
  int(min: number, maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  /** Approximate gaussian in roughly −1..1. */
  gauss(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (min, max) => min + (max - min) * next();
  next.int = (min, max) => Math.floor(next.range(min, max));
  next.pick = (items) => items[Math.floor(next() * items.length)];
  next.gauss = () => (next() + next() + next() - 1.5) / 1.5;
  return next;
}
