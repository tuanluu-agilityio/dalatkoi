import { describe, expect, it } from 'vitest';
import { detectQuality, QUALITY } from './quality';

describe('detectQuality', () => {
  it('weak touch device → low', () => {
    expect(detectQuality({ touch: true, memory: 4, cores: 8, renderer: 'Adreno (TM) 610' })).toBe('low');
  });
  it('strong touch device → medium', () => {
    expect(detectQuality({ touch: true, memory: 8, cores: 8, renderer: 'Apple GPU' })).toBe('medium');
  });
  it('desktop integrated GPU → medium', () => {
    expect(detectQuality({ touch: false, memory: 16, cores: 8, renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)' })).toBe('medium');
  });
  it('desktop discrete GPU → high', () => {
    expect(detectQuality({ touch: false, memory: 16, cores: 12, renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)' })).toBe('high');
  });
  it('software renderer → low', () => {
    expect(detectQuality({ touch: false, memory: 16, cores: 12, renderer: 'Google SwiftShader' })).toBe('low');
  });
  it('unknown signals fall back to medium', () => {
    expect(detectQuality({ touch: false })).toBe('medium');
  });
  it('profiles scale down monotonically', () => {
    expect(QUALITY.high.grassCount).toBeGreaterThan(QUALITY.medium.grassCount);
    expect(QUALITY.medium.grassCount).toBeGreaterThan(QUALITY.low.grassCount);
    expect(QUALITY.low.reflectionSize).toBe(0);
  });
});
