import { describe, expect, it } from 'vitest';
import { frequencyToMidi, identifyTriad, inferKey, midiToFrequency, midiToName, keyLabel } from '../src/model/music';

describe('music helpers', () => {
  it('names midi notes with octave', () => {
    expect(midiToName(60)).toBe('C4');
    expect(midiToName(69)).toBe('A4');
    expect(midiToName(58)).toBe('A#3');
    expect(midiToName(48)).toBe('C3');
  });

  it('converts between frequency and midi', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440);
    expect(frequencyToMidi(440)).toBeCloseTo(69);
    expect(frequencyToMidi(261.63)).toBeCloseTo(60, 1);
  });

  it('identifies major and minor triads', () => {
    expect(identifyTriad(new Set([9, 0, 4]))).toEqual({ root: 9, quality: 'minor' });
    expect(identifyTriad(new Set([0, 4, 7]))).toEqual({ root: 0, quality: 'major' });
    expect(identifyTriad(new Set([0, 4, 8]))).toBeNull();
    expect(identifyTriad(new Set([0, 4]))).toBeNull();
  });

  it('infers a key from a pitch-class histogram', () => {
    const hist = new Array(12).fill(0);
    // C major scale, C weighted heaviest.
    for (const [pc, w] of [[0, 4], [2, 1], [4, 2], [5, 1], [7, 3], [9, 1], [11, 1]] as const) hist[pc] = w;
    const guess = inferKey(hist);
    expect(guess?.tonic).toBe(0);
    expect(guess?.quality).toBe('major');
    expect(inferKey(new Array(12).fill(0))).toBeNull();
  });

  it('labels keys', () => {
    expect(keyLabel({ mode: 'auto' }, null)).toBe('Auto');
    expect(keyLabel({ mode: 'manual', tonic: 9, quality: 'minor' }, null)).toBe('Am');
    expect(keyLabel({ mode: 'auto' }, { tonic: 7, quality: 'major', confidence: 0.5 })).toBe('Auto · G');
  });
});
