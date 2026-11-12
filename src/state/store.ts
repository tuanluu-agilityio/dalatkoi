import { create } from 'zustand';
import type { QualityLevel } from '../config/quality';
import type { RainIntensity, WeatherMode } from '../weather/weather';

export type Phase = 'loading' | 'ready' | 'intro' | 'explore';
export type CameraMode = 'walk' | 'cinematic' | 'orbit';
export type VolumeBus = 'master' | 'ambient' | 'environment' | 'footsteps' | 'rain';

export interface AppState {
  phase: Phase;
  sceneReady: boolean;
  /** 0..1 loading progress shown on the title screen; never goes backwards. */
  loadProgress: number;
  cameraMode: CameraMode;
  quality: QualityLevel;
  autoQuality: boolean;
  /** Runtime resolution multiplier (0.6..1) applied on top of the profile's DPR cap. */
  dprScale: number;
  muted: boolean;
  volumes: Record<VolumeBus, number>;
  /** Id of the point of interest the visitor is near, if any. */
  hint: string | null;
  noteOpen: boolean;
  pointerLocked: boolean;
  isTouch: boolean;
  weather: WeatherMode;
  rainIntensity: RainIntensity;
  /** Thunder (sound) and lightning (light) can be switched off separately. */
  thunder: boolean;
  lightning: boolean;

  setSceneReady: () => void;
  setLoadProgress: (value: number) => void;
  enter: (withSound: boolean) => void;
  finishIntro: () => void;
  setCameraMode: (mode: CameraMode) => void;
  setQuality: (level: QualityLevel, auto?: boolean) => void;
  setDprScale: (scale: number) => void;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  setVolume: (bus: VolumeBus, value: number) => void;
  setHint: (id: string | null) => void;
  setNoteOpen: (open: boolean) => void;
  setPointerLocked: (locked: boolean) => void;
  setIsTouch: (touch: boolean) => void;
  setWeather: (mode: WeatherMode) => void;
  toggleWeather: () => void;
  setRainIntensity: (intensity: RainIntensity) => void;
  setThunder: (on: boolean) => void;
  setLightning: (on: boolean) => void;
}

/** Flashes are off by default for visitors who ask their system for reduced motion. */
const calmMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export const useStore = create<AppState>()((set, get) => ({
  phase: 'loading',
  sceneReady: false,
  loadProgress: 0,
  cameraMode: 'cinematic',
  quality: 'medium',
  autoQuality: true,
  dprScale: 1,
  muted: false,
  volumes: { master: 0.8, ambient: 0.8, environment: 0.85, footsteps: 0.7, rain: 0.85 },
  hint: null,
  noteOpen: false,
  pointerLocked: false,
  isTouch: false,
  weather: 'morning',
  rainIntensity: 'moderate',
  thunder: true,
  lightning: !calmMotion,

  setSceneReady: () => set((s) => ({ sceneReady: true, loadProgress: 1, phase: s.phase === 'loading' ? 'ready' : s.phase })),
  setLoadProgress: (value) => {
    const v = clamp01(value);
    if (Number.isFinite(value) && v > get().loadProgress) set({ loadProgress: v });
  },
  enter: (withSound) => {
    if (get().phase !== 'ready') return;
    set({ phase: 'intro', cameraMode: 'cinematic', muted: !withSound });
  },
  finishIntro: () => {
    if (get().phase !== 'intro') return;
    set({ phase: 'explore', cameraMode: 'walk' });
  },
  setCameraMode: (mode) => {
    if (get().phase !== 'explore') return;
    set({ cameraMode: mode, noteOpen: false, hint: mode === 'walk' ? get().hint : null });
  },
  setQuality: (level, auto = false) => set({ quality: level, autoQuality: auto, dprScale: 1 }),
  setDprScale: (scale) => set({ dprScale: Math.min(1, Math.max(0.6, scale)) }),
  setMuted: (muted) => set({ muted }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setVolume: (bus, value) => set((s) => ({ volumes: { ...s.volumes, [bus]: clamp01(value) } })),
  setHint: (id) => {
    if (get().hint !== id) set({ hint: id, noteOpen: id === null ? false : get().noteOpen });
  },
  setNoteOpen: (open) => set({ noteOpen: open }),
  setPointerLocked: (locked) => set({ pointerLocked: locked }),
  setIsTouch: (touch) => set({ isTouch: touch }),
  setWeather: (mode) => set({ weather: mode }),
  toggleWeather: () => set((s) => ({ weather: s.weather === 'rain' ? 'morning' : 'rain' })),
  setRainIntensity: (intensity) => set({ rainIntensity: intensity }),
  setThunder: (on) => set({ thunder: on }),
  setLightning: (on) => set({ lightning: on }),
}));
