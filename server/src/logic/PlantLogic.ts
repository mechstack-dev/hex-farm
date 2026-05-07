import type { Plant } from 'common';

const STAGE_DURATION = 24 * 60 * 60 * 1000;
const WATER_BONUS = 2;

export function updatePlant(plant: Plant, now: number): Plant {
  const elapsed = now - plant.lastUpdate;
  const isWatered = now - plant.lastWatered < 24 * 60 * 60 * 1000;
  
  const effectiveTime = isWatered ? elapsed * WATER_BONUS : elapsed;
  const growthIncrement = effectiveTime / STAGE_DURATION;
  
  return {
    ...plant,
    growthStage: Math.min(5, plant.growthStage + growthIncrement),
    lastUpdate: now
  };
}

export function canHarvest(plant: Plant): boolean {
  return plant.growthStage >= 5;
}
