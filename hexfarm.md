# HexFarm MMO

HexFarm is a scalable, slow-paced MMO set on an infinite hexagonal grid. It draws inspiration from the tranquil atmosphere of Harvest Moon 64, focusing on the growth of plants and the gentle movement of animals in a procedurally generated world.

## 1. Current State of the Game

### Procedural World Generation
- The world is generated on-the-fly using **Simplex noise** for terrain and obstacle placement.
- **Chunking System:** The world is divided into 16x16 hex chunks (defined by `CHUNK_SIZE` in `common/src/types.ts`). Chunks are loaded and unloaded dynamically as players move.
  - **Static Entities:** Trees and rocks are generated deterministically based on chunk coordinates and a global seed. Decorative terrain such as grass and flowers are also procedurally generated.

### Navigation and Interaction
- **Hexagonal Grid:** Uses axial coordinates (q, r) for all positions.
- **Movement:** Players can move in 6 directions using WASD or Arrow keys.
- **Real-time Synchronization:** Socket.io is used to sync player positions and entity states across all clients.
- **Collision Detection:** Players cannot walk through static obstacles like trees and rocks, or buildings like Sheds and Chests.

### Entity System
- **Players:** Persistent entities with unique IDs and names. Includes skills and levels.
- **Plants:** Have `growthStage`, `lastWatered`, and `plantedAt` properties. They grow in real-time.
- **Animals:** Move randomly to neighboring hexes at set intervals (`nextMoveTime`).
- **Obstacles:** Static entities like trees and rocks that block movement.

### Growth Mechanics
- **Real-time Growth:** Plants progress through stages based on elapsed time. Different species (Turnips, Carrots, Pumpkins) have different growth rates.
- **Watering Bonus:** Plants grow twice as fast if they have been watered within the last 24 hours (configurable in `PlantLogic.ts`).
- **Fertilizer:** Players can use "Junk" caught while fishing as fertilizer to give plants an instant growth boost.
- **Stamina:** Actions like plowing, watering, and clearing obstacles consume stamina. Stamina regenerates over time.
- **Consumption:** Eating crops or cooked food restores stamina. Cooked dishes provide much higher stamina bonuses and some provide temporary buffs.
- **Buffs:** Certain foods like Pumpkin Soup provide temporary buffs, such as increased stamina regeneration.
- **Pests:** Mature plants that are not protected by a Scarecrow (2-hex radius) have a small chance each game tick to be damaged by pests, regressing their growth stage.
- **Foraging:** Wild mushrooms and berry bushes spawn in the world. Mushrooms can be harvested, while berries can be gathered periodically from bushes.
- **Scavenging & Discovery:** Clearing decorative terrain, trees, or rocks has a chance to yield seeds or coins.
- **Animal Breeding:** Animals of the same species (Cow, Sheep, Chicken, Pig) will breed if they are adjacent and healthy, leading to population growth (capped per area).
- **Barns:** Automatically collect products from animals within a 2-hex radius.
- **Shipping Bin:** Sell all crops and products in your inventory at 80% value instantly.
- **Seed Maker:** Convert a crop from your inventory into 1-3 corresponding seeds.
- **Beehives:** Produce Honey over time. If a **Sunflower** is within a 2-hex radius, they produce premium **Sunflower Honey**, otherwise they produce standard **Wildflower Honey**. They also provide a 1.5x growth boost and a 5x natural propagation boost to plants within a 2-hex radius.
- **NPC Relationships:** Players can build friendship with NPCs (Merchant, Blacksmith, Fisherman, Miner) by giving them gifts (`/gift [npc] [item]`). High friendship levels unlock new dialogue and rewards. At 750 friendship, NPCs give a significant one-time reward. At high friendship levels (500+), NPCs may occasionally give the player role-relevant gifts when interacted with.
- **Natural Propagation:** Mature plants and trees have a small chance each tick to sprout new growth in adjacent empty hexes, allowing nature to reclaim the land and forests to expand naturally.
- **Ancient Shrines:** Rarely found in the wild. Interacting with a shrine grants a powerful random 10-minute buff once per day.
- **Mining Depths:** Rare chance to discover a Cave Entrance while mining rocks. Caves are a rich source of rocks, mushrooms, and **Coal**.
- **Quests:** The Merchant at (0,0) may assign simple crop-gathering tasks. Completing them yields significant bonus coins.
- **Achievements:** Players can unlock various achievements by reaching milestones in farming, wealth, fishing, and exploration. Unlocks are announced in global chat.
- **Global Chat & Trading:** Players can communicate via a global chat. Using the `/give [name] [item] [amount]` command allows players to trade items with others nearby.

---

## 2. Core Mechanics

### Infinite Procedural World
The world is theoretically infinite. The server generates entities for chunks only when they are requested by a player's client. This ensures that the world remains consistent for all players using the same seed.

### Slow-Paced Growth
HexFarm is designed to be played over long periods.
- **Crops:** Might take several real-world days to reach maturity. Growth is faster during preferred seasons (e.g., Turnips in Spring, Corn in Summer).
- **Trees:** Now grow through stages like crops (7 game days per stage). Mature trees provide more wood (5 units) and sometimes fruit.
- **Low Pressure:** Neglecting plants won't kill them; it simply halts or slows their growth, encouraging a relaxed playstyle.

### Skill System
- **Skills:** Players gain XP and level up in various skills: Farming, Foraging, Mining, Fishing, and Cooking.
- **Progression:** Higher levels in skills reduce the stamina cost of related actions (up to 50% reduction).
- **XP Gain:** Actions like harvesting, plowing, clearing obstacles, fishing, and cooking grant XP in their respective categories.

### Crafting & Economy
- **Resource Gathering:** Trees and rocks can be cleared to gather Wood and Stone. Mining rocks also has a chance to yield **Iron Ore**.
- **Crafting:** Most infrastructure (Fences, Sheds, Chests, Wells, Cooking Pots) requires Wood and Stone to build.
- **Cooking:** Players can use a Cooking Pot to combine ingredients into powerful food items. Recipes include Salad, Apple Pie, Pumpkin Soup, Corn Chowder, Grilled Fish, Mushroom Soup, Berry Tart, Miner's Stew (uses Iron Ore), Veggie Platter, **Coal-Grilled Fish**, **Fruit Salad**, **Mushroom Risotto**, **Corn Bread**, **Fish Stew**, **Honey-Glazed Carrots**, **Goat-Cheese Salad**, **Duck-Egg Mayo**, **Berry Smoothie**, **Pumpkin Pie**, and **Apple Cider**.
- **Merchant:** A central economy hub where crops and animal products can be sold for coins. Coins are used to buy seeds and basic tools.
- **Blacksmith:** Located at (5, 5), the Blacksmith specializes in tool upgrades. Players can spend coins and Iron Ore/Gold Ore to upgrade tools to Copper, Iron, and Gold versions.
- **Fisherman:** Found near bodies of water. He buys fish for a premium price (50 coins).
- **Miner:** Located in the cave layer at (10005, 10005). He buys Stone, Iron Ore, and Gold Ore at premium prices and sells **Dynamite**.

---

## 3. User Experience (How to Play)

### Joining the Game
Players join by entering a name in the login screen and are spawned at the origin (0, 0) or their last saved position.

### Movement
Using **WASD** or **Arrow Keys**, players navigate the grid. The camera follows the player, and new chunks are requested from the server as the player approaches unexplored territory.

### Farming & Construction
1. **Plowing:** Pressing **P** plows the current hex, creating tilled soil. Requires a **Hoe**.
2. **Planting:** Press **1-6** to plant seeds on tilled soil.
3. **Care:** Press **I** to water. Press **G** to use **Fertilizer** (consumes 1 Junk, boosts growth).
4. **Watering Sources:** Standing near a **Well** or using a **Watering Can** allows watering. Wells provide a local infinite water source for the surrounding area.
5. **Harvesting:** Press **E** (Interact) or **H** to harvest mature plants.
6. **Clearing:** Press **X** to clear trees (Axe) or rocks (Pickaxe).
7. **Building Infrastructure:**
   - **F**: Fence (2 Wood)
   - **R**: Path (1 Stone)
   - **K**: Sprinkler (5 Stone)
   - **B**: Scarecrow (2 Wood)
   - **L**: Shed (10 Wood, 5 Stone)
   - **V**: Chest (5 Wood, 2 Stone)
   - **U**: Well (5 Wood, 10 Stone)
   - **N**: Beehive (5 Wood, 5 Stone)
   - **O**: Cooking Pot (5 Wood, 10 Stone)
   - **8**: Plant Sunflower
   - **Goats and Ducks**: New animals that provide **Goat Milk** and **Duck Eggs**.
   - **Orange Trees**: New fruit trees that prefer Summer and provide **Oranges**.
   - **M**: Barn (20 Wood, 10 Stone)
   - **Q**: Shipping Bin (10 Wood, 10 Stone)
   - **T**: Seed Maker (15 Wood, 5 Stone)
   - **Shift+Q**: Compost Bin (10 Wood, 2 Stone)
   - **Alt+B**: Greenhouse (30 Wood, 20 Stone) - Protects plants from seasonal growth penalties.
   - **Alt+N**: Weather Station (10 Wood, 15 Stone) - Provides a forecast for tomorrow's weather.
8. **Interacting:** Press **E** to interact with animals, harvest fruit/berries, use buildings, talk to NPCs, or enter Caves.
   - **Merchant:** Stand near (0,0) and press **E** to sell crops and products.
   - **Blacksmith:** Stand near (5, 5) and press **E** to upgrade tools. Requires previous tier + coins/ore.
   - **Fisherman:** Stand near a Fisherman and press **E** to sell fish for 50 coins.
   - **Miner:** Stand near the Miner (10005, 10005) and press **E** to sell ores and buy **Dynamite**.
   - **Merchant Selling Resources:** Stand near the merchant and press **Shift+X** to sell gathered resources (Wood, Stone, Junk) for coins.
   - **Scythe:** A tool that allows harvesting all mature crops in a 1-hex radius.
   - **Cooking Pot:** Stand near a Cooking Pot and press **Alt + 1-9** to cook recipes (Salad, Apple Pie, Pumpkin Soup, Corn Chowder, Grilled Fish, Mushroom Soup, Berry Tart, Miner's Stew, Veggie Platter). Additional recipes: **Alt+0** for Coal-Grilled Fish. New recipes: Fruit Salad, Mushroom Risotto, Corn Bread, Fish Stew, **Fruity Sorbet**, **Hearty Stew**, **Seafood Platter**, **Honey-Glazed Carrots**, **Goat-Cheese Salad**, **Duck-Egg Mayo**, **Berry Smoothie**, **Pumpkin Pie**, **Apple Cider**, and **Orange Juice** (Alt+U).
9. **Consuming:** Press **C** to eat the best food in your inventory to restore stamina.
10. **Teleport Home:** Press **Y** to teleport back to the origin (0,0). Costs 20 stamina.
11. **Dynamite:** Press **Z** to use Dynamite. It clears everything in a 1-hex radius (excluding water) but does not refund resources.
12. **Chatting & Trading:** Press **Enter** to focus the chat. Type your message and press **Enter** to send. Type `/give [name] [item] [amount]` to give items to a nearby player. Press `/gift [npc] [item]` to give a gift to an NPC. Press **Esc** to cancel.
13. **UI Toggle:** Click "Hide Controls" to maximize your view of the world.

---

## 4. System Architecture

The project is organized as a **TypeScript Monorepo**:

### Backend (`/server`)
- **Node.js & Express:** Hosts the server and handles initial connections.
- **Socket.io:** Manages real-time, bidirectional communication.
- **Game Engine:** Handles the "tick" logic for plants, animals, and buffs.
- **World Manager:** Manages chunk state and entity persistence.

### Frontend (`/client`)
- **React:** Manages the UI overlay, menus, and application state.
- **PixiJS:** A high-performance 2D WebGL renderer used to draw the hex grid and sprites.
- **Socket.io-Client:** Listens for updates from the server and sends player actions.

---

## 5. Future Vision (What it Should Be)

### Environmental Depth
- **More NPCs:** Add more characters with unique schedules and shops.
- **Advanced Skills:** Specializations and unique perks for high-level skills.

### Visual & Technical Polish
- **Pixel Art Sprites:** Transitioning from shapes to detailed pixel art.
- **Persistence:** Robust database integration for long-term scaling.

---

## 6. TODO / Roadmap

### High Priority
- [x] **Persistence:** Basic file-based persistence.
- [x] **Harvesting & Inventory:** Core farming loop.
- [x] **Animal Products:** Resources from cows, sheep, chickens, and pigs.
- [x] **Seasons & Weather:** Dynamic environment.
- [x] **Day/Night Cycle:** Visual time progression.
- [x] **Stamina & Consumption:** Strategic resource management.
- [x] **Global Chat:** Real-time communication between players.
- [x] **Skill System:** XP and levels for various activities.
- [x] **Achievement System:** Milestones and global announcements.
- [x] Simplify what actions the user can take, and make the game a lot more about what the interactions and growth of nature, natual plant propagation, and the effects of simple player actions have on a world. It should be an enjoyable game for someone to show up and only walk around and explore, if they so desire.

### Medium Priority
- [x] **Automation:** Tiered Sprinklers and Barns.
- [x] **Infrastructure:** Sheds, Chests, Fences, Paths, Barns, and Cooking Pots.
- [x] **Economy:** Merchant system at (0,0).
- [x] **Tool Upgrades:** Copper tools for efficiency.
- [x] **Resource Crafting:** Require Wood/Stone for construction.
- [x] **Fertilizer:** Implement growth boost using Junk.
- [x] **Well:** Add crafting and rendering for the Well building.
- [x] **Pests & Protection:** Scarecrow mechanics.
- [x] **Seasonal Growth:** Preferred seasons for crops.
- [x] **Trading:** Player-to-player exchange via `/give`.
- [x] **Animal Breeding:** Population growth for animals.
- [x] **Beehives:** Production and growth boost.
- [x] **Quests:** Basic fetch quests from Merchant.
- [x] **Cooking:** Combine ingredients into meals for high stamina restoration and buffs.
- [x] **Pets:** Added dogs and cats to the world.
- [x] **Foraging & Scavenging:** Find items in the wild or while clearing grass.
- [x] **Teleport:** Quick return home with 'Y' key.
- [x] **Buff System:** Temporary status effects from food.
- [x] **Blacksmith NPC:** Tool upgrades hub at (5, 5).
- [x] **New Crops:** Added Winter Radish for seasonal variety.
- [x] **Tiered Tools:** Added Copper, Iron, and Gold tiers with improved efficiency.
- [x] **More NPCs:** Added Fisherman, Blacksmith, and Miner with unique roles.
- [x] **Advanced Buffs:** Implemented luck and temporary stat boosts via food.
- [x] **Mining Depths:** Rare chance to find "cave entrance" hexes while mining, leading to underground layers.
- [x] **Miner NPC:** Added a Miner NPC in the cave layer who sells Dynamite and buys ores.
- [x] **Dynamite:** A powerful tool for clearing large areas quickly.
- [x] **Livestock Barns:** Buildings that automatically gather products from nearby animals.
- [x] **Shipping & Seed Making:** Added Shipping Bin and Seed Maker buildings.
- [x] **NPC Relationship System:** Friendship hearts and gifting.
- [x] **Growing Trees:** Trees now have growth stages and dynamic wood yield.
- [x] **Coal Resource:** Added coal as a rare drop and cooking ingredient.
- [x] **Inventory Safety:** Prevented clearing buildings containing items.
- [x] **Compost Bin:** Convert crops to powerful fertilizer.
- [x] **Advanced Buffs:** Farming, Foraging, and Fishing luck.
- [x] **NPC Milestones:** Reaching 1000 friendship grants unique perks.
- [x] **Storage Refactor:** Store any non-tool item in Chests/Sheds.
- [x] **More Recipes:** Added 6 new complex recipes including Honey-Glazed Carrots and Pumpkin Pie.
- [x] **NPC Daily Gifts:** High friendship NPCs give daily gifts.
- [x] **Improved Fence Visuals:** Connected rails between adjacent fences.
- [x] **Oranges:** New fruit tree and juice recipe.
- [x] **Scythe:** Area-of-effect harvesting tool.
- [x] **Wild Fruit Trees:** Apple and Orange trees now spawn rarely in the world.
- [x] **Cooking UI:** Dedicated menu for crafting meals.
- [x] **NPC Milestones:** Heart events with unique dialogue at 250/500/750 friendship.
- [x] **Input Reliability:** Standardized `e.code` and unique modifiers (Ctrl for tools, Alt for cooking) for all game hotkeys.
- [x] **UI Polish:** Added buff timers and item prices to inventory.
- [x] **Natural Propagation:** Plants and trees now spread naturally over time.
- [x] **Ancient Shrines:** Discovery rewards for explorers that grant buffs.
- [x] **Control Simplification:** Merged harvest into the universal interact ('E') key.
- [x] **Recycling Machine:** Added building to convert junk into useful resources.
- [x] **Decorative Life:** Added butterflies and fireflies to the world.
- [ ] **Sound & Music:** Add relaxing ambient sounds.

### Long Term
- [ ] **Detailed Pixel Art:** Full replacement of PIXI shapes with sprites.
- [ ] **Advanced NPC interactions:** Unique events and rewards at high friendship.
- [ ] **Advanced Cooking:** Combine crops and products for more diverse buffs.

---

## 7. Nuances and Design Philosophy

- **Patience as Gameplay:** Unlike many modern games, HexFarm rewards patience.
- **Shared Space:** A peaceful MMO experience focused on cohabitation and farming.
- **Deterministic Generation:** Infinite world consistency through mathematical seeds.
