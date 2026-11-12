import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { audio } from '../../audio/AudioEngine';
import { events } from '../../state/events';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';
import { CABIN, POND, WATER_LEVEL, cabinToWorld } from '../../world/layout';
import { BRIDGE, bridgeDeckY } from '../../world/pond';
import { EAVES, ROOF_SLOPES } from '../cabin/Roof';
import { CHIME } from '../cabin/veranda';
import { SPOUT_LANDING } from '../pond/Spout';

/** Connects the world to the audio engine: listener pose, wind strength, weather, footsteps, fish, volume controls. */
export function AudioSync(): null {
  const forward = useRef(new THREE.Vector3());
  const weather = useRef({ rain: 0, level: 0, wet: 0, roof: 0, indoors: 0 });

  useEffect(() => {
    const [chimeX, chimeZ] = cabinToWorld(CHIME[0], CHIME[2]);
    const eaveEnd = (side: number): [number, number, number] => {
      const [x, z] = cabinToWorld(side * EAVES[0].xHalf, EAVES[0].z);
      return [x, EAVES[0].y, z];
    };
    audio.setSources({
      spout: [SPOUT_LANDING.x, WATER_LEVEL + 0.1, SPOUT_LANDING.z],
      chime: [chimeX, CHIME[1], chimeZ],
      cabin: [CABIN.x, 1.6, CABIN.z],
      waterLevel: WATER_LEVEL,
      roof: [CABIN.x, ROOF_SLOPES[0].yTop - 0.6, CABIN.z],
      pond: [POND.cx, WATER_LEVEL, POND.cz],
      bridge: [BRIDGE.x, bridgeDeckY((BRIDGE.z0 + BRIDGE.z1) / 2), (BRIDGE.z0 + BRIDGE.z1) / 2],
      eave: [eaveEnd(-1), eaveEnd(1)],
    });

    const applyLevels = () => {
      const s = useStore.getState();
      audio.setLevels(s.volumes, s.muted);
    };
    applyLevels();
    audio.setThunderEnabled(useStore.getState().thunder);
    const offStore = useStore.subscribe((s, prev) => {
      if (s.volumes !== prev.volumes || s.muted !== prev.muted) applyLevels();
      if (s.thunder !== prev.thunder) audio.setThunderEnabled(s.thunder);
    });
    const offThunder = events.on('thunder', (e) => audio.thunder(e.delay, e.strength));
    const offStep = events.on('footstep', (e) => audio.footstep(e.surface, e.speed));
    const offFish = events.on('fishSurface', (e) => audio.plop(e.x, e.z, e.strength));
    const onVisibility = () => (document.hidden ? audio.suspend() : audio.resume());
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      offStore();
      offStep();
      offFish();
      offThunder();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useFrame(({ camera }, delta) => {
    if (!audio.started) return;
    camera.getWorldDirection(forward.current);
    const w = weather.current;
    w.rain = runtime.rain;
    w.level = runtime.rainLevel;
    w.wet = runtime.wet;
    w.roof = runtime.shelter;
    w.indoors = runtime.indoors;
    audio.setWeather(w);
    audio.update(
      delta,
      { x: camera.position.x, y: camera.position.y, z: camera.position.z, fx: forward.current.x, fy: forward.current.y, fz: forward.current.z },
      { gust: runtime.gust, walkSpeed: runtime.walkSpeed, embodied: runtime.embodied },
    );
  });

  return null;
}
