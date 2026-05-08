import * as PIXI from 'pixi.js';
import type { Entity, Position, Season, Plant, Animal } from 'common';
import { axialToPixel } from 'common';
import { socket } from '../network';

const HEX_SIZE = 30;
const TYPE_ORDER: Record<string, number> = { 'fence': 1, 'plant': 2, 'obstacle': 3, 'animal': 4, 'player': 5 };

export class HexRenderer {
  private app: PIXI.Application;
  private container: PIXI.Container;
  private graphics: PIXI.Graphics;
  private initialized: boolean = false;

  constructor(element: HTMLDivElement) {
    this.app = new PIXI.Application();
    this.container = new PIXI.Container();
    this.graphics = new PIXI.Graphics();
    
    this.app.init({
        resizeTo: element,
        backgroundColor: 0x1099bb,
        antialias: true,
    }).then(() => {
        element.appendChild(this.app.canvas);
        this.app.stage.addChild(this.container);
        this.container.addChild(this.graphics);
        this.container.x = this.app.screen.width / 2;
        this.container.y = this.app.screen.height / 2;
        this.initialized = true;
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

  drawPlayer(q: number, r: number, color: number) {
    const { x, y } = axialToPixel(q, r, HEX_SIZE);
    this.graphics.circle(x, y, HEX_SIZE * 0.6);
    this.graphics.fill({ color, alpha: 1 });
    this.graphics.stroke({ color: 0x000000, width: 2 });
  }

  drawTree(q: number, r: number) {
    const { x, y } = axialToPixel(q, r, HEX_SIZE);
    // Trunk
    this.graphics.rect(x - 4, y, 8, 15);
    this.graphics.fill({ color: 0x8B4513, alpha: 1 });
    // Foliage
    this.graphics.circle(x, y - 5, HEX_SIZE * 0.7);
    this.graphics.fill({ color: 0x228B22, alpha: 1 });
  }

  drawRock(q: number, r: number) {
    const { x, y } = axialToPixel(q, r, HEX_SIZE);
    this.graphics.poly([
        x - 10, y + 10,
        x + 10, y + 10,
        x + 8, y - 5,
        x - 5, y - 8,
    ]);
    this.graphics.fill({ color: 0x808080, alpha: 1 });
    this.graphics.stroke({ color: 0x333333, width: 1 });
  }

  drawPlant(plant: Plant) {
    const { x, y } = axialToPixel(plant.pos.q, plant.pos.r, HEX_SIZE);
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

  drawAnimal(animal: Animal) {
    const { x, y } = axialToPixel(animal.pos.q, animal.pos.r, HEX_SIZE);
    let color = 0xFFFFFF;
    if (animal.species === 'cow') color = 0xFFFFFF;
    else if (animal.species === 'sheep') color = 0xDDDDDD;

    this.graphics.ellipse(x, y, HEX_SIZE * 0.5, HEX_SIZE * 0.3);
    this.graphics.fill({ color, alpha: 1 });
    this.graphics.stroke({ color: 0x000000, width: 1 });
  }

  drawFence(q: number, r: number) {
    const { x, y } = axialToPixel(q, r, HEX_SIZE);
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

  renderWorld(entities: Entity[], playerPos: Position, season: Season = 'spring') {
    if (!this.initialized) return;
    this.graphics.clear();

    const { x: px, y: py } = axialToPixel(playerPos.q, playerPos.r, HEX_SIZE);
    this.container.x = this.app.screen.width / 2 - px;
    this.container.y = this.app.screen.height / 2 - py;
    
    let bgColor = 0x228B22; // Forest Green (Spring)
    if (season === 'summer') bgColor = 0x7CFC00; // Lawngreen
    else if (season === 'autumn') bgColor = 0xD2691E; // Chocolate/Orange
    else if (season === 'winter') bgColor = 0xFFFAFA; // Snow

    this.app.renderer.background.color = bgColor;

    // Draw some background hexes around player
    const viewRadius = 15;
    for (let q = playerPos.q - viewRadius; q <= playerPos.q + viewRadius; q++) {
      for (let r = playerPos.r - viewRadius; r <= playerPos.r + viewRadius; r++) {
         this.drawHex(q, r, bgColor);
      }
    }

    // Highlight current player hex
    this.drawHexHighlight(playerPos.q, playerPos.r);

    const sortedEntities = [...entities].sort((a, b) => (TYPE_ORDER[a.type] || 0) - (TYPE_ORDER[b.type] || 0));

    sortedEntities.forEach(entity => {
      // Culling for entities
      const { x, y } = axialToPixel(entity.pos.q, entity.pos.r, HEX_SIZE);
      const screenX = x + this.container.x;
      const screenY = y + this.container.y;
      if (screenX < -HEX_SIZE || screenX > this.app.screen.width + HEX_SIZE ||
          screenY < -HEX_SIZE || screenY > this.app.screen.height + HEX_SIZE) {
            return;
      }

      if (entity.type === 'player') {
        this.drawPlayer(entity.pos.q, entity.pos.r, entity.id === socket.id ? 0xFF0000 : 0x0000FF);
      } else if (entity.type === 'obstacle') {
        if (entity.id.startsWith('tree')) {
          this.drawTree(entity.pos.q, entity.pos.r);
        } else {
          this.drawRock(entity.pos.q, entity.pos.r);
        }
      } else if (entity.type === 'plant') {
        this.drawPlant(entity as any);
      } else if (entity.type === 'animal') {
        this.drawAnimal(entity as any);
      } else if (entity.type === 'fence') {
        this.drawFence(entity.pos.q, entity.pos.r);
      }
    });
  }

  destroy() {
    if (this.initialized) {
        this.app.destroy(true, { children: true });
    }
  }
}
