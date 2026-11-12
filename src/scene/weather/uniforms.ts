import * as THREE from 'three';

/** One weather signal for every shader that reacts to rain. All are 0 on a dry morning. */
export const weatherUniforms = {
  /** 0..1 presence of the rain, eased through transitions. */
  uRain: { value: 0 },
  /** 0..1 intensity: drizzle … heavy. */
  uRainLevel: { value: 0.62 },
  /** 0..1 surface wetness; lags the rain. */
  uWet: { value: 0 },
  /** 0..1 brightness of the current lightning flash. */
  uFlash: { value: 0 },
  /** Horizontal direction (x, z) the flash comes from. */
  uFlashDir: { value: new THREE.Vector2(0, -1) },
};
