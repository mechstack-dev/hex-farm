import { WorldManager } from './WorldManager.js';
import { updatePlant } from './logic/PlantLogic.js';
import { moveAnimal } from './logic/AnimalLogic.js';
import { SeasonManager } from './logic/SeasonManager.js';
import type { Animal, Plant, EnvironmentState } from 'common';
import { getChunkCoords, getNeighbors, GAME_DAY } from 'common';

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
    const barnPositions = new Map<string, any>();
    chunks.forEach(chunk => {
      chunk.entities.forEach(entity => {
        if (entity.type === 'sprinkler') {
          const radius = entity.species === 'gold-sprinkler' ? 3 : (entity.species === 'iron-sprinkler' ? 2 : 1);

          const getRecursiveNeighbors = (pos: any, r: number): string[] => {
              let results = new Set<string>();
              results.add(`${pos.q},${pos.r}`);
              let currentRing = [pos];
              for (let i = 0; i < r; i++) {
                  let nextRing: any[] = [];
                  currentRing.forEach(p => {
                      getNeighbors(p).forEach(n => {
                          const key = `${n.q},${n.r}`;
                          if (!results.has(key)) {
                              results.add(key);
                              nextRing.push(n);
                          }
                      });
                  });
                  currentRing = nextRing;
              }
              return Array.from(results);
          };

          getRecursiveNeighbors(entity.pos, radius).forEach(key => {
              sprinklerPositions.add(key);
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
        } else if ((entity.type === 'floor' || entity.type === 'plant') && entity.species === 'sunflower') {
            sunflowerPositions.add(`${entity.pos.q},${entity.pos.r}`);
        } else if (entity.type === 'building' && entity.species === 'barn') {
            const barn = entity as any;
            barnPositions.set(`${entity.pos.q},${entity.pos.r}`, barn);
            getNeighbors(entity.pos).forEach(n1 => {
                barnPositions.set(`${n1.q},${n1.r}`, barn);
                getNeighbors(n1).forEach(n2 => {
                    barnPositions.set(`${n2.q},${n2.r}`, barn);
                });
            });
        }
      });
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

          // Pest logic
          if (updated.growthStage >= 5 && !scarecrowPositions.has(posKey)) {
              if (Math.random() < 0.0005) { // 0.05% chance per tick
                  updated.growthStage = 4;
                  // We can't easily notify here without access to IO or socket ID,
                  // but we'll return it as an updated entity which clients will see.
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
        } else if (entity.type === 'building') {
            const building = entity as any;
            if (building.species === 'beehive') {
                if (now - (building.lastProductTime || 0) >= GAME_DAY) {
                    building.inventory = building.inventory || {};

                    // Check for sunflowers in 2-hex radius
                    let hasSunflower = sunflowerPositions.has(`${building.pos.q},${building.pos.r}`);
                    if (!hasSunflower) {
                        const neighbors1 = getNeighbors(building.pos);
                        for (const n1 of neighbors1) {
                            if (sunflowerPositions.has(`${n1.q},${n1.r}`)) {
                                hasSunflower = true;
                                break;
                            }
                            const neighbors2 = getNeighbors(n1);
                            for (const n2 of neighbors2) {
                                if (sunflowerPositions.has(`${n2.q},${n2.r}`)) {
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
            }
        } else if (entity.type === 'animal') {
          const animal = entity as Animal;
          if (animal.species !== 'merchant' && animal.species !== 'blacksmith' && animal.species !== 'fisherman' && animal.species !== 'miner') {
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

              if (animal.nextMoveTime < now) {
                  updated = moveAnimal(animal, this.world);
              }
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
