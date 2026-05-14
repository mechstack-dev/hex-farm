import * as PIXI from 'pixi.js';
import type { Entity, Position, Plant, Animal, EnvironmentState } from 'common';
import { axialToPixel, GAME_DAY } from 'common';
import { socket } from '../network';

socket.on('init', ({ playerId: _playerId }: { playerId: string }) => {
    // We can use _playerId if we need to identify the local player specifically in the renderer later
});

const HEX_SIZE = 30;
const TYPE_ORDER: Record<string, number> = { 'floor': 0, 'fence': 1, 'plant': 2, 'building': 3, 'obstacle': 4, 'animal': 5, 'player': 6 };

export class HexRenderer {
  private app: PIXI.Application;
  private container: PIXI.Container;
  private graphics: PIXI.Graphics;
  private overlay: PIXI.Graphics;
  private initialized: boolean = false;

  private lastEntities: Entity[] = [];
  private lastPlayerPos: Position = { q: 0, r: 0 };
  private lastEnvironment: EnvironmentState | null = null;
  private rainDrops: { x: number, y: number, speed: number, length: number }[] = [];
  private snowFlakes: { x: number, y: number, speed: number, size: number, drift: number }[] = [];
  private birds: { x: number, y: number, vx: number, vy: number, size: number, state: 'flying' | 'landed', timer: number }[] = [];
  private decorativeEntities: { x: number, y: number, type: 'firefly' | 'butterfly', offset: number, speed: number }[] = [];
  private interpolatedPositions: Map<string, { x: number, y: number }> = new Map();
  private interpolatedCamera: { x: number, y: number } = { x: 0, y: 0 };
  private playerLabels: Map<string, PIXI.Text> = new Map();
  private plantLabels: Map<string, PIXI.Text> = new Map();
  private hearts: { x: number, y: number, alpha: number, startTime: number }[] = [];
  private visibleLandingSpots: { x: number, y: number }[] = [];

  constructor(element: HTMLDivElement) {
    this.app = new PIXI.Application();
    this.container = new PIXI.Container();
    this.graphics = new PIXI.Graphics();
    this.overlay = new PIXI.Graphics();
    
    this.app.init({
        resizeTo: element,
        backgroundColor: 0x1099bb,
        antialias: true,
    }).then(() => {
        element.appendChild(this.app.canvas);
        this.app.stage.addChild(this.container);
        this.container.addChild(this.graphics);
        this.app.stage.addChild(this.overlay);
        this.container.x = this.app.screen.width / 2;
        this.container.y = this.app.screen.height / 2;
        this.initialized = true;

        this.app.ticker.add(() => this.update());

        socket.on('pet_interact', ({ pos }: { pos: Position }) => {
            const { x, y } = axialToPixel(pos.q, pos.r, HEX_SIZE);
            this.hearts.push({ x, y: y - 20, alpha: 1, startTime: Date.now() });
        });
    });
  }

  drawHexHighlight(q: number, r: number) {
    const { x, y } = axialToPixel(q, r, HEX_SIZE);
    this.graphics.poly([
        x + HEX_SIZE * Math.cos(0), y + HEX_SIZE * Math.sin(0),
        x + HEX_SIZE * Math.cos(Math.PI/3), y + HEX_SIZE * Math.sin(Math.PI/3),
        x + HEX_SIZE * Math.cos(2*Math.PI/3), y + HEX_SIZE * Math.sin(2*Math.PI/3),
        x + HEX_SIZE * Math.cos(Math.PI), y + HEX_SIZE * Math.sin(Math.PI),
        x + HEX_SIZE * Math.cos(4*Math.PI/3), y + HEX_SIZE * Math.sin(4*Math.PI/3),
        x + HEX_SIZE * Math.cos(5*Math.PI/3), y + HEX_SIZE * Math.sin(5*Math.PI/3),
    ]);
    this.graphics.stroke({ color: 0xFFFF00, width: 3, alpha: 0.8 });
  }

  drawPlayer(x: number, y: number, color: number) {
    this.graphics.circle(x, y, HEX_SIZE * 0.6);
    this.graphics.fill({ color, alpha: 1 });
    this.graphics.stroke({ color: 0x000000, width: 2 });
  }

  drawTree(x: number, y: number) {
    const seed = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
    const scale = 0.8 + (seed % 0.4);
    const season = this.lastEnvironment?.season || 'spring';

    // Trunk with shading
    this.graphics.rect(x - 4 * scale, y, 8 * scale, 15 * scale);
    this.graphics.fill({ color: 0x8B4513, alpha: 1 });
    this.graphics.rect(x + 2 * scale, y, 2 * scale, 15 * scale);
    this.graphics.fill({ color: 0x5D2E0C, alpha: 1 });

    // Seasonal foliage colors
    let foliageBase = 0x228B22;
    let foliageMid = 0x2E8B57;
    let foliageTop = 0x3CB371;
    let highlight = 0x90EE90;

    if (season === 'autumn') {
        foliageBase = 0x8B4513; // Brown
        foliageMid = 0xD2691E;  // Chocolate
        foliageTop = 0xFF4500;  // OrangeRed
        highlight = 0xFFD700;   // Gold
    } else if (season === 'winter') {
        foliageBase = 0x2F4F4F; // Dark Slate Gray
        foliageMid = 0x556B2F;  // Dark Olive Green
        foliageTop = 0x8FBC8F;  // Dark Sea Green
        highlight = 0xFFFFFF;   // Snow (White)
    } else if (season === 'summer') {
        foliageBase = 0x006400; // Dark Green
        foliageMid = 0x228B22;  // Forest Green
        foliageTop = 0x32CD32;  // Lime Green
        highlight = 0xADFF2F;   // Green Yellow
    }

    // Layered foliage for depth
    this.graphics.circle(x, y - 8 * scale, HEX_SIZE * 0.7 * scale);
    this.graphics.fill({ color: foliageBase, alpha: 1 });
    this.graphics.circle(x - 5 * scale, y - 12 * scale, HEX_SIZE * 0.5 * scale);
    this.graphics.fill({ color: foliageMid, alpha: 1 });
    this.graphics.circle(x + 5 * scale, y - 10 * scale, HEX_SIZE * 0.4 * scale);
    this.graphics.fill({ color: foliageTop, alpha: 1 });

    // Highlights (snow in winter)
    this.graphics.circle(x - 3 * scale, y - 15 * scale, 4 * scale);
    this.graphics.fill({ color: highlight, alpha: season === 'winter' ? 0.8 : 0.3 });
    if (season === 'winter') {
        this.graphics.circle(x + 4 * scale, y - 12 * scale, 3 * scale);
        this.graphics.fill({ color: 0xFFFFFF, alpha: 0.8 });
    }
  }

  drawRock(x: number, y: number) {
    const seed = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
    const scale = 0.7 + (seed % 0.6);

    this.graphics.poly([
        x - 12 * scale, y + 10 * scale,
        x + 12 * scale, y + 10 * scale,
        x + 10 * scale, y - 5 * scale,
        x - 2 * scale, y - 10 * scale,
        x - 10 * scale, y - 5 * scale,
    ]);
    this.graphics.fill({ color: 0x808080, alpha: 1 });
    this.graphics.stroke({ color: 0x333333, width: 1 });

    // Shading/cracks
    this.graphics.moveTo(x - 5 * scale, y - 5 * scale);
    this.graphics.lineTo(x + 2 * scale, y + 2 * scale);
    this.graphics.stroke({ color: 0x555555, width: 1 });

    // Highlight
    this.graphics.circle(x - 4 * scale, y - 6 * scale, 3 * scale);
    this.graphics.fill({ color: 0xAAAAAA, alpha: 0.5 });
  }

  drawWater(x: number, y: number) {
    const size = HEX_SIZE * 1.0;
    this.graphics.poly([
        x + size * Math.cos(0), y + size * Math.sin(0),
        x + size * Math.cos(Math.PI/3), y + size * Math.sin(Math.PI/3),
        x + size * Math.cos(2*Math.PI/3), y + size * Math.sin(2*Math.PI/3),
        x + size * Math.cos(Math.PI), y + size * Math.sin(Math.PI),
        x + size * Math.cos(4*Math.PI/3), y + size * Math.sin(4*Math.PI/3),
        x + size * Math.cos(5*Math.PI/3), y + size * Math.sin(5*Math.PI/3),
    ]);
    this.graphics.fill({ color: 0x4169E1, alpha: 0.8 }); // Royal Blue
    this.graphics.stroke({ color: 0x1E90FF, width: 1 }); // Dodger Blue

    // Waves animation
    const offset = (Date.now() / 1000) % (Math.PI * 2);
    for (let i = -1; i <= 1; i++) {
        const wx = x + Math.sin(offset + i) * 5;
        const wy = y + i * 8;
        this.graphics.moveTo(wx - 10, wy);
        this.graphics.bezierCurveTo(wx - 5, wy - 3, wx + 5, wy + 3, wx + 10, wy);
        this.graphics.stroke({ color: 0xADD8E6, width: 1, alpha: 0.4 });
    }
  }

  drawPlant(plant: Plant, x: number, y: number) {
    const stage = Math.floor(plant.growthStage);
    const size = (stage + 1) * (HEX_SIZE / 6);

    // Simple swaying animation
    const sway = Math.sin(Date.now() / 500 + x) * 2;
    const swayX = stage < 5 ? x + sway : x;

    let color = 0x00FF00;
    if (plant.species === 'carrot') color = 0xFFA500;
    else if (plant.species === 'pumpkin') color = 0xFF8C00;
    else if (plant.species === 'turnip') color = 0xFFFFFF;
    else if (plant.species === 'corn') color = 0xFFFF00;
    else if (plant.species === 'orange') color = 0xFFA500;
    else if (plant.species === 'winter-radish') color = 0xE6E6FA; // Lavender/White
    else if (plant.species === 'kale') color = 0x006400; // Dark Green
    else if (plant.species === 'mushroom') color = 0xA52A2A;
    else if (plant.species === 'sunflower') color = 0xFFFF00;

    if (stage < 5) {
        // Sprout
        this.graphics.circle(swayX, y + 5, size);
        this.graphics.fill({ color: 0x32CD32, alpha: 1 });
        // Leaves
        this.graphics.ellipse(swayX - 4, y, 4, 8);
        this.graphics.fill({ color: 0x228B22, alpha: 1 });
        this.graphics.ellipse(swayX + 4, y, 4, 8);
        this.graphics.fill({ color: 0x228B22, alpha: 1 });
    } else if (plant.species === 'mushroom') {
        // Mushroom cap
        this.graphics.ellipse(x, y + 5, 8, 4);
        this.graphics.fill({ color: 0xA52A2A, alpha: 1 });
        // Stem
        this.graphics.rect(x - 2, y + 5, 4, 6);
        this.graphics.fill({ color: 0xF5F5DC, alpha: 1 });
        // Spots
        this.graphics.circle(x - 3, y + 4, 1.5);
        this.graphics.fill({ color: 0xFFFFFF, alpha: 0.8 });
        this.graphics.circle(x + 2, y + 6, 1);
        this.graphics.fill({ color: 0xFFFFFF, alpha: 0.8 });
    } else if (plant.species === 'berry-bush') {
        // Bush foliage
        this.graphics.circle(x, y, HEX_SIZE * 0.6);
        this.graphics.fill({ color: 0x006400, alpha: 1 });

        // Berries
        const hasBerries = (Date.now() - (plant.lastProductTime || 0) >= GAME_DAY);
        if (hasBerries) {
            for (let i = 0; i < 6; i++) {
                const bx = x + Math.cos(i) * 10;
                const by = y + Math.sin(i) * 10;
                this.graphics.circle(bx, by, 2.5);
                this.graphics.fill({ color: 0x800080, alpha: 1 }); // Purple berries
            }
        }
    } else if (plant.species === 'apple-tree' || plant.species === 'orange-tree' || plant.species === 'tree') {
        // Growing Tree
        const trunkWidth = 2 + (stage * 0.8);
        const trunkHeight = 4 + (stage * 2.2);
        const foliageRadius = stage * (HEX_SIZE * 0.14);

        // Trunk
        this.graphics.rect(x - trunkWidth/2, y + 5 - trunkHeight, trunkWidth, trunkHeight);
        this.graphics.fill({ color: 0x8B4513, alpha: 1 });

        // Foliage
        if (stage > 0) {
            let foliageColor = 0x228B22;
            if (this.lastEnvironment?.season === 'autumn') foliageColor = 0xD2691E;
            else if (this.lastEnvironment?.season === 'winter') foliageColor = 0x2F4F4F;
            else if (this.lastEnvironment?.season === 'summer') foliageColor = 0x006400;

            this.graphics.circle(x, y + 5 - trunkHeight, foliageRadius);
            this.graphics.fill({ color: foliageColor, alpha: 1 });

            // Fruit for fruit trees
            if ((plant.species === 'apple-tree' || plant.species === 'orange-tree') && stage >= 5) {
                const hasFruit = (Date.now() - (plant.lastProductTime || 0) >= GAME_DAY);
                if (hasFruit) {
                    const fruitColor = plant.species === 'apple-tree' ? 0xFF0000 : 0xFFA500;
                    for (let i = 0; i < 5; i++) {
                        const ax = x + Math.cos(i * 1.2) * 10;
                        const ay = y + 5 - trunkHeight + Math.sin(i * 1.2) * 10;
                        this.graphics.circle(ax, ay, 2.5);
                        this.graphics.fill({ color: fruitColor, alpha: 1 });
                    }
                }
            }

            // Snow for winter
            if (this.lastEnvironment?.season === 'winter') {
                this.graphics.circle(x - foliageRadius * 0.4, y + 5 - trunkHeight - foliageRadius * 0.5, foliageRadius * 0.4);
                this.graphics.fill({ color: 0xFFFFFF, alpha: 0.7 });
            }
        }
    } else {
        // Mature
        this.graphics.circle(x, y, size);
        this.graphics.fill({ color, alpha: 1 });
        this.graphics.stroke({ color: 0x000000, width: 1, alpha: 0.3 });

        // Detail based on species
        if (plant.species === 'pumpkin') {
            this.graphics.moveTo(x, y - size);
            this.graphics.lineTo(x, y + size);
            this.graphics.stroke({ color: 0x8B4513, width: 1, alpha: 0.5 });
        } else if (plant.species === 'corn') {
            this.graphics.rect(x - 2, y - size, 4, size * 2);
            this.graphics.fill({ color: 0x228B22, alpha: 1 }); // Green stalk
            this.graphics.ellipse(x, y - size * 0.5, 4, 8);
            this.graphics.fill({ color: 0xFFFF00, alpha: 1 }); // Yellow cob
        } else if (plant.species === 'wheat') {
            for (let i = -1; i <= 1; i++) {
                this.graphics.moveTo(x + i * 4, y + size);
                this.graphics.lineTo(x + i * 4, y - size);
                this.graphics.stroke({ color: 0xDAA520, width: 2 });
            }
        } else if (plant.species === 'winter-radish') {
            this.graphics.ellipse(x, y + 2, size, size * 1.5);
            this.graphics.fill({ color: 0xE6E6FA, alpha: 1 });
            // Purple top
            this.graphics.ellipse(x, y - size * 0.5, size, size * 0.5);
            this.graphics.fill({ color: 0x800080, alpha: 0.8 });
        } else if (plant.species === 'sunflower') {
            // Stalk
            this.graphics.rect(x - 2, y - size, 4, size * 2);
            this.graphics.fill({ color: 0x228B22, alpha: 1 });
            // Flower head
            this.graphics.circle(x, y - size, 8);
            this.graphics.fill({ color: 0xFFFF00, alpha: 1 });
            // Center
            this.graphics.circle(x, y - size, 3);
            this.graphics.fill({ color: 0x4B2C20, alpha: 1 });
        } else if (plant.species === 'kale') {
            // Dark green curly leaves
            for (let i = 0; i < 5; i++) {
                const angle = (i / 5) * Math.PI * 2;
                const lx = x + Math.cos(angle) * (size * 0.6);
                const ly = y + Math.sin(angle) * (size * 0.6);
                this.graphics.circle(lx, ly, size * 0.5);
                this.graphics.fill({ color: 0x006400, alpha: 1 });
                // Leaf texture
                this.graphics.circle(lx, ly, size * 0.3);
                this.graphics.stroke({ color: 0x004d00, width: 1 });
            }
        }
    }

    // Watering indicator
    const isWatered = (Date.now() - plant.lastWatered < GAME_DAY);
    if (isWatered) {
        this.graphics.circle(x + 12, y + 12, 4);
        this.graphics.fill({ color: 0x0000FF, alpha: 0.8 });
        this.graphics.stroke({ color: 0xFFFFFF, width: 1, alpha: 0.5 });
    }
  }

  drawAnimal(animal: Animal, x: number, y: number) {
    // Simple bounce animation
    const bounce = Math.abs(Math.sin(Date.now() / 300 + x)) * 3;
    const bounceY = y - bounce;
    let color = 0xFFFFFF;
    let sizeScale = 1.0;
    if (animal.species === 'cow') {
        color = 0xFFFFFF;
        sizeScale = 1.0;
    } else if (animal.species === 'sheep') {
        color = 0xDDDDDD;
        sizeScale = 0.8;
    } else if (animal.species === 'chicken') {
        color = 0xFFFF00;
        sizeScale = 0.5;
    } else if (animal.species === 'pig') {
        color = 0xFFC0CB; // Pink
        sizeScale = 0.7;
    } else if (animal.species === 'goat') {
        color = 0xD3D3D3; // Light Gray
        sizeScale = 0.8;
    } else if (animal.species === 'duck') {
        color = 0xFFFFFF; // White
        sizeScale = 0.5;
    } else if (animal.species === 'dog') {
        color = 0x8B4513; // Brown
        sizeScale = 0.6;
    } else if (animal.species === 'cat') {
        color = 0xFFA500; // Orange
        sizeScale = 0.4;
    } else if (animal.species === 'merchant') {
        color = 0x800080; // Purple
        sizeScale = 1.2;
    } else if (animal.species === 'blacksmith') {
        color = 0xFF4500; // OrangeRed
        sizeScale = 1.2;
    } else if (animal.species === 'fisherman') {
        color = 0x1E90FF; // DodgerBlue
        sizeScale = 1.1;
    } else if (animal.species === 'miner') {
        color = 0xFFD700; // Gold
        sizeScale = 1.2;
    }

    this.graphics.ellipse(x, bounceY, HEX_SIZE * 0.5 * sizeScale, HEX_SIZE * 0.3 * sizeScale);
    this.graphics.fill({ color, alpha: 1 });
    this.graphics.stroke({ color: 0x000000, width: 1 });

    // Eyes
    this.graphics.circle(x + HEX_SIZE * 0.3 * sizeScale, bounceY - HEX_SIZE * 0.1 * sizeScale, 2);
    this.graphics.fill({ color: 0x000000, alpha: 1 });

    // Patterns/Details
    if (animal.species === 'cow') {
        this.graphics.circle(x - 5, bounceY, 4);
        this.graphics.fill({ color: 0x000000, alpha: 0.8 });
    } else if (animal.species === 'chicken') {
        this.graphics.moveTo(x + 5, bounceY - 5);
        this.graphics.lineTo(x + 10, bounceY - 5);
        this.graphics.stroke({ color: 0xFF0000, width: 2 }); // Comb
    } else if (animal.species === 'pig') {
        this.graphics.circle(x + 10 * sizeScale, bounceY, 4 * sizeScale);
        this.graphics.fill({ color: 0xFF69B4, alpha: 1 }); // Snout
        this.graphics.circle(x + 10 * sizeScale, bounceY - 1, 1);
        this.graphics.circle(x + 10 * sizeScale, bounceY + 1, 1);
        this.graphics.fill({ color: 0x000000, alpha: 1 });
    } else if (animal.species === 'goat') {
        // Horns
        this.graphics.moveTo(x, bounceY - 5);
        this.graphics.lineTo(x - 5, bounceY - 12);
        this.graphics.moveTo(x, bounceY - 5);
        this.graphics.lineTo(x + 5, bounceY - 12);
        this.graphics.stroke({ color: 0x555555, width: 2 });
    } else if (animal.species === 'duck') {
        // Beak
        this.graphics.poly([
            x + 8 * sizeScale, bounceY - 2,
            x + 15 * sizeScale, bounceY,
            x + 8 * sizeScale, bounceY + 2
        ]);
        this.graphics.fill({ color: 0xFFA500, alpha: 1 });
    }
  }

  drawFence(x: number, y: number, neighbors: boolean[]) {
    // Post
    this.graphics.circle(x, y, 6);
    this.graphics.fill({ color: 0x8B4513, alpha: 1 });
    this.graphics.stroke({ color: 0x3d2b1f, width: 2 });

    // Connecting rails
    neighbors.forEach((hasNeighbor, i) => {
        if (hasNeighbor) {
            const directions = [
                { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
                { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
            ];
            const d = directions[i];
            const { x: nx, y: ny } = axialToPixel(d.q, d.r, HEX_SIZE);
            const rx = x + nx * 0.5;
            const ry = y + ny * 0.5;

            this.graphics.moveTo(x, y);
            this.graphics.lineTo(rx, ry);
            this.graphics.stroke({ color: 0x8B4513, width: 6 });
            this.graphics.stroke({ color: 0x3d2b1f, width: 2 });
        }
    });
  }

  drawSprinkler(entity: Entity, x: number, y: number) {
    // Base
    let color = 0x4682B4; // Basic: SteelBlue
    if (entity.species === 'iron-sprinkler') color = 0xC0C0C0; // Silver
    else if (entity.species === 'gold-sprinkler') color = 0xFFD700; // Gold

    this.graphics.circle(x, y, 8);
    this.graphics.fill({ color, alpha: 1 });
    this.graphics.stroke({ color: 0x333333, width: 1 });

    // Rotating head (animated)
    const angle = Date.now() / 200;
    const hx = x + Math.cos(angle) * 10;
    const hy = y + Math.sin(angle) * 10;

    this.graphics.moveTo(x, y);
    this.graphics.lineTo(hx, hy);
    this.graphics.stroke({ color: 0x87CEEB, width: 3 });

    this.graphics.circle(hx, hy, 3);
    this.graphics.fill({ color: 0x00BFFF, alpha: 1 });
  }

  drawScarecrow(x: number, y: number) {
    // Post
    this.graphics.rect(x - 2, y, 4, 15);
    this.graphics.fill({ color: 0x8B4513, alpha: 1 });

    // Arms
    this.graphics.rect(x - 15, y - 5, 30, 3);
    this.graphics.fill({ color: 0x8B4513, alpha: 1 });

    // Shirt
    this.graphics.poly([
        x - 10, y - 5,
        x + 10, y - 5,
        x + 8, y + 10,
        x - 8, y + 10,
    ]);
    this.graphics.fill({ color: 0x0000FF, alpha: 1 });

    // Head (Straw hat)
    this.graphics.circle(x, y - 12, 6);
    this.graphics.fill({ color: 0xF5F5DC, alpha: 1 });
    this.graphics.rect(x - 10, y - 14, 20, 2);
    this.graphics.fill({ color: 0xDEB887, alpha: 1 });
  }

  drawBuilding(entity: Entity, x: number, y: number) {
    if (entity.species === 'shed') {
        // Main structure
        this.graphics.rect(x - 15, y - 10, 30, 20);
        this.graphics.fill({ color: 0x8B4513, alpha: 1 });
        this.graphics.stroke({ color: 0x3D2B1F, width: 2 });

        // Roof
        this.graphics.poly([
            x - 18, y - 10,
            x + 18, y - 10,
            x, y - 25
        ]);
        this.graphics.fill({ color: 0xA52A2A, alpha: 1 });
        this.graphics.stroke({ color: 0x3D2B1F, width: 2 });

        // Door
        this.graphics.rect(x - 5, y, 10, 10);
        this.graphics.fill({ color: 0x5D3A1A, alpha: 1 });
        this.graphics.stroke({ color: 0x000000, width: 1 });
    } else if (entity.species === 'chest') {
        // Base
        this.graphics.rect(x - 10, y - 5, 20, 12);
        this.graphics.fill({ color: 0x8B4513, alpha: 1 });
        this.graphics.stroke({ color: 0x3D2B1F, width: 1 });

        // Lid
        this.graphics.rect(x - 10, y - 8, 20, 4);
        this.graphics.fill({ color: 0xA0522D, alpha: 1 });
        this.graphics.stroke({ color: 0x3D2B1F, width: 1 });

        // Lock
        this.graphics.rect(x - 2, y - 6, 4, 3);
        this.graphics.fill({ color: 0xFFD700, alpha: 1 });
    } else if (entity.species === 'well') {
        // Base (Circular stone wall)
        this.graphics.circle(x, y, 15);
        this.graphics.fill({ color: 0x808080, alpha: 1 });
        this.graphics.stroke({ color: 0x333333, width: 2 });

        // Inner water
        this.graphics.circle(x, y, 10);
        this.graphics.fill({ color: 0x4169E1, alpha: 1 });

        // Roof support posts
        this.graphics.rect(x - 12, y - 5, 3, 10);
        this.graphics.rect(x + 9, y - 5, 3, 10);
        this.graphics.fill({ color: 0x8B4513, alpha: 1 });

        // Roof
        this.graphics.poly([
            x - 16, y - 5,
            x + 16, y - 5,
            x, y - 20
        ]);
        this.graphics.fill({ color: 0xA52A2A, alpha: 1 });
        this.graphics.stroke({ color: 0x3D2B1F, width: 1 });
    } else if (entity.species === 'beehive') {
        // Box
        this.graphics.rect(x - 12, y - 10, 24, 20);
        this.graphics.fill({ color: 0xDAA520, alpha: 1 });
        this.graphics.stroke({ color: 0x3D2B1F, width: 1 });

        // Stripes
        this.graphics.rect(x - 12, y - 4, 24, 2);
        this.graphics.fill({ color: 0x000000, alpha: 0.8 });
        this.graphics.rect(x - 12, y + 4, 24, 2);
        this.graphics.fill({ color: 0x000000, alpha: 0.8 });

        // Top
        this.graphics.rect(x - 14, y - 12, 28, 4);
        this.graphics.fill({ color: 0x8B4513, alpha: 1 });
    } else if (entity.species === 'cooking-pot') {
        // Pot base
        this.graphics.ellipse(x, y + 5, 12, 8);
        this.graphics.fill({ color: 0x333333, alpha: 1 });
        this.graphics.stroke({ color: 0x000000, width: 1 });

        // Pot rim
        this.graphics.ellipse(x, y - 3, 12, 4);
        this.graphics.fill({ color: 0x444444, alpha: 1 });
        this.graphics.stroke({ color: 0x000000, width: 1 });

        // Fire
        const time = Date.now() / 100;
        for (let i = 0; i < 3; i++) {
            const fx = x - 8 + i * 8 + Math.sin(time + i) * 2;
            const fy = y + 8 + Math.cos(time + i) * 2;
            this.graphics.circle(fx, fy, 3);
            this.graphics.fill({ color: 0xFF4500, alpha: 0.8 });
        }
    } else if (entity.species === 'barn') {
        this.drawBarn(x, y);
    } else if (entity.species === 'shipping-bin') {
        this.drawShippingBin(x, y);
    } else if (entity.species === 'seed-maker') {
        this.drawSeedMaker(x, y);
    } else if (entity.species === 'ancient-shrine') {
        this.drawAncientShrine(x, y);
    } else if (entity.species === 'recycling-machine') {
        this.drawRecyclingMachine(x, y);
    } else if (entity.species === 'greenhouse') {
        this.drawGreenhouse(x, y);
    } else if (entity.species === 'weather-station') {
        this.drawWeatherStation(x, y);
    } else if (entity.species === 'fountain') {
        this.drawFountain(x, y);
    } else if (entity.species === 'lamp') {
        this.drawLamp(x, y);
    }
  }

  drawLamp(x: number, y: number) {
    const timeOfDay = this.lastEnvironment?.timeOfDay || 0;
    const isNight = timeOfDay < 0.25 || timeOfDay > 0.75;
    const isDusk = (timeOfDay >= 0.7 && timeOfDay <= 0.8) || (timeOfDay >= 0.2 && timeOfDay <= 0.3);

    // Lamp post
    this.graphics.rect(x - 2, y, 4, 15);
    this.graphics.fill({ color: 0x333333, alpha: 1 });

    // Lantern base
    this.graphics.rect(x - 6, y - 5, 12, 10);
    this.graphics.fill({ color: 0x444444, alpha: 1 });
    this.graphics.stroke({ color: 0x000000, width: 1 });

    // Glass/Light part
    const lightColor = (isNight || isDusk) ? 0xFFFF00 : 0xEEEEEE;
    this.graphics.rect(x - 4, y - 4, 8, 6);
    this.graphics.fill({ color: lightColor, alpha: 0.9 });

    // Cap
    this.graphics.poly([
        x - 8, y - 5,
        x + 8, y - 5,
        x, y - 10
    ]);
    this.graphics.fill({ color: 0x222222, alpha: 1 });
  }

  drawGreenhouse(x: number, y: number) {
    // Glass structure
    this.graphics.poly([
        x - 20, y + 15,
        x + 20, y + 15,
        x + 20, y - 5,
        x + 10, y - 15,
        x - 10, y - 15,
        x - 20, y - 5
    ]);
    this.graphics.fill({ color: 0xADD8E6, alpha: 0.4 }); // Transparent glass
    this.graphics.stroke({ color: 0xFFFFFF, width: 2, alpha: 0.8 });

    // Internal plants (visual only)
    for (let i = -1; i <= 1; i++) {
        const px = x + i * 8;
        const py = y + 5;
        this.graphics.circle(px, py, 4);
        this.graphics.fill({ color: 0x32CD32, alpha: 0.6 });
    }

    // Framing
    this.graphics.moveTo(x - 20, y - 5);
    this.graphics.lineTo(x + 20, y - 5);
    this.graphics.moveTo(x, y - 15);
    this.graphics.lineTo(x, y + 15);
    this.graphics.stroke({ color: 0xFFFFFF, width: 1, alpha: 0.5 });
  }

  drawFountain(x: number, y: number) {
    // Base stone basin
    this.graphics.circle(x, y + 5, 18);
    this.graphics.fill({ color: 0x808080, alpha: 1 });
    this.graphics.stroke({ color: 0x333333, width: 2 });

    // Water in basin
    this.graphics.circle(x, y + 5, 14);
    this.graphics.fill({ color: 0x4169E1, alpha: 1 });

    // Central pillar
    this.graphics.rect(x - 4, y - 10, 8, 15);
    this.graphics.fill({ color: 0x696969, alpha: 1 });
    this.graphics.stroke({ color: 0x333333, width: 1 });

    // Spouting water (animated)
    const time = Date.now() / 300;
    for (let i = 0; i < 4; i++) {
        const angle = time + (i * Math.PI / 2);
        const dist = 8 + Math.sin(time * 2) * 2;
        const wx = x + Math.cos(angle) * dist;
        const wy = y - 10 + Math.sin(angle) * dist;

        this.graphics.moveTo(x, y - 10);
        this.graphics.quadraticCurveTo(x + Math.cos(angle) * (dist + 5), y - 15, wx, wy + 15);
        this.graphics.stroke({ color: 0xADD8E6, width: 2, alpha: 0.6 });

        this.graphics.circle(wx, wy + 15, 2);
        this.graphics.fill({ color: 0xFFFFFF, alpha: 0.8 });
    }
  }

  drawWeatherStation(x: number, y: number) {
    // Post
    this.graphics.rect(x - 2, y - 10, 4, 25);
    this.graphics.fill({ color: 0x708090, alpha: 1 });

    // Station box
    this.graphics.rect(x - 8, y - 5, 16, 12);
    this.graphics.fill({ color: 0xFFFFFF, alpha: 0.9 });
    this.graphics.stroke({ color: 0x333333, width: 1 });

    // Anemometer (rotating)
    const angle = Date.now() / 150;
    for (let i = 0; i < 3; i++) {
        const armAngle = angle + (i * Math.PI * 2 / 3);
        const ax = x + Math.cos(armAngle) * 12;
        const ay = y - 10 + Math.sin(armAngle) * 12;

        this.graphics.moveTo(x, y - 10);
        this.graphics.lineTo(ax, ay);
        this.graphics.stroke({ color: 0x333333, width: 1 });
        this.graphics.circle(ax, ay, 3);
        this.graphics.fill({ color: 0xFF0000, alpha: 1 });
    }

    // Screen detail
    this.graphics.rect(x - 5, y - 2, 10, 5);
    this.graphics.fill({ color: 0x00FF00, alpha: 0.4 });
  }

  drawRecyclingMachine(x: number, y: number) {
    // Body
    this.graphics.rect(x - 12, y - 10, 24, 20);
    this.graphics.fill({ color: 0x4682B4, alpha: 1 }); // SteelBlue
    this.graphics.stroke({ color: 0x2F4F4F, width: 2 });

    // Top funnel
    this.graphics.poly([
        x - 14, y - 15,
        x + 14, y - 15,
        x + 8, y - 10,
        x - 8, y - 10
    ]);
    this.graphics.fill({ color: 0x708090, alpha: 1 });
    this.graphics.stroke({ color: 0x2F4F4F, width: 1 });

    // Gears (animated)
    const angle = Date.now() / 300;
    for (let i = 0; i < 2; i++) {
        const gx = x - 5 + i * 10;
        const gy = y;
        this.graphics.circle(gx, gy, 4);
        this.graphics.fill({ color: 0x333333, alpha: 1 });

        // Gear teeth
        for (let j = 0; j < 4; j++) {
            const ta = angle + j * Math.PI / 2 + (i * Math.PI / 4);
            this.graphics.moveTo(gx, gy);
            this.graphics.lineTo(gx + Math.cos(ta) * 6, gy + Math.sin(ta) * 6);
            this.graphics.stroke({ color: 0x555555, width: 2 });
        }
    }
  }

  drawAncientShrine(x: number, y: number) {
    // Base platform
    this.graphics.poly([
        x - 20, y + 10,
        x + 20, y + 10,
        x + 15, y + 15,
        x - 15, y + 15
    ]);
    this.graphics.fill({ color: 0x4A4A4A, alpha: 1 });
    this.graphics.stroke({ color: 0x222222, width: 2 });

    // Pillar
    this.graphics.rect(x - 6, y - 10, 12, 20);
    this.graphics.fill({ color: 0x696969, alpha: 1 });
    this.graphics.stroke({ color: 0x222222, width: 1 });

    // Floating crystal
    const float = Math.sin(Date.now() / 600) * 5;
    const cy = y - 25 + float;
    this.graphics.poly([
        x, cy - 12,
        x + 8, cy,
        x, cy + 12,
        x - 8, cy
    ]);
    this.graphics.fill({ color: 0x00FFFF, alpha: 0.8 });
    this.graphics.stroke({ color: 0xFFFFFF, width: 2, alpha: 0.5 });

    // Particles/Aura
    const glow = (Math.sin(Date.now() / 300) + 1) / 2;
    this.graphics.circle(x, cy, 15 + glow * 5);
    this.graphics.fill({ color: 0x00FFFF, alpha: 0.2 });
  }

  drawShippingBin(x: number, y: number) {
    // Base
    this.graphics.rect(x - 15, y - 5, 30, 15);
    this.graphics.fill({ color: 0x5D2E0C, alpha: 1 });
    this.graphics.stroke({ color: 0x3D2B1F, width: 2 });

    // Lid (slightly open)
    this.graphics.poly([
        x - 15, y - 5,
        x + 15, y - 5,
        x + 10, y - 12,
        x - 10, y - 12
    ]);
    this.graphics.fill({ color: 0x8B4513, alpha: 1 });
    this.graphics.stroke({ color: 0x3D2B1F, width: 1 });

    // "Ship" label placeholder (just a white rectangle)
    this.graphics.rect(x - 8, y + 2, 16, 6);
    this.graphics.fill({ color: 0xFFFFFF, alpha: 0.3 });
  }

  drawSeedMaker(x: number, y: number) {
    // Machine body
    this.graphics.rect(x - 12, y - 15, 24, 25);
    this.graphics.fill({ color: 0x708090, alpha: 1 }); // SlateGray
    this.graphics.stroke({ color: 0x2F4F4F, width: 2 });

    // Funnel on top
    this.graphics.poly([
        x - 15, y - 20,
        x + 15, y - 20,
        x + 5, y - 15,
        x - 5, y - 15
    ]);
    this.graphics.fill({ color: 0xA9A9A9, alpha: 1 });
    this.graphics.stroke({ color: 0x2F4F4F, width: 1 });

    // Output tray
    this.graphics.rect(x - 8, y + 5, 16, 8);
    this.graphics.fill({ color: 0x696969, alpha: 1 });

    // Glowing indicator
    const glow = (Math.sin(Date.now() / 200) + 1) / 2;
    this.graphics.circle(x, y - 5, 3);
    this.graphics.fill({ color: 0x00FF00, alpha: 0.5 + glow * 0.5 });
  }

  drawBarn(x: number, y: number) {
    // Main Structure
    this.graphics.rect(x - 20, y - 10, 40, 25);
    this.graphics.fill({ color: 0x8B0000, alpha: 1 }); // Dark Red
    this.graphics.stroke({ color: 0x3D2B1F, width: 2 });

    // Roof
    this.graphics.poly([
        x - 25, y - 10,
        x + 25, y - 10,
        x + 15, y - 25,
        x - 15, y - 25
    ]);
    this.graphics.fill({ color: 0x4A4A4A, alpha: 1 });
    this.graphics.stroke({ color: 0x000000, width: 2 });

    // Barn Door (Large)
    this.graphics.rect(x - 10, y + 2, 20, 13);
    this.graphics.fill({ color: 0x5D3A1A, alpha: 1 });
    this.graphics.stroke({ color: 0xFFFFFF, width: 1, alpha: 0.5 });

    // Cross-bars on door
    this.graphics.moveTo(x - 10, y + 2);
    this.graphics.lineTo(x + 10, y + 15);
    this.graphics.moveTo(x + 10, y + 2);
    this.graphics.lineTo(x - 10, y + 15);
    this.graphics.stroke({ color: 0xFFFFFF, width: 1, alpha: 0.5 });
  }

  drawFloor(entity: Entity, x: number, y: number) {
    const season = this.lastEnvironment?.season || 'spring';
    if (entity.species === 'cave-entrance') {
        const size = HEX_SIZE * 0.8;
        this.graphics.circle(x, y, size);
        this.graphics.fill({ color: 0x000000, alpha: 1 });
        this.graphics.stroke({ color: 0x444444, width: 2 });

        // Swirl effect
        const angle = Date.now() / 500;
        this.graphics.moveTo(x, y);
        this.graphics.lineTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
        this.graphics.stroke({ color: 0x333333, width: 1 });
    } else if (entity.species === 'tilled') {
        const size = HEX_SIZE * 0.9;
        this.graphics.poly([
            x + size * Math.cos(0), y + size * Math.sin(0),
            x + size * Math.cos(Math.PI/3), y + size * Math.sin(Math.PI/3),
            x + size * Math.cos(2*Math.PI/3), y + size * Math.sin(2*Math.PI/3),
            x + size * Math.cos(Math.PI), y + size * Math.sin(Math.PI),
            x + size * Math.cos(4*Math.PI/3), y + size * Math.sin(4*Math.PI/3),
            x + size * Math.cos(5*Math.PI/3), y + size * Math.sin(5*Math.PI/3),
        ]);
        this.graphics.fill({ color: 0x5D3A1A, alpha: 1 });
        this.graphics.stroke({ color: 0x3D2B1F, width: 1 });

        // Furrows
        for (let i = -2; i <= 2; i++) {
            this.graphics.moveTo(x - size * 0.5, y + i * 4);
            this.graphics.lineTo(x + size * 0.5, y + i * 4);
            this.graphics.stroke({ color: 0x3D2B1F, width: 1, alpha: 0.5 });
        }
    } else if (entity.species === 'path') {
        const size = HEX_SIZE * 0.8;
        this.graphics.poly([
            x + size * Math.cos(0), y + size * Math.sin(0),
            x + size * Math.cos(Math.PI/3), y + size * Math.sin(Math.PI/3),
            x + size * Math.cos(2*Math.PI/3), y + size * Math.sin(2*Math.PI/3),
            x + size * Math.cos(Math.PI), y + size * Math.sin(Math.PI),
            x + size * Math.cos(4*Math.PI/3), y + size * Math.sin(4*Math.PI/3),
            x + size * Math.cos(5*Math.PI/3), y + size * Math.sin(5*Math.PI/3),
        ]);
        this.graphics.fill({ color: 0xC2B280, alpha: 1 }); // Sand/Gravel color
        this.graphics.stroke({ color: 0x8B7D6B, width: 1 });

        // Pebbles
        for (let i = 0; i < 5; i++) {
            const px = x + (Math.sin(i * 1.5) * size * 0.6);
            const py = y + (Math.cos(i * 1.5) * size * 0.6);
            this.graphics.circle(px, py, 2);
            this.graphics.fill({ color: 0x808080, alpha: 0.8 });
        }
    } else if (entity.species === 'grass') {
        let grassColor = 0x228B22;
        if (season === 'autumn') grassColor = 0x8B4513;
        else if (season === 'winter') grassColor = 0x8FBC8F;
        else if (season === 'summer') grassColor = 0x32CD32;

        for (let i = 0; i < 3; i++) {
            const gx = x + (i - 1) * 6;
            this.graphics.moveTo(gx, y + 5);
            this.graphics.lineTo(gx + 2, y - 5);
            this.graphics.stroke({ color: grassColor, width: 2, alpha: 0.6 });
        }
    } else if (entity.species === 'flower') {
        let flowerColor = 0xFF69B4; // Pink
        if (season === 'autumn') flowerColor = 0xFFD700; // Gold
        else if (season === 'winter') flowerColor = 0xADD8E6; // Light Blue

        this.graphics.circle(x, y, 3);
        this.graphics.fill({ color: flowerColor, alpha: 0.8 });
        this.graphics.circle(x, y, 1);
        this.graphics.fill({ color: 0xFFFF00, alpha: 1 });
    } else if (entity.species === 'sunflower') {
        this.graphics.circle(x, y, 5);
        this.graphics.fill({ color: 0xFFFF00, alpha: 0.9 });
        this.graphics.circle(x, y, 2);
        this.graphics.fill({ color: 0x4B2C20, alpha: 1 });
    }
  }

  drawHex(q: number, r: number, color: number) {
    const { x, y } = axialToPixel(q, r, HEX_SIZE);
    
    this.graphics.poly([
        x + HEX_SIZE * Math.cos(0), y + HEX_SIZE * Math.sin(0),
        x + HEX_SIZE * Math.cos(Math.PI/3), y + HEX_SIZE * Math.sin(Math.PI/3),
        x + HEX_SIZE * Math.cos(2*Math.PI/3), y + HEX_SIZE * Math.sin(2*Math.PI/3),
        x + HEX_SIZE * Math.cos(Math.PI), y + HEX_SIZE * Math.sin(Math.PI),
        x + HEX_SIZE * Math.cos(4*Math.PI/3), y + HEX_SIZE * Math.sin(4*Math.PI/3),
        x + HEX_SIZE * Math.cos(5*Math.PI/3), y + HEX_SIZE * Math.sin(5*Math.PI/3),
    ]);
    this.graphics.fill({ color, alpha: 1 });
    this.graphics.stroke({ color: 0x999999, width: 1 });
  }

  renderWorld(entities: Entity[], playerPos: Position, environment: EnvironmentState) {
    this.lastEntities = entities;
    this.lastPlayerPos = playerPos;
    this.lastEnvironment = environment;

    if (!this.initialized) return;

    // Initialize new entities' interpolated positions
    entities.forEach(entity => {
        if (!this.interpolatedPositions.has(entity.id)) {
            const { x, y } = axialToPixel(entity.pos.q, entity.pos.r, HEX_SIZE);
            this.interpolatedPositions.set(entity.id, { x, y });
        }
    });

    // Cleanup old entities
    const entityIds = new Set(entities.map(e => e.id));
    for (const id of this.interpolatedPositions.keys()) {
        if (!entityIds.has(id)) {
            this.interpolatedPositions.delete(id);
            if (this.playerLabels.has(id)) {
                this.playerLabels.get(id)!.destroy();
                this.playerLabels.delete(id);
            }
            if (this.plantLabels.has(id)) {
                this.plantLabels.get(id)!.destroy();
                this.plantLabels.delete(id);
            }
        }
    }
  }

  update() {
    if (!this.initialized || !this.lastEnvironment) return;

    this.graphics.clear();
    this.visibleLandingSpots = [];

    const { season, timeOfDay } = this.lastEnvironment;
    const lerpFactor = 0.15;

    // Interpolate camera
    const { x: tpx, y: tpy } = axialToPixel(this.lastPlayerPos.q, this.lastPlayerPos.r, HEX_SIZE);
    this.interpolatedCamera.x += (tpx - this.interpolatedCamera.x) * lerpFactor;
    this.interpolatedCamera.y += (tpy - this.interpolatedCamera.y) * lerpFactor;

    this.container.x = this.app.screen.width / 2 - this.interpolatedCamera.x;
    this.container.y = this.app.screen.height / 2 - this.interpolatedCamera.y;
    
    const isCave = this.lastPlayerPos.q >= 10000;

    let bgColor = 0x228B22; // Forest Green (Spring)
    if (isCave) bgColor = 0x1A1A1A; // Dark Stone
    else if (season === 'summer') bgColor = 0x7CFC00; // Lawngreen
    else if (season === 'autumn') bgColor = 0xD2691E; // Chocolate/Orange
    else if (season === 'winter') bgColor = 0xFFFAFA; // Snow

    this.app.renderer.background.color = bgColor;

    // Draw background hexes around player
    const viewRadius = 15;
    for (let q = -viewRadius; q <= viewRadius; q++) {
        const r1 = Math.max(-viewRadius, -q - viewRadius);
        const r2 = Math.min(viewRadius, -q + viewRadius);
        for (let r = r1; r <= r2; r++) {
            this.drawHex(this.lastPlayerPos.q + q, this.lastPlayerPos.r + r, bgColor);
        }
    }

    // Highlight current player hex
    this.drawHexHighlight(this.lastPlayerPos.q, this.lastPlayerPos.r);

    const fencePositions = new Set<string>();
    this.lastEntities.forEach(e => {
        if (e.type === 'fence') fencePositions.add(`${e.pos.q},${e.pos.r}`);
    });

    const sortedEntities = [...this.lastEntities].sort((a, b) => (TYPE_ORDER[a.type] || 0) - (TYPE_ORDER[b.type] || 0));

    sortedEntities.forEach(entity => {
      // Interpolate entity position
      const target = axialToPixel(entity.pos.q, entity.pos.r, HEX_SIZE);
      const current = this.interpolatedPositions.get(entity.id) || target;
      current.x += (target.x - current.x) * lerpFactor;
      current.y += (target.y - current.y) * lerpFactor;
      this.interpolatedPositions.set(entity.id, current);

      const { x, y } = current;
      const screenX = x + this.container.x;
      const screenY = y + this.container.y;
      if (screenX < -HEX_SIZE || screenX > this.app.screen.width + HEX_SIZE ||
          screenY < -HEX_SIZE || screenY > this.app.screen.height + HEX_SIZE) {
            return;
      }

      if (entity.type === 'player') {
        const player = entity as any;
        this.drawPlayer(x, y, player.color || 0x0000FF);
        this.updatePlayerLabel(player, x, y);
      } else if (entity.type === 'obstacle') {
        if (entity.species === 'tree' || (!entity.species && entity.id.startsWith('tree'))) {
            this.visibleLandingSpots.push({ x, y });
        }
        if (entity.species === 'water') {
            this.drawWater(x, y);
        } else if (entity.species === 'tree' || (!entity.species && entity.id.startsWith('tree'))) {
          this.drawTree(x, y);
        } else if (entity.species === 'rock' || (!entity.species && entity.id.startsWith('rock'))) {
          this.drawRock(x, y);
        } else if (entity.species === 'scarecrow') {
          this.drawScarecrow(x, y);
        }
      } else if (entity.type === 'plant') {
        this.drawPlant(entity as any, x, y);
        this.updatePlantLabel(entity as any, x, y);
        if ((entity as any).growthStage >= 5) {
            this.visibleLandingSpots.push({ x, y });
        }
      } else if (entity.type === 'animal') {
        this.drawAnimal(entity as any, x, y);
        if ((entity as any).species === 'merchant') {
          this.updateNPCLabel(entity as any, x, y, 'Merchant');
        } else if ((entity as any).species === 'blacksmith') {
          this.updateNPCLabel(entity as any, x, y, 'Blacksmith');
        } else if ((entity as any).species === 'fisherman') {
          this.updateNPCLabel(entity as any, x, y, 'Fisherman');
        } else if ((entity as any).species === 'miner') {
          this.updateNPCLabel(entity as any, x, y, 'Miner');
        }
      } else if (entity.type === 'fence') {
        const directions = [
            { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
            { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
        ];
        const neighbors = directions.map(d => fencePositions.has(`${entity.pos.q + d.q},${entity.pos.r + d.r}`));
        this.drawFence(x, y, neighbors);
      } else if (entity.type === 'sprinkler') {
        this.drawSprinkler(entity, x, y);
      } else if (entity.type === 'building') {
        this.drawBuilding(entity, x, y);

        // Lamp glow effect
        if (entity.species === 'lamp') {
            const isNight = timeOfDay < 0.25 || timeOfDay > 0.75;
            const isDusk = (timeOfDay >= 0.7 && timeOfDay <= 0.8) || (timeOfDay >= 0.2 && timeOfDay <= 0.3);

            if (isNight || isDusk) {
                let intensity = isNight ? 0.3 : 0.15;
                const flicker = Math.sin(Date.now() / 100) * 0.05;
                this.overlay.circle(x + this.container.x, y + this.container.y, 40);
                this.overlay.fill({ color: 0xFFFF00, alpha: intensity + flicker });
            }
        }
      } else if (entity.type === 'floor') {
        this.drawFloor(entity, x, y);
        if (entity.species === 'grass') {
            this.visibleLandingSpots.push({ x, y });
        }
      }
    });

    this.drawDayNightOverlay(isCave ? 1.0 : timeOfDay, isCave ? 'sunny' : this.lastEnvironment.weather);
    if (!isCave) {
        if (this.lastEnvironment.weather === 'rainy') {
            if (season === 'winter') {
                this.drawSnow();
            } else {
                this.drawRain();
            }
        } else {
            this.drawBirds();
        }
        this.drawDecorativeEntities(timeOfDay);
        this.drawHearts();
    }
  }

  drawHearts() {
    const now = Date.now();
    this.hearts = this.hearts.filter(h => now - h.startTime < 2000);

    this.hearts.forEach(h => {
        const elapsed = now - h.startTime;
        const progress = elapsed / 2000;
        const currentY = h.y - progress * 40;
        const currentAlpha = 1 - progress;

        // Draw Heart
        this.overlay.beginPath();
        const size = 5;
        const hx = h.x + this.container.x;
        const hy = currentY + this.container.y;

        this.overlay.moveTo(hx, hy);
        this.overlay.bezierCurveTo(hx - size, hy - size, hx - size * 2, hy + size, hx, hy + size * 2);
        this.overlay.bezierCurveTo(hx + size * 2, hy + size, hx + size, hy - size, hx, hy);

        this.overlay.fill({ color: 0xFF0000, alpha: currentAlpha });
    });
  }

  drawDecorativeEntities(timeOfDay: number) {
    const isNight = timeOfDay < 0.25 || timeOfDay > 0.75;
    const type = isNight ? 'firefly' : 'butterfly';

    if (this.decorativeEntities.length === 0 || this.decorativeEntities[0].type !== type) {
        this.decorativeEntities = [];

        // Try to spawn near attractive entities
        const attractionPoints: {x: number, y: number}[] = [];
        this.lastEntities.forEach(e => {
            if (e.type === 'floor' && (e.species === 'flower' || e.species === 'sunflower')) {
                const { x, y } = axialToPixel(e.pos.q, e.pos.r, HEX_SIZE);
                attractionPoints.push({ x: x + this.container.x, y: y + this.container.y });
            } else if (e.type === 'building' && e.species === 'ancient-shrine') {
                const { x, y } = axialToPixel(e.pos.q, e.pos.r, HEX_SIZE);
                attractionPoints.push({ x: x + this.container.x, y: y + this.container.y });
            }
        });

        for (let i = 0; i < 20; i++) {
            let x, y;
            if (attractionPoints.length > 0 && Math.random() < 0.7) {
                const point = attractionPoints[Math.floor(Math.random() * attractionPoints.length)];
                x = point.x + (Math.random() - 0.5) * 100;
                y = point.y + (Math.random() - 0.5) * 100;
            } else {
                x = Math.random() * this.app.screen.width;
                y = Math.random() * this.app.screen.height;
            }

            this.decorativeEntities.push({
                x, y,
                type,
                offset: Math.random() * Math.PI * 2,
                speed: 0.5 + Math.random() * 1.5
            });
        }
    }

    this.decorativeEntities.forEach(ent => {
        const time = Date.now() / 1000;
        ent.x += Math.sin(time * ent.speed + ent.offset) * 2;
        ent.y += Math.cos(time * ent.speed + ent.offset) * 2;

        if (ent.type === 'firefly') {
            const glow = (Math.sin(time * 3 + ent.offset) + 1) / 2;
            this.overlay.circle(ent.x, ent.y, 2);
            this.overlay.fill({ color: 0xFFFF00, alpha: 0.4 + glow * 0.6 });
        } else {
            // Butterfly
            this.overlay.ellipse(ent.x - 2, ent.y, 4, 6);
            this.overlay.fill({ color: 0xFF69B4, alpha: 0.8 });
            this.overlay.ellipse(ent.x + 2, ent.y, 4, 6);
            this.overlay.fill({ color: 0xFF69B4, alpha: 0.8 });
        }

        // Boundary wrap
        if (ent.x < 0) ent.x = this.app.screen.width;
        if (ent.x > this.app.screen.width) ent.x = 0;
        if (ent.y < 0) ent.y = this.app.screen.height;
        if (ent.y > this.app.screen.height) ent.y = 0;
    });
  }

  drawSnow() {
    if (this.snowFlakes.length === 0) {
        for (let i = 0; i < 150; i++) {
            this.snowFlakes.push({
                x: Math.random() * this.app.screen.width,
                y: Math.random() * this.app.screen.height,
                speed: 1 + Math.random() * 2,
                size: 2 + Math.random() * 3,
                drift: (Math.random() - 0.5) * 2
            });
        }
    }

    this.snowFlakes.forEach(flake => {
        flake.y += flake.speed;
        flake.x += flake.drift + Math.sin(Date.now() / 1000 + flake.y / 100) * 0.5;

        if (flake.y > this.app.screen.height) {
            flake.y = -flake.size;
            flake.x = Math.random() * this.app.screen.width;
        }
        if (flake.x > this.app.screen.width) flake.x = 0;
        if (flake.x < 0) flake.x = this.app.screen.width;

        this.overlay.circle(flake.x, flake.y, flake.size);
    });
    this.overlay.fill({ color: 0xFFFFFF, alpha: 0.8 });
  }

  drawRain() {
    if (this.rainDrops.length === 0) {
        for (let i = 0; i < 100; i++) {
            this.rainDrops.push({
                x: Math.random() * this.app.screen.width,
                y: Math.random() * this.app.screen.height,
                speed: 10 + Math.random() * 10,
                length: 10 + Math.random() * 10
            });
        }
    }

    this.overlay.beginPath();
    this.rainDrops.forEach(drop => {
        drop.y += drop.speed;
        if (drop.y > this.app.screen.height) {
            drop.y = -drop.length;
            drop.x = Math.random() * this.app.screen.width;
        }

        this.overlay.moveTo(drop.x, drop.y);
        this.overlay.lineTo(drop.x, drop.y + drop.length);
    });
    this.overlay.stroke({ color: 0xADD8E6, width: 1, alpha: 0.4 });
  }

  drawBirds() {
    if (this.birds.length === 0) {
        for (let i = 0; i < 5; i++) {
            this.birds.push({
                x: Math.random() * this.app.screen.width,
                y: Math.random() * this.app.screen.height,
                vx: 2 + Math.random() * 2,
                vy: (Math.random() - 0.5) * 1,
                size: 3 + Math.random() * 2,
                state: 'flying',
                timer: 0
            });
        }
    }

    const time = Date.now();
    const wingAnim = Math.sin(time / 200);

    this.birds.forEach(bird => {
        if (bird.state === 'flying') {
            bird.x += bird.vx;
            bird.y += bird.vy;

            if (bird.x > this.app.screen.width + 50) {
                bird.x = -50;
                bird.y = Math.random() * this.app.screen.height;
            }

            // Chance to land
            if (Math.random() < 0.005 && this.visibleLandingSpots.length > 0) {
                const spot = this.visibleLandingSpots[Math.floor(Math.random() * this.visibleLandingSpots.length)];
                bird.state = 'landed';
                bird.x = spot.x + this.container.x;
                bird.y = spot.y + this.container.y - 5;
                bird.timer = time + 3000 + Math.random() * 5000;
            }

            const wing = wingAnim * bird.size;
            // Body
            this.overlay.moveTo(bird.x, bird.y);
            this.overlay.lineTo(bird.x - bird.size * 2, bird.y);
            this.overlay.stroke({ color: 0x000000, width: 2, alpha: 0.6 });

            // Wings
            this.overlay.moveTo(bird.x - bird.size, bird.y);
            this.overlay.lineTo(bird.x - bird.size * 1.5, bird.y - wing);
            this.overlay.moveTo(bird.x - bird.size, bird.y);
            this.overlay.lineTo(bird.x - bird.size * 1.5, bird.y + wing);
            this.overlay.stroke({ color: 0x000000, width: 1, alpha: 0.6 });
        } else {
            // Landed
            if (time > bird.timer) {
                bird.state = 'flying';
            }

            // Draw sitting bird
            this.overlay.circle(bird.x, bird.y, bird.size);
            this.overlay.fill({ color: 0x000000, alpha: 0.6 });
            this.overlay.moveTo(bird.x, bird.y);
            this.overlay.lineTo(bird.x + bird.size * 1.5, bird.y + bird.size * 0.5);
            this.overlay.stroke({ color: 0x000000, width: 1, alpha: 0.6 });

            // Occasional head twitch
            if (Math.sin(time / 500) > 0.8) {
                this.overlay.circle(bird.x + bird.size * 0.5, bird.y - bird.size, 2);
                this.overlay.fill({ color: 0x000000, alpha: 0.6 });
            }
        }
    });
  }

  updatePlayerLabel(player: any, x: number, y: number) {
    let label = this.playerLabels.get(player.id);
    if (!label) {
        label = new PIXI.Text({
            text: player.name,
            style: {
                fontFamily: 'Arial',
                fontSize: 14,
                fill: 0xFFFFFF,
                stroke: { color: 0x000000, width: 2 },
                align: 'center'
            }
        });
        label.anchor.set(0.5, 1.5);
        this.container.addChild(label);
        this.playerLabels.set(player.id, label);
    }
    label.x = x;
    label.y = y - HEX_SIZE * 0.6;
  }

  updateNPCLabel(animal: Animal, x: number, y: number, text: string) {
    let label = this.playerLabels.get(animal.id);
    if (!label) {
        label = new PIXI.Text({
            text,
            style: {
                fontFamily: 'Arial',
                fontSize: 14,
                fill: 0xFF00FF,
                stroke: { color: 0x000000, width: 2 },
                align: 'center'
            }
        });
        label.anchor.set(0.5, 1.5);
        this.container.addChild(label);
        this.playerLabels.set(animal.id, label);
    }
    label.x = x;
    label.y = y - HEX_SIZE * 0.6;
  }

  updatePlantLabel(plant: Plant, x: number, y: number) {
    const isMature = plant.growthStage >= 5;
    const percentage = Math.floor((plant.growthStage / 5) * 100);
    const text = isMature
        ? plant.species.charAt(0).toUpperCase() + plant.species.slice(1)
        : `${percentage}%`;

    let label = this.plantLabels.get(plant.id);
    if (!label) {
        label = new PIXI.Text({
            text,
            style: {
                fontFamily: 'Arial',
                fontSize: isMature ? 12 : 10,
                fill: isMature ? 0xFFFF00 : 0xFFFFFF,
                stroke: { color: 0x000000, width: 2 },
                align: 'center'
            }
        });
        label.anchor.set(0.5, 1.5);
        this.container.addChild(label);
        this.plantLabels.set(plant.id, label);
    } else {
        if (label.text !== text) {
            label.text = text;
            label.style.fill = isMature ? 0xFFFF00 : 0xFFFFFF;
            label.style.fontSize = isMature ? 12 : 10;
        }
    }
    label.x = x;
    label.y = y - HEX_SIZE * 0.4;
  }

  drawDayNightOverlay(timeOfDay: number, weather: string) {
    this.overlay.clear();

    // Calculate alpha and color based on time of day
    // 0.0 is midnight, 0.5 is noon
    let alpha = 0;
    let color = 0x000033;

    if (timeOfDay < 0.2) { // 0:00 - 4:48 (Night)
        alpha = 0.6;
    } else if (timeOfDay < 0.3) { // 4:48 - 7:12 (Dawn)
        alpha = 0.6 * (1 - (timeOfDay - 0.2) / 0.1);
        color = 0x663300;
    } else if (timeOfDay < 0.7) { // 7:12 - 16:48 (Day)
        alpha = 0;
    } else if (timeOfDay < 0.8) { // 16:48 - 19:12 (Dusk)
        alpha = 0.6 * ((timeOfDay - 0.7) / 0.1);
        color = 0x330033;
    } else { // 19:12 - 0:00 (Night)
        alpha = 0.6;
    }

    // Weather adjustments
    if (weather === 'rainy') {
        alpha = Math.max(alpha, 0.4);
        color = 0x1a1a2e; // Dark stormy blue
    } else if (weather === 'cloudy') {
        alpha = Math.max(alpha, 0.2);
        color = 0x4a4e69; // Gloomy gray
    }

    if (alpha > 0) {
        this.overlay.rect(0, 0, this.app.screen.width, this.app.screen.height);
        this.overlay.fill({ color, alpha });
    }

    // Draw Sun/Moon
    const sunMoonAlpha = 0.8;
    let smColor = 0xFFFF00; // Sun
    let smX = this.app.screen.width * timeOfDay;
    let smY = 50 + Math.sin(timeOfDay * Math.PI) * 100;

    if (timeOfDay < 0.25 || timeOfDay > 0.75) {
        smColor = 0xCCCCCC; // Moon
        // Adjust position for moon
        const moonTime = (timeOfDay + 0.5) % 1.0;
        smX = this.app.screen.width * moonTime;
        smY = 50 + Math.sin(moonTime * Math.PI) * 100;
    }

    this.overlay.circle(smX, smY, 20);
    this.overlay.fill({ color: smColor, alpha: sunMoonAlpha });
  }

  destroy() {
    if (this.initialized) {
        this.app.destroy(true, { children: true });
    }
  }
}
