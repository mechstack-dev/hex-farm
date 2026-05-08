# HexFarm MMO

HexFarm is a scalable, slow-paced MMO set on an infinite hexagonal grid. It draws inspiration from the tranquil atmosphere of Harvest Moon 64, focusing on the growth of plants and the gentle movement of animals in a procedurally generated world.

## 1. Current State of the Game

### Procedural World Generation
- The world is generated on-the-fly using **Simplex noise** for terrain and obstacle placement.
- **Chunking System:** The world is divided into 16x16 hex chunks (defined by `CHUNK_SIZE` in `common/src/types.ts`). Chunks are loaded and unloaded dynamically as players move.
- **Static Entities:** Trees and rocks are generated deterministically based on chunk coordinates and a global seed.

### Navigation and Interaction
- **Hexagonal Grid:** Uses axial coordinates (q, r) for all positions.
- **Movement:** Players can move in 6 directions using WASD or Arrow keys.
- **Real-time Synchronization:** Socket.io is used to sync player positions and entity states across all clients.
- **Collision Detection:** Players cannot walk through static obstacles like trees and rocks.

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
Players join by entering a name and are spawned at the origin (0, 0) or their last saved position.

### Movement
Using **WASD** or **Arrow Keys**, players navigate the grid. The camera follows the player, and new chunks are requested from the server as the player approaches unexplored territory.

### Farming (Current)
1. **Planting:** Players can plant specific seeds on empty hexes by pressing **1** (Turnip), **2** (Carrot), or **3** (Pumpkin).
2. **Care:** Pressing **I** waters the plant at the player's current position, doubling its growth rate for 24 hours. A blue indicator appears on watered plants.
3. **Harvesting:** Pressing **H** harvests a mature plant (at its final growth stage) at the player's current position. Harvesting grants the crop and a chance for new seeds.
4. **Building:** Pressing **F** builds or removes a fence at the player's current position. Fences block movement.
5. **Inventory:** Harvested crops and seeds are added to the player's inventory, which is visible in the UI.
5. **Observation:** Watching the world slowly change over days and weeks.
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
- [x] **Persistence:** Basic file-based persistence for plants and fences.
- [x] **Harvesting:** Allow players to harvest mature plants and gain resources.
- [x] **Inventory System:** Basic UI to show gathered resources and available seeds.
- [x] **Animal Spawning:** Deterministic spawning of cows and sheep in the procedural world.
- [x] **Multiple Crops:** Support for different plant species with unique growth durations.
- [x] **Seasons & Weather:** Implement the real-time seasonal cycle and dynamic weather (rain waters plants).
- [x] **Day/Night Cycle:** Visual representation of time of day with light/dark overlays.

### Medium Priority
- [x] **Infrastructure:** Building and removing fences.
- [x] **Smooth Animations:** Continuous interpolation for player and animal movement.
- [ ] **Better Graphics:** Replace colored hexes with actual pixel art sprites.
- [ ] **Sound & Music:** Add relaxing ambient sounds and a gentle soundtrack.
- [x] **World Persistence Scaling:** Implement chunk unloading on the server to handle millions of hexes efficiently.
- [x] **More Animals:** Add more species with unique behaviors (e.g., chickens).

### Long Term
- [ ] **Trading:** A system for players to exchange resources.
- [ ] **Tools & Upgrades:** Specialized equipment for better farming efficiency.
- [ ] **Advanced Infrastructure:** Building paths and simple farm buildings.

---

## 6. Nuances and Design Philosophy

- **Patience as Gameplay:** Unlike many modern games, HexFarm rewards patience rather than "grinding."
- **Shared Space:** The "MMO" aspect isn't about combat; it's about the shared experience of inhabiting a living, growing world.
- **Deterministic Generation:** Every rock and tree is where it is because of the seed, allowing for a consistent world without needing to store every single static tile in a database.
