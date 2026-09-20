import type { ChordQuality, KeySetting, PitchClass } from './types';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function pitchClassOf(midi: number): PitchClass {
  return (((midi % 12) + 12) % 12) as PitchClass;
}

export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

/** e.g. 60 -> "C4", 61 -> "C#4" */
export function midiToName(midi: number): string {
  return `${NOTE_NAMES[pitchClassOf(midi)]}${octaveOf(midi)}`;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Fractional MIDI number (e.g. 69.4) for a frequency in Hz. */
export function frequencyToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitchClassOf(midi));
}

export function clampMidi(midi: number): number {
  return Math.max(24, Math.min(96, midi));
}

export function chordIntervals(quality: ChordQuality): number[] {
  return quality === 'major' ? [0, 4, 7] : [0, 3, 7];
}

/** Human label for a root + quality, e.g. "Am". */
export function chordName(root: PitchClass, quality: ChordQuality | 'note' | 'custom'): string {
  const name = NOTE_NAMES[root];
  if (quality === 'major') return name;
  if (quality === 'minor') return `${name}m`;
  if (quality === 'note') return name;
  return `${name}?`;
}

/**
 * Given a set of pitch classes, return the major/minor triad they form (if any).
 */
export function identifyTriad(pcs: Set<number>): { root: PitchClass; quality: ChordQuality } | null {
  if (pcs.size !== 3) return null;
  for (let root = 0; root < 12; root++) {
    for (const quality of ['major', 'minor'] as const) {
      const wanted = chordIntervals(quality).map((i) => (root + i) % 12);
      if (wanted.every((pc) => pcs.has(pc))) return { root: root as PitchClass, quality };
    }
  }
  return null;
}

// Krumhansl-Schmuckler key profiles. Simple, well-known, good enough for V1.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

export interface KeyGuess {
  tonic: PitchClass;
  quality: ChordQuality;
  /** 0..1, rough confidence */
  confidence: number;
}

/**
 * Infer the most likely key from a pitch-class weight histogram
 * (index = pitch class, value = total duration or count).
 * Returns null when there is not enough material.
 */
export function inferKey(histogram: number[]): KeyGuess | null {
  const total = histogram.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  let best: KeyGuess | null = null;
  let second = -Infinity;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const quality of ['major', 'minor'] as const) {
      const profile = quality === 'major' ? MAJOR_PROFILE : MINOR_PROFILE;
      const rotated = histogram.map((_, i) => profile[((i - tonic) % 12 + 12) % 12]);
      const score = correlation(histogram, rotated);
      if (!best || score > best.confidence) {
        if (best) second = best.confidence;
        best = { tonic: tonic as PitchClass, quality, confidence: score };
      } else if (score > second) {
        second = score;
      }
    }
  }
  if (!best) return null;
  // Confidence = how far the winner is ahead of the runner-up, squashed to 0..1.
  const margin = Math.max(0, best.confidence - second);
  return { ...best, confidence: Math.min(1, margin * 4) };
}

export function keyLabel(key: KeySetting, guess: KeyGuess | null): string {
  if (key.mode === 'manual') return chordName(key.tonic, key.quality);
  if (!guess) return 'Auto';
  return `Auto · ${chordName(guess.tonic, guess.quality)}`;
}
