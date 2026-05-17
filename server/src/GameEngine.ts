import { WorldManager } from './WorldManager.js';
import { updatePlant } from './logic/PlantLogic.js';
import { moveAnimal } from './logic/AnimalLogic.js';
import { SeasonManager } from './logic/SeasonManager.js';
import type { Animal, Plant, EnvironmentState } from 'common';
import { getChunkCoords, getNeighbors, getRecursiveNeighbors, distance, GAME_DAY, SEED_PRICES, CHUNK_SIZE } from 'common';

export class GameEngine {
  private seasonManager: SeasonManager;

  constructor(private world: WorldManager) {
    this.seasonManager = new SeasonManager();
  }

  tick(): { updatedEntities: any[], environment: EnvironmentState, environmentChanged: boolean } {
    const chunks = this.world.getActiveChunks();
    const updatedEntities: any[] = [];
    const now = Date.now();

    const environmentChanged = this.seasonManager.update(now);
    const environment = this.seasonManager.getState();

    const updates: { oldEntity: any, newEntity: any, cq: number, cr: number }[] = [];

    // Find all sprinklers, scarecrows and beehives and their ranges
    const sprinklerPositions = new Set<string>();
    const scarecrowPositions = new Set<string>();
    const beehivePositions = new Set<string>();
    const greenhousePositions = new Set<string>();
    const sunflowerPositions = new Set<string>();
    const natureGracePositions = new Set<string>(); // Optimized: Pre-calculate nature counts
    const barnPositions = new Map<string, any>();
    const fountainPositions = new Set<string>();

    const natureEntityPositions = new Set<string>();

    chunks.forEach(chunk => {
      chunk.entities.forEach(entity => {
        if (entity.type === 'sprinkler') {
          const radius = entity.species === 'gold-sprinkler' ? 3 : (entity.species === 'iron-sprinkler' ? 2 : 1);

          getRecursiveNeighbors(entity.pos, radius).forEach(n => {
              sprinklerPositions.add(`${n.q},${n.r}`);
          });
        } else if (entity.type === 'obstacle' && entity.species === 'scarecrow') {
            scarecrowPositions.add(`${entity.pos.q},${entity.pos.r}`);
            getNeighbors(entity.pos).forEach(n1 => {
                scarecrowPositions.add(`${n1.q},${n1.r}`);
                getNeighbors(n1).forEach(n2 => {
                    scarecrowPositions.add(`${n2.q},${n2.r}`);
                });
            });
        } else if (entity.type === 'building' && entity.species === 'beehive') {
            beehivePositions.add(`${entity.pos.q},${entity.pos.r}`);
            getNeighbors(entity.pos).forEach(n1 => {
                beehivePositions.add(`${n1.q},${n1.r}`);
                getNeighbors(n1).forEach(n2 => {
                    beehivePositions.add(`${n2.q},${n2.r}`);
                });
            });
        } else if (entity.type === 'building' && entity.species === 'greenhouse') {
            greenhousePositions.add(`${entity.pos.q},${entity.pos.r}`);
            getNeighbors(entity.pos).forEach(n1 => {
                greenhousePositions.add(`${n1.q},${n1.r}`);
            });
        } else if ((entity.type === 'floor' || entity.type === 'plant') && (entity.species === 'sunflower' || entity.species === 'flower')) {
            sunflowerPositions.add(`${entity.pos.q},${entity.pos.r}`);
            natureEntityPositions.add(`${entity.pos.q},${entity.pos.r}`);
        } else if (entity.type === 'building' && entity.species === 'fountain') {
            fountainPositions.add(`${entity.pos.q},${entity.pos.r}`);
            getNeighbors(entity.pos).forEach(n1 => {
                fountainPositions.add(`${n1.q},${n1.r}`);
                getNeighbors(n1).forEach(n2 => {
                    fountainPositions.add(`${n2.q},${n2.r}`);
                });
            });
        } else if (entity.type === 'building' && (entity.species === 'barn' || entity.species === 'large-barn')) {
            const barn = entity as any;
            const radius = entity.species === 'large-barn' ? 3 : 2;

            getRecursiveNeighbors(entity.pos, radius).forEach(n => {
                barnPositions.set(`${n.q},${n.r}`, barn);
            });
        }

        if ((entity.type === 'plant' || entity.type === 'obstacle') && (entity.species === 'tree' || entity.species === 'apple-tree' || entity.species === 'orange-tree' || entity.species === 'peach-tree' || entity.species === 'cherry-tree' || entity.species === 'berry-bush') && ((entity as any).growthStage >= 5 || entity.type === 'obstacle')) {
            natureEntityPositions.add(`${entity.pos.q},${entity.pos.r}`);
        }
      });
    });

    // Finalize natureGracePositions based on density
    const potentialGracePos = new Set<string>();
    natureEntityPositions.forEach(posKey => {
        const [q, r] = posKey.split(',').map(Number);
        const center = { q, r };
        potentialGracePos.add(posKey);
        getNeighbors(center).forEach(n1 => {
            potentialGracePos.add(`${n1.q},${n1.r}`);
            getNeighbors(n1).forEach(n2 => {
                potentialGracePos.add(`${n2.q},${n2.r}`);
            });
        });
    });

    potentialGracePos.forEach(posKey => {
        const [q, r] = posKey.split(',').map(Number);
        let count = 0;
        const range = 2;
        for (let dq = -range; dq <= range; dq++) {
            for (let dr = -range; dr <= range; dr++) {
                if (Math.abs(dq + dr) > range) continue;
                if (natureEntityPositions.has(`${q + dq},${r + dr}`)) {
                    count++;
                }
            }
        }
        if (count >= 3) {
            natureGracePositions.add(posKey);
        }
    });

    // Breeding logic pre-calculation
    const animalPositionsBySpecies = new Map<string, Animal[]>();
    chunks.forEach(chunk => {
        chunk.entities.forEach(entity => {
            if (entity.type === 'animal' && entity.species !== 'merchant') {
                const animal = entity as Animal;
                if (!animalPositionsBySpecies.has(animal.species)) {
                    animalPositionsBySpecies.set(animal.species, []);
                }
                animalPositionsBySpecies.get(animal.species)!.push(animal);
            }
        });
    });

    chunks.forEach(chunk => {
      // Rare lightning strike during rain
      if (environment.weather === 'rainy' && Math.random() < 0.0005) {
          const trees = chunk.entities.filter(e =>
              (e.type === 'plant' && (e.species === 'tree' || e.species === 'apple-tree' || e.species === 'orange-tree' || e.species === 'peach-tree' || e.species === 'cherry-tree' || e.species === 'berry-bush')) ||
              (e.type === 'obstacle' && e.species === 'tree')
          );
          if (trees.length > 0) {
              const targetTree = trees[Math.floor(Math.random() * trees.length)];
              const burntTree = {
                  ...targetTree,
                  species: 'burnt-tree',
                  growthStage: 0 // Reset or use as indicator
              };
              this.world.updateEntity(burntTree);
              updatedEntities.push(burntTree);
              // We'll broadcast the lightning event via the updatedEntities returning to the main loop
              // but we might need a specific event for the flash.
              (burntTree as any).lightning = true;
          }
      }

      // Meteorite event chance during clear night
      if (environment.timeOfDay > 0.8 || environment.timeOfDay < 0.2) {
          if (environment.weather === 'sunny' && Math.random() < 0.0001) {
              const emptyHexes = [];
              // Find a few random empty hexes in the chunk
              for (let i = 0; i < 10; i++) {
                  const q = chunk.q * CHUNK_SIZE + Math.floor(Math.random() * CHUNK_SIZE);
                  const r = chunk.r * CHUNK_SIZE + Math.floor(Math.random() * CHUNK_SIZE);
                  const ents = this.world.getEntitiesAt(q, r);
                  if (ents.length === 0 || (ents.length === 1 && ents[0].type === 'floor' && ents[0].species === 'grass')) {
                      emptyHexes.push({ q, r });
                  }
              }

              if (emptyHexes.length > 0) {
                  const target = emptyHexes[Math.floor(Math.random() * emptyHexes.length)];
                  const meteorite = {
                      id: `meteorite-${target.q}-${target.r}-${now}`,
                      type: 'obstacle' as const,
                      species: 'meteorite',
                      pos: target
                  };
                  this.world.addEntity(meteorite);
                  updatedEntities.push(meteorite);
                  (meteorite as any).meteoriteStrike = true; // Signal for client visual
              }
          }
      }

      chunk.entities.forEach(entity => {
        let updated: any = entity;
        if (entity.type === 'player') {
          const player = entity as any;
          let staminaRegen = 1.5;

          // Process buffs
          if (player.buffs && player.buffs.length > 0) {
            const initialBuffCount = player.buffs.length;
            const expiredBuffs = player.buffs.filter((b: any) => b.expiresAt <= now);
            player.buffs = player.buffs.filter((b: any) => b.expiresAt > now);

            if (player.buffs.length !== initialBuffCount) {
              updated = { ...player };
              // Revert max_stamina if expired
              expiredBuffs.forEach((b: any) => {
                if (b.type === 'max_stamina') {
                    player.maxStamina -= b.amount;
                    player.stamina = Math.min(player.stamina, player.maxStamina);
                }
              });
            }

            const regenBuff = player.buffs.find((b: any) => b.type === 'stamina_regen');
            if (regenBuff) staminaRegen += regenBuff.amount;
          }

          // Fountain boost
          if (fountainPositions.has(`${player.pos.q},${player.pos.r}`)) {
              staminaRegen += 1.0;
          }

          // Nature's Grace Aura boost (if near 3+ mature trees or flowers)
          if (natureGracePositions.has(`${player.pos.q},${player.pos.r}`)) {
              staminaRegen += 0.5;
              (player as any).hasGrace = true;
          } else {
              (player as any).hasGrace = false;
          }

          if (player.stamina < player.maxStamina) {
            player.stamina = Math.min(player.maxStamina, player.stamina + staminaRegen);
            updated = { ...player };
          }
        } else if (entity.type === 'plant') {
          const plant = entity as Plant;
          const posKey = `${plant.pos.q},${plant.pos.r}`;
          if (sprinklerPositions.has(posKey)) {
            plant.lastWatered = now;
          }

          // Beehive boost
          const originalLastUpdate = plant.lastUpdate;
          if (beehivePositions.has(posKey)) {
              // Simulate 1.5x time passing for the plant
              const elapsed = now - plant.lastUpdate;
              const boostedElapsed = elapsed * 1.5;
              plant.lastUpdate = now - boostedElapsed;
          }

          const isProtected = greenhousePositions.has(posKey);
          updated = updatePlant(plant, now, environment.weather, environment.season, isProtected);
          // Restore original lastUpdate to prevent double-dipping or jumping
          updated.lastUpdate = now;

          // Natural Sowing logic: Mature fruit trees drop seeds on adjacent empty tilled soil
          if (updated.growthStage >= 5 && Math.random() < 0.0005) {
              const fruitTrees = ['apple-tree', 'orange-tree', 'peach-tree', 'cherry-tree'];
              if (fruitTrees.includes(updated.species)) {
                  const neighbors = getNeighbors(updated.pos);
                  const targetPos = neighbors[Math.floor(Math.random() * neighbors.length)];
                  const targetEntities = this.world.getEntitiesAt(targetPos.q, targetPos.r);
                  const hasTilled = targetEntities.some(e => e.type === 'floor' && e.species === 'tilled');
                  const isOccupied = targetEntities.some(e => e.type !== 'floor' && e.type !== 'player');

                  if (hasTilled && !isOccupied) {
                      const newPlant: Plant = {
                          id: `plant-${targetPos.q}-${targetPos.r}-${now}`,
                          type: 'plant',
                          species: updated.species, // Correct species (e.g. apple-tree)
                          pos: targetPos,
                          growthStage: 0,
                          plantedAt: now,
                          lastWatered: 0,
                          lastUpdate: now
                      };
                      this.world.addEntity(newPlant);
                      updatedEntities.push(newPlant);
                  }
              }
          }

          // Pest logic
          if (updated.growthStage >= 5 && !scarecrowPositions.has(posKey)) {
              if (Math.random() < 0.0005) { // 0.05% chance per tick
                  updated.growthStage = 4;
                  // We can't easily notify here without access to IO or socket ID,
                  // but we'll return it as an updated entity which clients will see.
              }
          }

          // Drop wood chance (sticks)
          if (updated.species === 'tree' && updated.growthStage >= 5 && Math.random() < 0.0001) {
              const neighbors = getNeighbors(updated.pos);
              const targetPos = neighbors[Math.floor(Math.random() * neighbors.length)];
              const targetEntities = this.world.getEntitiesAt(targetPos.q, targetPos.r);
              if (targetEntities.length === 0 || (targetEntities.length === 1 && targetEntities[0].type === 'floor' && targetEntities[0].species === 'grass')) {
                  const woodDrop = {
                      id: `resource-wood-${targetPos.q}-${targetPos.r}-${now}`,
                      type: 'plant' as const, // Use plant type so it can be 'harvested' easily or cleared
                      species: 'wood-stick',
                      pos: targetPos,
                      growthStage: 5,
                      plantedAt: now,
                      lastWatered: 0,
                      lastUpdate: now
                  };
                  this.world.addEntity(woodDrop);
                  updatedEntities.push(woodDrop);
              }
          }

          // Propagation logic
          const propagationChance = beehivePositions.has(posKey) ? 0.0005 : 0.0001;
          if (updated.growthStage >= 5 && Math.random() < propagationChance) {
              const neighbors = getNeighbors(updated.pos);
              const targetPos = neighbors[Math.floor(Math.random() * neighbors.length)];
              const targetEntities = this.world.getEntitiesAt(targetPos.q, targetPos.r);
              const isOccupied = targetEntities.some(e =>
                  (e.type !== 'floor' && e.type !== 'player') ||
                  (e.type === 'floor' && e.species === 'path')
              );

              if (!isOccupied) {
                  const newPlant: Plant = {
                      id: `plant-${targetPos.q}-${targetPos.r}-${now}`,
                      type: 'plant',
                      species: updated.species,
                      pos: targetPos,
                      growthStage: 0,
                      plantedAt: now,
                      lastWatered: 0,
                      lastUpdate: now
                  };
                  this.world.addEntity(newPlant);
                  updatedEntities.push(newPlant);
              }
          }
        } else if (entity.type === 'floor' && entity.species === 'tilled') {
            // Soil Reversion logic: Unwatered empty tilled soil reverts to grass
            const isOccupied = this.world.getEntitiesAt(entity.pos.q, entity.pos.r).some(e => e.type !== 'floor' && e.type !== 'player');
            if (!isOccupied && environment.weather !== 'rainy' && Math.random() < 0.0001) {
                const floor = entity as any;
                // We check if any plant was recently watered here? Floor doesn't have lastWatered.
                // Let's assume if it's not raining, there's a chance.
                const grass = {
                    ...floor,
                    species: 'grass'
                };
                this.world.updateEntity(grass);
                updatedEntities.push(grass);
            }
        } else if (entity.type === 'floor' && entity.species === 'grass') {
            // Mushroom spawning during rain
            if (environment.weather === 'rainy' && Math.random() < 0.0001) {
                const targetPos = entity.pos;
                const newMushroom: Plant = {
                    id: `plant-mushroom-${targetPos.q}-${targetPos.r}-${now}`,
                    type: 'plant',
                    species: 'mushroom',
                    pos: targetPos,
                    growthStage: 0,
                    plantedAt: now,
                    lastWatered: now,
                    lastUpdate: now
                };
                this.world.addEntity(newMushroom);
                updatedEntities.push(newMushroom);
            }

            // Flower propagation
            if (Math.random() < 0.00005) {
                const neighbors = getNeighbors(entity.pos);
                const sourceFlower = neighbors.find(n => sunflowerPositions.has(`${n.q},${n.r}`));
                if (sourceFlower) {
                    const sourceEntities = this.world.getEntitiesAt(sourceFlower.q, sourceFlower.r);
                    const flowerEntity = sourceEntities.find(e => (e.type === 'floor' || e.type === 'plant') && (e.species === 'flower' || e.species === 'sunflower'));
                    if (flowerEntity) {
                        const newFlower = {
                            id: `floor-${entity.pos.q}-${entity.pos.r}-${now}`,
                            type: 'floor' as const,
                            species: flowerEntity.species,
                            pos: entity.pos
                        };
                        this.world.addEntity(newFlower);
                        updatedEntities.push(newFlower);
                    }
                }
            }
        } else if (entity.type === 'building') {
            const building = entity as any;
            if (building.species === 'beehive') {
                if (now - (building.lastProductTime || 0) >= GAME_DAY) {
                    building.inventory = building.inventory || {};

                    // Check for sunflowers in 2-hex radius
                    let hasSunflower = false;
                    const posKey = `${building.pos.q},${building.pos.r}`;
                    const sunflowerEnts = this.world.getEntitiesAt(building.pos.q, building.pos.r);
                    if (sunflowerEnts.some(e => e.species === 'sunflower')) {
                        hasSunflower = true;
                    }

                    if (!hasSunflower) {
                        const neighbors1 = getNeighbors(building.pos);
                        for (const n1 of neighbors1) {
                            const n1Ents = this.world.getEntitiesAt(n1.q, n1.r);
                            if (n1Ents.some(e => e.species === 'sunflower')) {
                                hasSunflower = true;
                                break;
                            }
                            const neighbors2 = getNeighbors(n1);
                            for (const n2 of neighbors2) {
                                const n2Ents = this.world.getEntitiesAt(n2.q, n2.r);
                                if (n2Ents.some(e => e.species === 'sunflower')) {
                                    hasSunflower = true;
                                    break;
                                }
                            }
                            if (hasSunflower) break;
                        }
                    }

                    const honeyType = hasSunflower ? 'sunflower-honey' : 'wildflower-honey';
                    building.inventory[honeyType] = (building.inventory[honeyType] || 0) + 1;
                    building.lastProductTime = now;
                    updated = { ...building };
                }
            } else if (building.species === 'birdhouse') {
                if (now - (building.lastProductTime || 0) >= GAME_DAY) {
                    building.inventory = building.inventory || {};
                    const rand = Math.random();
                    let item = 'turnip-seed';
                    if (rand < 0.05) item = 'ancient-coin';
                    else if (rand < 0.1) item = 'geode';
                    else {
                        const seeds = Object.keys(SEED_PRICES);
                        item = seeds[Math.floor(Math.random() * seeds.length)] + '-seed';
                    }
                    building.inventory[item] = (building.inventory[item] || 0) + 1;
                    building.lastProductTime = now;
                    updated = { ...building };
                }
            }
        } else if (entity.type === 'animal') {
          const animal = entity as Animal;
          const isNPC = ['merchant', 'blacksmith', 'fisherman', 'miner'].includes(animal.species);

          if (isNPC && (environment.timeOfDay < 0.25 || environment.timeOfDay > 0.75)) {
              // NPCs go home at night
              if (animal.homePos && (animal.pos.q !== animal.homePos.q || animal.pos.r !== animal.homePos.r)) {
                  // Direct move towards home
                  const neighbors = getNeighbors(animal.pos);
                  const bestMove = neighbors.reduce((prev, curr) => {
                      const prevDist = distance(prev, animal.homePos!);
                      const currDist = distance(curr, animal.homePos!);
                      return currDist < prevDist ? curr : prev;
                  });

                  // Simple collision check for home-bound NPCs
                  const entsAtBest = this.world.getEntitiesAt(bestMove.q, bestMove.r);
                  const blocked = entsAtBest.some(e => e.type === 'obstacle' || e.type === 'building' || e.type === 'fence');

                  if (!blocked) {
                      updated = {
                          ...animal,
                          pos: bestMove,
                          nextMoveTime: now + 2000
                      };
                  }
              } else {
                  // Already home or no homePos, stay put
                  updated = {
                      ...animal,
                      nextMoveTime: now + 10000
                  };
              }
          } else if (!isNPC) {
              // Breeding chance
              const speciesAnimalsInChunk = chunk.entities.filter(e => e.type === 'animal' && (e as Animal).species === animal.species);
              const speciesAnimals = animalPositionsBySpecies.get(animal.species) || [];

              if (speciesAnimalsInChunk.length >= 2 && speciesAnimalsInChunk.length < 10) { // Population control per chunk
                  const lastBred = animal.lastBredTime || 0;
                  if (now - lastBred > GAME_DAY) {
                      const neighbors = getNeighbors(animal.pos);
                      const mate = speciesAnimals.find(other =>
                          other.id !== animal.id &&
                          neighbors.some(n => n.q === other.pos.q && n.r === other.pos.r) &&
                          (now - (other.lastBredTime || 0) > GAME_DAY)
                      );

                      // Barn automation
                      const barn = barnPositions.get(`${animal.pos.q},${animal.pos.r}`);
                      if (barn && now - animal.lastProductTime >= GAME_DAY) {
                          let product = '';
                          if (animal.species === 'cow') product = 'milk';
                          else if (animal.species === 'sheep') product = 'wool';
                          else if (animal.species === 'chicken') product = 'egg';
                          else if (animal.species === 'pig') product = 'truffle';
                          else if (animal.species === 'goat') product = 'goat-milk';
                          else if (animal.species === 'duck') product = 'duck-egg';

                          if (product) {
                              barn.inventory = barn.inventory || {};
                              barn.inventory[product] = (barn.inventory[product] || 0) + 1;
                              animal.lastProductTime = now;
                              if (!updatedEntities.find(e => e.id === barn.id)) {
                                  updatedEntities.push(barn);
                                  this.world.updateEntity(barn);
                              }
                              updated = { ...animal };
                          }
                      }

                      if (mate && Math.random() < 0.001) { // 0.1% chance per tick if mate nearby
                          const babyPos = neighbors.find(n => this.world.getEntitiesAt(n.q, n.r).length === 0);
                          if (babyPos) {
                              const baby: Animal = {
                                  id: `animal-${babyPos.q}-${babyPos.r}-${now}`,
                                  type: 'animal',
                                  species: animal.species,
                                  pos: babyPos,
                                  nextMoveTime: now + 5000,
                                  lastProductTime: now,
                                  lastBredTime: now
                              };
                              this.world.addEntity(baby);
                              updatedEntities.push(baby);
                              animal.lastBredTime = now;
                              mate.lastBredTime = now;
                              updated = { ...animal };
                              // Note: mate will also be updated when the loop reaches it,
                              // or if it was already reached, it might miss one tick but it's fine.
                          }
                      }
                  }
              }

          }

          if (animal.nextMoveTime < now) {
              updated = moveAnimal(animal, this.world);
          }
        }

        if (updated !== entity) {
          updates.push({ oldEntity: entity, newEntity: updated, cq: chunk.q, cr: chunk.r });
        }
      });
    });

    updates.forEach(({ oldEntity, newEntity, cq, cr }) => {
      const { cq: newCQ, cr: newCR } = getChunkCoords(newEntity.pos.q, newEntity.pos.r);

      if (newCQ !== cq || newCR !== cr) {
        // Moved to a different chunk
        this.world.removeEntity(oldEntity.id, oldEntity.pos.q, oldEntity.pos.r);
        this.world.addEntity(newEntity);
      } else {
        // Stayed in the same chunk, just update it
        this.world.updateEntity(newEntity);
      }
      updatedEntities.push(newEntity);
    });

    return { updatedEntities, environment, environmentChanged };
  }

  getNextWeather(): string {
    return this.seasonManager.getNextWeather();
  }
}
