import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPianoPreview, renderSong } from '../src/audio/render';
import { buildKeyWheel } from '../src/model/keyWheel';
import { chordName } from '../src/model/music';
import {
  createPianoChord,
  createPianoLayer,
  duplicatePianoLayer,
  pianoAddedPitchClasses,
  pianoChordName,
  pianoChordNotes,
  pianoPalette,
  setPianoChord,
  togglePianoNote,
} from '../src/model/piano';
import { isPristineSong, type ProjectRecord } from '../src/model/projects';
import {
  addEvent,
  appendLayer,
  buildChord,
  createLayer,
  createSeedChord,
  createSong,
  findPianoLayer,
  removeLayer,
  setAutoKeyPreference,
  setKeyTonality,
  setManualKey,
  toggleLayerMute,
  usedChords,
  usedPitchClasses,
} from '../src/model/song';
import { songBars } from '../src/model/time';
import type { PianoEvent, Song } from '../src/model/types';
import { flushPendingSave, loadProject, loadProjectIndex, memoryStorage, saveProject, setStorage } from '../src/state/persistence';
import { useStore } from '../src/state/store';

// Editing actions talk to the audio engine for previews; stub it and watch what they ask for.
import * as engine from '../src/audio/engine';
const audio = engine.initAudioEngine(() => ({ noteOn() {}, allNotesOff() {} }));
const play = vi.spyOn(audio, 'play').mockResolvedValue();
import {
  addPianoChord,
  changePianoChord,
  cursorAfterEvent,
  deleteEvent,
  moveEvent,
  setEventDuration,
  setEventVelocity,
  togglePianoChordNote,
} from '../src/state/actions';

const names = (song: Song) => pianoPalette(song).chords.map((c) => chordName(c.root, c.quality));

function songWithPianoLayer(): { song: Song; layerId: string } {
  const song = createSong();
  const layer = createPianoLayer(song);
  return { song: appendLayer(song, layer), layerId: layer.id };
}

describe('piano palette: the chords that belong to the key', () => {
  it('lists the diatonic major/minor chords of a manual key, without the diminished chord', () => {
    const song = setManualKey(createSong(), { tonic: 0, quality: 'major' });
    expect(names(song)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am']);
    expect(pianoPalette(song).guessed).toBe(false);
  });

  it('works for other keys, major and minor', () => {
    expect(names(setManualKey(createSong(), { tonic: 2, quality: 'major' }))).toEqual(['D', 'Em', 'F#m', 'G', 'A', 'Bm']);
    expect(names(setManualKey(createSong(), { tonic: 9, quality: 'minor' }))).toEqual(['Am', 'C', 'Dm', 'Em', 'F', 'G']);
  });

  it('Auto with nothing committed starts from C major, or A minor when the toggle says minor', () => {
    const song = createSong();
    expect(pianoPalette(song).key).toEqual({ tonic: 0, quality: 'major' });
    expect(pianoPalette(song).guessed).toBe(true);
    expect(names(setKeyTonality(song, 'minor'))[0]).toBe('Am');
  });

  it('Auto follows the assumed key: an Auto preference, or inference from committed material', () => {
    let { song, layerId } = songWithPianoLayer();
    song = addEvent(song, layerId, createPianoChord(2, 'major', 0, 4)); // D F# A
    song = addEvent(song, layerId, createPianoChord(7, 'major', 4, 4)); // G B D
    song = addEvent(song, layerId, createPianoChord(9, 'major', 8, 4)); // A C# E
    const palette = pianoPalette(song);
    expect(palette.guessed).toBe(false);
    expect(palette.key).toEqual({ tonic: 2, quality: 'major' });

    const preferred = setAutoKeyPreference(song, { tonic: 11, quality: 'minor' });
    expect(names(preferred)).toEqual(['Bm', 'D', 'Em', 'F#m', 'G', 'A']);
  });
});

describe('piano chords are real notes', () => {
  it('voices a standard chord in root position around middle C', () => {
    expect(pianoChordNotes(0, 'major')).toEqual([60, 64, 67]); // C4 E4 G4
    expect(pianoChordNotes(2, 'major')).toEqual([62, 66, 69]); // D4 F#4 A4
    expect(pianoChordNotes(9, 'minor')).toEqual([57, 60, 64]); // A3 C4 E4
    const chord = createPianoChord(2, 'major', 4, 2, 0.5);
    expect(chord).toMatchObject({ kind: 'piano', root: 2, quality: 'major', notes: [62, 66, 69], start: 4, duration: 2, velocity: 0.5 });
  });

  it('adding a wheel note keeps the original notes and stacks the new pitch on top', () => {
    const d = createPianoChord(2, 'major', 0, 4);
    const dMaj7 = togglePianoNote(d, 1); // C#
    expect(dMaj7.notes).toEqual([62, 66, 69, 73]); // D F# A C#
    expect(dMaj7.notes.slice(0, 3)).toEqual(d.notes);
    expect(pianoAddedPitchClasses(dMaj7)).toEqual([1]);
    expect(dMaj7.root).toBe(2);
    expect(dMaj7.quality).toBe('major');
    expect(pianoChordName(dMaj7)).toBe('Dmaj7');
  });

  it('toggling an added note removes it again; chord tones are never removed', () => {
    const d = createPianoChord(2, 'major', 0, 4);
    const dMaj7 = togglePianoNote(d, 1);
    expect(togglePianoNote(dMaj7, 1).notes).toEqual(d.notes);
    expect(togglePianoNote(d, 6)).toBe(d); // F# is part of D major
  });

  it('names common extensions and falls back to plain notes otherwise', () => {
    const am = createPianoChord(9, 'minor', 0, 4);
    expect(pianoChordName(am)).toBe('Am');
    expect(pianoChordName(togglePianoNote(am, 7))).toBe('Am7');
    const c = createPianoChord(0, 'major', 0, 4);
    expect(pianoChordName(togglePianoNote(c, 2))).toBe('Cadd9');
    expect(pianoChordName(togglePianoNote(togglePianoNote(c, 10), 2))).toBe('C9');
    expect(pianoChordName(togglePianoNote(c, 6))).toBe('C + F#');
  });

  it('changing the chord keeps timing and feel but starts from the plain chord', () => {
    const d = { ...togglePianoNote(createPianoChord(2, 'major', 3, 1.5, 0.3), 1), id: 'x' };
    const g = setPianoChord(d, 7, 'major');
    expect(g).toMatchObject({ id: 'x', root: 7, quality: 'major', notes: [55, 59, 62], start: 3, duration: 1.5, velocity: 0.3 });
  });
});

describe('piano in the song', () => {
  it('feeds key inference and the Circle of Fifths like any other material', () => {
    let { song, layerId } = songWithPianoLayer();
    song = addEvent(song, layerId, togglePianoNote(createPianoChord(2, 'major', 0, 4), 1));
    expect([...usedPitchClasses(song)].sort((a, b) => a - b)).toEqual([1, 2, 6, 9]);
    expect(usedChords(song)).toEqual([{ root: 2, quality: 'major' }]);
    const wheel = buildKeyWheel(song);
    expect(wheel.cells.find((c) => c.ring === 'major' && c.triad.root === 2)!.chordState).toBe('usedDiatonic');
  });

  it('extends the timeline so piano material is never clipped', () => {
    let { song, layerId } = songWithPianoLayer();
    song = addEvent(song, layerId, createPianoChord(0, 'major', 8, 4));
    expect(songBars(song)).toBe(3);
  });

  it('layers can be muted, removed and duplicated independently', () => {
    let { song, layerId } = songWithPianoLayer();
    song = addEvent(song, layerId, createPianoChord(0, 'major', 0, 4));
    song = duplicatePianoLayer(song, layerId);
    const [a, b] = song.piano.layers;
    expect(b.name).toBe('Piano 2');
    expect(b.id).not.toBe(a.id);
    expect(b.events[0].id).not.toBe(a.events[0].id);
    expect(b.events[0].notes).toEqual(a.events[0].notes);
    expect(b.events[0].notes).not.toBe(a.events[0].notes);

    song = toggleLayerMute(song, b.id);
    expect(song.piano.layers.map((l) => l.muted)).toEqual([false, true]);
    song = removeLayer(song, a.id);
    expect(song.piano.layers.map((l) => l.id)).toEqual([b.id]);
  });
});

describe('piano playback rendering', () => {
  it('strikes every chord note at the same instant, held for the sustain', () => {
    let { song, layerId } = songWithPianoLayer();
    const dMaj7 = { ...togglePianoNote(createPianoChord(2, 'major', 2, 1.5, 0.4), 1) };
    song = addEvent(song, layerId, dMaj7);
    const notes = renderSong(song);
    expect(notes.map((n) => n.midi)).toEqual([62, 66, 69, 73]);
    for (const n of notes) {
      expect(n).toMatchObject({ layerId, eventId: dMaj7.id, beat: 2, durationBeats: 1.5, offsetSec: 0, velocity: 0.4, gain: 0.9 });
    }
    expect(renderPianoPreview(dMaj7).every((n) => n.offsetSec === 0)).toBe(true);
  });

  it('plays alongside guitar and respects layer mute', () => {
    let song = createSong();
    const guitar = createLayer('strum', song);
    song = appendLayer(song, guitar);
    song = addEvent(song, guitar.id, buildChord(createSeedChord(57, 0, 4), 'minor'));
    const piano = createPianoLayer(song);
    song = appendLayer(song, piano);
    song = addEvent(song, piano.id, createPianoChord(9, 'minor', 0, 4));
    song = toggleLayerMute(song, piano.id);
    const notes = renderSong(song);
    expect(notes.filter((n) => n.layerId === guitar.id).length).toBeGreaterThan(0);
    const pianoNotes = notes.filter((n) => n.layerId === piano.id);
    expect(pianoNotes).toHaveLength(3);
    expect(pianoNotes.every((n) => n.gain === 0)).toBe(true);
  });
});

describe('piano editing with undo / redo', () => {
  function openPianoLayer(): string {
    const { song, commit, setView } = useStore.getState();
    const layer = createPianoLayer(song);
    commit((s) => appendLayer(s, layer));
    setView({ name: 'pianoLayer', layerId: layer.id });
    return layer.id;
  }
  const event = (layerId: string, id: string) =>
    findPianoLayer(useStore.getState().song, layerId)!.events.find((e) => e.id === id) as PianoEvent;

  beforeEach(() => {
    useStore.setState({ ...useStore.getInitialState(), hydrated: true });
    play.mockClear();
  });

  it('adds a chord a bar long at the cursor and selects it; Next chord goes after it', () => {
    const layerId = openPianoLayer();
    const id = addPianoChord(layerId, 0, 'major')!;
    expect(event(layerId, id)).toMatchObject({ notes: [60, 64, 67], start: 0, duration: 4 });
    expect(useStore.getState().selectedEventId).toBe(id);

    // The chord fills the only slot, so Next asks for another one explicitly.
    cursorAfterEvent(layerId, id);
    expect(useStore.getState().song.timelineBars).toBe(2);
    expect(useStore.getState().cursorBeat).toBe(4);
    expect(useStore.getState().selectedEventId).toBeNull();
    const next = addPianoChord(layerId, 7, 'major')!;
    expect(event(layerId, next).start).toBe(4);
    expect(event(layerId, id).duration).toBe(4);

    // A shorter sustain leaves room inside the song: no new slot.
    setEventDuration(layerId, next, 2);
    cursorAfterEvent(layerId, next);
    expect(useStore.getState().song.timelineBars).toBe(2);
    expect(useStore.getState().cursorBeat).toBe(6);
  });

  it('a new chord inside a ringing one lifts the earlier keys there', () => {
    const layerId = openPianoLayer();
    const first = addPianoChord(layerId, 0, 'major')!;
    useStore.getState().setCursor(2);
    addPianoChord(layerId, 5, 'major');
    expect(event(layerId, first).duration).toBe(2);
    useStore.getState().undo();
    expect(event(layerId, first).duration).toBe(4);
  });

  it('undoes and redoes wheel notes, chord changes, moves and deletes', () => {
    const layerId = openPianoLayer();
    const id = addPianoChord(layerId, 2, 'major')!;

    play.mockClear();
    togglePianoChordNote(layerId, id, 1);
    expect(event(layerId, id).notes).toEqual([62, 66, 69, 73]);
    // The edit is heard straight away, all notes together (no strum offset).
    expect(play.mock.calls.map(([midi]) => midi)).toEqual([62, 66, 69, 73]);
    expect(play.mock.calls.every(([, , , offset]) => offset === 0)).toBe(true);

    useStore.getState().undo();
    expect(event(layerId, id).notes).toEqual([62, 66, 69]);
    useStore.getState().redo();
    expect(event(layerId, id).notes).toEqual([62, 66, 69, 73]);

    togglePianoChordNote(layerId, id, 1);
    expect(event(layerId, id).notes).toEqual([62, 66, 69]);
    useStore.getState().undo();
    expect(event(layerId, id).notes).toEqual([62, 66, 69, 73]);

    changePianoChord(layerId, id, 11, 'minor');
    expect(event(layerId, id)).toMatchObject({ root: 11, quality: 'minor', notes: [59, 62, 66] });
    useStore.getState().undo();
    expect(pianoChordName(event(layerId, id))).toBe('Dmaj7');

    moveEvent(layerId, id, 2);
    expect(event(layerId, id).start).toBe(2);
    useStore.getState().undo();
    expect(event(layerId, id).start).toBe(0);

    deleteEvent(layerId, id);
    expect(event(layerId, id)).toBeUndefined();
    useStore.getState().undo();
    expect(event(layerId, id).notes).toEqual([62, 66, 69, 73]);
  });

  it('a velocity or sustain drag is one undo step; separate drags are separate steps', () => {
    const layerId = openPianoLayer();
    const id = addPianoChord(layerId, 0, 'major')!;
    const before = useStore.getState().past.length;

    for (const v of [0.7, 0.6, 0.5, 0.4]) setEventVelocity(layerId, id, v, 'vel:1');
    expect(event(layerId, id).velocity).toBe(0.4);
    expect(useStore.getState().past.length).toBe(before + 1);

    for (const d of [3, 2, 1.5]) setEventDuration(layerId, id, d, 'sus:1');
    expect(event(layerId, id).duration).toBe(1.5);
    expect(useStore.getState().past.length).toBe(before + 2);

    setEventVelocity(layerId, id, 0.9, 'vel:2');
    expect(useStore.getState().past.length).toBe(before + 3);

    useStore.getState().undo();
    expect(event(layerId, id).velocity).toBe(0.4);
    useStore.getState().undo();
    expect(event(layerId, id).duration).toBe(4);
    useStore.getState().undo();
    expect(event(layerId, id).velocity).toBe(0.8);
    useStore.getState().redo();
    expect(event(layerId, id).velocity).toBe(0.4);
  });

  it('sustain never goes below one eighth-note step', () => {
    const layerId = openPianoLayer();
    const id = addPianoChord(layerId, 0, 'major')!;
    setEventDuration(layerId, id, 0);
    expect(event(layerId, id).duration).toBe(0.5);
  });
});

describe('piano persistence', () => {
  let storage = memoryStorage();

  beforeEach(() => {
    vi.useFakeTimers();
    storage = memoryStorage();
    setStorage(storage);
  });

  afterEach(async () => {
    await flushPendingSave();
    vi.useRealTimers();
    setStorage();
  });

  function record(song: Song, id = 'proj_p'): ProjectRecord {
    return { id, name: 'Piano song', song, createdAt: 1, updatedAt: 1 };
  }

  it('round-trips notes, velocity and sustain', async () => {
    let { song, layerId } = songWithPianoLayer();
    const chord = { ...togglePianoNote(createPianoChord(2, 'major', 1, 2.5, 0.35), 1) };
    song = addEvent(song, layerId, chord);
    await saveProject(record(song));
    const loaded = (await loadProject('proj_p'))!.song;
    expect(loaded.piano.layers[0].events[0]).toEqual(chord);
  });

  it('loads songs saved before Piano existed with an empty piano section', async () => {
    let song = createSong();
    const guitar = createLayer('strum', song);
    song = appendLayer(song, guitar);
    song = addEvent(song, guitar.id, buildChord(createSeedChord(57, 0, 4), 'minor'));
    const { piano: _dropped, ...old } = song;
    await storage.set('quicksong:project:v1:proj_old', record(old as Song, 'proj_old'));
    await storage.set('quicksong:projects:v1', [{ id: 'proj_old', name: 'Piano song', createdAt: 1, updatedAt: 1 }]);

    const loaded = (await loadProject('proj_old'))!.song;
    expect(loaded.piano).toEqual({ layers: [] });
    expect(loaded.guitar).toEqual(song.guitar);
    expect(renderSong(loaded).length).toBeGreaterThan(0);
    expect(await loadProjectIndex()).toHaveLength(1);
  });

  it('a legacy single song without piano migrates and stays pristine-aware', async () => {
    const { piano: _dropped, ...old } = createSong();
    expect(isPristineSong(old as Song)).toBe(true);
    await storage.set('quicksong:song:v1', old);
    const [meta] = await loadProjectIndex();
    expect((await loadProject(meta.id))!.song.piano).toEqual({ layers: [] });
  });

  it('a song with a piano layer is not pristine', () => {
    const { song } = songWithPianoLayer();
    expect(isPristineSong(song)).toBe(false);
  });
});
