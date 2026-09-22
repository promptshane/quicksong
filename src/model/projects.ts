import { DEFAULT_ARP } from './arpeggio';
import { newId } from './ids';
import { defaultStrumPattern, reconcileKeyPreference } from './song';
import { eighthsPerBar, eighthsPerBeat } from './time';
import type { ArpPattern, ChordEvent, GuitarLayer, Song, StrumSlot, TimeSignature } from './types';

/**
 * Saved projects. A project is a named, independently persisted Song.
 * Everything here is pure; persistence lives in state/persistence.ts.
 */

/** What the Projects screen needs: enough to list and open, never the song. */
export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectRecord extends ProjectMeta {
  song: Song;
}

export const DEFAULT_PROJECT_NAME = 'Untitled Project';

/** Auto-generated untitled names are disposable until the song contains information. */
export function isDefaultProjectName(name: string): boolean {
  return /^Untitled Project(?: (?:[2-9]|[1-9]\d+))?$/.test(name.trim());
}

/**
 * True only when a song still matches a freshly created project in every
 * user-meaningful way. The song id is intentionally ignored.
 */
export function isPristineSong(song: Song): boolean {
  const defaultKey =
    song.key.mode === 'auto' &&
    song.key.tonality === undefined &&
    song.key.preference === undefined;
  return (
    song.bpm === 100 &&
    song.timeSignature.beatsPerBar === 4 &&
    song.timeSignature.beatUnit === 4 &&
    defaultKey &&
    song.timelineBars === 1 &&
    song.loopRegion === undefined &&
    song.loopOff === undefined &&
    song.guitar.layers.length === 0 &&
    (song.piano?.layers.length ?? 0) === 0 &&
    (song.drums?.layers.length ?? 0) === 0
  );
}

/** A default-named project with a pristine song carries no user information. */
export function isDisposableEmptyProject(project: Pick<ProjectRecord, 'name' | 'song'>): boolean {
  return isDefaultProjectName(project.name) && isPristineSong(project.song);
}

export function createProjectRecord(name: string, song: Song, now = Date.now()): ProjectRecord {
  return { id: newId('proj'), name, song, createdAt: now, updatedAt: now };
}

/**
 * First of "Base", "Base 2", "Base 3", … not already taken. Names are only
 * labels — ids identify projects — but fresh defaults should not collide.
 */
export function uniqueProjectName(base: string, taken: Iterable<string>): string {
  const names = new Set([...taken].map((n) => n.trim().toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
}

export function nextUntitledName(taken: Iterable<string>): string {
  return uniqueProjectName(DEFAULT_PROJECT_NAME, taken);
}

/** "Song" -> "Song Copy", then "Song Copy 2", … */
export function duplicateName(source: string, taken: Iterable<string>): string {
  return uniqueProjectName(`${source.trim()} Copy`, taken);
}

/** A trimmed name, or null when it would be blank. */
export function normalizeProjectName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Deep copy so two projects never share mutable song data. */
export function cloneSong(song: Song): Song {
  return typeof structuredClone === 'function' ? structuredClone(song) : (JSON.parse(JSON.stringify(song)) as Song);
}

/** An independent project with the same musical content. */
export function duplicateProjectRecord(source: ProjectRecord, taken: Iterable<string>, now = Date.now()): ProjectRecord {
  return createProjectRecord(duplicateName(source.name, taken), cloneSong(source.song), now);
}

/** Layer shapes saved before guitar chord layers had a playing style. */
interface LegacyChordEvent extends Omit<ChordEvent, 'styleOverride'> {
  pickPattern?: number[] | null;
}
type LegacyGuitarLayer =
  | { type: 'strum'; id: string; name: string; volume: number; muted: boolean; events: LegacyChordEvent[]; strumPattern: StrumSlot[] }
  | { type: 'picked'; id: string; name: string; volume: number; muted: boolean; events: LegacyChordEvent[]; pickPattern: number[] };

/**
 * An old picking order (guitar string numbers 6..1, one per beat) as a custom
 * arpeggio: strings count up from the low E, so string 6 is the lowest note.
 */
function pickOrderToArp(order: number[], ts: TimeSignature): ArpPattern {
  const steps: number[][] = Array.from({ length: eighthsPerBar(ts) }, () => []);
  order.forEach((string, beat) => {
    const slot = beat * eighthsPerBeat(ts);
    if (slot < steps.length) steps[slot] = [Math.max(0, 6 - string)];
  });
  return { preset: 'custom', rate: 'quarter', steps };
}

function migrateGuitarLayer(layer: GuitarLayer | LegacyGuitarLayer, ts: TimeSignature): GuitarLayer {
  if (layer.type === 'single' || layer.type === 'chords') return layer;
  const events = layer.events.map(({ pickPattern, ...event }): ChordEvent =>
    pickPattern ? { ...event, styleOverride: { style: 'arpeggio', arp: pickOrderToArp(pickPattern, ts) } } : event,
  );
  const base = { id: layer.id, name: layer.name, volume: layer.volume, muted: layer.muted, type: 'chords' as const, events };
  if (layer.type === 'strum') return { ...base, style: 'together', strumPattern: layer.strumPattern, arp: DEFAULT_ARP };
  return { ...base, style: 'arpeggio', strumPattern: defaultStrumPattern(ts), arp: pickOrderToArp(layer.pickPattern, ts) };
}

/**
 * Bring a stored song up to date. Guitar chord layers saved as "strummed" or
 * "picked" become chord layers whose style is strum or pick (a picking order
 * carries over as a custom pick pattern). Songs saved before Piano or Drums
 * existed get empty sections, and older piano chord layers play together. Songs saved before explicit timeline slots open at the
 * smallest size that still contains all material — no automatic extra empty
 * bar. Also drops an Auto key preference the material rules out.
 */
export function normalizeStoredSong(stored: Song): Song {
  let song = stored;
  const piano = (song as Partial<Song>).piano;
  if (!piano || !Array.isArray(piano.layers)) {
    song = { ...song, piano: { layers: [] } };
  }
  const drums = (song as Partial<Song>).drums;
  if (!drums || !Array.isArray(drums.layers)) {
    song = { ...song, drums: { layers: [] } };
  }
  const guitarLayers = song.guitar.layers as (GuitarLayer | LegacyGuitarLayer)[];
  if (guitarLayers.some((l) => l.type === 'strum' || l.type === 'picked')) {
    song = { ...song, guitar: { ...song.guitar, layers: guitarLayers.map((l) => migrateGuitarLayer(l, song.timeSignature)) } };
  }
  if (song.piano.layers.some((l) => l.type === 'piano' && !l.style)) {
    const layers = song.piano.layers.map((l) => (l.type === 'piano' && !l.style ? { ...l, style: 'together' as const, arp: DEFAULT_ARP } : l));
    song = { ...song, piano: { ...song.piano, layers } };
  }
  if (!Number.isFinite(song.timelineBars) || song.timelineBars < 1) {
    const perBar = song.timeSignature.beatsPerBar;
    let lastEnd = 0;
    for (const layer of [...song.guitar.layers, ...song.piano.layers, ...song.drums.layers]) {
      for (const event of layer.events) lastEnd = Math.max(lastEnd, event.start + event.duration);
    }
    song = { ...song, timelineBars: Math.max(1, Math.ceil(lastEnd / perBar - 1e-6)) };
  }
  return reconcileKeyPreference(song);
}

export function isStoredSong(value: unknown): value is Song {
  const song = value as Song | null;
  return !!song && song.version === 1 && !!song.guitar && Array.isArray(song.guitar.layers) && !!song.timeSignature;
}
