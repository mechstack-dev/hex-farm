import type { Flora, Tree } from 'common';
import { GAME_DAY, MAX_GROWTH } from 'common';

type Growable = Flora | Tree;

const RAIN_BONUS = 2;

// Real-world time per growth stage. Flora is quick; forests are patient.
const GROWTH_DURATION: Record<string, number> = {
  grass: 0.4 * GAME_DAY,
  fern: 0.6 * GAME_DAY,
  clover: 0.5 * GAME_DAY,
  flower: 0.8 * GAME_DAY,
  poppy: 0.8 * GAME_DAY,
  daisy: 0.8 * GAME_DAY,
  tulip: 1.0 * GAME_DAY,
  lavender: 1.2 * GAME_DAY,
  sunflower: 1.5 * GAME_DAY,
  mushroom: 0.7 * GAME_DAY,
  // trees
  oak: 4 * GAME_DAY,
  birch: 3.5 * GAME_DAY,
  pine: 4 * GAME_DAY,
  maple: 3.5 * GAME_DAY,
  willow: 4.5 * GAME_DAY,
};

/** Advance a plant's growth by the time elapsed since it was last touched. */
export function growPlant<T extends Growable>(plant: T, now: number, rainy = false): T {
  if (plant.growthStage >= MAX_GROWTH) {
    return plant.lastUpdate === now ? plant : { ...plant, lastUpdate: now };
  }

  const elapsed = now - plant.lastUpdate;
  if (elapsed <= 0) return plant;

  const duration = GROWTH_DURATION[plant.species] ?? GAME_DAY;
  const effective = rainy ? elapsed * RAIN_BONUS : elapsed;
  const growthStage = Math.min(MAX_GROWTH, plant.growthStage + effective / duration);

  return { ...plant, growthStage, lastUpdate: now };
}

/** Only mature plants seed new growth into the world. */
export function canPropagate(plant: Growable): boolean {
  return plant.growthStage >= MAX_GROWTH - 1;
}

/** A fresh sprout of the same species, ready to grow where it took root. */
export function makeSprout(species: string, type: 'flora' | 'tree', q: number, r: number, now: number): Growable {
  return {
    id: `${type}-${species}-${q}-${r}-${Math.floor(now)}`,
    type,
    species,
    pos: { q, r },
    growthStage: 0,
    plantedAt: now,
    lastUpdate: now,
  } as Growable;
}
