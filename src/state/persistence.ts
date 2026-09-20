import { del, get, set } from 'idb-keyval';
import type { Song } from '../model/types';

/**
 * Local persistence via IndexedDB (idb-keyval). One key holds the current
 * song; a future "songs list" can live alongside it without a migration.
 */
const SONG_KEY = 'quicksong:song:v1';

export async function loadSong(): Promise<Song | null> {
  try {
    const stored = await get<Song>(SONG_KEY);
    if (stored && stored.version === 1 && stored.guitar) return stored;
    return null;
  } catch (err) {
    console.warn('QuickSong: could not load saved song', err);
    return null;
  }
}

let pending: ReturnType<typeof setTimeout> | null = null;
let latest: Song | null = null;

/** Debounced save so rapid edits (drags, hums) do not hammer IndexedDB. */
export function saveSongDebounced(song: Song, delayMs = 250): void {
  latest = song;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    if (latest) void set(SONG_KEY, latest).catch((err) => console.warn('QuickSong: save failed', err));
  }, delayMs);
}

export async function clearSavedSong(): Promise<void> {
  await del(SONG_KEY);
}
