import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorldManager } from './WorldManager.js';
import { GameEngine } from './GameEngine.js';
import { distance, GAME_DAY, getNeighbors } from 'common';
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
        'pumpkin-seed': 1,
        'hoe': 1,
        'watering-can': 1,
        'axe': 1,
        'pickaxe': 1
      },
      coins: 0
    };
    players.set(socket.id, player);
    world.addEntity(player);

    const { environment } = engine.tick(); // Just to get current state
    socket.emit('init', { playerId: socket.id, worldSeed: "mmo-seed" });
    socket.emit('environmentUpdate', environment);
    io.emit('entityUpdate', player);
    socket.emit('notification', { message: `Welcome to HexFarm, ${name}!`, type: 'info' });
  });

  const notify = (socketId: string, message: string, type: 'info' | 'success' | 'error' = 'info') => {
    io.to(socketId).emit('notification', { message, type });
  };

  socket.on('move', (pos: Position) => {
    const player = players.get(socket.id);
    if (player) {
      const d = distance(player.pos, pos);
      if (d !== 1) {
        socket.emit('entityUpdate', player);
        return;
      }

      const entities = world.getEntitiesAt(pos.q, pos.r);
      const isBlocked = entities.some(e => e.type === 'obstacle' || e.type === 'fence');
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

  socket.on('buy_tool', (tool: string) => {
    const player = players.get(socket.id);
    if (player) {
      const entities = [
        ...world.getEntitiesAt(player.pos.q, player.pos.r),
        ...getNeighbors(player.pos).flatMap(n => world.getEntitiesAt(n.q, n.r))
      ];
      const isNearMerchant = entities.some(e => e.type === 'animal' && e.species === 'merchant');
      if (isNearMerchant) {
        const toolPrices: Record<string, number> = { 'hoe': 50, 'watering-can': 50, 'axe': 50, 'pickaxe': 50 };
        const price = toolPrices[tool];
        if (price !== undefined) {
          if (player.coins >= price) {
            player.coins -= price;
            player.inventory[tool] = (player.inventory[tool] || 0) + 1;
            socket.emit('entityUpdate', player);
            notify(socket.id, `Bought ${tool} for ${price} coins.`, 'success');
          } else {
            notify(socket.id, `Not enough coins! Need ${price}.`, 'error');
          }
        }
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
      if (!player.inventory['hoe'] || player.inventory['hoe'] <= 0) {
        notify(socket.id, "You need a hoe to plow land!", 'error');
        return;
      }
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
      } else if (floor.species === 'tilled') {
        const isOccupiedByPlant = entities.some(e => e.type === 'plant');
        if (!isOccupiedByPlant) {
          world.removeEntity(floor.id, floor.pos.q, floor.pos.r);
          io.emit('entityRemove', { id: floor.id, pos: floor.pos });
        }
      }
    }
  });

  socket.on('build_path', () => {
    const player = players.get(socket.id);
    if (player) {
      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const floor = entities.find(e => e.type === 'floor');
      if (!floor) {
        const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
        if (!isOccupied) {
          const path = {
            id: `floor-${player.pos.q}-${player.pos.r}`,
            type: 'floor' as const,
            species: 'path',
            pos: { ...player.pos }
          };
          world.addEntity(path);
          io.emit('entityUpdate', path);
        }
      } else if (floor.species === 'path') {
        world.removeEntity(floor.id, floor.pos.q, floor.pos.r);
        io.emit('entityRemove', { id: floor.id, pos: floor.pos });
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

        notify(socket.id, `Harvested ${species}! Gained ${seedsGained} seeds.`, 'success');

        io.emit('entityRemove', { id: plant.id, pos: plant.pos });
        socket.emit('entityUpdate', player); // Update player inventory on client
      } else if (plant) {
        notify(socket.id, "This plant isn't ready yet.", 'info');
      }
    }
  });

  socket.on('plant', (species: string) => {
    const player = players.get(socket.id);
    if (player) {
      const seedType = `${species}-seed`;
      if (!player.inventory[seedType] || player.inventory[seedType] <= 0) {
        notify(socket.id, `You don't have any ${species} seeds!`, 'error');
        return;
      }

      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const hasTilledSoil = entities.some(e => e.type === 'floor' && e.species === 'tilled');
      const isOccupiedByOther = entities.some(e => e.type !== 'player' && e.type !== 'floor');

      if (!hasTilledSoil) {
        notify(socket.id, "You can only plant on tilled soil.", 'info');
        return;
      }
      if (isOccupiedByOther) {
        notify(socket.id, "This spot is occupied.", 'info');
        return;
      }

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
      if (!player.inventory['watering-can'] || player.inventory['watering-can'] <= 0) {
        notify(socket.id, "You need a watering can!", 'error');
        return;
      }
      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const plant = entities.find(e => e.type === 'plant') as Plant | undefined;
      if (plant) {
        plant.lastWatered = Date.now();
        world.updateEntity(plant);
        io.emit('entityUpdate', plant);
      }
    }
  });

  socket.on('buy_seed', (species: string) => {
    const player = players.get(socket.id);
    if (player) {
      const entities = [
        ...world.getEntitiesAt(player.pos.q, player.pos.r),
        ...getNeighbors(player.pos).flatMap(n => world.getEntitiesAt(n.q, n.r))
      ];
      const isNearMerchant = entities.some(e => e.type === 'animal' && e.species === 'merchant');
      if (isNearMerchant) {
        const seedPrices: Record<string, number> = { 'turnip': 5, 'carrot': 15, 'pumpkin': 35 };
        const price = seedPrices[species];
        if (price !== undefined) {
          if (player.coins >= price) {
            player.coins -= price;
            const seedType = `${species}-seed`;
            player.inventory[seedType] = (player.inventory[seedType] || 0) + 1;
            socket.emit('entityUpdate', player);
            notify(socket.id, `Bought ${species} seed for ${price} coins.`, 'success');
          } else {
            notify(socket.id, `Not enough coins! Need ${price}.`, 'error');
          }
        }
      }
    }
  });

  socket.on('buy_sprinkler', () => {
    const player = players.get(socket.id);
    if (player) {
      const entities = [
        ...world.getEntitiesAt(player.pos.q, player.pos.r),
        ...getNeighbors(player.pos).flatMap(n => world.getEntitiesAt(n.q, n.r))
      ];
      const isNearMerchant = entities.some(e => e.type === 'animal' && e.species === 'merchant');
      if (isNearMerchant) {
        const price = 100;
        if (player.coins >= price) {
          player.coins -= price;
          player.inventory['sprinkler-kit'] = (player.inventory['sprinkler-kit'] || 0) + 1;
          socket.emit('entityUpdate', player);
          notify(socket.id, `Bought Sprinkler Kit for ${price} coins.`, 'success');
        } else {
          notify(socket.id, `Not enough coins! Need ${price}.`, 'error');
        }
      }
    }
  });

  socket.on('build_sprinkler', () => {
    const player = players.get(socket.id);
    if (player) {
      if (!player.inventory['sprinkler-kit'] || player.inventory['sprinkler-kit'] <= 0) {
        notify(socket.id, "You don't have any sprinkler kits!", 'error');
        return;
      }

      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
      if (!isOccupied) {
        player.inventory['sprinkler-kit']--;
        const sprinkler = {
          id: `sprinkler-${player.pos.q}-${player.pos.r}`,
          type: 'sprinkler' as const,
          pos: { ...player.pos }
        };
        world.addEntity(sprinkler);
        io.emit('entityUpdate', sprinkler);
        socket.emit('entityUpdate', player);
        notify(socket.id, "Sprinkler installed!", 'success');
      } else {
        notify(socket.id, "This spot is occupied.", 'info');
      }
    }
  });

  socket.on('clear_obstacle', () => {
    const player = players.get(socket.id);
    if (player) {
      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const obstacle = entities.find(e => e.type === 'obstacle');
      if (obstacle) {
        if (obstacle.id.startsWith('tree')) {
          if (!player.inventory['axe'] || player.inventory['axe'] <= 0) {
            notify(socket.id, "You need an axe to cut down trees!", 'error');
            return;
          }
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          notify(socket.id, "Cut down tree.", 'success');
        } else if (obstacle.id.startsWith('rock')) {
          if (!player.inventory['pickaxe'] || player.inventory['pickaxe'] <= 0) {
            notify(socket.id, "You need a pickaxe to break rocks!", 'error');
            return;
          }
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          notify(socket.id, "Broke rock.", 'success');
        }
      } else {
        notify(socket.id, "Nothing to clear here.", 'info');
      }
    }
  });

  socket.on('interact', () => {
    const player = players.get(socket.id);
    if (player) {
      const entities = [
        ...world.getEntitiesAt(player.pos.q, player.pos.r),
        ...getNeighbors(player.pos).flatMap(n => world.getEntitiesAt(n.q, n.r))
      ];
      const animal = entities.find(e => e.type === 'animal') as any;
      if (animal) {
        if (animal.species === 'merchant') {
          // Sell crops and products
          const prices: Record<string, number> = {
            'turnip': 10, 'carrot': 25, 'pumpkin': 50,
            'milk': 20, 'wool': 30, 'egg': 10
          };
          let earned = 0;
          Object.keys(prices).forEach(item => {
            if (player.inventory[item] > 0) {
              earned += player.inventory[item] * prices[item];
              player.inventory[item] = 0;
            }
          });
          if (earned > 0) {
            player.coins += earned;
            socket.emit('entityUpdate', player);
            notify(socket.id, `Sold items for ${earned} coins!`, 'success');
          } else {
            notify(socket.id, "You don't have anything to sell.", 'info');
          }
          return;
        }

        const now = Date.now();
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
            notify(socket.id, `Collected ${product}!`, 'success');
          }
        } else {
            notify(socket.id, "This animal isn't ready to give anything yet.", 'info');
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
