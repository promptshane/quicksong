import { midiToFrequency } from '../model/music';
import type { Instrument } from './engine';

/**
 * V1 placeholder instrument: a plucky two-oscillator synth with a velocity-
 * sensitive low-pass filter. Deliberately simple — it exists so pitch, chords,
 * rhythm and duration are clearly audible. Swap for a sampled guitar later by
 * providing another `Instrument` to `initAudioEngine`.
 */
export class PluckSynth implements Instrument {
  private ctx: AudioContext;
  private out: GainNode;
  private active = new Set<{ osc: OscillatorNode[]; gain: GainNode }>();

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.5;
    this.out.connect(destination);
  }

  noteOn(midi: number, velocity: number, when: number, duration: number, gain = 1): void {
    const ctx = this.ctx;
    const freq = midiToFrequency(midi);
    const vel = Math.max(0.05, Math.min(1, velocity));
    const start = Math.max(when, ctx.currentTime);
    const dur = Math.max(0.05, duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // Harder playing = brighter tone.
    filter.frequency.setValueAtTime(800 + vel * 5000, start);
    filter.frequency.exponentialRampToValueAtTime(400 + vel * 800, start + Math.min(dur, 1.2));
    filter.Q.value = 0.7;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(vel * gain * 0.6, start + 0.006);
    // Natural pluck decay, then a quick release at the note's end.
    env.gain.setTargetAtTime(vel * gain * 0.08, start + 0.02, 0.5);
    env.gain.setTargetAtTime(0.0001, start + dur, 0.03);

    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = freq;
    osc2.detune.value = 3;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.25;

    osc1.connect(filter);
    osc2.connect(osc2Gain).connect(filter);
    filter.connect(env).connect(this.out);

    const stopAt = start + dur + 0.25;
    osc1.start(start);
    osc2.start(start);
    osc1.stop(stopAt);
    osc2.stop(stopAt);

    const voice = { osc: [osc1, osc2], gain: env };
    this.active.add(voice);
    osc1.onended = () => {
      this.active.delete(voice);
      filter.disconnect();
      env.disconnect();
    };
  }

  allNotesOff(): void {
    const now = this.ctx.currentTime;
    for (const voice of this.active) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0.0001, now, 0.02);
      for (const o of voice.osc) {
        try {
          o.stop(now + 0.1);
        } catch {
          // already stopped
        }
      }
    }
    this.active.clear();
  }
}

/** A short click for the metronome, using the same engine. */
export function scheduleClick(ctx: AudioContext, destination: AudioNode, when: number, accent: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  // Pitched above the hum detector's range so speaker bleed is ignored.
  osc.frequency.value = accent ? 2600 : 1900;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(accent ? 0.25 : 0.15, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
  osc.connect(gain).connect(destination);
  osc.start(when);
  osc.stop(when + 0.05);
}
