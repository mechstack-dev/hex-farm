import * as PIXI from 'pixi.js';
import type { Entity, Position, Plant, Animal, EnvironmentState } from 'common';
import { axialToPixel, GAME_DAY } from 'common';
import { socket } from '../network';

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
  private interpolatedPositions: Map<string, { x: number, y: number }> = new Map();
  private interpolatedCamera: { x: number, y: number } = { x: 0, y: 0 };
  private playerLabels: Map<string, PIXI.Text> = new Map();
  private plantLabels: Map<string, PIXI.Text> = new Map();

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

    if (stage < 5) {
        // Sprout
        this.graphics.circle(swayX, y + 5, size);
        this.graphics.fill({ color: 0x32CD32, alpha: 1 });
        // Leaves
        this.graphics.ellipse(swayX - 4, y, 4, 8);
        this.graphics.fill({ color: 0x228B22, alpha: 1 });
        this.graphics.ellipse(swayX + 4, y, 4, 8);
        this.graphics.fill({ color: 0x228B22, alpha: 1 });
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
    } else if (animal.species === 'merchant') {
        color = 0x800080; // Purple
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
    }
  }

  drawFence(x: number, y: number) {
    this.graphics.poly([
        x - HEX_SIZE * 0.8, y - 5,
        x + HEX_SIZE * 0.8, y - 5,
        x + HEX_SIZE * 0.8, y + 5,
        x - HEX_SIZE * 0.8, y + 5,
    ]);
    this.graphics.fill({ color: 0x8B4513, alpha: 1 });
    this.graphics.stroke({ color: 0x3d2b1f, width: 2 });
  }

  drawSprinkler(x: number, y: number) {
    // Base
    this.graphics.circle(x, y, 8);
    this.graphics.fill({ color: 0x4682B4, alpha: 1 });
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
    }
  }

  drawFloor(entity: Entity, x: number, y: number) {
    const season = this.lastEnvironment?.season || 'spring';
    if (entity.species === 'tilled') {
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

    const { season, timeOfDay } = this.lastEnvironment;
    const lerpFactor = 0.15;

    // Interpolate camera
    const { x: tpx, y: tpy } = axialToPixel(this.lastPlayerPos.q, this.lastPlayerPos.r, HEX_SIZE);
    this.interpolatedCamera.x += (tpx - this.interpolatedCamera.x) * lerpFactor;
    this.interpolatedCamera.y += (tpy - this.interpolatedCamera.y) * lerpFactor;

    this.container.x = this.app.screen.width / 2 - this.interpolatedCamera.x;
    this.container.y = this.app.screen.height / 2 - this.interpolatedCamera.y;
    
    let bgColor = 0x228B22; // Forest Green (Spring)
    if (season === 'summer') bgColor = 0x7CFC00; // Lawngreen
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
        this.drawPlayer(x, y, entity.id === socket.id ? 0xFF0000 : 0x0000FF);
        this.updatePlayerLabel(entity as any, x, y);
      } else if (entity.type === 'obstacle') {
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
      } else if (entity.type === 'animal') {
        this.drawAnimal(entity as any, x, y);
        if ((entity as any).species === 'merchant') {
          this.updateMerchantLabel(entity as any, x, y);
        }
      } else if (entity.type === 'fence') {
        this.drawFence(x, y);
      } else if (entity.type === 'sprinkler') {
        this.drawSprinkler(x, y);
      } else if (entity.type === 'building') {
        this.drawBuilding(entity, x, y);
      } else if (entity.type === 'floor') {
        this.drawFloor(entity, x, y);
      }
    });

    this.drawDayNightOverlay(timeOfDay, this.lastEnvironment.weather);
    if (this.lastEnvironment.weather === 'rainy') {
        this.drawRain();
    }
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

  updateMerchantLabel(animal: Animal, x: number, y: number) {
    let label = this.playerLabels.get(animal.id);
    if (!label) {
        label = new PIXI.Text({
            text: 'Merchant',
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
        label.text = text;
        label.style.fill = isMature ? 0xFFFF00 : 0xFFFFFF;
        label.style.fontSize = isMature ? 12 : 10;
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
