import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorldManager } from './WorldManager.js';
import { GameEngine } from './GameEngine.js';
import { distance, GAME_DAY, getNeighbors, BUILDING_COSTS } from 'common';
import type { Player, Position, Plant, Building } from 'common';
import { addXP, getStaminaCost } from './logic/SkillLogic.js';

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
        coins: 0,
        stamina: 100,
        maxStamina: 100,
        skills: {
          'farming': { level: 1, xp: 0 },
          'foraging': { level: 1, xp: 0 },
          'mining': { level: 1, xp: 0 },
          'fishing': { level: 1, xp: 0 },
          'cooking': { level: 1, xp: 0 }
        },
        buffs: [],
        achievements: [],
        stats: {}
      };
    }

    // Migration for existing players
    if (player.stamina === undefined) player.stamina = 100;
    if (player.maxStamina === undefined) player.maxStamina = 100;
    if (!player.skills) {
      player.skills = {
        'farming': { level: 1, xp: 0 },
        'foraging': { level: 1, xp: 0 },
        'mining': { level: 1, xp: 0 },
        'fishing': { level: 1, xp: 0 },
        'cooking': { level: 1, xp: 0 }
      };
    }
    if (!player.buffs) player.buffs = [];
    if (!player.achievements) player.achievements = [];
    if (!player.stats) player.stats = {};

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

  const checkAchievements = (player: Player) => {
      const achievementsList = [
          { id: 'first_harvest', name: 'First Harvest', condition: (p: Player) => (p.stats['harvested_total'] || 0) >= 1 },
          { id: 'green_thumb', name: 'Green Thumb', condition: (p: Player) => (p.skills['farming']?.level || 1) >= 5 },
          { id: 'master_farmer', name: 'Master Farmer', condition: (p: Player) => (p.skills['farming']?.level || 1) >= 10 },
          { id: 'rich', name: 'Getting Rich', condition: (p: Player) => p.coins >= 1000 },
          { id: 'millionaire', name: 'Hex-Millionaire', condition: (p: Player) => p.coins >= 10000 },
          { id: 'fisherman', name: 'Fisherman', condition: (p: Player) => (p.stats['fish_caught'] || 0) >= 10 },
          { id: 'chef', name: 'Master Chef', condition: (p: Player) => (p.stats['meals_cooked'] || 0) >= 10 },
          { id: 'explorer', name: 'World Explorer', condition: (p: Player) => (Math.abs(p.pos.q) + Math.abs(p.pos.r)) >= 100 },
      ];

      achievementsList.forEach(ach => {
          if (!player.achievements.includes(ach.id) && ach.condition(player)) {
              player.achievements.push(ach.id);
              notify(socket.id, `Achievement Unlocked: ${ach.name}!`, 'success');
              io.emit('chat', {
                sender: 'System',
                senderId: 'system',
                message: `${player.name} unlocked achievement: ${ach.name}!`,
                timestamp: Date.now()
              });
              socket.emit('entityUpdate', player);
          }
      });
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
        checkAchievements(player);
      } else {
        socket.emit('entityUpdate', player); // Send back original position
      }
    }
  });

  const hasStamina = (player: Player, amount: number) => {
    if (player.stamina < amount) {
      notify(socket.id, "You're too tired!", 'error');
      return false;
    }
    return true;
  };

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
          'fishing-rod': 150
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
      const sCost = getStaminaCost(player, 'farming', 5);
      if (!hasStamina(player, sCost)) return;
      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
      if (!isOccupied) {
        if ((player.inventory['wood'] || 0) < 2) {
          notify(socket.id, "Need 2 wood to build a fence!", 'error');
          return;
        }
        player.inventory['wood'] -= 2;
        player.stamina -= sCost;
        const fence = {
          id: `fence-${player.pos.q}-${player.pos.r}`,
          type: 'fence' as const,
          pos: { ...player.pos }
        };
        world.addEntity(fence);
        io.emit('entityUpdate', fence);
        socket.emit('entityUpdate', player);
      } else {
        const fence = entities.find(e => e.type === 'fence');
        if (fence) {
          player.stamina -= sCost;
          world.removeEntity(fence.id, fence.pos.q, fence.pos.r);
          player.inventory['wood'] = (player.inventory['wood'] || 0) + 2;
          io.emit('entityRemove', { id: fence.id, pos: fence.pos });
          socket.emit('entityUpdate', player);
        }
      }
    }
  });

  socket.on('plow', () => {
    const player = players.get(socket.id);
    if (player) {
      const sCost = getStaminaCost(player, 'farming', 5);
      if (!hasStamina(player, sCost)) return;
      const hasCopperHoe = player.inventory['copper-hoe'] > 0;
      if (!hasCopperHoe && (!player.inventory['hoe'] || player.inventory['hoe'] <= 0)) {
        notify(socket.id, "You need a hoe to plow land!", 'error');
        return;
      }

      const targets = hasCopperHoe ? [player.pos, ...getNeighbors(player.pos)] : [player.pos];
      let success = false;

      targets.forEach(pos => {
        const entities = world.getEntitiesAt(pos.q, pos.r);
        const floor = entities.find(e => e.type === 'floor');
        const isDecorative = floor && ['grass', 'flower', 'sunflower'].includes(floor.species || '');

        if (!floor || isDecorative) {
          const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
          if (!isOccupied) {
            if (isDecorative) {
              world.removeEntity(floor!.id, floor!.pos.q, floor!.pos.r);
              // Scavenging logic
              const rand = Math.random();
              if (rand < 0.05) {
                  const seeds = ['turnip-seed', 'carrot-seed', 'pumpkin-seed', 'corn-seed', 'wheat-seed'];
                  const seed = seeds[Math.floor(Math.random() * seeds.length)];
                  player.inventory[seed] = (player.inventory[seed] || 0) + 1;
                  notify(socket.id, `Scavenged a ${seed.replace('-seed', '')} seed!`, 'success');
              } else if (rand < 0.1) {
                  const coins = 1 + Math.floor(Math.random() * 5);
                  player.coins += coins;
                  notify(socket.id, `Found ${coins} coins in the grass!`, 'success');
              }
            }
            const tilled = {
              id: `floor-${pos.q}-${pos.r}`,
              type: 'floor' as const,
              species: 'tilled',
              pos: { ...pos }
            };
            world.addEntity(tilled);
            io.emit('entityUpdate', tilled);
            success = true;
          }
        } else if (floor.species === 'tilled') {
          // For copper hoe, we don't want to accidentally un-plow multiple hexes easily?
          // Let's only un-plow the current hex if specifically targeted without copper or if it's the center.
          if (pos.q === player.pos.q && pos.r === player.pos.r) {
            const isOccupiedByPlant = entities.some(e => e.type === 'plant');
            if (!isOccupiedByPlant) {
              world.removeEntity(floor.id, floor.pos.q, floor.pos.r);
              io.emit('entityRemove', { id: floor.id, pos: floor.pos });
              success = true;
            }
          }
        }
      });

      if (success) {
        player.stamina -= sCost;
        socket.emit('entityUpdate', player);
      }
    }
  });

  socket.on('build_path', () => {
    const player = players.get(socket.id);
    if (player) {
      const sCost = getStaminaCost(player, 'farming', 2);
      if (!hasStamina(player, sCost)) return;
      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const floor = entities.find(e => e.type === 'floor');
      if (!floor) {
        const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
        if (!isOccupied) {
          if ((player.inventory['stone'] || 0) < 1) {
            notify(socket.id, "Need 1 stone to build a path!", 'error');
            return;
          }
          player.inventory['stone'] -= 1;
          player.stamina -= sCost;
          const path = {
            id: `floor-${player.pos.q}-${player.pos.r}`,
            type: 'floor' as const,
            species: 'path',
            pos: { ...player.pos }
          };
          world.addEntity(path);
          io.emit('entityUpdate', path);
          socket.emit('entityUpdate', player);
        }
      } else if (floor.species === 'path') {
        player.stamina -= sCost;
        world.removeEntity(floor.id, floor.pos.q, floor.pos.r);
        player.inventory['stone'] = (player.inventory['stone'] || 0) + 1;
        io.emit('entityRemove', { id: floor.id, pos: floor.pos });
        socket.emit('entityUpdate', player);
      }
    }
  });

  socket.on('harvest', () => {
    const player = players.get(socket.id);
    if (player) {
      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const plant = entities.find(e => e.type === 'plant') as Plant | undefined;
      if (plant) {
        if (plant.species === 'apple-tree') {
            notify(socket.id, "Use 'E' to gather apples from mature trees. Use an axe to cut them down.", 'info');
            return;
        }
        if (plant.species === 'berry-bush') {
          notify(socket.id, "Use 'E' to gather berries from mature bushes. Use an axe to clear it.", 'info');
          return;
        }

        if (plant.growthStage >= 5) {
          world.removeEntity(plant.id, plant.pos.q, plant.pos.r);
          const species = plant.species || 'unknown';

          // Give crop
          player.inventory[species] = (player.inventory[species] || 0) + 1;
          player.stats['harvested_total'] = (player.stats['harvested_total'] || 0) + 1;

          // XP Gain
          const xpGained = species === 'mushroom' ? 5 : 10;
          const skill = species === 'mushroom' ? 'foraging' : 'farming';
          const { leveledUp, newLevel } = addXP(player, skill, xpGained);
          if (leveledUp) {
            notify(socket.id, `Your ${skill} skill leveled up to ${newLevel}!`, 'success');
            checkAchievements(player);
          }

          // Chance to give 1-2 seeds
          if (species !== 'mushroom') {
            const seedType = `${species}-seed`;
            const seedsGained = Math.floor(Math.random() * 2) + 1;
            player.inventory[seedType] = (player.inventory[seedType] || 0) + seedsGained;
            notify(socket.id, `Harvested ${species}! Gained ${seedsGained} seeds.`, 'success');
          } else {
            notify(socket.id, `Harvested ${species}!`, 'success');
          }

          io.emit('entityRemove', { id: plant.id, pos: plant.pos });
          socket.emit('entityUpdate', player); // Update player inventory on client
          checkAchievements(player);
        } else {
          // Allow removing immature plants
          world.removeEntity(plant.id, plant.pos.q, plant.pos.r);
          io.emit('entityRemove', { id: plant.id, pos: plant.pos });
          notify(socket.id, "Removed immature plant.", 'info');
        }
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

  socket.on('fertilize', () => {
    const player = players.get(socket.id);
    if (player) {
      if (!player.inventory['junk'] || player.inventory['junk'] <= 0) {
        notify(socket.id, "You need junk to fertilize plants!", 'error');
        return;
      }

      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const plant = entities.find(e => e.type === 'plant') as Plant | undefined;
      if (plant) {
        if (plant.growthStage >= 5) {
          notify(socket.id, "This plant is already mature!", 'info');
          return;
        }
        player.inventory['junk']--;
        plant.growthStage = Math.min(5, plant.growthStage + 1);
        world.updateEntity(plant);
        io.emit('entityUpdate', plant);
        socket.emit('entityUpdate', player);
        notify(socket.id, "Fertilized the plant! It grew a bit.", 'success');
      } else {
        notify(socket.id, "No plant here to fertilize.", 'info');
      }
    }
  });

  socket.on('water', () => {
    const player = players.get(socket.id);
    if (player) {
      const sCost = getStaminaCost(player, 'farming', 2);
      if (!hasStamina(player, sCost)) return;
      const hasCopperWateringCan = player.inventory['copper-watering-can'] > 0;
      const entities = [
        ...world.getEntitiesAt(player.pos.q, player.pos.r),
        ...getNeighbors(player.pos).flatMap(n => world.getEntitiesAt(n.q, n.r))
      ];
      const isNearWell = entities.some(e => e.type === 'building' && e.species === 'well');

      if (!isNearWell && !hasCopperWateringCan && (!player.inventory['watering-can'] || player.inventory['watering-can'] <= 0)) {
        notify(socket.id, "You need a watering can or to be near a well!", 'error');
        return;
      }

      const targets = (hasCopperWateringCan || isNearWell) ? [player.pos, ...getNeighbors(player.pos)] : [player.pos];
      let success = false;

      targets.forEach(pos => {
        const entities = world.getEntitiesAt(pos.q, pos.r);
        const plant = entities.find(e => e.type === 'plant') as Plant | undefined;
        if (plant) {
          plant.lastWatered = Date.now();
          world.updateEntity(plant);
          io.emit('entityUpdate', plant);
          success = true;
        }
      });

      if (success) {
        player.stamina -= sCost;
        socket.emit('entityUpdate', player);
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
        const seedPrices: Record<string, number> = {
          'turnip': 5, 'carrot': 15, 'pumpkin': 35, 'corn': 25, 'wheat': 20,
          'winter-radish': 30, 'apple-tree': 50
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
          // Building kits are deprecated in favor of resource crafting
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
      const sCost = getStaminaCost(player, 'farming', 10);
      if (!hasStamina(player, sCost)) return;
      const cost = { wood: 2, stone: 0 };
      if ((player.inventory['wood'] || 0) < cost.wood) {
        notify(socket.id, `Need ${cost.wood} wood to build a scarecrow!`, 'error');
        return;
      }

      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
      if (!isOccupied) {
        player.inventory['wood'] -= cost.wood;
        player.stamina -= sCost;
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
      const sCost = getStaminaCost(player, 'farming', 10);
      if (!hasStamina(player, sCost)) return;
      const cost = { wood: 0, stone: 5 };
      if ((player.inventory['stone'] || 0) < cost.stone) {
        notify(socket.id, `Need ${cost.stone} stone to build a sprinkler!`, 'error');
        return;
      }

      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
      if (!isOccupied) {
        player.inventory['stone'] -= cost.stone;
        player.stamina -= sCost;
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
      const sCost = getStaminaCost(player, 'farming', 20);
      if (!hasStamina(player, sCost)) return;
      const cost = BUILDING_COSTS[species];
      if (!cost) return;

      if ((player.inventory['wood'] || 0) < cost.wood || (player.inventory['stone'] || 0) < cost.stone) {
        notify(socket.id, `Need ${cost.wood} wood and ${cost.stone} stone to build a ${species}!`, 'error');
        return;
      }

      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
      if (!isOccupied) {
        player.inventory['wood'] -= cost.wood;
        player.inventory['stone'] -= cost.stone;
        player.stamina -= sCost;

        const building: Building = {
          id: `${species}-${player.pos.q}-${player.pos.r}`,
          type: 'building' as const,
          species,
          pos: { ...player.pos },
          inventory: (species === 'chest' || species === 'beehive') ? {} : undefined,
          lastProductTime: species === 'beehive' ? Date.now() : undefined
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
      // Find what we're about to clear first to determine the skill and XP
      const targets = [player.pos, ...getNeighbors(player.pos)];
      let obstacle = null;
      for (const pos of targets) {
        const entities = world.getEntitiesAt(pos.q, pos.r);
        obstacle = entities.find(e =>
            (e.type === 'obstacle' && e.species !== 'water') ||
            (e.type === 'plant' && e.species === 'apple-tree') ||
            e.type === 'fence'
        );
        if (obstacle) break;
      }

      const skill = (obstacle && (obstacle.species === 'rock' || (obstacle.id && obstacle.id.startsWith('rock')))) ? 'mining' : 'foraging';
      const sCost = getStaminaCost(player, skill, 10);
      if (!hasStamina(player, sCost)) return;

      if (obstacle) {
        if (obstacle.species === 'tree' || obstacle.species === 'apple-tree' || (!obstacle.species && obstacle.id.startsWith('tree'))) {
          const hasCopperAxe = player.inventory['copper-axe'] > 0;
          if (!hasCopperAxe && (!player.inventory['axe'] || player.inventory['axe'] <= 0)) {
            notify(socket.id, "You need an axe to cut down trees!", 'error');
            return;
          }
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          player.stamina -= sCost;
          const amount = hasCopperAxe ? 2 : 1;
          player.inventory['wood'] = (player.inventory['wood'] || 0) + amount;

          // XP Gain
          const { leveledUp, newLevel } = addXP(player, 'foraging', 15);
          if (leveledUp) notify(socket.id, `Your foraging skill leveled up to ${newLevel}!`, 'success');

          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);
          const name = obstacle.species === 'apple-tree' ? 'apple tree' : 'tree';

          // Discovery Reward
          if (Math.random() < 0.1) {
            const seeds = ['turnip-seed', 'carrot-seed', 'pumpkin-seed', 'corn-seed', 'wheat-seed', 'apple-tree-seed'];
            const seed = seeds[Math.floor(Math.random() * seeds.length)];
            player.inventory[seed] = (player.inventory[seed] || 0) + 1;
            notify(socket.id, `You found a ${seed.replace('-seed', '')} seed in the ${name}!`, 'success');
          }

          notify(socket.id, `Cut down ${name}. Gained ${amount} wood.`, 'success');
        } else if (obstacle.species === 'rock' || (!obstacle.species && obstacle.id.startsWith('rock'))) {
          const hasCopperPickaxe = player.inventory['copper-pickaxe'] > 0;
          if (!hasCopperPickaxe && (!player.inventory['pickaxe'] || player.inventory['pickaxe'] <= 0)) {
            notify(socket.id, "You need a pickaxe to break rocks!", 'error');
            return;
          }
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          player.stamina -= sCost;
          const amount = hasCopperPickaxe ? 2 : 1;
          player.inventory['stone'] = (player.inventory['stone'] || 0) + amount;

          // XP Gain
          const { leveledUp, newLevel } = addXP(player, 'mining', 15);
          if (leveledUp) notify(socket.id, `Your mining skill leveled up to ${newLevel}!`, 'success');

          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);

          // Discovery Reward
          if (Math.random() < 0.05) {
            const coins = 5 + Math.floor(Math.random() * 10);
            player.coins += coins;
            notify(socket.id, `You found ${coins} coins hidden under the rock!`, 'success');
          }

          notify(socket.id, `Broke rock. Gained ${amount} stone.`, 'success');
        } else if (obstacle.species === 'scarecrow') {
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          player.stamina -= sCost;
          player.inventory['wood'] = (player.inventory['wood'] || 0) + 2;
          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);
          notify(socket.id, "Removed scarecrow.", 'success');
        } else if (obstacle.type === 'fence') {
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          player.stamina -= sCost;
          player.inventory['wood'] = (player.inventory['wood'] || 0) + 2;
          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);
          notify(socket.id, "Removed fence.", 'success');
        }
      } else {
        // Check for berry bush or mushroom explicitly if needed via clear
        let plant = null;
        for (const pos of targets) {
            const entities = world.getEntitiesAt(pos.q, pos.r);
            plant = entities.find(e => e.type === 'plant' && (e.species === 'berry-bush' || e.species === 'mushroom'));
            if (plant) break;
        }
        if (plant) {
            world.removeEntity(plant.id, plant.pos.q, plant.pos.r);
            player.stamina -= sCost;
            io.emit('entityRemove', { id: plant.id, pos: plant.pos });
            socket.emit('entityUpdate', player);
            notify(socket.id, `Cleared ${plant.species}.`, 'info');
            return;
        }
        // Also check for buildings
        let building = null;
        for (const pos of targets) {
          const entities = world.getEntitiesAt(pos.q, pos.r);
          building = entities.find(e => e.type === 'building' || e.type === 'sprinkler');
          if (building) break;
        }
        if (building) {
          const species = building.type === 'sprinkler' ? 'sprinkler' : (building.species || '');
          const refund = BUILDING_COSTS[species];
          world.removeEntity(building.id, building.pos.q, building.pos.r);
          player.stamina -= sCost;
          if (refund) {
            player.inventory['wood'] = (player.inventory['wood'] || 0) + refund.wood;
            player.inventory['stone'] = (player.inventory['stone'] || 0) + refund.stone;
          }
          io.emit('entityRemove', { id: building.id, pos: building.pos });
          socket.emit('entityUpdate', player);
          notify(socket.id, `Removed ${species}.`, 'success');
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

  socket.on('sell_junk', () => {
    const player = players.get(socket.id);
    if (player) {
      const entities = [
        ...world.getEntitiesAt(player.pos.q, player.pos.r),
        ...getNeighbors(player.pos).flatMap(n => world.getEntitiesAt(n.q, n.r))
      ];
      const isNearMerchant = entities.some(e => e.type === 'animal' && e.species === 'merchant');
      if (isNearMerchant) {
        const prices: Record<string, number> = { 'wood': 5, 'stone': 5, 'junk': 2 };
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
          notify(socket.id, `Sold resources for ${earned} coins!`, 'success');
        } else {
          notify(socket.id, "You don't have any resources to sell.", 'info');
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
      const blacksmith = entities.find(e => e.type === 'animal' && e.species === 'blacksmith') as any;
      const animal = merchant || blacksmith || entities.find(e => e.type === 'animal') as any;
      const plant = entities.find(e => e.type === 'plant') as Plant | undefined;
      const building = entities.find(e => e.type === 'building') as Building | undefined;

      if (building && building.species === 'cooking-pot') {
          notify(socket.id, "Recipes: Salad (1T,1C), Apple Pie (3A,1W), Pumpkin Soup (1P,1M), Corn Chowder (2C,1M), Grilled Fish (1F,1W). Press numbers in cook menu.", 'info');
          return;
      }

      if (building && (building.species === 'chest' || building.species === 'beehive')) {
        const buildingInv = building.inventory || {};
        const playerInv = player.inventory;

        if (building.species === 'beehive') {
          const honeyCount = buildingInv['honey'] || 0;
          if (honeyCount > 0) {
            playerInv['honey'] = (playerInv['honey'] || 0) + honeyCount;
            buildingInv['honey'] = 0;
            building.inventory = buildingInv;
            world.updateEntity(building);
            socket.emit('entityUpdate', player);
            io.emit('entityUpdate', building);
            notify(socket.id, `Collected ${honeyCount} honey!`, 'success');
          } else {
            notify(socket.id, "No honey yet.", 'info');
          }
          return;
        }

        const categoriesToStore = [
          'turnip', 'carrot', 'pumpkin', 'corn', 'wheat', 'winter-radish', 'apple', 'berry', 'mushroom',
          'milk', 'wool', 'egg', 'truffle', 'wood', 'stone', 'fish', 'junk', 'honey',
          'salad', 'apple-pie', 'pumpkin-soup', 'corn-chowder', 'grilled-fish', 'mushroom-soup', 'berry-tart',
          'turnip-seed', 'carrot-seed', 'pumpkin-seed', 'corn-seed', 'wheat-seed', 'winter-radish-seed', 'apple-tree-seed'
        ];

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

      if (plant && plant.species === 'berry-bush' && plant.growthStage >= 5) {
        const now = Date.now();
        if (now - (plant.lastProductTime || 0) >= GAME_DAY) {
            player.inventory['berry'] = (player.inventory['berry'] || 0) + 1;
            plant.lastProductTime = now;
            world.updateEntity(plant);
            socket.emit('entityUpdate', player);
            io.emit('entityUpdate', plant);
            notify(socket.id, "Gathered some berries!", 'success');
        } else {
            notify(socket.id, "The berries are still ripening.", 'info');
        }
        return;
      }

      if (animal) {
        if (animal.species === 'blacksmith') {
          const upgrades: Record<string, number> = {
            'copper-hoe': 200, 'copper-watering-can': 200, 'copper-axe': 200, 'copper-pickaxe': 200
          };

          let canUpgrade = false;
          Object.entries(upgrades).forEach(([tool, price]) => {
              if (!player.inventory[tool] && player.coins >= price) {
                  player.coins -= price;
                  player.inventory[tool] = 1;
                  notify(socket.id, `Upgraded to ${tool.replace('-', ' ')} for ${price} coins!`, 'success');
                  canUpgrade = true;
              }
          });

          if (canUpgrade) {
              socket.emit('entityUpdate', player);
              checkAchievements(player);
          } else {
              const dialogues = [
                "Aye, what can I do for ye?",
                "Looking to sharpen your tools? You've come to the right place.",
                "Copper tools are a farmer's best friend.",
                "Hot enough for ye? The forge is always roaring.",
                "Bring me some coins and I'll show you what real craftsmanship looks like."
              ];
              notify(socket.id, `Blacksmith: "${dialogues[Math.floor(Math.random() * dialogues.length)]}"`, 'info');
          }
          return;
        }

        if (animal.species === 'merchant') {
          let questHandled = false;

          const dialogues = [
            "Hello there! Hard work pays off, doesn't it?",
            "Fresh air, good soil... what more could a farmer want?",
            "If you have extra crops, I'm always buying!",
            "Seen any rare minerals lately? I'm looking to expand my collection.",
            "That's some fine looking produce you've got there.",
            "The seasons are changing... better keep an eye on your crops!",
            "I heard there are wild berries growing to the east."
          ];
          const randomDialogue = dialogues[Math.floor(Math.random() * dialogues.length)];

          // Quest logic
          if (player.activeQuest) {
            const quest = player.activeQuest;
            const inInventory = player.inventory[quest.species] || 0;
            const needed = quest.count - quest.collected;

            if (inInventory > 0) {
                const toGive = Math.min(inInventory, needed);
                player.inventory[quest.species] -= toGive;
                quest.collected += toGive;

                if (quest.collected >= quest.count) {
                    const reward = quest.count * 50; // Bonus coins
                    player.coins += reward;
                    player.activeQuest = null;
                    notify(socket.id, `Quest complete! Gained ${reward} bonus coins.`, 'success');
                } else {
                    notify(socket.id, `Gave ${toGive} ${quest.species} to the Merchant. ${quest.count - quest.collected} more needed.`, 'success');
                }
                socket.emit('entityUpdate', player);
                questHandled = true;
            } else if (needed > 0) {
                notify(socket.id, `I'm still waiting for those ${quest.count} ${quest.species}!`, 'info');
                // Fall through to selling other items
            }
          } else {
              // Assign new quest with 20% chance
              if (Math.random() < 0.2) {
                  const species = ['turnip', 'carrot', 'pumpkin', 'corn', 'wheat', 'winter-radish'][Math.floor(Math.random() * 6)];
                  const count = 5 + Math.floor(Math.random() * 10);
                  player.activeQuest = { species, count, collected: 0 };
                  socket.emit('entityUpdate', player);
                  notify(socket.id, `Merchant: "I have a special request. Bring me ${count} ${species}!"`, 'info');
                  questHandled = true;
              }
          }

          // Sell crops and products
          const prices: Record<string, number> = {
            'turnip': 10, 'carrot': 25, 'pumpkin': 50, 'corn': 35, 'wheat': 30,
            'winter-radish': 40, 'apple': 15, 'berry': 12, 'mushroom': 18,
            'milk': 20, 'wool': 30, 'egg': 10, 'truffle': 60,
            'fish': 40, 'honey': 30
          };
          let earned = 0;
          Object.keys(prices).forEach(item => {
            // Don't sell the item we have an active quest for
            if (player.activeQuest && player.activeQuest.species === item) return;

            if (player.inventory[item] > 0) {
              earned += player.inventory[item] * prices[item];
              player.inventory[item] = 0;
            }
          });
          if (earned > 0) {
            player.coins += earned;
            socket.emit('entityUpdate', player);
            notify(socket.id, `Sold items for ${earned} coins!`, 'success');
            checkAchievements(player);
          } else if (!questHandled) {
            notify(socket.id, `Merchant: "${randomDialogue}"`, 'info');
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
          } else if (animal.species === 'dog') {
              notify(socket.id, "Woof! The dog wags its tail.", 'info');
              animal.lastProductTime = now;
              world.updateEntity(animal);
              io.emit('entityUpdate', animal);
          } else if (animal.species === 'cat') {
              notify(socket.id, "Meow! The cat purrs.", 'info');
              animal.lastProductTime = now;
              world.updateEntity(animal);
              io.emit('entityUpdate', animal);
          }
        } else {
            if (animal.species === 'dog') notify(socket.id, "The dog is napping.", 'info');
            else if (animal.species === 'cat') notify(socket.id, "The cat is busy grooming.", 'info');
            else notify(socket.id, "This animal isn't ready to give anything yet.", 'info');
        }
      }
    }
  });

  socket.on('consume', (item: string) => {
    const player = players.get(socket.id);
    if (player) {
      if (!player.inventory[item] || player.inventory[item] <= 0) {
        notify(socket.id, `You don't have any ${item}!`, 'error');
        return;
      }

      const foodValues: Record<string, number> = {
        'apple': 20,
        'turnip': 5,
        'carrot': 8,
        'corn': 10,
        'winter-radish': 12,
        'fish': 15,
        'salad': 40,
        'apple-pie': 60,
        'pumpkin-soup': 70,
        'corn-chowder': 50,
        'grilled-fish': 45,
        'mushroom-soup': 55,
        'berry-tart': 65
      };

      const staminaGain = foodValues[item];
      if (staminaGain !== undefined) {
        if (player.stamina >= player.maxStamina && item !== 'pumpkin-soup' && item !== 'corn-chowder') {
          notify(socket.id, "You're already full of energy!", 'info');
          return;
        }
        player.inventory[item]--;
        player.stamina = Math.min(player.maxStamina, player.stamina + staminaGain);

        // Apply buffs from cooked food
        if (item === 'pumpkin-soup') {
          player.buffs = player.buffs.filter(b => b.type !== 'stamina_regen');
          player.buffs.push({ type: 'stamina_regen', amount: 2, expiresAt: Date.now() + 5 * 60 * 1000 }); // 5 mins
          notify(socket.id, "You feel energized! Stamina regens faster.", 'success');
        } else if (item === 'corn-chowder') {
            player.buffs = player.buffs.filter(b => b.type !== 'stamina_regen');
            player.buffs.push({ type: 'stamina_regen', amount: 1, expiresAt: Date.now() + 3 * 60 * 1000 }); // 3 mins
            notify(socket.id, "Warm chowder restores your energy.", 'success');
        }

        socket.emit('entityUpdate', player);
        notify(socket.id, `Ate ${item.replace('-', ' ')}. Restored ${staminaGain} stamina!`, 'success');
      } else {
        notify(socket.id, `You can't eat ${item}!`, 'info');
      }
    }
  });

  socket.on('cook', (recipe: string) => {
    const player = players.get(socket.id);
    if (player) {
      const { leveledUp, newLevel } = addXP(player, 'cooking', 10);
      if (leveledUp) notify(socket.id, `Your cooking skill leveled up to ${newLevel}!`, 'success');

      const entities = [
        ...world.getEntitiesAt(player.pos.q, player.pos.r),
        ...getNeighbors(player.pos).flatMap(n => world.getEntitiesAt(n.q, n.r))
      ];
      const isNearCookingPot = entities.some(e => e.type === 'building' && e.species === 'cooking-pot');
      if (!isNearCookingPot) {
        notify(socket.id, "You need to be near a cooking pot to cook!", 'error');
        return;
      }

      const recipes: Record<string, Record<string, number>> = {
        'salad': { 'turnip': 1, 'carrot': 1 },
        'apple-pie': { 'apple': 3, 'wheat': 1 },
        'pumpkin-soup': { 'pumpkin': 1, 'milk': 1 },
        'corn-chowder': { 'corn': 2, 'milk': 1 },
        'grilled-fish': { 'fish': 1, 'wood': 1 },
        'mushroom-soup': { 'mushroom': 2, 'milk': 1 },
        'berry-tart': { 'berry': 3, 'wheat': 1 }
      };

      const ingredients = recipes[recipe];
      if (ingredients) {
        for (const [ing, count] of Object.entries(ingredients)) {
          if ((player.inventory[ing] || 0) < count) {
            notify(socket.id, `Missing ingredients for ${recipe}! Need ${count} ${ing}.`, 'error');
            return;
          }
        }

        // Consume ingredients
        for (const [ing, count] of Object.entries(ingredients)) {
          player.inventory[ing] -= count;
        }

        player.inventory[recipe] = (player.inventory[recipe] || 0) + 1;
        player.stats['meals_cooked'] = (player.stats['meals_cooked'] || 0) + 1;
        socket.emit('entityUpdate', player);
        notify(socket.id, `Cooked ${recipe.replace('-', ' ')}!`, 'success');
        checkAchievements(player);
      }
    }
  });

  socket.on('fish', () => {
    const player = players.get(socket.id);
    if (player) {
      const sCost = getStaminaCost(player, 'fishing', 5);
      if (!hasStamina(player, sCost)) return;
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

      player.stamina -= sCost;
      const rand = Math.random();
      if (rand < 0.3) {
        player.inventory['fish'] = (player.inventory['fish'] || 0) + 1;
        player.stats['fish_caught'] = (player.stats['fish_caught'] || 0) + 1;

        // XP Gain
        const { leveledUp, newLevel } = addXP(player, 'fishing', 15);
        if (leveledUp) notify(socket.id, `Your fishing skill leveled up to ${newLevel}!`, 'success');

        notify(socket.id, "You caught a fish!", 'success');
        checkAchievements(player);
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

  socket.on('teleport_home', () => {
    const player = players.get(socket.id);
    if (player) {
      if (!hasStamina(player, 20)) return;

      player.stamina -= 20;
      world.removeEntity(player.id, player.pos.q, player.pos.r);
      player.pos = { q: 0, r: 0 };
      world.addEntity(player);

      io.emit('entityUpdate', player);
      notify(socket.id, "Teleported home!", 'success');
    }
  });

  socket.on('chat', (message: string) => {
    const player = players.get(socket.id);
    if (player) {
      const sanitized = message.substring(0, 200).trim();
      if (!sanitized) return;

      // Handle simple commands
      if (sanitized.startsWith('/give ')) {
          const parts = sanitized.split(' ');
          if (parts.length >= 3) {
              const targetName = parts[1];
              const itemName = parts[2];
              const count = parseInt(parts[3] || '1');

              if (isNaN(count) || count <= 0) {
                  notify(socket.id, "Invalid amount!", 'error');
                  return;
              }

              // Find target player nearby
              const target = Array.from(players.values()).find(p =>
                  p.name.toLowerCase() === targetName.toLowerCase() &&
                  distance(player.pos, p.pos) <= 1
              );

              if (!target) {
                  notify(socket.id, `Player ${targetName} not found nearby!`, 'error');
                  return;
              }

              if ((player.inventory[itemName] || 0) < count) {
                  notify(socket.id, `You don't have ${count} ${itemName}!`, 'error');
                  return;
              }

              // Transfer
              player.inventory[itemName] -= count;
              target.inventory[itemName] = (target.inventory[itemName] || 0) + count;

              socket.emit('entityUpdate', player);
              // We need to find the socket of the target player to notify them and update their UI
              const targetSocketId = Array.from(players.entries()).find(([sid, p]) => p.id === target.id)?.[0];
              if (targetSocketId) {
                  io.to(targetSocketId).emit('entityUpdate', target);
                  notify(targetSocketId, `${player.name} gave you ${count} ${itemName}!`, 'success');
              }
              notify(socket.id, `Gave ${count} ${itemName} to ${target.name}.`, 'success');
              return;
          }
      }

      io.emit('chat', {
        sender: player.name,
        senderId: player.id,
        message: sanitized,
        timestamp: Date.now()
      });
    }
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
