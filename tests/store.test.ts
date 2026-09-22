import { beforeEach, describe, expect, it } from 'vitest';
import { buildKeyWheel } from '../src/model/keyWheel';
import {
  createLayer,
  duplicateLayer,
  findLayer,
  pitchClassHistogram,
  setAutoKey,
  setAutoKeyPreference,
  setManualKey,
} from '../src/model/song';
import { songBars } from '../src/model/time';
import type { GuitarChordLayer } from '../src/model/types';
import { useStore } from '../src/state/store';

// Editing actions talk to the audio engine for previews; stub it out.
import * as engine from '../src/audio/engine';
engine.initAudioEngine(() => ({ noteOn() {}, allNotesOff() {} }));

import {
  addTimelineSlot,
  auditionNote,
  changeEventDuration,
  deleteEvent,
  addChordAtCursor,
  changeChord,
  insertAtCursor,
  moveEvent,
  setChordLayerStyle,
  setStrumSlot,
  shiftNotePitch,
  toggleChordNote,
} from '../src/state/actions';

function addLayer(type: 'single' | 'chords') {
  const { song, commit } = useStore.getState();
  const layer = createLayer(type, song);
  commit((s) => ({ ...s, guitar: { layers: [...s.guitar.layers, layer] } }));
  useStore.getState().setView({ name: 'layer', layerId: layer.id });
  return layer.id;
}

beforeEach(() => {
  useStore.setState({ ...useStore.getInitialState(), hydrated: true });
});

describe('undo / redo', () => {
  it('undoes and redoes note insertion', () => {
    const layerId = addLayer('single');
    insertAtCursor(layerId, 60);
    insertAtCursor(layerId, 64);
    const notes = () => findLayer(useStore.getState().song, layerId)!.events;
    expect(notes()).toHaveLength(2);
    expect(useStore.getState().cursorBeat).toBe(2);

    useStore.getState().undo();
    expect(notes()).toHaveLength(1);
    useStore.getState().undo();
    expect(notes()).toHaveLength(0);
    useStore.getState().redo();
    useStore.getState().redo();
    expect(notes().map((n) => (n.kind === 'note' ? n.midi : 0))).toEqual([60, 64]);
    useStore.getState().redo(); // no-op
    expect(notes()).toHaveLength(2);
  });

  it('covers guitar chord changes, wheel notes, pattern edits, moves and deletes', () => {
    const layerId = addLayer('chords');
    const id = addChordAtCursor(layerId, 9, 'minor')!; // Am from the key palette
    const chord = () => findLayer(useStore.getState().song, layerId)!.events.find((e) => e.id === id)!;
    const layer = () => findLayer(useStore.getState().song, layerId) as GuitarChordLayer;

    expect(chord()).toMatchObject({ kind: 'chord', root: 9, quality: 'minor' });
    changeChord(layerId, id, 5, 'major');
    expect(chord()).toMatchObject({ root: 5, quality: 'major' });
    useStore.getState().undo();
    expect(chord()).toMatchObject({ root: 9, quality: 'minor' });
    useStore.getState().redo();
    useStore.getState().undo();

    toggleChordNote(layerId, id, 7); // + G on the muted low E: Am7
    expect(chord().kind === 'chord' && chord().strings[0].muted).toBe(false);
    useStore.getState().undo();
    expect(chord().kind === 'chord' && chord().strings[0].muted).toBe(true);

    setStrumSlot(layerId, 1);
    expect(layer().strumPattern[1]).toBe('down');
    setStrumSlot(layerId, 1);
    expect(layer().strumPattern[1]).toBe('up');
    useStore.getState().undo();
    expect(layer().strumPattern[1]).toBe('down');

    moveEvent(layerId, id, 2);
    expect(chord().start).toBe(2);
    changeEventDuration(layerId, id, -0.5);
    expect(chord().duration).toBe(3.5);
    deleteEvent(layerId, id);
    expect(layer().events).toHaveLength(0);
    useStore.getState().undo();
    expect(layer().events).toHaveLength(1);
    useStore.getState().undo();
    expect(chord().duration).toBe(4);
    useStore.getState().undo();
    expect(chord().start).toBe(0);
  });

  it('clears the redo stack on a new edit', () => {
    const layerId = addLayer('single');
    insertAtCursor(layerId, 60);
    useStore.getState().undo();
    insertAtCursor(layerId, 62);
    expect(useStore.getState().future).toHaveLength(0);
  });

  it('shifts pitch and octave', () => {
    const layerId = addLayer('single');
    const id = insertAtCursor(layerId, 60)!;
    shiftNotePitch(layerId, id, 12);
    shiftNotePitch(layerId, id, -1);
    const note = findLayer(useStore.getState().song, layerId)!.events[0];
    expect(note.kind === 'note' && note.midi).toBe(71);
  });

  it('lifts the previous chord when a new one is added inside it', () => {
    const layerId = addLayer('chords');
    addChordAtCursor(layerId, 9, 'minor'); // bar 1, 4 beats
    useStore.getState().setCursor(2);
    addChordAtCursor(layerId, 2, 'minor');
    const events = findLayer(useStore.getState().song, layerId)!.events;
    expect(events.map((e) => [e.start, e.duration])).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });
});

describe('layer duplication and chord playing style', () => {
  it('duplicates a chord layer independently and switches strum/pick without losing chords', () => {
    const layerId = addLayer('chords');
    addChordAtCursor(layerId, 9, 'minor');

    useStore.getState().commit((song) => duplicateLayer(song, layerId));
    let layers = useStore.getState().song.guitar.layers;
    expect(layers).toHaveLength(2);
    expect(layers.map((layer) => layer.name)).toEqual(['Guitar Chords 1', 'Guitar Chords 2']);

    const original = layers[0];
    const duplicate = layers[1];
    expect(duplicate.id).not.toBe(original.id);
    expect(duplicate.events).toHaveLength(1);
    expect(duplicate.events[0].id).not.toBe(original.events[0].id);
    expect(duplicate.events[0]).toMatchObject({
      kind: 'chord',
      start: original.events[0].start,
      duration: original.events[0].duration,
      velocity: original.events[0].velocity,
    });
    if (duplicate.events[0].kind === 'chord' && original.events[0].kind === 'chord') {
      expect(duplicate.events[0].quality).toBe('minor');
      expect(duplicate.events[0].root).toBe(original.events[0].root);
      expect(duplicate.events[0].strings).toEqual(original.events[0].strings);
      expect(duplicate.events[0].strings).not.toBe(original.events[0].strings);
    }

    setChordLayerStyle(duplicate.id, 'arpeggio');
    layers = useStore.getState().song.guitar.layers;
    const [a, b] = layers as GuitarChordLayer[];
    expect(a.style).toBe('together');
    expect(b.style).toBe('arpeggio');
    expect(b.name).toBe('Guitar Chords 2'); // the name is the user's label; style does not rename
    expect(b.events.map((e) => e.id)).toEqual([duplicate.events[0].id]);
    expect(b.strumPattern).toEqual(a.strumPattern); // switching back later keeps the strum
    useStore.getState().undo();
    expect((useStore.getState().song.guitar.layers[1] as GuitarChordLayer).style).toBe('together');
  });
});

describe('preview vs record', () => {
  it('auditioning a note never touches the song, history or key inference', () => {
    const layerId = addLayer('single');
    const before = useStore.getState();
    auditionNote(61);
    auditionNote(66);
    const after = useStore.getState();
    expect(after.song).toBe(before.song);
    expect(after.past).toBe(before.past);
    expect(after.future).toBe(before.future);
    expect(after.cursorBeat).toBe(before.cursorBeat);
    expect(pitchClassHistogram(after.song)).toEqual(new Array(12).fill(0));
    expect(findLayer(after.song, layerId)!.events).toHaveLength(0);
  });

  it('recording a key adds exactly one history entry', () => {
    const layerId = addLayer('single');
    const depth = useStore.getState().past.length;
    insertAtCursor(layerId, 60);
    expect(useStore.getState().past).toHaveLength(depth + 1);
    expect(pitchClassHistogram(useStore.getState().song)[0]).toBe(1);
  });

  it('Record resets to OFF when the view changes', () => {
    const layerId = addLayer('single');
    useStore.getState().setRecording(true);
    expect(useStore.getState().recording).toBe(true);
    useStore.getState().setView({ name: 'guitar' });
    expect(useStore.getState().recording).toBe(false);
    useStore.getState().setView({ name: 'layer', layerId });
    expect(useStore.getState().recording).toBe(false);
  });
});

describe('explicit timeline slots', () => {
  it('only grows when the user adds a slot and preserves empty slots', () => {
    const layerId = addLayer('single');
    expect(songBars(useStore.getState().song)).toBe(1);

    insertAtCursor(layerId, 60);
    expect(songBars(useStore.getState().song)).toBe(1); // no automatic trailing bar

    addTimelineSlot();
    expect(songBars(useStore.getState().song)).toBe(2);
    expect(useStore.getState().cursorBeat).toBe(4); // start of the new slot

    const id = insertAtCursor(layerId, 62)!;
    expect(songBars(useStore.getState().song)).toBe(2);

    addTimelineSlot();
    expect(songBars(useStore.getState().song)).toBe(3);
    expect(useStore.getState().cursorBeat).toBe(8);

    deleteEvent(layerId, id);
    expect(songBars(useStore.getState().song)).toBe(3); // explicit empty slots remain
    useStore.getState().undo();
    expect(songBars(useStore.getState().song)).toBe(3);
  });

  it('never lets the cursor be set beyond the created slots', () => {
    addLayer('single');
    useStore.getState().setCursor(40);
    expect(useStore.getState().cursorBeat).toBe(3.5); // one 4/4 slot, last eighth
    addTimelineSlot();
    useStore.getState().setCursor(40);
    expect(useStore.getState().cursorBeat).toBe(7.5);
  });
});

describe('Auto key preference in the store', () => {
  /** A long C chord then a short G chord: C major inferred, G major still plausible. */
  function recordCThenG(layerId: string) {
    const c = addChordAtCursor(layerId, 0, 'major')!;
    changeEventDuration(layerId, c, 8);
    const g = addChordAtCursor(layerId, 7, 'major')!;
    changeEventDuration(layerId, g, -3);
  }

  it('tapping a plausible key keeps Auto and survives compatible edits', () => {
    const layerId = addLayer('chords');
    recordCThenG(layerId);
    const { commit } = useStore.getState();
    expect(buildKeyWheel(useStore.getState().song).assumed).toEqual({ tonic: 0, quality: 'major' });

    commit((s) => setAutoKeyPreference(s, { tonic: 7, quality: 'major' }));
    let wheel = buildKeyWheel(useStore.getState().song);
    expect(useStore.getState().song.key.mode).toBe('auto');
    expect(wheel.assumed).toEqual({ tonic: 7, quality: 'major' });
    expect(wheel.preferred).toBe(true);

    // Em fits both C and G major: preference stays.
    addChordAtCursor(layerId, 4, 'minor');
    wheel = buildKeyWheel(useStore.getState().song);
    expect(wheel.assumed).toEqual({ tonic: 7, quality: 'major' });
    expect(wheel.preferred).toBe(true);
  });

  it('is dropped by commit when committed material makes it impossible, and undo brings it back', () => {
    const layerId = addLayer('chords');
    recordCThenG(layerId);
    useStore.getState().commit((s) => setAutoKeyPreference(s, { tonic: 7, quality: 'major' }));

    // F has no place in G major: the preference goes with that very commit.
    addChordAtCursor(layerId, 5, 'major');
    let song = useStore.getState().song;
    expect(song.key).toEqual({ mode: 'auto', tonality: 'major' });
    expect(buildKeyWheel(song).assumed).toEqual({ tonic: 0, quality: 'major' });

    // Undo restores the state that still had the preference.
    useStore.getState().undo();
    song = useStore.getState().song;
    expect(song.key).toMatchObject({ mode: 'auto', preference: { tonic: 7, quality: 'major' } });
    expect(buildKeyWheel(song).assumed).toEqual({ tonic: 7, quality: 'major' });
  });

  it('a preview never disturbs the preference', () => {
    const layerId = addLayer('chords');
    recordCThenG(layerId);
    useStore.getState().commit((s) => setAutoKeyPreference(s, { tonic: 7, quality: 'major' }));
    const before = useStore.getState().song;
    auditionNote(53); // F would rule G major out — but previews are not evidence
    auditionNote(66);
    expect(useStore.getState().song).toBe(before);
    expect(buildKeyWheel(useStore.getState().song).assumed).toEqual({ tonic: 7, quality: 'major' });
  });

  it('manual key still works as before and is untouched by material', () => {
    const layerId = addLayer('chords');
    useStore.getState().commit((s) => setManualKey(s, { tonic: 9, quality: 'minor' }));
    recordCThenG(layerId);
    addChordAtCursor(layerId, 6, 'major'); // F# major: outside A minor entirely
    const song = useStore.getState().song;
    expect(song.key).toEqual({ mode: 'manual', tonic: 9, quality: 'minor' });
    const wheel = buildKeyWheel(song);
    expect(wheel.mode).toBe('manual');
    expect(wheel.assumed).toEqual({ tonic: 9, quality: 'minor' });
    expect(wheel.plausible).toEqual([{ tonic: 9, quality: 'minor' }]);
    expect(wheel.cells.find((c) => c.triad.root === 6 && c.triad.quality === 'major')!.chordState).toBe('usedBorrowed');

    useStore.getState().commit(setAutoKey);
    expect(useStore.getState().song.key).toEqual({ mode: 'auto', tonality: 'minor' });
  });
});
