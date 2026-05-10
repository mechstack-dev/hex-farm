import { createNoise2D } from 'simplex-noise';
import seedrandom from 'seedrandom';
import type { Entity } from 'common';

export class Generator {
  private noise: (x: number, y: number) => number;
  private rng: seedrandom.PRNG;

  constructor(seed: string) {
    this.rng = seedrandom(seed);
    this.noise = createNoise2D(() => this.rng());
  }

  generateStaticEntities(cq: number, cr: number, chunkSize: number): Entity[] {
    const entities: Entity[] = [];
    const chunkSeed = `${cq},${cr}`;
    const chunkRng = seedrandom(chunkSeed);

    for (let q = cq * chunkSize; q < (cq + 1) * chunkSize; q++) {
      for (let r = cr * chunkSize; r < (cr + 1) * chunkSize; r++) {
        // Spawn merchant at origin
        if (q === 0 && r === 0) {
            entities.push({
                id: 'animal-merchant',
                type: 'animal',
                species: 'merchant',
                pos: { q: 0, r: 0 },
                nextMoveTime: Infinity, // Merchant doesn't move
                lastProductTime: 0
            } as unknown as Entity);
            continue;
        }

        const n = this.noise(q * 0.1, r * 0.1);
        if (n < -0.4) {
          entities.push({
            id: `water-${q}-${r}`,
            type: 'obstacle',
            species: 'water',
            pos: { q, r }
          });
        } else if (n > 0.5) {
          entities.push({
            id: `tree-${q}-${r}`,
            type: 'obstacle',
            species: 'tree',
            pos: { q, r }
          });
        } else if (chunkRng() < 0.05) {
          entities.push({
            id: `rock-${q}-${r}`,
            type: 'obstacle',
            species: 'rock',
            pos: { q, r }
          });
        } else if (chunkRng() < 0.1) {
          // Decorative floor
          const rand = chunkRng();
          const species = rand < 0.7 ? 'grass' : (rand < 0.9 ? 'flower' : 'sunflower');
          entities.push({
            id: `floor-${q}-${r}`,
            type: 'floor',
            species,
            pos: { q, r }
          });
        } else if (chunkRng() < 0.01) {
          // Spawn animal
          const rand = chunkRng();
          const species = rand < 0.25 ? 'cow' : (rand < 0.5 ? 'sheep' : (rand < 0.75 ? 'chicken' : 'pig'));
          entities.push({
            id: `animal-${q}-${r}`,
            type: 'animal',
            species,
            pos: { q, r },
            nextMoveTime: Date.now() + chunkRng() * 10000,
            lastProductTime: 0
          } as unknown as Entity);
        }
      }
    }
    return entities;
  }
}
