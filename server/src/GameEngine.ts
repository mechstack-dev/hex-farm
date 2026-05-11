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
    chunks.forEach(chunk => {
      chunk.entities.forEach(entity => {
        if (entity.type === 'sprinkler') {
          sprinklerPositions.add(`${entity.pos.q},${entity.pos.r}`);
          getNeighbors(entity.pos).forEach(n => {
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
          let staminaRegen = 1;

          // Process buffs
          if (player.buffs && player.buffs.length > 0) {
            const initialBuffCount = player.buffs.length;
            player.buffs = player.buffs.filter((b: any) => b.expiresAt > now);
            if (player.buffs.length !== initialBuffCount) updated = { ...player };

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

          updated = updatePlant(plant, now, environment.weather, environment.season);
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
        } else if (entity.type === 'building') {
            const building = entity as any;
            if (building.species === 'beehive') {
                if (now - (building.lastProductTime || 0) >= GAME_DAY) {
                    building.inventory = building.inventory || {};
                    building.inventory['honey'] = (building.inventory['honey'] || 0) + 1;
                    building.lastProductTime = now;
                    updated = { ...building };
                }
            }
        } else if (entity.type === 'animal') {
          const animal = entity as Animal;
          if (animal.species !== 'merchant') {
              // Breeding chance
              const speciesAnimals = animalPositionsBySpecies.get(animal.species) || [];
              if (speciesAnimals.length >= 2 && speciesAnimals.length < 20) { // Population control
                  const lastBred = animal.lastBredTime || 0;
                  if (now - lastBred > GAME_DAY) {
                      const neighbors = getNeighbors(animal.pos);
                      const mate = speciesAnimals.find(other =>
                          other.id !== animal.id &&
                          neighbors.some(n => n.q === other.pos.q && n.r === other.pos.r) &&
                          (now - (other.lastBredTime || 0) > GAME_DAY)
                      );

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
}
