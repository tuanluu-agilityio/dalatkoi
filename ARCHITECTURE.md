# Architecture

## Principles
1. **One source of truth for the world.** `src/world/` is pure TypeScript (no rendering, no DOM).
   It defines where everything is — pond outline, terrain height, paths, cabin footprint, bridge,
   plant placements, colliders, walkable surfaces, points of interest. Rendering, collision, audio
   and fish simulation all read from it, so what you see is what you bump into and hear.
2. **Scene and UI never import each other.** They communicate only through the Zustand store
   (`src/state/store.ts`) and a tiny event bus (`src/state/events.ts`) for one-shot events
   (footstep, fish surfaced).
3. **Per-frame state stays out of React.** Animation runs in `useFrame` on refs and shader
   uniforms; the store holds only things the UI needs to render.
4. **Everything degrades.** Each visual system takes its budget from the active quality profile.

## Folder structure
```
src/
  main.tsx  App.tsx
  state/        store.ts (zustand)  events.ts (typed emitter)
  config/       quality.ts (profiles + device detection)
  world/        rng.ts noise.ts layout.ts pond.ts terrain.ts paths.ts surfaces.ts
                colliders.ts scatter.ts pois.ts            ← pure, unit-tested
  assets/       textureManager.ts (load + fallback)  procedural/*.ts (canvas texture generators)
  scene/
    Experience.tsx            Canvas, composition, suspense
    lighting/   Lighting.tsx  SkyDome.tsx
    environment/Terrain.tsx Mountains.tsx Mist.tsx SunShafts.tsx Motes.tsx Birds.tsx
    cabin/      Cabin.tsx Roof.tsx Veranda.tsx Windows.tsx Furniture.tsx materials.ts
    pond/       Water.tsx waterShader.ts PondRocks.tsx LilyPads.tsx Reeds.tsx Bridge.tsx Spout.tsx
    koi/        KoiSchool.tsx koiSim.ts koiGeometry.ts koiTexture.ts
    vegetation/ Pines.tsx Grass.tsx Ferns.tsx Hydrangeas.tsx Bushes.tsx Flowers.tsx
                SmallTrees.tsx Tropicals.tsx Boulders.tsx wind.ts
    camera/     CameraRig.tsx walk.ts orbit.ts cinematic.ts input.ts
    effects/    PostFX.tsx
    perf/       PerformanceManager.tsx
    interaction/PoiWatcher.tsx
  audio/        AudioEngine.ts  AudioSync.tsx  synth/{noise,wind,birds,water,footsteps,cabin}.ts
  ui/           TitleScreen.tsx Hud.tsx ModeSwitcher.tsx AudioControls.tsx Joystick.tsx
                Hint.tsx Fade.tsx icons.tsx  styles/*.css
scripts/        fetch-textures.mjs (downloads + converts CC0 textures)
public/textures/  *.webp
```

## Scene graph
```
<Canvas>
 ├─ PerformanceManager        (fps monitor → store.quality / dpr)
 ├─ Lighting                  (sun + shadow camera, hemisphere, lantern/window point lights)
 ├─ SkyDome  ── also rendered into the PMREM environment map (image-based lighting)
 ├─ Terrain                   (warped grid, splat-blended grass/gravel/soil/pond bed)
 ├─ Mountains                 (3 ridge rings)
 ├─ Cabin ─ Roof · Veranda · Windows · Furniture
 ├─ Pond  ─ Water · PondRocks · LilyPads · Reeds · Spout · Bridge
 ├─ KoiSchool
 ├─ Vegetation ─ Pines · SmallTrees · Grass · Ferns · Hydrangeas · Bushes · Tropicals · Flowers · Boulders
 ├─ Atmosphere ─ Mist · SunShafts · Motes · Birds
 ├─ CameraRig                 (owns the camera in every mode)
 ├─ PoiWatcher · AudioSync
 └─ PostFX                    (N8AO → DoF → Bloom → Vignette → ToneMapping → SMAA)
```

## Camera architecture
`CameraRig` is the only writer of the camera transform. Each mode is a small controller object
with `enter(pose)`, `update(dt, input) → pose`, where `pose = {position, quaternion, fov}`.
On a mode change the rig records the current pose and, for 1.8 s, slerps/lerps from it to the
new controller's live pose with a smootherstep, so the hand-over is continuous even while the
target keeps moving. `input.ts` normalises keyboard, mouse, pointer-lock, wheel, touch-look and
the virtual joystick into one `InputState`.

- `walk.ts` — velocity integration, collision via `world/colliders.resolve()`, height via
  `world/terrain.walkHeight()`, stride counter → `events.emit('footstep', {surface, speed})`.
- `cinematic.ts` — list of shots `{duration, pos: Vec3[], look: Vec3[], fov, focus}` sampled with
  Catmull-Rom curves and eased time; reports a `fade` value (0..1) used by `ui/Fade` for dissolves.
- `orbit.ts` — damped spherical coordinates around a clamped target.

## Physics & collision
2D (top-down) shapes: circles and oriented boxes, stored in a uniform grid for lookup. The
walker is a 0.32 m circle resolved with up to 4 push-out iterations per frame. The pond is an
analytic signed-distance test; the bridge corridor is the only exemption. Height is analytic:
terrain function, veranda deck/steps ramp, bridge arch.

## Audio architecture
```
sources → [ambientBus | environmentBus | footstepBus] → masterGain → compressor → destination
                                └── sends → convolver (generated impulse) for distance
```
`AudioEngine` is a plain class (singleton, created on the Enter click). Synth modules build node
graphs and schedule events with look-ahead timers. Positional sources use `PannerNode` (HRTF,
inverse roll-off). `AudioSync` (inside the Canvas) copies the camera pose to the `AudioListener`
each frame and pushes proximity values (pond, cabin). The engine subscribes to the store for
volumes/mute and to the event bus for footsteps and fish plops.

## State management
Zustand store fields: `phase` (`loading | ready | intro | explore`), `cameraMode`, `quality`,
`autoQuality`, `dpr`, `muted`, `volumes {master, ambient, environment, footsteps}`, `hint`,
`noteOpen`, `pointerLocked`, `isTouch`, `sceneReady`, `fade`. Components subscribe with
selectors; frame-rate code reads `useStore.getState()`.

## Asset pipeline
- **Geometry:** 100% procedural, built once at mount and merged/instanced.
- **Textures:** `scripts/fetch-textures.mjs` downloads CC0 PBR sets from Poly Haven and converts
  them to 1K WebP in `public/textures/`. At runtime `textureManager` hands every material a
  procedural canvas texture immediately and swaps in the file when (and if) it loads.
- **Detail textures** (needles, fronds, leaves, petals, koi skins, lily pads, mist, shafts) are
  always generated on canvas.
- **Fonts:** `@fontsource` packages, bundled.
- **Audio:** synthesized; no files.

## Performance strategy
Instancing for all repeated meshes; merged static geometry for the cabin; one shadow-casting
light with a fitted orthographic frustum; grass and small plants don't cast shadows; the water
reflection renders at reduced resolution with small props hidden; far pines use a 2-card model;
DPR is capped per profile and adapted at runtime; scene chunk is code-split from the title screen.

## Testing strategy
- **Unit (Vitest):** `world/*` (pond SDF, terrain, surfaces, colliders, scatter exclusions),
  `koi/koiSim`, `camera/cinematic` timeline, `config/quality` detection, `state/store`.
- **Static:** `tsc --noEmit`, production build.
- **In-browser QA:** load, enter, each camera mode, collision walk-through script, audio state,
  mobile viewport with touch, FPS readout per quality profile; console must be clean.
