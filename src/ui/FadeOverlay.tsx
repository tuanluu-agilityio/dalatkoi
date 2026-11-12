import { useEffect, useRef } from 'react';
import { runtime } from '../state/runtime';
import { useStore } from '../state/store';

/** The dip-to-dark the camera asks for on cuts, plus the film bars of the guided tour. */
export function FadeOverlay() {
  const ref = useRef<HTMLDivElement>(null);
  const cinematic = useStore((s) => s.phase === 'intro' || (s.phase === 'explore' && s.cameraMode === 'cinematic'));

  useEffect(() => {
    let frame = 0;
    let last = -1;
    const tick = () => {
      const v = Math.round(runtime.fade * 100) / 100;
      if (v !== last && ref.current) {
        ref.current.style.opacity = String(v);
        last = v;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      <div ref={ref} className="fade" aria-hidden="true" />
      <div className="letterbox" data-on={cinematic} aria-hidden="true">
        <span />
        <span />
      </div>
    </>
  );
}
