import { MAX_FRET, OPEN_STRINGS, defaultVoicing, soundingNotes } from './chords';
import { pitchClassOf } from './music';
import { chordTonesOf, type ChordShape } from './piano';
import type { ChordEvent, ChordQuality, PitchClass, Voicing } from './types';

/**
 * Guitar chords in the shared chord workflow (key palette, special-chord
 * wheel). The chord stays a real six-string voicing; `root` + `quality`
 * remember the standard chord it was picked as, and wheel notes are extra
 * strings on top of it.
 */

/** The chord as notes, for naming and the wheel. Legacy seed / hand-edited chords have none. */
export function guitarChordShape(chord: ChordEvent): ChordShape | null {
  if (chord.quality !== 'major' && chord.quality !== 'minor') return null;
  return { root: chord.root, quality: chord.quality, notes: soundingNotes(chord.strings).map((n) => n.midi) };
}

/** Swap to another standard chord in its default voicing, keeping timing, feel and style. */
export function setGuitarChord(chord: ChordEvent, root: PitchClass, quality: ChordQuality): ChordEvent {
  return { ...chord, root, quality, strings: defaultVoicing(root, quality) };
}

function fretFor(stringIndex: number, pc: number, near: number): number | null {
  const base = (((pc - pitchClassOf(OPEN_STRINGS[stringIndex])) % 12) + 12) % 12;
  const options = [base, base + 12].filter((f) => f <= MAX_FRET);
  if (options.length === 0) return null;
  return options.reduce((best, f) => (Math.abs(f - near) < Math.abs(best - near) ? f : best));
}

/**
 * Add a wheel note to the voicing, or take an added one off. The chord's own
 * notes are never removed. A new note goes on a muted string near where the
 * hand already is; with every string in use it replaces a doubled note
 * (e.g. a second root) rather than a chord tone that would be lost.
 */
export function toggleGuitarChordNote(chord: ChordEvent, pc: PitchClass): ChordEvent {
  const shape = guitarChordShape(chord);
  if (!shape) return chord;
  const tones = chordTonesOf(shape);
  if (tones.has(pc)) return chord;
  const strings = chord.strings.map((s) => ({ ...s })) as Voicing;
  const sounding = soundingNotes(chord.strings);

  if (sounding.some((n) => pitchClassOf(n.midi) === pc)) {
    for (const n of sounding) if (pitchClassOf(n.midi) === pc) strings[n.index] = { ...strings[n.index], muted: true };
    return { ...chord, strings };
  }

  const fretted = sounding.map((n) => chord.strings[n.index].fret).filter((f) => f > 0);
  const hand = fretted.length ? fretted.reduce((a, b) => a + b, 0) / fretted.length : 2;

  // A muted string first (higher strings preferred: added colour sits on top).
  for (let index = strings.length - 1; index >= 0; index--) {
    if (!strings[index].muted) continue;
    const fret = fretFor(index, pc, hand);
    if (fret === null) continue;
    strings[index] = { fret, muted: false };
    return { ...chord, strings };
  }

  // Otherwise re-fret a string whose note is doubled elsewhere in the chord.
  const counts = new Map<number, number>();
  for (const n of sounding) counts.set(pitchClassOf(n.midi), (counts.get(pitchClassOf(n.midi)) ?? 0) + 1);
  for (let k = sounding.length - 1; k >= 0; k--) {
    const n = sounding[k];
    if ((counts.get(pitchClassOf(n.midi)) ?? 0) < 2) continue;
    const fret = fretFor(n.index, pc, hand);
    if (fret === null) continue;
    strings[n.index] = { fret, muted: false };
    return { ...chord, strings };
  }
  return chord; // no room on six strings
}
