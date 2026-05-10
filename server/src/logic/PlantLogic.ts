import type { Plant, Weather } from 'common';
import { GAME_DAY } from 'common';

const WATER_BONUS = 2;

const SPECIES_GROWTH: Record<string, number> = {
  'turnip': GAME_DAY,   // 1 day per stage
  'carrot': 2 * GAME_DAY,   // 2 days per stage
  'pumpkin': 3 * GAME_DAY,  // 3 days per stage
  'corn': 1.5 * GAME_DAY,   // 1.5 days per stage
  'wheat': 1.25 * GAME_DAY, // 1.25 days per stage
};

export function updatePlant(plant: Plant, now: number, weather: Weather = 'sunny'): Plant {
  const elapsed = now - plant.lastUpdate;
  const isWatered = (now - plant.lastWatered < GAME_DAY) || weather === 'rainy';
  
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
