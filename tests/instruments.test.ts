import { beforeEach, describe, expect, it } from 'vitest';
import * as engine from '../src/audio/engine';
engine.initAudioEngine(() => ({ noteOn() {}, allNotesOff() {} }));
import { renderSong } from '../src/audio/render';
import { arpSteps, customize, toggleArpStep } from '../src/model/arpeggio';
import { DRUM_MIDI, createDrumLayer, toggleDrumHit } from '../src/model/drums';
import { createPianoChord, createPianoLayer, createPianoNotesLayer } from '../src/model/piano';
import { normalizeStoredSong } from '../src/model/projects';
import {
  addEvent,
  appendLayer,
  createGuitarChord,
  createLayer,
  createNoteEvent,
  createSong,
  duplicateLayer,
  findAnyLayer,
  pitchClassHistogram,
  setChordStyleOverride,
  setLayerStyle,
  usedPitchClasses,
} from '../src/model/song';
import { songBars } from '../src/model/time';
import type { DrumLayer, GuitarChordLayer, PianoLayer, Song, TimeSignature } from '../src/model/types';
import { insertAtCursor, toggleDrumCell } from '../src/state/actions';
import { useStore } from '../src/state/store';

const FOUR: TimeSignature = { beatsPerBar: 4, beatUnit: 4 };
const SIX_EIGHT: TimeSignature = { beatsPerBar: 6, beatUnit: 8 };

describe('arpeggio patterns', () => {
  it('presets adapt to the chord size, at eighth or quarter speed', () => {
    expect(arpSteps({ preset: 'up', rate: 'eighth' }, 3, FOUR)).toEqual([[0], [1], [2], [0], [1], [2], [0], [1]]);
    expect(arpSteps({ preset: 'down', rate: 'quarter' }, 3, FOUR)).toEqual([[2], [], [1], [], [0], [], [2], []]);
    expect(arpSteps({ preset: 'updown', rate: 'eighth' }, 4, FOUR)).toEqual([[0], [1], [2], [3], [2], [1], [0], [1]]);
    expect(arpSteps({ preset: 'bass', rate: 'quarter' }, 4, FOUR)).toEqual([[0], [], [1, 2, 3], [], [0], [], [1, 2, 3], []]);
    expect(arpSteps({ preset: 'up', rate: 'eighth' }, 3, SIX_EIGHT)).toHaveLength(6);
  });

  it('customize turns a preset into an editable grid; cells toggle', () => {
    const custom = customize({ preset: 'up', rate: 'quarter' }, 3, FOUR);
    expect(custom).toEqual({ preset: 'custom', rate: 'quarter', steps: [[0], [], [1], [], [2], [], [0], []] });
    const edited = toggleArpStep(custom, 1, 2, FOUR);
    expect(edited.steps![1]).toEqual([2]);
    expect(toggleArpStep(edited, 1, 2, FOUR).steps![1]).toEqual([]);
  });
});

function pianoSong(): { song: Song; layer: PianoLayer } {
  const song = createSong();
  const layer = createPianoLayer(song);
  return { song: appendLayer(song, layer), layer };
}

describe('chords played together or one note at a time', () => {
  it('piano: together is one strike; arpeggio plays the notes in turn and lets them ring', () => {
    const { song: base, layer } = pianoSong();
    let song = addEvent(base, layer.id, { ...createPianoChord(0, 'major', 0, 4), id: 'c' }); // C4 E4 G4
    expect(new Set(renderSong(song).map((n) => n.beat))).toEqual(new Set([0]));

    song = setLayerStyle(song, layer.id, 'arpeggio'); // default: up, eighths
    const notes = renderSong(song);
    expect(notes.map((n) => n.midi)).toEqual([60, 64, 67, 60, 64, 67, 60, 64]);
    expect(notes.map((n) => n.beat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(notes[0].durationBeats).toBe(4);
  });

  it('a single chord can override its layer', () => {
    let song = createSong();
    const layer = createLayer('chords', song) as GuitarChordLayer; // strum
    song = appendLayer(song, layer);
    song = addEvent(song, layer.id, { ...createGuitarChord(9, 'minor', 0, 4), id: 'am' });
    song = addEvent(song, layer.id, { ...createGuitarChord(5, 'major', 4, 4), id: 'f' });
    song = { ...song, timelineBars: 2 };
    song = setChordStyleOverride(song, layer.id, 'f', { style: 'arpeggio', arp: { preset: 'up', rate: 'quarter' } });

    const notes = renderSong(song);
    const am = notes.filter((n) => n.eventId === 'am');
    const f = notes.filter((n) => n.eventId === 'f');
    expect(am.some((n) => n.offsetSec > 0)).toBe(true); // strummed: staggered strings
    expect(f.map((n) => n.beat)).toEqual([4, 5, 6, 7]); // picked, one per beat
    expect(f.every((n) => n.offsetSec === 0)).toBe(true);

    song = setChordStyleOverride(song, layer.id, 'f', null);
    expect((findAnyLayer(song, layer.id) as GuitarChordLayer).events[1].styleOverride).toBeUndefined();
  });
});

describe('drums', () => {
  function drumSong(): { song: Song; layer: DrumLayer } {
    const song = createSong();
    const layer = createDrumLayer(song);
    return { song: appendLayer(song, layer), layer };
  }

  it('tapping a cell adds a hit, tapping it again removes it', () => {
    const { song: base, layer } = drumSong();
    let song = toggleDrumHit(base, layer.id, 'kick', 0);
    song = toggleDrumHit(song, layer.id, 'snare', 1);
    song = toggleDrumHit(song, layer.id, 'hat', 0.5);
    const hits = () => (findAnyLayer(song, layer.id) as DrumLayer).events.map((e) => [e.piece, e.start, e.duration]);
    expect(hits()).toEqual([
      ['kick', 0, 0.5],
      ['hat', 0.5, 0.5],
      ['snare', 1, 0.5],
    ]);
    song = toggleDrumHit(song, layer.id, 'snare', 1);
    expect(hits()).toHaveLength(2);
  });

  it('play on the drum kit, count toward song length, and never toward the key', () => {
    const { song: base, layer } = drumSong();
    let song = toggleDrumHit(base, layer.id, 'kick', 0);
    song = toggleDrumHit(song, layer.id, 'snare', 9); // bar 3
    const notes = renderSong(song);
    expect(notes.map((n) => [n.midi, n.instrument, n.beat])).toEqual([
      [DRUM_MIDI.kick, 'drums', 0],
      [DRUM_MIDI.snare, 'drums', 9],
    ]);
    expect(songBars(song)).toBe(3);
    expect(usedPitchClasses(song).size).toBe(0);
    expect(pitchClassHistogram(song).every((v) => v === 0)).toBe(true);
  });

  it('drum edits are undoable, and a drum layer duplicates like any other', () => {
    useStore.setState({ ...useStore.getInitialState(), hydrated: true });
    const layer = createDrumLayer(useStore.getState().song);
    useStore.getState().commit((s) => appendLayer(s, layer));
    toggleDrumCell(layer.id, 'kick', 0);
    toggleDrumCell(layer.id, 'kick', 2);
    expect(useStore.getState().song.drums.layers[0].events).toHaveLength(2);
    useStore.getState().undo();
    expect(useStore.getState().song.drums.layers[0].events).toHaveLength(1);

    const dup = duplicateLayer(useStore.getState().song, layer.id).drums.layers;
    expect(dup.map((l) => l.name)).toEqual(['Drums 1', 'Drums 2']);
    expect(dup[1].events[0].id).not.toBe(dup[0].events[0].id);
  });
});

describe('piano notes layers', () => {
  beforeEach(() => {
    useStore.setState({ ...useStore.getInitialState(), hydrated: true });
  });

  it('take keyboard notes like guitar single notes, and play them', () => {
    const layer = createPianoNotesLayer(useStore.getState().song);
    expect(layer.name).toBe('Piano Notes 1');
    useStore.getState().commit((s) => appendLayer(s, layer));
    useStore.getState().setView({ name: 'layer', layerId: layer.id });
    insertAtCursor(layer.id, 72);
    insertAtCursor(layer.id, 74);
    const song = useStore.getState().song;
    expect(renderSong(song).map((n) => [n.midi, n.beat])).toEqual([
      [72, 0],
      [74, 1],
    ]);
    expect(usedPitchClasses(song)).toEqual(new Set([0, 2]));
  });

  it('a chords layer does not take keyboard notes', () => {
    const layer = createPianoLayer(useStore.getState().song);
    useStore.getState().commit((s) => appendLayer(s, layer));
    expect(insertAtCursor(layer.id, 60)).toBeNull();
    expect(addEvent(useStore.getState().song, layer.id, createNoteEvent(60, 0, 1))).toEqual(useStore.getState().song);
  });
});

describe('opening songs saved before Chords / Notes / Drums', () => {
  it('strummed and picked guitar layers become chord layers with that style', () => {
    const base = createSong();
    const chord = createGuitarChord(9, 'minor', 0, 4);
    const legacy = {
      ...base,
      guitar: {
        layers: [
          { id: 's', type: 'strum', name: 'Strummed Chords 1', volume: 0.9, muted: false, strumPattern: ['down', null, 'up', null, 'down', null, 'up', null], events: [{ ...chord, id: 'a', pickPattern: null }] },
          { id: 'p', type: 'picked', name: 'Picked Chords 1', volume: 0.5, muted: true, pickPattern: [6, 4, 3, 2], events: [{ ...chord, id: 'b', pickPattern: [5, 1, 5, 1] }] },
        ],
      },
      piano: { layers: [{ id: 'k', type: 'piano', name: 'Piano 1', volume: 0.9, muted: false, events: [] }] },
    } as unknown as Song;
    delete (legacy as Partial<Song>).drums;

    const song = normalizeStoredSong(legacy);
    const [strum, picked] = song.guitar.layers as GuitarChordLayer[];
    expect(strum).toMatchObject({ type: 'chords', name: 'Strummed Chords 1', style: 'together', strumPattern: ['down', null, 'up', null, 'down', null, 'up', null] });
    expect(strum.events[0]).not.toHaveProperty('pickPattern');
    expect(picked).toMatchObject({ type: 'chords', name: 'Picked Chords 1', style: 'arpeggio', volume: 0.5, muted: true });
    expect(picked.arp).toEqual({ preset: 'custom', rate: 'quarter', steps: [[0], [], [2], [], [3], [], [4], []] });
    expect(picked.events[0].styleOverride).toEqual({
      style: 'arpeggio',
      arp: { preset: 'custom', rate: 'quarter', steps: [[1], [], [5], [], [1], [], [5], []] },
    });
    expect((song.piano.layers[0] as PianoLayer).style).toBe('together');
    expect(song.drums).toEqual({ layers: [] });
    expect(renderSong(song).length).toBeGreaterThan(0);
    expect(normalizeStoredSong(song)).toEqual(song); // idempotent
  });
});
