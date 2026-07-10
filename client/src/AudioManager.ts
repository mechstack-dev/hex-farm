import type { Weather } from 'common';

/**
 * A small generative ambient engine — the other half of "tranquil."
 * No audio files: everything is synthesized with the Web Audio API so it
 * loops forever without seams. A soft wind bed sits underneath, rain rises
 * and falls with the weather, and sparse pentatonic notes drift over the top
 * like distant birdsong. Nothing loud, nothing sudden.
 *
 * Must be started from a user gesture (the "Wander in" click) so browsers
 * allow audio to play.
 */
export class AudioManager {
  private static instance: AudioManager;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private started = false;
  private muted = false;

  // A gentle major pentatonic — no note ever clashes with another.
  private readonly SCALE = [220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 587.33];

  static getInstance(): AudioManager {
    if (!AudioManager.instance) AudioManager.instance = new AudioManager();
    return AudioManager.instance;
  }

  /** Build the audio graph and begin the ambience. Safe to call repeatedly. */
  start() {
    if (this.started) {
      this.ctx?.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return; // no audio available; stay silent
    }
    const ctx = this.ctx;
    this.started = true;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // Wind: looping brown noise through a gentle low-pass, slowly breathing.
    const wind = ctx.createBufferSource();
    wind.buffer = this.brownNoise(3);
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 480;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.18;
    wind.connect(windFilter).connect(this.windGain).connect(this.master);
    wind.start();
    this.breathe(windFilter);

    // Rain: brighter noise, silent until the weather calls for it.
    const rain = ctx.createBufferSource();
    rain.buffer = this.brownNoise(3, true);
    rain.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = 1200;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(rainFilter).connect(this.rainGain).connect(this.master);
    rain.start();

    this.scheduleChime();
  }

  /** Rain fades in for wet weather and back out for clear skies. */
  setWeather(weather: Weather) {
    if (!this.ctx || !this.rainGain) return;
    const wet = weather === 'rainy' ? 0.22 : weather === 'snowy' ? 0.06 : 0;
    this.rainGain.gain.setTargetAtTime(wet, this.ctx.currentTime, 2);
  }

  /** A soft note as feedback for a nudge. */
  pluck() {
    if (!this.ctx || !this.master || this.muted) return;
    const freq = this.SCALE[Math.floor(Math.random() * this.SCALE.length)] * 2;
    this.tone(freq, 0.5, 0.12);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.2);
    }
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  // --- internals -----------------------------------------------------------

  /** Sparse, random birdsong/chime notes drifting over the wind. */
  private scheduleChime() {
    const next = 3000 + Math.random() * 7000;
    window.setTimeout(() => {
      if (!this.muted) {
        const freq = this.SCALE[Math.floor(Math.random() * this.SCALE.length)];
        this.tone(freq, 1.6 + Math.random() * 1.5, 0.06);
      }
      this.scheduleChime();
    }, next);
  }

  private tone(freq: number, duration: number, peak: number) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(peak, ctx.currentTime + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    osc.connect(g).connect(pan).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.05);
  }

  /** Slowly sweep the wind filter so the bed never feels static. */
  private breathe(filter: BiquadFilterNode) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = 320 + Math.random() * 360;
    filter.frequency.setTargetAtTime(target, t, 4);
    window.setTimeout(() => this.breathe(filter), 6000 + Math.random() * 4000);
  }

  private brownNoise(seconds: number, brighter = false): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    const roll = brighter ? 0.5 : 0.02; // brighter = more high-frequency hiss
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + roll * white) / (1 + roll);
      data[i] = last * 3.5;
    }
    return buffer;
  }
}
