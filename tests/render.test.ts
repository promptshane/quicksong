import { describe, expect, it } from 'vitest';
import { renderSong, resolvePickString } from '../src/audio/render';
import { addEvent, applyTimeSignature, buildChord, createLayer, createNoteEvent, createSeedChord, createSong } from '../src/model/song';
import { eighthsPerBar, songBars } from '../src/model/time';
import type { PickedLayer, StrumLayer } from '../src/model/types';

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
    const layer = createLayer('strum', song) as StrumLayer;
    song = { ...song, guitar: { layers: [layer] } };
    const am = buildChord(createSeedChord(57, 0, 4), 'minor');
    song = addEvent(song, layer.id, am);
    // Default pattern: down on each beat -> 4 strums × 5 strings
    const notes = renderSong(song);
    expect(notes).toHaveLength(20);
    expect(notes.filter((n) => n.beat === 0).map((n) => n.offsetSec)).toEqual([0, 0.014, 0.028, 0.042, 0.056]);
    expect(new Set(notes.map((n) => n.beat))).toEqual(new Set([0, 1, 2, 3]));
  });

  it('reverses string order for up-strums and rings until the next strum', () => {
    let song = createSong();
    let layer = createLayer('strum', song) as StrumLayer;
    layer = { ...layer, strumPattern: ['down', null, 'up', null, null, null, null, null] };
    song = { ...song, guitar: { layers: [layer] } };
    song = addEvent(song, layer.id, buildChord(createSeedChord(52, 0, 4), 'minor')); // Em, all six strings
    const notes = renderSong(song);
    const down = notes.filter((n) => n.beat === 0);
    const up = notes.filter((n) => n.beat === 1);
    expect(down.map((n) => n.midi)).toEqual([40, 47, 52, 55, 59, 64]);
    expect(up.map((n) => n.midi)).toEqual([64, 59, 55, 52, 47, 40]);
    expect(down[0].durationBeats).toBe(1); // rings until the up-strum
    expect(up[0].durationBeats).toBe(3); // rings to the chord's end
    expect(up[0].velocity).toBeLessThan(down[0].velocity);
  });

  it('picks one string per beat, respecting muted strings', () => {
    let song = createSong();
    const layer = createLayer('picked', song) as PickedLayer;
    song = { ...song, guitar: { layers: [layer] } };
    const d = buildChord(createSeedChord(50, 0, 4), 'major'); // D: strings 6 and 5 muted
    song = addEvent(song, layer.id, { ...d, pickPattern: [6, 4, 3, 2] });
    const notes = renderSong(song);
    expect(notes).toHaveLength(4);
    // String 6 is muted on D, so the nearest sounding string (4) is used instead.
    expect(notes[0].midi).toBe(50);
    expect(resolvePickString(d, 6)).toBe(4);
    expect(resolvePickString(d, 1)).toBe(1);
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
  it('resizes per-bar patterns', () => {
    let song = createSong();
    const strum = createLayer('strum', song) as StrumLayer;
    const picked = createLayer('picked', song) as PickedLayer;
    song = { ...song, guitar: { layers: [strum, picked] } };
    expect(strum.strumPattern).toHaveLength(8);
    song = applyTimeSignature(song, { beatsPerBar: 6, beatUnit: 8 });
    expect(eighthsPerBar(song.timeSignature)).toBe(6);
    expect((song.guitar.layers[0] as StrumLayer).strumPattern).toHaveLength(6);
    expect((song.guitar.layers[1] as PickedLayer).pickPattern).toHaveLength(6);
    song = applyTimeSignature(song, { beatsPerBar: 3, beatUnit: 4 });
    expect((song.guitar.layers[0] as StrumLayer).strumPattern).toHaveLength(6);
    expect((song.guitar.layers[1] as PickedLayer).pickPattern).toHaveLength(3);
  });

  it('grows the song to fit events plus one spare bar', () => {
    let song = createSong();
    const layer = createLayer('single', song);
    song = { ...song, guitar: { layers: [layer] } };
    expect(songBars(song)).toBe(4);
    song = addEvent(song, layer.id, createNoteEvent(60, 30, 1));
    expect(songBars(song)).toBe(9);
  });
});
