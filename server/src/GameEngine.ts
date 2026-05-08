import { WorldManager } from './WorldManager.js';
import { updatePlant } from './logic/PlantLogic.js';
import { moveAnimal } from './logic/AnimalLogic.js';
import type { Animal, Plant } from 'common';

export class GameEngine {
  constructor(private world: WorldManager) {}

  tick() {
    const chunks = this.world.getActiveChunks();
    const updatedEntities: any[] = [];

    chunks.forEach(chunk => {
      const newEntities = this.updateEntities(chunk.entities);

      // Check if any entity actually changed (simple check for now)
      // In a real app, you'd want to be more efficient about what you broadcast
      const changed = newEntities.some((e, i) => e !== chunk.entities[i]);

      if (changed) {
        this.world.updateChunkEntities(chunk.q, chunk.r, newEntities);
        updatedEntities.push(...newEntities.filter((e, i) => e !== chunk.entities[i]));
      }
    });

    return updatedEntities;
  }

  private updateEntities(entities: any[]) {
    const now = Date.now();
    return entities.map(e => {
      if (e.type === 'plant') return updatePlant(e as Plant, now);
      if (e.type === 'animal' && (e as Animal).nextMoveTime < now) return moveAnimal(e as Animal, this.world);
      return e;
    });
  }
}
