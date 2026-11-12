/**
 * Per-frame shared values. Written by scene systems inside the render loop and
 * read by other systems (audio, fish, UI overlays) without going through React.
 */
export const runtime = {
  /** Camera position. */
  camX: 0,
  camY: 1.65,
  camZ: 17,
  /** True while the camera represents a person standing in the world (walk mode). */
  embodied: false,
  /** Horizontal walking speed in m/s. */
  walkSpeed: 0,
  /** 0..1 dip-to-dark requested by the camera system. */
  fade: 0,
  /** Depth-of-field focus distance (m) requested by the cinematic camera. */
  focus: 12,
  /** Slow gust signal 0..1 shared by wind visuals and wind audio. */
  gust: 0.4,
  fps: 60,
  time: 0,
  /** Joystick vector written by the touch UI, read by the walk controller. */
  joyX: 0,
  joyY: 0,
  /** Development aid: [x, y, z, lookX, lookY, lookZ, fov?] overrides the camera when set. */
  debugPose: null as number[] | null,
};
