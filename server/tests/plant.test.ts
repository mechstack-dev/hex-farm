import { updatePlant } from '../src/logic/PlantLogic.js';
import type { Plant } from 'common';

describe('PlantLogic', () => {
  it('grows plants over time', () => {
    const now = Date.now();
    const plant: Plant = {
      id: 'p1',
      type: 'plant',
      species: 'turnip',
      pos: { q: 0, r: 0 },
      growthStage: 0,
      plantedAt: now - 10000,
      lastWatered: 0,
      lastUpdate: now - 10000,
    };

    const updated = updatePlant(plant, now);
    expect(updated.growthStage).toBeGreaterThan(0);
  });

  it('grows faster in rain', () => {
    const now = Date.now();
    const plant: Plant = {
      id: 'p1',
      type: 'plant',
      species: 'turnip',
      pos: { q: 0, r: 0 },
      growthStage: 0,
      plantedAt: now - 1000,
      lastWatered: 0,
      lastUpdate: now - 1000,
    };

    const updatedSunny = updatePlant(plant, now, 'sunny');
    const updatedRainy = updatePlant(plant, now, 'rainy');

    expect(updatedRainy.growthStage).toBeGreaterThan(updatedSunny.growthStage);
  });
});
