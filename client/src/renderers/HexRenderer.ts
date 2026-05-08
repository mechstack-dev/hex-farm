import * as PIXI from 'pixi.js';
import type { Entity, Position } from 'common';
import { axialToPixel } from 'common';

const HEX_SIZE = 30;

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

  renderWorld(entities: Entity[], playerPos: Position) {
    if (!this.initialized) return;
    this.graphics.clear();

    const { x: px, y: py } = axialToPixel(playerPos.q, playerPos.r, HEX_SIZE);
    this.container.x = this.app.screen.width / 2 - px;
    this.container.y = this.app.screen.height / 2 - py;
    
    // Draw some background hexes around player
    for (let q = playerPos.q - 10; q <= playerPos.q + 10; q++) {
      for (let r = playerPos.r - 10; r <= playerPos.r + 10; r++) {
         this.drawHex(q, r, 0x228B22); // Forest Green
      }
    }

    entities.forEach(entity => {
      let color = 0xFFFFFF;
      if (entity.type === 'player') color = 0xFF0000;
      else if (entity.type === 'obstacle') color = 0x555555;
      else if (entity.type === 'plant') {
        const plant = entity as any;
        const stage = Math.floor(plant.growthStage);

        if (plant.species === 'carrot') {
            const orange = Math.max(50, 255 - stage * 30);
            color = (orange << 16) | (165 << 8) | 0; // Orangelike
        } else if (plant.species === 'pumpkin') {
            const yellow = Math.max(50, 255 - stage * 30);
            color = (yellow << 16) | (yellow << 8) | 0; // Yellowish
        } else {
            // Darken green as it grows (turnip)
            const green = Math.max(50, 255 - stage * 30);
            color = (0 << 16) | (green << 8) | 0;
        }
      }
      else if (entity.type === 'animal') {
        if (entity.species === 'cow') color = 0xFFFFFF; // White
        else if (entity.species === 'sheep') color = 0xEEEEEE; // Light gray
        else color = 0xFFA500;
      }
      
      this.drawHex(entity.pos.q, entity.pos.r, color);
    });
  }

  destroy() {
    if (this.initialized) {
        this.app.destroy(true, { children: true });
    }
  }
}
