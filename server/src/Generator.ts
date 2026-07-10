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
        // Low frequency => large, coherent regions you can walk toward.
        const e = this.elevation(q * 0.045, r * 0.045);
        const m = this.moisture(q * 0.05, r * 0.05);
        const roll = rng();
        const spec = this.biome(e, m);
        this.populate(entities, spec, rng, roll, q, r);
      }
    }
    return entities;
  }

  /** Classify a hex into a legible biome from elevation and moisture. */
  private biome(e: number, m: number): string {
    if (e < -0.5) return 'water';
    if (e > 0.55) return 'highland';       // rocky uplands
    if (e < -0.3) return 'wetland';        // low ground near water
    if (m > 0.3) return 'forest';          // damp woodland
    if (m < -0.25) return 'glade';         // dry flowering fields
    return 'meadow';                       // gentle mixed grassland
  }

  private populate(out: Entity[], biome: string, rng: () => number, roll: number, q: number, r: number) {
    const tree = (opts: string[]) => out.push(this.mature(this.pick(rng, opts), 'tree', q, r));
    const flora = (opts: string[]) => out.push(this.mature(this.pick(rng, opts), 'flora', q, r));
    const fauna = (opts: string[]) => out.push(this.makeFauna(this.pick(rng, opts), q, r));
    const rock = () => out.push({ id: `rock-${q}-${r}`, type: 'rock', species: 'rock', pos: { q, r } });

    switch (biome) {
      case 'water':
        out.push({ id: `water-${q}-${r}`, type: 'water', species: 'water', pos: { q, r } });
        return;

      case 'highland': // sparse, hardy, open
        if (roll < 0.35) rock();
        else if (roll < 0.42) tree(['pine']);
        else if (roll < 0.5) flora(['lavender', 'clover', 'grass']);
        else if (roll < 0.515) fauna(['fox', 'deer']);
        return;

      case 'wetland': // reeds, mushrooms, willows, frogs
        if (roll < 0.4) flora(['fern', 'grass', 'mushroom', 'clover']);
        else if (roll < 0.5) tree(['willow']);
        else if (roll < 0.55) fauna(['frog', 'bird']);
        return;

      case 'forest': // dense trees with undergrowth
        if (roll < 0.42) tree(['oak', 'birch', 'pine', 'maple']);
        else if (roll < 0.58) flora(['fern', 'clover', 'mushroom', 'grass']);
        else if (roll < 0.61) fauna(['deer', 'fox', 'bird']);
        return;

      case 'glade': // dry flowering fields
        if (roll < 0.4) flora(['poppy', 'daisy', 'tulip', 'sunflower', 'lavender', 'flower']);
        else if (roll < 0.43) tree(['birch']);
        else if (roll < 0.47) fauna(['butterfly', 'rabbit', 'bird']);
        return;

      default: // meadow: gentle mixed grassland
        if (roll < 0.26) flora(['grass', 'clover', 'flower', 'daisy']);
        else if (roll < 0.29) tree(['oak', 'birch']);
        else if (roll < 0.325) fauna(['rabbit', 'deer', 'bird', 'butterfly']);
        else if (roll < 0.33) rock();
        return;
    }
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
