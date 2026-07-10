import { WorldManager } from './WorldManager.js';
import { SeasonManager } from './logic/SeasonManager.js';
import { WeatherSystem } from './logic/WeatherSystem.js';
import { growPlant, canPropagate, makeSprout } from './logic/PlantLogic.js';
import { moveFauna, FaunaContext } from './logic/AnimalLogic.js';
import type { Entity, Player, Position, EnvironmentState, Flora, Tree, Fauna } from 'common';
import { getNeighbors, distance, localWeather, posToKey, MAX_GROWTH } from 'common';

export interface TickResult {
  updated: Entity[];
  environment: EnvironmentState;
  environmentChanged: boolean;
}

// Gentle flora that a wanderer can scatter by hand.
const SCATTERABLE = ['grass', 'clover', 'flower', 'poppy', 'daisy', 'tulip', 'lavender'];

export class GameEngine {
  private seasons = new SeasonManager();
  private weather = new WeatherSystem();

  constructor(private world: WorldManager) {}

  getEnvironment(): EnvironmentState {
    return {
      season: this.seasons.season,
      dayCount: this.seasons.day,
      timeOfDay: this.seasons.timeOfDay,
      weatherCells: this.weather.getCells(),
    };
  }

  tick(players: Player[] = []): TickResult {
    const now = Date.now();
    const seasonChanged = this.seasons.update(now);
    this.weather.update(now, players.map(p => p.pos), this.seasons.season);
    const environment = this.getEnvironment();
    const cells = environment.weatherCells;

    const updated: Entity[] = [];
    const chunks = this.world.getActiveChunks();

    // Occupied hexes, so growth never sprouts onto something already there.
    const occupied = new Set<string>();
    chunks.forEach(c => c.entities.forEach(e => occupied.add(posToKey(e.pos.q, e.pos.r))));

    const isNight = environment.timeOfDay < 0.25 || environment.timeOfDay > 0.75;
    const ctx = { isNight, season: environment.season };

    for (const chunk of chunks) {
      for (const entity of [...chunk.entities]) {
        if (entity.type === 'flora' || entity.type === 'tree') {
          this.tickPlant(entity as Flora | Tree, now, cells, players, occupied, updated);
        } else if (entity.type === 'fauna') {
          this.tickFauna(entity as Fauna, now, players, occupied, updated, ctx);
        }
      }
    }

    return { updated, environment, environmentChanged: true };
  }

  private tickPlant(
    plant: Flora | Tree,
    now: number,
    cells: EnvironmentState['weatherCells'],
    players: Player[],
    occupied: Set<string>,
    updated: Entity[],
  ) {
    const rainy = localWeather(cells, plant.pos) === 'rainy';
    const grown = growPlant(plant, now, rainy);

    // Only commit (persist + broadcast) at whole-stage boundaries — keeps
    // growth cheap while the world quietly advances between ticks.
    if (Math.floor(grown.growthStage) > Math.floor(plant.growthStage)) {
      this.world.updateEntity(grown);
      updated.push(grown);
    }

    if (canPropagate(grown)) {
      // Nature reaches equilibrium: once a patch is crowded it stops
      // spreading. This keeps meadows from becoming solid carpets and
      // bounds how much the persistent world can grow.
      const crowding = getNeighbors(plant.pos).filter(n => occupied.has(posToKey(n.q, n.r))).length;
      if (crowding >= 4) return;

      // A wanderer's presence quickens the spread of life around them.
      const boost = players.some(p => distance(p.pos, plant.pos) <= 3) ? 4 : 1;
      const baseChance = plant.type === 'tree' ? 0.003 : 0.008;
      if (Math.random() < baseChance * boost) {
        const spot = this.emptyNeighbor(plant.pos, occupied);
        if (spot) {
          const [species, type] = this.succession(plant);
          const sprout = makeSprout(species, type, spot.q, spot.r, now);
          this.world.addEntity(sprout);
          occupied.add(posToKey(spot.q, spot.r));
          updated.push(sprout);
        }
      }
    }
  }

  /**
   * What a mature plant seeds. Usually more of itself, but the land also
   * changes over time: forests creep into flowered ground near their edge,
   * and undergrowth (ferns, mushrooms) rises beneath established trees.
   */
  private succession(plant: Flora | Tree): [string, 'flora' | 'tree'] {
    const neighborTrees = getNeighbors(plant.pos)
      .flatMap((n) => this.world.getEntitiesAt(n.q, n.r))
      .filter((e) => e.type === 'tree');

    if (plant.type === 'flora' && neighborTrees.length >= 2 && Math.random() < 0.4) {
      // A meadow at the forest's edge gives way to saplings.
      const parent = neighborTrees[Math.floor(Math.random() * neighborTrees.length)];
      return [parent.species || 'oak', 'tree'];
    }
    if (plant.type === 'tree' && Math.random() < 0.3) {
      // Shade beneath a tree favors undergrowth.
      return [['fern', 'clover', 'mushroom'][Math.floor(Math.random() * 3)], 'flora'];
    }
    return [plant.species, plant.type];
  }

  private tickFauna(fauna: Fauna, now: number, players: Player[], occupied: Set<string>, updated: Entity[], ctx: FaunaContext) {
    if (now < fauna.nextMoveTime) return;
    const moved = moveFauna(fauna, this.world, players, ctx);
    if (moved.pos.q !== fauna.pos.q || moved.pos.r !== fauna.pos.r) {
      occupied.delete(posToKey(fauna.pos.q, fauna.pos.r));
      occupied.add(posToKey(moved.pos.q, moved.pos.r));
      this.world.moveEntityInMemory(moved, fauna.pos);
    } else {
      this.world.moveEntityInMemory(moved, fauna.pos); // same hex, just refresh timer
    }
    updated.push(moved);
  }

  private emptyNeighbor(pos: Position, occupied: Set<string>): Position | null {
    // Check the authoritative world, not just the in-memory occupied set:
    // a neighbor may lie in a not-yet-generated chunk that already holds a
    // static entity, which the occupied set wouldn't know about.
    const open = getNeighbors(pos).filter(
      (n) => !occupied.has(posToKey(n.q, n.r)) && this.world.getEntitiesAt(n.q, n.r).length === 0,
    );
    if (open.length === 0) return null;
    return open[Math.floor(Math.random() * open.length)];
  }

  // --- Nudges: the player's entire, gentle, additive action set ------------

  /** Scatter seeds: a young sprout takes root on an open hex. */
  scatter(pos: Position): Entity | null {
    // A wanderer standing here doesn't block their own seed; scenery does.
    if (this.world.getEntitiesAt(pos.q, pos.r).some((e) => e.type !== 'player')) return null;
    const species = SCATTERABLE[Math.floor(Math.random() * SCATTERABLE.length)];
    const sprout = makeSprout(species, 'flora', pos.q, pos.r, Date.now());
    this.world.addEntity(sprout);
    return sprout;
  }

  /** Coax growth: encourage the plant here toward its next stage. */
  coax(pos: Position): Entity | null {
    const plant = this.world
      .getEntitiesAt(pos.q, pos.r)
      .find(e => e.type === 'flora' || e.type === 'tree') as Flora | Tree | undefined;
    if (!plant || plant.growthStage >= MAX_GROWTH) return null;
    const grown = { ...plant, growthStage: Math.min(MAX_GROWTH, Math.floor(plant.growthStage) + 1), lastUpdate: Date.now() };
    this.world.updateEntity(grown);
    return grown;
  }

  /** Part the grass / draw creatures near: stir nearby fauna to move now. */
  stir(pos: Position, radius: number): Entity[] {
    const affected: Entity[] = [];
    const scan = this.world.getAllEntitiesInRadius(pos.q, pos.r, 1);
    for (const e of scan) {
      if (e.type === 'fauna' && distance(e.pos, pos) <= radius) {
        (e as Fauna).nextMoveTime = 0; // free to move on the next tick
        affected.push(e);
      }
    }
    return affected;
  }
}
