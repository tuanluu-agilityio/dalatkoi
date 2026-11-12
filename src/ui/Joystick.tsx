import { useEffect, useRef } from 'react';
import { runtime } from '../state/runtime';
import { useStore } from '../state/store';

const RADIUS = 46;

/** Touch walking: drag the thumb pad. Pushing it to the rim breaks into a jog. */
export function Joystick() {
  const visible = useStore((s) => s.isTouch && s.phase === 'explore' && s.cameraMode === 'walk' && !s.noteOpen);
  const knob = useRef<HTMLSpanElement>(null);
  const active = useRef<number | null>(null);

  const set = (x: number, y: number) => {
    runtime.joyX = x;
    runtime.joyY = y;
    if (knob.current) knob.current.style.transform = `translate(${x * RADIUS}px, ${-y * RADIUS}px)`;
  };

  // never leave the walker moving when the pad disappears
  useEffect(() => {
    if (!visible) {
      active.current = null;
      set(0, 0);
    }
    return () => set(0, 0);
  }, [visible]);

  if (!visible) return null;

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (active.current !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / RADIUS;
    let dy = (e.clientY - (r.top + r.height / 2)) / RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    set(dx, -dy);
  };
  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    set(0, 0);
  };

  return (
    <div
      className="joystick"
      role="application"
      aria-label="Walk"
      onPointerDown={(e) => {
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <span ref={knob} className="joystick-knob" />
    </div>
  );
}
