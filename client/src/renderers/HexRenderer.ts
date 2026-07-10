import * as PIXI from 'pixi.js';
import type { Entity, Position, EnvironmentState, Player, Weather } from 'common';
import { axialToPixel, localWeather } from 'common';
import { socket } from '../network';

const HEX_SIZE = 30;
const VIEW_RADIUS = 16;

// Draw order: ground first, then things standing on it, wanderers last.
const TYPE_ORDER: Record<string, number> = {
  water: 0, rock: 1, flora: 2, tree: 3, fauna: 4, player: 5,
};

const EMOTE_GLYPH: Record<string, string> = { heart: '❤', smile: '☺', sad: '☹', wow: '❗' };

interface Particle { x: number; y: number; vx: number; vy: number; life: number; }

export class HexRenderer {
  private app: PIXI.Application;
  private container: PIXI.Container;
  private graphics: PIXI.Graphics;
  private overlay: PIXI.Graphics;
  private initialized = false;

  private entities: Entity[] = [];
  private playerPos: Position = { q: 0, r: 0 };
  private env: EnvironmentState | null = null;

  private interp: Map<string, { x: number; y: number }> = new Map();
  private camera = { x: 0, y: 0 };
  private labels: Map<string, PIXI.Text> = new Map();
  private emotes: { playerId: string; glyph: string; start: number; text?: PIXI.Text }[] = [];
  private ripples: { x: number; y: number; start: number }[] = [];
  private weatherParticles: Particle[] = [];
  private ambient: { x: number; y: number; vx: number; vy: number; phase: number }[] = [];
  private wind = 0;

  constructor(element: HTMLDivElement) {
    this.app = new PIXI.Application();
    this.container = new PIXI.Container();
    this.graphics = new PIXI.Graphics();
    this.overlay = new PIXI.Graphics();

    this.app.init({ resizeTo: element, backgroundColor: 0x8fbf6b, antialias: true }).then(() => {
      element.appendChild(this.app.canvas);
      this.app.stage.addChild(this.container);
      this.container.addChild(this.graphics);
      this.app.stage.addChild(this.overlay);
      this.initialized = true;
      this.app.ticker.add(() => this.update());

      socket.off('player_emote');
      socket.on('player_emote', ({ playerId, type }: { playerId: string; type: string }) => {
        this.emotes.push({ playerId, glyph: EMOTE_GLYPH[type] || '✨', start: Date.now() });
      });

      socket.off('ripple');
      socket.on('ripple', ({ q, r }: Position) => {
        const { x, y } = axialToPixel(q, r, HEX_SIZE);
        this.ripples.push({ x, y, start: Date.now() });
      });
    });
  }

  renderWorld(entities: Entity[], playerPos: Position, env: EnvironmentState) {
    this.entities = entities;
    this.playerPos = playerPos;
    this.env = env;

    if (!this.initialized) return;
    const ids = new Set(entities.map((e) => e.id));
    for (const id of this.interp.keys()) {
      if (!ids.has(id)) {
        this.interp.delete(id);
        this.labels.get(id)?.destroy();
        this.labels.delete(id);
      }
    }
  }

  private update() {
    if (!this.initialized || !this.env) return;
    this.graphics.clear();

    const { season, timeOfDay, weatherCells } = this.env;
    const lerp = 0.15;
    const now = Date.now();
    // A soft, coherent breeze that gusts on two overlapping periods.
    this.wind = Math.sin(now / 1600) * 0.6 + Math.sin(now / 3700) * 0.4;

    // Camera eases toward the wanderer.
    const cam = axialToPixel(this.playerPos.q, this.playerPos.r, HEX_SIZE);
    this.camera.x += (cam.x - this.camera.x) * lerp;
    this.camera.y += (cam.y - this.camera.y) * lerp;
    this.container.x = this.app.screen.width / 2 - this.camera.x;
    this.container.y = this.app.screen.height / 2 - this.camera.y;

    // Ground tint shifts with the season, with organic per-hex variation.
    const ground = this.seasonGround(season);
    this.app.renderer.background.color = ground;
    for (let q = -VIEW_RADIUS; q <= VIEW_RADIUS; q++) {
      const r1 = Math.max(-VIEW_RADIUS, -q - VIEW_RADIUS);
      const r2 = Math.min(VIEW_RADIUS, -q + VIEW_RADIUS);
      for (let r = r1; r <= r2; r++) {
        this.drawHex(this.playerPos.q + q, this.playerPos.r + r, ground);
      }
    }

    const sorted = [...this.entities].sort((a, b) => (TYPE_ORDER[a.type] ?? 0) - (TYPE_ORDER[b.type] ?? 0));
    for (const entity of sorted) {
      const target = axialToPixel(entity.pos.q, entity.pos.r, HEX_SIZE);
      const cur = this.interp.get(entity.id) || { ...target };
      cur.x += (target.x - cur.x) * lerp;
      cur.y += (target.y - cur.y) * lerp;
      this.interp.set(entity.id, cur);

      const sx = cur.x + this.container.x;
      const sy = cur.y + this.container.y;
      if (sx < -HEX_SIZE || sx > this.app.screen.width + HEX_SIZE || sy < -HEX_SIZE || sy > this.app.screen.height + HEX_SIZE) {
        continue;
      }
      this.drawEntity(entity, cur.x, cur.y);
    }

    this.drawRipples();

    // Atmosphere, painted over the world in screen space.
    this.overlay.clear();
    const weather = localWeather(weatherCells, this.playerPos);
    this.drawLighting(timeOfDay, season);
    this.drawVignette();
    this.drawAmbient(now, timeOfDay, season);
    this.drawWeather(weather);
    this.drawEmotes();
  }

  /** Per-hex sway of grass and canopies, from the shared breeze. */
  private sway(x: number, y: number): number {
    return this.wind * (2.5 + 1.5 * Math.sin((x + y) * 0.05));
  }

  // --- terrain & entities --------------------------------------------------

  private seasonGround(season: string): number {
    switch (season) {
      case 'summer': return 0x7cbf5a;
      case 'autumn': return 0xc99b52;
      case 'winter': return 0xe8eef2;
      default: return 0x8fbf6b; // spring
    }
  }

  private drawHex(q: number, r: number, color: number) {
    const { x, y } = axialToPixel(q, r, HEX_SIZE);
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      pts.push(x + HEX_SIZE * Math.cos((i * Math.PI) / 3), y + HEX_SIZE * Math.sin((i * Math.PI) / 3));
    }
    this.graphics.poly(pts);
    this.graphics.fill({ color: this.jitter(color, q, r), alpha: 1 });
    this.graphics.stroke({ color: 0x000000, width: 1, alpha: 0.05 });
  }

  /** Nudge a color a few shades lighter/darker, deterministically per hex,
   *  so flat ground reads as organic terrain rather than a solid fill. */
  private jitter(color: number, q: number, r: number): number {
    const h = Math.sin(q * 12.9898 + r * 78.233) * 43758.5453;
    const d = ((h - Math.floor(h)) - 0.5) * 22; // +/- 11
    const cl = (v: number) => Math.max(0, Math.min(255, v + d));
    const R = cl((color >> 16) & 0xff);
    const G = cl((color >> 8) & 0xff);
    const B = cl(color & 0xff);
    return (R << 16) | (G << 8) | B;
  }

  private drawEntity(e: Entity, x: number, y: number) {
    switch (e.type) {
      case 'water': return this.drawWater(x, y);
      case 'rock': return this.drawRock(x, y);
      case 'tree': return this.drawTree(e, x, y);
      case 'flora': return this.drawFlora(e, x, y);
      case 'fauna': return this.drawFauna(e, x, y);
      case 'player': return this.drawPlayer(e as Player, x, y);
    }
  }

  private stage(e: Entity): number {
    const g = (e as any).growthStage ?? 5;
    return Math.max(0.25, Math.min(1, g / 5));
  }

  private drawWater(x: number, y: number) {
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      pts.push(x + HEX_SIZE * Math.cos((i * Math.PI) / 3), y + HEX_SIZE * Math.sin((i * Math.PI) / 3));
    }
    this.graphics.poly(pts);
    this.graphics.fill({ color: 0x4a90c2, alpha: 0.92 });
    // Two slow ripples of light drifting across the surface.
    const t = Date.now() / 1000;
    for (let k = 0; k < 2; k++) {
      const oy = ((Math.sin(t * 0.6 + x * 0.05 + k * 2) * 0.5 + 0.5) - 0.5) * HEX_SIZE * 0.7;
      this.graphics.ellipse(x, y + oy, HEX_SIZE * 0.5, HEX_SIZE * 0.08);
      this.graphics.fill({ color: 0x8fc4e6, alpha: 0.25 });
    }
  }

  private drawRock(x: number, y: number) {
    this.graphics.ellipse(x, y + 4, HEX_SIZE * 0.45, HEX_SIZE * 0.3);
    this.graphics.fill({ color: 0x8a8f96, alpha: 1 });
    this.graphics.ellipse(x - 4, y, HEX_SIZE * 0.28, HEX_SIZE * 0.22);
    this.graphics.fill({ color: 0xa8adb4, alpha: 1 });
  }

  private drawTree(e: Entity, x: number, y: number) {
    const s = this.stage(e);
    this.graphics.rect(x - 2.5 * s, y, 5 * s, 16 * s);
    this.graphics.fill({ color: 0x6b4a2b });
    const colors: Record<string, number> = {
      oak: 0x3f7d3a, birch: 0x6fae52, pine: 0x2f6b45, maple: 0xb5652f, willow: 0x7fae6a,
    };
    const c = colors[e.species || 'oak'] ?? 0x3f7d3a;
    const w = this.sway(x, y) * s; // canopy leans with the breeze
    this.graphics.circle(x + w, y - 6 * s, HEX_SIZE * 0.62 * s);
    this.graphics.fill({ color: c });
    this.graphics.circle(x - 6 * s + w, y - 2 * s, HEX_SIZE * 0.4 * s);
    this.graphics.fill({ color: c });
    this.graphics.circle(x + 6 * s + w, y - 3 * s, HEX_SIZE * 0.36 * s);
    this.graphics.fill({ color: c });
  }

  private drawFlora(e: Entity, x: number, y: number) {
    const s = this.stage(e);
    const petals: Record<string, number> = {
      flower: 0xef6f9a, poppy: 0xe23c3c, daisy: 0xffffff, tulip: 0xf25c9c,
      lavender: 0x9b7fd4, sunflower: 0xf4c430,
    };
    const w = this.sway(x, y) * s; // tops bend with the wind, roots stay put
    if (e.species === 'grass' || e.species === 'fern' || e.species === 'clover') {
      const c = e.species === 'fern' ? 0x4c8f52 : e.species === 'clover' ? 0x5fae55 : 0x5aa04a;
      for (let i = -1; i <= 1; i++) {
        this.graphics.moveTo(x + i * 4, y + 6);
        this.graphics.lineTo(x + i * 4 + w, y + 6 - 12 * s);
        this.graphics.stroke({ color: c, width: 2 });
      }
      return;
    }
    if (e.species === 'mushroom') {
      this.graphics.rect(x - 2, y, 4, 8 * s);
      this.graphics.fill({ color: 0xf0e6d2 });
      this.graphics.ellipse(x, y, 8 * s, 5 * s);
      this.graphics.fill({ color: 0xd66a5a });
      return;
    }
    // stem (curves toward the wind)
    this.graphics.moveTo(x, y + 6);
    this.graphics.quadraticCurveTo(x + w * 0.5, y - 2, x + w, y - 4 * s);
    this.graphics.stroke({ color: 0x4c8f52, width: 2 });
    // bloom
    const c = petals[e.species || 'flower'] ?? 0xef6f9a;
    this.graphics.circle(x + w, y - 4 * s, HEX_SIZE * 0.28 * s);
    this.graphics.fill({ color: c });
    this.graphics.circle(x + w, y - 4 * s, HEX_SIZE * 0.1 * s);
    this.graphics.fill({ color: 0xffe08a });
  }

  private drawFauna(e: Entity, x: number, y: number) {
    const colors: Record<string, number> = {
      deer: 0xb08048, rabbit: 0xd8d2c4, fox: 0xe0742c, bird: 0x5a8fd0, butterfly: 0xf2a1d1, frog: 0x5fae55,
    };
    const c = colors[e.species || 'deer'] ?? 0xb08048;
    if (e.species === 'butterfly' || e.species === 'bird') {
      const flap = Math.sin(Date.now() / 90 + x) * 3; // wings beat
      this.graphics.ellipse(x - 4, y - flap, 5, 3);
      this.graphics.ellipse(x + 4, y - flap, 5, 3);
      this.graphics.fill({ color: c });
      this.graphics.circle(x, y, 1.6);
      this.graphics.fill({ color: 0x333333 });
      return;
    }
    this.graphics.ellipse(x, y, HEX_SIZE * 0.35, HEX_SIZE * 0.24);
    this.graphics.fill({ color: c });
    this.graphics.circle(x + HEX_SIZE * 0.3, y - HEX_SIZE * 0.12, HEX_SIZE * 0.14);
    this.graphics.fill({ color: c });
  }

  private drawPlayer(p: Player, x: number, y: number) {
    this.graphics.ellipse(x, y + 14, 10, 4);
    this.graphics.fill({ color: 0x000000, alpha: 0.15 });
    this.graphics.circle(x, y, HEX_SIZE * 0.42);
    this.graphics.fill({ color: p.color ?? 0x5b8fb9 });
    this.graphics.circle(x, y, HEX_SIZE * 0.42);
    this.graphics.stroke({ color: 0xffffff, width: 2, alpha: 0.7 });
    this.updateLabel(p, x, y);
  }

  private updateLabel(p: Player, x: number, y: number) {
    let label = this.labels.get(p.id);
    if (!label) {
      label = new PIXI.Text({ text: p.name, style: { fontFamily: 'Arial', fontSize: 13, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } });
      label.anchor.set(0.5);
      this.container.addChild(label);
      this.labels.set(p.id, label);
    }
    label.x = x;
    label.y = y - HEX_SIZE * 0.9;
  }

  // --- atmosphere ----------------------------------------------------------

  private drawRipples() {
    const now = Date.now();
    this.ripples = this.ripples.filter((rp) => now - rp.start < 600);
    for (const rp of this.ripples) {
      const t = (now - rp.start) / 600;
      this.graphics.circle(rp.x, rp.y, HEX_SIZE * (0.3 + t));
      this.graphics.stroke({ color: 0xffffff, width: 2, alpha: 0.5 * (1 - t) });
    }
  }

  private drawWeather(weather: Weather) {
    if (weather === 'rainy' || weather === 'snowy') {
      const target = weather === 'rainy' ? 130 : 90;
      while (this.weatherParticles.length < target) {
        this.weatherParticles.push({
          x: Math.random() * this.app.screen.width,
          y: Math.random() * this.app.screen.height,
          vx: weather === 'snowy' ? (Math.random() - 0.5) * 0.5 : -1.5,
          vy: weather === 'snowy' ? 1.2 : 9,
          life: 1,
        });
      }
    } else {
      this.weatherParticles.length = 0;
    }

    const W = this.app.screen.width;
    const H = this.app.screen.height;
    for (const p of this.weatherParticles) {
      p.x += p.vx + (weather === 'snowy' ? Math.sin((p.y + p.x) / 40) * 0.6 : this.wind);
      p.y += p.vy;
      if (p.y > H) { p.y = -5; p.x = Math.random() * W; }
      if (p.x < -5) p.x = W;
      if (weather === 'snowy') {
        this.overlay.circle(p.x, p.y, 2);
        this.overlay.fill({ color: 0xffffff, alpha: 0.85 });
      } else {
        this.overlay.rect(p.x, p.y, 1.5, 8);
        this.overlay.fill({ color: 0xaaccee, alpha: 0.55 });
      }
    }
  }

  /**
   * Time-of-day color grading: deep blue at night, warm amber at dawn and
   * dusk, clear at midday. This is where most of the "wonder" comes from.
   */
  private drawLighting(timeOfDay: number, season: string) {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    // sun height: 1 at noon (0.5), -1 at midnight.
    const sun = -Math.cos(timeOfDay * Math.PI * 2);

    if (sun < 0) {
      const night = Math.min(0.6, -sun * 0.6);
      this.overlay.rect(0, 0, W, H);
      this.overlay.fill({ color: season === 'winter' ? 0x1b2540 : 0x121a38, alpha: night });
    }
    // Warm wash near sunrise (~0.25) and sunset (~0.75).
    const dawn = Math.max(0, 1 - Math.abs(timeOfDay - 0.25) / 0.12);
    const dusk = Math.max(0, 1 - Math.abs(timeOfDay - 0.75) / 0.12);
    const warm = Math.max(dawn, dusk);
    if (warm > 0.02) {
      this.overlay.rect(0, 0, W, H);
      this.overlay.fill({ color: dusk >= dawn ? 0xff7a3c : 0xffb04a, alpha: warm * 0.28 });
    }
  }

  /** A soft darkened frame that draws the eye toward the center. */
  private drawVignette() {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const band = Math.min(W, H) * 0.16;
    for (let i = 0; i < 3; i++) {
      const a = 0.06 * (i + 1);
      const inset = band * (1 - i / 3);
      this.overlay.rect(0, 0, W, inset).fill({ color: 0x000000, alpha: a });
      this.overlay.rect(0, H - inset, W, inset).fill({ color: 0x000000, alpha: a });
      this.overlay.rect(0, 0, inset, H).fill({ color: 0x000000, alpha: a });
      this.overlay.rect(W - inset, 0, inset, H).fill({ color: 0x000000, alpha: a });
    }
  }

  /**
   * Always something adrift: pollen motes catch the day, fireflies glow at
   * night, and a gentle count keeps the air alive without cluttering it.
   */
  private drawAmbient(now: number, timeOfDay: number, season: string) {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const sun = -Math.cos(timeOfDay * Math.PI * 2);
    const night = sun < -0.15;
    const target = 26;

    while (this.ambient.length < target) {
      this.ambient.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.1 - Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
      });
    }

    const leafy = season === 'autumn';
    for (const p of this.ambient) {
      p.x += p.vx + this.wind * 0.4 + Math.sin(now / 900 + p.phase) * 0.3;
      p.y += p.vy + (leafy ? 0.5 : 0) + Math.cos(now / 1100 + p.phase) * 0.15;
      if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
      if (p.y > H + 6) { p.y = -6; p.x = Math.random() * W; }
      if (p.x < -6) p.x = W + 6;
      if (p.x > W + 6) p.x = -6;

      const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(now / 500 + p.phase));
      if (night) {
        this.overlay.circle(p.x, p.y, 2.2);
        this.overlay.fill({ color: 0xffe89a, alpha: 0.7 * twinkle });
      } else if (leafy) {
        this.overlay.rect(p.x, p.y, 4, 3);
        this.overlay.fill({ color: 0xc9702e, alpha: 0.5 });
      } else {
        this.overlay.circle(p.x, p.y, 1.6);
        this.overlay.fill({ color: 0xfffbe0, alpha: 0.35 * twinkle });
      }
    }
  }

  private drawEmotes() {
    const now = Date.now();
    // Retire expired emotes and free their text.
    this.emotes = this.emotes.filter((em) => {
      if (now - em.start < 2000) return true;
      em.text?.destroy();
      return false;
    });
    for (const em of this.emotes) {
      const pos = this.interp.get(em.playerId);
      if (!pos) continue;
      if (!em.text) {
        em.text = new PIXI.Text({ text: em.glyph, style: { fontSize: 22, fill: 0xffffff } });
        em.text.anchor.set(0.5);
        this.app.stage.addChild(em.text);
      }
      const t = (now - em.start) / 2000;
      em.text.x = pos.x + this.container.x;
      em.text.y = pos.y + this.container.y - HEX_SIZE - t * 25;
      em.text.alpha = 1 - t;
    }
  }

  destroy() {
    this.app.destroy(true);
  }
}
