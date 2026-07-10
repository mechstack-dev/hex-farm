import { createNoise2D } from 'simplex-noise';
import seedrandom from 'seedrandom';
import type { Entity } from 'common';
import { MAX_GROWTH } from 'common';

/**
 * Deterministic world generation. Two noise fields (elevation + moisture)
 * define biomes; a per-chunk RNG scatters the living things across them.
 * The same seed always yields the same world, so it is consistent for every
 * wanderer and stable across restarts.
 */
export class Generator {
  private elevation: (x: number, y: number) => number;
  private moisture: (x: number, y: number) => number;

  constructor(seed: string) {
    const rngA = seedrandom(seed + ':elevation');
    const rngB = seedrandom(seed + ':moisture');
    this.elevation = createNoise2D(() => rngA());
    this.moisture = createNoise2D(() => rngB());
  }

  private mature(species: string, type: 'flora' | 'tree', q: number, r: number): Entity {
    return {
      id: `${type}-${species}-${q}-${r}`,
      type,
      species,
      pos: { q, r },
      growthStage: MAX_GROWTH,
      plantedAt: 0,
      lastUpdate: 0,
    } as unknown as Entity;
  }

  generateStaticEntities(cq: number, cr: number, chunkSize: number): Entity[] {
    const entities: Entity[] = [];
    const rng = seedrandom(`chunk:${cq},${cr}`);

    for (let q = cq * chunkSize; q < (cq + 1) * chunkSize; q++) {
      for (let r = cr * chunkSize; r < (cr + 1) * chunkSize; r++) {
        const e = this.elevation(q * 0.08, r * 0.08);
        const m = this.moisture(q * 0.06, r * 0.06);
        const roll = rng();

        // Water sits in the low, wet places — ponds and rivers, not oceans.
        if (e < -0.5) {
          entities.push({ id: `water-${q}-${r}`, type: 'water', species: 'water', pos: { q, r } });
          continue;
        }

        // High, dry ground is rocky, but leaves room to wander through.
        if (e > 0.62) {
          if (roll < 0.4) {
            entities.push({ id: `rock-${q}-${r}`, type: 'rock', species: 'rock', pos: { q, r } });
          }
          continue;
        }

        // Damp ground grows forest; drier ground becomes meadow.
        const forested = m > 0.2;
        if (forested) {
          if (roll < 0.35) {
            entities.push(this.mature(this.pick(rng, ['oak', 'birch', 'pine', 'maple', 'willow']), 'tree', q, r));
          } else if (roll < 0.5) {
            entities.push(this.mature(this.pick(rng, ['fern', 'clover', 'mushroom', 'grass']), 'flora', q, r));
          } else if (roll < 0.53) {
            entities.push(this.makeFauna(this.pick(rng, ['deer', 'fox', 'bird', 'frog']), q, r));
          }
        } else {
          if (roll < 0.28) {
            entities.push(this.mature(this.pick(rng, ['grass', 'clover', 'flower', 'poppy', 'daisy', 'tulip', 'lavender', 'sunflower']), 'flora', q, r));
          } else if (roll < 0.31) {
            entities.push(this.mature(this.pick(rng, ['oak', 'birch']), 'tree', q, r));
          } else if (roll < 0.34) {
            entities.push(this.makeFauna(this.pick(rng, ['rabbit', 'deer', 'bird', 'butterfly']), q, r));
          } else if (roll < 0.345) {
            entities.push({ id: `rock-${q}-${r}`, type: 'rock', species: 'rock', pos: { q, r } });
          }
        }
      }
    }
    return entities;
  }

  private makeFauna(species: string, q: number, r: number): Entity {
    return {
      id: `fauna-${species}-${q}-${r}`,
      type: 'fauna',
      species,
      pos: { q, r },
      nextMoveTime: 0,
      homePos: { q, r },
    } as unknown as Entity;
  }

  private pick(rng: () => number, list: string[]): string {
    return list[Math.floor(rng() * list.length)];
  }
}
