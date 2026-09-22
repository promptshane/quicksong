import { describe, expect, it } from 'vitest';
import { defaultVoicing, placeNote, soundingNotes, voicingsFor } from '../src/model/chords';
import { guitarChordShape, setGuitarChord, toggleGuitarChordNote } from '../src/model/guitarChords';
import { eventLabel } from '../src/model/labels';
import { midiToName } from '../src/model/music';
import { chordTonesOf } from '../src/model/piano';
import { createGuitarChord } from '../src/model/song';

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
});

describe('guitar chords in the shared chord workflow', () => {
  it('a chord picked from the key gets its standard guitar voicing', () => {
    const am = createGuitarChord(9, 'minor', 0, 4);
    expect(am).toMatchObject({ kind: 'chord', root: 9, quality: 'minor' });
    expect(names(am.strings)).toEqual(['A2', 'E3', 'A3', 'C4', 'E4']);
    expect(guitarChordShape(am)?.notes).toEqual([45, 52, 57, 60, 64]);
    expect(eventLabel(am)).toBe('Am');
  });

  it('wheel notes go on a muted string, keep the chord and toggle off again', () => {
    const am = createGuitarChord(9, 'minor', 0, 4); // x02210: low E muted
    const am7 = toggleGuitarChordNote(am, 7); // G
    expect(names(am7.strings)).toContain('G2'); // on the low E string, 3rd fret
    expect(chordTonesOf({ root: 9, quality: 'minor' })).toEqual(new Set([9, 0, 4]));
    expect(eventLabel(am7)).toBe('Am7');
    expect(am7.quality).toBe('minor'); // still remembers the chord it was picked as
    expect(names(toggleGuitarChordNote(am7, 7).strings)).toEqual(names(am.strings)); // taken off again
    expect(toggleGuitarChordNote(am, 0)).toBe(am); // C is a chord tone
  });

  it('with every string in use, a doubled note makes room rather than a chord tone', () => {
    const e = createGuitarChord(4, 'major', 0, 4); // 022100: E B E G# B E
    const e7 = toggleGuitarChordNote(e, 2); // D
    const pcs = soundingNotes(e7.strings).map((n) => n.midi % 12);
    expect(pcs).toContain(2);
    for (const tone of [4, 8, 11]) expect(pcs).toContain(tone); // E, G#, B all still there
  });

  it('changing the chord resets to the new chord\'s voicing', () => {
    const am7 = toggleGuitarChordNote(createGuitarChord(9, 'minor', 2, 3, 0.4), 7);
    const f = setGuitarChord(am7, 5, 'major');
    expect(f).toMatchObject({ root: 5, quality: 'major', start: 2, duration: 3, velocity: 0.4 });
    expect(f.strings).toEqual(defaultVoicing(5, 'major'));
  });
});
