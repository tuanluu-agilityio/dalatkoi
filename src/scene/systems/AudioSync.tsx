import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { audio } from '../../audio/AudioEngine';
import { events } from '../../state/events';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';
import { CABIN, WATER_LEVEL, cabinToWorld } from '../../world/layout';
import { CHIME } from '../cabin/veranda';
import { SPOUT_LANDING } from '../pond/Spout';

/** Connects the world to the audio engine: listener pose, wind strength, footsteps, fish, volume controls. */
export function AudioSync(): null {
  const forward = useRef(new THREE.Vector3());

  useEffect(() => {
    const [chimeX, chimeZ] = cabinToWorld(CHIME[0], CHIME[2]);
    audio.setSources({
      spout: [SPOUT_LANDING.x, WATER_LEVEL + 0.1, SPOUT_LANDING.z],
      chime: [chimeX, CHIME[1], chimeZ],
      cabin: [CABIN.x, 1.6, CABIN.z],
      waterLevel: WATER_LEVEL,
    });

    const applyLevels = () => {
      const s = useStore.getState();
      audio.setLevels(s.volumes, s.muted);
    };
    applyLevels();
    const offStore = useStore.subscribe((s, prev) => {
      if (s.volumes !== prev.volumes || s.muted !== prev.muted) applyLevels();
    });
    const offStep = events.on('footstep', (e) => audio.footstep(e.surface, e.speed));
    const offFish = events.on('fishSurface', (e) => audio.plop(e.x, e.z, e.strength));
    const onVisibility = () => (document.hidden ? audio.suspend() : audio.resume());
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      offStore();
      offStep();
      offFish();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useFrame(({ camera }, delta) => {
    if (!audio.started) return;
    camera.getWorldDirection(forward.current);
    audio.update(
      delta,
      { x: camera.position.x, y: camera.position.y, z: camera.position.z, fx: forward.current.x, fy: forward.current.y, fz: forward.current.z },
      { gust: runtime.gust, walkSpeed: runtime.walkSpeed, embodied: runtime.embodied },
    );
  });

  return null;
}
