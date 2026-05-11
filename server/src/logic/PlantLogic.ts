import type { Plant, Weather, Season } from 'common';
import { GAME_DAY } from 'common';

const WATER_BONUS = 2;
const SEASONAL_PENALTY = 0.5;

const PREFERRED_SEASONS: Record<string, Season[]> = {
  'turnip': ['spring'],
  'carrot': ['spring', 'summer'],
  'pumpkin': ['autumn'],
  'corn': ['summer'],
  'wheat': ['autumn'],
  'winter-radish': ['winter'],
  'apple-tree': ['spring', 'summer', 'autumn', 'winter'],
  'mushroom': ['autumn'],
  'berry-bush': ['summer'],
};

const SPECIES_GROWTH: Record<string, number> = {
  'turnip': GAME_DAY,   // 1 day per stage
  'carrot': 2 * GAME_DAY,   // 2 days per stage
  'pumpkin': 3 * GAME_DAY,  // 3 days per stage
  'corn': 1.5 * GAME_DAY,   // 1.5 days per stage
  'wheat': 1.25 * GAME_DAY, // 1.25 days per stage
  'winter-radish': 2.5 * GAME_DAY, // 2.5 days per stage
  'apple-tree': 4 * GAME_DAY, // 4 days per stage
  'mushroom': 1.5 * GAME_DAY,
  'berry-bush': 2 * GAME_DAY,
};

export function updatePlant(plant: Plant, now: number, weather: Weather = 'sunny', season: Season = 'spring'): Plant {
  const elapsed = now - plant.lastUpdate;
  const isWatered = (now - plant.lastWatered < GAME_DAY) || weather === 'rainy';
  
  const duration = SPECIES_GROWTH[plant.species] || SPECIES_GROWTH['turnip'];

  const preferred = PREFERRED_SEASONS[plant.species] || PREFERRED_SEASONS['turnip'];
  const seasonMultiplier = preferred.includes(season) ? 1.0 : SEASONAL_PENALTY;

  const effectiveTime = isWatered ? elapsed * WATER_BONUS : elapsed;
  const growthIncrement = (effectiveTime * seasonMultiplier) / duration;
  
  return {
    ...plant,
    growthStage: Math.min(5, plant.growthStage + growthIncrement),
    lastUpdate: now
  };
}

export function canHarvest(plant: Plant): boolean {
  return plant.growthStage >= 5;
}
