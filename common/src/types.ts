export const CHUNK_SIZE = 16;

export type EntityType = 'player' | 'plant' | 'animal' | 'obstacle' | 'fence';

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

export interface Plant extends Entity {
  type: 'plant';
  species: string;
  growthStage: number;
  lastWatered: number;
  plantedAt: number;
  lastUpdate: number;
}

export interface Animal extends Entity {
  type: 'animal';
  species: string;
  nextMoveTime: number;
}

export interface Player extends Entity {
  type: 'player';
  name: string;
  inventory: Record<string, number>;
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
