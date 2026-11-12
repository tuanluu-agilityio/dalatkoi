import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { adaptQuality } from '../../config/adapt';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';

const WINDOW = 2.5;
/** Shader compilation and texture uploads make the first seconds unrepresentative. */
const WARMUP = 5;

/**
 * Measures the real frame rate and, while quality is on Auto, trades resolution
 * and then detail for smoothness. Also publishes the frame rate and draw
 * statistics for the on-screen readout.
 */
export function PerformanceManager(): null {
  const acc = useRef({ time: 0, frames: 0, age: 0, good: 0 });

  useFrame(({ gl }, delta) => {
    const a = acc.current;
    // a stall (tab in the background, a debugger pause) is not a slow frame
    if (delta > 0.5 || document.hidden) {
      a.time = 0;
      a.frames = 0;
      return;
    }
    a.age += delta;
    a.time += delta;
    a.frames++;
    if (a.time < WINDOW) return;

    const fps = a.frames / a.time;
    a.time = 0;
    a.frames = 0;
    runtime.fps = fps;
    runtime.drawCalls = gl.info.render.calls;
    runtime.triangles = gl.info.render.triangles;

    const s = useStore.getState();
    if (!s.autoQuality || s.phase === 'loading' || a.age < WARMUP) return;
    const next = adaptQuality({ level: s.quality, dprScale: s.dprScale, goodWindows: a.good }, fps);
    a.good = next.goodWindows;
    if (next.level !== s.quality) {
      // the scene is rebuilt for the new profile; give it time to settle again
      a.age = 0;
      s.setQuality(next.level, true);
    } else if (next.dprScale !== s.dprScale) {
      s.setDprScale(next.dprScale);
    }
  });

  return null;
}
