import { Season, Weather, WeatherCell, Position } from 'common';

interface DriftingCell extends WeatherCell {
  vq: number; // drift velocity, hexes per second
  vr: number;
  expiresAt: number;
}

/**
 * Regional weather: a handful of fronts drift across the world, so a storm is
 * something you can wander toward or away from. Fronts prefer to spawn near
 * where wanderers actually are, so the sky is rarely empty of drama for long.
 */
export class WeatherSystem {
  private cells: DriftingCell[] = [];
  private lastUpdate = Date.now();
  private lastSpawnCheck = 0;

  private readonly MAX_CELLS = 4;
  private readonly SPAWN_INTERVAL = 20000; // consider spawning every 20s

  update(now: number, players: Position[], season: Season): void {
    const dt = Math.min(5, (now - this.lastUpdate) / 1000); // seconds, clamped
    this.lastUpdate = now;

    // Drift existing fronts and retire the ones that have blown over.
    for (const cell of this.cells) {
      cell.q += cell.vq * dt;
      cell.r += cell.vr * dt;
    }
    this.cells = this.cells.filter((c) => c.expiresAt > now);

    // Occasionally raise a new front near a wanderer.
    if (now - this.lastSpawnCheck > this.SPAWN_INTERVAL) {
      this.lastSpawnCheck = now;
      if (this.cells.length < this.MAX_CELLS && players.length > 0 && Math.random() < 0.6) {
        this.spawnNear(players[Math.floor(Math.random() * players.length)], season, now);
      }
    }
  }

  private spawnNear(anchor: Position, season: Season, now: number): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 8 + Math.random() * 12;
    const type = this.pickWeather(season);
    const speed = 0.15 + Math.random() * 0.2;
    const heading = Math.random() * Math.PI * 2;

    this.cells.push({
      q: anchor.q + Math.round(Math.cos(angle) * dist),
      r: anchor.r + Math.round(Math.sin(angle) * dist),
      radius: 5 + Math.floor(Math.random() * 6),
      type,
      vq: Math.cos(heading) * speed,
      vr: Math.sin(heading) * speed,
      expiresAt: now + 40000 + Math.random() * 60000,
    });
  }

  private pickWeather(season: Season): Weather {
    const rand = Math.random();
    if (season === 'winter') return rand < 0.6 ? 'snowy' : 'cloudy';
    if (rand < 0.5) return 'rainy';
    return 'cloudy';
  }

  getCells(): WeatherCell[] {
    return this.cells.map(({ q, r, radius, type }) => ({
      q: Math.round(q),
      r: Math.round(r),
      radius,
      type,
    }));
  }
}
