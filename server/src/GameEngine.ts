import { WorldManager } from './WorldManager.js';
import { updatePlant } from './logic/PlantLogic.js';
import { moveAnimal } from './logic/AnimalLogic.js';
import type { Animal, Plant } from 'common';
import { getChunkCoords } from 'common';

export class GameEngine {
  constructor(private world: WorldManager) {}

  tick() {
    const chunks = this.world.getActiveChunks();
    const updatedEntities: any[] = [];
    const now = Date.now();

    const updates: { oldEntity: any, newEntity: any, cq: number, cr: number }[] = [];

    chunks.forEach(chunk => {
      chunk.entities.forEach(entity => {
        let updated: any = entity;
        if (entity.type === 'plant') {
          updated = updatePlant(entity as Plant, now);
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
        const chunk = this.world.getChunk(cq, cr);
        chunk.entities = chunk.entities.map(e => e.id === oldEntity.id ? newEntity : e);
      }
      updatedEntities.push(newEntity);
    });

    return updatedEntities;
  }
}
