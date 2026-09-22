import { pitchClassOf } from './music';
import type { ChordQuality, GuitarString, PitchClass, Voicing } from './types';

/** Open-string MIDI numbers, low E (string 6) to high e (string 1). */
export const OPEN_STRINGS = [40, 45, 50, 55, 59, 64] as const;
export const STRING_COUNT = 6;
export const MAX_FRET = 15;

/** Convert a string index (0 = low E) to the guitarist's string number (6..1). */
export function stringNumber(index: number): number {
  return STRING_COUNT - index;
}
export function stringIndex(stringNumber: number): number {
  return STRING_COUNT - stringNumber;
}

/** -1 in a shape means "don't play this string". */
type Shape = [number, number, number, number, number, number];

const OPEN_SHAPES: Partial<Record<string, Shape>> = {
  'C:major': [-1, 3, 2, 0, 1, 0],
  'D:major': [-1, -1, 0, 2, 3, 2],
  'E:major': [0, 2, 2, 1, 0, 0],
  'G:major': [3, 2, 0, 0, 0, 3],
  'A:major': [-1, 0, 2, 2, 2, 0],
  'A:minor': [-1, 0, 2, 2, 1, 0],
  'D:minor': [-1, -1, 0, 2, 3, 1],
  'E:minor': [0, 2, 2, 0, 0, 0],
};

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function eShape(fret: number, quality: ChordQuality): Shape {
  return quality === 'major'
    ? [fret, fret + 2, fret + 2, fret + 1, fret, fret]
    : [fret, fret + 2, fret + 2, fret, fret, fret];
}

function aShape(fret: number, quality: ChordQuality): Shape {
  return quality === 'major'
    ? [-1, fret, fret + 2, fret + 2, fret + 2, fret]
    : [-1, fret, fret + 2, fret + 2, fret + 1, fret];
}

function shapeToVoicing(shape: Shape): Voicing {
  return shape.map((f) => ({ fret: f < 0 ? 0 : f, muted: f < 0 })) as Voicing;
}

/**
 * All sensible standard voicings for a chord, best first.
 * Open chord where one exists, then movable E-shape and A-shape barre chords.
 */
export function voicingsFor(root: PitchClass, quality: ChordQuality): Voicing[] {
  const out: Voicing[] = [];
  const open = OPEN_SHAPES[`${NAMES[root]}:${quality}`];
  if (open) out.push(shapeToVoicing(open));
  const eFret = ((root - pitchClassOf(OPEN_STRINGS[0])) % 12 + 12) % 12;
  const aFret = ((root - pitchClassOf(OPEN_STRINGS[1])) % 12 + 12) % 12;
  const barre: { fret: number; shape: Shape }[] = [];
  if (eFret > 0) barre.push({ fret: eFret, shape: eShape(eFret, quality) });
  if (aFret > 0) barre.push({ fret: aFret, shape: aShape(aFret, quality) });
  barre.sort((a, b) => a.fret - b.fret);
  for (const b of barre) out.push(shapeToVoicing(b.shape));
  return out;
}

export function defaultVoicing(root: PitchClass, quality: ChordQuality): Voicing {
  return voicingsFor(root, quality)[0];
}

/** MIDI number sounding on a string (ignores mute). */
export function stringMidi(index: number, s: GuitarString): number {
  return OPEN_STRINGS[index] + s.fret;
}

/** Sounding notes (low to high) with the string they come from. */
export function soundingNotes(voicing: Voicing): { index: number; midi: number }[] {
  const out: { index: number; midi: number }[] = [];
  voicing.forEach((s, index) => {
    if (!s.muted) out.push({ index, midi: stringMidi(index, s) });
  });
  return out;
}

/**
 * Pick a sensible string/fret for a single MIDI note: the lowest fret
 * position at or below MAX_FRET, preferring lower strings for lower frets.
 */
export function placeNote(midi: number): { index: number; fret: number } {
  let best: { index: number; fret: number } | null = null;
  for (let index = STRING_COUNT - 1; index >= 0; index--) {
    const fret = midi - OPEN_STRINGS[index];
    if (fret < 0 || fret > MAX_FRET) continue;
    // Prefer the position with the smallest fret; ties go to the lower string.
    if (!best || fret < best.fret) best = { index, fret };
  }
  if (!best) {
    // Out of range: clamp onto the nearest string.
    const index = midi < OPEN_STRINGS[0] ? 0 : STRING_COUNT - 1;
    const fret = Math.max(0, Math.min(MAX_FRET, midi - OPEN_STRINGS[index]));
    best = { index, fret };
  }
  return best;
}
