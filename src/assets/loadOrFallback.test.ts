import { describe, expect, it } from 'vitest';
import { loadOrFallback } from './loadOrFallback';

describe('loadOrFallback', () => {
  it('returns the loaded value', async () => {
    expect(await loadOrFallback(() => Promise.resolve('file'), 'generated', 50)).toEqual({ value: 'file', fromFile: true });
  });
  it('falls back when the loader rejects', async () => {
    expect(await loadOrFallback(() => Promise.reject(new Error('404')), 'generated', 50)).toEqual({ value: 'generated', fromFile: false });
  });
  it('falls back when the loader throws synchronously', async () => {
    expect(
      await loadOrFallback<string>(() => {
        throw new Error('blocked');
      }, 'generated', 50),
    ).toEqual({ value: 'generated', fromFile: false });
  });
  it('falls back when the loader never settles', async () => {
    expect(await loadOrFallback(() => new Promise<string>(() => {}), 'generated', 20)).toEqual({ value: 'generated', fromFile: false });
  });
});
