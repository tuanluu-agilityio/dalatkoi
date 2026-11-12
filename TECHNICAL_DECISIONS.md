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
