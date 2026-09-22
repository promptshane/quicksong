import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cloneSong,
  duplicateName,
  isDefaultProjectName,
  isPristineSong,
  nextUntitledName,
  normalizeProjectName,
  uniqueProjectName,
} from '../src/model/projects';
import {
  addEvent,
  createGuitarChord,
  createLayer,
  createSong,
  findLayer,
} from '../src/model/song';
import type { ProjectRecord } from '../src/model/projects';
import type { Song } from '../src/model/types';
import {
  LEGACY_PROJECT_ID,
  flushPendingSave,
  hasPendingSave,
  loadProject,
  loadProjectIndex,
  memoryStorage,
  scheduleProjectSave,
  setStorage,
} from '../src/state/persistence';
import { hydrateStore, useStore } from '../src/state/store';

// Editing actions talk to the audio engine for previews; stub it out.
import * as engine from '../src/audio/engine';
engine.initAudioEngine(() => ({ noteOn() {}, allNotesOff() {} }));
import { addChordAtCursor, deleteEvent, insertAtCursor } from '../src/state/actions';

const LEGACY_KEY = 'quicksong:song:v1';
const INDEX_KEY = 'quicksong:projects:v1';

function songWithChord(): Song {
  let song = createSong();
  const layer = createLayer('chords', song);
  song = { ...song, guitar: { layers: [layer] } };
  return addEvent(song, layer.id, createGuitarChord(9, 'minor', 0, 4));
}

let storage = memoryStorage();

beforeEach(() => {
  vi.useFakeTimers();
  storage = memoryStorage();
  setStorage(storage);
  useStore.setState({ ...useStore.getInitialState() });
});

afterEach(async () => {
  await flushPendingSave();
  vi.useRealTimers();
  setStorage();
});

/** Let the debounced autosave fire and land. */
async function settleAutosave() {
  await vi.advanceTimersByTimeAsync(300);
  await flushPendingSave();
}

describe('project naming', () => {
  it('numbers default names deterministically', () => {
    expect(nextUntitledName([])).toBe('Untitled Project');
    expect(nextUntitledName(['Untitled Project'])).toBe('Untitled Project 2');
    expect(nextUntitledName(['Untitled Project', 'Untitled Project 2'])).toBe('Untitled Project 3');
    expect(nextUntitledName(['untitled project'])).toBe('Untitled Project 2');
    expect(nextUntitledName(['Untitled Project 2'])).toBe('Untitled Project');
  });

  it('names copies', () => {
    expect(duplicateName('Song', ['Song'])).toBe('Song Copy');
    expect(duplicateName('Song', ['Song', 'Song Copy'])).toBe('Song Copy 2');
    expect(duplicateName('Song Copy', ['Song', 'Song Copy'])).toBe('Song Copy Copy');
    expect(uniqueProjectName('X', ['X', 'X 2', 'X 3'])).toBe('X 4');
  });

  it('trims and rejects blank names', () => {
    expect(normalizeProjectName('  Riff  ')).toBe('Riff');
    expect(normalizeProjectName('   ')).toBeNull();
    expect(normalizeProjectName('')).toBeNull();
  });

  it('recognizes only untouched default projects as disposable candidates', () => {
    const song = createSong();
    expect(isPristineSong(song)).toBe(true);
    expect(isDefaultProjectName('Untitled Project')).toBe(true);
    expect(isDefaultProjectName('Untitled Project 12')).toBe(true);
    expect(isDefaultProjectName('My Song')).toBe(false);
    expect(isPristineSong({ ...song, bpm: 101 })).toBe(false);
    expect(isPristineSong({ ...song, timelineBars: 2 })).toBe(false);
  });

  it('cloneSong shares nothing with the source', () => {
    const song = songWithChord();
    const copy = cloneSong(song);
    expect(copy).toEqual(song);
    expect(copy).not.toBe(song);
    expect(copy.guitar.layers[0]).not.toBe(song.guitar.layers[0]);
    expect(copy.guitar.layers[0].events[0]).not.toBe(song.guitar.layers[0].events[0]);
  });
});

describe('legacy migration', () => {
  it('turns the old single song into exactly one "Untitled Project" and removes the legacy key', async () => {
    const legacy = songWithChord();
    await storage.set(LEGACY_KEY, legacy);
    const index = await loadProjectIndex();
    expect(index).toHaveLength(1);
    expect(index[0].name).toBe('Untitled Project');
    expect(index[0].id).toBe(LEGACY_PROJECT_ID);
    const record = await loadProject(index[0].id);
    expect(record!.song).toEqual(legacy);
    expect(storage.data.has(LEGACY_KEY)).toBe(false);
  });

  it('is idempotent across launches', async () => {
    await storage.set(LEGACY_KEY, songWithChord());
    await loadProjectIndex();
    await loadProjectIndex();
    await hydrateStore();
    expect(await loadProjectIndex()).toHaveLength(1);
    expect(useStore.getState().projects).toHaveLength(1);
  });

  it('does not duplicate even if the legacy key survives a partial migration', async () => {
    const legacy = songWithChord();
    await storage.set(LEGACY_KEY, legacy);
    await loadProjectIndex();
    // Simulate the delete step having failed: legacy key reappears.
    await storage.set(LEGACY_KEY, legacy);
    const index = await loadProjectIndex();
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe(LEGACY_PROJECT_ID);
  });

  it('fills in timelineBars for songs saved before explicit slots', async () => {
    const legacy = songWithChord() as Song & { timelineBars?: number };
    delete legacy.timelineBars;
    await storage.set(LEGACY_KEY, legacy);
    const [meta] = await loadProjectIndex();
    expect((await loadProject(meta.id))!.song.timelineBars).toBe(1);
  });

  it('starts empty with nothing saved and ignores junk under the legacy key', async () => {
    expect(await loadProjectIndex()).toEqual([]);
    await storage.set(LEGACY_KEY, { nope: true });
    expect(await loadProjectIndex()).toEqual([]);
  });
});

describe('project lifecycle in the store', () => {
  it('launches to the Projects screen with nothing open', async () => {
    await hydrateStore();
    const s = useStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.view).toEqual({ name: 'projects' });
    expect(s.activeProjectId).toBeNull();
    expect(s.projects).toEqual([]);
  });

  it('creates projects with unique stable ids and default names, opening each', async () => {
    await hydrateStore();
    const a = await useStore.getState().createProject();
    expect(useStore.getState().view).toEqual({ name: 'home' });
    expect(useStore.getState().activeProjectId).toBe(a);
    const b = await useStore.getState().createProject();
    expect(b).not.toBe(a);
    expect(useStore.getState().activeProjectId).toBe(b);
    const names = useStore.getState().projects.map((p) => p.name).sort();
    expect(names).toEqual(['Untitled Project', 'Untitled Project 2']);
    const stored = await loadProjectIndex();
    expect(stored.map((p) => p.id).sort()).toEqual([a, b].sort());
    expect(stored.every((p) => p.createdAt > 0 && p.updatedAt >= p.createdAt)).toBe(true);
  });

  it('discards a completely untouched Untitled Project on close', async () => {
    await hydrateStore();
    const id = await useStore.getState().createProject();
    expect(await loadProject(id)).not.toBeNull();
    await useStore.getState().closeProject();
    expect(useStore.getState().projects).toEqual([]);
    expect(await loadProject(id)).toBeNull();
  });

  it('prunes an abandoned untouched project on the next launch', async () => {
    await hydrateStore();
    const id = await useStore.getState().createProject();
    expect(await loadProject(id)).not.toBeNull();
    // Simulate killing/reopening the app without using the in-app Back control.
    await hydrateStore();
    expect(useStore.getState().projects).toEqual([]);
    expect(await loadProject(id)).toBeNull();
  });

  it('keeps an Untitled Project once any real song information changes', async () => {
    await hydrateStore();
    const id = await useStore.getState().createProject();
    useStore.getState().commit((s) => ({ ...s, bpm: 101 }));
    await settleAutosave();
    await useStore.getState().closeProject();
    expect(useStore.getState().projects.map((p) => p.id)).toEqual([id]);
    expect((await loadProject(id))!.song.bpm).toBe(101);
  });

  it('persists projects independently and switching loads the right song', async () => {
    await hydrateStore();
    const a = await useStore.getState().createProject();
    const layerA = createLayer('single', useStore.getState().song);
    useStore.getState().commit((s) => ({ ...s, guitar: { layers: [layerA] } }));
    useStore.getState().setView({ name: 'layer', layerId: layerA.id });
    insertAtCursor(layerA.id, 60);
    await settleAutosave();

    const b = await useStore.getState().createProject();
    expect(useStore.getState().song.guitar.layers).toHaveLength(0);
    useStore.getState().commit((s) => ({ ...s, bpm: 133 }));
    await settleAutosave();

    await useStore.getState().openProject(a);
    expect(useStore.getState().activeProjectId).toBe(a);
    expect(useStore.getState().song.bpm).toBe(100);
    expect(findLayer(useStore.getState().song, layerA.id)!.events).toHaveLength(1);

    await useStore.getState().openProject(b);
    expect(useStore.getState().song.bpm).toBe(133);
    expect(useStore.getState().song.guitar.layers).toHaveLength(0);

    expect((await loadProject(a))!.song.bpm).toBe(100);
    expect((await loadProject(b))!.song.bpm).toBe(133);
  });

  it('autosaves edits to the active project only', async () => {
    await hydrateStore();
    const a = await useStore.getState().createProject();
    const b = await useStore.getState().createProject();
    useStore.getState().commit((s) => ({ ...s, bpm: 88 }));
    await settleAutosave();
    expect((await loadProject(b))!.song.bpm).toBe(88);
    expect((await loadProject(a))!.song.bpm).toBe(100);
  });

  it('a pending debounced save follows its own project across a switch', async () => {
    await hydrateStore();
    const a = await useStore.getState().createProject();
    const b = await useStore.getState().createProject();
    await useStore.getState().openProject(a);
    useStore.getState().commit((s) => ({ ...s, bpm: 61 }));
    expect(hasPendingSave(a)).toBe(true);
    // Switch before the debounce fires. The save must land in A, never B.
    await useStore.getState().openProject(b);
    expect(hasPendingSave()).toBe(false);
    expect((await loadProject(a))!.song.bpm).toBe(61);
    expect((await loadProject(b))!.song.bpm).toBe(100);
    // ...and opening B did not itself schedule a save of B.
    await vi.advanceTimersByTimeAsync(1000);
    expect((await loadProject(b))!.updatedAt).toBe(useStore.getState().projects.find((p) => p.id === b)!.updatedAt);
  });

  it('scheduleProjectSave for a different project writes the earlier one instead of dropping it', async () => {
    await storage.set(INDEX_KEY, []);
    const mk = (id: string): ProjectRecord => ({ id, name: id, song: createSong(), createdAt: 1, updatedAt: 1 });
    await storage.set(`quicksong:project:v1:A`, mk('A'));
    await storage.set(`quicksong:project:v1:B`, mk('B'));
    scheduleProjectSave('A', { ...createSong(), bpm: 70 });
    scheduleProjectSave('B', { ...createSong(), bpm: 80 });
    await flushPendingSave();
    expect((await loadProject('A'))!.song.bpm).toBe(70);
    expect((await loadProject('B'))!.song.bpm).toBe(80);
  });

  it('autosave never touches undo/redo: delete, save, undo restores the chord', async () => {
    await hydrateStore();
    const id = await useStore.getState().createProject();
    const layer = createLayer('chords', useStore.getState().song);
    useStore.getState().commit((s) => ({ ...s, guitar: { layers: [layer] } }));
    useStore.getState().setView({ name: 'layer', layerId: layer.id });
    const chordId = addChordAtCursor(layer.id, 9, 'minor')!;
    await settleAutosave();
    const depth = useStore.getState().past.length;

    deleteEvent(layer.id, chordId);
    expect(findLayer(useStore.getState().song, layer.id)!.events).toHaveLength(0);
    await settleAutosave();
    expect(findLayer((await loadProject(id))!.song, layer.id)!.events).toHaveLength(0);
    // Persisting changed nothing about history.
    expect(useStore.getState().past).toHaveLength(depth + 1);
    expect(useStore.getState().future).toHaveLength(0);

    useStore.getState().undo();
    expect(useStore.getState().activeProjectId).toBe(id);
    const restored = findLayer(useStore.getState().song, layer.id)!.events;
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe(chordId);
    expect(useStore.getState().future).toHaveLength(1);
    // The restored state autosaves in turn.
    await settleAutosave();
    expect(findLayer((await loadProject(id))!.song, layer.id)!.events).toHaveLength(1);

    useStore.getState().redo();
    expect(findLayer(useStore.getState().song, layer.id)!.events).toHaveLength(0);
    await settleAutosave();
    expect(findLayer((await loadProject(id))!.song, layer.id)!.events).toHaveLength(0);
  });

  it('switching projects resets undo/redo and transient editing state', async () => {
    await hydrateStore();
    const a = await useStore.getState().createProject();
    useStore.getState().commit((s) => ({ ...s, bpm: 90 }));
    useStore.getState().commit((s) => ({ ...s, bpm: 95 }));
    useStore.getState().undo();
    useStore.getState().setRecording(true);
    useStore.getState().select('x');
    expect(useStore.getState().past).toHaveLength(1);
    expect(useStore.getState().future).toHaveLength(1);

    const b = await useStore.getState().createProject();
    const s = useStore.getState();
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([]);
    expect(s.recording).toBe(false);
    expect(s.selectedEventId).toBeNull();
    expect(s.cursorBeat).toBe(0);
    expect(s.view).toEqual({ name: 'home' });
    // Undo in B is a no-op and cannot reach into A.
    useStore.getState().undo();
    expect(useStore.getState().song.bpm).toBe(100);
    expect(useStore.getState().activeProjectId).toBe(b);
    expect((await loadProject(a))!.song.bpm).toBe(90);

    await useStore.getState().openProject(a);
    expect(useStore.getState().past).toEqual([]);
    expect(useStore.getState().song.bpm).toBe(90);
  });

  it('closeProject persists and returns to Projects with no active project', async () => {
    await hydrateStore();
    const id = await useStore.getState().createProject();
    useStore.getState().commit((s) => ({ ...s, bpm: 77 }));
    await useStore.getState().closeProject();
    const s = useStore.getState();
    expect(s.view).toEqual({ name: 'projects' });
    expect(s.activeProjectId).toBeNull();
    expect(s.past).toEqual([]);
    expect((await loadProject(id))!.song.bpm).toBe(77);
    // Editing the placeholder song while nothing is open never writes anywhere.
    useStore.getState().commit((song) => ({ ...song, bpm: 50 }));
    await settleAutosave();
    expect((await loadProject(id))!.song.bpm).toBe(77);
  });

  it('rename trims, rejects blanks, and preserves id and song', async () => {
    await hydrateStore();
    const id = await useStore.getState().createProject();
    useStore.getState().commit((s) => ({ ...s, bpm: 123 }));
    await useStore.getState().closeProject();
    expect(await useStore.getState().renameProject(id, '   ')).toBe(false);
    expect(await useStore.getState().renameProject(id, '  Blue Riff ')).toBe(true);
    expect(useStore.getState().projects.map((p) => [p.id, p.name])).toEqual([[id, 'Blue Riff']]);
    const record = await loadProject(id);
    expect(record!.id).toBe(id);
    expect(record!.name).toBe('Blue Riff');
    expect(record!.song.bpm).toBe(123);
  });

  it('duplicate makes an independent project and stays on Projects', async () => {
    await hydrateStore();
    const id = await useStore.getState().createProject();
    const layer = createLayer('chords', useStore.getState().song);
    useStore.getState().commit((s) => ({ ...s, guitar: { layers: [layer] } }));
    await useStore.getState().renameProject(id, 'Song');
    await useStore.getState().closeProject();

    const copyId = (await useStore.getState().duplicateProject(id))!;
    expect(copyId).not.toBe(id);
    expect(useStore.getState().view).toEqual({ name: 'projects' });
    expect(useStore.getState().activeProjectId).toBeNull();
    expect(useStore.getState().projects.map((p) => p.name).sort()).toEqual(['Song', 'Song Copy']);
    const copy2 = (await useStore.getState().duplicateProject(id))!;
    expect(useStore.getState().projects.find((p) => p.id === copy2)!.name).toBe('Song Copy 2');

    const source = (await loadProject(id))!;
    const copy = (await loadProject(copyId))!;
    expect(copy.song).toEqual(source.song);
    expect(copy.song).not.toBe(source.song);
    // Editing the copy leaves the source alone.
    await useStore.getState().openProject(copyId);
    useStore.getState().commit((s) => ({ ...s, bpm: 140, guitar: { layers: [] } }));
    await settleAutosave();
    expect((await loadProject(id))!.song.bpm).toBe(100);
    expect((await loadProject(id))!.song.guitar.layers).toHaveLength(1);
  });

  it('delete removes only that project, from storage and the list', async () => {
    await hydrateStore();
    const a = await useStore.getState().createProject();
    const b = await useStore.getState().createProject();
    const c = await useStore.getState().createProject();
    // Give C real information so closing it keeps the project.
    useStore.getState().commit((s) => ({ ...s, bpm: 101 }));
    await useStore.getState().closeProject();
    await useStore.getState().deleteProject(b);
    expect(useStore.getState().projects.map((p) => p.id).sort()).toEqual([a, c].sort());
    expect(await loadProject(b)).toBeNull();
    expect(await loadProject(a)).not.toBeNull();
    expect(await loadProject(c)).not.toBeNull();
    expect((await loadProjectIndex()).map((p) => p.id).sort()).toEqual([a, c].sort());
  });

  it('deleting the active project returns safely to Projects and drops its pending save', async () => {
    await hydrateStore();
    const a = await useStore.getState().createProject();
    useStore.getState().commit((s) => ({ ...s, bpm: 64 }));
    expect(hasPendingSave(a)).toBe(true);
    await useStore.getState().deleteProject(a);
    expect(hasPendingSave()).toBe(false);
    expect(useStore.getState().view).toEqual({ name: 'projects' });
    expect(useStore.getState().activeProjectId).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await loadProject(a)).toBeNull();
    expect(await loadProjectIndex()).toEqual([]);
  });

  it('opening a project that vanished from storage fails gracefully', async () => {
    await hydrateStore();
    const a = await useStore.getState().createProject();
    await useStore.getState().closeProject();
    await storage.del(`quicksong:project:v1:${a}`);
    expect(await useStore.getState().openProject(a)).toBe(false);
    expect(useStore.getState().view).toEqual({ name: 'projects' });
    expect(useStore.getState().projects).toEqual([]);
  });

  it('lists most recently updated first', async () => {
    await hydrateStore();
    const a = await useStore.getState().createProject();
    vi.setSystemTime(Date.now() + 1000);
    const b = await useStore.getState().createProject();
    // Keep B when closing it; untouched default projects are intentionally discarded.
    useStore.getState().commit((s) => ({ ...s, bpm: 101 }));
    await settleAutosave();
    await useStore.getState().closeProject();
    expect(useStore.getState().projects.map((p) => p.id)).toEqual([b, a]);
    vi.setSystemTime(Date.now() + 1000);
    await useStore.getState().openProject(a);
    useStore.getState().commit((s) => ({ ...s, bpm: 70 }));
    await settleAutosave();
    await useStore.getState().closeProject();
    expect(useStore.getState().projects.map((p) => p.id)).toEqual([a, b]);
  });
});
