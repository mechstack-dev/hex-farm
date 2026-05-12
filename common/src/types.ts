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
