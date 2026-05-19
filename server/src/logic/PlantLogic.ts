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
  'kale': ['winter'],
  'apple-tree': ['spring', 'summer', 'autumn', 'winter'],
  'orange-tree': ['summer'],
  'peach-tree': ['spring', 'summer'],
  'cherry-tree': ['spring', 'summer'],
  'mushroom': ['autumn'],
  'berry-bush': ['summer'],
  'blueberry-bush': ['summer'],
  'raspberry-bush': ['summer'],
  'tulip': ['spring'],
  'lavender': ['summer'],
  'tree': ['spring', 'summer', 'autumn', 'winter'],
  'sunflower': ['summer'],
  'coffee-bean': ['summer', 'autumn'],
  'tea-leaf': ['spring', 'summer'],
  'ancient-fruit': ['spring', 'summer', 'autumn'],
};

const SPECIES_GROWTH: Record<string, number> = {
  'turnip': GAME_DAY,   // 1 day per stage
  'carrot': 2 * GAME_DAY,   // 2 days per stage
  'pumpkin': 3 * GAME_DAY,  // 3 days per stage
  'corn': 1.5 * GAME_DAY,   // 1.5 days per stage
  'wheat': 1.25 * GAME_DAY, // 1.25 days per stage
  'winter-radish': 2.5 * GAME_DAY, // 2.5 days per stage
  'kale': 2 * GAME_DAY,   // 2 days per stage
  'apple-tree': 4 * GAME_DAY, // 4 days per stage
  'orange-tree': 4 * GAME_DAY,
  'peach-tree': 4 * GAME_DAY,
  'cherry-tree': 4 * GAME_DAY,
  'mushroom': 1.5 * GAME_DAY,
  'berry-bush': 2 * GAME_DAY,
  'blueberry-bush': 2.5 * GAME_DAY,
  'raspberry-bush': 2 * GAME_DAY,
  'tulip': 1.5 * GAME_DAY,
  'lavender': 2 * GAME_DAY,
  'tree': 7 * GAME_DAY,     // 7 days per stage
  'sunflower': 2.5 * GAME_DAY,
  'coffee-bean': 2 * GAME_DAY,
  'tea-leaf': 1.5 * GAME_DAY,
  'ancient-fruit': 7 * GAME_DAY, // 7 days per stage (28 days total)
};

export function updatePlant(plant: Plant, now: number, weather: Weather = 'sunny', season: Season = 'spring', isProtected: boolean = false): Plant {
  const elapsed = now - plant.lastUpdate;
  const isWatered = (now - plant.lastWatered < GAME_DAY) || weather === 'rainy';
  
  const duration = SPECIES_GROWTH[plant.species] || SPECIES_GROWTH['turnip'];

  const preferred = PREFERRED_SEASONS[plant.species] || PREFERRED_SEASONS['turnip'];
  const seasonMultiplier = (isProtected || preferred.includes(season)) ? 1.0 : SEASONAL_PENALTY;

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
