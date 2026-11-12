import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { events } from '../../state/events';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';
import { FLASH_LENGTH, createWeatherState, flashEnvelope, nextStrikeDelay, stepWeather, thunderFor } from '../../weather/weather';
import { shelterAt } from '../../world/shelter';
import { HAZE_COLOR, HAZE_MORNING, HAZE_RAIN } from '../lighting/SkyDome';
import { weatherUniforms } from './uniforms';

const FOG_MORNING = 0.0105;
const FLASH_TINT = new THREE.Color(0.75, 0.8, 0.92);

/** Lives at module level so the weather carries on across a quality rebuild of the Canvas. */
const state = createWeatherState();
const storm = { next: 12, flashAge: FLASH_LENGTH, flashPeak: 0 };
const shelter = { roof: 0, indoors: 0 };

/**
 * The one place weather is advanced. Reads the requested mode and intensity
 * from the store, eases toward them, and publishes the result to `runtime`
 * (for audio and CPU systems) and `weatherUniforms` (for shaders). Also owns
 * the fog, the haze colour and the lightning schedule. Mount once in the Canvas.
 */
export function WeatherController(): null {
  useFrame(({ scene, camera }, delta) => {
    const s = useStore.getState();
    const dt = Math.min(delta, 0.1);
    stepWeather(state, s.weather, s.rainIntensity, dt);

    // lightning: only once the rain has properly arrived
    if (state.rain > 0.9) {
      storm.next -= dt;
      if (storm.next <= 0) {
        storm.next = nextStrikeDelay(state.level, Math.random());
        const km = 1.2 + Math.random() * 4.3;
        const { delay, strength } = thunderFor(km);
        if (s.lightning) {
          const a = Math.random() * Math.PI * 2;
          weatherUniforms.uFlashDir.value.set(Math.cos(a), Math.sin(a));
          storm.flashAge = 0;
          storm.flashPeak = 0.45 + 0.55 * strength;
        }
        if (s.thunder) events.emit('thunder', { delay, strength });
      }
    } else {
      storm.next = Math.max(storm.next, 6);
    }
    storm.flashAge = Math.min(FLASH_LENGTH, storm.flashAge + dt);
    const flash = s.lightning ? flashEnvelope(storm.flashAge) * storm.flashPeak * state.rain : 0;

    runtime.rain = state.rain;
    runtime.rainLevel = state.level;
    runtime.wet = state.wet;
    runtime.flash = flash;
    weatherUniforms.uRain.value = state.rain;
    weatherUniforms.uRainLevel.value = state.level;
    weatherUniforms.uWet.value = state.wet;
    weatherUniforms.uFlash.value = flash;

    shelterAt(camera.position.x, camera.position.z, shelter);
    // above the eaves (orbit, tour) there is no roof overhead
    const under = camera.position.y < 3.4 ? 1 : 0;
    runtime.shelter = shelter.roof * under;
    runtime.indoors = shelter.indoors * under;

    // haze and fog: greyer, closer, and briefly lit by a flash
    HAZE_COLOR.copy(HAZE_MORNING).lerp(HAZE_RAIN, state.rain).lerp(FLASH_TINT, flash * 0.22);
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.copy(HAZE_COLOR);
      fog.density = THREE.MathUtils.lerp(FOG_MORNING, 0.019 + 0.008 * state.level, state.rain);
    }
  });
  return null;
}
