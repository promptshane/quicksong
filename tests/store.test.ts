import { beforeEach, describe, expect, it } from 'vitest';
import { buildKeyWheel } from '../src/model/keyWheel';
import {
  convertChordLayerType,
  createLayer,
  duplicateLayer,
  findLayer,
  pitchClassHistogram,
  setAutoKey,
  setAutoKeyPreference,
  setManualKey,
} from '../src/model/song';
import { songBars } from '../src/model/time';
import type { StrumLayer } from '../src/model/types';
import { useStore } from '../src/state/store';

// Editing actions talk to the audio engine for previews; stub it out.
import * as engine from '../src/audio/engine';
engine.initAudioEngine(() => ({ noteOn() {}, allNotesOff() {} }));

import {
  addTimelineSlot,
  auditionNote,
  changeEventDuration,
  deleteEvent,
  insertAtCursor,
  makeChord,
  moveEvent,
  setStrumSlot,
  shiftNotePitch,
  toggleStringMute,
} from '../src/state/actions';

function addLayer(type: 'single' | 'strum' | 'picked') {
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

  it('covers chord conversion, string edits, pattern edits, moves and deletes', () => {
    const layerId = addLayer('strum');
    const id = insertAtCursor(layerId, 57)!;
    const chord = () => findLayer(useStore.getState().song, layerId)!.events.find((e) => e.id === id)!;
    const layer = () => findLayer(useStore.getState().song, layerId) as StrumLayer;

    expect(chord().kind).toBe('chord');
    makeChord(layerId, id, 'minor');
    expect(chord().kind === 'chord' && chord().quality).toBe('minor');
    useStore.getState().undo();
    expect(chord().kind === 'chord' && chord().quality).toBe('note');
    useStore.getState().redo();
    expect(chord().kind === 'chord' && chord().quality).toBe('minor');

    toggleStringMute(layerId, id, 0); // enable low E on Am
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

  it('truncates the previous chord when a new one is inserted inside it', () => {
    const layerId = addLayer('strum');
    insertAtCursor(layerId, 57); // bar 1, 4 beats
    useStore.getState().setCursor(2);
    insertAtCursor(layerId, 62);
    const events = findLayer(useStore.getState().song, layerId)!.events;
    expect(events.map((e) => [e.start, e.duration])).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });
});

describe('layer duplication and chord playback type', () => {
  it('duplicates a chord layer independently and switches strum/picked without losing chords', () => {
    const layerId = addLayer('strum');
    const eventId = insertAtCursor(layerId, 57)!;
    makeChord(layerId, eventId, 'minor');

    useStore.getState().commit((song) => duplicateLayer(song, layerId));
    let layers = useStore.getState().song.guitar.layers;
    expect(layers).toHaveLength(2);
    expect(layers.map((layer) => layer.name)).toEqual(['Strummed Chords 1', 'Strummed Chords 2']);

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

    useStore.getState().commit((song) => convertChordLayerType(song, duplicate.id, 'picked'));
    layers = useStore.getState().song.guitar.layers;
    expect(layers[0].type).toBe('strum');
    expect(layers[1].type).toBe('picked');
    expect(layers[1].name).toBe('Picked Chords 1');
    expect(layers[1].events).toHaveLength(1);
    expect(layers[1].events[0].id).toBe(duplicate.events[0].id);
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
    const c = insertAtCursor(layerId, 60)!;
    makeChord(layerId, c, 'major');
    changeEventDuration(layerId, c, 8);
    const g = insertAtCursor(layerId, 55)!;
    makeChord(layerId, g, 'major');
    changeEventDuration(layerId, g, -3);
  }

  it('tapping a plausible key keeps Auto and survives compatible edits', () => {
    const layerId = addLayer('strum');
    recordCThenG(layerId);
    const { commit } = useStore.getState();
    expect(buildKeyWheel(useStore.getState().song).assumed).toEqual({ tonic: 0, quality: 'major' });

    commit((s) => setAutoKeyPreference(s, { tonic: 7, quality: 'major' }));
    let wheel = buildKeyWheel(useStore.getState().song);
    expect(useStore.getState().song.key.mode).toBe('auto');
    expect(wheel.assumed).toEqual({ tonic: 7, quality: 'major' });
    expect(wheel.preferred).toBe(true);

    // Em fits both C and G major: preference stays.
    const em = insertAtCursor(layerId, 52)!;
    makeChord(layerId, em, 'minor');
    wheel = buildKeyWheel(useStore.getState().song);
    expect(wheel.assumed).toEqual({ tonic: 7, quality: 'major' });
    expect(wheel.preferred).toBe(true);
  });

  it('is dropped by commit when committed material makes it impossible, and undo brings it back', () => {
    const layerId = addLayer('strum');
    recordCThenG(layerId);
    useStore.getState().commit((s) => setAutoKeyPreference(s, { tonic: 7, quality: 'major' }));

    // Even the seed note F has no place in G major: the preference goes with
    // that very commit, before the chord is built.
    const f = insertAtCursor(layerId, 53)!;
    let song = useStore.getState().song;
    expect(song.key).toEqual({ mode: 'auto', tonality: 'major' });
    makeChord(layerId, f, 'major');
    song = useStore.getState().song;
    expect(song.key).toEqual({ mode: 'auto', tonality: 'major' });
    expect(buildKeyWheel(song).assumed).toEqual({ tonic: 0, quality: 'major' });

    // Undoing both steps restores the state that still had the preference.
    useStore.getState().undo();
    useStore.getState().undo();
    song = useStore.getState().song;
    expect(song.key).toMatchObject({ mode: 'auto', preference: { tonic: 7, quality: 'major' } });
    expect(buildKeyWheel(song).assumed).toEqual({ tonic: 7, quality: 'major' });
  });

  it('a preview never disturbs the preference', () => {
    const layerId = addLayer('strum');
    recordCThenG(layerId);
    useStore.getState().commit((s) => setAutoKeyPreference(s, { tonic: 7, quality: 'major' }));
    const before = useStore.getState().song;
    auditionNote(53); // F would rule G major out — but previews are not evidence
    auditionNote(66);
    expect(useStore.getState().song).toBe(before);
    expect(buildKeyWheel(useStore.getState().song).assumed).toEqual({ tonic: 7, quality: 'major' });
  });

  it('manual key still works as before and is untouched by material', () => {
    const layerId = addLayer('strum');
    useStore.getState().commit((s) => setManualKey(s, { tonic: 9, quality: 'minor' }));
    recordCThenG(layerId);
    const f = insertAtCursor(layerId, 66)!; // F# major: outside A minor entirely
    makeChord(layerId, f, 'major');
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
