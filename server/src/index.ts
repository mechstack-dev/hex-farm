import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorldManager } from './WorldManager.js';
import { GameEngine } from './GameEngine.js';
import { distance, GAME_DAY, getNeighbors, getRecursiveNeighbors, BUILDING_COSTS, ITEM_PRICES, SEED_PRICES, TOOL_PRICES, KIT_PRICES, FOOD_VALUES, RECIPES } from 'common';
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

let currentGlobalRequest: {
  npc: string;
  item: string;
  count: number;
  day: number;
} | null = null;

io.on('connection', (socket) => {
  console.log('a user connected', socket.id);

  socket.on('join', (name: string, color?: number) => {
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
        stats: {},
        relationships: {},
        lastGiftTime: {},
        lastNPCDailyGiftTime: {},
        lastTalkTime: {},
        perks: [],
        color: color !== undefined ? color : 0x0000FF
      };
    }

    // Migration for existing players
    if (player.color === undefined) player.color = color !== undefined ? color : 0x0000FF;
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
    if (!player.relationships) player.relationships = {};
    if (!player.lastGiftTime) player.lastGiftTime = {};
    if (!player.lastNPCDailyGiftTime) player.lastNPCDailyGiftTime = {};
    if (!player.lastTalkTime) player.lastTalkTime = {};
    if (!player.perks) player.perks = [];

    players.set(socket.id, player);
    world.addEntity(player);

    const { environment } = engine.tick(); // Just to get current state
    socket.emit('init', { playerId: player.id, worldSeed: "mmo-seed" });
    socket.emit('environmentUpdate', environment);
    if (currentGlobalRequest && currentGlobalRequest.day === environment.dayCount) {
        socket.emit('globalRequestUpdate', currentGlobalRequest);
    }
    io.emit('entityUpdate', player);
    socket.emit('notification', { message: `Welcome to HexFarm, ${name}!`, type: 'info' });
  });

  const notify = (socketId: string, message: string, type: 'info' | 'success' | 'error' = 'info') => {
    io.to(socketId).emit('notification', { message, type });
  };

  const checkNPCMilestones = (player: Player, npcName: string, oldPoints: number, newPoints: number) => {
    // Milestone rewards at 750
    if (oldPoints < 750 && newPoints >= 750) {
        if (npcName === 'merchant') {
            const seeds = ['turnip-seed', 'carrot-seed', 'pumpkin-seed', 'corn-seed', 'wheat-seed', 'sunflower-seed', 'winter-radish-seed'];
            seeds.forEach(s => player.inventory[s] = (player.inventory[s] || 0) + 10);
            notify(socket.id, `Merchant: "You've been a great partner. Here's a bulk supply of seeds!"`, 'success');
        } else if (npcName === 'blacksmith') {
            player.inventory['gold-ore'] = (player.inventory['gold-ore'] || 0) + 5;
            notify(socket.id, `Blacksmith: "Take some of my private stock. You've earned it."`, 'success');
        } else if (npcName === 'fisherman') {
            player.inventory['golden-hexfish'] = (player.inventory['golden-hexfish'] || 0) + 1;
            notify(socket.id, `Fisherman: "The legendary Golden Hexfish! It's yours, friend."`, 'success');
        } else if (npcName === 'miner') {
            player.inventory['dynamite'] = (player.inventory['dynamite'] || 0) + 10;
            notify(socket.id, `Miner: "A gift for a fellow deep-delver. Don't blow yourself up!"`, 'success');
        }
    }

    // Milestone dialogue
    const milestones = [250, 500, 750, 1000];
    const reached = milestones.find(m => oldPoints < m && newPoints >= m);
    if (reached) {
        const dialogues: Record<string, Record<number, string>> = {
            'merchant': {
                250: "Merchant: \"You're becoming a regular around here! I appreciate the business.\"",
                500: "Merchant: \"I've seen many farmers come and go, but you've got real staying power.\"",
                750: "Merchant: \"It's rare to find someone so dedicated. You're more than just a customer now.\"",
                1000: "Merchant: \"You're practically family. Welcome to the Merchant's Guild!\""
            },
            'blacksmith': {
                250: "Blacksmith: \"Not bad, farmer. You're starting to understand the value of good materials.\"",
                500: "Blacksmith: \"Your tools tell a story of hard work. I respect that.\"",
                750: "Blacksmith: \"Few have the patience for the forge... or for me. Thanks for stickin' around.\"",
                1000: "Blacksmith: \"You've got the heart of a smith. I'd be proud to call you my apprentice.\""
            },
            'fisherman': {
                250: "Fisherman: \"The ripples are changing... you're starting to fit in here.\"",
                500: "Fisherman: \"Patience is a virtue, and you've got it in spades.\"",
                750: "Fisherman: \"I can almost hear the water calling your name. You're a true angler.\"",
                1000: "Fisherman: \"The legendary catch is within your reach. You're a master of the waves.\""
            },
            'miner': {
                250: "Miner: \"Still got all your fingers? Good. You're tougher than you look.\"",
                500: "Miner: \"The stones are starting to talk to you, eh? Just don't let 'em talk back.\"",
                750: "Miner: \"Deep delvin' is in your blood. I can see the dust in your eyes.\"",
                1000: "Miner: \"You've reached the bottom and come back up. You're a true Deep Delver.\""
            }
        };
        if (dialogues[npcName] && dialogues[npcName][reached]) {
            notify(socket.id, dialogues[npcName][reached], 'success');
        }
    }

    // Perk logic
    if (newPoints >= 1000) {
        const perkId = `perk-${npcName}`;
        if (!player.perks.includes(perkId)) {
            player.perks.push(perkId);
            const perkNames: Record<string, string> = {
                'merchant': "Merchant's Guild Member",
                'blacksmith': "Smith's Apprentice",
                'fisherman': "Expert Angler",
                'miner': "Deep Delver"
            };
            notify(socket.id, `New Perk Unlocked: ${perkNames[npcName]}!`, 'success');
        }
    }
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
          { id: 'naturalist', name: 'Master Naturalist', condition: (p: Player) => ((p.relationships['fisherman'] || 0) >= 500 && (p.relationships['miner'] || 0) >= 500) },
          { id: 'legendary_angler', name: 'Legendary Angler', condition: (p: Player) => (p.inventory['golden-hexfish'] || 0) > 0 },
          { id: 'master_architect', name: 'Master Architect', condition: (p: Player) => (p.stats['buildings_built'] || 0) >= 10 },
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
      const hasBridge = entities.some(e => e.type === 'building' && e.species === 'bridge');
      const isBlocked = entities.some(e => {
        if (hasBridge && e.type === 'obstacle' && e.species === 'water') return false;
        if (e.type === 'building' && e.species === 'bridge') return false;
        return (e.type === 'obstacle' || e.type === 'fence' || e.type === 'building') ||
               (e.type === 'plant' && (e.species === 'tree' || e.species === 'apple-tree' || e.species === 'orange-tree' || e.species === 'peach-tree' || e.species === 'cherry-tree' || e.species === 'berry-bush' || e.species === 'burnt-tree'));
      });
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

  const getEffectiveStaminaCost = (player: Player, amount: number): number => {
    if (player.hasGrace && Math.random() < 0.2) {
      notify(socket.id, "Nature's Grace: Action consumed no stamina!", 'success');
      return 0;
    }
    return amount;
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
        const price = TOOL_PRICES[tool];
        if (price !== undefined) {
          // Prevent buying duplicate basic tools or if already have upgraded version
          const tiers = [tool, `copper-${tool}`, `iron-${tool}`, `gold-${tool}`];
          if (tiers.some(t => (player.inventory[t] || 0) > 0)) {
              notify(socket.id, `You already have a ${tool}!`, 'error');
              return;
          }

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
        player.stamina -= getEffectiveStaminaCost(player, sCost);
        const fence = {
          id: `fence-${player.pos.q}-${player.pos.r}`,
          type: 'fence' as const,
          pos: { ...player.pos }
        };
        player.stats['buildings_built'] = (player.stats['buildings_built'] || 0) + 1;
        world.addEntity(fence);
        io.emit('entityUpdate', fence);
        socket.emit('entityUpdate', player);
      } else {
        const fence = entities.find(e => e.type === 'fence');
        if (fence) {
        player.stamina -= getEffectiveStaminaCost(player, sCost);
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
      const hasGoldHoe = (player.inventory['gold-hoe'] || 0) > 0;
      const hasIronHoe = (player.inventory['iron-hoe'] || 0) > 0;
      const hasCopperHoe = (player.inventory['copper-hoe'] || 0) > 0;
      if (!hasGoldHoe && !hasIronHoe && !hasCopperHoe && (player.inventory['hoe'] || 0) <= 0) {
        notify(socket.id, "You need a hoe to plow land!", 'error');
        return;
      }

      let targets = [player.pos];
      if (hasGoldHoe) {
        targets = [player.pos];
        const radius1 = getNeighbors(player.pos);
        targets.push(...radius1);
        const radius2 = radius1.flatMap(n => getNeighbors(n));
        targets.push(...radius2);
        const radius3 = radius2.flatMap(n => getNeighbors(n));
        targets.push(...radius3);
        // Deduplicate targets
        targets = Array.from(new Set(targets.map(t => `${t.q},${t.r}`)))
          .map(s => { const [q, r] = s.split(',').map(Number); return { q, r }; });
      } else if (hasIronHoe) {
        targets = [player.pos, ...getNeighbors(player.pos)];
        getNeighbors(player.pos).forEach(n => {
          targets.push(...getNeighbors(n));
        });
        // Deduplicate targets
        targets = Array.from(new Set(targets.map(t => `${t.q},${t.r}`)))
          .map(s => { const [q, r] = s.split(',').map(Number); return { q, r }; });
      } else if (hasCopperHoe) {
        targets = [player.pos, ...getNeighbors(player.pos)];
      }

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
                  const seeds = ['turnip-seed', 'carrot-seed', 'pumpkin-seed', 'corn-seed', 'wheat-seed', 'winter-radish-seed', 'sunflower-seed'];
                  const seed = seeds[Math.floor(Math.random() * seeds.length)];
                  player.inventory[seed] = (player.inventory[seed] || 0) + 1;
                  notify(socket.id, `Scavenged a ${seed.replace('-seed', '')} seed!`, 'success');
              } else if (rand < 0.1) {
                  const coins = 1 + Math.floor(Math.random() * 5);
                  player.coins += coins;
                  notify(socket.id, `Found ${coins} coins in the grass!`, 'success');
              } else if (rand < 0.11) {
                  player.inventory['ancient-coin'] = (player.inventory['ancient-coin'] || 0) + 1;
                  notify(socket.id, "You found a dusty Ancient Coin!", 'success');
              } else if (rand < 0.12) {
                  const artifacts = ['rusty-cog', 'old-tablet'];
                  const art = artifacts[Math.floor(Math.random() * artifacts.length)];
                  player.inventory[art] = (player.inventory[art] || 0) + 1;
                  notify(socket.id, `You unearthed a ${art.replace('-', ' ')}!`, 'success');
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
        player.stamina -= getEffectiveStaminaCost(player, sCost);
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
          player.stamina -= getEffectiveStaminaCost(player, sCost);
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
        player.stamina -= getEffectiveStaminaCost(player, sCost);
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
      const hasGoldScythe = (player.inventory['gold-scythe'] || 0) > 0;
      const hasIronScythe = (player.inventory['iron-scythe'] || 0) > 0;
      const hasCopperScythe = (player.inventory['copper-scythe'] || 0) > 0;
      const hasScythe = hasGoldScythe || hasIronScythe || hasCopperScythe || (player.inventory['scythe'] || 0) > 0;

      let targets = [player.pos];
      if (hasScythe) {
        let radius = 1;
        if (hasGoldScythe) radius = 4;
        else if (hasIronScythe) radius = 3;
        else if (hasCopperScythe) radius = 2;

        targets = getRecursiveNeighbors(player.pos, radius);
      } else {
          targets = [player.pos, ...getNeighbors(player.pos)];
      }

      let harvestedCount = 0;
      const sCost = getStaminaCost(player, 'farming', hasScythe ? 10 : 20);

      if (!hasStamina(player, sCost)) return;

      targets.forEach(pos => {
        const entities = world.getEntitiesAt(pos.q, pos.r);
        const plant = entities.find(e => e.type === 'plant') as Plant | undefined;
        if (plant) {
          if (plant.species === 'apple-tree' || plant.species === 'orange-tree' || plant.species === 'peach-tree' || plant.species === 'cherry-tree') {
              if (!hasScythe) notify(socket.id, `Use 'E' to gather fruit from mature trees. Use an axe to cut them down.`, 'info');
              return;
          }
          if (plant.species === 'berry-bush') {
            if (!hasScythe) notify(socket.id, "Use 'E' to gather berries from mature bushes. Use an axe to clear it.", 'info');
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
            let seedsGained = 0;
            if (species !== 'mushroom') {
              const seedType = `${species}-seed`;
              const farmingLuck = player.buffs.find(b => b.type === 'farming_luck');
              seedsGained = (Math.floor(Math.random() * 2) + 1) + (farmingLuck ? 1 : 0);
              player.inventory[seedType] = (player.inventory[seedType] || 0) + seedsGained;
            }

            if (!hasScythe) {
              const seedMsg = seedsGained > 0 ? ` Gained ${seedsGained} seeds.` : '';
              notify(socket.id, `Harvested ${species}!${seedMsg}`, 'success');
            }

            io.emit('entityRemove', { id: plant.id, pos: plant.pos });
            harvestedCount++;
          } else if (!hasScythe || (pos.q === player.pos.q && pos.r === player.pos.r)) {
            // Allow removing immature plants only on current hex or if not using scythe
            world.removeEntity(plant.id, plant.pos.q, plant.pos.r);
            io.emit('entityRemove', { id: plant.id, pos: plant.pos });
            if (!hasScythe) notify(socket.id, "Removed immature plant.", 'info');
          }
        }
      });

      if (harvestedCount > 0) {
        player.stamina -= getEffectiveStaminaCost(player, sCost);
        socket.emit('entityUpdate', player);
        checkAchievements(player);
        const toolMsg = hasScythe ? ' with scythe' : '';
        const cropText = harvestedCount === 1 ? 'crop' : 'crops';
        notify(socket.id, `Harvested ${harvestedCount} ${cropText}${toolMsg}!`, 'success');
      } else {
        // Only notify if they specifically tried to harvest but nothing was there
        notify(socket.id, "Nothing to harvest in this area.", 'info');
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
      const hasCompost = (player.inventory['compost-fertilizer'] || 0) > 0;
      const hasJunk = (player.inventory['junk'] || 0) > 0;

      if (!hasCompost && !hasJunk) {
        notify(socket.id, "You need junk or compost fertilizer to fertilize plants!", 'error');
        return;
      }

      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const plant = entities.find(e => e.type === 'plant') as Plant | undefined;
      if (plant) {
        if (plant.growthStage >= 5) {
          notify(socket.id, "This plant is already mature!", 'info');
          return;
        }

        let growthBoost = 1;
        if (hasCompost) {
            player.inventory['compost-fertilizer']--;
            growthBoost = 2;
        } else {
            player.inventory['junk']--;
        }

        plant.growthStage = Math.min(5, plant.growthStage + growthBoost);
        world.updateEntity(plant);
        io.emit('entityUpdate', plant);
        socket.emit('entityUpdate', player);
        notify(socket.id, `Fertilized the plant! It grew by ${growthBoost} stage(s).`, 'success');
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
      const hasGoldWateringCan = (player.inventory['gold-watering-can'] || 0) > 0;
      const hasIronWateringCan = (player.inventory['iron-watering-can'] || 0) > 0;
      const hasCopperWateringCan = (player.inventory['copper-watering-can'] || 0) > 0;
      const entities = [
        ...world.getEntitiesAt(player.pos.q, player.pos.r),
        ...getNeighbors(player.pos).flatMap(n => world.getEntitiesAt(n.q, n.r))
      ];
      const isNearWell = entities.some(e => e.type === 'building' && e.species === 'well');

      if (!isNearWell && !hasGoldWateringCan && !hasIronWateringCan && !hasCopperWateringCan && (player.inventory['watering-can'] || 0) <= 0) {
        notify(socket.id, "You need a watering can or to be near a well!", 'error');
        return;
      }

      let targets = [player.pos];
      if (hasGoldWateringCan) {
        targets = [player.pos];
        const radius1 = getNeighbors(player.pos);
        targets.push(...radius1);
        const radius2 = radius1.flatMap(n => getNeighbors(n));
        targets.push(...radius2);
        const radius3 = radius2.flatMap(n => getNeighbors(n));
        targets.push(...radius3);
        // Deduplicate targets
        targets = Array.from(new Set(targets.map(t => `${t.q},${t.r}`)))
          .map(s => { const [q, r] = s.split(',').map(Number); return { q, r }; });
      } else if (hasIronWateringCan) {
        targets = [player.pos, ...getNeighbors(player.pos)];
        getNeighbors(player.pos).forEach(n => {
          targets.push(...getNeighbors(n));
        });
        targets = Array.from(new Set(targets.map(t => `${t.q},${t.r}`)))
          .map(s => { const [q, r] = s.split(',').map(Number); return { q, r }; });
      } else if (hasCopperWateringCan || isNearWell) {
        targets = [player.pos, ...getNeighbors(player.pos)];
      }

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
        player.stamina -= getEffectiveStaminaCost(player, sCost);
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
        const price = SEED_PRICES[species];
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
        const price = KIT_PRICES[kit];
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
        player.stamina -= getEffectiveStaminaCost(player, sCost);
        const scarecrow = {
          id: `scarecrow-${player.pos.q}-${player.pos.r}`,
          type: 'obstacle' as const,
          species: 'scarecrow',
          pos: { ...player.pos }
        };
        player.stats['buildings_built'] = (player.stats['buildings_built'] || 0) + 1;
        world.addEntity(scarecrow);
        io.emit('entityUpdate', scarecrow);
        socket.emit('entityUpdate', player);
        notify(socket.id, "Scarecrow installed!", 'success');
      } else {
        notify(socket.id, "This spot is occupied.", 'info');
      }
    }
  });

  socket.on('build_sprinkler', (tier: string = 'basic') => {
    const player = players.get(socket.id);
    if (player) {
      const species = tier === 'gold' ? 'gold-sprinkler' : (tier === 'iron' ? 'iron-sprinkler' : 'sprinkler');
      const sCost = getStaminaCost(player, 'farming', 10);
      if (!hasStamina(player, sCost)) return;
      const cost = BUILDING_COSTS[species] || { wood: 0, stone: 5 };
      if ((player.inventory['stone'] || 0) < cost.stone) {
        notify(socket.id, `Need ${cost.stone} stone to build a ${tier} sprinkler!`, 'error');
        return;
      }

      const entities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const isOccupied = entities.some(e => e.type !== 'player' && e.type !== 'floor');
      if (!isOccupied) {
        player.inventory['stone'] -= cost.stone;
        player.stamina -= getEffectiveStaminaCost(player, sCost);
        const sprinkler = {
          id: `sprinkler-${player.pos.q}-${player.pos.r}`,
          type: 'sprinkler' as const,
          species: species,
          pos: { ...player.pos }
        };
        player.stats['buildings_built'] = (player.stats['buildings_built'] || 0) + 1;
        world.addEntity(sprinkler);
        io.emit('entityUpdate', sprinkler);
        socket.emit('entityUpdate', player);
        notify(socket.id, `${tier.charAt(0).toUpperCase() + tier.slice(1)} sprinkler installed!`, 'success');
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
        player.stamina -= getEffectiveStaminaCost(player, sCost);

        const building: Building = {
          id: `${species}-${player.pos.q}-${player.pos.r}`,
          type: 'building' as const,
          species,
          pos: { ...player.pos },
          inventory: (species === 'chest' || species === 'beehive' || species === 'barn' || species === 'large-barn' || species === 'stall') ? {} : undefined,
          lastProductTime: species === 'beehive' ? Date.now() : undefined,
          ownerId: species === 'stall' ? player.id : undefined
        };
        player.stats['buildings_built'] = (player.stats['buildings_built'] || 0) + 1;
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
      // Prioritize current hex, then neighbors
      const targets = [player.pos, ...getNeighbors(player.pos)];
      let obstacle: any = null;
      for (const pos of targets) {
        const entities = world.getEntitiesAt(pos.q, pos.r);
        // Prioritize actual obstacles/plants/fences over background floor
        obstacle = entities.find(e =>
            (e.type === 'obstacle' && e.species !== 'water') ||
            (e.type === 'plant' && (e.species === 'apple-tree' || e.species === 'orange-tree' || e.species === 'tree')) ||
            e.type === 'fence'
        );
        if (obstacle) break;

        // Second pass for other clearable things like buildings/sprinklers if no high-priority obstacle found yet
        obstacle = entities.find(e => e.type === 'building' || e.type === 'sprinkler' || e.type === 'plant');
        if (obstacle) break;
      }

      const skill = (obstacle && (obstacle.species === 'rock' || (obstacle.id && obstacle.id.startsWith('rock')))) ? 'mining' : 'foraging';
      const sCost = getStaminaCost(player, skill, 10);
      if (!hasStamina(player, sCost)) return;

      if (obstacle) {
        if (obstacle.species === 'tree' || obstacle.species === 'apple-tree' || obstacle.species === 'orange-tree' || obstacle.species === 'peach-tree' || obstacle.species === 'cherry-tree' || obstacle.species === 'burnt-tree' || (!obstacle.species && obstacle.id.startsWith('tree'))) {
          const hasGoldAxe = (player.inventory['gold-axe'] || 0) > 0;
          const hasIronAxe = (player.inventory['iron-axe'] || 0) > 0;
          const hasCopperAxe = (player.inventory['copper-axe'] || 0) > 0;
          if (!hasGoldAxe && !hasIronAxe && !hasCopperAxe && (player.inventory['axe'] || 0) <= 0) {
            notify(socket.id, "You need an axe to cut down trees!", 'error');
            return;
          }

          const growthStage = (obstacle as any).growthStage !== undefined ? (obstacle as any).growthStage : 5;
          let woodYield = 1;
          if (growthStage >= 5) woodYield = 5;
          else if (growthStage >= 3) woodYield = 3;
          else woodYield = 1;

          const toolMultiplier = hasGoldAxe ? 5 : (hasIronAxe ? 3 : (hasCopperAxe ? 2 : 1));
          const totalWood = woodYield * toolMultiplier;

          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          player.stamina -= getEffectiveStaminaCost(player, sCost);

          if (obstacle.species === 'burnt-tree') {
              const coalAmount = 1 + Math.floor(Math.random() * 3);
              player.inventory['coal'] = (player.inventory['coal'] || 0) + coalAmount;
              notify(socket.id, `Cleared burnt tree. Gained ${coalAmount} coal!`, 'success');
          } else {
              player.inventory['wood'] = (player.inventory['wood'] || 0) + totalWood;
          }

          // XP Gain
          const { leveledUp, newLevel } = addXP(player, 'foraging', 15);
          if (leveledUp) notify(socket.id, `Your foraging skill leveled up to ${newLevel}!`, 'success');

          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);
          let name = 'tree';
          if (obstacle.species === 'apple-tree') name = 'apple tree';
          if (obstacle.species === 'orange-tree') name = 'orange tree';
          if (obstacle.species === 'peach-tree') name = 'peach tree';
          if (obstacle.species === 'cherry-tree') name = 'cherry tree';

          // Discovery Reward
          const discoveryLuck = player.buffs.find(b => b.type === 'foraging_luck');
          const discoveryChance = 0.1 + (discoveryLuck ? 0.1 : 0);
          if (Math.random() < discoveryChance) {
            const rand = Math.random();
            if (rand < 0.05) {
                player.inventory['ancient-coin'] = (player.inventory['ancient-coin'] || 0) + 1;
                notify(socket.id, `You found an Ancient Coin stuck in the ${name}!`, 'success');
            } else if (rand < 0.15) {
                const art = 'ancient-statue';
                player.inventory[art] = (player.inventory[art] || 0) + 1;
                notify(socket.id, `You found a ${art.replace('-', ' ')} inside the ${name}!`, 'success');
            } else {
                const seeds = ['turnip-seed', 'carrot-seed', 'pumpkin-seed', 'corn-seed', 'wheat-seed', 'apple-tree-seed', 'orange-tree-seed', 'winter-radish-seed'];
                const seed = seeds[Math.floor(Math.random() * seeds.length)];
                player.inventory[seed] = (player.inventory[seed] || 0) + 1;
                notify(socket.id, `You found a ${seed.replace('-seed', '')} seed in the ${name}!`, 'success');
            }
          }

          notify(socket.id, `Cut down ${name}. Gained ${totalWood} wood.`, 'success');

          // Cave entrance chance
          if (Math.random() < 0.02) {
              const caveEntrance = {
                  id: `floor-${obstacle.pos.q}-${obstacle.pos.r}`,
                  type: 'floor' as const,
                  species: 'cave-entrance',
                  pos: { ...obstacle.pos }
              };
              world.addEntity(caveEntrance);
              io.emit('entityUpdate', caveEntrance);
              notify(socket.id, "You discovered a cave entrance!", 'success');
          }
        } else if (obstacle.species === 'meteorite') {
          const hasGoldPickaxe = (player.inventory['gold-pickaxe'] || 0) > 0;
          const hasIronPickaxe = (player.inventory['iron-pickaxe'] || 0) > 0;
          const hasCopperPickaxe = (player.inventory['copper-pickaxe'] || 0) > 0;
          if (!hasGoldPickaxe && !hasIronPickaxe && !hasCopperPickaxe && (player.inventory['pickaxe'] || 0) <= 0) {
            notify(socket.id, "You need a pickaxe to break meteorites!", 'error');
            return;
          }
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          player.stamina -= getEffectiveStaminaCost(player, sCost);

          // High value rewards
          player.inventory['stone'] = (player.inventory['stone'] || 0) + 10;
          player.inventory['iron-ore'] = (player.inventory['iron-ore'] || 0) + 5;
          player.inventory['gold-ore'] = (player.inventory['gold-ore'] || 0) + 2;
          if (Math.random() < 0.2) player.inventory['diamond'] = (player.inventory['diamond'] || 0) + 1;

          const { leveledUp, newLevel } = addXP(player, 'mining', 50);
          if (leveledUp) notify(socket.id, `Your mining skill leveled up to ${newLevel}!`, 'success');

          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);
          notify(socket.id, "You mined a meteorite! Found rare space minerals.", 'success');
        } else if (obstacle.species === 'rock' || (!obstacle.species && obstacle.id.startsWith('rock'))) {
          const hasGoldPickaxe = (player.inventory['gold-pickaxe'] || 0) > 0;
          const hasIronPickaxe = (player.inventory['iron-pickaxe'] || 0) > 0;
          const hasCopperPickaxe = (player.inventory['copper-pickaxe'] || 0) > 0;
          if (!hasGoldPickaxe && !hasIronPickaxe && !hasCopperPickaxe && (player.inventory['pickaxe'] || 0) <= 0) {
            notify(socket.id, "You need a pickaxe to break rocks!", 'error');
            return;
          }
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          player.stamina -= getEffectiveStaminaCost(player, sCost);
          const amount = hasGoldPickaxe ? 5 : (hasIronPickaxe ? 3 : (hasCopperPickaxe ? 2 : 1));
          player.inventory['stone'] = (player.inventory['stone'] || 0) + amount;

          // Ore drop logic
          const luckBuff = player.buffs.find(b => b.type === 'mining_luck');
          const ironChance = luckBuff ? 0.15 : 0.05;
          const isCave = obstacle.pos.q >= 10000;

          if (Math.random() < ironChance) {
              player.inventory['iron-ore'] = (player.inventory['iron-ore'] || 0) + 1;
              notify(socket.id, "Found some iron ore!", 'success');
          }

          if (Math.random() < 0.10) {
            player.inventory['coal'] = (player.inventory['coal'] || 0) + 1;
            notify(socket.id, "Found some coal!", 'success');
          }

          if (isCave) {
              const isDeepDelver = player.perks.includes('perk-miner');
              const goldChance = luckBuff ? (isDeepDelver ? 0.10 : 0.05) : (isDeepDelver ? 0.05 : 0.02);
              if (Math.random() < goldChance) {
                  player.inventory['gold-ore'] = (player.inventory['gold-ore'] || 0) + 1;
                  notify(socket.id, "Found some gold ore!", 'success');
              }

              const gemChance = luckBuff ? 0.05 : 0.02;
              if (Math.random() < gemChance) {
                  const gems = ['amethyst', 'topaz', 'emerald', 'ruby'];
                  const gem = gems[Math.floor(Math.random() * gems.length)];
                  player.inventory[gem] = (player.inventory[gem] || 0) + 1;
                  notify(socket.id, `You found a ${gem}!`, 'success');
              }
          } else {
              const gemChance = luckBuff ? 0.02 : 0.005;
              if (Math.random() < gemChance) {
                  const gems = ['amethyst', 'topaz'];
                  const gem = gems[Math.floor(Math.random() * gems.length)];
                  player.inventory[gem] = (player.inventory[gem] || 0) + 1;
                  notify(socket.id, `You found a ${gem}!`, 'success');
              }
          }

          // XP Gain
          const { leveledUp, newLevel } = addXP(player, 'mining', 15);
          if (leveledUp) notify(socket.id, `Your mining skill leveled up to ${newLevel}!`, 'success');

          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);

          // Discovery Reward
          const discoveryLuck = player.buffs.find(b => b.type === 'foraging_luck');
          const discoveryChance = 0.1 + (discoveryLuck ? 0.1 : 0);
          if (Math.random() < discoveryChance) {
            const rand = Math.random();
            if (rand < 0.2) {
                player.inventory['geode'] = (player.inventory['geode'] || 0) + 1;
                notify(socket.id, "You found a Geode!", 'success');
            } else if (rand < 0.35) {
                player.inventory['ancient-coin'] = (player.inventory['ancient-coin'] || 0) + 1;
                notify(socket.id, "You found an Ancient Coin under the rock!", 'success');
            } else if (rand < 0.55) {
                const artifacts = ['rusty-cog', 'old-tablet', 'ancient-statue'];
                const art = artifacts[Math.floor(Math.random() * artifacts.length)];
                player.inventory[art] = (player.inventory[art] || 0) + 1;
                notify(socket.id, `You found a ${art.replace('-', ' ')} under the rock!`, 'success');
            } else {
                const coins = 5 + Math.floor(Math.random() * 10);
                player.coins += coins;
                notify(socket.id, `You found ${coins} coins hidden under the rock!`, 'success');
            }
          }

          notify(socket.id, `Broke rock. Gained ${amount} stone.`, 'success');

          // Cave entrance chance
          if (Math.random() < 0.02) {
              const caveEntrance = {
                  id: `floor-${obstacle.pos.q}-${obstacle.pos.r}`,
                  type: 'floor' as const,
                  species: 'cave-entrance',
                  pos: { ...obstacle.pos }
              };
              world.addEntity(caveEntrance);
              io.emit('entityUpdate', caveEntrance);
              notify(socket.id, "You discovered a cave entrance!", 'success');
          }
        } else if (obstacle && obstacle.species === 'scarecrow') {
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          player.stamina -= getEffectiveStaminaCost(player, sCost);
          player.inventory['wood'] = (player.inventory['wood'] || 0) + 2;
          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);
          notify(socket.id, "Removed scarecrow.", 'success');
        } else if (obstacle.type === 'fence') {
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          player.stamina -= getEffectiveStaminaCost(player, sCost);
          player.inventory['wood'] = (player.inventory['wood'] || 0) + 2;
          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);
          notify(socket.id, "Removed fence.", 'success');
        } else if (obstacle.type === 'plant') {
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          player.stamina -= getEffectiveStaminaCost(player, sCost);

          const { leveledUp, newLevel } = addXP(player, 'foraging', 5);
          if (leveledUp) notify(socket.id, `Your foraging skill leveled up to ${newLevel}!`, 'success');

          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);
          notify(socket.id, `Cleared ${obstacle.species || 'plant'}.`, 'info');
        } else if (obstacle.type === 'building' || obstacle.type === 'sprinkler') {
          const species = obstacle.species || (obstacle.type === 'sprinkler' ? 'sprinkler' : '');

          if (obstacle.type === 'building' && obstacle.inventory) {
            const hasItems = Object.values(obstacle.inventory).some((count: any) => count > 0);
            if (hasItems) {
              notify(socket.id, `Cannot remove ${species} while it contains items!`, 'error');
              return;
            }
          }

          const refund = BUILDING_COSTS[species];
          world.removeEntity(obstacle.id, obstacle.pos.q, obstacle.pos.r);
          player.stamina -= getEffectiveStaminaCost(player, sCost);
          if (refund) {
            player.inventory['wood'] = (player.inventory['wood'] || 0) + refund.wood;
            player.inventory['stone'] = (player.inventory['stone'] || 0) + refund.stone;
          }
          io.emit('entityRemove', { id: obstacle.id, pos: obstacle.pos });
          socket.emit('entityUpdate', player);
          notify(socket.id, `Removed ${species}.`, 'success');
        }
      } else {
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
        const resourceItems = ['wood', 'stone', 'junk', 'coal', 'iron-ore', 'gold-ore', 'iron-bar', 'gold-bar', 'amethyst', 'topaz', 'emerald', 'ruby', 'diamond'];
        let earned = 0;
        resourceItems.forEach(item => {
          const count = player.inventory[item] || 0;
          if (count > 0) {
            const price = ITEM_PRICES[item] || 5;
            earned += count * price;
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

  socket.on('interact', (shift: boolean = false) => {
    const player = players.get(socket.id);
    if (player) {
      const entities = [
        ...world.getEntitiesAt(player.pos.q, player.pos.r),
        ...getNeighbors(player.pos).flatMap(n => world.getEntitiesAt(n.q, n.r))
      ];
      // Prioritize merchant if nearby
      const merchant = entities.find(e => e.type === 'animal' && e.species === 'merchant') as any;
      const blacksmith = entities.find(e => e.type === 'animal' && e.species === 'blacksmith') as any;
      const fisherman = entities.find(e => e.type === 'animal' && e.species === 'fisherman') as any;
      const miner = entities.find(e => e.type === 'animal' && e.species === 'miner') as any;
      const animal = merchant || blacksmith || fisherman || miner || entities.find(e => e.type === 'animal') as any;
      const plant = entities.find(e => e.type === 'plant') as Plant | undefined;
      const building = entities.find(e => e.type === 'building') as Building | undefined;
      const floor = entities.find(e => e.type === 'floor');

      if (floor && (floor.species === 'flower' || floor.species === 'sunflower')) {
          player.inventory['flower'] = (player.inventory['flower'] || 0) + 1;
          const grass = {
              ...floor,
              species: 'grass'
          };
          world.updateEntity(grass);
          io.emit('entityUpdate', grass);
          socket.emit('entityUpdate', player);
          notify(socket.id, `Picked a ${floor.species}!`, 'success');
          return;
      }

      if (floor && floor.species === 'cave-entrance') {
          const isCave = player.pos.q >= 10000;
          const targetQ = isCave ? player.pos.q - 10000 : player.pos.q + 10000;
          const targetR = player.pos.r;

          world.removeEntity(player.id, player.pos.q, player.pos.r);
          player.pos = { q: targetQ, r: targetR };
          world.addEntity(player);

          // Ensure a return entrance exists
          const targetEntities = world.getEntitiesAt(targetQ, targetR);
          if (!targetEntities.some(e => e.type === 'floor' && e.species === 'cave-entrance')) {
              const returnEntrance = {
                  id: `floor-${targetQ}-${targetR}`,
                  type: 'floor' as const,
                  species: 'cave-entrance',
                  pos: { q: targetQ, r: targetR }
              };
              world.addEntity(returnEntrance);
              io.emit('entityUpdate', returnEntrance);
          }

          socket.emit('entityUpdate', player);
          notify(socket.id, isCave ? "Returning to the surface..." : "Entering the depths...", 'info');
          return;
      }

      if (building && building.species === 'cooking-pot') {
          socket.emit('show_cooking_menu');
          return;
      }

      if (building && building.species === 'mill') {
          const wheat = player.inventory['wheat'] || 0;
          const corn = player.inventory['corn'] || 0;

          if (wheat > 0) {
              player.inventory['wheat']--;
              player.inventory['flour'] = (player.inventory['flour'] || 0) + 1;
              socket.emit('entityUpdate', player);
              notify(socket.id, "Milled 1 wheat into flour!", 'success');
          } else if (corn > 0) {
              player.inventory['corn']--;
              player.inventory['cornmeal'] = (player.inventory['cornmeal'] || 0) + 1;
              socket.emit('entityUpdate', player);
              notify(socket.id, "Milled 1 corn into cornmeal!", 'success');
          } else {
              notify(socket.id, "You need wheat or corn to use the mill!", 'info');
          }
          return;
      }

      if (building && building.species === 'stall') {
          const isOwner = building.ownerId === player.id;
          const buildingInv = building.inventory || {};
          const items = Object.entries(buildingInv).filter(([_, count]) => count > 0);

          if (isOwner) {
              if (items.length > 0) {
                  // Withdraw item
                  const [item, count] = items[0];
                  player.inventory[item] = (player.inventory[item] || 0) + count;
                  building.inventory = {};
                  building.price = undefined;
                  world.updateEntity(building);
                  io.emit('entityUpdate', building);
                  socket.emit('entityUpdate', player);
                  notify(socket.id, `Withdrew ${count} ${item} from your stall.`, 'success');
              } else {
                  // Try to put something up for sale
                  // Find first non-tool item in inventory
                  const toolBases = ['hoe', 'watering-can', 'axe', 'pickaxe', 'fishing-rod', 'dynamite', 'scythe'];
                  const isTool = (item: string) => {
                      if (toolBases.includes(item)) return true;
                      if (item.startsWith('copper-') || item.startsWith('iron-') || item.startsWith('gold-')) {
                          const base = item.split('-').slice(1).join('-');
                          return toolBases.includes(base);
                      }
                      return false;
                  };

                  const sellableItem = Object.entries(player.inventory).find(([item, count]) => count > 0 && !isTool(item));
                  if (sellableItem) {
                      const [item, count] = sellableItem;
                      player.inventory[item] = 0;
                      building.inventory = { [item]: count };
                      const basePrice = ITEM_PRICES[item] || 10;
                      building.price = Math.ceil(basePrice * 1.5); // Fixed 1.5x markup for player stalls
                      world.updateEntity(building);
                      io.emit('entityUpdate', building);
                      socket.emit('entityUpdate', player);
                      notify(socket.id, `Put ${count} ${item} up for sale at ${building.price} coins each.`, 'success');
                  } else {
                      notify(socket.id, "You don't have any sellable items in your inventory.", 'info');
                  }
              }
          } else {
              // Buyer logic
              if (items.length > 0) {
                  const [item, count] = items[0];
                  const totalPrice = (building.price || 0) * count;
                  if (player.coins >= totalPrice) {
                      player.coins -= totalPrice;
                      player.inventory[item] = (player.inventory[item] || 0) + count;
                      building.inventory = {};

                      // Give coins to owner (even if offline, persistence handles it)
                      const owner = Array.from(players.values()).find(p => p.id === building.ownerId);
                      if (owner) {
                          owner.coins += totalPrice;
                          const ownerSocketId = Array.from(players.entries()).find(([sid, p]) => p.id === owner.id)?.[0];
                          if (ownerSocketId) {
                              io.to(ownerSocketId).emit('entityUpdate', owner);
                              notify(ownerSocketId, `Someone bought your ${item} for ${totalPrice} coins!`, 'success');
                          }
                      } else {
                          // Offline owner - update world manager persistent state
                          const persistentOwner = world.getPersistentEntity(building.ownerId!) as Player;
                          if (persistentOwner) {
                              persistentOwner.coins += totalPrice;
                              world.updateEntity(persistentOwner);
                          }
                      }

                      world.updateEntity(building);
                      io.emit('entityUpdate', building);
                      socket.emit('entityUpdate', player);
                      notify(socket.id, `Bought ${count} ${item} for ${totalPrice} coins!`, 'success');
                  } else {
                      notify(socket.id, `Not enough coins! Need ${totalPrice}.`, 'error');
                  }
              } else {
                  notify(socket.id, "This stall is empty.", 'info');
              }
          }
          return;
      }

      if (building && building.species === 'furnace') {
          const hasCoal = (player.inventory['coal'] || 0) > 0;
          if (!hasCoal) {
              notify(socket.id, "You need 1 coal to power the furnace!", 'error');
              return;
          }

          const ironOre = player.inventory['iron-ore'] || 0;
          const goldOre = player.inventory['gold-ore'] || 0;

          if (goldOre >= 5) {
              player.inventory['gold-ore'] -= 5;
              player.inventory['coal']--;
              player.inventory['gold-bar'] = (player.inventory['gold-bar'] || 0) + 1;
              socket.emit('entityUpdate', player);
              notify(socket.id, "Smelted 1 Gold Bar!", 'success');
          } else if (ironOre >= 5) {
              player.inventory['iron-ore'] -= 5;
              player.inventory['coal']--;
              player.inventory['iron-bar'] = (player.inventory['iron-bar'] || 0) + 1;
              socket.emit('entityUpdate', player);
              notify(socket.id, "Smelted 1 Iron Bar!", 'success');
          } else {
              notify(socket.id, "You need 5 ores to smelt a bar!", 'error');
          }
          return;
      }

      if (building && building.species === 'weather-station') {
          const nextWeather = engine.getNextWeather();
          notify(socket.id, `Weather Station: Tomorrow's forecast is ${nextWeather}.`, 'info');
          return;
      }

      if (building && building.species === 'ancient-shrine') {
          const now = Date.now();
          const lastUsed = (player.stats['last_shrine_use'] || 0);
          if (now - lastUsed < GAME_DAY) {
              notify(socket.id, "The shrine is silent. It has already blessed you today.", 'info');
              return;
          }

          const buffs = ['stamina_regen', 'mining_luck', 'farming_luck', 'foraging_luck', 'fishing_luck'];
          const chosenBuff = buffs[Math.floor(Math.random() * buffs.length)];
          const amount = 1;
          const duration = 10 * 60 * 1000; // 10 minutes

          player.buffs = player.buffs.filter(b => b.type !== chosenBuff);
          player.buffs.push({ type: chosenBuff, amount, expiresAt: now + duration });
          player.stats['last_shrine_use'] = now;

          socket.emit('entityUpdate', player);
          notify(socket.id, `The Ancient Shrine glows! You feel a surge of ${chosenBuff.replace('_', ' ')}.`, 'success');
          io.emit('chat', {
              sender: 'System',
              senderId: 'system',
              message: `${player.name} received a blessing from an Ancient Shrine!`,
              timestamp: now
          });
          return;
      }

      if (building && building.species === 'shipping-bin') {
          let earned = 0;
          Object.entries(ITEM_PRICES).forEach(([item, price]) => {
              const count = player.inventory[item] || 0;
              if (count > 0) {
                  earned += Math.floor(count * price * 0.8);
                  player.inventory[item] = 0;
              }
          });

          if (earned > 0) {
              player.coins += earned;
              socket.emit('entityUpdate', player);
              notify(socket.id, `Shipped items for ${earned} coins (80% value).`, 'success');
              checkAchievements(player);
          } else {
              notify(socket.id, "No shippable items in inventory.", 'info');
          }
          return;
      }

      if (building && building.species === 'preserves-jar') {
          const fruit = ['apple', 'orange', 'berry', 'peach', 'cherry'];
          const targetFruit = fruit.find(f => (player.inventory[f] || 0) > 0);

          if (targetFruit) {
              player.inventory[targetFruit]--;
              const jamType = `${targetFruit}-jam`;
              player.inventory[jamType] = (player.inventory[jamType] || 0) + 1;
              socket.emit('entityUpdate', player);
              notify(socket.id, `Converted 1 ${targetFruit} into ${jamType.replace('-', ' ')}!`, 'success');
          } else {
              notify(socket.id, "No fruit to make jam.", 'info');
          }
          return;
      }

      if (building && building.species === 'seed-maker') {
          const crops = ['turnip', 'carrot', 'pumpkin', 'corn', 'wheat', 'winter-radish', 'sunflower', 'apple', 'orange', 'peach', 'cherry'];
          const targetCrop = crops.find(c => (player.inventory[c] || 0) > 0);

          if (targetCrop) {
              player.inventory[targetCrop]--;
              const seedCount = 1 + Math.floor(Math.random() * 3);
              const seedType = `${targetCrop}-seed`;
              player.inventory[seedType] = (player.inventory[seedType] || 0) + seedCount;
              socket.emit('entityUpdate', player);
              notify(socket.id, `Converted 1 ${targetCrop} into ${seedCount} seeds!`, 'success');
          } else {
              notify(socket.id, "No crops to convert into seeds.", 'info');
          }
          return;
      }

      if (building && building.species === 'compost-bin') {
          const crops = ['turnip', 'carrot', 'pumpkin', 'corn', 'wheat', 'winter-radish', 'sunflower', 'apple', 'orange', 'peach', 'cherry'];
          const targetCrop = crops.find(c => (player.inventory[c] || 0) > 0);

          if (targetCrop) {
              player.inventory[targetCrop]--;
              player.inventory['compost-fertilizer'] = (player.inventory['compost-fertilizer'] || 0) + 1;
              socket.emit('entityUpdate', player);
              notify(socket.id, `Converted 1 ${targetCrop} into 1 compost fertilizer!`, 'success');
          } else {
              notify(socket.id, "No crops to convert into compost.", 'info');
          }
          return;
      }

      if (building && building.species === 'recycling-machine') {
          const junkCount = player.inventory['junk'] || 0;
          if (junkCount > 0) {
              player.inventory['junk']--;
              const rand = Math.random();
              let result = 'stone';
              let amount = 1;
              if (rand < 0.1) {
                  result = 'coal';
                  amount = 1;
              } else if (rand < 0.2) {
                  result = 'iron-ore';
                  amount = 1;
              } else {
                  result = 'stone';
                  amount = 2;
              }

              player.inventory[result] = (player.inventory[result] || 0) + amount;
              socket.emit('entityUpdate', player);
              notify(socket.id, `Recycled junk into ${amount} ${result.replace('-', ' ')}!`, 'success');
          } else {
              notify(socket.id, "No junk to recycle.", 'info');
          }
          return;
      }

      if (building && (building.species === 'chest' || building.species === 'beehive' || building.species === 'barn' || building.species === 'large-barn' || building.species === 'shed' || building.species === 'birdhouse')) {
        const buildingInv = building.inventory || {};
        const playerInv = player.inventory;

        if (shift && (building.species === 'chest' || building.species === 'shed')) {
            // Explicit withdraw with Shift+E
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
                notify(socket.id, `Withdrew everything from ${building.species}.`, 'success');
            } else {
                notify(socket.id, `The ${building.species} is already empty.`, 'info');
            }
            return;
        }

        if (building.species === 'beehive') {
          let collectedAny = false;
          ['honey', 'wildflower-honey', 'sunflower-honey'].forEach(h => {
              const count = buildingInv[h] || 0;
              if (count > 0) {
                  playerInv[h] = (playerInv[h] || 0) + count;
                  buildingInv[h] = 0;
                  collectedAny = true;
              }
          });

          if (collectedAny) {
            building.inventory = buildingInv;
            world.updateEntity(building);
            socket.emit('entityUpdate', player);
            io.emit('entityUpdate', building);
            notify(socket.id, `Collected honey from the beehive!`, 'success');
          } else {
            notify(socket.id, "No honey yet.", 'info');
          }
          return;
        }

        if (building.species === 'birdhouse') {
            let collectedAny = false;
            Object.entries(buildingInv).forEach(([item, count]) => {
                if (count > 0) {
                    playerInv[item] = (playerInv[item] || 0) + count;
                    buildingInv[item] = 0;
                    collectedAny = true;
                }
            });

            if (collectedAny) {
                building.inventory = buildingInv;
                world.updateEntity(building);
                socket.emit('entityUpdate', player);
                io.emit('entityUpdate', building);
                notify(socket.id, `Collected items from the birdhouse!`, 'success');
            } else {
                notify(socket.id, "The birdhouse is currently empty.", 'info');
            }
            return;
        }

        if (building.species === 'barn' || building.species === 'large-barn') {
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
                notify(socket.id, "Collected products from the barn.", 'success');
            } else {
                notify(socket.id, "The barn is currently empty.", 'info');
            }
            return;
        }

        const toolBases = ['hoe', 'watering-can', 'axe', 'pickaxe', 'fishing-rod', 'dynamite', 'scythe'];
        const isTool = (item: string) => {
            if (toolBases.includes(item)) return true;
            if (item.startsWith('copper-') || item.startsWith('iron-') || item.startsWith('gold-')) {
                const base = item.split('-').slice(1).join('-');
                return toolBases.includes(base);
            }
            return false;
        };

        let hasAnythingToStore = false;
        Object.keys(playerInv).forEach(item => {
            if (playerInv[item] > 0 && !isTool(item)) {
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

      if (plant && (plant.species === 'apple-tree' || plant.species === 'orange-tree' || plant.species === 'peach-tree' || plant.species === 'cherry-tree') && plant.growthStage >= 5) {
        const now = Date.now();
        if (now - (plant.lastProductTime || 0) >= GAME_DAY) {
            let product = 'apple';
            if (plant.species === 'orange-tree') product = 'orange';
            else if (plant.species === 'peach-tree') product = 'peach';
            else if (plant.species === 'cherry-tree') product = 'cherry';

            player.inventory[product] = (player.inventory[product] || 0) + 1;
            plant.lastProductTime = now;

            // XP Gain
            const { leveledUp, newLevel } = addXP(player, 'foraging', 10);
            if (leveledUp) notify(socket.id, `Your foraging skill leveled up to ${newLevel}!`, 'success');

            world.updateEntity(plant);
            socket.emit('entityUpdate', player);
            io.emit('entityUpdate', plant);
            notify(socket.id, `Harvested an ${product} from the tree!`, 'success');
            checkAchievements(player);
        } else {
            notify(socket.id, `This tree doesn't have any ripe ${plant.species === 'apple-tree' ? 'apples' : 'oranges'} yet.`, 'info');
        }
        return;
      }

      if (plant && plant.species === 'berry-bush' && plant.growthStage >= 5) {
        const now = Date.now();
        if (now - (plant.lastProductTime || 0) >= GAME_DAY) {
            player.inventory['berry'] = (player.inventory['berry'] || 0) + 1;
            plant.lastProductTime = now;

            // XP Gain
            const { leveledUp, newLevel } = addXP(player, 'foraging', 10);
            if (leveledUp) notify(socket.id, `Your foraging skill leveled up to ${newLevel}!`, 'success');

            world.updateEntity(plant);
            socket.emit('entityUpdate', player);
            io.emit('entityUpdate', plant);
            notify(socket.id, "Gathered some berries!", 'success');
            checkAchievements(player);
        } else {
            notify(socket.id, "The berries are still ripening.", 'info');
        }
        return;
      }

      if (animal) {
        const npcName = animal.species || '';
        const currentTime = Date.now();

          // Daily talk boost
          if (['miner', 'fisherman', 'blacksmith', 'merchant'].includes(npcName)) {
              if (currentTime - (player.lastTalkTime[npcName] || 0) >= GAME_DAY) {
                  player.lastTalkTime[npcName] = currentTime;
                  const oldPoints = player.relationships[npcName] || 0;
                  const newPoints = Math.min(1000, oldPoints + 5);
                  player.relationships[npcName] = newPoints;
                  notify(socket.id, `You chatted with the ${npcName}. Relationship improved! (+5)`, 'success');
                  checkNPCMilestones(player, npcName, oldPoints, newPoints);
                  socket.emit('entityUpdate', player);
              }
          }

        const canGetNPCGift = ['miner', 'fisherman', 'blacksmith', 'merchant'].includes(npcName) &&
            (player.relationships[npcName] || 0) >= 500 &&
            (currentTime - (player.lastNPCDailyGiftTime[npcName] || 0) >= GAME_DAY);

        if (canGetNPCGift && Math.random() < 0.2) {
            let gift = 'stone';
            let msg = '';
            if (npcName === 'miner') {
                gift = Math.random() < 0.7 ? 'coal' : 'iron-ore';
                msg = `Miner: "Found some extra ${gift.replace('-', ' ')} today. You want it?"`;
            } else if (npcName === 'merchant') {
                const seeds = ['turnip-seed', 'carrot-seed', 'pumpkin-seed', 'corn-seed', 'wheat-seed', 'sunflower-seed'];
                gift = seeds[Math.floor(Math.random() * seeds.length)];
                msg = `Merchant: "Got some spare ${gift.replace('-seed', '')} seeds for my favorite farmer!"`;
            } else if (npcName === 'fisherman') {
                gift = 'fish';
                msg = `Fisherman: "Had a great haul today, here's a fresh one for ye."`;
            } else if (npcName === 'blacksmith') {
                gift = 'stone';
                msg = `Blacksmith: "Clearin' out some scrap stone. Take it if ye like."`;
            }

            player.inventory[gift] = (player.inventory[gift] || 0) + 1;
            player.lastNPCDailyGiftTime[npcName] = currentTime;
            notify(socket.id, msg, 'success');
            socket.emit('entityUpdate', player);
            // Removed 'return' to allow primary interaction logic to continue
        }

        if (animal.species === 'miner' || animal.species === 'blacksmith' || animal.species === 'fisherman' || animal.species === 'merchant') {
            const npcKey = animal.species.charAt(0).toUpperCase() + animal.species.slice(1);
            if (currentGlobalRequest && currentGlobalRequest.npc === npcKey) {
                const item = currentGlobalRequest.item;
                const inInventory = player.inventory[item] || 0;
                if (inInventory >= currentGlobalRequest.count) {
                    const price = ITEM_PRICES[item] || 10;
                    const reward = Math.floor(price * currentGlobalRequest.count * 2.0); // 2x bonus
                    player.inventory[item] -= currentGlobalRequest.count;
                    player.coins += reward;

                    const oldPoints = player.relationships[animal.species] || 0;
                    const newPoints = Math.min(1000, oldPoints + 20);
                    player.relationships[animal.species] = newPoints;

                    checkNPCMilestones(player, animal.species, oldPoints, newPoints);
                    socket.emit('entityUpdate', player);
                    notify(socket.id, `${npcKey}: "Exactly what I needed! Here's ${reward} coins for your trouble." (+20 friendship)`, 'success');
                    checkAchievements(player);
                    return; // Don't proceed to normal trade/interaction
                }
            }
        }

        if (animal.species === 'miner') {
          const minerItems = ['iron-ore', 'gold-ore', 'stone', 'coal', 'amethyst', 'topaz', 'emerald', 'ruby', 'diamond'];
          let earned = 0;
          minerItems.forEach(item => {
            const count = player.inventory[item] || 0;
            if (count > 0) {
              const basePrice = ITEM_PRICES[item] || 10;
              earned += Math.floor(count * basePrice * 1.25);
              player.inventory[item] = 0;
            }
          });

          if (earned > 0) {
            player.coins += earned;
            notify(socket.id, `Miner: "Aha! These are top quality. Here's ${earned} coins."`, 'success');
            socket.emit('entityUpdate', player);
            checkAchievements(player);
          } else {
            // Check if player can buy dynamite
            if (player.coins >= 50) {
              player.coins -= 50;
              player.inventory['dynamite'] = (player.inventory['dynamite'] || 0) + 1;
              notify(socket.id, `Miner: "Careful with this! Dynamite's a powerful tool."`, 'success');
              socket.emit('entityUpdate', player);
            } else {
              const heartLevel = Math.floor((player.relationships['miner'] || 0) / 100);
              let dialogues = [
                "The depths hold many secrets... and much gold.",
                "Digging deep is dangerous, but the rewards are worth it.",
                "You looking for something that goes 'boom'?",
                "I'll buy any ores you find for a fair price.",
                "Dynamite costs 50 coins. Use it wisely."
              ];
              if (heartLevel >= 5) {
                dialogues = [
                  "You've got the spirit of a true delver, friend.",
                  "I trust you more than my own pickaxe these days.",
                  "Found anything particularly shiny lately?",
                  "The deeper you go, the more you learn about yourself.",
                  "Be safe out there. The caves don't forgive mistakes."
                ];
              }
              notify(socket.id, `Miner: "${dialogues[Math.floor(Math.random() * dialogues.length)]}"`, 'info');
            }
          }
          return;
        }

        if (animal.species === 'fisherman') {
          const fishItems = ['fish', 'bass', 'trout', 'salmon', 'ghost-fish', 'golden-hexfish'];
          let earned = 0;
          const isExpert = player.perks.includes('perk-fisherman');
          const expertBonus = isExpert ? 1.1 : 1.0;

          fishItems.forEach(item => {
            const count = player.inventory[item] || 0;
            if (count > 0) {
              const basePrice = ITEM_PRICES[item] || 40;
              earned += Math.floor(count * basePrice * 1.25 * expertBonus);
              player.inventory[item] = 0;
            }
          });

          if (earned > 0) {
            player.coins += earned;
            notify(socket.id, `Fisherman: "That's some fine catch! Here's ${earned} coins."`, 'success');
            socket.emit('entityUpdate', player);
            checkAchievements(player);
          } else {
            const heartLevel = Math.floor((player.relationships['fisherman'] || 0) / 100);
            let dialogues = [
              "Nice day for fishing, ain't it?",
              "The big ones are always near the center of the ponds.",
              "I'll buy any fish you catch for 50 coins a piece.",
              "Heard of the legendary Golden Hexfish? Me neither.",
              "Quiet... you'll scare 'em away!"
            ];
            if (heartLevel >= 5) {
                dialogues = [
                    "You've got a good cast, I can tell.",
                    "The water tells many stories, if you're patient enough to listen.",
                    "Always happy to see a fellow angler.",
                    "I'll let you in on a secret: the best bait is patience.",
                    "It's peaceful here, isn't it?"
                ];
            }
            notify(socket.id, `Fisherman: "${dialogues[Math.floor(Math.random() * dialogues.length)]}"`, 'info');
          }
          return;
        }

        if (animal.species === 'blacksmith') {
          const isApprentice = player.perks.includes('perk-blacksmith');
          const upgradeMultiplier = isApprentice ? 0.8 : 1.0;

          const upgrades = [
            { base: 'hoe', upgrade: 'copper-hoe', price: Math.floor(200 * upgradeMultiplier), ore: null, oreCount: 0 },
            { base: 'watering-can', upgrade: 'copper-watering-can', price: Math.floor(200 * upgradeMultiplier), ore: null, oreCount: 0 },
            { base: 'axe', upgrade: 'copper-axe', price: Math.floor(200 * upgradeMultiplier), ore: null, oreCount: 0 },
            { base: 'pickaxe', upgrade: 'copper-pickaxe', price: Math.floor(200 * upgradeMultiplier), ore: null, oreCount: 0 },
          { base: 'scythe', upgrade: 'copper-scythe', price: Math.floor(300 * upgradeMultiplier), ore: null, oreCount: 0 },
          { base: 'fishing-rod', upgrade: 'copper-fishing-rod', price: Math.floor(250 * upgradeMultiplier), ore: null, oreCount: 0 },
            { base: 'copper-hoe', upgrade: 'iron-hoe', price: Math.floor(500 * upgradeMultiplier), ore: 'iron-bar', oreCount: 3 },
            { base: 'copper-watering-can', upgrade: 'iron-watering-can', price: Math.floor(500 * upgradeMultiplier), ore: 'iron-bar', oreCount: 3 },
            { base: 'copper-axe', upgrade: 'iron-axe', price: Math.floor(500 * upgradeMultiplier), ore: 'iron-bar', oreCount: 3 },
            { base: 'copper-pickaxe', upgrade: 'iron-pickaxe', price: Math.floor(500 * upgradeMultiplier), ore: 'iron-bar', oreCount: 3 },
            { base: 'copper-scythe', upgrade: 'iron-scythe', price: Math.floor(600 * upgradeMultiplier), ore: 'iron-bar', oreCount: 3 },
            { base: 'copper-fishing-rod', upgrade: 'iron-fishing-rod', price: Math.floor(500 * upgradeMultiplier), ore: 'iron-bar', oreCount: 3 },
            { base: 'iron-hoe', upgrade: 'gold-hoe', price: Math.floor(1000 * upgradeMultiplier), ore: 'gold-bar', oreCount: 3 },
            { base: 'iron-watering-can', upgrade: 'gold-watering-can', price: Math.floor(1000 * upgradeMultiplier), ore: 'gold-bar', oreCount: 3 },
            { base: 'iron-axe', upgrade: 'gold-axe', price: Math.floor(1000 * upgradeMultiplier), ore: 'gold-bar', oreCount: 3 },
            { base: 'iron-pickaxe', upgrade: 'gold-pickaxe', price: Math.floor(1000 * upgradeMultiplier), ore: 'gold-bar', oreCount: 3 },
            { base: 'iron-scythe', upgrade: 'gold-scythe', price: Math.floor(1200 * upgradeMultiplier), ore: 'gold-bar', oreCount: 3 },
            { base: 'iron-fishing-rod', upgrade: 'gold-fishing-rod', price: Math.floor(1000 * upgradeMultiplier), ore: 'gold-bar', oreCount: 3 },
          ];

          const availableUpgrade = upgrades.find(u =>
            (player.inventory[u.base] || 0) > 0 &&
            (player.inventory[u.upgrade] || 0) === 0 &&
            player.coins >= u.price &&
            (!u.ore || (player.inventory[u.ore] || 0) >= u.oreCount)
          );

          if (availableUpgrade) {
            player.coins -= availableUpgrade.price;
            if (availableUpgrade.ore) {
                player.inventory[availableUpgrade.ore] -= availableUpgrade.oreCount;
            }
            player.inventory[availableUpgrade.base]--;
            player.inventory[availableUpgrade.upgrade] = 1;
            notify(socket.id, `Upgraded to ${availableUpgrade.upgrade.replace('-', ' ')}!`, 'success');
            socket.emit('entityUpdate', player);
            checkAchievements(player);
          } else if ((player.inventory['geode'] || 0) > 0 && player.coins >= 20) {
              player.inventory['geode']--;
              player.coins -= 20;
              const rand = Math.random();
              let reward = 'coal';
              if (rand < 0.05) reward = 'diamond';
              else if (rand < 0.15) reward = 'ruby';
              else if (rand < 0.25) reward = 'emerald';
              else if (rand < 0.35) reward = 'topaz';
              else if (rand < 0.45) reward = 'amethyst';
              else if (rand < 0.55) reward = 'gold-ore';
              else if (rand < 0.7) reward = 'iron-ore';
              else reward = 'coal';

              player.inventory[reward] = (player.inventory[reward] || 0) + 1;
              notify(socket.id, `Blacksmith cracked the geode! You found a ${reward.replace('-', ' ')}.`, 'success');
              socket.emit('entityUpdate', player);
          } else {
            const heartLevel = Math.floor((player.relationships['blacksmith'] || 0) / 100);
            let dialogues = [
              "Aye, what can I do for ye?",
              "Looking to sharpen your tools? You've come to the right place.",
              "Copper tools are a farmer's best friend, but Iron is for masters.",
              "Hot enough for ye? The forge is always roaring.",
              "Bring me some coins and ore, and I'll show you what real craftsmanship looks like.",
              "I can crack open those geodes for ye, only 20 coins a pop.",
              "For Iron upgrades, I need 500 coins and 3 Iron Bars.",
              "For Gold upgrades, I need 1000 coins and 3 Gold Bars."
            ];
            if (heartLevel >= 5) {
                dialogues = [
                    "Ah, my favorite customer! Need some work done?",
                    "Your tools have seen some hard work, I like that.",
                    "Steady hand and a heavy hammer, that's the secret.",
                    "I've been working on something special, maybe I'll show you one day.",
                    "Good to see you again. The forge is always ready for you."
                ];
            }
            notify(socket.id, `Blacksmith: "${dialogues[Math.floor(Math.random() * dialogues.length)]}"`, 'info');
          }
          return;
        }

        if (animal.species === 'merchant') {
          let questHandled = false;

          const heartLevel = Math.floor((player.relationships['merchant'] || 0) / 100);
          let dialogues = [
            "Hello there! Hard work pays off, doesn't it?",
            "Fresh air, good soil... what more could a farmer want?",
            "If you have extra crops, I'm always buying!",
            "Seen any rare minerals lately? I'm looking to expand my collection.",
            "That's some fine looking produce you've got there.",
            "The seasons are changing... better keep an eye on your crops!",
            "I heard there are wild berries growing to the east."
          ];
          if (heartLevel >= 5) {
              dialogues = [
                  "Always a pleasure to do business with you, friend.",
                  "You're making quite a name for yourself around here.",
                  "I've got some interesting news from the neighboring lands...",
                  "Your farm is looking better every day!",
                  "It's good to have someone I can rely on."
              ];
          }
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
                  const species = ['turnip', 'carrot', 'pumpkin', 'corn', 'wheat', 'winter-radish', 'sunflower'][Math.floor(Math.random() * 7)];
                  const count = 5 + Math.floor(Math.random() * 10);
                  player.activeQuest = { species, count, collected: 0 };
                  socket.emit('entityUpdate', player);
                  notify(socket.id, `Merchant: "I have a special request. Bring me ${count} ${species}!"`, 'info');
                  questHandled = true;
              }
          }

          // Sell crops and products
          let earned = 0;
          const isGuildMember = player.perks.includes('perk-merchant');
          const priceMultiplier = isGuildMember ? 1.2 : 1.0;

          const resourceItems = ['wood', 'stone', 'junk', 'coal', 'iron-ore', 'gold-ore', 'iron-bar', 'gold-bar', 'amethyst', 'topaz', 'emerald', 'ruby', 'diamond', 'compost-fertilizer', 'ancient-coin', 'geode', 'rusty-cog', 'ancient-statue', 'old-tablet'];
          Object.keys(ITEM_PRICES).forEach(item => {
            // Don't sell the item we have an active quest for
            if (player.activeQuest && player.activeQuest.species === item) return;
            // Don't sell resources automatically
            if (resourceItems.includes(item)) return;

            if (player.inventory[item] > 0) {
              earned += Math.floor(player.inventory[item] * ITEM_PRICES[item] * priceMultiplier);
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
        const isFarmAnimal = ['cow', 'sheep', 'chicken', 'pig', 'goat', 'duck'].includes(animal.species);

        if (isFarmAnimal && now - animal.lastProductTime >= GAME_DAY) {
          let product = '';
          const friendship = animal.friendship || 0;
          const isHighQuality = friendship > 500 && Math.random() < 0.2;

          if (animal.species === 'cow') product = isHighQuality ? 'large-milk' : 'milk';
          else if (animal.species === 'sheep') product = isHighQuality ? 'golden-wool' : 'wool';
          else if (animal.species === 'chicken') product = isHighQuality ? 'golden-egg' : 'egg';
          else if (animal.species === 'pig') product = 'truffle';
          else if (animal.species === 'goat') product = isHighQuality ? 'large-goat-milk' : 'goat-milk';
          else if (animal.species === 'duck') product = isHighQuality ? 'golden-duck-egg' : 'duck-egg';

          if (product) {
            player.inventory[product] = (player.inventory[product] || 0) + 1;
            animal.lastProductTime = now;
            world.updateEntity(animal);
            socket.emit('entityUpdate', player);
            io.emit('entityUpdate', animal);
            const qualityMsg = isHighQuality ? " (High Quality!)" : "";
            notify(socket.id, `Collected ${product.replace('-', ' ')}${qualityMsg}!`, 'success');
          }
        } else if (isFarmAnimal || animal.species === 'dog' || animal.species === 'cat') {
          // Petting logic
          if (now - (animal.lastPetTime || 0) >= GAME_DAY) {
              animal.friendship = Math.min(1000, (animal.friendship || 0) + 10);
              animal.lastPetTime = now;
              world.updateEntity(animal);
              io.emit('entityUpdate', animal);
              socket.emit('entityUpdate', player);
              io.emit('pet_interact', { pos: animal.pos });

              if (animal.species === 'dog' || animal.species === 'cat') {
                  const isDog = animal.species === 'dog';
                  notify(socket.id, isDog ? "Woof! The dog wags its tail. friendship increased!" : "Meow! The cat purrs. friendship increased!", 'success');

                  // Reward at 500+ points
                  if (animal.friendship >= 500 && Math.random() < 0.2) {
                      const rewards = ['turnip-seed', 'carrot-seed', 'pumpkin-seed', 'corn-seed', 'wheat-seed', 'junk'];
                      const reward = rewards[Math.floor(Math.random() * rewards.length)];
                      player.inventory[reward] = (player.inventory[reward] || 0) + 1;
                      notify(socket.id, `${isDog ? 'The dog' : 'The cat'} brought you a ${reward.replace('-seed', '')}!`, 'success');
                  }
              } else {
                  notify(socket.id, `You petted the ${animal.species}. friendship increased!`, 'success');
              }
          } else {
              if (animal.species === 'dog') notify(socket.id, "The dog is napping.", 'info');
              else if (animal.species === 'cat') notify(socket.id, "The cat is busy grooming.", 'info');
              else notify(socket.id, `The ${animal.species} is content.`, 'info');
          }
        } else {
            if (animal.species === 'dog') notify(socket.id, "The dog is napping.", 'info');
            else if (animal.species === 'cat') notify(socket.id, "The cat is busy grooming.", 'info');
            else notify(socket.id, "This animal isn't ready to give anything yet.", 'info');
        }
        return;
      }

      // If no other interaction, try harvesting mature plants at current position
      const localEntities = world.getEntitiesAt(player.pos.q, player.pos.r);
      const maturePlant = localEntities.find(e => e.type === 'plant' && (e as Plant).growthStage >= 5) as Plant | undefined;
      if (maturePlant) {
          if (maturePlant.species === 'wood-stick') {
            world.removeEntity(maturePlant.id, maturePlant.pos.q, maturePlant.pos.r);
            player.inventory['wood'] = (player.inventory['wood'] || 0) + 1;
            const { leveledUp, newLevel } = addXP(player, 'foraging', 2);
            if (leveledUp) notify(socket.id, `Your foraging skill leveled up to ${newLevel}!`, 'success');
            io.emit('entityRemove', { id: maturePlant.id, pos: maturePlant.pos });
            socket.emit('entityUpdate', player);
            notify(socket.id, "Picked up a stick.", 'success');
            return;
          }

          if (maturePlant.species === 'apple-tree' || maturePlant.species === 'orange-tree' || maturePlant.species === 'berry-bush') {
              // These already have logic above for periodic harvesting via interact,
              // but let's ensure we don't fall through to generic harvest if it was just harvested.
              return;
          }

          world.removeEntity(maturePlant.id, maturePlant.pos.q, maturePlant.pos.r);
          const species = maturePlant.species || 'unknown';

          // Give crop
          player.inventory[species] = (player.inventory[species] || 0) + 1;
          player.stats['harvested_total'] = (player.stats['harvested_total'] || 0) + 1;

          // XP Gain
          const xpGained = species === 'mushroom' ? 5 : 10;
          const skill = species === 'mushroom' ? 'foraging' : 'farming';
          const sCost = getStaminaCost(player, skill, 5);
          if (!hasStamina(player, sCost)) return;

          player.stamina -= getEffectiveStaminaCost(player, sCost);
          const { leveledUp, newLevel } = addXP(player, skill, xpGained);
          if (leveledUp) {
              notify(socket.id, `Your ${skill} skill leveled up to ${newLevel}!`, 'success');
              checkAchievements(player);
          }

          // Chance to give 1-2 seeds
          let seedsGained = 0;
          if (species !== 'mushroom') {
              const seedType = `${species}-seed`;
              const farmingLuck = player.buffs.find(b => b.type === 'farming_luck');
              seedsGained = (Math.floor(Math.random() * 2) + 1) + (farmingLuck ? 1 : 0);
              player.inventory[seedType] = (player.inventory[seedType] || 0) + seedsGained;
          }

          const seedMsg = seedsGained > 0 ? ` Gained ${seedsGained} seeds.` : '';
          notify(socket.id, `Harvested ${species}!${seedMsg}`, 'success');

          io.emit('entityRemove', { id: maturePlant.id, pos: maturePlant.pos });
          socket.emit('entityUpdate', player);
          checkAchievements(player);
          return;
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

      const staminaGain = FOOD_VALUES[item];
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
        } else if (item === 'miners-stew') {
            player.buffs = player.buffs.filter(b => b.type !== 'mining_luck');
            player.buffs.push({ type: 'mining_luck', amount: 1, expiresAt: Date.now() + 5 * 60 * 1000 }); // 5 mins
            notify(socket.id, "You feel lucky! Iron ore is easier to find.", 'success');
        } else if (item === 'veggie-platter') {
            player.buffs = player.buffs.filter(b => b.type !== 'stamina_efficiency');
            player.buffs.push({ type: 'stamina_efficiency', amount: 0.25, expiresAt: Date.now() + 10 * 60 * 1000 }); // 10 mins
            notify(socket.id, "A healthy meal! You feel efficient. Stamina costs reduced.", 'success');
        } else if (item === 'fruity-sorbet') {
            player.buffs = player.buffs.filter(b => b.type !== 'farming_luck');
            player.buffs.push({ type: 'farming_luck', amount: 1, expiresAt: Date.now() + 5 * 60 * 1000 });
            notify(socket.id, "Sweet sorbet! Farming seems luckier.", 'success');
        } else if (item === 'hearty-stew') {
            player.buffs = player.buffs.filter(b => b.type !== 'foraging_luck');
            player.buffs.push({ type: 'foraging_luck', amount: 1, expiresAt: Date.now() + 5 * 60 * 1000 });
            notify(socket.id, "Hearty stew! Foraging discovery rewards increased.", 'success');
        } else if (item === 'seafood-platter') {
            player.buffs = player.buffs.filter(b => b.type !== 'fishing_luck');
            player.buffs.push({ type: 'fishing_luck', amount: 1, expiresAt: Date.now() + 5 * 60 * 1000 });
            notify(socket.id, "Seafood platter! Fish are biting more often.", 'success');
        } else if (item === 'royal-breakfast') {
            const oldMaxBuff = player.buffs.find(b => b.type === 'max_stamina');
            if (oldMaxBuff) {
                player.maxStamina -= oldMaxBuff.amount;
            }
            player.buffs = player.buffs.filter(b => b.type !== 'max_stamina');
            player.buffs.push({ type: 'max_stamina', amount: 50, expiresAt: Date.now() + 10 * 60 * 1000 });
            player.maxStamina += 50;
            player.stamina = Math.min(player.maxStamina, player.stamina + 50); // Immediate boost
            notify(socket.id, "A Royal Breakfast! Your maximum stamina has increased.", 'success');
        } else if (item === 'golden-omelette') {
            player.buffs = player.buffs.filter(b => b.type !== 'stamina_efficiency');
            player.buffs.push({ type: 'stamina_efficiency', amount: 0.25, expiresAt: Date.now() + 10 * 60 * 1000 });
            notify(socket.id, "Golden Omelette! You feel incredibly efficient.", 'success');
        } else if (item === 'honey-glazed-carrots') {
            player.buffs = player.buffs.filter(b => b.type !== 'farming_luck');
            player.buffs.push({ type: 'farming_luck', amount: 1, expiresAt: Date.now() + 5 * 60 * 1000 });
            notify(socket.id, "Sweet carrots! Farming seems luckier.", 'success');
        } else if (item === 'berry-smoothie') {
            player.buffs = player.buffs.filter(b => b.type !== 'stamina_regen');
            player.buffs.push({ type: 'stamina_regen', amount: 1, expiresAt: Date.now() + 5 * 60 * 1000 });
            notify(socket.id, "Berry smoothie! You feel refreshed.", 'success');
        } else if (item === 'duck-egg-mayo') {
            player.buffs = player.buffs.filter(b => b.type !== 'fishing_luck');
            player.buffs.push({ type: 'fishing_luck', amount: 1, expiresAt: Date.now() + 5 * 60 * 1000 });
            notify(socket.id, "Duck egg mayo! Ready to catch some fish.", 'success');
        } else if (item === 'fruit-medley') {
            player.buffs = player.buffs.filter(b => b.type !== 'foraging_luck');
            player.buffs.push({ type: 'foraging_luck', amount: 1, expiresAt: Date.now() + 5 * 60 * 1000 });
            notify(socket.id, "Fruit medley! Nature seems to hold more secrets.", 'success');
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

      const ingredients = RECIPES[recipe];
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

      player.stamina -= getEffectiveStaminaCost(player, sCost);
      const fishingLuck = player.buffs.find(b => b.type === 'fishing_luck');
      const isExpert = player.perks.includes('perk-fisherman');

      const hasGoldRod = (player.inventory['gold-fishing-rod'] || 0) > 0;
      const hasIronRod = (player.inventory['iron-fishing-rod'] || 0) > 0;
      const hasCopperRod = (player.inventory['copper-fishing-rod'] || 0) > 0;
      const rodBonus = hasGoldRod ? 0.15 : (hasIronRod ? 0.10 : (hasCopperRod ? 0.05 : 0));

      const catchChance = 0.3 + (fishingLuck ? 0.2 : 0) + rodBonus;
      const rand = Math.random();
      if (rand < catchChance) {
        const isCave = player.pos.q >= 10000;
        let caughtItem = 'fish';
        const itemRand = Math.random();

        if (isCave) {
            if (itemRand < 0.1) caughtItem = 'ghost-fish';
            else if (itemRand < 0.4) caughtItem = 'trout';
            else if (itemRand < 0.7) caughtItem = 'bass';
            else caughtItem = 'fish';
        } else {
            if (itemRand < 0.05) caughtItem = 'golden-hexfish';
            else if (itemRand < 0.2) caughtItem = 'salmon';
            else if (itemRand < 0.4) caughtItem = 'bass';
            else caughtItem = 'fish';
        }

        player.inventory[caughtItem] = (player.inventory[caughtItem] || 0) + 1;
        player.stats['fish_caught'] = (player.stats['fish_caught'] || 0) + 1;
        checkAchievements(player);

        // XP Gain
        const { leveledUp, newLevel } = addXP(player, 'fishing', 15);
        if (leveledUp) notify(socket.id, `Your fishing skill leveled up to ${newLevel}!`, 'success');

        notify(socket.id, `You caught a ${caughtItem.replace('-', ' ')}!`, 'success');
        checkAchievements(player);
      } else if (rand < 0.6 && !isExpert) {
        player.inventory['junk'] = (player.inventory['junk'] || 0) + 1;
        notify(socket.id, "You caught some junk...", 'info');
      } else if (rand < 0.6 && isExpert) {
          notify(socket.id, "Nothing's biting, but your expertise kept you from catching junk.", 'info');
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

      player.stamina -= getEffectiveStaminaCost(player, 20);
      world.removeEntity(player.id, player.pos.q, player.pos.r);
      player.pos = { q: 0, r: 0 };
      world.addEntity(player);

      io.emit('entityUpdate', player);
      notify(socket.id, "Teleported home!", 'success');
    }
  });

  socket.on('use_dynamite', () => {
    const player = players.get(socket.id);
    if (player) {
        if ((player.inventory['dynamite'] || 0) <= 0) {
            notify(socket.id, "You don't have any dynamite!", 'error');
            return;
        }

        player.inventory['dynamite']--;
        const targets = [player.pos, ...getNeighbors(player.pos)];
        targets.forEach(pos => {
            const entities = world.getEntitiesAt(pos.q, pos.r);
            entities.forEach(e => {
                if (e.type === 'obstacle' && e.species !== 'water') {
                    world.removeEntity(e.id, e.pos.q, e.pos.r);
                    io.emit('entityRemove', { id: e.id, pos: e.pos });
                } else if (e.type === 'fence' || e.type === 'building' || e.type === 'sprinkler') {
                    world.removeEntity(e.id, e.pos.q, e.pos.r);
                    io.emit('entityRemove', { id: e.id, pos: e.pos });
                } else if (e.type === 'plant') {
                    world.removeEntity(e.id, e.pos.q, e.pos.r);
                    io.emit('entityRemove', { id: e.id, pos: e.pos });
                }
            });
        });

        socket.emit('entityUpdate', player);
        notify(socket.id, "BOOM! Dynamite exploded.", 'success');
        io.emit('chat', {
          sender: 'System',
          senderId: 'system',
          message: `${player.name} used dynamite! BOOM!`,
          timestamp: Date.now()
        });
    }
  });

  socket.on('chat', (message: string) => {
    const player = players.get(socket.id);
    if (player) {
      const sanitized = message.substring(0, 200).trim();
      if (!sanitized) return;

      // Handle simple commands
      if (sanitized.startsWith('/gift ')) {
        const parts = sanitized.split(' ');
        if (parts.length >= 3) {
          const npcName = parts[1].toLowerCase();
          const itemName = parts[2].toLowerCase();

          const entities = [
            ...world.getEntitiesAt(player.pos.q, player.pos.r),
            ...getNeighbors(player.pos).flatMap(n => world.getEntitiesAt(n.q, n.r))
          ];

          const npc = entities.find(e => e.type === 'animal' && e.species === npcName) as any;
          if (!npc) {
            notify(socket.id, `No ${npcName} nearby to gift!`, 'error');
            return;
          }

          if ((player.inventory[itemName] || 0) <= 0) {
            notify(socket.id, `You don't have any ${itemName}!`, 'error');
            return;
          }

          const now = Date.now();
          if (now - (player.lastGiftTime[npcName] || 0) < GAME_DAY) {
            notify(socket.id, `You've already given ${npcName} a gift today!`, 'error');
            return;
          }

          // Gifting Logic
          player.inventory[itemName]--;
          player.lastGiftTime[npcName] = now;

          const likes: Record<string, string[]> = {
            'merchant': ['pumpkin', 'apple-pie', 'honey'],
            'blacksmith': ['iron-ore', 'gold-ore', 'stone'],
            'fisherman': ['fish', 'grilled-fish', 'corn-chowder'],
            'miner': ['mushroom', 'miners-stew', 'pumpkin-soup']
          };

          const dislikes: Record<string, string[]> = {
            'merchant': ['junk'],
            'blacksmith': ['wood', 'wool'],
            'fisherman': ['junk', 'apple'],
            'miner': ['junk', 'milk']
          };

          let points = 20; // Base points
          if (likes[npcName]?.includes(itemName)) {
            points = 50;
            notify(socket.id, `${npcName.charAt(0).toUpperCase() + npcName.slice(1)}: "I love this! Thank you!"`, 'success');
          } else if (dislikes[npcName]?.includes(itemName)) {
            points = -10;
            notify(socket.id, `${npcName.charAt(0).toUpperCase() + npcName.slice(1)}: "Ugh, what is this? I don't want it."`, 'info');
          } else {
            notify(socket.id, `${npcName.charAt(0).toUpperCase() + npcName.slice(1)}: "Oh, thank you. That's very kind."`, 'success');
          }

          const oldPoints = player.relationships[npcName] || 0;
          const newPoints = Math.min(1000, Math.max(0, oldPoints + points));
          player.relationships[npcName] = newPoints;

          checkNPCMilestones(player, npcName, oldPoints, newPoints);

          socket.emit('entityUpdate', player);
          return;
        }
      }

      if (sanitized.startsWith('/give ')) {
          const match = sanitized.match(/^\/give\s+"([^"]+)"\s+(\S+)\s*(\d*)$/) || sanitized.match(/^\/give\s+(\S+)\s+(\S+)\s*(\d*)$/);
          if (match) {
              const targetName = match[1];
              const itemName = match[2];
              const count = parseInt(match[3] || '1');

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

    if (sanitized.startsWith('/color ')) {
        const parts = sanitized.split(' ');
        if (parts.length >= 2) {
            let colorStr = parts[1].replace('#', '');
            const color = parseInt(colorStr, 16);
            if (!isNaN(color)) {
                player.color = color;
                socket.emit('entityUpdate', player);
                notify(socket.id, `Changed your color to #${colorStr.toUpperCase()}.`, 'success');
                return;
            } else {
                notify(socket.id, "Invalid hex color!", 'error');
                return;
            }
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

let lastDayCount = -1;

// Real game loop
setInterval(() => {
  const { updatedEntities, environment, environmentChanged } = engine.tick();
  updatedEntities.forEach(entity => {
    io.emit('entityUpdate', entity);
  });
  if (environmentChanged) {
    io.emit('environmentUpdate', environment);

    // NPC Daily Request
    if (environment.dayCount !== lastDayCount && environment.timeOfDay < 0.1) {
        lastDayCount = environment.dayCount;
        const npcs = ['Merchant', 'Blacksmith', 'Fisherman', 'Miner'];
        const items = Object.keys(ITEM_PRICES).filter(i => !i.endsWith('-jam') && !RECIPES[i]); // Prefer raw items
        const randomNPC = npcs[Math.floor(Math.random() * npcs.length)];
        const randomItem = items[Math.floor(Math.random() * items.length)];
        const count = 3 + Math.floor(Math.random() * 5);

        currentGlobalRequest = {
            npc: randomNPC,
            item: randomItem,
            count: count,
            day: environment.dayCount
        };

        io.emit('globalRequestUpdate', currentGlobalRequest);
        io.emit('chat', {
            sender: randomNPC,
            senderId: 'npc-request',
            message: `[REQUEST] I'm looking for ${count} ${randomItem.replace('-', ' ')} today! Any helpers?`,
            timestamp: Date.now()
        });
    }
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
