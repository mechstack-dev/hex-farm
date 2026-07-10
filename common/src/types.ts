// ---------------------------------------------------------------------------
// Wanderleaf shared types.
//
// A deliberately small vocabulary: the world is terrain, water, rock, trees,
// flora, fauna, and the wanderers moving through it. No economy, tools,
// inventory, or progression exist by design (see AGENTS.md).
// ---------------------------------------------------------------------------

export const CHUNK_SIZE = 16;
export const GAME_DAY = 24 * 60 * 1000; // a full day/night cycle, in ms
export const MAX_GROWTH = 5; // growth stages 0..5; 5 is mature

export type EntityType = 'player' | 'tree' | 'flora' | 'fauna' | 'water' | 'rock';

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

/** Ground-level growing things: grass, flowers, ferns, mushrooms. They spread. */
export interface Flora extends Entity {
  type: 'flora';
  species: string;
  growthStage: number;
  plantedAt: number;
  lastUpdate: number;
}

/** Trees grow slowly and seed forests into adjacent land. */
export interface Tree extends Entity {
  type: 'tree';
  species: string;
  growthStage: number;
  plantedAt: number;
  lastUpdate: number;
}

/** Creatures that wander, flock, and drift toward wanderers. */
export interface Fauna extends Entity {
  type: 'fauna';
  species: string;
  nextMoveTime: number;
  homePos?: Position;
}

/** A wanderer. No stats, no inventory — just presence, a name, and a color. */
export interface Player extends Entity {
  type: 'player';
  name: string;
  color: number;
  lastMoveTime?: number;
}

// --- Growable species ------------------------------------------------------

export const FLORA_SPECIES = [
  'grass', 'fern', 'clover', 'flower', 'poppy',
  'daisy', 'tulip', 'lavender', 'sunflower', 'mushroom',
] as const;

export const TREE_SPECIES = ['oak', 'birch', 'pine', 'maple', 'willow'] as const;

export const FAUNA_SPECIES = ['deer', 'rabbit', 'fox', 'bird', 'butterfly', 'frog'] as const;

// --- Time, seasons, and regional weather -----------------------------------

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'sunny' | 'rainy' | 'cloudy' | 'snowy';

/** A weather front centered at (q,r) that drifts across the map over time. */
export interface WeatherCell {
  q: number;
  r: number;
  radius: number;
  type: Weather;
}

export interface EnvironmentState {
  season: Season;
  dayCount: number;
  timeOfDay: number; // 0.0 to 1.0
  weatherCells: WeatherCell[];
}

/** The weather a given spot is experiencing right now (regional). */
export function localWeather(cells: WeatherCell[], pos: Position): Weather {
  for (const cell of cells) {
    if (hexDistance(cell, pos) <= cell.radius) return cell.type;
  }
  return 'sunny';
}

// --- The player's entire action set ----------------------------------------

export type NudgeVerb = 'scatter' | 'coax' | 'part' | 'draw';
export type EmoteType = 'heart' | 'smile' | 'sad' | 'wow';
export const EMOTES: EmoteType[] = ['heart', 'smile', 'sad', 'wow'];

// --- World chunking --------------------------------------------------------

export interface WorldChunk {
  q: number; // chunk coordinates
  r: number;
  entities: Entity[];
}

export function getChunkCoords(q: number, r: number): { cq: number; cr: number } {
  return {
    cq: Math.floor(q / CHUNK_SIZE),
    cr: Math.floor(r / CHUNK_SIZE),
  };
}

export function posToKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function chunkToKey(cq: number, cr: number): string {
  return `${cq},${cr}`;
}

/** Hex (axial) distance. Duplicated here so types.ts stays dependency-free. */
export function hexDistance(a: Position, b: Position): number {
  return (
    Math.abs(a.q - b.q) +
    Math.abs(a.q + a.r - b.q - b.r) +
    Math.abs(a.r - b.r)
  ) / 2;
}
