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
        const n = this.noise(q * 0.1, r * 0.1);
        if (n > 0.5) {
          entities.push({
            id: `tree-${q}-${r}`,
            type: 'obstacle',
            pos: { q, r }
          });
        } else if (chunkRng() < 0.05) {
           entities.push({
            id: `rock-${q}-${r}`,
            type: 'obstacle',
            pos: { q, r }
          });
        }
      }
    }
    return entities;
  }
}
