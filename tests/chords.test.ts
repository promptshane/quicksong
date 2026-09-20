import { describe, expect, it } from 'vitest';
import {
  addToneToVoicing,
  defaultVoicing,
  placeNote,
  relabelChord,
  setStringMuted,
  singleNoteVoicing,
  soundingNotes,
  stringMidi,
  voicingsFor,
} from '../src/model/chords';
import { midiToName } from '../src/model/music';
import { buildChord, createSeedChord } from '../src/model/song';

const names = (v: ReturnType<typeof defaultVoicing>) => soundingNotes(v).map((n) => midiToName(n.midi));

describe('guitar voicings', () => {
  it('uses the open A minor shape', () => {
    const v = defaultVoicing(9, 'minor');
    expect(v.map((s) => (s.muted ? 'x' : s.fret))).toEqual(['x', 0, 2, 2, 1, 0]);
    expect(names(v)).toEqual(['A2', 'E3', 'A3', 'C4', 'E4']);
  });

  it('uses the open G major shape', () => {
    expect(names(defaultVoicing(7, 'major'))).toEqual(['G2', 'B2', 'D3', 'G3', 'B3', 'G4']);
  });

  it('falls back to barre shapes for chords without an open form', () => {
    const v = defaultVoicing(6, 'major'); // F#
    expect(v.map((s) => (s.muted ? 'x' : s.fret))).toEqual([2, 4, 4, 3, 2, 2]);
    const b = defaultVoicing(11, 'minor'); // Bm — A-shape at fret 2 is lower than E-shape at 7
    expect(b.map((s) => (s.muted ? 'x' : s.fret))).toEqual(['x', 2, 4, 4, 3, 2]);
  });

  it('offers several voicings for every major/minor chord', () => {
    for (let root = 0; root < 12; root++) {
      for (const q of ['major', 'minor'] as const) {
        const options = voicingsFor(root as 0, q);
        expect(options.length).toBeGreaterThanOrEqual(2);
        for (const v of options) {
          // Every voicing must actually contain the chord tones.
          const pcs = new Set(soundingNotes(v).map((n) => n.midi % 12));
          const third = q === 'major' ? 4 : 3;
          expect(pcs.has(root)).toBe(true);
          expect(pcs.has((root + third) % 12)).toBe(true);
          expect(pcs.has((root + 7) % 12)).toBe(true);
        }
      }
    }
  });
});

describe('note placement', () => {
  it('places notes on the lowest fret position', () => {
    expect(placeNote(40)).toEqual({ index: 0, fret: 0 }); // E2 open low E
    expect(placeNote(60)).toEqual({ index: 4, fret: 1 }); // C4 on B string fret 1
    expect(placeNote(64)).toEqual({ index: 5, fret: 0 }); // E4 open high e
  });

  it('builds a single-note voicing with the other strings muted', () => {
    const v = singleNoteVoicing(57); // A3
    expect(soundingNotes(v)).toHaveLength(1);
    expect(stringMidi(soundingNotes(v)[0].index, v[soundingNotes(v)[0].index])).toBe(57);
  });

  it('adds tones to muted strings without displacing existing ones', () => {
    let v = singleNoteVoicing(57);
    v = addToneToVoicing(v, 60);
    v = addToneToVoicing(v, 64);
    expect(names(v)).toEqual(['A3', 'C4', 'E4']);
  });
});

describe('chord events', () => {
  it('builds a chord from a seed note and relabels after edits', () => {
    const seed = createSeedChord(57, 0, 4);
    expect(seed.quality).toBe('note');
    expect(seed.root).toBe(9);
    const am = buildChord(seed, 'minor');
    expect(am.quality).toBe('minor');
    expect(names(am.strings)).toEqual(['A2', 'E3', 'A3', 'C4', 'E4']);

    // Muting the C makes it no longer a triad -> custom
    const noThird = relabelChord({ ...am, strings: setStringMuted(am.strings, 4, true) });
    expect(noThird.quality).toBe('custom');

    // Re-enabling restores the label
    const back = relabelChord({ ...noThird, strings: setStringMuted(noThird.strings, 4, false) });
    expect(back.quality).toBe('minor');
    expect(back.root).toBe(9);
  });
});
