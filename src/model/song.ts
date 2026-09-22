import { DEFAULT_ARP, resizeArp } from './arpeggio';
import { defaultVoicing, soundingNotes } from './chords';
import { newId } from './ids';
import { candidateKeys, isPlausibleKey, keyTonality, relativeKey, resolveAssumedKey, sameKey, triadId, type Triad } from './keys';
import { pitchClassOf } from './music';
import { DEFAULT_TIME_SIGNATURE, eighthsPerBar, songBeats } from './time';
import type {
  AnyEvent,
  AnyLayer,
  ArpPattern,
  ChordEvent,
  ChordLayer,
  ChordQuality,
  ChordStyle,
  ChordStyleOverride,
  GuitarChordLayer,
  GuitarLayer,
  GuitarLayerType,
  KeySetting,
  MusicalKey,
  AnyPianoLayer,
  DrumLayer,
  NoteEvent,
  PianoLayer,
  PitchClass,
  SingleNoteLayer,
  Song,
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
    piano: { layers: [] },
    drums: { layers: [] },
  };
}

/** A basic "down on every beat" strum pattern for a time signature. */
export function defaultStrumPattern(ts: TimeSignature): StrumSlot[] {
  const slots = eighthsPerBar(ts);
  const perBeat = ts.beatUnit === 4 ? 2 : 1;
  return Array.from({ length: slots }, (_, i) => (i % perBeat === 0 ? 'down' : null));
}

/** Resize a per-bar pattern when the time signature changes, keeping what fits. */
export function resizePattern<T>(pattern: T[], length: number, fill: (i: number) => T): T[] {
  return Array.from({ length }, (_, i) => (i < pattern.length ? pattern[i] : fill(i)));
}

/** What a layer holds: chords, single notes, or drum hits. */
export type LayerKind = 'chords' | 'notes' | 'drums';
export type InstrumentId = 'guitar' | 'piano' | 'drums';

export function layerKind(layer: AnyLayer): LayerKind {
  if (layer.type === 'chords' || layer.type === 'piano') return 'chords';
  if (layer.type === 'drums') return 'drums';
  return 'notes';
}

export function layerInstrument(layer: AnyLayer): InstrumentId {
  if (layer.type === 'piano' || layer.type === 'pianoNotes') return 'piano';
  if (layer.type === 'drums') return 'drums';
  return 'guitar';
}

/** Default names for new layers, per instrument and kind. */
export const LAYER_LABELS = {
  guitar: { chords: 'Guitar Chords', notes: 'Guitar Notes' },
  piano: { chords: 'Piano Chords', notes: 'Piano Notes' },
  drums: { drums: 'Drums' },
} as const;

/** "<label> N", one more than the highest N already used with that label. */
export function nextLayerName(song: Song, label: string): string {
  let max = 0;
  for (const layer of allLayers(song)) {
    const prefix = `${label} `;
    const suffix = layer.name.startsWith(prefix) ? Number(layer.name.slice(prefix.length)) : NaN;
    if (Number.isInteger(suffix) && suffix > 0) max = Math.max(max, suffix);
  }
  return `${label} ${max + 1}`;
}

export function createLayer(type: GuitarLayerType, song: Song): GuitarLayer {
  const base = { id: newId('layer'), volume: 0.9, muted: false };
  if (type === 'single') {
    return { ...base, name: nextLayerName(song, LAYER_LABELS.guitar.notes), type, events: [] } satisfies SingleNoteLayer;
  }
  return {
    ...base,
    name: nextLayerName(song, LAYER_LABELS.guitar.chords),
    type,
    events: [],
    style: 'together',
    strumPattern: defaultStrumPattern(song.timeSignature),
    arp: DEFAULT_ARP,
  } satisfies GuitarChordLayer;
}

export function isChordLayer(layer: AnyLayer): layer is ChordLayer {
  return layer.type === 'chords';
}

/** Layers whose chords have a playing style (guitar and piano chords). */
export type StyledLayer = GuitarChordLayer | PianoLayer;

export function isStyledLayer(layer: AnyLayer): layer is StyledLayer {
  return layer.type === 'chords' || layer.type === 'piano';
}

function updateStyledLayer(song: Song, layerId: string, fn: (layer: StyledLayer) => StyledLayer): Song {
  return updateAnyLayer(song, layerId, (layer) => (isStyledLayer(layer) ? (fn(layer) as typeof layer) : layer));
}

/**
 * Switch a chords layer between playing its chords together (strum / one
 * strike) and one note at a time (pick / arpeggio). Chords, voicings,
 * timing, velocity, patterns, volume and mute are all kept.
 */
export function setLayerStyle(song: Song, layerId: string, style: ChordStyle): Song {
  return updateStyledLayer(song, layerId, (layer) => (layer.style === style ? layer : { ...layer, style }));
}

/** The layer's default pick / arpeggio pattern. */
export function setLayerArp(song: Song, layerId: string, arp: ArpPattern): Song {
  return updateStyledLayer(song, layerId, (layer) => ({ ...layer, arp }));
}

/** Give one chord its own style, or (null) hand it back to the layer's. */
export function setChordStyleOverride(song: Song, layerId: string, eventId: string, override: ChordStyleOverride | null): Song {
  return updateEvent(song, layerId, eventId, (e) => {
    if (e.kind !== 'chord' && e.kind !== 'piano') return e;
    const { styleOverride: _old, ...rest } = e;
    return override ? { ...rest, styleOverride: override } : rest;
  });
}

function cloneEvent<E extends AnyEvent>(event: E): E {
  const copy = structuredCloneJson(event);
  return { ...copy, id: newId(event.kind.slice(0, 1)) };
}

function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Duplicate any layer directly after its source, preserving its musical data. */
export function duplicateLayer(song: Song, layerId: string): Song {
  const source = findAnyLayer(song, layerId);
  if (!source) return song;
  const label = source.name.replace(/ \d+$/, '');
  const duplicate = {
    ...structuredCloneJson(source),
    id: newId('layer'),
    name: nextLayerName(song, label),
    events: (source.events as AnyEvent[]).map(cloneEvent),
  } as AnyLayer;
  const insertAfter = <L extends AnyLayer>(layers: L[]): L[] => {
    const i = layers.findIndex((l) => l.id === layerId);
    if (i < 0) return layers;
    const next = [...layers];
    next.splice(i + 1, 0, duplicate as L);
    return next;
  };
  return {
    ...song,
    guitar: { ...song.guitar, layers: insertAfter(song.guitar.layers) },
    piano: { ...song.piano, layers: insertAfter(song.piano.layers) },
    drums: { ...song.drums, layers: insertAfter(song.drums.layers) },
  };
}

export function createNoteEvent(midi: number, start: number, duration: number, velocity = DEFAULT_VELOCITY): NoteEvent {
  return { kind: 'note', id: newId('n'), midi, start, duration, velocity };
}

/** A guitar chord picked from the key: the standard chord in its default guitar voicing. */
export function createGuitarChord(
  root: PitchClass,
  quality: ChordQuality,
  start: number,
  duration: number,
  velocity = DEFAULT_VELOCITY,
): ChordEvent {
  return { kind: 'chord', id: newId('c'), root, quality, strings: defaultVoicing(root, quality), start, duration, velocity };
}

// ---- generic immutable helpers -------------------------------------------

export function findLayer(song: Song, layerId: string): GuitarLayer | undefined {
  return song.guitar.layers.find((l) => l.id === layerId);
}

/** A piano *chords* layer. */
export function findPianoLayer(song: Song, layerId: string): PianoLayer | undefined {
  return song.piano.layers.find((l): l is PianoLayer => l.id === layerId && l.type === 'piano');
}

export function findDrumLayer(song: Song, layerId: string): DrumLayer | undefined {
  return song.drums.layers.find((l) => l.id === layerId);
}

/** Every layer of every instrument. Layer ids are unique across instruments. */
export function allLayers(song: Song): AnyLayer[] {
  return [...song.guitar.layers, ...song.piano.layers, ...song.drums.layers];
}

/** Layers with pitched material (everything but drums), for key inference. */
function pitchedLayers(song: Song): (GuitarLayer | AnyPianoLayer)[] {
  return [...song.guitar.layers, ...song.piano.layers];
}

export function findAnyLayer(song: Song, layerId: string): AnyLayer | undefined {
  return allLayers(song).find((l) => l.id === layerId);
}

/** Apply `fn` to the layer with this id, whichever instrument it belongs to. */
export function updateAnyLayer(song: Song, layerId: string, fn: <L extends AnyLayer>(layer: L) => L): Song {
  const map = <L extends AnyLayer>(layers: L[]): L[] | null =>
    layers.some((l) => l.id === layerId) ? layers.map((l) => (l.id === layerId ? fn(l) : l)) : null;
  const guitar = map(song.guitar.layers);
  if (guitar) return { ...song, guitar: { ...song.guitar, layers: guitar } };
  const piano = map(song.piano.layers);
  if (piano) return { ...song, piano: { ...song.piano, layers: piano } };
  const drums = map(song.drums.layers);
  if (drums) return { ...song, drums: { ...song.drums, layers: drums } };
  return song;
}

export function updateLayer(song: Song, layerId: string, fn: (layer: GuitarLayer) => GuitarLayer): Song {
  if (!findLayer(song, layerId)) return song;
  return updateAnyLayer(song, layerId, (l) => fn(l as GuitarLayer) as typeof l);
}

/** Update a piano chords layer. */
export function updatePianoLayer(song: Song, layerId: string, fn: (layer: PianoLayer) => PianoLayer): Song {
  if (!findPianoLayer(song, layerId)) return song;
  return updateAnyLayer(song, layerId, (l) => fn(l as PianoLayer) as typeof l);
}

/** Append a new layer to the instrument it belongs to. */
export function appendLayer(song: Song, layer: AnyLayer): Song {
  switch (layerInstrument(layer)) {
    case 'piano':
      return { ...song, piano: { ...song.piano, layers: [...song.piano.layers, layer as AnyPianoLayer] } };
    case 'drums':
      return { ...song, drums: { ...song.drums, layers: [...song.drums.layers, layer as DrumLayer] } };
    default:
      return { ...song, guitar: { ...song.guitar, layers: [...song.guitar.layers, layer as GuitarLayer] } };
  }
}

export function removeLayer(song: Song, layerId: string): Song {
  return {
    ...song,
    guitar: { ...song.guitar, layers: song.guitar.layers.filter((l) => l.id !== layerId) },
    piano: { ...song.piano, layers: song.piano.layers.filter((l) => l.id !== layerId) },
    drums: { ...song.drums, layers: song.drums.layers.filter((l) => l.id !== layerId) },
  };
}

export function toggleLayerMute(song: Song, layerId: string): Song {
  return updateAnyLayer(song, layerId, (l) => ({ ...l, muted: !l.muted }));
}

function sortEvents<T extends AnyEvent>(events: T[]): T[] {
  return [...events].sort((a, b) => a.start - b.start);
}

/** Which kind of event a layer holds. */
function acceptsEvent(layer: AnyLayer, event: AnyEvent): boolean {
  switch (layer.type) {
    case 'single':
    case 'pianoNotes':
      return event.kind === 'note';
    case 'chords':
      return event.kind === 'chord';
    case 'piano':
      return event.kind === 'piano';
    case 'drums':
      return event.kind === 'drum';
  }
}

export function addEvent(song: Song, layerId: string, event: AnyEvent): Song {
  return updateAnyLayer(song, layerId, (layer) =>
    acceptsEvent(layer, event) ? { ...layer, events: sortEvents([...(layer.events as AnyEvent[]), event]) } : layer,
  );
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

/** Apply a new time signature, resizing per-bar patterns (strums, custom arpeggios) to match. */
export function applyTimeSignature(song: Song, ts: TimeSignature): Song {
  const fresh = defaultStrumPattern(ts);
  const resizeOverride = <E extends { styleOverride?: ChordStyleOverride }>(e: E): E =>
    e.styleOverride ? { ...e, styleOverride: { ...e.styleOverride, arp: resizeArp(e.styleOverride.arp, ts) } } : e;
  const guitar = song.guitar.layers.map((layer): GuitarLayer => {
    if (layer.type !== 'chords') return layer;
    return {
      ...layer,
      strumPattern: resizePattern(layer.strumPattern, fresh.length, (i) => fresh[i]),
      arp: resizeArp(layer.arp, ts),
      events: layer.events.map(resizeOverride),
    };
  });
  const piano = song.piano.layers.map((layer): AnyPianoLayer =>
    layer.type === 'piano' ? { ...layer, arp: resizeArp(layer.arp, ts), events: layer.events.map(resizeOverride) } : layer,
  );
  return { ...song, timeSignature: ts, guitar: { ...song.guitar, layers: guitar }, piano: { ...song.piano, layers: piano } };
}

/** The MIDI pitches an event sounds (none for drums). */
export function eventPitches(ev: AnyEvent): number[] {
  switch (ev.kind) {
    case 'note':
      return [ev.midi];
    case 'chord':
      return soundingNotes(ev.strings).map((n) => n.midi);
    case 'piano':
      return ev.notes;
    case 'drum':
      return [];
  }
}

/** Pitch-class histogram weighted by duration, for key inference. Drums have no pitch. */
export function pitchClassHistogram(song: Song): number[] {
  const hist = new Array<number>(12).fill(0);
  for (const layer of pitchedLayers(song)) {
    for (const ev of layer.events as AnyEvent[]) {
      if (ev.kind === 'note') {
        hist[pitchClassOf(ev.midi)] += ev.duration;
      } else if (ev.kind === 'chord' || ev.kind === 'piano') {
        // Chords: the root counts fully, each sounding tone counts half.
        hist[ev.root] += ev.duration;
        for (const midi of eventPitches(ev)) hist[pitchClassOf(midi)] += ev.duration * 0.5;
      }
    }
  }
  return hist;
}

/** Pitch classes present in committed material (notes and sounding chord tones). */
export function usedPitchClasses(song: Song): Set<number> {
  const out = new Set<number>();
  for (const layer of pitchedLayers(song)) {
    for (const ev of layer.events as AnyEvent[]) for (const midi of eventPitches(ev)) out.add(pitchClassOf(midi));
  }
  return out;
}

/**
 * Distinct chords committed across every guitar and piano layer (root +
 * major/minor). Legacy guitar seed notes and hand-edited 'custom' voicings
 * are not chords; a chord with extra wheel notes counts as the standard chord
 * it was built from. The same chord on several layers counts once — "used"
 * is a yes/no.
 */
export function usedChords(song: Song): Triad[] {
  const seen = new Map<string, Triad>();
  for (const layer of pitchedLayers(song)) {
    for (const ev of layer.events as AnyEvent[]) {
      if (ev.kind !== 'chord' && ev.kind !== 'piano') continue;
      if (ev.quality !== 'major' && ev.quality !== 'minor') continue;
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
export function eventRootPitchClass(event: AnyEvent): PitchClass | null {
  if (event.kind === 'drum') return null;
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

/** Whether Play loops the loop region (on unless the user switched it off). */
export function isLoopOn(song: Song): boolean {
  return song.loopOff !== true;
}

export function setLoopOn(song: Song, on: boolean): Song {
  const { loopOff: _old, ...rest } = song;
  return on ? rest : { ...rest, loopOff: true };
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
