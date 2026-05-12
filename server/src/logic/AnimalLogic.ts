import type { Animal } from 'common';
import { getNeighbors } from 'common';
import { WorldManager } from '../WorldManager.js';

export function moveAnimal(animal: Animal, world: WorldManager): Animal {
  const neighbors = getNeighbors(animal.pos);
  const validMoves = neighbors.filter(pos => {
    const entities = world.getEntitiesAt(pos.q, pos.r);
    return !entities.some(e =>
      e.type === 'obstacle' ||
      e.type === 'animal' ||
      e.type === 'player' ||
      e.type === 'fence' ||
      e.type === 'building' ||
      (e.type === 'plant' && (e.species === 'tree' || e.species === 'apple-tree'))
    );
  });

  if (validMoves.length === 0) return animal;

  const nextPos = validMoves[Math.floor(Math.random() * validMoves.length)];
  return {
    ...animal,
    pos: nextPos,
    nextMoveTime: Date.now() + 5000 + Math.random() * 10000
  };
}
