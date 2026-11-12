# Architecture

## Principles
1. **One source of truth for the world.** `src/world/` is pure TypeScript (no rendering, no DOM).
   It defines where everything is: pond outline, terrain height, paths, cabin footprint, bridge,
   plant placements, colliders, walkable surfaces, points of interest. Rendering, collision, audio
   and the fish simulation all read from it, so what you see is what you bump into and hear.
2. **Scene and UI never import each other.** They communicate only through the Zustand store
   (`src/state/store.ts`), a small event bus (`src/state/events.ts`) for one-shot events
   (footstep, fish surfaced, ripple, skip intro, interact), and `src/state/runtime.ts`, a plain
   object of per-frame values (camera position, fade, gust, frame rate, joystick vector).
3. **Per-frame state stays out of React.** Animation runs in `useFrame` on refs and shader
   uniforms; the store holds only what the UI needs to render.
4. **Everything degrades.** Each visual system takes its budget from the active quality profile,
   every texture has a generated stand-in, and audio and WebGL each have a silent/static fallback.

## Folder structure
```
src/
  main.tsx  App.tsx          entry; chooses starting quality; error boundary and fallbacks
  state/     store.ts  events.ts  runtime.ts
  config/    quality.ts (profiles, device detection)  adapt.ts (runtime scaling rule)  device.ts
  world/     rng noise layout pond terrain paths surfaces groundCover scatter colliders pois
                                                              ← pure, unit-tested
  assets/    textureManager.ts  loadOrFallback.ts  procedural/{canvas,pbrFallbacks,
             cabinTextures,koiTextures,plantTextures}.ts
  scene/
    Experience.tsx           Canvas, composition, ready signal, dev switches
    lighting/    Lighting.tsx  SkyDome.tsx
    environment/ Terrain.tsx  Mountains.tsx  Atmosphere.tsx (mist, sun shafts, motes, birds)
    cabin/       Cabin.tsx  Roof.tsx  body.ts  veranda.ts  builder.ts  materials.ts
    pond/        Pond.tsx  Water.tsx  waterShader.ts  Stones.tsx  Bridge.tsx  PondPlants.tsx  Spout.tsx
    koi/         KoiSchool.tsx  koiSim.ts  koiGeometry.ts
    vegetation/  Vegetation.tsx  Pines  Grass  Undergrowth  Hydrangeas  Flowers  SmallTrees
                 foliage.ts  wind.ts
    camera/      CameraRig.tsx (rig, input, PoiWatcher)  walk.ts  cinematic.ts
    effects/     PostFX.tsx
    systems/     AudioSync.tsx  PerformanceManager.tsx
    shared/      Instances.tsx  cards.ts  rocks.ts        shaders/noise.ts
  audio/     AudioEngine.ts  synth/{noise,beds,voices}.ts  fakeContext.ts (test double)
  ui/        TitleScreen  Hud  Joystick  FadeOverlay  Fallback  icons  styles/{global,ui}.css
scripts/     fetch-textures.mjs (downloads and converts the CC0 textures)
public/textures/  27 WebP files
```

## Scene graph
```
<Canvas key={quality}>
 ├─ WindClock                 shared time + gust signal (visuals and audio)
 ├─ CameraRig                 the only writer of the camera
 ├─ Lighting                  sun with one shadow map, hemisphere fill, environment from the sky
 ├─ SkyDome · Terrain · Mountains
 ├─ Cabin ─ merged body and veranda, instanced roof tiles, lanterns, wind chime
 ├─ Pond  ─ Water · rocks · flagstones · lilies · reeds · spout · bridge
 ├─ KoiSchool
 ├─ Vegetation ─ Pines · SmallTrees · Grass · Undergrowth · Hydrangeas · Flowers
 ├─ Atmosphere ─ Mist · SunShafts · Motes · Birds
 ├─ PostFX                    N8AO → depth of field → bloom → tone mapping → vignette → SMAA
 └─ PoiWatcher · AudioSync · PerformanceManager · ReadySignal
```
The Canvas is keyed by quality level, so changing profile rebuilds the scene with new budgets.
The walker's position, the tour clock and the orbit framing live at module level and survive the
rebuild. A `ContextGuard` reports a genuinely lost graphics context to the app; it detaches before
a rebuild, because r3f releases the old context on purpose.

## Camera
`CameraRig` computes a target pose each frame for the current view and applies it.

- **walk** (`walk.ts`, pure): velocity integration with exponential acceleration, collision via
  `world/colliders.moveWalker`, height via `world/terrain.walkHeight`, a stride counter that
  returns the surface under each footfall. The rig turns that into `footstep` events and head bob.
- **cinematic** (`cinematic.ts`, pure): seven shots, each a straight dolly with its own lens and
  focus; `sampleCinematic(t)` returns pose, fade and shot index. Tests assert that the path stays
  above ground and water and outside the cabin, trunks and boulders.
- **orbit**: spherical coordinates around a point between pond and cabin, clamped above ground.
- **title**: a held wide frame with a slight drift, behind the title screen.

Transitions: walk ↔ orbit blends position, rotation and lens over 1.8 s; anything involving the
tour dips to dark for 1.1 s, because those views are far apart and a straight blend would fly
through trees. Input (keyboard, mouse with or without pointer lock, wheel, touch drag, pinch) is
handled in the rig; the touch joystick is a DOM component that writes `runtime.joyX/joyY`.

## Collision
Top-down shapes: circles (trunks, boulders, posts, furniture) and oriented boxes (cabin body,
railings, chimney), scanned linearly; there are a few hundred and the walker tests them at most
four times per sub-step. The walker is a 0.32 m circle. The pond is an analytic signed-distance
test with the bridge corridor as the only exemption; the clearing has a circular outer limit.
Movement is sub-stepped (≤ 0.15 m) so a long frame cannot tunnel through a wall.

## Audio
```
beds (wind, spout) ─┐
one-shots ──────────┼→ [ambient | environment | footsteps] → master → limiter → output
                    └→ send → convolver (generated impulse) → environment
```
`AudioEngine` is a plain class with one instance. Nothing is created until `start()` runs inside
the Enter click; before that every method is a no-op, and if Web Audio is missing the visit is
silent. Positioned sources use HRTF `PannerNode`s with inverse roll-off. `AudioSync` (inside the
Canvas) passes the camera pose and gust strength each frame, forwards footstep and fish events,
applies volume and mute from the store, and suspends the context while the tab is hidden.
One-shot voices are capped (18) and footsteps are rate-limited.

## Weather
`weather/weather.ts` (pure) eases a small state toward the mode and intensity held in the store.
`scene/weather/WeatherController` steps it once per frame and publishes the result twice: to
`runtime` (`rain`, `rainLevel`, `wet`, `flash`, `shelter`, `indoors`) for audio and CPU systems, and
to `weatherUniforms` (`uRain`, `uRainLevel`, `uWet`, `uFlash`) for shaders. Every effect is a blend
that is the identity at 0, so the morning is unchanged, and nothing is rebuilt when the weather
changes. The controller also owns the fog, the live `HAZE_COLOR`, and the lightning schedule
(it emits a `thunder` event with the delay).

- **Rain** (`Rain.tsx`): one instanced draw call of streaks in a box that wraps around the camera;
  motion, wind slant and the cut-out under the cabin roofs are all in the vertex shader. Intensity
  sets the instance count. **Splashes** are a ring-buffer pool placed on the CPU with the world
  model; **Drips** (eaves, tree crowns) are static instances animated in the shader.
- **Wet surfaces** (`wetness.ts`): `applyWetness(material)` chains onto `onBeforeCompile`, like
  `applyWind`. The terrain and the pond add their own terms (puddles; raindrop rings via
  `GLSL_RAIN_RINGS`) inside their existing shaders.
- **Light**: `Lighting` blends the sun, hemisphere and environment intensity; `SkyDome` blends to
  an overcast deck. The environment map is captured once from a clear sky and only dimmed.
- **Audio**: a `rain` bus with a shelter low-pass; beds in `synth/beds.ts` (`createRain`), drops and
  thunder in `synth/voices.ts`. `world/shelter.ts` says how much roof is over the listener.
- Budgets: `rainDrops` and `rainSplashes` in the quality profile, times 0.6 on touch devices. The
  three rain meshes are not drawn at all on a dry morning.

## State
Store: `phase` (`loading | ready | intro | explore`), `sceneReady`, `loadProgress`, `cameraMode`,
`quality`, `autoQuality`, `dprScale`, `muted`, `volumes`, `hint`, `noteOpen`, `pointerLocked`,
`isTouch`, `weather`, `rainIntensity`, `thunder`, `lightning`. Components subscribe with selectors; frame code reads `useStore.getState()`.

## Assets
- **Geometry:** all procedural, built once at mount, merged or instanced.
- **Surface textures:** nine CC0 PBR sets from Poly Haven, converted to 1K WebP by
  `scripts/fetch-textures.mjs`. `textureManager` gives every material a generated canvas texture
  immediately and upgrades it in place when the file arrives; a missing file leaves the stand-in.
- **Detail textures** (needles, fronds, leaves, petals, koi skins, lily pads, roof clay, window
  interiors) are generated on canvas.
- **Fonts:** `@fontsource` packages, bundled. **Audio:** synthesized; no files.

## Performance
Instancing for everything repeated; merged static geometry for the cabin; one shadow-casting
light; grass, flowers and mist are excluded from the water reflection pass (render layer 1); far
pines use a lighter model and cast no shadows; pixel ratio is capped per profile.
`PerformanceManager` measures the frame rate in 2.5 s windows and, on Auto, applies
`config/adapt.ts`: lower resolution first (down to 0.6×), then step the profile down; resolution
is given back after three good windows; the profile is never raised automatically. The scene is
code-split from the title screen.

## Testing
- **Unit (Vitest, 95 tests):** world model, koi simulation, cinematic timeline, walk controller,
  audio engine against a fake context, quality detection, adaptation rule, store, texture fallback.
- **Static:** `tsc --noEmit`, production build.
- **In-browser:** load, enter, each camera mode, walking, notes, panels, phone-width layout.
- **Dev switches:** `?off=post,atmo,veg,koi,pond,cabin` disables systems (development builds only).
