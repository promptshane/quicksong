import type { Instrument } from './engine';

/**
 * Six-piece sample-free drum kit: kick, snare, closed/open hats, ghost
 * snare and shaker. General-MIDI pitches allow the existing sequencer,
 * transport and exports to treat each sound as an independent drum lane.
 */
export class DrumKit implements Instrument {
  private ctx: AudioContext;
  private out: GainNode;
  private noise: AudioBuffer;
  private active = new Set<{ sources: AudioScheduledSourceNode[]; gain: GainNode }>();

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.7;
    this.out.connect(destination);
    // One second of white noise, shared by every snare and hi-hat.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  noteOn(midi: number, velocity: number, when: number, _duration: number, gain = 1): void {
    const start = Math.max(when, this.ctx.currentTime);
    const level = Math.max(0.05, Math.min(1, velocity)) * gain;
    if (midi === 36) this.kick(start, level);
    else if (midi === 38) this.snare(start, level);
    else if (midi === 42) this.hat(start, level);
    else if (midi === 46) this.openHat(start, level);
    else if (midi === 40) this.snare(start, level * 0.32);
    else if (midi === 82) this.shaker(start, level);
  }

  private voice(sources: AudioScheduledSourceNode[], env: GainNode, stopAt: number): void {
    const v = { sources, gain: env };
    this.active.add(v);
    for (const s of sources) s.stop(stopAt);
    sources[0].onended = () => {
      this.active.delete(v);
      env.disconnect();
    };
  }

  private envelope(start: number, peak: number, decay: number): GainNode {
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(peak, start + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    env.connect(this.out);
    return env;
  }

  private kick(start: number, level: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, start);
    osc.frequency.exponentialRampToValueAtTime(45, start + 0.12);
    const env = this.envelope(start, level, 0.35);
    osc.connect(env);
    osc.start(start);
    this.voice([osc], env, start + 0.4);
  }

  private snare(start: number, level: number): void {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noise;
    const band = this.ctx.createBiquadFilter();
    band.type = 'highpass';
    band.frequency.value = 1200;
    const noiseEnv = this.envelope(start, level * 0.7, 0.18);
    noise.connect(band).connect(noiseEnv);
    const tone = this.ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(190, start);
    const toneEnv = this.envelope(start, level * 0.5, 0.1);
    tone.connect(toneEnv);
    noise.start(start);
    tone.start(start);
    this.voice([noise, tone], noiseEnv, start + 0.25);
  }

  private hat(start: number, level: number): void {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noise;
    const high = this.ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 7000;
    const env = this.envelope(start, level * 0.35, 0.05);
    noise.connect(high).connect(env);
    noise.start(start);
    this.voice([noise], env, start + 0.08);
  }

  private openHat(start: number, level: number): void {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noise;
    const high = this.ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 5600;
    const env = this.envelope(start, level * 0.38, 0.48);
    noise.connect(high).connect(env);
    noise.start(start);
    this.voice([noise], env, start + 0.52);
  }

  private shaker(start: number, level: number): void {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noise;
    const high = this.ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 8500;
    const env = this.envelope(start, level * 0.24, 0.042);
    noise.connect(high).connect(env);
    noise.start(start);
    this.voice([noise], env, start + 0.05);
  }

  allNotesOff(): void {
    const now = this.ctx.currentTime;
    for (const v of this.active) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0.0001, now, 0.01);
      for (const s of v.sources) {
        try {
          s.stop(now + 0.05);
        } catch {
          // already stopped
        }
      }
    }
    this.active.clear();
  }
}
