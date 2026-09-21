import { create } from 'zustand';
import {
  createProjectRecord,
  duplicateProjectRecord,
  isDisposableEmptyProject,
  nextUntitledName,
  normalizeProjectName,
  type ProjectMeta,
} from '../model/projects';
import { createSong, reconcileKeyPreference } from '../model/song';
import { eighthBeats, songBeats } from '../model/time';
import type { Song } from '../model/types';
import {
  cancelPendingSave,
  deleteProjectRecord,
  flushPendingSave,
  loadProject,
  loadProjectIndex,
  pruneDisposableProjects,
  renameProjectRecord,
  saveProject,
  scheduleProjectSave,
} from './persistence';

export type View = { name: 'projects' } | { name: 'home' } | { name: 'guitar' } | { name: 'layer'; layerId: string };

const HISTORY_LIMIT = 200;

interface StoreState {
  /** Every saved project, most recently updated first. Never includes song data. */
  projects: ProjectMeta[];
  /** The project `song` belongs to; null on the Projects screen. */
  activeProjectId: string | null;
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

  /** Flush the current project's pending save, then load another one. */
  openProject: (id: string) => Promise<boolean>;
  /** New project with default settings, opened immediately. Returns its id. */
  createProject: () => Promise<string>;
  /** Persist and return to the Projects screen. */
  closeProject: () => Promise<void>;
  renameProject: (id: string, name: string) => Promise<boolean>;
  /** Independent copy; stays on the Projects screen. Returns the new id. */
  duplicateProject: (id: string) => Promise<string | null>;
  deleteProject: (id: string) => Promise<void>;
}

/** Keep the cursor inside the (content-derived) song length. */
function clampCursor(cursorBeat: number, song: Song): number {
  return Math.max(0, Math.min(cursorBeat, songBeats(song) - eighthBeats(song.timeSignature)));
}

function byRecent(projects: ProjectMeta[]): ProjectMeta[] {
  return [...projects].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
}

/** Everything that belongs to one editing session and must not leak into the next project. */
function freshSession(song: Song, activeProjectId: string | null, view: View) {
  return {
    song,
    activeProjectId,
    past: [] as Song[],
    future: [] as Song[],
    view,
    selectedEventId: null,
    cursorBeat: 0,
    recording: false,
  };
}

export const useStore = create<StoreState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  song: createSong(),
  past: [],
  future: [],
  hydrated: false,

  view: { name: 'projects' },
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

  openProject: async (id) => {
    await flushPendingSave();
    const record = await loadProject(id);
    if (!record) {
      // Gone from storage: drop it from the list rather than opening nothing.
      set({ projects: get().projects.filter((p) => p.id !== id) });
      return false;
    }
    set(freshSession(record.song, record.id, { name: 'home' }));
    return true;
  },

  createProject: async () => {
    await flushPendingSave();
    const record = createProjectRecord(nextUntitledName(get().projects.map((p) => p.name)), createSong());
    const projects = await saveProject(record);
    set({ projects: byRecent(projects), ...freshSession(record.song, record.id, { name: 'home' }) });
    return record.id;
  },

  closeProject: async () => {
    const { activeProjectId, song, projects: currentProjects } = get();
    await flushPendingSave();

    // A freshly-created Untitled Project with no user information should not
    // survive simply because the user backed out of it.
    if (activeProjectId) {
      const meta = currentProjects.find((p) => p.id === activeProjectId);
      if (meta && isDisposableEmptyProject({ name: meta.name, song })) {
        await deleteProjectRecord(activeProjectId);
      }
    }

    const projects = byRecent(await loadProjectIndex());
    set({ projects, ...freshSession(createSong(), null, { name: 'projects' }) });
  },

  renameProject: async (id, rawName) => {
    const name = normalizeProjectName(rawName);
    if (!name) return false;
    const projects = await renameProjectRecord(id, name);
    if (!projects) return false;
    set({ projects: byRecent(projects) });
    return true;
  },

  duplicateProject: async (id) => {
    await flushPendingSave();
    const source = await loadProject(id);
    if (!source) return null;
    const copy = duplicateProjectRecord(source, get().projects.map((p) => p.name));
    const projects = await saveProject(copy);
    set({ projects: byRecent(projects) });
    return copy.id;
  },

  deleteProject: async (id) => {
    cancelPendingSave(id);
    const projects = byRecent(await deleteProjectRecord(id));
    if (get().activeProjectId === id) {
      set({ projects, ...freshSession(createSong(), null, { name: 'projects' }) });
    } else {
      set({ projects });
    }
  },
}));

let unsubscribeAutosave: (() => void) | null = null;

/**
 * Load the project list (migrating a legacy single song) and start
 * autosaving the active project's song. The app always starts on Projects.
 *
 * Autosave is persistence only: it watches `song` and never reads or writes
 * `past` / `future`, so undo and redo are unaffected by when a save lands.
 */
export async function hydrateStore(): Promise<void> {
  // Migrate legacy storage first, then discard any abandoned default project
  // whose song still contains absolutely no user information.
  await loadProjectIndex();
  const projects = byRecent(await pruneDisposableProjects());
  useStore.setState({ projects, ...freshSession(createSong(), null, { name: 'projects' }), hydrated: true });
  unsubscribeAutosave?.();
  unsubscribeAutosave = useStore.subscribe((state, prev) => {
    if (!state.hydrated || state.song === prev.song) return;
    // A change of active project swaps the song in wholesale; that is a load,
    // not an edit, so there is nothing to save.
    if (!state.activeProjectId || state.activeProjectId !== prev.activeProjectId) return;
    scheduleProjectSave(state.activeProjectId, state.song);
  });
}

export const selectCanUndo = (s: StoreState) => s.past.length > 0;
export const selectCanRedo = (s: StoreState) => s.future.length > 0;
export const selectActiveProject = (s: StoreState) => s.projects.find((p) => p.id === s.activeProjectId) ?? null;
