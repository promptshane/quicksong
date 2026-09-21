/**
 * Core musical data model for QuickSong.
 *
 * Everything here is plain JSON-serialisable data. Nothing in this file knows
 * about audio rendering, the DOM, or React — the same song can be played by
 * the V1 oscillator synth, a future sampled guitar, or anything else.
 *
 * Time units: positions and durations are measured in *beats*, where one beat
 * is the time signature's beat unit (a quarter note in 4/4, an eighth in 6/8).
 * BPM refers to that same beat. Beat 0 is the start of the song.
 */

export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface TimeSignature {
  beatsPerBar: number;
  /** 4 = quarter-note beat, 8 = eighth-note beat */
  beatUnit: 4 | 8;
}

export type ChordQuality = 'major' | 'minor';

/** Triad qualities a key's diatonic chords can take. Only major/minor are playable in V1. */
export type TriadQuality = ChordQuality | 'dim';

/** A major or natural-minor key. C major and A minor are distinct keys. */
export interface MusicalKey {
  tonic: PitchClass;
  quality: ChordQuality;
}

export type KeySetting =
  | {
      mode: 'auto';
      /**
       * Whether Auto reads the song as a major or minor tonal centre.
       * Absent = major (songs saved before the toggle existed).
       */
      tonality?: ChordQuality;
      /**
       * "Assume this key for now": a still-plausible key the user tapped on
       * the Circle of Fifths. Inference still decides which keys are possible;
       * this only picks among them, and is dropped automatically as soon as
       * committed material rules it out (see `reconcileKeyPreference`).
       */
      preference?: MusicalKey;
    }
  | { mode: 'manual'; tonic: PitchClass; quality: ChordQuality };

/** Shared fields for anything placed on the timeline. */
export interface EventBase {
  id: string;
  /** Start position in beats from the beginning of the song. */
  start: number;
  /** Length in beats. */
  duration: number;
  /** How hard the note/chord is played, 0..1. Separate from layer volume. */
  velocity: number;
}

export interface NoteEvent extends EventBase {
  kind: 'note';
  /** MIDI note number (60 = C4). Octave is implied by the number. */
  midi: number;
}

/**
 * One of the six guitar strings inside a chord voicing.
 * Index 0 is the low E (string 6), index 5 is the high e (string 1).
 */
export interface GuitarString {
  /** Fret number; 0 = open. */
  fret: number;
  /** True when the string should not sound. Auto-set by the voicing, user-overridable. */
  muted: boolean;
}

export type Voicing = [
  GuitarString,
  GuitarString,
  GuitarString,
  GuitarString,
  GuitarString,
  GuitarString,
];

export interface ChordEvent extends EventBase {
  kind: 'chord';
  /** Pitch class of the root the chord was built around. */
  root: PitchClass;
  /**
   * 'note' = a single tone placed on a chord layer that has not been turned
   * into a chord yet. 'custom' = the user has edited the strings by hand.
   */
  quality: ChordQuality | 'note' | 'custom';
  strings: Voicing;
  /**
   * Picked-chord layers only: string numbers (6..1) to pick, one per beat.
   * null = use the layer's default pattern.
   */
  pickPattern: number[] | null;
}

export type StrumSlot = 'down' | 'up' | null;

export type GuitarLayerType = 'strum' | 'picked' | 'single';

interface GuitarLayerBase {
  id: string;
  name: string;
  /** Track-level volume, 0..1. Distinct from event velocity. */
  volume: number;
  muted: boolean;
}

export interface SingleNoteLayer extends GuitarLayerBase {
  type: 'single';
  events: NoteEvent[];
}

export interface StrumLayer extends GuitarLayerBase {
  type: 'strum';
  events: ChordEvent[];
  /** One slot per eighth note in a bar. */
  strumPattern: StrumSlot[];
}

export interface PickedLayer extends GuitarLayerBase {
  type: 'picked';
  events: ChordEvent[];
  /** Default picking order as string numbers (6..1), one per beat. */
  pickPattern: number[];
}

export type GuitarLayer = SingleNoteLayer | StrumLayer | PickedLayer;
export type ChordLayer = StrumLayer | PickedLayer;
export type AnyEvent = NoteEvent | ChordEvent;

export interface Song {
  version: 1;
  id: string;
  bpm: number;
  timeSignature: TimeSignature;
  key: KeySetting;
  /** Number of timeline bar-slots the user has explicitly created. */
  timelineBars: number;
  guitar: {
    layers: GuitarLayer[];
  };
}

export const DEFAULT_VELOCITY = 0.8;
