import { addToneToVoicing, defaultVoicing, relabelChord, singleNoteVoicing, soundingNotes } from './chords';
import { newId } from './ids';
import { pitchClassOf } from './music';
import { DEFAULT_TIME_SIGNATURE, eighthsPerBar } from './time';
import type {
  AnyEvent,
  ChordEvent,
  ChordLayer,
  ChordQuality,
  GuitarLayer,
  GuitarLayerType,
  NoteEvent,
  PickedLayer,
  SingleNoteLayer,
  Song,
  StrumLayer,
  StrumSlot,
  TimeSignature,
} from './types';
import { DEFAULT_VELOCITY } from './types';

export function createSong(): Song {
  return {
    version: 1,
    id: newId('song'),
    bpm: 100,
    timeSignature: DEFAULT_TIME_SIGNATURE,
    key: { mode: 'auto' },
    timelineBars: 1,
    guitar: { layers: [] },
  };
}

/** A basic "down on every beat" strum pattern for a time signature. */
export function defaultStrumPattern(ts: TimeSignature): StrumSlot[] {
  const slots = eighthsPerBar(ts);
  const perBeat = ts.beatUnit === 4 ? 2 : 1;
  return Array.from({ length: slots }, (_, i) => (i % perBeat === 0 ? 'down' : null));
}

/** Default pick order: bass string then walk up, one pick per beat. */
export function defaultPickPattern(ts: TimeSignature): number[] {
  const order = [6, 4, 3, 2, 5, 3, 2, 1];
  return Array.from({ length: ts.beatsPerBar }, (_, i) => order[i % order.length]);
}

/** Resize a per-bar pattern when the time signature changes, keeping what fits. */
export function resizePattern<T>(pattern: T[], length: number, fill: (i: number) => T): T[] {
  return Array.from({ length }, (_, i) => (i < pattern.length ? pattern[i] : fill(i)));
}

export const LAYER_TYPE_LABELS: Record<GuitarLayerType, string> = {
  strum: 'Strummed Chords',
  picked: 'Picked Chords',
  single: 'Single Notes',
};

export function createLayer(type: GuitarLayerType, song: Song): GuitarLayer {
  const count = song.guitar.layers.filter((l) => l.type === type).length + 1;
  const base = {
    id: newId('layer'),
    name: `${LAYER_TYPE_LABELS[type]} ${count}`,
    volume: 0.9,
    muted: false,
  };
  switch (type) {
    case 'single':
      return { ...base, type, events: [] } satisfies SingleNoteLayer;
    case 'strum':
      return { ...base, type, events: [], strumPattern: defaultStrumPattern(song.timeSignature) } satisfies StrumLayer;
    case 'picked':
      return { ...base, type, events: [], pickPattern: defaultPickPattern(song.timeSignature) } satisfies PickedLayer;
  }
}

export function isChordLayer(layer: GuitarLayer): layer is ChordLayer {
  return layer.type === 'strum' || layer.type === 'picked';
}

export function createNoteEvent(midi: number, start: number, duration: number, velocity = DEFAULT_VELOCITY): NoteEvent {
  return { kind: 'note', id: newId('n'), midi, start, duration, velocity };
}

/** A chord event containing just one tone — the seed for Major/Minor. */
export function createSeedChord(midi: number, start: number, duration: number, velocity = DEFAULT_VELOCITY): ChordEvent {
  return {
    kind: 'chord',
    id: newId('c'),
    root: pitchClassOf(midi),
    quality: 'note',
    strings: singleNoteVoicing(midi),
    start,
    duration,
    velocity,
    pickPattern: null,
  };
}

export function buildChord(chord: ChordEvent, quality: ChordQuality): ChordEvent {
  return { ...chord, quality, strings: defaultVoicing(chord.root, quality) };
}

export function addToneToChord(chord: ChordEvent, midi: number): ChordEvent {
  return relabelChord({ ...chord, strings: addToneToVoicing(chord.strings, midi) });
}

// ---- generic immutable helpers -------------------------------------------

export function findLayer(song: Song, layerId: string): GuitarLayer | undefined {
  return song.guitar.layers.find((l) => l.id === layerId);
}

export function updateLayer(song: Song, layerId: string, fn: (layer: GuitarLayer) => GuitarLayer): Song {
  return {
    ...song,
    guitar: { ...song.guitar, layers: song.guitar.layers.map((l) => (l.id === layerId ? fn(l) : l)) },
  };
}

function sortEvents<T extends AnyEvent>(events: T[]): T[] {
  return [...events].sort((a, b) => a.start - b.start);
}

export function addEvent(song: Song, layerId: string, event: AnyEvent): Song {
  return updateLayer(song, layerId, (layer) => {
    if (layer.type === 'single' && event.kind === 'note') {
      return { ...layer, events: sortEvents([...layer.events, event]) };
    }
    if (layer.type !== 'single' && event.kind === 'chord') {
      return { ...layer, events: sortEvents([...layer.events, event]) } as GuitarLayer;
    }
    return layer;
  });
}

export function updateEvent(song: Song, layerId: string, eventId: string, fn: (e: AnyEvent) => AnyEvent): Song {
  return updateLayer(song, layerId, (layer) => {
    const events = sortEvents(layer.events.map((e) => (e.id === eventId ? fn(e) : e)));
    return { ...layer, events } as GuitarLayer;
  });
}

export function removeEvent(song: Song, layerId: string, eventId: string): Song {
  return updateLayer(song, layerId, (layer) => {
    const events = layer.events.filter((e) => e.id !== eventId);
    return { ...layer, events } as GuitarLayer;
  });
}

/** Apply a new time signature, resizing per-bar patterns to match. */
export function applyTimeSignature(song: Song, ts: TimeSignature): Song {
  const layers = song.guitar.layers.map((layer): GuitarLayer => {
    if (layer.type === 'strum') {
      const fresh = defaultStrumPattern(ts);
      return { ...layer, strumPattern: resizePattern(layer.strumPattern, fresh.length, (i) => fresh[i]) };
    }
    if (layer.type === 'picked') {
      const fresh = defaultPickPattern(ts);
      return {
        ...layer,
        pickPattern: resizePattern(layer.pickPattern, fresh.length, (i) => fresh[i]),
        events: layer.events.map((e) =>
          e.pickPattern ? { ...e, pickPattern: resizePattern(e.pickPattern, fresh.length, (i) => fresh[i]) } : e,
        ),
      };
    }
    return layer;
  });
  return { ...song, timeSignature: ts, guitar: { ...song.guitar, layers } };
}

/** Pitch-class histogram weighted by duration, for key inference. */
export function pitchClassHistogram(song: Song): number[] {
  const hist = new Array<number>(12).fill(0);
  for (const layer of song.guitar.layers) {
    for (const ev of layer.events) {
      if (ev.kind === 'note') {
        hist[pitchClassOf(ev.midi)] += ev.duration;
      } else {
        // Chords: the root counts fully, each sounding tone counts half.
        hist[ev.root] += ev.duration;
        for (const { midi } of soundingNotes(ev.strings)) {
          hist[pitchClassOf(midi)] += ev.duration * 0.5;
        }
      }
    }
  }
  return hist;
}

/** Pitch classes present in committed material (notes and sounding chord tones). */
export function usedPitchClasses(song: Song): Set<number> {
  const out = new Set<number>();
  for (const layer of song.guitar.layers) {
    for (const ev of layer.events) {
      if (ev.kind === 'note') out.add(pitchClassOf(ev.midi));
      else for (const { midi } of soundingNotes(ev.strings)) out.add(pitchClassOf(midi));
    }
  }
  return out;
}
