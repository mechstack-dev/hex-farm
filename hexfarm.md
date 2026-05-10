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
- **Players:** Persistent entities with unique IDs and names.
- **Plants:** Have `growthStage`, `lastWatered`, and `plantedAt` properties. They grow in real-time.
- **Animals:** Move randomly to neighboring hexes at set intervals (`nextMoveTime`).
- **Obstacles:** Static entities like trees and rocks that block movement.

### Growth Mechanics
- **Real-time Growth:** Plants progress through stages based on elapsed time. Different species (Turnips, Carrots, Pumpkins) have different growth rates.
- **Watering Bonus:** Plants grow twice as fast if they have been watered within the last 24 hours (configurable in `PlantLogic.ts`).

---

## 2. Core Mechanics

### Infinite Procedural World
The world is theoretically infinite. The server generates entities for chunks only when they are requested by a player's client. This ensures that the world remains consistent for all players using the same seed.

### Slow-Paced Growth
HexFarm is designed to be played over long periods.
- **Crops:** Might take several real-world days to reach maturity.
- **Trees:** Can take months or even a full year to reach their final growth stage.
- **Low Pressure:** Neglecting plants won't kill them; it simply halts or slows their growth, encouraging a relaxed playstyle.

### Hexagonal Grid Logic
The game uses axial coordinate math for:
- Calculating distances between players and entities.
- Finding neighbors for movement and interaction.
- Rendering the 2D world in a top-down perspective using PixiJS.

---

## 3. User Experience (How to Play)

### Joining the Game
Players join by entering a name in the login screen and are spawned at the origin (0, 0) or their last saved position.

### Movement
Using **WASD** or **Arrow Keys**, players navigate the grid. The camera follows the player, and new chunks are requested from the server as the player approaches unexplored territory.

### Farming (Current)
1. **Planting:** Players can plant specific seeds on empty hexes by pressing **1** (Turnip), **2** (Carrot), or **3** (Pumpkin).
3. **Plowing:** Pressing **P** plows the current hex, creating tilled soil. Requires a **Hoe** in inventory. Land must be plowed before seeds can be planted. Pressing **P** again on empty tilled soil removes it.
4. **Planting:** Players can plant specific seeds on empty tilled soil:
   - **1**: Turnip
   - **2**: Carrot
   - **3**: Pumpkin
   - **4**: Corn
   - **5**: Wheat
   - **6**: Apple Tree
5. **Paths:** Pressing **R** builds a path at the player's position. Paths are decorative and persistent. Pressing **R** again on a path removes it.
6. **Care:** Pressing **I** waters the plant at the player's current position, doubling its growth rate for one game day (24 minutes). Requires a **Watering Can** in inventory. A blue indicator appears on watered plants.
6. **Automation:** Pressing **K** installs a **Sprinkler** if you have a Sprinkler Kit in your inventory. Sprinklers automatically water all plants in the same hex and 6 neighboring hexes.
7. **Protection:** Pressing **B** installs a **Scarecrow** if you have a Scarecrow Kit. Scarecrows are decorative but persistent structures that can be placed to define your farm space.
9. **Construction:** Pressing **L** builds a **Shed** if you have a Shed Kit. Sheds are larger persistent buildings for your farm.
5. **Harvesting:** Pressing **H** harvests a mature plant (at its final growth stage) at the player's current position. Harvesting grants the crop and a chance for new seeds.
6. **Clearing:** Pressing **X** clears an obstacle at the player's current position or immediate neighbors. Trees require an **Axe**, and rocks require a **Pickaxe**. Water cannot be cleared.
7. **Fishing:** Pressing **J** while standing next to water will attempt to fish if you have a **Fishing Rod**. You can catch Fish (rare, high value) or Junk (common, low value).
8. **Building:** Pressing **F** builds or removes a fence at the player's current position. Fences block movement.
9. **Interacting:** Pressing **E** interacts with animals, fruit trees, or buildings at or adjacent to the player's position.
   - **Animals:** Cows, sheep, chickens, and pigs provide milk, wool, eggs, and truffles once per game day.
   - **Apple Trees:** Mature apple trees provide an apple once per game day.
   - **Chests:** Interacting with a chest deposits all crops, animal products, and resources from your inventory. If your inventory has none of these, it withdraws everything from the chest.
  - **Merchant:** A merchant resides at (0,0). Interacting with them (**E**) sells all harvested crops, animal products, and gathered resources in your inventory for coins.
    - **Prices:** Turnip (10), Carrot (25), Pumpkin (50), Corn (35), Wheat (30), Apple (15), Milk (20), Wool (30), Egg (10), Truffle (60), Wood (5), Stone (5), Fish (40), Junk (2).
    - **Purchasing:** Stand near or at the merchant's position and press:
      - **Shift+1**: Turnip Seed (5 coins)
      - **Shift+2**: Carrot Seed (15 coins)
      - **Shift+3**: Pumpkin Seed (35 coins)
      - **Shift+4**: Corn Seed (25 coins)
      - **Shift+5**: Wheat Seed (20 coins)
      - **Shift+6**: Apple Tree Seed (50 coins)
      - **7**: Sprinkler Kit (100 coins) / **Shift+7**: Fishing Rod (150 coins)
      - **Shift+B**: Scarecrow Kit (50 coins)
      - **Shift+L**: Shed Kit (250 coins)
      - **Shift+V**: Chest Kit (150 coins)
      - **8**: Hoe (50 coins) / **Shift+8**: Copper Hoe (200 coins)
      - **9**: Watering Can (50 coins) / **Shift+9**: Copper Watering Can (200 coins)
      - **0**: Axe (50 coins) / **Shift+0**: Copper Axe (200 coins)
      - **-**: Pickaxe (50 coins) / **Shift+-**: Copper Pickaxe (200 coins)
    - **Merchant Compass:** A UI element shows the distance and direction to the merchant when you are far from (0,0).
8. **Inventory:** Harvested crops, collected animal products, and seeds are added to the player's inventory, which is visible in the UI.
9. **Economy:** Players earn coins by selling crops to the merchant and spend them to buy seeds.
7. **Observation:** Watching the world slowly change over days and weeks.
6. **Social:** Coming across other players' farms and observing their progress.

---

## 4. System Architecture

The project is organized as a **TypeScript Monorepo**:

### Backend (`/server`)
- **Node.js & Express:** Hosts the server and handles initial connections.
- **Socket.io:** Manages real-time, bidirectional communication.
- **Game Engine:** Handles the "tick" logic for plants and animals.
- **World Manager:** Manages chunk state and entity persistence.

### Frontend (`/client`)
- **React:** Manages the UI overlay, menus, and application state.
- **PixiJS:** A high-performance 2D WebGL renderer used to draw the hex grid and sprites.
- **Socket.io-Client:** Listens for updates from the server and sends player actions.

### Common (`/common`)
- **Shared Types:** TypeScript interfaces for `Player`, `Plant`, `Animal`, and `Position` to ensure consistency between client and server.
- **Hex Math:** Utilities for axial-to-pixel conversion and neighbor detection.

---

## 5. Future Vision (What it Should Be)

### Environmental Depth
- **Seasons:** A 4-season cycle (Real-time, 7 game days per season) that changes the visual aesthetic of the world (e.g., snow in winter, orange leaves in autumn).
- **Weather:** Dynamic weather system including Sunny, Rainy, and Cloudy days. Rain automatically waters all plants.

### Expanded Gameplay
- **Economy:** A decentralized trading system where players can trade harvested crops for rare seeds or decorative items.
- **Animal Husbandry:** Breeding and caring for various animals that provide resources.
- **Tool Upgrades:** Progression system for better watering cans, hoes, and specialized farming equipment.

### Visual & Technical Polish
- **Pixel Art Sprites:** Replacing colored hexes with high-quality pixel art for all entities.
- **Day/Night Cycle:** Dynamic lighting that follows a compressed game-time cycle (24 minutes per day).
- **Smooth Animations:** Continuous interpolation for player and animal movement.
- **Persistence:** A robust database (e.g., MongoDB or PostgreSQL) to store the state of millions of hexes across the infinite world.

## 7. TODO / Roadmap

### High Priority
- [x] **Persistence:** Basic file-based persistence for players, plants, fences, and animals.
- [x] **Harvesting:** Allow players to harvest mature plants and gain resources.
- [x] **Inventory System:** Basic UI to show gathered resources and available seeds.
- [x] **Animal Spawning:** Deterministic spawning of cows, sheep, chickens, and pigs in the procedural world.
- [x] **Animal Products:** Collect resources (milk, wool, eggs, truffles) from animals by interacting with them.
- [x] **Multiple Crops:** Support for different plant species (Turnip, Carrot, Pumpkin, Corn, Wheat) with unique growth durations.
- [x] **Seasons & Weather:** Implement the real-time seasonal cycle and dynamic weather (rain waters plants).
- [x] **Day/Night Cycle:** Visual representation of time of day with light/dark overlays.
- [x] **Login System:** Player name login to enable persistence across sessions.

### Medium Priority
- [x] **Infrastructure:** Building and removing fences and paths.
- [x] **Smooth Animations:** Continuous interpolation for player and animal movement, and swaying/bouncing effects for plants/animals.
- [x] **Automation:** Sprinklers to automate watering.
- [x] **UI/UX:** Merchant Compass to help players find the origin.
- [x] **Terrain Variety:** Procedural generation of grass, flowers, and sunflowers.
- [x] **Seasonal Visuals:** Dynamic color changes for trees and terrain based on the current season.
- [x] **Advanced Infrastructure:** Building farm buildings like the Shed and Chest.
- [ ] **Better Graphics:** Replace colored hexes with actual pixel art sprites. (Ongoing: improved PixiJS shapes, shading, and animal details)
- [ ] **Sound & Music:** Add relaxing ambient sounds and a gentle soundtrack.
- [x] **World Persistence Scaling:** Implement chunk unloading on the server to handle millions of hexes efficiently.
- [x] **More Animals:** Add more species with unique behaviors (e.g., chickens).
- [x] **Economy:** Merchant system at (0,0), currency (coins), and seed/kit/tool purchasing.
- [x] **Land Preparation:** Plowing (tilled soil) mechanic.
- [x] **UX:** In-game notifications for actions and errors.
- [x] **Tool Requirements:** Plowing, watering, and clearing now require specific tools.
- [x] **Obstacle Removal:** Players can clear trees and rocks using axes and pickaxes. Gathers wood and stone.
- [x] **Water & Fishing:** Procedural water generation and fishing mechanics.

### Long Term
- [ ] **Trading:** A system for players to exchange resources.
- [x] **Tools & Upgrades:** Copper tools (Hoe, Watering Can, Axe, Pickaxe) with enhanced efficiency, and Fishing Rod.
- [x] **Fruit Trees:** Apple trees that can be harvested once a day.
- [x] **Storage:** Chests to store items.
- [ ] **Animal Breeding:** Mechanism for animals to reproduce.
- [ ] **Purchasable Items:** Spend coins on more than just seeds (tools, decorations) from the merchant.
- [ ] **Expanded Buildings:** More variety in farm buildings with functional uses.

---

## 6. Nuances and Design Philosophy

- **Patience as Gameplay:** Unlike many modern games, HexFarm rewards patience rather than "grinding."
- **Shared Space:** The "MMO" aspect isn't about combat; it's about the shared experience of inhabiting a living, growing world.
- **Deterministic Generation:** Every rock and tree is where it is because of the seed, allowing for a consistent world without needing to store every single static tile in a database.
