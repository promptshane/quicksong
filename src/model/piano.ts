import { newId } from './ids';
import { diatonicChords, keyPitchClasses, resolveAssumedKey, type Triad } from './keys';
import { NOTE_NAMES, chordIntervals, chordName, pitchClassOf } from './music';
import { pitchClassHistogram, usedPitchClasses } from './song';
import type { ChordQuality, MusicalKey, PianoEvent, PianoLayer, PitchClass, Song } from './types';
import { DEFAULT_VELOCITY } from './types';

/**
 * Piano: sound = which keys are pressed, rhythm = when / how hard / how long.
 *
 * A piano chord is a plain list of MIDI notes (see `PianoEvent`), never a
 * guitar voicing. The standard chord a user picks is voiced in root position
 * around middle C; notes added on the note wheel stack above it.
 */

/** Root-position chords are voiced with the root in F3..E4, so every key sits around middle C. */
const LOWEST_ROOT = 53;

export const PIANO_LAYER_LABEL = 'Piano';

export function createPianoLayer(song: Song): PianoLayer {
  let max = 0;
  for (const layer of song.piano.layers) {
    const suffix = layer.name.startsWith(`${PIANO_LAYER_LABEL} `) ? Number(layer.name.slice(PIANO_LAYER_LABEL.length + 1)) : NaN;
    if (Number.isInteger(suffix) && suffix > 0) max = Math.max(max, suffix);
  }
  return { id: newId('layer'), type: 'piano', name: `${PIANO_LAYER_LABEL} ${max + 1}`, volume: 0.9, muted: false, events: [] };
}

/** Copy a piano layer (fresh ids, same music) directly after its source. */
export function duplicatePianoLayer(song: Song, layerId: string): Song {
  const index = song.piano.layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return song;
  const source = song.piano.layers[index];
  const duplicate: PianoLayer = {
    ...source,
    id: newId('layer'),
    name: createPianoLayer(song).name,
    events: source.events.map((event) => ({ ...event, id: newId('p'), notes: [...event.notes] })),
  };
  const layers = [...song.piano.layers];
  layers.splice(index + 1, 0, duplicate);
  return { ...song, piano: { ...song.piano, layers } };
}

// ---- chords ----------------------------------------------------------------

/** Root-position MIDI notes for a standard chord, e.g. D major -> D4 F#4 A4. */
export function pianoChordNotes(root: PitchClass, quality: ChordQuality): number[] {
  const rootMidi = LOWEST_ROOT + ((root - pitchClassOf(LOWEST_ROOT) + 12) % 12);
  return chordIntervals(quality).map((i) => rootMidi + i);
}

export function createPianoChord(
  root: PitchClass,
  quality: ChordQuality,
  start: number,
  duration: number,
  velocity = DEFAULT_VELOCITY,
): PianoEvent {
  return { kind: 'piano', id: newId('p'), root, quality, notes: pianoChordNotes(root, quality), start, duration, velocity };
}

/** Pitch classes of the standard chord the event was built from. */
export function pianoChordTones(event: Pick<PianoEvent, 'root' | 'quality'>): Set<PitchClass> {
  return new Set(chordIntervals(event.quality).map((i) => ((event.root + i) % 12) as PitchClass));
}

/** Pitch classes the user added on top of the standard chord, in the order they sound. */
export function pianoAddedPitchClasses(event: PianoEvent): PitchClass[] {
  const tones = pianoChordTones(event);
  const out: PitchClass[] = [];
  for (const midi of event.notes) {
    const pc = pitchClassOf(midi);
    if (!tones.has(pc) && !out.includes(pc)) out.push(pc);
  }
  return out;
}

/** Swap the event to another standard chord, keeping timing, velocity and sustain. */
export function setPianoChord(event: PianoEvent, root: PitchClass, quality: ChordQuality): PianoEvent {
  return { ...event, root, quality, notes: pianoChordNotes(root, quality) };
}

/**
 * Add or remove one extra note on the wheel. Chord tones of the standard
 * chord are the central object and are left alone. A new note goes on top:
 * the first key of that pitch class above the chord's highest standard tone,
 * so D F# A + C# sounds as D F# A C#.
 */
export function togglePianoNote(event: PianoEvent, pc: PitchClass): PianoEvent {
  const tones = pianoChordTones(event);
  if (tones.has(pc)) return event;
  if (event.notes.some((m) => pitchClassOf(m) === pc)) {
    return { ...event, notes: event.notes.filter((m) => pitchClassOf(m) !== pc) };
  }
  const chordTop = Math.max(...event.notes.filter((m) => tones.has(pitchClassOf(m))), LOWEST_ROOT);
  const midi = chordTop + 1 + ((pc - pitchClassOf(chordTop + 1) + 12) % 12);
  return { ...event, notes: [...event.notes, midi].sort((a, b) => a - b) };
}

// Chord symbols we can name without guessing, keyed by quality and the added
// intervals above the root (sorted). Anything else is shown as "D + E G#".
const NAMED_EXTENSIONS: Record<ChordQuality, Record<string, string>> = {
  major: { '10': '7', '11': 'maj7', '2': 'add9', '9': '6', '5': 'add4', '2,10': '9', '2,11': 'maj9', '2,9': '6/9' },
  minor: { '10': 'm7', '11': 'm(maj7)', '2': 'm(add9)', '9': 'm6', '5': 'm(add4)', '2,10': 'm9' },
};

/** Best confident name: "D", "Dmaj7", or "D + C#" when there is no common symbol. */
export function pianoChordName(event: PianoEvent): string {
  const base = chordName(event.root, event.quality);
  const added = pianoAddedPitchClasses(event);
  if (added.length === 0) return base;
  const intervals = added.map((pc) => (pc - event.root + 12) % 12).sort((a, b) => a - b);
  const suffix = NAMED_EXTENSIONS[event.quality][intervals.join(',')];
  if (suffix) return `${NOTE_NAMES[event.root]}${suffix}`;
  return `${base} + ${added.map((pc) => NOTE_NAMES[pc]).join(' ')}`;
}

// ---- key palette -----------------------------------------------------------

export interface PianoPalette {
  /** The key the chords come from. */
  key: MusicalKey;
  /** True when Auto has no material yet and the key is just a starting point. */
  guessed: boolean;
  /** The key's diatonic major/minor chords in scale order (the diminished chord is left out). */
  chords: (Triad & { quality: ChordQuality })[];
  /** Pitch classes of the key, for the note wheel. */
  scale: Set<PitchClass>;
}

/**
 * The chords that naturally belong to the song, from the song's own key
 * setting: a manual key, or Auto's currently assumed key. With nothing
 * committed yet Auto has no key, so start from C major / A minor according
 * to the Major/Minor toggle — the same fallback the Key panel's lock uses.
 */
export function pianoPalette(song: Song): PianoPalette {
  const { assumed, tonality } = resolveAssumedKey(song.key, usedPitchClasses(song), pitchClassHistogram(song));
  const key: MusicalKey = assumed ?? (tonality === 'major' ? { tonic: 0, quality: 'major' } : { tonic: 9, quality: 'minor' });
  const chords = diatonicChords(key).filter((t): t is Triad & { quality: ChordQuality } => t.quality !== 'dim');
  return { key, guessed: !assumed, chords, scale: keyPitchClasses(key) };
}
