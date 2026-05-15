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
    let fishermanSpawned = false;

    for (let q = cq * chunkSize; q < (cq + 1) * chunkSize; q++) {
      for (let r = cr * chunkSize; r < (cr + 1) * chunkSize; r++) {
        // Spawn merchant at origin
        if (q === 0 && r === 0) {
            entities.push({
                id: 'animal-merchant',
                type: 'animal',
                species: 'merchant',
                pos: { q: 0, r: 0 },
                homePos: { q: 0, r: 0 },
                nextMoveTime: 0,
                lastProductTime: 0
            } as unknown as Entity);
            continue;
        }

        // Spawn blacksmith near merchant
        if (q === 5 && r === 5) {
            entities.push({
                id: 'animal-blacksmith',
                type: 'animal',
                species: 'blacksmith',
                pos: { q: 5, r: 5 },
                homePos: { q: 5, r: 5 },
                nextMoveTime: 0,
                lastProductTime: 0
            } as unknown as Entity);
            continue;
        }

        const isCave = q >= 10000;

        // Spawn miner in cave layer
        if (q === 10005 && r === 10005) {
            entities.push({
                id: 'animal-miner',
                type: 'animal',
                species: 'miner',
                pos: { q: 10005, r: 10005 },
                homePos: { q: 10005, r: 10005 },
                nextMoveTime: 0,
                lastProductTime: 0
            } as unknown as Entity);
            continue;
        }
        const n = this.noise(q * 0.1, r * 0.1);

        if (isCave) {
            // Cave generation
            if (n > 0.4) {
                entities.push({
                    id: `rock-${q}-${r}`,
                    type: 'obstacle',
                    species: 'rock',
                    pos: { q, r }
                });
            } else if (chunkRng() < 0.03) {
                // Mushrooms in caves
                entities.push({
                    id: `plant-mushroom-${q}-${r}`,
                    type: 'plant',
                    species: 'mushroom',
                    pos: { q, r },
                    growthStage: 5,
                    plantedAt: 0,
                    lastWatered: 0,
                    lastUpdate: 0
                } as unknown as Entity);
            } else if (chunkRng() < 0.05) {
                entities.push({
                    id: `floor-${q}-${r}`,
                    type: 'floor',
                    species: 'grass', // Visual placeholder, maybe "moss" later
                    pos: { q, r }
                });
            }
            continue;
        }

        // Spawn Fisherman near water
        if (!fishermanSpawned && n < -0.4 && chunkRng() < 0.05) {
            // Find a neighbor that is NOT water
            const neighbors = [
                { q: q + 1, r: r }, { q: q + 1, r: r - 1 }, { q: q, r: r - 1 },
                { q: q - 1, r: r }, { q: q - 1, r: r + 1 }, { q: q, r: r + 1 }
            ];
            const shore = neighbors.find(pos => this.noise(pos.q * 0.1, pos.r * 0.1) >= -0.4);
            if (shore) {
                // We'll add the fisherman to this chunk's entities if it's within chunk bounds
                // Actually, for simplicity and to avoid duplicates across chunk boundaries,
                // we'll just check if the shore is in THIS chunk.
                if (shore.q >= cq * chunkSize && shore.q < (cq + 1) * chunkSize &&
                    shore.r >= cr * chunkSize && shore.r < (cr + 1) * chunkSize) {
                    entities.push({
                        id: `animal-fisherman-${shore.q}-${shore.r}`,
                        type: 'animal',
                        species: 'fisherman',
                        pos: shore,
                        homePos: shore,
                        nextMoveTime: 0,
                        lastProductTime: 0
                    } as unknown as Entity);
                    fishermanSpawned = true;
                }
            }
        }
        if (n < -0.4) {
          entities.push({
            id: `water-${q}-${r}`,
            type: 'obstacle',
            species: 'water',
            pos: { q, r }
          });
        } else if (n > 0.5) {
          entities.push({
            id: `plant-tree-${q}-${r}`,
            type: 'plant',
            species: 'tree',
            pos: { q, r },
            growthStage: 5,
            plantedAt: 0,
            lastWatered: 0,
            lastUpdate: 0
          } as unknown as Entity);
        } else if (chunkRng() < 0.05) {
          entities.push({
            id: `rock-${q}-${r}`,
            type: 'obstacle',
            species: 'rock',
            pos: { q, r }
          });
        } else if (chunkRng() < 0.001) {
            entities.push({
                id: `shrine-${q}-${r}`,
                type: 'building',
                species: 'ancient-shrine',
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
        } else if (chunkRng() < 0.015) {
          // Spawn animal
          const rand = chunkRng();
          let species = 'cow';
          if (rand < 0.15) species = 'cow';
          else if (rand < 0.3) species = 'sheep';
          else if (rand < 0.45) species = 'chicken';
          else if (rand < 0.6) species = 'pig';
          else if (rand < 0.7) species = 'goat';
          else if (rand < 0.8) species = 'duck';
          else if (rand < 0.9) species = 'dog';
          else species = 'cat';

          entities.push({
            id: `animal-${q}-${r}`,
            type: 'animal',
            species,
            pos: { q, r },
            nextMoveTime: 0, // Will move on first engine tick
            lastProductTime: 0
          } as unknown as Entity);
        } else if (chunkRng() < 0.015) {
          // Spawn foraging items
          const rand = chunkRng();
          let species = 'mushroom';
          if (rand < 0.3) species = 'mushroom';
          else if (rand < 0.5) species = 'berry-bush';
          else if (rand < 0.7) species = 'apple-tree';
          else if (rand < 0.8) species = 'orange-tree';
          else if (rand < 0.9) species = 'peach-tree';
          else species = 'cherry-tree';

          entities.push({
            id: `plant-${species}-${q}-${r}`,
            type: 'plant',
            species,
            pos: { q, r },
            growthStage: 5, // Spawned mature
            plantedAt: 0,
            lastWatered: 0,
            lastUpdate: 0
          } as unknown as Entity);
        }
      }
    }
    return entities;
  }
}
