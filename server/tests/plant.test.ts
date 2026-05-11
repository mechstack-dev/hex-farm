import { updatePlant } from '../src/logic/PlantLogic';
import type { Plant } from '../../common/src/types';

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

    const updatedSunny = updatePlant(plant, now, 'sunny', 'spring');
    const updatedRainy = updatePlant(plant, now, 'rainy', 'spring');

    expect(updatedRainy.growthStage).toBeGreaterThan(updatedSunny.growthStage);
  });

  it('grows faster when watered', () => {
    const now = Date.now();
    const plant: Plant = {
      id: 'p1',
      type: 'plant',
      species: 'turnip',
      pos: { q: 0, r: 0 },
      growthStage: 0,
      plantedAt: now - 1000,
      lastWatered: now - 500, // Watered recently
      lastUpdate: now - 1000,
    };

    const updatedWatered = updatePlant(plant, now, 'sunny', 'spring');

    const unwateredPlant = { ...plant, lastWatered: 0 };
    const updatedUnwatered = updatePlant(unwateredPlant, now, 'sunny', 'spring');

    expect(updatedWatered.growthStage).toBeGreaterThan(updatedUnwatered.growthStage);
    expect(updatedWatered.growthStage).toBeCloseTo(updatedUnwatered.growthStage * 2);
  });

  it('grows slower in non-preferred season', () => {
    const now = Date.now();
    const plant: Plant = {
      id: 'p1',
      type: 'plant',
      species: 'turnip', // Preferred Spring
      pos: { q: 0, r: 0 },
      growthStage: 0,
      plantedAt: now - 1000,
      lastWatered: 0,
      lastUpdate: now - 1000,
    };

    const updatedPreferred = updatePlant(plant, now, 'sunny', 'spring');
    const updatedNonPreferred = updatePlant(plant, now, 'sunny', 'summer');

    expect(updatedPreferred.growthStage).toBeGreaterThan(updatedNonPreferred.growthStage);
    expect(updatedNonPreferred.growthStage).toBeCloseTo(updatedPreferred.growthStage * 0.5);
  });
});
