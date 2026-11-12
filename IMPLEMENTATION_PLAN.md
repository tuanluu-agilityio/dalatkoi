# DALAT SERENITY Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-page, explorable, photoreal-leaning 3D Da Lat retreat with walk /
cinematic / orbit cameras, a simulated koi pond, wind-animated vegetation, morning atmosphere,
and a synthesized spatial soundscape.

**Architecture:** A pure-TypeScript world model (`src/world`) is the single source of truth for
layout, height, surfaces and colliders. React Three Fiber components render it; one `CameraRig`
owns the camera; a plain `AudioEngine` class synthesizes all sound. UI and scene talk only through
a Zustand store and a small event bus.

**Tech Stack:** React 19, TypeScript, Vite, three.js, @react-three/fiber, @react-three/drei,
@react-three/postprocessing, Zustand, Vitest, @fontsource fonts.

**Spec:** `PROJECT_SPEC.md` (with `ARCHITECTURE.md` and `TECHNICAL_DECISIONS.md`).

## Global Constraints
- One HTML entry; no router; no additional pages.
- Wordmark `DALAT SERENITY`; tagline `Somewhere between the forest and the silence.`; button `ENTER EXPERIENCE`.
- No audio node may start before the Enter click.
- Every asset is CC0/OFL or generated in this repo; each is listed in `ASSET_MANIFEST.md`.
- Every file-based texture has a procedural fallback.
- World units are metres. +X right, +Y up, −Z away from the entrance. Water level y = −0.18.
- Eye height 1.65 m; walk 1.5 m/s; brisk 2.9 m/s; walker radius 0.32 m; deck height 0.6 m.
- Quality profiles are exactly `high | medium | low`.
- Scene modules never import from `src/ui`, and vice-versa.

## Review Focus
1. **Texture files missing or blocked** → scene must still render fully with procedural textures. (Task 3 test: manager resolves fallback on load error.)
2. **Browser refuses pointer lock / user is on a touch laptop** → walk mode still lets them look (drag). (Task 9 QA step.)
3. **Tab hidden then shown / very long frame** → no teleport through walls, fish don't explode. (Tasks 2 & 6 tests: `dt` clamped; resolve is stable for a 1 s step.)
4. **Walker spawned or blended into a blocked position** (e.g. leaving orbit above the pond) → walk mode starts from the nearest free point. (Task 2 test: `nearestFree`.)
5. **AudioContext suspended or unavailable** → UI still works, mute toggle doesn't throw. (Task 10 test: engine methods are no-ops before `start()`.)

---

### Task 1: Scaffold, store, quality profiles
**Files:** `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/state/store.ts`, `src/state/events.ts`, `src/config/quality.ts`; tests beside sources as `*.test.ts`.
**Produces:** `useStore`; `events.on/emit`; `QualityLevel`, `QUALITY: Record<QualityLevel, QualityProfile>`, `detectQuality(signals) → QualityLevel`.
- [ ] Test `detectQuality`: touch + ≤4 GB → `low`; touch + strong → `medium`; desktop with integrated GPU string → `medium`; desktop dGPU → `high`; software renderer → `low`.
- [ ] Test store: `setVolume` clamps to 0..1; `setCameraMode` ignored while `phase !== 'explore'` except by `enter()`.
- [ ] Implement; `npm test`, `npx tsc --noEmit` pass. Commit.

### Task 2: World model
**Files:** `src/world/{rng,noise,layout,pond,terrain,paths,surfaces,colliders,scatter,pois}.ts` + tests.
**Produces:** `pondSDF(x,z)` (negative inside, metres), `pondOutline(n)`, `pondDepth(x,z)`; `groundHeight(x,z)`; `walkHeight(x,z)`; `surfaceAt(x,z) → 'grass'|'gravel'|'stone'|'bridge'|'veranda'`; `resolve(x,z,r) → {x,z}`; `nearestFree(x,z,r)`; `SCATTER` (typed placement arrays); `POIS`.
- [ ] Tests: pond centre is inside and ≥0.8 m deep; a point 3 m outside the outline is outside; bridge midpoint is walkable and `surfaceAt` = `bridge`; pond centre resolves out of water; a point inside the cabin footprint resolves outside it; deck centre `walkHeight` = 0.6 and surface `veranda`; no pine, fern or bush placement lies in the pond, on a path, or in the cabin; resolve with a 3 m jump across a wall does not tunnel when stepped by the walker's sub-stepping helper `moveWalker`.
- [ ] Implement; tests pass. Commit.

### Task 3: Texture manager and procedural generators
**Files:** `src/assets/textureManager.ts`, `src/assets/procedural/*.ts`, `scripts/fetch-textures.mjs`, `public/textures/*`.
**Produces:** `getPBR(name, repeat) → {map, normalMap, roughnessMap}` (returns immediately, upgrades in place); generators for needles, fronds, leaves, petals, koi skins, lily pad, soft sprite, noise.
- [ ] Test (jsdom-free): `resolveSource` picks fallback when loader rejects.
- [ ] Run fetch script; record files and licences in `ASSET_MANIFEST.md`. Commit.

### Task 4: Canvas, lighting, sky, terrain, mountains
**Files:** `src/scene/Experience.tsx`, `lighting/*`, `environment/{Terrain,Mountains}.tsx`.
- [ ] Browser check: lit terrain with pond bowl and path bands visible, sky and ridges, no console errors. Commit.

### Task 5: Cabin
**Files:** `src/scene/cabin/*`.
- [ ] Browser check from the entrance view: stone plinth, plank walls, tiled roof, lit windows, veranda with furniture. Commit.

### Task 6: Pond, water, bridge, koi
**Files:** `src/scene/pond/*`, `src/scene/koi/*`.
**Produces:** `KoiSim` class: `step(dt, visitor?)`, `fish[]` with `{x,y,z,heading,speed,phase}`; emits `fishSurface {x,z}`.
- [ ] Tests for `koiSim`: after 120 s of 1/60 steps every fish is inside the pond (`pondSDF < 0`) and below the surface; speeds stay within each fish's limits; a 1 s `dt` is clamped; with a visitor at the bank the mean distance to the visitor decreases over 20 s.
- [ ] Browser check: reflections, ripples, fish visible and swimming. Commit.

### Task 7: Vegetation
**Files:** `src/scene/vegetation/*`.
- [ ] Browser check: pines ring the clearing, grass/ferns/hydrangeas/bushes/flowers present and swaying, frame time acceptable. Commit.

### Task 8: Atmosphere and post-processing
**Files:** `environment/{Mist,SunShafts,Motes,Birds}.tsx`, `effects/PostFX.tsx`.
- [ ] Browser check: mist depth, shafts, motes, AO/bloom/tone mapping. Commit.

### Task 9: Cameras
**Files:** `src/scene/camera/*`.
**Produces:** `SHOTS`, `sampleCinematic(t) → {pos, look, fov, fade, shot}`.
- [ ] Tests: `sampleCinematic` is continuous inside a shot (pose delta for 1/60 s < 0.2 m), `fade` reaches 1 at shot boundaries, total loop length equals sum of durations, no shot position is below `groundHeight + 0.3`.
- [ ] Browser check: all three modes, blends, walk collision against cabin/pond/tree, bridge crossing, veranda steps; drag-look without pointer lock. Commit.

### Task 10: Audio
**Files:** `src/audio/*`.
- [ ] Test: `AudioEngine` setters before `start()` do not throw; volume mapping is monotonic.
- [ ] Browser check: context `running` only after Enter; buses respond; footsteps change with surface. Commit.

### Task 11: UI
**Files:** `src/ui/*`.
- [ ] Browser check: title → enter flow, HUD auto-fade, mixer, quality, fullscreen, hints and notes, joystick at a phone viewport. Commit.

### Task 12: Performance management and quality pass
**Files:** `src/scene/perf/PerformanceManager.tsx`; budget wiring in all systems.
- [ ] Browser check: FPS and draw calls per profile recorded in README. Commit.

### Task 13: Visual polish, full QA, documentation
- [ ] Screenshot review of every cinematic shot; fix what looks wrong.
- [ ] Run the acceptance checklist; write `README.md`, finish `ASSET_MANIFEST.md`.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run build` all pass. Commit.
