import { Season, GAME_DAY } from 'common';

/**
 * Tracks the slow march of time: day/night and the four seasons.
 * Weather lives separately (WeatherSystem) because it is regional.
 */
export class SeasonManager {
  private startTime: number;
  private DAY_DURATION = GAME_DAY;
  private SEASON_LENGTH_DAYS = 7;

  private currentSeason: Season = 'spring';
  private dayCount = 0;

  constructor() {
    // Begin a fresh world in morning light rather than at midnight.
    this.startTime = Date.now() - 0.3 * this.DAY_DURATION;
  }

  /** Advance the clock. Returns true when the day or season rolls over. */
  update(now: number): boolean {
    const elapsed = now - this.startTime;
    const newDayCount = Math.floor(elapsed / this.DAY_DURATION);
    let changed = false;

    if (newDayCount !== this.dayCount) {
      this.dayCount = newDayCount;
      changed = true;
    }

    const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter'];
    const newSeason = seasons[Math.floor(this.dayCount / this.SEASON_LENGTH_DAYS) % 4];
    if (newSeason !== this.currentSeason) {
      this.currentSeason = newSeason;
      changed = true;
    }

    return changed;
  }

  get season(): Season {
    return this.currentSeason;
  }

  get day(): number {
    return this.dayCount;
  }

  /** 0.0 (midnight) .. 1.0, cycling once per game day. */
  get timeOfDay(): number {
    const elapsed = Date.now() - this.startTime;
    return (elapsed % this.DAY_DURATION) / this.DAY_DURATION;
  }
}
