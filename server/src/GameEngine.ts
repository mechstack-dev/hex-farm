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

    // Find all sprinklers and their ranges
    const sprinklerPositions = new Set<string>();
    chunks.forEach(chunk => {
      chunk.entities.forEach(entity => {
        if (entity.type === 'sprinkler') {
          sprinklerPositions.add(`${entity.pos.q},${entity.pos.r}`);
          getNeighbors(entity.pos).forEach(n => {
            sprinklerPositions.add(`${n.q},${n.r}`);
          });
        }
      });
    });

    chunks.forEach(chunk => {
      chunk.entities.forEach(entity => {
        let updated: any = entity;
        if (entity.type === 'plant') {
          const plant = entity as Plant;
          const posKey = `${plant.pos.q},${plant.pos.r}`;
          if (sprinklerPositions.has(posKey)) {
            plant.lastWatered = now;
          }
          updated = updatePlant(plant, now, environment.weather);
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
