import { growPlant, canPropagate, makeSprout } from '../src/logic/PlantLogic';
import { GAME_DAY, MAX_GROWTH } from '../../common/src/types';
import type { Flora } from '../../common/src/types';

function sprout(now: number): Flora {
  return makeSprout('flower', 'flora', 0, 0, now) as Flora;
}

describe('PlantLogic', () => {
  it('grows a plant over time', () => {
    const now = Date.now();
    const plant = { ...sprout(now - GAME_DAY), lastUpdate: now - GAME_DAY };
    const grown = growPlant(plant, now);
    expect(grown.growthStage).toBeGreaterThan(0);
  });

  it('grows faster in the rain', () => {
    const now = Date.now();
    const base = { ...sprout(now - 1000), lastUpdate: now - 1000 };
    const sunny = growPlant(base, now, false);
    const rainy = growPlant(base, now, true);
    expect(rainy.growthStage).toBeGreaterThan(sunny.growthStage);
  });

  it('never grows past maturity', () => {
    const now = Date.now();
    const plant = { ...sprout(now - 100 * GAME_DAY), growthStage: MAX_GROWTH, lastUpdate: now - 100 * GAME_DAY };
    const grown = growPlant(plant, now);
    expect(grown.growthStage).toBe(MAX_GROWTH);
  });

  it('only propagates once mature', () => {
    const young = { ...sprout(Date.now()), growthStage: 1 };
    const mature = { ...sprout(Date.now()), growthStage: MAX_GROWTH };
    expect(canPropagate(young)).toBe(false);
    expect(canPropagate(mature)).toBe(true);
  });
});
