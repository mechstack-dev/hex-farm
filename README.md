# HexFarm MMO

HexFarm is a scalable, slow-paced MMO set on an infinite hexagonal grid. It draws inspiration from the tranquil atmosphere of classic farming sims like Harvest Moon, focusing on the growth of plants and the gentle movement of animals in a procedurally generated world.

## 1. Project Overview

HexFarm features an infinite world generated on-the-fly using Simplex noise. Players collaborate or work independently to cultivate land, raise animals, and explore deep caves. The game runs in real-time, with plant growth and environmental changes persisting even when you're offline.

### Key Features
- **Infinite Procedural World:** Explore a deterministic world that generates chunks as you move.
- **Real-time Growth:** Crops grow over real-world time. Watering and seasons affect growth rates.
- **Skill System:** Level up in Farming, Foraging, Mining, Fishing, and Cooking to reduce stamina costs.
- **Economy & NPCs:** Trade with the Merchant, upgrade tools at the Blacksmith, sell fish to the Fisherman, and buy dynamite from the Miner.
- **Animal Husbandry:** Raise Cows, Sheep, Chickens, Pigs, Goats, and Ducks. Automate collection with Barns.
- **Crafting & Construction:** Build infrastructure like Fences, Sprinklers, Beehives, and Sheds.
- **Mining Depths:** Discover cave entrances to find rare ores and coal.

---

## 2. Tech Stack

The project is organized as a **TypeScript Monorepo**:

- **Backend (`/server`):** Node.js, Express, Socket.io for real-time synchronization, and a custom game engine.
- **Frontend (`/client`):** React for UI, PixiJS for high-performance WebGL hexagonal rendering.
- **Shared (`/common`):** Shared types and logic used by both client and server.

---

## 3. Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm

### Installation
1. Clone the repository.
2. Install dependencies at the root:
   ```bash
   npm install
   ```

### Running the Game
You can run both the server and client from the root directory:

- **Start Server:** `npm run dev:server` (Starts on port 3001)
- **Start Client:** `npm run dev:client` (Starts Vite dev server)
- **Build All:** `npm run build`

---

## 4. Game Mechanics

### Farming
- **Plowing:** Use a Hoe to till soil. Tilling decorative grass has a chance to yield seeds or coins.
- **Growth:** Plants have 5 growth stages. Growth is doubled if watered (manually or by rain/sprinklers).
- **Seasons:** Most crops have preferred seasons (e.g., Turnips in Spring, Corn in Summer). Out-of-season growth is 50% slower.
- **Fertilizer:** Use "Junk" or "Compost Fertilizer" to instantly boost a plant's growth stage.

### Buildings & Infrastructure
- **Sprinklers:** Automatically water plants every game tick. Available in Basic, Iron (radius 2), and Gold (radius 3) tiers.
- **Beehives:** Produce Honey. If a Sunflower is nearby, they produce premium Sunflower Honey and boost nearby plant growth.
- **Barns:** Automatically collect animal products within a 2-hex radius.
- **Shipping Bin:** Sell all eligible inventory items instantly at 80% market value.
- **Seed Maker:** Convert crops back into 1-3 seeds of the same species.

### NPCs & Relationships
- **Merchant (0,0):** Buys crops and products, sells seeds and basic tools. Assigns quests.
- **Blacksmith (5,5):** Handles tool upgrades (Copper, Iron, Gold).
- **Fisherman (Near water):** Buys fish at a premium price.
- **Miner (10005, 10005):** Located in caves. Buys ores and stone, sells dynamite.
- **Friendship:** Give gifts (`/gift [npc] [item]`) to build relationships. High friendship unlocks perks like "Merchant's Guild" (+20% sell price) or "Deep Delver" (higher gold ore chance).

### Skills & Stamina
- Every action (plowing, watering, mining) consumes stamina.
- Leveling up skills reduces the stamina cost of related actions.
- **Cooking:** Combine ingredients at a Cooking Pot to create meals that restore high stamina and provide powerful buffs (e.g., Mining Luck, Max Stamina boost).

---

## 5. Controls (Keyboard Shortcuts)

### Movement & Interaction
- **WASD / Arrows:** Move player
- **E:** Interact (Talk to NPCs, Harvest Fruit/Berries, Use Buildings, Enter Caves)
- **H:** Harvest mature crops
- **X:** Clear obstacle (Axe for trees, Pickaxe for rocks)
- **C:** Eat best food in inventory
- **Y:** Teleport home (Costs 20 stamina)
- **Z:** Use Dynamite (Clears 1-hex radius)
- **Enter:** Open Chat
- **Esc:** Close Chat / Menu

### Farming & Building
- **1 - 9:** Plant Seeds (8: Sunflower, 9: Orange Tree)
- **P:** Plow / Till soil
- **I:** Water (requires Watering Can or nearby Well)
- **G:** Fertilize (uses Junk or Compost Fertilizer)
- **F:** Build Fence
- **R:** Build Path
- **K:** Build Sprinkler (Shift+K: Iron, Alt+K: Gold)
- **B:** Build Scarecrow
- **L:** Build Shed
- **V:** Build Chest
- **U:** Build Well
- **N:** Build Beehive
- **O:** Build Cooking Pot
- **M:** Build Barn
- **Q:** Build Shipping Bin (Shift+Q: Compost Bin)
- **T:** Build Seed Maker

### Tools & Shopping
- **Shift + 1-7, 9, 0:** Buy Seeds from Merchant
- **Shift + 8:** Buy Fishing Rod
- **0 (Zero):** Buy Scythe (Area-of-effect harvesting)
- **Ctrl + 9, 0, -, =:** Buy Basic Tools (Hoe, Watering Can, Axe, Pickaxe)
- **Shift + X:** Sell Resources (Wood, Stone, Junk) near Merchant

### Cooking (Alt + Key)
*Stand near a Cooking Pot to use these shortcuts:*
- **Alt + 1-9:** Salad, Apple Pie, Pumpkin Soup, Corn Chowder, Grilled Fish, Mushroom Soup, Berry Tart, Miner's Stew, Veggie Platter
- **Alt + 0:** Coal-Grilled Fish
- **Alt + U:** Orange Juice
- **Alt + G:** Honey Glazed Carrots
- **Alt + H:** Goat Cheese Salad
- **Alt + J:** Duck Egg Mayo
- **Alt + K (+ Shift):** Berry Smoothie
- **Alt + L:** Pumpkin Pie
- **Alt + P:** Apple Cider

---

## 6. Roadmap

### Completed
- [x] Persistent Infinite World & Chunking
- [x] Farming Loop (Plow, Plant, Water, Fertilize, Harvest)
- [x] Animal Husbandry (Breeding & Products)
- [x] Skill & Achievement Systems
- [x] NPC Relationship & Perk System
- [x] Mining Depths (Caves)
- [x] Advanced Cooking & Buff System
- [x] Tool Tier Upgrades (Copper, Iron, Gold)

### Planned
- [ ] **Environmental Depth:** More NPCs with unique schedules and events.
- [ ] **Sound & Music:** Relaxing ambient sounds and seasonal music.
- [ ] **Visual Polish:** Full replacement of geometric shapes with detailed pixel art sprites.
- [ ] **Automation Expansion:** More advanced machinery for farm management.
- [ ] **Natural Propagation:** Plants spreading naturally over time to create a living world.

---

## 7. License
This project is licensed under the MIT License.
