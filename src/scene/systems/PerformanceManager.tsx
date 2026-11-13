import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { adaptQuality, initialAdapt } from '../../config/adapt';
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
  const gl = useThree((s) => s.gl);
  const quality = useStore((s) => s.quality);
  const acc = useRef({ time: 0, frames: 0, age: 0, calls: 0, triangles: 0, adapt: initialAdapt(quality) });

  // A frame is several passes (shadows, the pond's reflection, the scene, each post-processing
  // step) and the renderer resets its counters at every one, so on its own it reports only the
  // last: one full-screen triangle. Count the whole frame instead.
  useEffect(() => {
    const previous = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = previous;
    };
  }, [gl]);

  // Before anything else draws this frame: what the previous frame came to.
  useFrame(() => {
    const a = acc.current;
    a.calls = gl.info.render.calls;
    a.triangles = gl.info.render.triangles;
    gl.info.reset();
  }, -1000);

  useFrame((_, delta) => {
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
    runtime.drawCalls = a.calls;
    runtime.triangles = a.triangles;

    const s = useStore.getState();
    if (!s.autoQuality || s.phase === 'loading' || a.age < WARMUP) return;
    // the store is the authority on level and resolution: the visitor may have changed either
    const current = a.adapt.level === s.quality && a.adapt.dprScale === s.dprScale ? a.adapt : { ...initialAdapt(s.quality), dprScale: s.dprScale };
    const next = adaptQuality(current, fps);
    a.adapt = next;
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
