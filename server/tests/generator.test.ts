import { Generator } from '../src/Generator';
import { CHUNK_SIZE } from '../../common/src/types';

describe('Generator', () => {
  it('produces a varied world across biomes', () => {
    const gen = new Generator('test-seed');
    const types = new Set<string>();
    const species = new Set<string>();

    // Sample a wide area so several biomes are represented.
    for (let cq = -3; cq <= 3; cq++) {
      for (let cr = -3; cr <= 3; cr++) {
        for (const e of gen.generateStaticEntities(cq, cr, CHUNK_SIZE)) {
          types.add(e.type);
          if (e.species) species.add(e.species);
        }
      }
    }

    // Every kind of world entity should appear somewhere.
    expect(types.has('water')).toBe(true);
    expect(types.has('tree')).toBe(true);
    expect(types.has('flora')).toBe(true);
    expect(types.has('fauna')).toBe(true);
    // Real variety, not one repeated species.
    expect(species.size).toBeGreaterThan(8);
  });

  it('is deterministic for a given seed', () => {
    const a = new Generator('seed-x').generateStaticEntities(2, -1, CHUNK_SIZE);
    const b = new Generator('seed-x').generateStaticEntities(2, -1, CHUNK_SIZE);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });
});
