import { WorldManager } from './WorldManager.js';
import { updatePlant } from './logic/PlantLogic.js';
import { moveAnimal } from './logic/AnimalLogic.js';
import { SeasonManager } from './logic/SeasonManager.js';
import type { Animal, Plant, EnvironmentState } from 'common';
import { getChunkCoords, getNeighbors } from 'common';

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

    // Find all sprinklers and scarecrows and their ranges
    const sprinklerPositions = new Set<string>();
    const scarecrowPositions = new Set<string>();
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
        }
      });
    });

    chunks.forEach(chunk => {
      chunk.entities.forEach(entity => {
        let updated: any = entity;
        if (entity.type === 'player') {
          const player = entity as any;
          if (player.stamina < player.maxStamina) {
            player.stamina = Math.min(player.maxStamina, player.stamina + 1);
            updated = { ...player };
          }
        } else if (entity.type === 'plant') {
          const plant = entity as Plant;
          const posKey = `${plant.pos.q},${plant.pos.r}`;
          if (sprinklerPositions.has(posKey)) {
            plant.lastWatered = now;
          }
          updated = updatePlant(plant, now, environment.weather, environment.season);

          // Pest logic
          if (updated.growthStage >= 5 && !scarecrowPositions.has(posKey)) {
              if (Math.random() < 0.01) { // 1% chance per tick
                  updated.growthStage = 4;
                  // We can't easily notify here without access to IO or socket ID,
                  // but we'll return it as an updated entity which clients will see.
              }
          }
        } else if (entity.type === 'animal' && (entity as Animal).nextMoveTime < now) {
          updated = moveAnimal(entity as Animal, this.world);
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
