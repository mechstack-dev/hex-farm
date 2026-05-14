import { CHUNK_SIZE, getChunkCoords, chunkToKey } from 'common';
import type { Entity, WorldChunk, Player } from 'common';
import { Generator } from './Generator.js';
import fs from 'fs';
import path from 'path';

export class WorldManager {
  private chunks: Map<string, WorldChunk> = new Map();
  private generator: Generator;
  private persistentEntities: Map<string, Entity> = new Map(); // id -> Entity
  private persistentByChunk: Map<string, Entity[]> = new Map(); // chunkKey -> Entity[]
  private removedStaticIds: Set<string> = new Set();
  private players: Map<string, Player> = new Map();
  private dataFilePath = path.join(process.cwd(), 'data', 'world.json');
  private isDirty: boolean = false;
  private lastSaveTime: number = 0;
  private SAVE_INTERVAL = 30000; // 30 seconds

  constructor(seed: string) {
    this.generator = new Generator(seed);
    this.loadState();

    // Auto-save loop
    setInterval(() => {
      if (this.isDirty && Date.now() - this.lastSaveTime > this.SAVE_INTERVAL) {
        this.saveState();
      }
    }, 5000);
  }

  private loadState() {
    if (fs.existsSync(this.dataFilePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.dataFilePath, 'utf8'));
        const entities: Entity[] = data.entities || [];
        entities.forEach(e => this.addToPersistence(e));

        const removedIds: string[] = data.removedStaticIds || [];
        this.removedStaticIds = new Set(removedIds);

        // Re-distribute persistent entities into chunks if they are already loaded
        entities.forEach(entity => {
          const { cq, cr } = getChunkCoords(entity.pos.q, entity.pos.r);
          const key = chunkToKey(cq, cr);
          const chunk = this.chunks.get(key);
          if (chunk) {
            chunk.entities.push(entity);
          }
        });
        console.log(`Loaded ${entities.length} persistent entities.`);
      } catch (e) {
        console.error('Failed to load world state:', e);
      }
    }
  }

  private addToPersistence(entity: Entity) {
    this.persistentEntities.set(entity.id, entity);
    this.addToChunkIndex(entity);
  }

  private addToChunkIndex(entity: Entity) {
    const { cq, cr } = getChunkCoords(entity.pos.q, entity.pos.r);
    const key = chunkToKey(cq, cr);
    if (!this.persistentByChunk.has(key)) {
        this.persistentByChunk.set(key, []);
    }
    const chunkEntities = this.persistentByChunk.get(key)!;
    if (!chunkEntities.find(e => e.id === entity.id)) {
        chunkEntities.push(entity);
    }
  }

  private removeFromPersistence(id: string, q: number, r: number) {
    this.persistentEntities.delete(id);
    this.removeFromChunkIndex(id, q, r);
  }

  private removeFromChunkIndex(id: string, q: number, r: number) {
    const { cq, cr } = getChunkCoords(q, r);
    const key = chunkToKey(cq, cr);
    const chunkEntities = this.persistentByChunk.get(key);
    if (chunkEntities) {
        this.persistentByChunk.set(key, chunkEntities.filter(e => e.id !== id));
    }
  }

  markDirty() {
    this.isDirty = true;
  }

  async saveState() {
    if (!this.isDirty) return;
    this.isDirty = false;
    this.lastSaveTime = Date.now();

    try {
      const data = {
        entities: Array.from(this.persistentEntities.values()),
        removedStaticIds: Array.from(this.removedStaticIds)
      };
      await fs.promises.writeFile(this.dataFilePath, JSON.stringify(data, null, 2));
      console.log('World state saved successfully.');
    } catch (e) {
      console.error('Failed to save world state:', e);
      this.isDirty = true; // Retry later
    }
  }

  getChunk(cq: number, cr: number): WorldChunk {
    const key = chunkToKey(cq, cr);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const staticEntities = this.generator.generateStaticEntities(cq, cr, CHUNK_SIZE)
        .filter(e => !this.persistentEntities.has(e.id) && !this.removedStaticIds.has(e.id));
      chunk = { q: cq, r: cr, entities: staticEntities };

      // Add persistent entities that belong to this chunk
      const chunkPersistent = this.persistentByChunk.get(key) || [];
      chunk.entities.push(...chunkPersistent);

      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  getEntitiesAt(q: number, r: number): Entity[] {
    const { cq, cr } = getChunkCoords(q, r);
    const chunk = this.getChunk(cq, cr);
    return chunk.entities.filter(e => e.pos.q === q && e.pos.r === r);
  }

  addEntity(entity: Entity) {
    const { cq, cr } = getChunkCoords(entity.pos.q, entity.pos.r);
    const chunk = this.getChunk(cq, cr);
    if (!chunk.entities.find(e => e.id === entity.id)) {
        chunk.entities.push(entity);
    }

    const isPersistentType = ['plant', 'fence', 'animal', 'floor', 'sprinkler', 'player', 'building'].includes(entity.type) ||
                             (entity.type === 'obstacle' && entity.species === 'scarecrow');
    if (isPersistentType) {
      if (!this.persistentEntities.has(entity.id)) {
          this.addToPersistence(entity);
          this.markDirty();
      } else {
          // If already persistent, ensure it's in the correct chunk index
          this.addToChunkIndex(entity);
          this.persistentEntities.set(entity.id, entity); // Update data
          this.markDirty();
      }
    }
  }

  updateEntity(entity: Entity) {
    const { cq, cr } = getChunkCoords(entity.pos.q, entity.pos.r);
    const chunk = this.getChunk(cq, cr);
    chunk.entities = chunk.entities.map(e => e.id === entity.id ? entity : e);

    if (this.persistentEntities.has(entity.id)) {
      this.persistentEntities.set(entity.id, entity);
      const key = chunkToKey(cq, cr);
      const chunkPersistent = this.persistentByChunk.get(key);
      if (chunkPersistent) {
        this.persistentByChunk.set(key, chunkPersistent.map(e => e.id === entity.id ? entity : e));
      }
      this.markDirty();
    } else {
      const isPersistentType = ['plant', 'fence', 'animal', 'floor', 'sprinkler', 'player', 'building'].includes(entity.type) ||
                               (entity.type === 'obstacle' && entity.species === 'scarecrow');
      if (isPersistentType) {
        this.addToPersistence(entity);
        this.markDirty();
      }
    }
  }

  removeEntity(id: string, q: number, r: number, permanent: boolean = false) {
    const { cq, cr } = getChunkCoords(q, r);
    const chunk = this.getChunk(cq, cr);
    chunk.entities = chunk.entities.filter(e => e.id !== id);

    const isPlayer = id.startsWith('player-');

    if (this.persistentEntities.has(id)) {
        if (permanent || !isPlayer) {
          this.removeFromPersistence(id, q, r);
        } else {
          // For players being removed from active state, we still want to remove them from chunk index
          // but keep them in persistentEntities.
          this.removeFromChunkIndex(id, q, r);
        }
        this.markDirty();
    }

    // If it's not a player and it's either permanent or not persistent anymore,
    // track it as removed to prevent static generator from recreating it.
    if (!isPlayer && (permanent || !this.persistentEntities.has(id))) {
        this.removedStaticIds.add(id);
        this.markDirty();
    }
  }

  getAllEntitiesInRadius(q: number, r: number, radiusChunks: number): Entity[] {
    const { cq, cr } = getChunkCoords(q, r);
    const entities: Entity[] = [];
    for (let dq = -radiusChunks; dq <= radiusChunks; dq++) {
      for (let dr = -radiusChunks; dr <= radiusChunks; dr++) {
        entities.push(...this.getChunk(cq + dq, cr + dr).entities);
      }
    }
    return entities;
  }

  getActiveChunks(): WorldChunk[] {
    return Array.from(this.chunks.values());
  }

  getPersistentEntity(id: string): Entity | undefined {
    return this.persistentEntities.get(id);
  }

  updateChunkEntities(cq: number, cr: number, newEntities: Entity[]) {
    const key = chunkToKey(cq, cr);
    const chunk = this.chunks.get(key);
    if (chunk) {
      chunk.entities = newEntities;
    }
  }

  cleanupChunks(players: Player[]) {
    const activeKeys = new Set<string>();
    const radius = 2;

    players.forEach(player => {
      const { cq, cr } = getChunkCoords(player.pos.q, player.pos.r);
      for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = -radius; dr <= radius; dr++) {
          activeKeys.add(chunkToKey(cq + dq, cr + dr));
        }
      }
    });

    for (const key of this.chunks.keys()) {
      if (!activeKeys.has(key)) {
        this.chunks.delete(key);
      }
    }
  }
}
