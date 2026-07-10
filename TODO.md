# Wanderleaf — Build Roadmap

Everything required to turn the current HexFarm codebase into **Wanderleaf**, the tranquil living-world exploration game described in `README.md`. Organized into phases; each phase is roughly gated by the one before it. Checkboxes are concrete work items, most pinned to real files.

**Guiding filter:** every item must serve a design pillar — (1) wonder is the only reward, (2) the world is alive and shared, (3) you nudge, you don't manage, (4) beauty from motion and color. When in doubt, cut rather than keep.

Legend: 🔴 blocking / high-leverage · 🟡 core · 🟢 polish · 💭 needs a design decision first

---

## Phase 0 — Decisions & Setup

Resolve these before large-scale coding; they shape everything downstream.

- [ ] 💭 **Lock the "gentle nudge" verb set.** Pick the final 2–4 non-destructive actions (candidates: scatter seeds, coax growth, part grass, attract/calm a creature, leave a bloom-mark). Write them into `README.md` §2 and `AGENTS.md`.
- [ ] 💭 **Define "presence-as-ecology" rules.** What exactly does moving through the world do? (e.g. flora bias toward the player's recent path, creatures orienting to the nearest wanderer.) Decide radius, strength, and decay.
- [ ] 💭 **Decide the persistence story.** Current persistence is file-based. Confirm whether that survives the pivot or moves to a DB (see Phase 8). Affects how "the world remembers" is implemented.
- [ ] 💭 **Choose a target session shape.** Is a "session" 5 minutes or an hour? Tune world tick rates and propagation speeds to match (`GAME_DAY`/tick constants in `common/src/types.ts`, `server/src/GameEngine.ts`).
- [ ] **Establish a baseline.** Get `npm run dev:server` + `npm run dev:client` running and confirm the current build works before deleting anything.
- [ ] **Add minimal tooling.** There is no test suite; add at least a typecheck/lint script and a smoke test for the server tick loop so the prune doesn't silently break things.
- [ ] **Retire `verify_final.py`** or replace it with a relevant verification harness for the new direction.
- [ ] **Rename decision:** decide if/when the repo directory and package names move from `hex-farm`/`hexfarm` to `wanderleaf`.

---

## Phase 1 — The Great Prune 🔴

Remove the farming-MMO surface area. Do this first: it shrinks the codebase, clarifies what remains, and de-risks everything after. Each deletion should be *complete* — feature, its types, its UI, and its wiring, together.

### Economy & NPCs
- [ ] Remove shop NPCs and their logic: Merchant, Blacksmith, Miner, Fisherman, Woody (spawns, home positions, interaction handlers).
- [ ] Remove coins/currency, buying, selling, `ITEM_PRICES`, shipping bin, player stalls, `/give` trade command.
- [ ] Remove quests and global daily quests.
- [ ] Remove gifting, NPC friendship, milestones, daily gifts, and heart events.

### Progression
- [ ] Delete the skill system: `server/src/logic/SkillLogic.ts`, XP, levels, per-skill stamina discounts, master rewards.
- [ ] Remove achievements and their global-chat announcements.
- [ ] Remove stamina and hunger/eating entirely (actions become free; nothing is spent).
- [ ] Remove daily luck system and its hooks into foraging/mining/fishing.

### Tools, crafting, buildings
- [ ] Remove all tools and tiers: hoe, axe, pickaxe, scythe, watering can, fishing rod, dynamite, Copper/Iron/Gold upgrades.
- [ ] Remove the ~40 buildings and `BUILDING_COSTS` (`common/src/types.ts`): sheds, chests, wells, sprinklers, barns, cooking pots, furnaces, mills, artisan machines, auto-harvester, greenhouse, etc.
- [ ] Remove cooking: `client/src/components/CookingMenu.tsx`, all recipes, buffs from food.
- [ ] Remove mining/caves, ores, gems, geodes, smelting, coal.
- [ ] Remove fishing and seasonal fish.
- [ ] Remove crafting resources framing (wood/stone as build currency) — trees/rocks become scenery, not resource nodes.

### Attrition & destructive mechanics
- [ ] Remove pests, scarecrows, lightning damage/burnt trees, meteorites-as-mining-nodes.
- [ ] Remove every destructive action (clearing trees/rocks, dynamite, harvesting-as-removal).

### UI teardown
- [ ] Strip `client/src/components/Hotbar.tsx` and `Journal.tsx` (or repurpose Journal later as a wordless "atlas" — see Phase 7).
- [ ] Reduce `client/src/hooks/useInput.ts` to movement + the chosen nudge verbs.
- [ ] Prune obsolete types and constants from `common/src/types.ts` as their features are deleted.

### Verify
- [ ] After the prune, the game should still run: you can join, walk, and see terrain/flora/fauna. Nothing else.

---

## Phase 2 — Repurpose the Living-World Core 🔴

Promote the systems that survive into the heart of the game.

### Flora / propagation (`server/src/logic/PlantLogic.ts`)
- [ ] Make natural propagation the primary simulation, not a rare background event: tune spread rates so forests/meadows visibly advance over a real session.
- [ ] Add succession/variety: different flora colonize different terrain; meadows bloom and fade; nature reclaims open ground.
- [ ] Add mushroom/bloom bursts tied to rain and season.
- [ ] Remove "growth stage → harvestable crop" framing; growth stages now serve *appearance* and *spread*, not yield.
- [ ] Ensure propagation is deterministic-friendly and cheap enough to run across many chunks.

### Fauna (`server/src/logic/AnimalLogic.ts`)
- [ ] Strip husbandry: breeding, products, quality, barns, taming.
- [ ] Add emergent movement: wandering with momentum, **flocking/boids-style grouping**, and seasonal **migration** across chunks.
- [ ] Add reactions to players and weather (skittish/curious behaviors; sheltering in storms).
- [ ] Introduce a few evocative creature archetypes suited to biomes (grazers, birds, water creatures, night creatures).

### Time / seasons / weather (`server/src/logic/SeasonManager.ts`)
- [ ] Elevate weather from a modifier to a headline event: schedule and telegraph rare, beautiful moments (first snow, spring bloom, storms, still dawns, fog, auroras).
- [ ] Ensure day/night and seasons drive flora appearance, fauna behavior, and the rendering color palette (Phase 4), not stat math.
- [ ] Make weather spatial where feasible (a storm you can walk toward/away from) rather than purely global — 💭 decide global vs. regional.

### World generation (`server/src/Generator.ts`)
- [ ] Refocus generation from resource placement to **biome variety and beauty**: distinct, legible regions (forest, wetland, meadow, tundra, coast, etc.).
- [ ] Add landmark-free but characterful terrain features worth walking toward (ridges, groves, water bodies, clearings).
- [ ] Keep generation deterministic per seed + chunk coords.

---

## Phase 3 — The New Interaction Model 🟡

Build the "you nudge, you don't manage" and "presence-as-ecology" pillars.

- [ ] Implement the chosen nudge verbs end-to-end (input → client action → server validation → world effect → sync). All additive, none destructive.
- [ ] Implement presence-as-ecology: moving through the world subtly biases nearby growth and creature behavior, per the Phase 0 rules.
- [ ] Make every nudge/effect **persist in the shared world** so other players find them later (ties to Phase 5 & 8).
- [ ] Add gentle, legible feedback for nudges (a shimmer, a sprout, a creature turning) — feedback is sensory, never a number or reward popup.
- [ ] Guarantee the no-fail invariant: no action can deprive, punish, or undo another player's marks.

---

## Phase 4 — The Generative Beauty Layer 🔴

This is where "wonder" is won or lost. Highest-leverage phase after the prune. All in `client/src/renderers/HexRenderer.ts` and supporting client code.

- [ ] **Dynamic color grading** by time of day and season (dawn/dusk gradients, seasonal palettes, night blues). Drive it from the server's time/season state.
- [ ] **Soft lighting** — ambient light, warm/cool shifts, glow around light sources and blooms, gentle vignette.
- [ ] **Particle life** — pollen, drifting leaves, fireflies at night, falling snow, rain, dust motes; density tied to biome/weather.
- [ ] **Wind** — coherent wind field animating grass, trees, particles, and cloth-like motion.
- [ ] **Smooth motion** — eased player movement and camera, interpolated entity positions, no hard grid snapping visually.
- [ ] **Water & sky** — animated water shading, day/night sky, weather overlays (fog, storm darkening, aurora).
- [ ] **Composition** — depth cues, subtle parallax, and framing so vistas read as beautiful, not just functional.
- [ ] **Performance budget** — profile PixiJS with many chunks + particles; ensure it holds up on modest hardware (this is a "just wander" game; it must never chug).
- [ ] 💭 Reconfirm the "no sprite art" stance holds up in practice, or scope a minimal art pass if geometry can't carry it.

---

## Phase 5 — Shared Living World 🟡

Multiplayer is secondary but the "shared, remembering world" is a pillar.

- [ ] Ensure the world simulation runs and persists **independent of who is online** (`server/src/GameEngine.ts`, `WorldManager.ts`).
- [ ] Persist player-caused changes (nudges, propagation biases) so absent players' effects remain discoverable.
- [ ] Render other players as gentle, non-intrusive presences; no required interaction, no collisions-as-obstruction if it harms the calm.
- [ ] Add wordless togetherness (retain/repurpose emotes; gathering at vistas) — 💭 decide how much, keep it minimal.
- [ ] Handle scale: many wanderers across an infinite world without the sim or sync melting (interest management by chunk/region).
- [ ] Decide chat's fate — 💭 keep a quiet global chat, reduce to emotes only, or remove.

---

## Phase 6 — Audio & Atmosphere 🟡

Sound is half of "tranquil." Repurpose `client/src/AudioManager.ts`.

- [ ] Replace event SFX (selling, leveling, etc.) with ambient, generative soundscapes.
- [ ] Layer ambience by biome, weather, time of day (wind, birds, rain, insects, night stillness).
- [ ] Add soft, non-looping-feeling music beds that shift with season/weather.
- [ ] Gentle audio cues for weather events worth wandering toward.
- [ ] Ensure audio is calming and never intrusive; generous mixing headroom, no sudden stings.

---

## Phase 7 — Minimal UX & Onboarding 🟢

The game should teach itself and stay out of the way.

- [ ] Reduce the login/join flow to the minimum (name + go, or even anonymous).
- [ ] Wordless or near-wordless onboarding: the player learns "walk" and the nudge verbs through gentle prompts, not tutorials.
- [ ] 💭 Repurpose the Journal into a **wordless atlas/memory** of places seen and moments witnessed — *only if* it stays pressure-free (no completion %, no checklist). Otherwise cut it.
- [ ] Strip HUD to near nothing; surface time/season/weather ambiently through the world, not gauges.
- [ ] Accessibility pass: colorblind-friendly palettes, motion-reduction option, key rebinding.

---

## Phase 8 — Persistence, Scale & Ops 🟡

- [ ] 💭 Evaluate moving from file-based persistence to a database for an always-running, ever-growing shared world.
- [ ] Design world state so an infinite, continuously-evolving map doesn't grow unbounded (chunk aging, summarization of unvisited regions, or bounded persistence of player marks).
- [ ] Load/save the simulation cleanly across server restarts; the world must feel continuous.
- [ ] Deployment: update `Dockerfile` for the new build; define hosting for a persistent server.
- [ ] Resolve the 9 Dependabot vulnerabilities flagged on push (3 high, 4 moderate, 2 low).
- [ ] Basic observability: logging/metrics for tick timing, chunk counts, connected players.

---

## Phase 9 — Playtest, Tune & Launch 🟢

- [ ] Playtest for the core question: *is it genuinely lovely and quietly surprising to just walk around?* If not, iterate on Phases 2 & 4 before anything else.
- [ ] Tune propagation, migration, and weather cadence so a session reliably contains at least one "moment."
- [ ] Balance presence-as-ecology so the world feels responsive but not manic.
- [ ] Long-session soak test (does the world stay beautiful and performant after hours/days of evolution?).
- [ ] Rename/rebrand pass: package names, repo, in-game title → Wanderleaf.
- [ ] Write a short "what is this" landing description for newcomers who expect a game with goals.

---

## Cross-cutting / ongoing

- [ ] Keep `AGENTS.md` and `README.md` in sync as decisions land.
- [ ] Guard the pillars in review: reject any creeping re-introduction of goals, economy, or pressure.
- [ ] Keep the simulation server-authoritative and generation deterministic throughout.
