import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorldManager } from './WorldManager.js';
import { GameEngine } from './GameEngine.js';
import { distance, GAME_DAY, getNeighbors } from 'common';
import type { Player, Position, Plant, Building } from 'common';

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
    // Sanitize name to prevent path traversal and other issues
    const sanitizedName = name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    if (!sanitizedName) {
      notify(socket.id, "Invalid name!", 'error');
      return;
    }

    const playerId = `player-${sanitizedName.toLowerCase().replace(/\s+/g, '-')}`;

    // Prevent multiple connections with same name
    for (const p of players.values()) {
        if (p.id === playerId) {
            notify(socket.id, "This player is already logged in!", 'error');
            return;
        }
    }

    // Check if player exists in world manager (persistent)
    let player = world.getPersistentEntity(playerId) as Player;

    if (!player) {
      player = {
        id: playerId,
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
    }

    players.set(socket.id, player);
    world.addEntity(player);

    const { environment } = engine.tick(); // Just to get current state
    socket.emit('init', { playerId: player.id, worldSeed: "mmo-seed" });
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
      const isBlocked = entities.some(e =>
        (e.type === 'obstacle' || e.type === 'fence' || e.type === 'building')
      );
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
        const toolPrices: Record<string, number> = {
          'hoe': 50, 'watering-can': 50, 'axe': 50, 'pickaxe': 50,
          'fishing-rod': 150,
          'copper-hoe': 200, 'copper-watering-can': 200, 'copper-axe': 200, 'copper-pickaxe': 200
        };
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
      const hasCopperHoe = player.inventory['copper-hoe'] > 0;
      if (!hasCopperHoe && (!player.inventory['hoe'] || player.inventory['hoe'] <= 0)) {
        notify(socket.id, "You need a hoe to plow land!", 'error');
        return;
      }

      const targets = hasCopperHoe ? [player.pos, ...getNeighbors(player.pos)] : [player.pos];

      targets.forEach(pos => {
        const entities = world.getEntitiesAt(pos.q, pos.r);
        const floor = entities.find(e => e.type === 'floor');
        const isDecorative = floor && ['grass', 'flower', 'sunflower'].includes(floor.species || '');

        if (!floor || isDecorative) {
          const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
          if (!isOccupied) {
            if (isDecorative) {
              world.removeEntity(floor!.id, floor!.pos.q, floor!.pos.r);
            }
            const tilled = {
              id: `floor-${pos.q}-${pos.r}`,
              type: 'floor' as const,
              species: 'tilled',
              pos: { ...pos }
            };
            world.addEntity(tilled);
            io.emit('entityUpdate', tilled);
          }
        } else if (floor.species === 'tilled') {
          // For copper hoe, we don't want to accidentally un-plow multiple hexes easily?
          // Let's only un-plow the current hex if specifically targeted without copper or if it's the center.
          if (pos.q === player.pos.q && pos.r === player.pos.r) {
            const isOccupiedByPlant = entities.some(e => e.type === 'plant');
            if (!isOccupiedByPlant) {
              world.removeEntity(floor.id, floor.pos.q, floor.pos.r);
              io.emit('entityRemove', { id: floor.id, pos: floor.pos });
            }
          }
        }
      });
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
      const hasCopperWateringCan = player.inventory['copper-watering-can'] > 0;
      if (!hasCopperWateringCan && (!player.inventory['watering-can'] || player.inventory['watering-can'] <= 0)) {
        notify(socket.id, "You need a watering can!", 'error');
        return;
      }

      const targets = hasCopperWateringCan ? [player.pos, ...getNeighbors(player.pos)] : [player.pos];

      targets.forEach(pos => {
        const entities = world.getEntitiesAt(pos.q, pos.r);
        const plant = entities.find(e => e.type === 'plant') as Plant | undefined;
        if (plant) {
          plant.lastWatered = Date.now();
          world.updateEntity(plant);
          io.emit('entityUpdate', plant);
        }
      });
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
        const seedPrices: Record<string, number> = {
          'turnip': 5, 'carrot': 15, 'pumpkin': 35, 'corn': 25, 'wheat': 20,
          'apple-tree': 50
        };
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

  socket.on('buy_kit', (kit: string) => {
    const player = players.get(socket.id);
    if (player) {
      const entities = [
        ...world.getEntitiesAt(player.pos.q, player.pos.r),
        ...getNeighbors(player.pos).flatMap(n => world.getEntitiesAt(n.q, n.r))
      ];
      const isNearMerchant = entities.some(e => e.type === 'animal' && e.species === 'merchant');
      if (isNearMerchant) {
        const kitPrices: Record<string, number> = {
          'sprinkler-kit': 100,
          'scarecrow-kit': 50,
          'shed-kit': 250,
          'chest-kit': 150
        };
        const price = kitPrices[kit];
        if (price !== undefined) {
          if (player.coins >= price) {
            player.coins -= price;
            player.inventory[kit] = (player.inventory[kit] || 0) + 1;
            socket.emit('entityUpdate', player);
            notify(socket.id, `Bought ${kit.replace('-', ' ')} for ${price} coins.`, 'success');
          } else {
            notify(socket.id, `Not enough coins! Need ${price}.`, 'error');
          }
        }
      }
    }
  });

  socket.on('build_scarecrow', () => {
    const player = players.get(socket.id);
    if (player) {
      if (!player.inventory['scarecrow-kit'] || player.inventory['scarecrow-kit'] <= 0) {
        notify(socket.id, "You don't have any scarecrow kits!", 'error');
        return;
      }

      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
      if (!isOccupied) {
        player.inventory['scarecrow-kit']--;
        const scarecrow = {
          id: `scarecrow-${player.pos.q}-${player.pos.r}`,
          type: 'obstacle' as const,
          species: 'scarecrow',
          pos: { ...player.pos }
        };
        world.addEntity(scarecrow);
        io.emit('entityUpdate', scarecrow);
        socket.emit('entityUpdate', player);
        notify(socket.id, "Scarecrow installed!", 'success');
      } else {
        notify(socket.id, "This spot is occupied.", 'info');
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

  socket.on('build_building', (species: string) => {
    const player = players.get(socket.id);
    if (player) {
      const kitType = `${species}-kit`;
      if (!player.inventory[kitType] || player.inventory[kitType] <= 0) {
        notify(socket.id, `You don't have any ${species} kits!`, 'error');
        return;
      }

      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
      if (!isOccupied) {
        player.inventory[kitType]--;
        const building: Building = {
          id: `${species}-${player.pos.q}-${player.pos.r}`,
          type: 'building' as const,
          species,
          pos: { ...player.pos },
          inventory: species === 'chest' ? {} : undefined
        };
        world.addEntity(building);
        io.emit('entityUpdate', building);
        socket.emit('entityUpdate', player);
        notify(socket.id, `${species.charAt(0).toUpperCase() + species.slice(1)} built!`, 'success');
      } else {
        notify(socket.id, "This spot is occupied.", 'info');
      }
    }
  });

  socket.on('clear_obstacle', () => {
    const player = players.get(socket.id);
    if (player) {
      const targets = [player.pos, ...getNeighbors(player.pos)];
      let obstacle = null;
      for (const pos of targets) {
        const entities = world.getEntitiesAt(pos.q, pos.r);
        obstacle = entities.find(e => e.type === 'obstacle' && e.species !== 'water');
        if (obstacle) break;
      }

      if (obstacle) {
        if (obstacle.species === 'tree' || (!obstacle.species && obstacle.id.startsWith('tree'))) {
          const hasCopperAxe = player.inventory['copper-axe'] > 0;
          if (!hasCopperAxe && (!player.inventory['axe'] || player.inventory['axe'] <= 0)) {
            notify(socket.id, "You need an axe to cut down trees!", 'error');
            return;
          }
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          const amount = hasCopperAxe ? 2 : 1;
          player.inventory['wood'] = (player.inventory['wood'] || 0) + amount;
          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);
          notify(socket.id, `Cut down tree. Gained ${amount} wood.`, 'success');
        } else if (obstacle.species === 'rock' || (!obstacle.species && obstacle.id.startsWith('rock'))) {
          const hasCopperPickaxe = player.inventory['copper-pickaxe'] > 0;
          if (!hasCopperPickaxe && (!player.inventory['pickaxe'] || player.inventory['pickaxe'] <= 0)) {
            notify(socket.id, "You need a pickaxe to break rocks!", 'error');
            return;
          }
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          const amount = hasCopperPickaxe ? 2 : 1;
          player.inventory['stone'] = (player.inventory['stone'] || 0) + amount;
          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);
          notify(socket.id, `Broke rock. Gained ${amount} stone.`, 'success');
        } else if (obstacle.species === 'scarecrow') {
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          player.inventory['scarecrow-kit'] = (player.inventory['scarecrow-kit'] || 0) + 1;
          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);
          notify(socket.id, "Removed scarecrow.", 'success');
        }
      } else {
        // Also check for buildings
        let building = null;
        for (const pos of targets) {
          const entities = world.getEntitiesAt(pos.q, pos.r);
          building = entities.find(e => e.type === 'building');
          if (building) break;
        }
        if (building) {
          world.removeEntity(building.id, building.pos.q, building.pos.r);
          const kitType = `${building.species}-kit`;
          player.inventory[kitType] = (player.inventory[kitType] || 0) + 1;
          io.emit('entityRemove', { id: building.id, pos: building.pos });
          socket.emit('entityUpdate', player);
          notify(socket.id, `Removed ${building.species}.`, 'success');
          return;
        }

        // If no breakable obstacle found, check if there's water in the current hex to give the specific message
        const currentEntities = world.getEntitiesAt(player.pos.q, player.pos.r);
        if (currentEntities.some(e => e.type === 'obstacle' && e.species === 'water')) {
            notify(socket.id, "You can't clear water!", 'info');
        } else {
            notify(socket.id, "Nothing to clear here.", 'info');
        }
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
      // Prioritize merchant if nearby
      const merchant = entities.find(e => e.type === 'animal' && e.species === 'merchant') as any;
      const animal = merchant || entities.find(e => e.type === 'animal') as any;
      const plant = entities.find(e => e.type === 'plant') as Plant | undefined;
      const building = entities.find(e => e.type === 'building') as Building | undefined;

      if (building && building.species === 'chest') {
        const buildingInv = building.inventory || {};
        const playerInv = player.inventory;
        const categoriesToStore = ['turnip', 'carrot', 'pumpkin', 'corn', 'wheat', 'apple', 'milk', 'wool', 'egg', 'truffle', 'wood', 'stone', 'fish', 'junk'];

        let hasAnythingToStore = false;
        categoriesToStore.forEach(item => {
            if (playerInv[item] > 0) {
                buildingInv[item] = (buildingInv[item] || 0) + playerInv[item];
                playerInv[item] = 0;
                hasAnythingToStore = true;
            }
        });

        if (hasAnythingToStore) {
            building.inventory = buildingInv;
            world.updateEntity(building);
            socket.emit('entityUpdate', player);
            io.emit('entityUpdate', building);
            notify(socket.id, "Deposited items into chest.", 'success');
        } else {
            // If nothing to store, take everything out
            let hasAnythingToTake = false;
            Object.entries(buildingInv).forEach(([item, count]) => {
                if (count > 0) {
                    playerInv[item] = (playerInv[item] || 0) + count;
                    buildingInv[item] = 0;
                    hasAnythingToTake = true;
                }
            });

            if (hasAnythingToTake) {
                building.inventory = buildingInv;
                world.updateEntity(building);
                socket.emit('entityUpdate', player);
                io.emit('entityUpdate', building);
                notify(socket.id, "Withdrew items from chest.", 'success');
            } else {
                notify(socket.id, "The chest is empty.", 'info');
            }
        }
        return;
      }

      if (plant && plant.species === 'apple-tree' && plant.growthStage >= 5) {
        const now = Date.now();
        if (now - (plant.lastProductTime || 0) >= GAME_DAY) {
            player.inventory['apple'] = (player.inventory['apple'] || 0) + 1;
            plant.lastProductTime = now;
            world.updateEntity(plant);
            socket.emit('entityUpdate', player);
            io.emit('entityUpdate', plant);
            notify(socket.id, "Harvested an apple from the tree!", 'success');
        } else {
            notify(socket.id, "This tree doesn't have any ripe apples yet.", 'info');
        }
        return;
      }

      if (animal) {
        if (animal.species === 'merchant') {
          // Sell crops and products
          const prices: Record<string, number> = {
            'turnip': 10, 'carrot': 25, 'pumpkin': 50, 'corn': 35, 'wheat': 30,
            'apple': 15,
            'milk': 20, 'wool': 30, 'egg': 10, 'truffle': 60,
            'wood': 5, 'stone': 5, 'fish': 40, 'junk': 2
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
          else if (animal.species === 'pig') product = 'truffle';

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

  socket.on('fish', () => {
    const player = players.get(socket.id);
    if (player) {
      if (!player.inventory['fishing-rod'] || player.inventory['fishing-rod'] <= 0) {
        notify(socket.id, "You need a fishing rod!", 'error');
        return;
      }

      const neighbors = getNeighbors(player.pos);
      const isNearWater = neighbors.some(n =>
        world.getEntitiesAt(n.q, n.r).some(e => e.type === 'obstacle' && e.species === 'water')
      );

      if (!isNearWater) {
        notify(socket.id, "You need to be near water to fish!", 'info');
        return;
      }

      const rand = Math.random();
      if (rand < 0.3) {
        player.inventory['fish'] = (player.inventory['fish'] || 0) + 1;
        notify(socket.id, "You caught a fish!", 'success');
      } else if (rand < 0.6) {
        player.inventory['junk'] = (player.inventory['junk'] || 0) + 1;
        notify(socket.id, "You caught some junk...", 'info');
      } else {
        notify(socket.id, "Nothing's biting.", 'info');
      }
      socket.emit('entityUpdate', player);
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
      // We don't remove persistent players, but we remove them from the active chunks
      players.delete(socket.id);
      io.emit('entityRemove', { id: player.id, pos: player.pos });
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
