import { describe, expect, it } from 'vitest';
import { renderSong } from '../src/audio/render';
import {
  addEvent,
  applyTimeSignature,
  createGuitarChord,
  createLayer,
  createNoteEvent,
  createSong,
} from '../src/model/song';
import { eighthsPerBar, songBars } from '../src/model/time';
import type { GuitarChordLayer } from '../src/model/types';

describe('renderSong', () => {
  it('renders single notes directly', () => {
    let song = createSong();
    const layer = createLayer('single', song);
    song = { ...song, guitar: { layers: [layer] } };
    song = addEvent(song, layer.id, createNoteEvent(60, 2, 1));
    song = addEvent(song, layer.id, createNoteEvent(62, 0, 0.5));
    const notes = renderSong(song);
    expect(notes.map((n) => [n.midi, n.beat, n.durationBeats])).toEqual([
      [62, 0, 0.5],
      [60, 2, 1],
    ]);
  });

  it('renders strums on the eighth-note grid with a stagger', () => {
    let song = createSong();
    const layer = createLayer('chords', song) as GuitarChordLayer;
    song = { ...song, guitar: { layers: [layer] } };
    const am = createGuitarChord(9, 'minor', 0, 4);
    song = addEvent(song, layer.id, am);
    // Default pattern: down on each beat -> 4 strums × 5 strings
    const notes = renderSong(song);
    expect(notes).toHaveLength(20);
    expect(notes.filter((n) => n.beat === 0).map((n) => n.offsetSec)).toEqual([0, 0.014, 0.028, 0.042, 0.056]);
    expect(new Set(notes.map((n) => n.beat))).toEqual(new Set([0, 1, 2, 3]));
  });

  it('reverses string order for up-strums and rings until the next strum', () => {
    let song = createSong();
    let layer = createLayer('chords', song) as GuitarChordLayer;
    layer = { ...layer, strumPattern: ['down', null, 'up', null, null, null, null, null] };
    song = { ...song, guitar: { layers: [layer] } };
    song = addEvent(song, layer.id, createGuitarChord(4, 'minor', 0, 4)); // Em, all six strings
    const notes = renderSong(song);
    const down = notes.filter((n) => n.beat === 0);
    const up = notes.filter((n) => n.beat === 1);
    expect(down.map((n) => n.midi)).toEqual([40, 47, 52, 55, 59, 64]);
    expect(up.map((n) => n.midi)).toEqual([64, 59, 55, 52, 47, 40]);
    expect(down[0].durationBeats).toBe(1); // rings until the up-strum
    expect(up[0].durationBeats).toBe(3); // rings to the chord's end
    expect(up[0].velocity).toBeLessThan(down[0].velocity);
  });

  it('picks a guitar chord one note at a time on its arpeggio pattern', () => {
    let song = createSong();
    const layer: GuitarChordLayer = { ...(createLayer('chords', song) as GuitarChordLayer), style: 'arpeggio', arp: { preset: 'up', rate: 'quarter' } };
    song = { ...song, guitar: { layers: [layer] } };
    song = addEvent(song, layer.id, createGuitarChord(2, 'major', 0, 4)); // D: D3 A3 D4 F#4 (strings 6, 5 muted)
    const notes = renderSong(song);
    expect(notes.map((n) => [n.beat, n.midi])).toEqual([
      [0, 50],
      [1, 57],
      [2, 62],
      [3, 66],
    ]);
    expect(notes.every((n) => n.offsetSec === 0 && n.instrument === 'melodic')).toBe(true);
    // Each picked note lets ring until the chord ends.
    expect(notes.map((n) => n.durationBeats)).toEqual([4, 3, 2, 1]);
  });

  it('applies layer mute as zero gain', () => {
    let song = createSong();
    const layer = { ...createLayer('single', song), muted: true };
    song = { ...song, guitar: { layers: [layer] } };
    song = addEvent(song, layer.id, createNoteEvent(60, 0, 1));
    expect(renderSong(song)[0].gain).toBe(0);
  });
});

describe('time signature changes', () => {
  it('resizes per-bar patterns: strums and custom arpeggios', () => {
    let song = createSong();
    const layer: GuitarChordLayer = {
      ...(createLayer('chords', song) as GuitarChordLayer),
      arp: { preset: 'custom', rate: 'eighth', steps: [[0], [1], [2], [3], [0], [1], [2], [3]] },
    };
    song = { ...song, guitar: { layers: [layer] } };
    expect(layer.strumPattern).toHaveLength(8);
    song = applyTimeSignature(song, { beatsPerBar: 6, beatUnit: 8 });
    expect(eighthsPerBar(song.timeSignature)).toBe(6);
    const six = song.guitar.layers[0] as GuitarChordLayer;
    expect(six.strumPattern).toHaveLength(6);
    expect(six.arp.steps).toEqual([[0], [1], [2], [3], [0], [1]]);
    song = applyTimeSignature(song, { beatsPerBar: 3, beatUnit: 4 });
    expect((song.guitar.layers[0] as GuitarChordLayer).strumPattern).toHaveLength(6);
  });

  it('uses explicit slots without automatically appending an empty bar', () => {
    let song = createSong();
    const layer = createLayer('single', song);
    song = { ...song, guitar: { layers: [layer] } };
    expect(songBars(song)).toBe(1);

    song = addEvent(song, layer.id, createNoteEvent(60, 2, 1));
    expect(songBars(song)).toBe(1); // content in slot 1 does not create slot 2

    song = { ...song, timelineBars: 3 };
    expect(songBars(song)).toBe(3); // explicitly created empty slots persist

    // Content outside the explicit count still expands the timeline so it is
    // never clipped (important for migrated or moved events).
    song = { ...song, timelineBars: 1 };
    song = addEvent(song, layer.id, createNoteEvent(60, 9, 1));
    expect(songBars(song)).toBe(3);
  });

  it('respects the time signature when counting content-forced bars', () => {
    let song = applyTimeSignature(createSong(), { beatsPerBar: 6, beatUnit: 8 });
    const layer = createLayer('single', song);
    song = { ...song, guitar: { layers: [layer] } };
    song = addEvent(song, layer.id, createNoteEvent(60, 6.5, 1)); // bar 2
    expect(songBars(song)).toBe(2);
  });
});
