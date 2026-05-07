# HexFarm MMO

HexFarm is a scalable, slow-paced MMO set on an infinite hexagonal grid. It draws inspiration from the tranquil atmosphere of Harvest Moon 64, focusing on the growth of plants and the gentle movement of animals in a procedurally generated world.

## Core Mechanics

### 1. Infinite Procedural World
- The world is generated on-the-fly using seed-based noise.
- Features include diverse terrain, trees, rocks, and water (hex-based).
- Chunks are loaded and unloaded as players move through the world.

### 2. Slow-Paced Growth
- **Plants:** Real-time growth cycles. Common crops take days to weeks to reach maturity.
- **Trees:** Massive, long-term investments. A fruit tree can take up to a full year in real-time to reach its final stage.
- **Care:** Plants require watering to grow at their full potential. Neglect might slow growth but won't necessarily kill the plant (to maintain the "slow-paced" vibe).

### 3. Hexagonal Grid
- All entities (players, plants, animals, obstacles) occupy axial coordinates (q, r).
- Movement and interaction are governed by hex-grid math.

### 4. Shared MMO Experience
- Players can see each other and interact with the same world.
- While there is no central town, the presence of other players' farms creates a decentralized community.

### 5. Pixel Art Aesthetic
- Top-down 2D pixel-art style.
- Visuals change based on growth stages and time of day (future feature).

## Technical Architecture

### Backend (Node.js/TypeScript)
- **Express & Socket.io:** For real-time communication.
- **Chunk-based State Management:** Entities are stored and managed in chunks for scalability.
- **Procedural Generation:** Deterministic generation using Simplex noise.

### Frontend (React/PixiJS)
- **PixiJS:** High-performance rendering engine for the hex grid and pixel art.
- **React:** UI overlay and state management.
- **Socket.io-Client:** Real-time updates from the server.

### Common
- Shared types and hex-math utilities used by both frontend and backend.
