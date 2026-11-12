# Guide for AI assistants

The full guide is [CLAUDE.md](CLAUDE.md): commands, the owner's decisions, code rules, the places
that are easy to get wrong, and how to check a change by eye. Read it before editing code.

In short:

- Run `npm run dev`, test with `npm test`, type-check with `npm run typecheck`, build with
  `npm run build`.
- `src/world/` and `src/weather/` are pure and unit-tested; scene and UI talk only through the
  store, the event bus and `state/runtime.ts`.
- Add features to the existing scene. The morning must stay unchanged when a feature is off.
- No new runtime dependencies without a clear need; sound is synthesized, not sampled.
- Changing quality rebuilds the Canvas, so lasting state lives at module level.
- Commit, push, merge and deploy only when explicitly asked.
