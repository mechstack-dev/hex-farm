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
    const { cq, cr } = getChunkCoords(entity.pos.q, entity.pos.r);
    const key = chunkToKey(cq, cr);
    if (!this.persistentByChunk.has(key)) {
        this.persistentByChunk.set(key, []);
    }
    this.persistentByChunk.get(key)!.push(entity);
  }

  private removeFromPersistence(id: string, q: number, r: number) {
    this.persistentEntities.delete(id);
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
        entities: Array.from(this.persistentEntities.values())
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
      const staticEntities = this.generator.generateStaticEntities(cq, cr, CHUNK_SIZE);
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
    chunk.entities.push(entity);

    if (entity.type === 'plant' || entity.type === 'fence') {
      if (!this.persistentEntities.has(entity.id)) {
          this.addToPersistence(entity);
          this.markDirty();
      }
    }
  }

  removeEntity(id: string, q: number, r: number) {
    const { cq, cr } = getChunkCoords(q, r);
    const chunk = this.getChunk(cq, cr);
    chunk.entities = chunk.entities.filter(e => e.id !== id);

    if (this.persistentEntities.has(id)) {
        this.removeFromPersistence(id, q, r);
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

  updateChunkEntities(cq: number, cr: number, newEntities: Entity[]) {
    const key = chunkToKey(cq, cr);
    const chunk = this.chunks.get(key);
    if (chunk) {
      chunk.entities = newEntities;
    }
  }
}
