export const CHUNK_SIZE = 16;
export const GAME_DAY = 24 * 60 * 1000; // 24 minutes

export const BUILDING_COSTS: Record<string, { wood: number; stone: number }> = {
  'shed': { wood: 10, stone: 5 },
  'chest': { wood: 5, stone: 2 },
  'well': { wood: 5, stone: 10 },
  'scarecrow': { wood: 2, stone: 0 },
  'sprinkler': { wood: 0, stone: 5 },
  'beehive': { wood: 5, stone: 5 },
  'cooking-pot': { wood: 5, stone: 10 },
  'barn': { wood: 20, stone: 10 },
  'shipping-bin': { wood: 10, stone: 10 },
  'seed-maker': { wood: 15, stone: 5 },
};

export const ITEM_PRICES: Record<string, number> = {
  'turnip': 10, 'carrot': 25, 'pumpkin': 50, 'corn': 35, 'wheat': 30,
  'winter-radish': 40, 'sunflower': 45, 'apple': 15, 'berry': 12, 'mushroom': 18,
  'milk': 20, 'wool': 30, 'egg': 10, 'truffle': 60, 'goat-milk': 25, 'duck-egg': 15,
  'fish': 40, 'honey': 30, 'wildflower-honey': 30, 'sunflower-honey': 60, 'coal': 15,
  'salad': 60, 'apple-pie': 80, 'pumpkin-soup': 100, 'corn-chowder': 80, 'grilled-fish': 60,
  'mushroom-soup': 85, 'berry-tart': 90, 'miners-stew': 150, 'veggie-platter': 200, 'coal-grilled-fish': 120,
  'fruit-salad': 45, 'mushroom-risotto': 95, 'corn-bread': 110, 'fish-stew': 110
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
