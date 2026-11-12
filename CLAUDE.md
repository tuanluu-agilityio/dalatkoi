# Dalat Serenity: guide for AI assistants

A single-page, real-time 3D place: a timber cabin, a koi pond and a pine forest in the Da Lat
highlands, in morning light or in rain. Visitors walk around it, take a guided tour, or orbit.
React 19, React Three Fiber, three.js r187, Zustand, TypeScript, Vite. Everything is procedural or
synthesized except nine CC0 texture sets.

Read `ARCHITECTURE.md` before changing structure and `README.md` for controls, quality levels and
known limitations. Past design decisions are in `TECHNICAL_DECISIONS.md` and
`docs/superpowers/specs/`.

## Commands

- Run: `npm run dev` (http://localhost:5173). If the port is taken, a dev server for this project
  is probably already running; check before starting another.
- Test: `npm test` (Vitest, pure logic only). Type-check: `npm run typecheck`.
- Build: `npm run build` (type-check, then `dist/`). `dist/` is not committed.
- Deploy: `npm run build`, then `npx netlify-cli deploy --prod --dir=dist --no-build`
  (site `dalatkoi`, https://dalatkoi.netlify.app). Deploy only when asked.
- Repository: https://github.com/tuanluu-agilityio/dalatkoi (public). Commit, push and merge only
  when asked. Work on a branch, not on `main`.

## What the owner has decided

- This is one continuous place. New features are added to the existing scene; do not build a
  second scene, duplicate the environment, or rebuild what works.
- The morning experience is the reference. A feature that can be switched off (rain is the
  example) must leave the morning looking and behaving exactly as before.
- No new runtime dependencies without a clear need. No sampled audio: all sound is synthesized.
- The interface is in English, uses the existing line icons (no emoji), and fades when idle.
- Open design and engineering questions: decide, write the decision down, report it afterwards.
  Anything hard to undo or outward-facing (deploy, pushing, repository settings) needs an explicit
  request.

## Code rules

- `src/world/` and `src/weather/` are pure TypeScript: no three.js, no DOM. They are the single
  source of truth for where things are and are unit-tested. Rendering, collision, audio and the
  fish all read from them. Change pure logic test-first.
- Scene and UI never import each other. They talk through the store (`state/store.ts`), the event
  bus (`state/events.ts`) and the per-frame object `state/runtime.ts`.
- Per-frame state stays out of React: animate in `useFrame` on refs and shader uniforms. Do not
  allocate in `useFrame`.
- Units are metres, +Y up, the entrance looks toward −Z. Layout constants live in
  `world/layout.ts`; the cabin has its own frame (`cabinToWorld` / `worldToCabin`).
- Anything repeated is instanced; static geometry is merged (`cabin/builder.ts`). Budgets come
  from the quality profile in `config/quality.ts`, never from literals in a component.
- Random placement uses `createRng(seed)` so the place is the same on every load.
- Materials are extended by chaining `onBeforeCompile` (`applyWind`, `applyWetness`), together
  with `customProgramCacheKey`. Use `patch()` from `scene/shaders/noise.ts` so a changed three.js
  chunk warns instead of failing silently.

## Easy to get wrong

- **The Canvas is keyed by quality level.** Changing quality rebuilds the whole scene. State that
  must survive (walker position, tour clock, weather, rain motion) lives at module level, not in
  components. Materials cached at module level (`getCabinMaterials`, `rockMaterial`) also survive.
- **Shared uniforms are shared by reference** (`windUniforms`, `weatherUniforms`). The water is
  the exception: `Reflector` clones its uniforms, so `Water.tsx` copies values in every frame.
- **`HAZE_COLOR` is live.** The weather controller moves it between `HAZE_MORNING` and
  `HAZE_RAIN`; fog, background, mist and sky read it. Bake static colours from `HAZE_MORNING`.
- **The environment map is captured once** from a clear sky (`frames={1}`); weather only changes
  its intensity. A `SkyDome` used for lighting must pass `weather={false}`.
- **Render layer 1** (grass, flowers, mist, rain, splashes) is skipped by the pond's reflection
  pass. Small, numerous or transparent things belong there.
- **Weather effects are blends that are the identity at 0.** Keep it that way: no branch that
  swaps materials or meshes when the weather changes.
- **Rain motion wraps exactly.** Drops fall at multiples of 1/8 of the base speed and the far
  population uses a box 3× wider and 1.5× taller, so offsets wrap at `BOX × 24`. Changing either
  ratio without the wrap constant makes the rain jump.
- **Roof geometry is described once** in `cabin/Roof.tsx` (`ROOF_SLOPES`, `EAVES`); the rain
  cut-out, the drips and the audio sources read it. `world/shelter.ts` mirrors the veranda
  overhang for the pure side.
- **Audio does nothing before `start()`**, which runs inside the Enter click. Every engine method
  must stay a safe no-op before that and when Web Audio is missing. One-shots are capped (18, and
  8 more for rain); a new voice must go through `claim` or `rainDrop`.
- **The HUD ignores the first click when idle**: it only wakes the interface. `R`, `1`–`3` and the
  other keys work at any time while exploring.
- **Collision is top-down shapes** in `world/colliders.ts`. A new solid object needs a collider
  there, and the tour path tests will fail if it blocks a shot.

## Checking by eye

The scene has no automated visual tests. After a visual change, open the page and look at it:

- In development, `window.__dalat` is `{ store, runtime }`. `store.getState().finishIntro()` skips
  the intro; `setWeather('rain')`, `setRainIntensity('heavy')`, `setCameraMode('orbit')` and
  `setQuality('low', false)` drive the rest.
- `runtime.debugPose = [x, y, z, lookX, lookY, lookZ]` pins the camera; set it to `null` to
  release it. Useful views: the entrance (default), the pond `[-2.5, 1.5, 9.6, -2.5, -0.2, 4.5]`,
  the veranda `[6.9, 2.25, -4.6, -1, 0.6, 5]`.
- `?off=post,atmo,veg,koi,pond,cabin,rain` disables systems for bisecting.
- Check the console for shader warnings (`[shader] patch point not found`), check morning and
  rain, and check that switching back to morning returns `runtime.rain` and `runtime.wet` to 0.
- Measure frame rate over several seconds with the tab visible; `P` shows a live readout. A
  hidden or occluded window is throttled and tells you nothing.

## Not yet verified

Sound has never been listened to during development (only run against a fake audio context), and
nothing has been run on a physical phone. Say so rather than claiming either works. See "Known
limitations" in `README.md` for the rest.

## Assets

Textures in `public/textures/` are Poly Haven, CC0; `ASSET_MANIFEST.md` lists each one. Record
any new downloaded asset there with its source and licence.
