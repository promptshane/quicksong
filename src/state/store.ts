import { create } from 'zustand';
import { createSong, reconcileKeyPreference } from '../model/song';
import { eighthBeats, songBeats } from '../model/time';
import type { Song } from '../model/types';
import { loadSong, saveSongDebounced } from './persistence';

export type View = { name: 'home' } | { name: 'guitar' } | { name: 'layer'; layerId: string };

const HISTORY_LIMIT = 200;

interface StoreState {
  song: Song;
  past: Song[];
  future: Song[];
  hydrated: boolean;

  view: View;
  selectedEventId: string | null;
  /** Insertion point / playback start, in beats. */
  cursorBeat: number;
  /** MIDI number of the keyboard's lowest key (48 = C3). */
  keyboardBase: number;
  /**
   * Layer-input Record state. OFF = keyboard and humming only preview;
   * ON = they commit events. Session-only: resets whenever the view changes
   * and is never persisted, because accidental recording is worse than
   * having to switch it on again.
   */
  recording: boolean;

  /**
   * Apply an editing action. `fn` receives the current song and returns the
   * next one; the previous song is pushed onto the undo stack.
   */
  commit: (fn: (song: Song) => Song) => void;
  /** Replace the song without touching history (hydration, drag preview). */
  replaceSong: (song: Song) => void;
  undo: () => void;
  redo: () => void;

  setView: (view: View) => void;
  select: (eventId: string | null) => void;
  setCursor: (beat: number) => void;
  setKeyboardBase: (midi: number) => void;
  setRecording: (on: boolean) => void;
}

/** Keep the cursor inside the (content-derived) song length. */
function clampCursor(cursorBeat: number, song: Song): number {
  return Math.max(0, Math.min(cursorBeat, songBeats(song) - eighthBeats(song.timeSignature)));
}

export const useStore = create<StoreState>((set, get) => ({
  song: createSong(),
  past: [],
  future: [],
  hydrated: false,

  view: { name: 'home' },
  selectedEventId: null,
  cursorBeat: 0,
  keyboardBase: 48,
  recording: false,

  commit: (fn) => {
    const { song, past, cursorBeat } = get();
    // Every edit may rule out a preferred Auto key; drop it in the same step.
    const next = reconcileKeyPreference(fn(song));
    if (next === song) return;
    set({
      song: next,
      past: [...past.slice(-(HISTORY_LIMIT - 1)), song],
      future: [],
      cursorBeat: clampCursor(cursorBeat, next),
    });
  },

  replaceSong: (song) => set({ song }),

  undo: () => {
    const { past, song, future } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({ song: previous, past: past.slice(0, -1), future: [song, ...future], cursorBeat: clampCursor(get().cursorBeat, previous) });
  },

  redo: () => {
    const { past, song, future } = get();
    if (future.length === 0) return;
    const [next, ...rest] = future;
    set({ song: next, past: [...past, song], future: rest, cursorBeat: clampCursor(get().cursorBeat, next) });
  },

  setView: (view) => set({ view, selectedEventId: null, recording: false }),
  select: (selectedEventId) => set({ selectedEventId }),
  setCursor: (cursorBeat) => set({ cursorBeat: clampCursor(cursorBeat, get().song) }),
  setKeyboardBase: (keyboardBase) => set({ keyboardBase }),
  setRecording: (recording) => set({ recording }),
}));

/** Load the saved song (if any) and start persisting changes. */
export async function hydrateStore(): Promise<void> {
  const saved = await loadSong();
  if (saved) useStore.setState({ song: saved, past: [], future: [] });
  useStore.setState({ hydrated: true });
  useStore.subscribe((state, prev) => {
    if (state.hydrated && state.song !== prev.song) saveSongDebounced(state.song);
  });
}

export const selectCanUndo = (s: StoreState) => s.past.length > 0;
export const selectCanRedo = (s: StoreState) => s.future.length > 0;
