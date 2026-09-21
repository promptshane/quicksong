import { newId } from './ids';
import { reconcileKeyPreference } from './song';
import type { Song } from './types';

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
    song.guitar.layers.length === 0
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

/**
 * Bring a stored song up to date. Songs saved before explicit timeline slots
 * open at the smallest size that still contains all material — no automatic
 * extra empty bar. Also drops an Auto key preference the material rules out.
 */
export function normalizeStoredSong(stored: Song): Song {
  let song = stored;
  if (!Number.isFinite(song.timelineBars) || song.timelineBars < 1) {
    const perBar = song.timeSignature.beatsPerBar;
    let lastEnd = 0;
    for (const layer of song.guitar.layers) {
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
