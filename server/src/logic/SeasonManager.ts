import { Season, Weather, EnvironmentState } from 'common';

export class SeasonManager {
  private startTime: number;
  // Let's make a day 24 minutes instead of 24 hours for testing/gameplay purposes
  private DAY_DURATION = 24 * 60 * 1000;
  private SEASON_DURATION = 7 * this.DAY_DURATION; // 7 days per season

  private currentSeason: Season = 'spring';
  private currentWeather: Weather = 'sunny';
  private dayCount: number = 0;

  constructor() {
    this.startTime = Date.now();
  }

  update(now: number): boolean {
    const elapsed = now - this.startTime;
    const newDayCount = Math.floor(elapsed / this.DAY_DURATION);
    const newTimeOfDay = (elapsed % this.DAY_DURATION) / this.DAY_DURATION;

    let changed = true; // Always return true now because timeOfDay changes every tick

    if (newDayCount !== this.dayCount) {
      this.dayCount = newDayCount;
      changed = true;

      // Random weather change each day
      const rand = Math.random();
      if (rand < 0.2) this.currentWeather = 'rainy';
      else if (rand < 0.4) this.currentWeather = 'cloudy';
      else this.currentWeather = 'sunny';
    }

    const seasonIndex = Math.floor(this.dayCount / 7) % 4;
    const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter'];
    const newSeason = seasons[seasonIndex];

    if (newSeason !== this.currentSeason) {
      this.currentSeason = newSeason;
      changed = true;
    }

    return changed;
  }

  getState(): EnvironmentState {
    const elapsed = Date.now() - this.startTime;
    const timeOfDay = (elapsed % this.DAY_DURATION) / this.DAY_DURATION;

    return {
      season: this.currentSeason,
      weather: this.currentWeather,
      dayCount: this.dayCount,
      timeOfDay
    };
  }
}
