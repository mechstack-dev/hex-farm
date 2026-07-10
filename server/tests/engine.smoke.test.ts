import { WorldManager } from '../src/WorldManager';
import { GameEngine } from '../src/GameEngine';

// Baseline safety-net smoke test: proves the world simulation can be
// constructed and advanced one tick without throwing, and that a tick
// yields a coherent environment state. Guards the prune (Phase 1) against
// silently breaking the core loop.
describe('GameEngine tick (smoke)', () => {
  beforeEach(() => {
    // WorldManager starts a real auto-save setInterval in its constructor;
    // fake timers keep it from holding the process open after the test.
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs a tick without throwing and returns a coherent environment', () => {
    const world = new WorldManager('smoke-test-seed');
    const engine = new GameEngine(world);

    const result = engine.tick();

    expect(result).toBeDefined();
    expect(Array.isArray(result.updatedEntities)).toBe(true);
    expect(result.environment).toBeDefined();
    expect(result.environment.season).toBeDefined();
    expect(result.environment.weather).toBeDefined();
    expect(typeof result.environment.timeOfDay).toBe('number');
    expect(result.environment.timeOfDay).toBeGreaterThanOrEqual(0);
    expect(result.environment.timeOfDay).toBeLessThanOrEqual(1);
  });

  it('is stable across several consecutive ticks', () => {
    const world = new WorldManager('smoke-test-seed');
    const engine = new GameEngine(world);

    expect(() => {
      for (let i = 0; i < 5; i++) engine.tick();
    }).not.toThrow();
  });
});
