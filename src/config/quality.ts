export type QualityLevel = 'high' | 'medium' | 'low';

export interface QualityProfile {
  label: string;
  /** Upper bound for devicePixelRatio. */
  dpr: number;
  shadowMapSize: number;
  /** Planar reflection render-target size; 0 disables the reflection pass. */
  reflectionSize: number;
  post: boolean;
  ao: boolean;
  bloom: boolean;
  dof: boolean;
  smaa: boolean;
  grassCount: number;
  /** Multiplier applied to every scattered plant list. */
  vegetationDensity: number;
  pineCount: number;
  koiCount: number;
  mistLayers: number;
  motes: number;
  shafts: number;
  terrainSegments: number;
  anisotropy: number;
}

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  high: {
    label: 'High',
    dpr: 1.75,
    shadowMapSize: 4096,
    reflectionSize: 1024,
    post: true,
    ao: true,
    bloom: true,
    dof: true,
    smaa: true,
    grassCount: 120000,
    vegetationDensity: 1,
    pineCount: 330,
    koiCount: 14,
    mistLayers: 26,
    motes: 700,
    shafts: 14,
    terrainSegments: 300,
    anisotropy: 8,
  },
  medium: {
    label: 'Medium',
    dpr: 1.25,
    shadowMapSize: 2048,
    reflectionSize: 512,
    post: true,
    ao: false,
    bloom: true,
    dof: false,
    smaa: true,
    grassCount: 52000,
    vegetationDensity: 0.6,
    pineCount: 220,
    koiCount: 11,
    mistLayers: 16,
    motes: 350,
    shafts: 9,
    terrainSegments: 220,
    anisotropy: 4,
  },
  low: {
    label: 'Low',
    dpr: 1,
    shadowMapSize: 1024,
    reflectionSize: 0,
    post: false,
    ao: false,
    bloom: false,
    dof: false,
    smaa: false,
    grassCount: 20000,
    vegetationDensity: 0.3,
    pineCount: 120,
    koiCount: 8,
    mistLayers: 9,
    motes: 120,
    shafts: 5,
    terrainSegments: 150,
    anisotropy: 2,
  },
};

export interface DeviceSignals {
  touch: boolean;
  /** navigator.deviceMemory in GB, when the browser exposes it. */
  memory?: number;
  cores?: number;
  /** Unmasked WebGL renderer string, when available. */
  renderer?: string;
}

const SOFTWARE = /swiftshader|llvmpipe|software|basic render/i;
const DISCRETE = /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|apple m\d|arc\(tm\) [ab]\d{3}/i;
const INTEGRATED = /intel|uhd|iris|hd graphics|radeon\(tm\) graphics|vega|mali|adreno|powervr/i;

export function detectQuality(s: DeviceSignals): QualityLevel {
  const renderer = s.renderer ?? '';
  if (SOFTWARE.test(renderer)) return 'low';
  if (s.touch) {
    const weak = (s.memory !== undefined && s.memory <= 4) || (s.cores !== undefined && s.cores <= 4);
    return weak ? 'low' : 'medium';
  }
  if (DISCRETE.test(renderer)) return 'high';
  if (INTEGRATED.test(renderer)) return 'medium';
  return 'medium';
}

/** Reads the signals from the running browser. Safe to call without WebGL. */
export function readDeviceSignals(): DeviceSignals {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const touch = coarse && !fine ? true : coarse && nav.maxTouchPoints > 1 && innerWidth < 1100;
  let renderer: string | undefined;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    renderer = undefined;
  }
  return { touch, memory: nav.deviceMemory, cores: nav.hardwareConcurrency, renderer };
}
