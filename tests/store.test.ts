import { beforeEach, describe, expect, it } from 'vitest';
import { createLayer, findLayer, pitchClassHistogram } from '../src/model/song';
import { songBars } from '../src/model/time';
import type { StrumLayer } from '../src/model/types';
import { useStore } from '../src/state/store';

// Editing actions talk to the audio engine for previews; stub it out.
import * as engine from '../src/audio/engine';
engine.initAudioEngine(() => ({ noteOn() {}, allNotesOff() {} }));

import {
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

describe('timeline length follows content', () => {
  it('shrinks after deleting trailing events and pulls the cursor back in', () => {
    const layerId = addLayer('single');
    expect(songBars(useStore.getState().song)).toBe(1);
    insertAtCursor(layerId, 60); // beat 0 -> song is now 2 bars
    expect(songBars(useStore.getState().song)).toBe(2);
    useStore.getState().setCursor(7.5); // last slot of the empty bar
    const id = insertAtCursor(layerId, 62)!; // spills into bar 3
    expect(songBars(useStore.getState().song)).toBe(4);
    expect(useStore.getState().cursorBeat).toBe(8.5);
    deleteEvent(layerId, id);
    expect(songBars(useStore.getState().song)).toBe(2);
    expect(useStore.getState().cursorBeat).toBe(7.5); // pulled back inside the song
    useStore.getState().undo();
    expect(songBars(useStore.getState().song)).toBe(4);
  });

  it('never lets the cursor be set beyond the song', () => {
    addLayer('single');
    useStore.getState().setCursor(40);
    expect(useStore.getState().cursorBeat).toBe(3.5); // one bar of 4/4, last eighth
  });
});
