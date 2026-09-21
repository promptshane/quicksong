import { del, get, set } from 'idb-keyval';
import {
  DEFAULT_PROJECT_NAME,
  isStoredSong,
  normalizeStoredSong,
  uniqueProjectName,
  type ProjectMeta,
  type ProjectRecord,
} from '../model/projects';
import type { Song } from '../model/types';

/**
 * Local persistence via IndexedDB (idb-keyval).
 *
 * Layout:
 *   quicksong:projects:v1        ProjectMeta[]  — the index the Projects screen lists
 *   quicksong:project:v1:<id>    ProjectRecord  — one key per project, song included
 *   quicksong:song:v1            legacy single song; migrated once, then removed
 *
 * All writes go through one serial queue so an index read-modify-write can
 * never interleave with another (e.g. a debounced save landing mid-rename).
 */

const INDEX_KEY = 'quicksong:projects:v1';
const PROJECT_PREFIX = 'quicksong:project:v1:';
const LEGACY_SONG_KEY = 'quicksong:song:v1';
/** Fixed id for the migrated legacy song, so a retried migration overwrites instead of duplicating. */
export const LEGACY_PROJECT_ID = 'proj_legacy';

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

const idbStore: KeyValueStore = { get, set, del };

let storage: KeyValueStore = idbStore;

/** Swap the backing store (tests use an in-memory one). Resets pending saves. */
export function setStorage(store: KeyValueStore = idbStore): void {
  cancelPendingSave();
  storage = store;
}

/** In-memory KeyValueStore for tests. */
export function memoryStorage(initial: Record<string, unknown> = {}): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    data,
    async get<T>(key: string) {
      return data.get(key) as T | undefined;
    },
    async set(key, value) {
      // Mimic structured-clone semantics: stored data never aliases live objects.
      data.set(key, typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
    },
    async del(key) {
      data.delete(key);
    },
  };
}

function projectKey(id: string): string {
  return PROJECT_PREFIX + id;
}

// ---- serial write queue ---------------------------------------------------

let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readIndex(): Promise<ProjectMeta[]> {
  const index = await storage.get<ProjectMeta[]>(INDEX_KEY);
  return Array.isArray(index) ? index : [];
}

function toMeta(record: ProjectMeta): ProjectMeta {
  return { id: record.id, name: record.name, createdAt: record.createdAt, updatedAt: record.updatedAt };
}

async function upsertIndex(meta: ProjectMeta): Promise<ProjectMeta[]> {
  const index = await readIndex();
  const i = index.findIndex((p) => p.id === meta.id);
  const next = i < 0 ? [...index, meta] : index.map((p, j) => (j === i ? meta : p));
  await storage.set(INDEX_KEY, next);
  return next;
}

// ---- public API ------------------------------------------------------------

/**
 * The project list, migrating a legacy single song into a project first.
 * Migration is idempotent: the migrated project has a fixed id and the legacy
 * key is deleted afterwards, so a crash between the two steps just overwrites
 * the same project next launch instead of adding another.
 */
export function loadProjectIndex(): Promise<ProjectMeta[]> {
  return serialized(async () => {
    let index = await readIndex();
    const legacy = await storage.get<unknown>(LEGACY_SONG_KEY).catch(() => undefined);
    if (isStoredSong(legacy)) {
      const existing = index.find((p) => p.id === LEGACY_PROJECT_ID);
      const now = Date.now();
      const record: ProjectRecord = {
        id: LEGACY_PROJECT_ID,
        name: existing?.name ?? uniqueProjectName(DEFAULT_PROJECT_NAME, index.map((p) => p.name)),
        song: normalizeStoredSong(legacy),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await storage.set(projectKey(record.id), record);
      index = await upsertIndex(toMeta(record));
      await storage.del(LEGACY_SONG_KEY);
    }
    return index;
  });
}

export function loadProject(id: string): Promise<ProjectRecord | null> {
  return serialized(async () => {
    const record = await storage.get<ProjectRecord>(projectKey(id));
    if (!record || !isStoredSong(record.song)) return null;
    return { ...record, song: normalizeStoredSong(record.song) };
  });
}

/** Write a whole record and its index entry. */
export function saveProject(record: ProjectRecord): Promise<ProjectMeta[]> {
  return serialized(async () => {
    await storage.set(projectKey(record.id), record);
    return upsertIndex(toMeta(record));
  });
}

/** Write just the song of an existing project, bumping updatedAt. Missing project = no-op. */
export function saveProjectSong(id: string, song: Song, now = Date.now()): Promise<ProjectMeta[] | null> {
  return serialized(async () => {
    const record = await storage.get<ProjectRecord>(projectKey(id));
    if (!record) return null; // deleted while a save was pending
    const next = { ...record, song, updatedAt: now };
    await storage.set(projectKey(id), next);
    return upsertIndex(toMeta(next));
  });
}

export function renameProjectRecord(id: string, name: string, now = Date.now()): Promise<ProjectMeta[] | null> {
  return serialized(async () => {
    const record = await storage.get<ProjectRecord>(projectKey(id));
    if (!record) return null;
    const next = { ...record, name, updatedAt: now };
    await storage.set(projectKey(id), next);
    return upsertIndex(toMeta(next));
  });
}

export function deleteProjectRecord(id: string): Promise<ProjectMeta[]> {
  return serialized(async () => {
    await storage.del(projectKey(id));
    const index = (await readIndex()).filter((p) => p.id !== id);
    await storage.set(INDEX_KEY, index);
    return index;
  });
}

// ---- debounced autosave ----------------------------------------------------

interface PendingSave {
  projectId: string;
  song: Song;
  timer: ReturnType<typeof setTimeout>;
}

let pending: PendingSave | null = null;
let inFlight: Promise<unknown> = Promise.resolve();

function writePending(): Promise<unknown> {
  if (!pending) return inFlight;
  const { projectId, song, timer } = pending;
  clearTimeout(timer);
  pending = null;
  // Bound to the id and snapshot captured at schedule time: whatever project
  // is active by the time this runs, the write lands where the edit happened.
  inFlight = saveProjectSong(projectId, song).catch((err) => console.warn('QuickSong: save failed', err));
  return inFlight;
}

/**
 * Debounced save so rapid edits (drags, hums) do not hammer IndexedDB.
 * A pending save for a *different* project is written immediately rather
 * than replaced, so switching projects mid-debounce never loses an edit.
 */
export function scheduleProjectSave(projectId: string, song: Song, delayMs = 250): void {
  if (pending && pending.projectId !== projectId) void writePending();
  if (pending) clearTimeout(pending.timer);
  pending = { projectId, song, timer: setTimeout(() => void writePending(), delayMs) };
}

/** Write any pending save now and wait for every in-flight write to land. */
export async function flushPendingSave(): Promise<void> {
  await writePending();
  await queue;
}

/** Drop a pending save without writing it (only for a project being deleted). */
export function cancelPendingSave(projectId?: string): void {
  if (!pending) return;
  if (projectId && pending.projectId !== projectId) return;
  clearTimeout(pending.timer);
  pending = null;
}

export function hasPendingSave(projectId?: string): boolean {
  return !!pending && (!projectId || pending.projectId === projectId);
}

/** Test helper: wipe every project, the index and the legacy key. */
export async function clearAllProjects(): Promise<void> {
  cancelPendingSave();
  await serialized(async () => {
    for (const p of await readIndex()) await storage.del(projectKey(p.id));
    await storage.del(INDEX_KEY);
    await storage.del(LEGACY_SONG_KEY);
  });
}
