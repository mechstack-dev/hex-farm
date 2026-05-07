import * as PIXI from 'pixi.js';
import type { Entity, Position } from '../../../common/src/types';

const HEX_SIZE = 30;

export function axialToPixel(q: number, r: number, size: number): { x: number, y: number } {
  const x = size * (3/2 * q);
  const y = size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
  return { x, y };
}

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
      else if (entity.type === 'plant') color = 0x00FF00;
      else if (entity.type === 'animal') color = 0xFFA500;
      
      this.drawHex(entity.pos.q, entity.pos.r, color);
    });
  }

  destroy() {
    if (this.initialized) {
        this.app.destroy(true, { children: true });
    }
  }
}
