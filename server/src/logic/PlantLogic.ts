import type { Plant, Weather } from 'common';

const WATER_BONUS = 2;

const SPECIES_GROWTH: Record<string, number> = {
  'turnip': 24 * 60 * 60 * 1000,   // 1 day per stage
  'carrot': 48 * 60 * 60 * 1000,   // 2 days per stage
  'pumpkin': 72 * 60 * 60 * 1000,  // 3 days per stage
};

export function updatePlant(plant: Plant, now: number, weather: Weather = 'sunny'): Plant {
  const elapsed = now - plant.lastUpdate;
  const isWatered = (now - plant.lastWatered < 24 * 60 * 60 * 1000) || weather === 'rainy';
  
  const duration = SPECIES_GROWTH[plant.species] || SPECIES_GROWTH['turnip'];

  const effectiveTime = isWatered ? elapsed * WATER_BONUS : elapsed;
  const growthIncrement = effectiveTime / duration;
  
  return {
    ...plant,
    growthStage: Math.min(5, plant.growthStage + growthIncrement),
    lastUpdate: now
  };
}

export function canHarvest(plant: Plant): boolean {
  return plant.growthStage >= 5;
}
