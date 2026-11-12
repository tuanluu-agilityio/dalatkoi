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
