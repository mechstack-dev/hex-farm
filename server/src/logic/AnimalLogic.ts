import type { Animal } from 'common';
import { getNeighbors, distance } from 'common';
import { WorldManager } from '../WorldManager.js';

export function moveAnimal(animal: Animal, world: WorldManager): Animal {
  const isNPC = ['merchant', 'blacksmith', 'fisherman', 'miner'].includes(animal.species);
  const neighbors = getNeighbors(animal.pos);
  const validMoves = neighbors.filter(pos => {
    if (isNPC && animal.homePos) {
        if (distance(pos, animal.homePos) > 3) return false;
    }

    const entities = world.getEntitiesAt(pos.q, pos.r);
    return !entities.some(e =>
      e.type === 'obstacle' ||
      e.type === 'animal' ||
      e.type === 'player' ||
      e.type === 'fence' ||
      e.type === 'building' ||
      (e.type === 'plant' && (e.species === 'tree' || e.species === 'apple-tree' || e.species === 'orange-tree' || e.species === 'berry-bush'))
    );
  });

  if (validMoves.length === 0) {
      const waitInterval = isNPC ? (10000 + Math.random() * 20000) : (5000 + Math.random() * 10000);
      return {
          ...animal,
          nextMoveTime: Date.now() + waitInterval
      };
  }

  const nextPos = validMoves[Math.floor(Math.random() * validMoves.length)];
  const moveInterval = isNPC ? (10000 + Math.random() * 20000) : (5000 + Math.random() * 10000);

  return {
    ...animal,
    pos: nextPos,
    nextMoveTime: Date.now() + moveInterval
  };
}
