# Wanderleaf

> **Note.** The project is mid-pivot from a farming MMO ("HexFarm") to this. The repo directory is still `hex-farm`.

**Wanderleaf is a quiet, infinite world that grows, blooms, and shifts on its own. You show up, wander, and leave gentle marks. There are no goals, no economy, and no way to fail — the reward is simply seeing what the world has become. Everyone shares the same living world.**

Think of it as a walking meditation across an endless hex meadow rather than a game you "win." Forests advance across the land, flowers spread after rain, flocks migrate with the seasons, and the marks you leave persist for other wanderers to find.

---

## 1. Design Pillars

Everything in Wanderleaf serves four ideas. If a proposed feature doesn't serve one of these, it doesn't belong.

1. **Wonder is the only reward.** No coins, no XP, no unlocks, no completion meters. The payoff is the sight. Progression is purely freeform — every player is equal at all times.
2. **The world is alive and shared.** One persistent ecosystem that propagates, spreads, and migrates on its own — and remembers what everyone's presence did to it.
3. **You nudge, you don't manage.** A tiny set of soft, non-destructive verbs. Nothing can be done wrong; nothing can be destroyed or lost.
4. **Beauty from motion and color.** The world is rendered with generative geometry made lovely through light, particles, animation, and composition — not a sprite/art pipeline.

### What Wanderleaf is *not*
No farming to manage, no tools, no crafting, no buildings to construct, no NPC shops, no combat, no stamina, no hunger, no quests, no skills, no achievements. If you feel pressure, something is wrong.

---

## 2. The Experience

### You wander
Move across an infinite hexagonal world with **WASD / Arrow keys**. The camera follows you; new terrain generates as you approach it. There is nowhere you *have* to go and nothing you *have* to reach. Wander toward the weather, the light, or a distant shape on the horizon.

### The world lives without you
The world is a slow, always-running simulation:
- **Flora spreads.** Mature plants and trees sow themselves into adjacent land. Forests thicken and advance; meadows bloom and fade; mushrooms rise in the rain. Nature reclaims open ground over real-world time.
- **Fauna moves with intent.** Creatures wander, flock, and migrate. They react to you and to the season rather than serving as livestock.
- **Time and weather are the drama.** Day and night, seasons, and weather are the main events worth chasing — first snow, a spring bloom, a still dawn. Weather is *regional*: a storm rolls across part of the map, so you can literally wander *toward* it or away from it.

### You leave gentle marks
Your entire action set is four soft, additive nudges — never destructive:
- **Scatter seeds** — cast seeds onto nearby land; they root and then propagate on their own.
- **Coax growth** — touch a plant to nudge it toward its next stage or into bloom.
- **Part the grass** — a ripple that sways flora and stirs small creatures and particles; pure sensory wonder.
- **Draw creatures near** — quietly attract or calm nearby fauna so they approach and linger.

Each nudge ripples into the living ecosystem, and because the world is shared and persistent, those ripples remain for others to discover long after you've wandered on.

### You are quietly not alone
Multiplayer is present but never required. Everyone influences the **same persistent ecosystem**, so you routinely find changes that another wanderer's presence caused — a grove that wasn't there yesterday, a trail of flowers across a hill. The game is fully satisfying solo; company is a gift, not a requirement. Expression is wordless: gentle emotes only, no text chat.

---

## 3. Tech Stack

A **TypeScript monorepo**. The pivot keeps the engine and reshapes what it simulates.

- **Backend (`/server`):** Node.js, Express, Socket.io for real-time sync, and a tick-based simulation engine that runs the living world.
- **Frontend (`/client`):** React for minimal UI, PixiJS for high-performance WebGL hex rendering (the surface where "wonder from motion and color" is won).
- **Shared (`/common`):** Types and hex math shared by client and server.

The infinite world is generated deterministically on-the-fly with Simplex noise and a 16×16 hex chunking system, so the world is consistent for every player and persists whether or not anyone is watching.

---

## 4. Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm

### Install
```bash
npm install
```

### Run
- **Server:** `npm run dev:server` (port 3001)
- **Client:** `npm run dev:client` (Vite dev server)
- **Build all:** `npm run build`
- **Start (prod server):** `npm run start`

---

## 5. Status & Roadmap

**The farming-MMO engine has been replaced by a minimal Wanderleaf core** (a rewrite-to-core, not a gradual prune). The living world, the four nudge verbs, regional weather, and emotes-only multiplayer are in place and verified end-to-end. What remains is depth and polish. See `AGENTS.md` for the design guardrails and `TODO.md` for the full phased plan.

### Done — the core
- [x] **Cut the farming MMO** — economy, NPC shops, coins/quests/gifting, skills/XP/achievements, stamina/hunger, tools & tiers, ~40 buildings, cooking, mining, fishing, smelting, pests/attrition. (~58k lines removed.)
- [x] **Natural propagation** — flora and forests grow and spread on their own; the beating heart of the sim.
- [x] **Emergent fauna** — creatures wander, flock, and drift toward wanderers (no husbandry).
- [x] **Regional weather** — fronts drift across the map; seasons and day/night drive the world.
- [x] **The four nudge verbs** — scatter seeds, coax growth, part the grass, draw creatures near.
- [x] **Presence-as-ecology** — a wanderer's presence quickens the spread of life around them.
- [x] **Shared persistent world** — one authoritative world that remembers flora growth and marks.

### Done — depth & beauty
- [x] **Generative beauty layer** — time-of-day color grading (moonlit night, amber dawn/dusk), wind that sways grass/flowers/canopies, ambient particle life (pollen, fireflies, autumn leaves), water shimmer, soft vignette, organic ground.
- [x] **Richer ecosystem** — coherent biomes (wetland, forest, glade, meadow, highland), plant succession (forests advance, undergrowth rises), and fauna that rest by day/night and migrate with the seasons.
- [x] **Bounded world** — an ecological density cap holds the world at equilibrium; atomic, race-free persistence.

### Next
- [ ] **Audio & atmosphere** — ambient generative soundscapes (repurpose `AudioManager`).
- [ ] **Persistence at scale** — evaluate a database for a very large, long-lived world.
- [ ] **Onboarding & accessibility** — wordless first-run, colorblind-friendly palettes, motion-reduction.

### The core risk we're designing around
With economy and progression gone, the entire experience rests on two things: **the ecosystem being genuinely surprising** and **the world being genuinely beautiful**. Those two — the living simulation and the generative rendering — are now the only things that matter.

---

## 6. License
MIT.
