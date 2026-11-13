# Technical Decisions

Each entry: the options weighed, the choice, and why.

### TD-01 · Stack
React 19 + TypeScript + Vite + three.js + React Three Fiber + drei + postprocessing + Zustand —
the brief's preferred stack. Nothing argued for deviating: R3F gives component boundaries that
match the required module separation, and the frame loop stays imperative where it matters.

### TD-02 · Asset workflow: procedural geometry + CC0 textures, no authored models
*Considered:* Blender-authored GLB scene; third-party GLB asset packs; AI-generated meshes;
procedural geometry.
*Chosen:* procedural geometry in code, real-world CC0 PBR textures (Poly Haven) on the large
surfaces, canvas-generated detail textures for foliage and fish.
*Why:* there is no artist-in-the-loop here to author or vet meshes; asset packs bring licence
and weight risk; AI meshes have poor topology and unverifiable provenance. Procedural geometry
is licence-clean, tiny on the wire (the whole world ships as code), deterministic, and lets
layout, collision and audio share one definition of the world. Photographic PBR textures recover
most of the realism that hand-built geometry lacks.
*Cost:* organic shapes (trees, plants) are stylistically simpler than photogrammetry.

### TD-03 · Procedural fallback for every texture
Materials are created with generated canvas textures and upgraded when files arrive. A failed or
missing file is therefore invisible to the user apart from less detailed surfaces, and the scene
is usable before the network finishes.

### TD-04 · Water: custom shader on three's `Reflector`
*Considered:* drei `MeshReflectorMaterial` (opaque, no transmission); three `Water` (ocean look,
no see-through); screen-space reflections (expensive, artefacts at grazing angles); custom.
*Chosen:* `Reflector` (true planar reflection with oblique clipping) with a custom fragment
shader: fresnel mix between the reflection and a depth-tinted transparent body, procedural
ripple normals, fish ring ripples from a uniform array, sun glint. Fish and bed are real
geometry seen through the surface. On Low the reflection pass is skipped and the sky colour is
used instead.

### TD-05 · Koi: simulated, not path-animated
A small steering simulation (wander + boundary avoidance + separation + visitor attraction) in
plain TypeScript, unit-tested, drives position/heading; a vertex shader bends the body. Paths
never repeat, and fish can react to the visitor.

### TD-06 · Collision: analytic 2D instead of a physics engine
The walker only needs to slide along static obstacles on near-flat ground. Circles + oriented
boxes + the pond SDF cost microseconds and ~150 lines; Rapier would add ~1 MB of WASM for no
visible benefit.

### TD-07 · Audio: fully synthesized
*Considered:* CC0 field recordings (best realism, several MB, per-file provenance checks);
synthesis.
*Chosen:* Web Audio synthesis for every sound. Zero licensing exposure, zero download weight,
and the soundscape never loops audibly because events are scheduled stochastically.
*Cost:* birdsong and water are convincing but recognisably synthetic on close listening.

### TD-08 · Lighting: one shadowed sun + generated environment map
The sky dome is rendered once into a PMREM cube for image-based lighting, so ambient light and
reflections match the visible sky without shipping an HDRI. One 4096² directional shadow map
covers the clearing; lanterns and windows are unshadowed point lights.

### TD-09 · Light shafts and mist as geometry, not screen-space
Additive shaft quads aligned to the sun and soft noise sheets for mist are cheap, stable under
camera motion, and work on every profile; a screen-space god-ray pass needs the sun on screen and
costs a full-screen blur.

### TD-10 · Camera: one rig, three controllers, pose blending
A single component owns the camera so modes cannot fight; blending poses on every switch is what
makes "no sudden jumps" hold everywhere. Shot-to-shot changes in the cinematic use a dip-to-dark
dissolve rather than flying through trees.

### TD-11 · Walk-mode look without mandatory pointer lock
Pointer lock is used when available, but click-drag look also works. This keeps the mode usable
on touch-screen laptops, in embedded frames, and when the browser refuses the lock.

### TD-12 · Terrain as one warped grid
A single plane whose vertices are remapped so spacing is ~0.22 m in the clearing and several
metres at the horizon: the pond bowl and paths get real resolution with no seams between LOD
tiles.

### TD-13 · Execution method
The plan was executed inline in one session rather than by per-task subagents: the modules share
one world layout and one visual language, and visual tuning needs a single eye across all of them.

### TD-14 · Ambient occlusion at full resolution
N8AO's half-resolution mode builds a multiple-render-target class that three.js 0.187 no longer
accepts; it threw on every frame. The effect now runs on its full-resolution path with the
"performance" preset, on the High profile only.
*Cost:* AO is more expensive than planned, which is one reason integrated GPUs start on Medium.

### TD-15 · Dip to dark for distant camera changes
TD-10 planned to blend poses on every mode switch. In practice the tour's shots are tens of
metres from the walker, and a 1.8 s straight-line blend flies through trunks and the cabin. Walk ↔
Orbit still blends; anything to or from the tour dips to dark for 1.1 s.

### TD-16 · Adaptive quality lowers, but never raises, the profile
Changing profile rebuilds the scene (the Canvas is keyed by level), which costs a second or two.
Raising it automatically would oscillate on a borderline device, so the monitor only gives back
render resolution; moving up a level is the visitor's choice in the Graphics panel.

### TD-17 · Intel Arc: integrated by default
"Intel Arc" names both discrete cards (A- and B-series, with a model number) and the integrated
graphics in recent laptop chips (no model number). Only the former are treated as discrete.

### TD-18 · Collision by linear scan
The architecture first called for a uniform grid. With a few hundred shapes and one walker the
scan costs microseconds, so the grid was not built.

### TD-19 · Shaders are compiled before the first frame
Drawn cold, the first frame compiled and linked about seventy programs one after another: a
single task of some ten seconds in which the page could not repaint. `Warmup` in `Experience.tsx`
calls `compileAsync` on mount and the Canvas stays on `frameloop="never"` until it resolves (or
25 s pass), so the title screen stays alive while the driver works. Two details make the
precompiled programs the ones actually used: the warm-up compiles against a half-float target
when post-processing is on, and the Canvas asks for `shadows="percentage"` because three.js
swaps r3f's default soft type at the first shadow render, which is after the warm-up.
*Cost:* the frame loop of every scene build (including a quality change) starts a little later.

### TD-20 · Textures are decoded off the main thread
An `<img>` handed to WebGL is decoded synchronously at upload; for 27 files that froze the page
for more than a second. Files are now fetched and decoded with `createImageBitmap` (flipped
there, since flip-on-upload does not apply to bitmaps), with the image element as the fallback.

### TD-21 · The pond's reflection is drawn from `useFrame`, not from inside the main render
`Reflector` renders its mirror image in `onBeforeRender`, a nested render. three.js keeps a
separate light state for nested renders, so every lit material saw the lights "change" twice a
frame and had its program looked up again: about a quarter of the main-thread frame. `Water.tsx`
takes the hook off the mesh and calls it before the main render, and skips it while the pond is
outside the view frustum.
*Cost:* the reflection uses the previous frame's shadow map, and waits two frames for one to exist.

### TD-22 · Adaptive quality probes between 26 and 45 fps
Under 26 fps resolution is still taken at once. Between 26 and 45 the cause is unknown: a GPU
short of fill rate, or a display, power mode or browser capped at 30. So a 0.2 lower resolution
is tried for one window and kept only if the frame rate rises by 8%; otherwise it is put back and
the next try waits twice as long (4 windows, doubling to 64). Giving resolution back starts the
same wait, so a borderline device does not bounce. This replaces the fixed rule "act below 30".

### TD-23 · Audio: buffered output, fewer scheduled events, no panner per raindrop
The sound broke up whenever rendering was heavy. Four changes, all in `audio/`:
- The context asks for 40 ms of output buffering instead of `'interactive'` (10 ms buffers that
  underran on a busy frame). An ambient scene does not need instrument latency.
- The listener is set by value once per frame and only when it moved. Scheduling it made every
  panner recompute its position per sample.
- Continuous layers are steered ten times a second, and a parameter is only scheduled when its
  target has changed (`steered` in `synth/beds.ts`).
- A raindrop (about 25 a second) no longer gets a `PannerNode`. Its pan and distance gain are
  computed once in `audio/spatial.ts` with the panner's own law, and it plays through the nearest
  of nine fixed stereo lanes. Finished voices are disconnected at once instead of waiting for
  garbage collection.
If the browser stops the context on its own, the engine asks to resume at most three times, and
any click or key press afterwards counts as the gesture (`nudge`).
*Cost:* a raindrop's direction is quantised to 12° and does not follow the head during its tenth
of a second. Like the rest of the sound, this has not been listened to.

### TD-24 · Path distance through bounding boxes
The ground mask and the grass ask for the distance to the paths about a million times while the
scene is built. Each path is cut into runs of six segments with a bounding box; a run further
away than the best distance so far is skipped. A test compares the result with the brute-force
definition over the whole clearing.
