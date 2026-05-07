import { Entity } from '../../common/src/types';
export declare class Generator {
    private noise;
    private rng;
    constructor(seed: string);
    generateStaticEntities(cq: number, cr: number, chunkSize: number): Entity[];
}
//# sourceMappingURL=Generator.d.ts.map