import type { WeaponId } from '@open-venge/shared';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.7;

  resume(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.master) this.master.gain.value = this.volume;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private burst(opts: {
    dur: number;
    freq: number;
    q: number;
    gain: number;
    type?: BiquadFilterType;
    pan?: number;
    delay?: number;
  }): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.type ?? 'bandpass';
    filter.frequency.value = opts.freq;
    filter.Q.value = opts.q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(opts.gain, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + opts.dur);
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = opts.pan ?? 0;
    src.connect(filter).connect(gain).connect(panner).connect(this.master);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.05);
  }

  private tone(opts: {
    freq: number;
    endFreq?: number;
    dur: number;
    gain: number;
    type?: OscillatorType;
    pan?: number;
    delay?: number;
  }): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.endFreq) osc.frequency.exponentialRampToValueAtTime(opts.endFreq, t0 + opts.dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(opts.gain, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + opts.dur);
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = opts.pan ?? 0;
    osc.connect(gain).connect(panner).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  }

  shot(w: WeaponId, gain = 1, pan = 0): void {
    switch (w) {
      case 'rifle':
        this.burst({ dur: 0.11, freq: 1400, q: 0.7, gain: 0.5 * gain, pan });
        this.burst({ dur: 0.06, freq: 300, q: 1, gain: 0.4 * gain, type: 'lowpass', pan });
        break;
      case 'shotgun':
        this.burst({ dur: 0.28, freq: 700, q: 0.5, gain: 0.7 * gain, pan });
        this.burst({ dur: 0.12, freq: 180, q: 1, gain: 0.6 * gain, type: 'lowpass', pan });
        break;
      case 'sniper':
        this.burst({ dur: 0.35, freq: 900, q: 0.6, gain: 0.8 * gain, pan });
        this.burst({ dur: 0.2, freq: 120, q: 1, gain: 0.7 * gain, type: 'lowpass', pan });
        break;
      case 'pistol':
        this.burst({ dur: 0.09, freq: 1800, q: 0.8, gain: 0.4 * gain, pan });
        break;
    }
  }

  hit(headshot: boolean): void {
    this.tone({ freq: headshot ? 1500 : 1050, dur: 0.05, gain: 0.35, type: 'square' });
    if (headshot) this.tone({ freq: 1900, dur: 0.06, gain: 0.3, type: 'square', delay: 0.05 });
  }

  damaged(): void {
    this.burst({ dur: 0.15, freq: 250, q: 1, gain: 0.5, type: 'lowpass' });
  }

  kill(): void {
    this.tone({ freq: 660, dur: 0.09, gain: 0.3 });
    this.tone({ freq: 990, dur: 0.14, gain: 0.3, delay: 0.08 });
  }

  death(): void {
    this.tone({ freq: 300, endFreq: 70, dur: 0.45, gain: 0.4, type: 'sawtooth' });
  }

  reload(durationMs: number): void {
    this.burst({ dur: 0.04, freq: 2500, q: 2, gain: 0.3 });
    this.burst({ dur: 0.04, freq: 2000, q: 2, gain: 0.3, delay: (durationMs / 1000) * 0.7 });
  }

  spawn(): void {
    this.tone({ freq: 440, endFreq: 880, dur: 0.15, gain: 0.25 });
  }

  impact(gain: number, pan: number): void {
    this.burst({ dur: 0.05, freq: 3200, q: 1.5, gain: 0.15 * gain, pan });
  }
}
