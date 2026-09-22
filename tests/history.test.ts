import { beforeEach, describe, expect, it } from 'vitest';
import * as engine from '../src/audio/engine';
engine.initAudioEngine(() => ({ noteOn() {}, allNotesOff() {} }));
import { describeChange } from '../src/model/labels';
import { createPianoLayer } from '../src/model/piano';
import {
  appendLayer,
  applyTimeSignature,
  createLayer,
  createSong,
  removeLayer,
  toggleLayerMute,
} from '../src/model/song';
import { evenPhraseBars } from '../src/model/time';
import {
  addChordAtCursor,
  changeEventDuration,
  insertAtCursor,
  moveEvent,
  setEventVelocity,
  shiftNotePitch,
  toggleChordNote,
} from '../src/state/actions';
import { sameData, useStore } from '../src/state/store';

beforeEach(() => {
  useStore.setState({ ...useStore.getInitialState(), hydrated: true });
});

function openPianoLayer(): string {
  const layer = createPianoLayer(useStore.getState().song);
  useStore.getState().commit((s) => appendLayer(s, layer));
  useStore.getState().setView({ name: 'pianoLayer', layerId: layer.id });
  return layer.id;
}

describe('undo history only records real changes', () => {
  it('edits that change nothing leave no Undo step', () => {
    const layerId = openPianoLayer();
    const id = addChordAtCursor(layerId, 2, 'major')!;
    const steps = () => useStore.getState().past.length;
    const before = steps();

    moveEvent(layerId, id, 0); // already at 0
    moveEvent(layerId, id, -1); // clamps to 0
    setEventVelocity(layerId, id, 0.8); // already 0.8
    toggleChordNote(layerId, id, 6); // F# is a chord tone: no-op
    useStore.getState().commit((s) => ({ ...s, bpm: s.bpm }));
    expect(steps()).toBe(before);

    changeEventDuration(layerId, id, -0.5);
    expect(steps()).toBe(before + 1);
    expect(useStore.getState().future).toEqual([]);
  });

  it('shifting a guitar note past the pitch limit adds no step', () => {
    const layer = createLayer('single', useStore.getState().song);
    useStore.getState().commit((s) => appendLayer(s, layer));
    useStore.getState().setView({ name: 'layer', layerId: layer.id });
    const id = insertAtCursor(layer.id, 24)!; // lowest allowed pitch
    const before = useStore.getState().past.length;
    shiftNotePitch(layer.id, id, -1);
    expect(useStore.getState().past.length).toBe(before);
  });

  it('sameData compares song JSON structurally', () => {
    const song = createSong();
    expect(sameData(song, structuredClone(song))).toBe(true);
    expect(sameData(song, { ...song, bpm: 101 })).toBe(false);
    expect(sameData({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameData([1, 2], { 0: 1, 1: 2 })).toBe(false);
  });
});

describe('describeChange: what Undo / Redo tells the user', () => {
  it('names settings, layers and events', () => {
    const base = createSong();
    expect(describeChange(base, { ...base, bpm: 104 })).toBe('Tempo 100 → 104');
    expect(describeChange(base, applyTimeSignature(base, { beatsPerBar: 3, beatUnit: 4 }))).toBe('Time signature 4/4 → 3/4');

    const layer = createPianoLayer(base);
    const withLayer = appendLayer(base, layer);
    expect(describeChange(base, withLayer)).toBe('Add layer Piano Chords 1');
    expect(describeChange(withLayer, removeLayer(withLayer, layer.id))).toBe('Delete layer Piano Chords 1');
    expect(describeChange(withLayer, toggleLayerMute(withLayer, layer.id))).toBe('Mute Piano Chords 1');

    useStore.setState({ ...useStore.getInitialState(), song: withLayer, view: { name: 'pianoLayer', layerId: layer.id } });
    const id = addChordAtCursor(layer.id, 2, 'major')!;
    const withChord = useStore.getState().song;
    expect(describeChange(withLayer, withChord)).toBe('Add D · Piano Chords 1');
    toggleChordNote(layer.id, id, 1);
    expect(describeChange(withChord, useStore.getState().song)).toBe('Edit Dmaj7 · Piano Chords 1');
    const beforeMove = useStore.getState().song;
    moveEvent(layer.id, id, 2);
    expect(describeChange(beforeMove, useStore.getState().song)).toBe('Move Dmaj7 · Piano Chords 1');
  });
});

describe('evenPhraseBars', () => {
  it('rounds a loop up to the next even phrase length', () => {
    expect([1, 2, 3, 4, 5, 8, 9].map(evenPhraseBars)).toEqual([1, 2, 4, 4, 8, 8, 16]);
  });
});
