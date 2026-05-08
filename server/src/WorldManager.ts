import { CHUNK_SIZE, getChunkCoords, chunkToKey } from 'common';
import type { Entity, WorldChunk } from 'common';
import { Generator } from './Generator.js';

export class WorldManager {
  private chunks: Map<string, WorldChunk> = new Map();
  private generator: Generator;

  constructor(seed: string) {
    this.generator = new Generator(seed);
  }

  getChunk(cq: number, cr: number): WorldChunk {
    const key = chunkToKey(cq, cr);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const staticEntities = this.generator.generateStaticEntities(cq, cr, CHUNK_SIZE);
      chunk = { q: cq, r: cr, entities: staticEntities };
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
  }

  removeEntity(id: string, q: number, r: number) {
    const { cq, cr } = getChunkCoords(q, r);
    const chunk = this.getChunk(cq, cr);
    chunk.entities = chunk.entities.filter(e => e.id !== id);
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
