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
  /** Weather, written by the weather controller: 0..1 presence of the rain (eased through transitions). */
  rain: 0,
  /** 0..1 smoothed rain intensity (drizzle … heavy). */
  rainLevel: 0.62,
  /** 0..1 wetness of surfaces; lags the rain. */
  wet: 0,
  /** 0..1 brightness of the current lightning flash. */
  flash: 0,
  /** 0..1 how much roof is over the camera, and 1 when it is inside the cabin walls. */
  shelter: 0,
  indoors: 0,
  fps: 60,
  /** Draw statistics of the last main render pass, for the performance readout. */
  drawCalls: 0,
  triangles: 0,
  time: 0,
  /** Joystick vector written by the touch UI, read by the walk controller. */
  joyX: 0,
  joyY: 0,
  /** Development aid: [x, y, z, lookX, lookY, lookZ, fov?] overrides the camera when set. */
  debugPose: null as number[] | null,
  /** The live WebGL renderer, for the performance readout. */
  renderer: null as import('three').WebGLRenderer | null,
};
