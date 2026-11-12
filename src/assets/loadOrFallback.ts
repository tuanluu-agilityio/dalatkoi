export interface Loaded<T> {
  value: T;
  /** False when the generated fallback is being used. */
  fromFile: boolean;
}

/**
 * Try to load an external asset; if it fails, throws, or takes longer than
 * `timeoutMs`, resolve with the fallback instead. Never rejects.
 */
export function loadOrFallback<T>(load: () => Promise<T>, fallback: T, timeoutMs = 15000): Promise<Loaded<T>> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: Loaded<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ value: fallback, fromFile: false }), timeoutMs);
    try {
      load().then(
        (value) => finish({ value, fromFile: true }),
        () => finish({ value: fallback, fromFile: false }),
      );
    } catch {
      finish({ value: fallback, fromFile: false });
    }
  });
}
