import { WorldManager } from '../src/WorldManager';
import { GameEngine } from '../src/GameEngine';
import type { Player } from '../../common/src/types';

// Propagation must never stack two growing things on one hex — the occupancy
// check is what keeps the living world from carpeting or bloating.
describe('GameEngine equilibrium', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('never places two plants on the same hex', () => {
    const world = new WorldManager('equilibrium-seed');
    const engine = new GameEngine(world);
    const dummy: Player = { id: 'p-test', type: 'player', pos: { q: 0, r: 0 }, name: 't', color: 0 };
    world.addEntity(dummy);

    // Run sustained growth, keeping the active region bounded around origin.
    for (let i = 0; i < 40; i++) {
      jest.advanceTimersByTime(60000);
      engine.tick([dummy]);
      world.cleanupChunks([dummy]);
    }

    const plants = world
      .getActiveChunks()
      .flatMap((c) => c.entities)
      .filter((e) => e.type === 'flora' || e.type === 'tree');
    const keys = plants.map((e) => `${e.pos.q},${e.pos.r}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(plants.length).toBeGreaterThan(0);
  });
});
