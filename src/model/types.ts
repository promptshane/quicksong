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
  /** This chord's own playing style; absent = the layer's. */
  styleOverride?: ChordStyleOverride;
}

export type StrumSlot = 'down' | 'up' | null;

/**
 * How a chords layer (guitar or piano) plays each chord:
 * 'together' — all notes at once (guitar: strummed on the strum pattern;
 * piano: one strike); 'arpeggio' — one note at a time on an arpeggio pattern
 * (guitar: picked).
 */
export type ChordStyle = 'together' | 'arpeggio';

/** Named arpeggio shapes; they adapt to however many notes a chord has. */
export type ArpPreset = 'up' | 'down' | 'updown' | 'bass';

/**
 * How a chord's notes are played one at a time across each bar, on the
 * eighth-note grid. A preset generates the steps for each chord; 'custom'
 * spells them out: per eighth slot of the bar, which chord notes sound
 * (0 = the lowest note). Rows past a chord's highest note play its top note.
 */
export interface ArpPattern {
  preset: ArpPreset | 'custom';
  /** Presets: one note per quarter note or per eighth note. */
  rate: 'quarter' | 'eighth';
  /** Custom only: one entry per eighth slot in a bar. */
  steps?: number[][];
}

/** A single chord's own style, overriding its layer's default. */
export interface ChordStyleOverride {
  style: ChordStyle;
  arp: ArpPattern;
}

/** Guitar layer kinds: chords, or single notes. */
export type GuitarLayerType = 'chords' | 'single';

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

/** Guitar chords: strummed ('together') or picked ('arpeggio'), switchable any time. */
export interface GuitarChordLayer extends GuitarLayerBase {
  type: 'chords';
  events: ChordEvent[];
  style: ChordStyle;
  /** Strumming: one slot per eighth note in a bar. */
  strumPattern: StrumSlot[];
  /** Picking. */
  arp: ArpPattern;
}

export type GuitarLayer = SingleNoteLayer | GuitarChordLayer;
export type ChordLayer = GuitarChordLayer;

/**
 * One piano hit. Unlike a guitar chord this is not a fingering: it is the set
 * of keys actually pressed. `root` + `quality` remember the standard chord the
 * user picked from the key; `notes` is the truth for playback and may contain
 * extra tones added on the note wheel (D F# A + C#). A future voicing/inversion
 * editor only has to rewrite `notes`; a single piano note is just one entry.
 *
 * `start` is when the keys are struck, `velocity` how hard, and `duration`
 * how long they are held (sustain) — one event is one strike.
 */
export interface PianoEvent extends EventBase {
  kind: 'piano';
  root: PitchClass;
  quality: ChordQuality;
  /** Sounding MIDI notes, low to high, no duplicates. */
  notes: number[];
  /** This chord's own playing style; absent = the layer's. */
  styleOverride?: ChordStyleOverride;
}

/** Piano chords: struck together, or arpeggiated. */
export interface PianoLayer {
  id: string;
  type: 'piano';
  name: string;
  /** Track-level volume, 0..1. Distinct from event velocity. */
  volume: number;
  muted: boolean;
  events: PianoEvent[];
  style: ChordStyle;
  arp: ArpPattern;
}

/** Piano single notes (melodies), entered like guitar single notes. */
export interface PianoNotesLayer {
  id: string;
  type: 'pianoNotes';
  name: string;
  volume: number;
  muted: boolean;
  events: NoteEvent[];
}

export type AnyPianoLayer = PianoLayer | PianoNotesLayer;

export type DrumPiece = 'kick' | 'snare' | 'hat';

/** One drum hit, placed individually on the eighth-note grid. */
export interface DrumHit extends EventBase {
  kind: 'drum';
  piece: DrumPiece;
}

export interface DrumLayer {
  id: string;
  type: 'drums';
  name: string;
  volume: number;
  muted: boolean;
  events: DrumHit[];
}

export type AnyLayer = GuitarLayer | AnyPianoLayer | DrumLayer;
export type AnyEvent = NoteEvent | ChordEvent | PianoEvent | DrumHit;

export interface Song {
  version: 1;
  id: string;
  bpm: number;
  timeSignature: TimeSignature;
  key: KeySetting;
  /** Number of timeline bar-slots the user has explicitly created. */
  timelineBars: number;
  /**
   * The loop region, in beats [start, end). Absent = the whole song, which
   * then follows slots being added or removed.
   */
  loopRegion?: { start: number; end: number };
  /**
   * True when the user switched looping off (hold the golden bar): Play then
   * starts at the cursor and plays through once. Absent = looping on.
   */
  loopOff?: true;
  guitar: {
    layers: GuitarLayer[];
  };
  /** Absent in songs saved before Piano existed; `normalizeStoredSong` fills it in. */
  piano: {
    layers: AnyPianoLayer[];
  };
  /** Absent in songs saved before Drums existed; `normalizeStoredSong` fills it in. */
  drums: {
    layers: DrumLayer[];
  };
}

export const DEFAULT_VELOCITY = 0.8;
