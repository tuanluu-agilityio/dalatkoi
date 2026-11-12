# DALAT SERENITY — Product Specification

> "Somewhere between the forest and the silence."

Date: 2026-11-12 · Status: implemented (see README for the completion report)

## 1. Product vision

A single-page, explorable 3D recreation of a wooden mountain retreat in the pine forest of Da Lat,
Vietnam, on a quiet early morning. There is no content site around it: the world is the interface.
A visitor should feel they have *arrived somewhere*, not opened a web page.

**Reference note.** The brief describes a reference image that was not present in the project
folder at build time. The scene was built from the brief's written description of that image
(sections 2–3 of the brief). Composition rules taken from it are listed in §4 and are treated as
binding.

### Goals
- A real-time 3D world (not a photo, video, or backdrop) with a cabin, koi pond, bridge, garden,
  pine forest, mist, and distant mountains.
- Three ways to look at it: walking, a guided cinematic sequence, and orbit inspection.
- A layered, spatial soundscape that reacts to where the visitor is and what they walk on.
- Runs at 60 FPS on capable desktops, degrades gracefully, and stays explorable on phones.

### Non-goals
- No routes, pages, navigation bars, marketing sections, booking flows.
- No game mechanics: no quests, scores, inventory, or combat.
- The cabin interior is not enterable (it is lit and visible through the windows).

### Anti-goals (would make it a failure even if it "works")
- Low-poly / cartoon look; saturated toy colours; a flat blue plane for water.
- UI that sits on top of the scene permanently.
- Audio that starts without a user gesture, or any audio asset of unclear licence.

## 2. User journey

1. **Arrival.** A dark, quiet title screen: `DALAT SERENITY`, the tagline, a thin progress line.
   The 3D scene loads behind it.
2. **Threshold.** When ready, `ENTER EXPERIENCE` appears with a sound on/off choice (default on;
   audio only ever starts from this click).
3. **Reveal.** The screen fades into a ~20 s cinematic intro: high over the forest, descending
   toward the cabin, ending low across the pond. Any key/click/tap skips it.
4. **Exploration.** The camera glides down to eye height on the entrance path and hands over to
   walking mode. The HUD appears briefly, then fades.
5. **Lingering.** The visitor walks the gravel loop, crosses the bridge, stands on the veranda,
   watches koi gather near the bank, reads short notes on points of interest, or switches to the
   cinematic or orbit camera at any time.

## 3. Core features

### 3.1 Camera
| Mode | Behaviour |
|---|---|
| **Walk** (first person) | WASD / arrows move, Shift jogs, mouse looks (pointer lock on click, or click-drag without lock), wheel adjusts field of view (30–70°). Touch: left-thumb joystick moves, drag elsewhere looks. Eye height 1.65 m, walk 1.9 m/s, jog 3.4 m/s, exponential acceleration/deceleration, subtle head bob tied to stride (off when the system asks for reduced motion). ESC leaves pointer lock and closes any open panel or note. |
| **Cinematic** | Seven looping shots (arrival up the path → low across the water → koi close-up → the footbridge → the veranda → looking up into the pines → wide over the clearing). Each is a slow straight dolly with its own lens and focus distance; shots dissolve through a short dip-to-dark so there are no hard cuts. The first two shots are the opening sequence. Depth of field is active in this mode on High quality. |
| **Orbit** | Drag to rotate, wheel/pinch to zoom, slow auto-rotation when left alone. Distance 9–28 m, elevation limited so the camera never goes under ground or into the tree line. |

Walk ↔ Orbit blends the camera from its current pose over 1.8 s; changes to or from the tour dip to dark (1.1 s) instead of flying through the trees.

**Collision (walk mode).** The visitor cannot pass through cabin walls, veranda railings, posts,
furniture, tree trunks, boulders, pond-edge rocks, or bridge railings; cannot enter the water
(the bridge is the only crossing); and cannot leave the clearing (soft boundary 31 m from centre).
Height follows the terrain, the veranda steps and deck (0.6 m), and the bridge arch.

### 3.2 Scene composition (binding)
1. Cabin middle-right, turned slightly toward the pond.
2. Koi pond is the foreground subject.
3. Wooden arched bridge on the right side of the pond.
4. Gravel-and-flagstone paths encircle the water and connect entrance → bridge → veranda steps.
5. Hydrangeas, ferns, bushes, flowers and broad-leaf plants frame the pond and cabin.
6. Tall Da Lat pines (bare lower trunk, high crown) ring the clearing.
7. Layered, mist-separated ridges close the horizon.
8. Low warm sun from the front-left lights the cabin face and throws long shadows across the lawn.

### 3.3 Cabin
Stone plinth and chimney; weathered plank walls; clay-tile gable roof built from individual
instanced tiles with ridge caps; framed, mullioned windows with reflective glass and a warm lit
interior; plank door; veranda with individually laid boards, posts, railings, steps, two chairs,
a side table, potted plants, two hanging lanterns and a wind chime. Small irregularities
(board gaps, tile jitter, tint variation) are deliberate.

### 3.4 Koi pond
- Organic outline, depth to ~1.1 m, pebble/silt bed visible through the water.
- Water: planar reflection of the real scene, fresnel blend, two-octave animated ripple normals,
  depth-tinted transmission, shoreline softening, sun glint, and expanding ring ripples spawned
  by fish (up to 8 concurrent).
- Edge rocks with moss, lily pads with a few blossoms, reeds/irises, a bamboo water spout.
- **Koi (14 on High):** five colour varieties with generated patterns, 0.45–0.8 m, body-wave swim
  animation scaled by speed, steering simulation (wander, wall avoidance, separation, depth
  changes), individual speeds, occasional surfacing that spawns a ring ripple and a soft plop.
  When a visitor stands at the bank, nearby koi drift toward them, as real koi do.

### 3.5 Vegetation
Pines (3 shapes, instanced, varied scale/rotation), small broad-leaf trees incl. a red maple,
ferns, hydrangea shrubs (blue / violet / pink), bushes, broad-leaf tropical plants, scattered
small flowers, and tens of thousands of grass blades. Everything sways in a shared wind field.

### 3.6 Atmosphere
Gradient sky with sun glow, exponential height-aware fog, drifting mist sheets between the trees,
light shafts through the canopy, floating pollen motes in the sun, soft shadows, ambient occlusion,
gentle bloom on lantern and window light, filmic tone mapping, vignette, occasional distant birds.

### 3.7 Environmental interactions
Koi approach visitors · fish ripples · wind in all plants · contextual hints near six points of
interest, each revealing a two-sentence note on `E` / tap · surface-aware footsteps · veranda
board creaks · wind chime.

### 3.8 Audio
All sound is synthesized at runtime with the Web Audio API (original; nothing recorded).

| Bus | Content |
|---|---|
| Ambient | Pine wind (gusting filtered noise), leaf rustle, distant forest bed, far bird calls with reverb |
| Environment | Positional birds (5 synthesized song types at changing positions in the trees), pond trickle and bubbles at the spout and rocks, koi plops at the fish position, cabin creaks, wind chime |
| Footsteps | Grass, gravel, stone, bridge wood, veranda wood; level follows walking speed |

Master / ambient / environment / footstep volumes, mute, 60 ms–1.5 s smoothed transitions,
HRTF panners with inverse distance roll-off. Nothing plays before the Enter click.

### 3.9 UI
- Title screen: wordmark, tagline, progress line, `ENTER EXPERIENCE`, sound toggle.
- HUD (fades after 4 s without pointer/keyboard activity, returns on activity): mode switcher
  (Walk · Cinematic · Orbit), sound toggle + master volume (expandable mixer), quality,
  fullscreen, one line of movement instructions for the active mode.
- Contextual hint near points of interest; a short note card on demand.
- Typography: Cormorant Garamond (display) and Jost (UI), self-hosted. Palette: bark brown,
  moss, mist white, warm amber.

## 4. Technical requirements
- React 19 · TypeScript · Vite · three.js · React Three Fiber · drei · postprocessing · Zustand.
- One HTML entry, no router.
- Scene code lazy-loaded so the title screen paints immediately.
- Every external texture has a procedural fallback; the experience works fully offline from
  `dist/` even if every texture file is missing.

## 5. Performance requirements
| Profile | Target | Summary |
|---|---|---|
| High | 60 FPS desktop dGPU | DPR ≤ 1.75, 4096 shadows, 1024 reflection, AO + bloom + DoF, full vegetation |
| Medium | 60 FPS laptop iGPU / good tablet | DPR ≤ 1.25, 2048 shadows, 512 reflection, bloom only, ~45–65% vegetation |
| Low | 30+ FPS phones | DPR 1, 1024 shadows, sky-only reflection, no post chain, ~15–35% vegetation |

Auto-selected from device signals; a runtime monitor lowers resolution, then the profile, if the
frame rate stays low. Repeated vegetation is instanced; distant pines use a cheaper model.

## 6. Acceptance criteria
The checklist in §13 of the brief, verified in the "Verification" section of `README.md`.
