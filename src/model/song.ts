import { addToneToVoicing, defaultVoicing, relabelChord, singleNoteVoicing, soundingNotes } from './chords';
import { newId } from './ids';
import { candidateKeys, isPlausibleKey, keyTonality, relativeKey, resolveAssumedKey, sameKey, triadId, type Triad } from './keys';
import { pitchClassOf } from './music';
import { DEFAULT_TIME_SIGNATURE, eighthsPerBar, songBeats } from './time';
import type {
  AnyEvent,
  AnyLayer,
  ChordEvent,
  ChordLayer,
  ChordQuality,
  GuitarLayer,
  GuitarLayerType,
  KeySetting,
  MusicalKey,
  NoteEvent,
  PianoLayer,
  PickedLayer,
  PitchClass,
  SingleNoteLayer,
  Song,
  StrumLayer,
  StrumSlot,
  TimeSignature,
  Voicing,
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
    piano: { layers: [] },
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

function nextLayerName(song: Song, type: GuitarLayerType, excludeLayerId?: string): string {
  const label = LAYER_TYPE_LABELS[type];
  let max = 0;
  for (const layer of song.guitar.layers) {
    if (layer.id === excludeLayerId || layer.type !== type) continue;
    const prefix = `${label} `;
    const suffix = layer.name.startsWith(prefix) ? Number(layer.name.slice(prefix.length)) : NaN;
    if (Number.isInteger(suffix) && suffix > 0) max = Math.max(max, suffix);
  }
  return `${label} ${max + 1}`;
}

export function createLayer(type: GuitarLayerType, song: Song): GuitarLayer {
  const base = {
    id: newId('layer'),
    name: nextLayerName(song, type),
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

/**
 * Switch a chord layer between strummed and picked playback without touching
 * its chord events, voicings, positions, durations, velocity, mute or volume.
 */
export function convertChordLayerType(song: Song, layerId: string, type: 'strum' | 'picked'): Song {
  return updateLayer(song, layerId, (layer) => {
    if (!isChordLayer(layer) || layer.type === type) return layer;
    const base = {
      id: layer.id,
      name: nextLayerName(song, type, layer.id),
      volume: layer.volume,
      muted: layer.muted,
      events: layer.events,
    };
    if (type === 'picked') {
      return { ...base, type, pickPattern: defaultPickPattern(song.timeSignature) } satisfies PickedLayer;
    }
    return { ...base, type, strumPattern: defaultStrumPattern(song.timeSignature) } satisfies StrumLayer;
  });
}

function cloneChordEvent(event: ChordEvent): ChordEvent {
  return {
    ...event,
    id: newId('c'),
    strings: event.strings.map((string) => ({ ...string })) as Voicing,
    pickPattern: event.pickPattern ? [...event.pickPattern] : null,
  };
}

/** Duplicate a layer directly after its source, preserving its musical data. */
export function duplicateLayer(song: Song, layerId: string): Song {
  const index = song.guitar.layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return song;
  const source = song.guitar.layers[index];

  let duplicate: GuitarLayer;
  if (source.type === 'single') {
    duplicate = {
      ...source,
      id: newId('layer'),
      name: nextLayerName(song, source.type),
      events: source.events.map((event) => ({ ...event, id: newId('n') })),
    };
  } else if (source.type === 'strum') {
    duplicate = {
      ...source,
      id: newId('layer'),
      name: nextLayerName(song, source.type),
      events: source.events.map(cloneChordEvent),
      strumPattern: [...source.strumPattern],
    };
  } else {
    duplicate = {
      ...source,
      id: newId('layer'),
      name: nextLayerName(song, source.type),
      events: source.events.map(cloneChordEvent),
      pickPattern: [...source.pickPattern],
    };
  }

  const layers = [...song.guitar.layers];
  layers.splice(index + 1, 0, duplicate);
  return { ...song, guitar: { ...song.guitar, layers } };
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

export function findPianoLayer(song: Song, layerId: string): PianoLayer | undefined {
  return song.piano.layers.find((l) => l.id === layerId);
}

/** Every layer of every instrument. Layer ids are unique across instruments. */
export function allLayers(song: Song): AnyLayer[] {
  return [...song.guitar.layers, ...song.piano.layers];
}

export function findAnyLayer(song: Song, layerId: string): AnyLayer | undefined {
  return findLayer(song, layerId) ?? findPianoLayer(song, layerId);
}

export function updateLayer(song: Song, layerId: string, fn: (layer: GuitarLayer) => GuitarLayer): Song {
  return {
    ...song,
    guitar: { ...song.guitar, layers: song.guitar.layers.map((l) => (l.id === layerId ? fn(l) : l)) },
  };
}

export function updatePianoLayer(song: Song, layerId: string, fn: (layer: PianoLayer) => PianoLayer): Song {
  if (!song.piano.layers.some((l) => l.id === layerId)) return song;
  return {
    ...song,
    piano: { ...song.piano, layers: song.piano.layers.map((l) => (l.id === layerId ? fn(l) : l)) },
  };
}

/** Apply the same change to whichever instrument's layer has this id. */
export function updateAnyLayer(song: Song, layerId: string, fn: <L extends AnyLayer>(layer: L) => L): Song {
  if (song.piano.layers.some((l) => l.id === layerId)) return updatePianoLayer(song, layerId, fn);
  return updateLayer(song, layerId, fn);
}

/** Append a new layer to the instrument it belongs to. */
export function appendLayer(song: Song, layer: AnyLayer): Song {
  if (layer.type === 'piano') return { ...song, piano: { ...song.piano, layers: [...song.piano.layers, layer] } };
  return { ...song, guitar: { ...song.guitar, layers: [...song.guitar.layers, layer] } };
}

export function removeLayer(song: Song, layerId: string): Song {
  return {
    ...song,
    guitar: { ...song.guitar, layers: song.guitar.layers.filter((l) => l.id !== layerId) },
    piano: { ...song.piano, layers: song.piano.layers.filter((l) => l.id !== layerId) },
  };
}

export function toggleLayerMute(song: Song, layerId: string): Song {
  return updateAnyLayer(song, layerId, (l) => ({ ...l, muted: !l.muted }));
}

function sortEvents<T extends AnyEvent>(events: T[]): T[] {
  return [...events].sort((a, b) => a.start - b.start);
}

export function addEvent(song: Song, layerId: string, event: AnyEvent): Song {
  if (event.kind === 'piano') {
    return updatePianoLayer(song, layerId, (layer) => ({ ...layer, events: sortEvents([...layer.events, event]) }));
  }
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

/**
 * Change one event in any instrument's layer. Only the shared EventBase
 * fields (start / duration / velocity) are instrument-agnostic; callers that
 * change anything else must keep the event's kind.
 */
export function updateEvent(song: Song, layerId: string, eventId: string, fn: (e: AnyEvent) => AnyEvent): Song {
  return updateAnyLayer(song, layerId, (layer) => {
    const events = sortEvents((layer.events as AnyEvent[]).map((e) => (e.id === eventId ? fn(e) : e)));
    return { ...layer, events };
  });
}

export function removeEvent(song: Song, layerId: string, eventId: string): Song {
  return updateAnyLayer(song, layerId, (layer) => {
    const events = (layer.events as AnyEvent[]).filter((e) => e.id !== eventId);
    return { ...layer, events };
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
  for (const layer of song.piano.layers) {
    for (const ev of layer.events) {
      // Same weighting as guitar chords: the picked root counts fully.
      hist[ev.root] += ev.duration;
      for (const midi of ev.notes) hist[pitchClassOf(midi)] += ev.duration * 0.5;
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
  for (const layer of song.piano.layers) {
    for (const ev of layer.events) for (const midi of ev.notes) out.add(pitchClassOf(midi));
  }
  return out;
}

/**
 * Distinct chords committed across every guitar and piano layer (root +
 * major/minor). Guitar seed notes and hand-edited 'custom' voicings are not
 * chords; a piano chord counts as the standard chord it was built from, even
 * with extra wheel notes on top. The same chord on several layers counts
 * once — "used" is a yes/no.
 */
export function usedChords(song: Song): Triad[] {
  const seen = new Map<string, Triad>();
  for (const layer of song.guitar.layers) {
    if (!isChordLayer(layer)) continue;
    for (const ev of layer.events) {
      if (ev.quality !== 'major' && ev.quality !== 'minor') continue;
      const triad: Triad = { root: ev.root, quality: ev.quality };
      seen.set(triadId(triad), triad);
    }
  }
  for (const layer of song.piano.layers) {
    for (const ev of layer.events) {
      const triad: Triad = { root: ev.root, quality: ev.quality };
      seen.set(triadId(triad), triad);
    }
  }
  return [...seen.values()];
}

/**
 * The pitch class an event is "about": a note's own pitch, a chord's root.
 * Used to colour events by their place in the key.
 */
export function eventRootPitchClass(event: AnyEvent): PitchClass {
  return event.kind === 'note' ? pitchClassOf(event.midi) : event.root;
}

/** The key the song is currently read in (manual, or Auto's assumption); null before any evidence. */
export function assumedKey(song: Song): MusicalKey | null {
  return resolveAssumedKey(song.key, usedPitchClasses(song), pitchClassHistogram(song)).assumed;
}

/**
 * Set the loop region (beats). It is kept inside the song; covering the whole
 * song clears it, so the loop goes back to following the song's length.
 */
export function setLoopRegion(song: Song, start: number, end: number): Song {
  const total = songBeats(song);
  const s = Math.max(0, Math.min(start, total));
  const e = Math.max(s, Math.min(end, total));
  const { loopRegion: _old, ...rest } = song;
  if (e - s < 1e-6 || (s < 1e-6 && e > total - 1e-6)) return rest;
  return { ...rest, loopRegion: { start: s, end: e } };
}

// ---- key setting ----------------------------------------------------------

export function setManualKey(song: Song, key: MusicalKey): Song {
  return { ...song, key: { mode: 'manual', tonic: key.tonic, quality: key.quality } };
}

/** Back to Auto. Keeps the tonality the manual key had so the wheel does not jump. */
export function setAutoKey(song: Song): Song {
  if (song.key.mode === 'auto') return song;
  return { ...song, key: { mode: 'auto', tonality: song.key.quality } };
}

/**
 * "Assume this key for now." Stays in Auto; only a still-plausible key can be
 * preferred, and the Major/Minor tonality follows the tapped key.
 */
export function setAutoKeyPreference(song: Song, key: MusicalKey): Song {
  if (song.key.mode !== 'auto') return song;
  if (!isPlausibleKey(key, candidateKeys(usedPitchClasses(song)))) return song;
  if (sameKey(song.key.preference, key)) return song;
  return { ...song, key: { mode: 'auto', tonality: key.quality, preference: key } };
}

/**
 * Major / Minor toggle. In Auto an existing preference moves to its relative
 * key (same wheel slot, other ring); in manual the chosen key does the same.
 */
export function setKeyTonality(song: Song, tonality: ChordQuality): Song {
  if (keyTonality(song.key) === tonality) return song;
  if (song.key.mode === 'manual') {
    return setManualKey(song, relativeKey({ tonic: song.key.tonic, quality: song.key.quality }));
  }
  const key: KeySetting = { mode: 'auto', tonality };
  if (song.key.preference) key.preference = relativeKey(song.key.preference);
  return { ...song, key };
}

/**
 * Drop an Auto preference that committed material has made impossible, so the
 * song never carries a key it cannot be in. Returns the same object when
 * nothing changes; call after every edit.
 */
export function reconcileKeyPreference(song: Song): Song {
  if (song.key.mode !== 'auto' || !song.key.preference) return song;
  if (isPlausibleKey(song.key.preference, candidateKeys(usedPitchClasses(song)))) return song;
  const { preference: _dropped, ...key } = song.key;
  return { ...song, key };
}
