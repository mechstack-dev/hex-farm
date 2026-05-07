import { WorldManager } from './WorldManager.js';
import { updatePlant } from './logic/PlantLogic.js';
import { moveAnimal } from './logic/AnimalLogic.js';
import type { Animal, Plant } from 'common';

export class GameEngine {
  constructor(private world: WorldManager) {}

  tick() {
    // Logic for global updates
  }

  updateEntities(entities: any[]) {
    const now = Date.now();
    return entities.map(e => {
      if (e.type === 'plant') return updatePlant(e as Plant, now);
      if (e.type === 'animal' && (e as Animal).nextMoveTime < now) return moveAnimal(e as Animal, this.world);
      return e;
    });
  }
}
