import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { WorldManager } from './WorldManager.js';
import { GameEngine } from './GameEngine.js';
import type { Player, Position, Plant } from 'common';

const app = express();
const httpServer = createServer(app);
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
      inventory: {}
    };
    players.set(socket.id, player);
    world.addEntity(player);
    socket.emit('init', { playerId: socket.id, worldSeed: "mmo-seed" });
    io.emit('entityUpdate', player);
  });

  socket.on('move', (pos: Position) => {
    const player = players.get(socket.id);
    if (player) {
      const entities = world.getEntitiesAt(pos.q, pos.r);
      const isBlocked = entities.some(e => e.type === 'obstacle');
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

  socket.on('harvest', () => {
    const player = players.get(socket.id);
    if (player) {
      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const plant = entities.find(e => e.type === 'plant') as Plant | undefined;
      if (plant && plant.growthStage >= 5) {
        world.removeEntity(plant.id, plant.pos.q, plant.pos.r);
        const species = plant.species || 'unknown';
        player.inventory[species] = (player.inventory[species] || 0) + 1;

        io.emit('entityRemove', { id: plant.id, pos: plant.pos });
        socket.emit('entityUpdate', player); // Update player inventory on client
      }
    }
  });

  socket.on('plant', () => {
    const player = players.get(socket.id);
    if (player) {
      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const isOccupied = entities.some(e => e.type !== 'player');
      if (!isOccupied) {
        const now = Date.now();
        const speciesList = ['turnip', 'carrot', 'pumpkin'];
        const species = speciesList[Math.floor(Math.random() * speciesList.length)];
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
        io.emit('entityUpdate', plant);
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
  const updatedEntities = engine.tick();
  updatedEntities.forEach(entity => {
    io.emit('entityUpdate', entity);
  });
}, 1000);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
