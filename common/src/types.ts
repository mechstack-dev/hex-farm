export const CHUNK_SIZE = 16;
export const GAME_DAY = 24 * 60 * 1000; // 24 minutes

export const BUILDING_COSTS: Record<string, { wood: number; stone: number }> = {
  'shed': { wood: 10, stone: 5 },
  'chest': { wood: 5, stone: 2 },
  'well': { wood: 5, stone: 10 },
  'scarecrow': { wood: 2, stone: 0 },
  'sprinkler': { wood: 0, stone: 5 },
  'iron-sprinkler': { wood: 0, stone: 15 },
  'gold-sprinkler': { wood: 0, stone: 50 },
  'beehive': { wood: 5, stone: 5 },
  'cooking-pot': { wood: 5, stone: 10 },
  'barn': { wood: 20, stone: 10 },
  'shipping-bin': { wood: 10, stone: 10 },
  'seed-maker': { wood: 15, stone: 5 },
  'compost-bin': { wood: 10, stone: 2 },
  'recycling-machine': { wood: 0, stone: 10 },
  'greenhouse': { wood: 30, stone: 20 },
  'weather-station': { wood: 10, stone: 15 },
  'fountain': { wood: 0, stone: 20 },
};

export const ITEM_PRICES: Record<string, number> = {
  'turnip': 10, 'carrot': 25, 'pumpkin': 50, 'corn': 35, 'wheat': 30,
  'winter-radish': 40, 'sunflower': 45, 'apple': 15, 'orange': 20, 'berry': 12, 'mushroom': 18,
  'milk': 20, 'wool': 30, 'egg': 10, 'truffle': 60, 'goat-milk': 25, 'duck-egg': 15,
  'fish': 40, 'honey': 30, 'wildflower-honey': 30, 'sunflower-honey': 60, 'coal': 15,
  'golden-hexfish': 500, 'ancient-coin': 150, 'geode': 30, 'diamond': 750,
  'salad': 60, 'apple-pie': 80, 'pumpkin-soup': 100, 'corn-chowder': 80, 'grilled-fish': 60,
  'mushroom-soup': 85, 'berry-tart': 90, 'miners-stew': 150, 'veggie-platter': 200, 'coal-grilled-fish': 120,
  'fruit-salad': 45, 'mushroom-risotto': 95, 'corn-bread': 110, 'fish-stew': 110,
  'fruity-sorbet': 180, 'hearty-stew': 180, 'seafood-platter': 180,
  'honey-glazed-carrots': 120, 'goat-cheese-salad': 140, 'duck-egg-mayo': 80,
  'berry-smoothie': 90, 'pumpkin-pie': 150, 'apple-cider': 110, 'orange-juice': 70
};

export const SEED_PRICES: Record<string, number> = {
  'turnip': 5, 'carrot': 15, 'pumpkin': 35, 'corn': 25, 'wheat': 20,
  'winter-radish': 30, 'apple-tree': 50, 'orange-tree': 60, 'sunflower': 35
};

export const TOOL_PRICES: Record<string, number> = {
  'hoe': 50, 'watering-can': 50, 'axe': 50, 'pickaxe': 50,
  'fishing-rod': 150, 'scythe': 250
};

export const KIT_PRICES: Record<string, number> = {
  // Building kits are deprecated in favor of resource crafting
};

export const FOOD_VALUES: Record<string, number> = {
  'golden-hexfish': 100,
  'apple': 20,
  'orange': 15,
  'turnip': 5,
  'carrot': 8,
  'corn': 10,
  'winter-radish': 12,
  'fish': 15,
  'salad': 40,
  'apple-pie': 60,
  'pumpkin-soup': 70,
  'corn-chowder': 50,
  'grilled-fish': 45,
  'mushroom-soup': 55,
  'berry-tart': 65,
  'miners-stew': 60,
  'veggie-platter': 80,
  'coal-grilled-fish': 80,
  'fruit-salad': 35,
  'mushroom-risotto': 65,
  'corn-bread': 45,
  'fish-stew': 75,
  'fruity-sorbet': 60,
  'hearty-stew': 80,
  'seafood-platter': 70,
  'honey-glazed-carrots': 70,
  'goat-cheese-salad': 75,
  'duck-egg-mayo': 40,
  'berry-smoothie': 50,
  'pumpkin-pie': 85,
  'apple-cider': 60,
  'orange-juice': 50
};

export const BEST_FOODS = ['golden-hexfish', 'pumpkin-pie', 'veggie-platter', 'fish-stew', 'goat-cheese-salad', 'honey-glazed-carrots', 'miners-stew', 'coal-grilled-fish', 'fruity-sorbet', 'hearty-stew', 'seafood-platter', 'mushroom-risotto', 'mushroom-soup', 'berry-tart', 'pumpkin-soup', 'apple-pie', 'apple-cider', 'orange-juice', 'corn-chowder', 'berry-smoothie', 'grilled-fish', 'salad', 'corn-bread', 'fruit-salad', 'duck-egg-mayo', 'winter-radish', 'berry', 'mushroom', 'apple', 'orange', 'fish', 'corn', 'carrot', 'turnip'];

export const RECIPES: Record<string, Record<string, number>> = {
  'salad': { 'turnip': 1, 'carrot': 1 },
  'apple-pie': { 'apple': 3, 'wheat': 1 },
  'pumpkin-soup': { 'pumpkin': 1, 'milk': 1 },
  'corn-chowder': { 'corn': 2, 'milk': 1 },
  'grilled-fish': { 'fish': 1, 'wood': 1 },
  'mushroom-soup': { 'mushroom': 2, 'milk': 1 },
  'berry-tart': { 'berry': 3, 'wheat': 1 },
  'miners-stew': { 'carrot': 2, 'fish': 1, 'iron-ore': 1 },
  'veggie-platter': { 'turnip': 2, 'pumpkin': 1, 'corn': 1 },
  'coal-grilled-fish': { 'fish': 1, 'coal': 1 },
  'fruit-salad': { 'apple': 1, 'berry': 1 },
  'mushroom-risotto': { 'mushroom': 2, 'wheat': 1 },
  'corn-bread': { 'corn': 2, 'wheat': 1 },
  'fish-stew': { 'fish': 1, 'carrot': 1, 'corn': 1 },
  'fruity-sorbet': { 'berry': 2, 'apple': 1, 'sunflower': 1 },
  'hearty-stew': { 'winter-radish': 1, 'carrot': 1, 'mushroom': 1, 'wood': 1 },
  'seafood-platter': { 'fish': 2, 'corn': 1, 'junk': 1 },
  'honey-glazed-carrots': { 'carrot': 2, 'honey': 1 },
  'goat-cheese-salad': { 'turnip': 1, 'goat-milk': 1 },
  'duck-egg-mayo': { 'duck-egg': 1, 'sunflower': 1 },
  'berry-smoothie': { 'berry': 2, 'milk': 1 },
  'pumpkin-pie': { 'pumpkin': 1, 'wheat': 1, 'egg': 1 },
  'apple-cider': { 'apple': 3, 'honey': 1 },
  'orange-juice': { 'orange': 3 }
};

export type EntityType = 'player' | 'plant' | 'animal' | 'obstacle' | 'fence' | 'floor' | 'sprinkler' | 'building';

export interface Position {
  q: number;
  r: number;
}

export interface Entity {
  id: string;
  type: EntityType;
  pos: Position;
  species?: string;
}

export interface Building extends Entity {
  type: 'building';
  inventory?: Record<string, number>;
  lastProductTime?: number;
}

export interface Plant extends Entity {
  type: 'plant';
  species: string;
  growthStage: number;
  lastWatered: number;
  plantedAt: number;
  lastUpdate: number;
  lastProductTime?: number;
}

export interface Animal extends Entity {
  type: 'animal';
  species: string;
  nextMoveTime: number;
  lastProductTime: number;
  lastBredTime?: number;
  homePos?: Position;
}

export interface SkillData {
  level: number;
  xp: number;
}

export interface Buff {
  type: string;
  amount: number;
  expiresAt: number;
}

export interface Player extends Entity {
  type: 'player';
  name: string;
  inventory: Record<string, number>;
  coins: number;
  stamina: number;
  maxStamina: number;
  skills: Record<string, SkillData>;
  buffs: Buff[];
  activeQuest?: {
    species: string;
    count: number;
    collected: number;
  } | null;
  achievements: string[];
  stats: Record<string, number>;
  relationships: Record<string, number>;
  lastGiftTime: Record<string, number>;
  lastNPCDailyGiftTime: Record<string, number>;
  lastTalkTime: Record<string, number>;
  perks: string[];
  color: number;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'sunny' | 'rainy' | 'cloudy';

export interface EnvironmentState {
  season: Season;
  weather: Weather;
  dayCount: number;
  timeOfDay: number; // 0.0 to 1.0
}

export interface WorldChunk {
  q: number; // Chunk coordinates
  r: number;
  entities: Entity[];
}

export function getChunkCoords(q: number, r: number): { cq: number, cr: number } {
  return {
    cq: Math.floor(q / CHUNK_SIZE),
    cr: Math.floor(r / CHUNK_SIZE)
  };
}

export function posToKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function chunkToKey(cq: number, cr: number): string {
  return `${cq},${cr}`;
}
