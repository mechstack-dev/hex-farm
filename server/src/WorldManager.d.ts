import { Entity, WorldChunk } from '../../common/src/types';
export declare class WorldManager {
    private chunks;
    private generator;
    constructor(seed: string);
    getChunk(cq: number, cr: number): WorldChunk;
    getEntitiesAt(q: number, r: number): Entity[];
    addEntity(entity: Entity): void;
    removeEntity(id: string, q: number, r: number): void;
    getAllEntitiesInRadius(q: number, r: number, radiusChunks: number): Entity[];
}
//# sourceMappingURL=WorldManager.d.ts.map