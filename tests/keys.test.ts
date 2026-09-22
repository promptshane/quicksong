import { describe, expect, it } from 'vitest';
import { ALL_KEYS, candidateKeys, dimmedPitchClasses, impossiblePitchClasses, keyPitchClasses, scaleDegree } from '../src/model/keys';
import { createPianoChord } from '../src/model/piano';
import {
  addEvent,
  assumedKey,
  createGuitarChord,
  createLayer,
  createNoteEvent,
  createSong,
  eventRootPitchClass,
  setManualKey,
  usedPitchClasses,
} from '../src/model/song';
import { legacySeedChord } from './helpers';

const C = 0, Cs = 1, D = 2, Ds = 3, E = 4, F = 5, Fs = 6, G = 7, Gs = 8, A = 9, As = 10, B = 11;

describe('key scales', () => {
  it('builds diatonic major and natural-minor scales', () => {
    expect([...keyPitchClasses({ tonic: C, quality: 'major' })].sort((a, b) => a - b)).toEqual([C, D, E, F, G, A, B]);
    expect([...keyPitchClasses({ tonic: A, quality: 'minor' })].sort((a, b) => a - b)).toEqual([C, D, E, F, G, A, B]);
    expect([...keyPitchClasses({ tonic: G, quality: 'major' })].sort((a, b) => a - b)).toEqual([C, D, E, Fs, G, A, B]);
  });
});

describe('candidateKeys', () => {
  it('returns every key when nothing has been committed', () => {
    expect(candidateKeys([])).toHaveLength(24);
    expect(ALL_KEYS).toHaveLength(24);
  });

  it('keeps only keys containing all used pitch classes', () => {
    // C and E together: C, F, G major and their relative minors A, D, E.
    const keys = candidateKeys([C, E]);
    expect(keys).toHaveLength(6);
    expect(keys.filter((k) => k.quality === 'major').map((k) => k.tonic).sort((a, b) => a - b)).toEqual([C, F, G]);
    expect(keys.filter((k) => k.quality === 'minor').map((k) => k.tonic).sort((a, b) => a - b)).toEqual([D, E, A]);
    expect(candidateKeys([C, E]).every((k) => keyPitchClasses(k).has(C) && keyPitchClasses(k).has(E))).toBe(true);
  });

  it('narrows to two relative keys with a full diatonic set', () => {
    const keys = candidateKeys([C, D, E, F, G, A, B]);
    expect(keys).toEqual([
      { tonic: C, quality: 'major' },
      { tonic: A, quality: 'minor' },
    ]);
  });

  it('returns nothing for chromatic material that fits no key', () => {
    expect(candidateKeys([C, Cs, D, Ds, E, F])).toHaveLength(0);
  });
});

describe('impossiblePitchClasses', () => {
  it('flags nothing with no evidence or a single note', () => {
    expect(impossiblePitchClasses(candidateKeys([]))).toEqual(new Set());
    expect(impossiblePitchClasses(candidateKeys([C]))).toEqual(new Set());
    expect(impossiblePitchClasses(candidateKeys([Fs]))).toEqual(new Set());
  });

  it('identifies notes outside every remaining key', () => {
    // C + E leaves C/F/G major (+ relatives): union covers all but C#, D#, G#.
    expect(impossiblePitchClasses(candidateKeys([C, E]))).toEqual(new Set([Cs, Ds, Gs]));
    // A whole diatonic set pins C major / A minor: the five black keys are out.
    expect(impossiblePitchClasses(candidateKeys([C, D, E, F, G, A, B]))).toEqual(new Set([Cs, Ds, Fs, Gs, As]));
  });

  it('gives no guidance when no key fits (never grays everything)', () => {
    expect(impossiblePitchClasses([])).toEqual(new Set());
  });
});

describe('dimmedPitchClasses', () => {
  it('uses the manual key directly when one is set', () => {
    expect(dimmedPitchClasses({ mode: 'manual', tonic: G, quality: 'major' }, [])).toEqual(new Set([Cs, Ds, F, Gs, As]));
  });

  it('uses committed material in Auto mode', () => {
    expect(dimmedPitchClasses({ mode: 'auto' }, [C, E])).toEqual(new Set([Cs, Ds, Gs]));
    expect(dimmedPitchClasses({ mode: 'auto' }, [])).toEqual(new Set());
  });
});

describe('usedPitchClasses', () => {
  it('collects note pitches and sounding chord tones only', () => {
    let song = createSong();
    const single = createLayer('single', song);
    const strum = createLayer('chords', song);
    song = { ...song, guitar: { layers: [single, strum] } };
    expect(usedPitchClasses(song)).toEqual(new Set());
    song = addEvent(song, single.id, createNoteEvent(62, 0, 1)); // D
    song = addEvent(song, strum.id, createGuitarChord(9, 'minor', 0, 4)); // Am: A C E
    expect(usedPitchClasses(song)).toEqual(new Set([D, A, C, E]));
    // A seed chord contributes just its one tone.
    song = addEvent(song, strum.id, legacySeedChord(66, 4, 4)); // F#
    expect(usedPitchClasses(song)).toEqual(new Set([D, A, C, E, Fs]));
  });
});

describe('scaleDegree and event colouring inputs', () => {
  it('numbers the key scale from the tonic and rejects outside notes', () => {
    const cMajor = { tonic: 0, quality: 'major' } as const;
    expect([0, 2, 4, 5, 7, 9, 11].map((pc) => scaleDegree(pc, cMajor))).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(scaleDegree(1, cMajor)).toBeNull();
    expect(scaleDegree(-12, cMajor)).toBe(0);
    const aMinor = { tonic: 9, quality: 'minor' } as const;
    expect(scaleDegree(9, aMinor)).toBe(0);
    expect(scaleDegree(0, aMinor)).toBe(2); // C is III in A minor
  });

  it('an event is coloured by its note or its chord root, in the song key', () => {
    expect(eventRootPitchClass(createNoteEvent(64, 0, 1))).toBe(4);
    expect(eventRootPitchClass(createGuitarChord(9, 'minor', 0, 4))).toBe(9);
    expect(eventRootPitchClass(createPianoChord(7, 'major', 0, 4))).toBe(7);
    expect(assumedKey(createSong())).toBeNull();
    expect(assumedKey(setManualKey(createSong(), { tonic: 2, quality: 'major' }))).toEqual({ tonic: 2, quality: 'major' });
  });
});
