# AGENTS.md

Guidance for AI coding agents (and humans) working in this repo. Read this before making changes — the project is **mid-pivot** and much of the existing code is on the chopping block.

## The pivot in one paragraph

This was **HexFarm**, a sprawling farming MMO. It is becoming **Wanderleaf**: a goal-free, tranquil exploration game where players wander an infinite hex world that grows and changes on its own. See `README.md` for the full vision. The engine stays; the gameplay is being stripped down and refocused.

## Locked decisions

These are settled. Build to them; don't relitigate without explicit sign-off.

- **Nudge verbs (the player's *entire* action set):** Scatter seeds · Coax growth · Part the grass · Draw creatures near. All additive, none destructive. `useInput.ts` reduces to movement + these four.
- **Communication:** emotes only (keep `/heart`, `/smile`, etc.). Remove text/global chat and all trade commands.
- **Journal:** cut permanently. Nothing is tracked or recorded — the world itself is the only memory. Delete `client/src/components/Journal.tsx`.
- **Weather:** regional/walkable from the start — storms roll across parts of the map; players can wander toward or away from them. Not a single global sky.
- **Presence-as-ecology (default tuning):** ~2–3 hex radius, moderate strength, decays over time; biases flora spread and gently draws fauna toward recent player paths.
- **Pacing:** tune propagation/migration/weather cadence so a ~10–15 min wander reliably contains at least one "moment."
- **Persistence:** keep file-based for now; revisit a DB only at Phase 8 scale.
- **Visuals:** no sprite/art pipeline — wonder comes from motion, color, light, and particles.

## The four design pillars

Judge every change against these. If it doesn't serve one, don't build it.

1. **Wonder is the only reward.** No coins, XP, unlocks, or completion meters. No progression of any kind.
2. **The world is alive and shared.** One persistent, self-propagating ecosystem that remembers what players did to it.
3. **You nudge, you don't manage.** Only soft, additive, non-destructive actions. Nothing can be done wrong or lost.
4. **Beauty from motion and color.** Win "wonder" through generative rendering (light, particles, animation), not a sprite/art pipeline.

### Hard rules
- **Do not add** economy, currency, tools, crafting, buildings-to-construct, skills/XP, achievements, quests, stamina, hunger, combat, or destructive actions. These are being removed, not extended.
- **Do not add pressure, fail states, or loss.** If a mechanic can punish or deprive the player, it's wrong for Wanderleaf.
- When in doubt, prefer **deleting** old farming-MMO code over preserving it. Simplicity serves the pivot.

## Keep / Repurpose / Cut map

The code still contains the entire old feature set. Orient new work like this:

- **Repurpose (make core):** natural propagation (`server/src/logic/PlantLogic.ts`), fauna movement (`server/src/logic/AnimalLogic.ts` — keep motion/flocking, drop products/breeding), seasons & weather (`server/src/logic/SeasonManager.ts`), the shared persistent world (`server/src/WorldManager.ts`), and the generative renderer (`client/src/renderers/HexRenderer.ts`).
- **Build:** the "gentle nudge" verb set, presence-as-ecology (the player influencing the world by moving), and the generative beauty layer (color grading, particles, wind, lighting).
- **Cut:** economy/NPC shops, tools & tiers, ~40 buildings (`BUILDING_COSTS` in `common/src/types.ts`), cooking, mining, fishing, skills (`server/src/logic/SkillLogic.ts` — likely delete), quests, achievements, stamina/hunger, and the UI for them (`client/src/components/CookingMenu.tsx`, `Hotbar.tsx`, `Journal.tsx`).

## Repo layout

TypeScript monorepo with three npm workspaces:

- `common/` — shared code used by both server and client.
  - `src/types.ts` — shared types and (currently) large game-data tables. Much of this shrinks with the pivot.
  - `src/hex.ts` — axial (q, r) hex coordinate math. **Keep; foundational.**
- `server/` — authoritative simulation.
  - `src/index.ts` — Express + Socket.io entry point.
  - `src/GameEngine.ts` — the tick loop (where the living world advances).
  - `src/WorldManager.ts` — chunk state and entity persistence.
  - `src/Generator.ts` — deterministic Simplex world generation.
  - `src/logic/` — per-system tick logic (Plant, Animal, Season, Skill).
- `client/` — rendering and UI.
  - `src/renderers/HexRenderer.ts` — PixiJS WebGL hex rendering. **The surface where the pivot succeeds or fails.**
  - `src/network.ts` — Socket.io client.
  - `src/hooks/useInput.ts` — keyboard input (will shrink to ~movement + a few nudges).
  - `src/AudioManager.ts` — audio framework.
  - `src/components/` — React UI overlay.

## Commands

```bash
npm install            # install all workspaces (run at root)
npm run dev:server     # server on port 3001
npm run dev:client     # Vite dev client
npm run build          # build all workspaces
npm run start          # start prod server
```

There is no automated test suite. `verify_final.py` at the root is a legacy one-off; do not assume it reflects the new direction.

## Architecture notes

- **Server-authoritative.** The server runs the simulation and syncs state to clients over Socket.io; clients render and send player actions. Keep the world's truth on the server.
- **Deterministic infinite world.** Terrain and static entities are generated from chunk coordinates + a global seed (16×16 hex chunks, `CHUNK_SIZE` in `common/src/types.ts`), loaded/unloaded as players move. Generation must stay deterministic so the world is consistent for everyone.
- **Persistence.** The world keeps evolving and remembering changes whether or not players are online — this is central to "the world is alive and shared," not an afterthought.
- **Real-world time.** Growth and change happen over real time (see `GAME_DAY` in `common/src/types.ts`), not per-visit.

## Conventions

- Match the surrounding code's style, naming, and idioms; this is plain TypeScript with no heavy framework conventions beyond React on the client.
- Shared types and constants live in `common/` so server and client agree — don't duplicate them.
- Prefer small, reversible changes. Given the prune-heavy phase, deletions are welcome but should be complete (remove the feature, its types, its UI, and its wiring together).
