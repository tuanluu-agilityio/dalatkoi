import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';

describe('store', () => {
  beforeEach(() => useStore.setState(useStore.getInitialState(), true));

  it('clamps volumes to 0..1', () => {
    useStore.getState().setVolume('master', 3);
    expect(useStore.getState().volumes.master).toBe(1);
    useStore.getState().setVolume('ambient', -2);
    expect(useStore.getState().volumes.ambient).toBe(0);
    useStore.getState().setVolume('footsteps', Number.NaN);
    expect(useStore.getState().volumes.footsteps).toBe(0);
  });

  it('ignores camera mode changes before exploring', () => {
    useStore.getState().setCameraMode('orbit');
    expect(useStore.getState().cameraMode).toBe('cinematic');
  });

  it('enter → intro → explore lands in walk mode', () => {
    const s = useStore.getState();
    s.enter(false);
    expect(useStore.getState().phase).toBe('loading'); // scene not ready yet
    s.setSceneReady();
    useStore.getState().enter(false);
    expect(useStore.getState().phase).toBe('intro');
    expect(useStore.getState().muted).toBe(true);
    useStore.getState().finishIntro();
    expect(useStore.getState().phase).toBe('explore');
    expect(useStore.getState().cameraMode).toBe('walk');
    useStore.getState().setCameraMode('orbit');
    expect(useStore.getState().cameraMode).toBe('orbit');
  });

  it('manual quality choice disables auto quality', () => {
    useStore.getState().setQuality('low');
    expect(useStore.getState().quality).toBe('low');
    expect(useStore.getState().autoQuality).toBe(false);
  });
});

describe('load progress', () => {
  beforeEach(() => useStore.setState(useStore.getInitialState(), true));

  it('only moves forward and stays within 0..1', () => {
    const s = useStore.getState();
    s.setLoadProgress(0.4);
    s.setLoadProgress(0.2);
    expect(useStore.getState().loadProgress).toBeCloseTo(0.4, 6);
    s.setLoadProgress(7);
    expect(useStore.getState().loadProgress).toBe(1);
    s.setLoadProgress(Number.NaN);
    expect(useStore.getState().loadProgress).toBe(1);
  });

  it('is complete once the scene is ready', () => {
    useStore.getState().setSceneReady();
    expect(useStore.getState().loadProgress).toBe(1);
  });
  it('starts on a dry morning and switches weather in any phase', () => {
    const s = useStore.getState();
    expect(s.weather).toBe('morning');
    expect(s.rainIntensity).toBe('moderate');
    s.toggleWeather();
    expect(useStore.getState().weather).toBe('rain');
    s.setRainIntensity('heavy');
    expect(useStore.getState().rainIntensity).toBe('heavy');
    s.toggleWeather();
    expect(useStore.getState().weather).toBe('morning');
    expect(useStore.getState().rainIntensity).toBe('heavy');
  });

  it('leaves the camera alone when the weather changes', () => {
    const before = useStore.getState();
    before.setWeather('rain');
    const after = useStore.getState();
    expect(after.cameraMode).toBe(before.cameraMode);
    expect(after.phase).toBe(before.phase);
    expect(after.quality).toBe(before.quality);
  });

  it('switches thunder and lightning independently, and has a rain volume', () => {
    const s = useStore.getState();
    s.setThunder(false);
    expect(useStore.getState().thunder).toBe(false);
    expect(useStore.getState().lightning).toBe(true);
    s.setLightning(false);
    s.setThunder(true);
    expect(useStore.getState().thunder).toBe(true);
    expect(useStore.getState().lightning).toBe(false);
    s.setVolume('rain', 0.3);
    expect(useStore.getState().volumes.rain).toBe(0.3);
  });
});
