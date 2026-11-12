import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { events } from '../../state/events';
import { runtime } from '../../state/runtime';
import { useStore } from '../../state/store';
import { POIS } from '../../world/pois';
import { groundHeight } from '../../world/terrain';
import { INTRO_DURATION, sampleCinematic, type CinematicSample } from './cinematic';
import { WALK_SPEED, createWalkState, stepWalk, type WalkInput } from './walk';

type View = 'title' | 'cinematic' | 'walk' | 'orbit';

const UP = new THREE.Vector3(0, 1, 0);
const ORBIT_TARGET = new THREE.Vector3(1.5, 1.0, -1.5);
const BLEND_TIME = 1.8;
const DIP_TIME = 1.1;
const WALK_FOV = 58;

const KEY_FORWARD = ['KeyW', 'ArrowUp'];
const KEY_BACK = ['KeyS', 'ArrowDown'];
const KEY_LEFT = ['KeyA', 'ArrowLeft'];
const KEY_RIGHT = ['KeyD', 'ArrowRight'];
const MOVE_KEYS = new Set([...KEY_FORWARD, ...KEY_BACK, ...KEY_LEFT, ...KEY_RIGHT, 'ShiftLeft', 'ShiftRight']);

interface Transition {
  kind: 'blend' | 'dip';
  t: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  fov: number;
}

const viewOf = (phase: string, mode: string): View =>
  phase === 'explore' ? (mode as View) : phase === 'intro' ? 'cinematic' : 'title';

const smooth = (k: number) => k * k * (3 - 2 * k);

/** Where the visitor stands. Module-level so it survives the scene being rebuilt on a quality change. */
const WALKER = createWalkState();

/**
 * The one camera. Three ways of seeing the place share it:
 *  - walk: first person, with collision, head bob and footsteps
 *  - cinematic: the guided tour (also the opening sequence)
 *  - orbit: a free look around the clearing from above
 * Changing between them never cuts: nearby views blend, distant ones dip to dark.
 */
export function CameraRig(): null {
  const gl = useThree((s) => s.gl);
  const walk = useRef(WALKER);
  const keys = useRef(new Set<string>());
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef(0);
  const orbit = useRef({ az: 0.5, polar: 1.12, dist: 22, idle: 10 });
  const walkFov = useRef(WALK_FOV);
  const view = useRef<View>('title');
  const transition = useRef<Transition | null>(null);
  const cineTime = useRef(0);
  const sample = useRef({} as CinematicSample);
  const reducedMotion = useRef(false);
  const scratch = useRef({
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    look: new THREE.Vector3(),
    matrix: new THREE.Matrix4(),
    euler: new THREE.Euler(0, 0, 0, 'YXZ'),
  });

  useEffect(() => {
    const canvas = gl.domElement;
    reducedMotion.current = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (import.meta.env.DEV) (window as unknown as { __walk?: unknown }).__walk = walk.current;

    const look = (dx: number, dy: number, touch: boolean) => {
      if (view.current === 'walk') {
        const k = touch ? 0.0042 : 0.0022;
        walk.current.yaw -= dx * k;
        walk.current.pitch = Math.min(1.3, Math.max(-1.3, walk.current.pitch - dy * k));
      } else if (view.current === 'orbit') {
        const o = orbit.current;
        o.az -= dx * 0.005;
        o.polar = Math.min(1.45, Math.max(0.35, o.polar - dy * 0.004));
        o.idle = 0;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (MOVE_KEYS.has(e.code)) {
        keys.current.add(e.code);
        if (e.code.startsWith('Arrow')) e.preventDefault();
      }
      if (e.code === 'KeyE' && !e.repeat) events.emit('interact', undefined);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const clearKeys = () => keys.current.clear();

    const onPointerDown = (e: PointerEvent) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pinch.current = 0;
      if (view.current === 'walk' && e.pointerType === 'mouse' && document.pointerLockElement !== canvas) {
        // may be refused (e.g. too soon after Esc); drag-to-look still works
        void Promise.resolve(canvas.requestPointerLock?.()).catch(() => undefined);
      }
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (document.pointerLockElement === canvas) {
        look(e.movementX, e.movementY, false);
        return;
      }
      const p = pointers.current.get(e.pointerId);
      if (!p) return;
      if (pointers.current.size === 2 && view.current === 'orbit') {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...pointers.current.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.current > 0 && d > 0) {
          const o = orbit.current;
          o.dist = Math.min(28, Math.max(9, (o.dist * pinch.current) / d));
          o.idle = 0;
        }
        pinch.current = d;
        return;
      }
      look(e.clientX - p.x, e.clientY - p.y, e.pointerType !== 'mouse');
      p.x = e.clientX;
      p.y = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      pinch.current = 0;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (view.current === 'walk') {
        walkFov.current = Math.min(70, Math.max(30, walkFov.current + e.deltaY * 0.03));
      } else if (view.current === 'orbit') {
        const o = orbit.current;
        o.dist = Math.min(28, Math.max(9, o.dist * Math.exp(e.deltaY * 0.001)));
        o.idle = 0;
      }
    };
    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      useStore.getState().setPointerLocked(locked);
      if (!locked) clearKeys();
    };
    const onSkip = () => useStore.getState().finishIntro();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('pointerlockchange', onLockChange);
    const offSkip = events.on('skipIntro', onSkip);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onLockChange);
      offSkip();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      useStore.getState().setPointerLocked(false);
    };
  }, [gl]);

  useFrame(({ camera, clock }, rawDelta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const dt = Math.min(0.1, rawDelta);
    const state = useStore.getState();
    const s = scratch.current;
    const next = viewOf(state.phase, state.cameraMode);

    // --- view changes ---
    if (next !== view.current) {
      const prev = view.current;
      view.current = next;
      if (next === 'cinematic') cineTime.current = 0;
      if (next === 'orbit') {
        const o = orbit.current;
        o.az = Math.atan2(cam.position.x - ORBIT_TARGET.x, cam.position.z - ORBIT_TARGET.z);
        o.idle = 10;
      }
      if (next !== 'walk' && document.pointerLockElement === gl.domElement) document.exitPointerLock();
      keys.current.clear();
      if (prev !== 'title') {
        const far = prev === 'cinematic' || next === 'cinematic';
        transition.current = {
          kind: far ? 'dip' : 'blend',
          // already dark (a cut in the tour)? then only the second half of the dip is needed
          t: far && runtime.fade > 0.9 ? DIP_TIME / 2 : 0,
          pos: cam.position.clone(),
          quat: cam.quaternion.clone(),
          fov: cam.fov,
        };
      }
    }

    // --- target pose for the current view ---
    let fov = WALK_FOV;
    let focus = 12;
    let fade = 0;
    if (next === 'walk') {
      const w = walk.current;
      const k = keys.current;
      const has = (codes: string[]) => codes.some((c) => k.has(c));
      const moving = transition.current === null && !state.noteOpen;
      const input: WalkInput = moving
        ? {
            forward: (has(KEY_FORWARD) ? 1 : 0) - (has(KEY_BACK) ? 1 : 0) + runtime.joyY,
            strafe: (has(KEY_RIGHT) ? 1 : 0) - (has(KEY_LEFT) ? 1 : 0) + runtime.joyX,
            run: k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(runtime.joyX, runtime.joyY) > 0.92,
          }
        : { forward: 0, strafe: 0, run: false };
      const landed = stepWalk(w, input, dt);
      if (landed) events.emit('footstep', { surface: landed, speed: w.speed, x: w.x, z: w.z });
      const bob = reducedMotion.current ? 0 : Math.sin(w.bobPhase * Math.PI * 2) * 0.026 * Math.min(1, w.speed / WALK_SPEED);
      s.pos.set(w.x, w.eyeY + bob, w.z);
      s.quat.setFromEuler(s.euler.set(w.pitch, w.yaw, 0));
      fov = walkFov.current;
      runtime.walkSpeed = w.speed;
    } else {
      runtime.walkSpeed = 0;
      if (next === 'cinematic') {
        cineTime.current += dt;
        if (state.phase === 'intro' && cineTime.current >= INTRO_DURATION) {
          cineTime.current = INTRO_DURATION;
          state.finishIntro();
        }
        const c = sampleCinematic(cineTime.current, sample.current);
        s.pos.set(c.x, c.y, c.z);
        s.quat.setFromRotationMatrix(s.matrix.lookAt(s.pos, s.look.set(c.lx, c.ly, c.lz), UP));
        fov = c.fov;
        focus = c.focus;
        fade = c.fade;
      } else if (next === 'orbit') {
        const o = orbit.current;
        o.idle += dt;
        if (o.idle > 3 && pointers.current.size === 0 && !reducedMotion.current) o.az += dt * 0.035;
        const sp = Math.sin(o.polar);
        s.pos.set(ORBIT_TARGET.x + o.dist * sp * Math.sin(o.az), ORBIT_TARGET.y + o.dist * Math.cos(o.polar), ORBIT_TARGET.z + o.dist * sp * Math.cos(o.az));
        s.pos.y = Math.max(s.pos.y, groundHeight(s.pos.x, s.pos.z) + 1.4);
        s.quat.setFromRotationMatrix(s.matrix.lookAt(s.pos, ORBIT_TARGET, UP));
        fov = 46;
        focus = o.dist;
      } else {
        // title: a held wide frame with the slightest drift
        const t = clock.elapsedTime;
        s.pos.set(-1.2 + Math.sin(t * 0.07) * 1.1, 2.15 + Math.sin(t * 0.05) * 0.12, 19.5);
        s.quat.setFromRotationMatrix(s.matrix.lookAt(s.pos, s.look.set(5.6, 2.0, -6), UP));
        fov = 50;
        focus = 26;
      }
    }

    // --- transitions ---
    const tr = transition.current;
    if (tr) {
      tr.t += dt;
      if (tr.kind === 'blend') {
        const k = smooth(Math.min(1, tr.t / BLEND_TIME));
        s.pos.lerpVectors(tr.pos, s.pos, k);
        s.quat.slerpQuaternions(tr.quat, s.quat, k);
        fov = tr.fov + (fov - tr.fov) * k;
        if (tr.t >= BLEND_TIME) transition.current = null;
      } else {
        const half = DIP_TIME / 2;
        if (tr.t < half) {
          s.pos.copy(tr.pos);
          s.quat.copy(tr.quat);
          fov = tr.fov;
          fade = Math.max(runtime.fade, smooth(tr.t / half));
        } else {
          fade = Math.max(fade, 1 - smooth(Math.min(1, (tr.t - half) / half)));
          if (tr.t >= DIP_TIME) transition.current = null;
        }
      }
    }

    // --- apply ---
    const pose = import.meta.env.DEV ? runtime.debugPose : null;
    if (pose) {
      cam.position.set(pose[0], pose[1], pose[2]);
      cam.lookAt(s.look.set(pose[3], pose[4], pose[5]));
      fov = pose[6] ?? fov;
      fade = 0;
    } else {
      cam.position.copy(s.pos);
      cam.quaternion.copy(s.quat);
    }
    // a tall, narrow screen needs a wider lens to hold the same scene
    const lens = Math.min(88, cam.aspect < 1 ? fov * (1 + (1 - cam.aspect) * 0.75) : fov);
    if (Math.abs(cam.fov - lens) > 0.01) {
      cam.fov = lens;
      cam.updateProjectionMatrix();
    }

    runtime.camX = cam.position.x;
    runtime.camY = cam.position.y;
    runtime.camZ = cam.position.z;
    runtime.fade = fade;
    runtime.focus = focus;
    runtime.embodied = next === 'walk' && transition.current === null;
  }, -1);

  return null;
}

/** Tells the UI which point of interest the visitor is standing at, if any. */
export function PoiWatcher(): null {
  const acc = useRef(0);
  useFrame((_, delta) => {
    acc.current += delta;
    if (acc.current < 0.2) return;
    acc.current = 0;
    let found: string | null = null;
    if (runtime.embodied) {
      let best = Infinity;
      for (const poi of POIS) {
        const d = Math.hypot(runtime.camX - poi.x, runtime.camZ - poi.z);
        if (d < poi.radius && d < best) {
          best = d;
          found = poi.id;
        }
      }
    }
    useStore.getState().setHint(found);
  });
  return null;
}
