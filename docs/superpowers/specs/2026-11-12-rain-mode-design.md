# Rain Mode — design

## Intent
A visitor walking the existing garden can turn the morning into a rainy Da Lat day and back,
without a reload and without losing their place. Morning must look and behave exactly as before.

## Non-goals
No second scene, no new dependencies, no change to camera, collision, koi simulation or the
morning look. No sampled audio (everything stays synthesized).

## State
- Store (`state/store.ts`): `weather` (`morning | rain`), `rainIntensity`
  (`drizzle | moderate | heavy`), `thunder`, `lightning`, and a new `rain` volume bus.
- `weather/weather.ts` (pure, unit-tested): transition stepping, lightning schedule, flash envelope.
- `world/shelter.ts` (pure, unit-tested): how much roof is over a point; whether it is indoors.
- Per-frame values in `state/runtime.ts`: `rain` (0..1 presence, eased over 4.5 s), `rainLevel`
  (0..1 smoothed intensity), `wet` (surface wetness, lags the rain), `flash`, `shelter`, `indoors`.
- Shared shader uniforms `scene/weather/uniforms.ts` (`uRain`, `uRainLevel`, `uWet`, `uFlash`),
  in the same style as `windUniforms`. Every effect is a blend that is the identity at 0.

## Scene (all inside the existing Canvas)
| Concern | Where | How |
|---|---|---|
| Controller | `scene/weather/WeatherController.tsx` | steps state, writes uniforms/runtime, fog and haze colour, lightning, shelter |
| Light | `lighting/Lighting.tsx`, `SkyDome.tsx` | sun fades to a weak cool key, hemisphere fill rises, overcast sky blend; lanterns and windows untouched |
| Rain | `scene/weather/Rain.tsx` | one instanced draw call of streaks, wrapped around the camera in the vertex shader; near and far populations; wind slant; culled under the cabin roofs |
| Splashes | `scene/weather/Splashes.tsx` | pooled instanced sprites spawned on ground, deck, bridge and water near the camera |
| Runoff | `scene/weather/Drips.tsx` | static instanced drops falling from the eaves and from tree crowns |
| Wet surfaces | `scene/weather/wetness.ts` | `applyWetness(material)` shader patch (darker, more saturated, glossier) on cabin, roof, bridge, rocks, paving, bark, foliage, grass; droplets on window glass |
| Ground | `environment/Terrain.tsx` | wet darkening and noise-masked puddles that grow with wetness |
| Pond | `pond/waterShader.ts` | procedural ring-ripple field added to the existing normal, more chop, dimmed sun glint |
| Air | `environment/Atmosphere.tsx`, `vegetation/wind.ts` | denser mist, no sun shafts or pollen, stronger gusts |

## Audio (existing `AudioEngine`)
New `rain` bus → low-pass "shelter" filter → master. Beds: rainfall, leaves, roof (positioned),
wood/bridge (positioned), pond (positioned), overhead roof drumming under the veranda.
One-shots on a separate voice budget: eave drips, pond drops, leaf drops. Thunder is its own
voice with a delay from the flash; thunder and lightning toggle independently. Birds thin out.

## UI
Weather switch (Morning / Rain) and, while raining, an intensity selector in the HUD; `R` toggles.
Sound panel gains a Rain slider and Thunder / Lightning toggles. Line icons, matching the HUD.

## Performance
Budgets per quality profile (`rainDrops`, `rainSplashes`), reduced further on touch devices.
No per-frame allocation; rain systems are invisible (not drawn) in the morning.

## Calls made without asking
Line icons instead of emoji; lightning defaults off when the OS asks for reduced motion;
the walker cannot enter the cabin, so "inside" muffling applies to cameras that end up there.
