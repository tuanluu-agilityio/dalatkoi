import type { Surface } from '../world/surfaces';

/** One-shot events that cross module boundaries (scene → audio, scene → scene). */
export interface EventMap {
  footstep: { surface: Surface; speed: number; x: number; z: number };
  fishSurface: { x: number; z: number; strength: number };
  ripple: { x: number; z: number; strength: number };
  /** A lightning strike: thunder follows after `delay` seconds at 0..1 `strength`. */
  thunder: { delay: number; strength: number };
  skipIntro: undefined;
  interact: undefined;
}

type Handler<T> = (payload: T) => void;

const handlers = new Map<keyof EventMap, Set<Handler<never>>>();

export const events = {
  on<K extends keyof EventMap>(type: K, fn: Handler<EventMap[K]>): () => void {
    let set = handlers.get(type);
    if (!set) {
      set = new Set();
      handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => {
      set.delete(fn as Handler<never>);
    };
  },
  emit<K extends keyof EventMap>(type: K, payload: EventMap[K]): void {
    handlers.get(type)?.forEach((fn) => (fn as Handler<EventMap[K]>)(payload));
  },
};
