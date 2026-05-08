import * as PIXI from 'pixi.js';
import type { Entity, Position, Plant, Animal, EnvironmentState } from 'common';
import { axialToPixel } from 'common';
import { socket } from '../network';

const HEX_SIZE = 30;
const TYPE_ORDER: Record<string, number> = { 'fence': 1, 'plant': 2, 'obstacle': 3, 'animal': 4, 'player': 5 };

export class HexRenderer {
  private app: PIXI.Application;
  private container: PIXI.Container;
  private graphics: PIXI.Graphics;
  private overlay: PIXI.Graphics;
  private initialized: boolean = false;

  private lastEntities: Entity[] = [];
  private lastPlayerPos: Position = { q: 0, r: 0 };
  private lastEnvironment: EnvironmentState | null = null;
  private interpolatedPositions: Map<string, { x: number, y: number }> = new Map();
  private interpolatedCamera: { x: number, y: number } = { x: 0, y: 0 };

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
    // Trunk
    this.graphics.rect(x - 4, y, 8, 15);
    this.graphics.fill({ color: 0x8B4513, alpha: 1 });
    // Foliage
    this.graphics.circle(x, y - 5, HEX_SIZE * 0.7);
    this.graphics.fill({ color: 0x228B22, alpha: 1 });
  }

  drawRock(x: number, y: number) {
    this.graphics.poly([
        x - 10, y + 10,
        x + 10, y + 10,
        x + 8, y - 5,
        x - 5, y - 8,
    ]);
    this.graphics.fill({ color: 0x808080, alpha: 1 });
    this.graphics.stroke({ color: 0x333333, width: 1 });
  }

  drawPlant(plant: Plant, x: number, y: number) {
    const stage = Math.floor(plant.growthStage);
    const size = (stage + 1) * (HEX_SIZE / 6);

    let color = 0x00FF00;
    if (plant.species === 'carrot') color = 0xFFA500;
    else if (plant.species === 'pumpkin') color = 0xFF8C00;
    else if (plant.species === 'turnip') color = 0xFFFFFF;

    if (stage < 5) {
        // Sprout
        this.graphics.circle(x, y, size);
        this.graphics.fill({ color: 0x32CD32, alpha: 1 });
    } else {
        // Mature
        this.graphics.circle(x, y, size);
        this.graphics.fill({ color, alpha: 1 });
    }

    // Watering indicator
    const isWatered = (Date.now() - plant.lastWatered < 24 * 60 * 60 * 1000);
    if (isWatered) {
        this.graphics.circle(x + 10, y + 10, 4);
        this.graphics.fill({ color: 0x0000FF, alpha: 0.7 });
    }
  }

  drawAnimal(animal: Animal, x: number, y: number) {
    let color = 0xFFFFFF;
    if (animal.species === 'cow') color = 0xFFFFFF;
    else if (animal.species === 'sheep') color = 0xDDDDDD;

    this.graphics.ellipse(x, y, HEX_SIZE * 0.5, HEX_SIZE * 0.3);
    this.graphics.fill({ color, alpha: 1 });
    this.graphics.stroke({ color: 0x000000, width: 1 });
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
    for (let q = this.lastPlayerPos.q - viewRadius; q <= this.lastPlayerPos.q + viewRadius; q++) {
      for (let r = this.lastPlayerPos.r - viewRadius; r <= this.lastPlayerPos.r + viewRadius; r++) {
         this.drawHex(q, r, bgColor);
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
      } else if (entity.type === 'obstacle') {
        if (entity.id.startsWith('tree')) {
          this.drawTree(x, y);
        } else {
          this.drawRock(x, y);
        }
      } else if (entity.type === 'plant') {
        this.drawPlant(entity as any, x, y);
      } else if (entity.type === 'animal') {
        this.drawAnimal(entity as any, x, y);
      } else if (entity.type === 'fence') {
        this.drawFence(x, y);
      }
    });

    this.drawDayNightOverlay(timeOfDay);
  }

  drawDayNightOverlay(timeOfDay: number) {
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

    if (alpha > 0) {
        this.overlay.rect(0, 0, this.app.screen.width, this.app.screen.height);
        this.overlay.fill({ color, alpha });
    }
  }

  destroy() {
    if (this.initialized) {
        this.app.destroy(true, { children: true });
    }
  }
}
