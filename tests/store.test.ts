import { beforeEach, describe, expect, it } from 'vitest';
import { createLayer, findLayer } from '../src/model/song';
import type { StrumLayer } from '../src/model/types';
import { useStore } from '../src/state/store';

// Editing actions talk to the audio engine for previews; stub it out.
import * as engine from '../src/audio/engine';
engine.initAudioEngine(() => ({ noteOn() {}, allNotesOff() {} }));

import {
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
