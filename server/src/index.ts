import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorldManager } from './WorldManager.js';
import { GameEngine } from './GameEngine.js';
import { distance } from 'common';
import type { Player, Position, Plant } from 'common';

const app = express();
const httpServer = createServer(app);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  }
});

const world = new WorldManager("mmo-seed");
const engine = new GameEngine(world);

const players: Map<string, Player> = new Map();

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  socket.on('join', (name: string) => {
    const player: Player = {
      id: socket.id,
      type: 'player',
      name,
      pos: { q: 0, r: 0 },
      inventory: {
        'turnip-seed': 5,
        'carrot-seed': 2,
        'pumpkin-seed': 1
      },
      coins: 0
    };
    players.set(socket.id, player);
    world.addEntity(player);

    const { environment } = engine.tick(); // Just to get current state
    socket.emit('init', { playerId: socket.id, worldSeed: "mmo-seed" });
    socket.emit('environmentUpdate', environment);
    io.emit('entityUpdate', player);
  });

  socket.on('move', (pos: Position) => {
    const player = players.get(socket.id);
    if (player) {
      const d = distance(player.pos, pos);
      if (d !== 1) {
        socket.emit('entityUpdate', player);
        return;
      }

      const entities = world.getEntitiesAt(pos.q, pos.r);
      const isBlocked = entities.some(e => e.type === 'obstacle' || e.type === 'animal' || e.type === 'fence');
      if (!isBlocked) {
        world.removeEntity(player.id, player.pos.q, player.pos.r);
        player.pos = pos;
        world.addEntity(player);
        io.emit('entityUpdate', player);
      } else {
        socket.emit('entityUpdate', player); // Send back original position
      }
    }
  });

  socket.on('build_fence', () => {
    const player = players.get(socket.id);
    if (player) {
      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
      if (!isOccupied) {
        const fence = {
          id: `fence-${player.pos.q}-${player.pos.r}`,
          type: 'fence' as const,
          pos: { ...player.pos }
        };
        world.addEntity(fence);
        io.emit('entityUpdate', fence);
      } else {
        const fence = entities.find(e => e.type === 'fence');
        if (fence) {
          world.removeEntity(fence.id, fence.pos.q, fence.pos.r);
          io.emit('entityRemove', { id: fence.id, pos: fence.pos });
        }
      }
    }
  });

  socket.on('plow', () => {
    const player = players.get(socket.id);
    if (player) {
      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const floor = entities.find(e => e.type === 'floor');
      if (!floor) {
        const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
        if (!isOccupied) {
          const tilled = {
            id: `floor-${player.pos.q}-${player.pos.r}`,
            type: 'floor' as const,
            species: 'tilled',
            pos: { ...player.pos }
          };
          world.addEntity(tilled);
          io.emit('entityUpdate', tilled);
        }
      } else {
        const isOccupiedByPlant = entities.some(e => e.type === 'plant');
        if (!isOccupiedByPlant) {
          world.removeEntity(floor.id, floor.pos.q, floor.pos.r);
          io.emit('entityRemove', { id: floor.id, pos: floor.pos });
        }
      }
    }
  });

  socket.on('harvest', () => {
    const player = players.get(socket.id);
    if (player) {
      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const plant = entities.find(e => e.type === 'plant') as Plant | undefined;
      if (plant && plant.growthStage >= 5) {
        world.removeEntity(plant.id, plant.pos.q, plant.pos.r);
        const species = plant.species || 'unknown';

        // Give crop
        player.inventory[species] = (player.inventory[species] || 0) + 1;

        // Chance to give 1-2 seeds
        const seedType = `${species}-seed`;
        const seedsGained = Math.floor(Math.random() * 2) + 1;
        player.inventory[seedType] = (player.inventory[seedType] || 0) + seedsGained;

        io.emit('entityRemove', { id: plant.id, pos: plant.pos });
        socket.emit('entityUpdate', player); // Update player inventory on client
      }
    }
  });

  socket.on('plant', (species: string) => {
    const player = players.get(socket.id);
    if (player) {
      const seedType = `${species}-seed`;
      if (!player.inventory[seedType] || player.inventory[seedType] <= 0) {
        return;
      }

      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const hasTilledSoil = entities.some(e => e.type === 'floor' && e.species === 'tilled');
      const isOccupiedByOther = entities.some(e => e.type !== 'player' && e.type !== 'floor');

      if (hasTilledSoil && !isOccupiedByOther) {
        player.inventory[seedType]--;

        const now = Date.now();
        const plant: Plant = {
          id: `plant-${player.pos.q}-${player.pos.r}-${now}`,
          type: 'plant',
          species,
          pos: { ...player.pos },
          growthStage: 0,
          plantedAt: now,
          lastWatered: 0,
          lastUpdate: now
        };
        world.addEntity(plant);
        io.emit('entityUpdate', plant);
        socket.emit('entityUpdate', player);
      }
    }
  });

  socket.on('water', () => {
    const player = players.get(socket.id);
    if (player) {
      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const plant = entities.find(e => e.type === 'plant') as Plant | undefined;
      if (plant) {
        plant.lastWatered = Date.now();
        world.updateEntity(plant);
        io.emit('entityUpdate', plant);
      }
    }
  });

  socket.on('interact', () => {
    const player = players.get(socket.id);
    if (player) {
      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const animal = entities.find(e => e.type === 'animal') as any;
      if (animal) {
        if (animal.species === 'merchant') {
          // Sell crops
          const prices: Record<string, number> = { 'turnip': 10, 'carrot': 25, 'pumpkin': 50 };
          let earned = 0;
          Object.keys(prices).forEach(crop => {
            if (player.inventory[crop] > 0) {
              earned += player.inventory[crop] * prices[crop];
              player.inventory[crop] = 0;
            }
          });
          if (earned > 0) {
            player.coins += earned;
            socket.emit('entityUpdate', player);
          }
          return;
        }

        const now = Date.now();
        const GAME_DAY = 24 * 60 * 1000;
        if (now - animal.lastProductTime >= GAME_DAY) {
          let product = '';
          if (animal.species === 'cow') product = 'milk';
          else if (animal.species === 'sheep') product = 'wool';
          else if (animal.species === 'chicken') product = 'egg';

          if (product) {
            player.inventory[product] = (player.inventory[product] || 0) + 1;
            animal.lastProductTime = now;
            world.updateEntity(animal);
            socket.emit('entityUpdate', player);
            io.emit('entityUpdate', animal);
          }
        }
      }
    }
  });

  socket.on('requestChunks', (coords: {cq: number, cr: number}[]) => {
    const chunks = coords.map(c => world.getChunk(c.cq, c.cr));
    socket.emit('chunks', chunks);
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      world.removeEntity(player.id, player.pos.q, player.pos.r);
      players.delete(socket.id);
      io.emit('entityRemove', { id: socket.id, pos: player.pos });
    }
  });
});

// Real game loop
setInterval(() => {
  const { updatedEntities, environment, environmentChanged } = engine.tick();
  updatedEntities.forEach(entity => {
    io.emit('entityUpdate', entity);
  });
  if (environmentChanged) {
    io.emit('environmentUpdate', environment);
  }
}, 1000);

// Cleanup inactive chunks every minute
setInterval(() => {
  world.cleanupChunks(Array.from(players.values()));
}, 60000);

app.use(express.static(path.join(__dirname, '../../client/dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
