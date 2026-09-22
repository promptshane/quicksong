import { describe, expect, it } from 'vitest';
import {
  ALL_KEYS,
  candidateKeys,
  diatonicChords,
  isDiatonic,
  keyTonality,
  relativeKey,
  resolveAssumedKey,
  type Triad,
} from '../src/model/keys';
import {
  FIFTHS_ORDER,
  SLOT_DEGREES,
  buildKeyWheel,
  cellKey,
  chordState,
  keySlot,
  keyState,
  nearestAngle,
  slotTriad,
  wheelRotation,
} from '../src/model/keyWheel';
import { chordName, keyLabel, pitchClassOf } from '../src/model/music';
import {
  addEvent,
  createGuitarChord,
  createLayer,
  createNoteEvent,
  createSong,
  duplicateLayer,
  pitchClassHistogram,
  reconcileKeyPreference,
  setAutoKey,
  setAutoKeyPreference,
  setKeyTonality,
  setManualKey,
  usedChords,
  usedPitchClasses,
} from '../src/model/song';
import { legacySeedChord } from './helpers';
import type { MusicalKey, PitchClass, Song } from '../src/model/types';

const C = 0, Cs = 1, D = 2, Ds = 3, E = 4, F = 5, Fs = 6, G = 7, Gs = 8, A = 9, As = 10, B = 11;
const key = (tonic: number, quality: 'major' | 'minor'): MusicalKey => ({ tonic: tonic as PitchClass, quality });
const names = (triads: Triad[]) => triads.map((t) => chordName(t.root, t.quality));

/** Song with one strum layer; returns [song, layerId]. */
function songWithStrumLayer(): [Song, string] {
  const song = createSong();
  const layer = createLayer('chords', song);
  return [{ ...song, guitar: { layers: [layer] } }, layer.id];
}

/** Commit a major/minor chord on a layer at `start`. */
function withChord(song: Song, layerId: string, rootMidi: number, quality: 'major' | 'minor', start = 0, duration = 4): Song {
  return addEvent(song, layerId, createGuitarChord(pitchClassOf(rootMidi), quality, start, duration));
}

/** C (long) then G (short): C major is the clear best, but G major / Em / Am stay plausible. */
function cThenG(): [Song, string] {
  let [song, layer] = songWithStrumLayer();
  song = withChord(song, layer, 60, 'major', 0, 12);
  song = withChord(song, layer, 55, 'major', 12, 2);
  return [song, layer];
}

describe('diatonic chords', () => {
  it('builds the seven triads of a major key (I ii iii IV V vi vii°)', () => {
    expect(names(diatonicChords(key(C, 'major')))).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(names(diatonicChords(key(G, 'major')))).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim']);
    expect(names(diatonicChords(key(Ds, 'major')))).toEqual(['D#', 'Fm', 'Gm', 'G#', 'A#', 'Cm', 'Ddim']);
  });

  it('builds the seven triads of a natural-minor key (i ii° III iv v VI VII)', () => {
    expect(names(diatonicChords(key(A, 'minor')))).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(names(diatonicChords(key(E, 'minor')))).toEqual(['Em', 'F#dim', 'G', 'Am', 'Bm', 'C', 'D']);
  });

  it('gives every key exactly 3 major, 3 minor and 1 diminished triad', () => {
    for (const k of ALL_KEYS) {
      const chords = diatonicChords(k);
      expect(chords).toHaveLength(7);
      expect(chords.filter((c) => c.quality === 'major')).toHaveLength(3);
      expect(chords.filter((c) => c.quality === 'minor')).toHaveLength(3);
      expect(chords.filter((c) => c.quality === 'dim')).toHaveLength(1);
      // The tonic triad has the key's quality.
      expect(chords[0]).toEqual({ root: k.tonic, quality: k.quality });
    }
  });

  it('relative keys share the same chord set but are distinct keys', () => {
    expect(relativeKey(key(C, 'major'))).toEqual(key(A, 'minor'));
    expect(relativeKey(key(A, 'minor'))).toEqual(key(C, 'major'));
    const cMajor = new Set(names(diatonicChords(key(C, 'major'))));
    const aMinor = new Set(names(diatonicChords(key(A, 'minor'))));
    expect(cMajor).toEqual(aMinor);
    expect(isDiatonic({ root: B as PitchClass, quality: 'dim' }, key(A, 'minor'))).toBe(true);
    expect(isDiatonic({ root: G as PitchClass, quality: 'minor' }, key(C, 'major'))).toBe(false);
  });
});

describe('wheel layout', () => {
  it('arranges tonics in fifths clockwise from C', () => {
    expect(FIFTHS_ORDER).toEqual([C, G, D, A, E, B, Fs, Cs, Gs, Ds, As, F]);
  });

  it('stacks major / relative minor / leading-tone dim in each slot', () => {
    expect(chordName(slotTriad('major', 0).root, slotTriad('major', 0).quality)).toBe('C');
    expect(chordName(slotTriad('minor', 0).root, slotTriad('minor', 0).quality)).toBe('Am');
    expect(chordName(slotTriad('dim', 0).root, slotTriad('dim', 0).quality)).toBe('Bdim');
    expect(chordName(slotTriad('major', 1).root, slotTriad('major', 1).quality)).toBe('G');
    expect(chordName(slotTriad('minor', 1).root, slotTriad('minor', 1).quality)).toBe('Em');
    expect(chordName(slotTriad('dim', 1).root, slotTriad('dim', 1).quality)).toBe('F#dim');
    // Every slot's three chords are exactly the I / vi / vii° of that slot's major key.
    for (let slot = 0; slot < 12; slot++) {
      const major = cellKey('major', slot)!;
      const chords = diatonicChords(major);
      expect(slotTriad('major', slot)).toEqual(chords[0]);
      expect(slotTriad('minor', slot)).toEqual(chords[5]);
      expect(slotTriad('dim', slot)).toEqual(chords[6]);
    }
  });

  it('maps tonic cells to keys; the dim ring holds no keys', () => {
    expect(cellKey('major', 1)).toEqual(key(G, 'major'));
    expect(cellKey('minor', 1)).toEqual(key(E, 'minor'));
    expect(cellKey('dim', 1)).toBeNull();
    expect(keySlot(key(G, 'major'))).toBe(1);
    expect(keySlot(key(E, 'minor'))).toBe(1);
    expect(keySlot(key(F, 'major'))).toBe(11);
    expect(keySlot(key(D, 'minor'))).toBe(11);
  });
});

describe('wheel rotation', () => {
  it('puts the assumed key at 12 o’clock', () => {
    expect(wheelRotation(null)).toBe(0);
    expect(wheelRotation(key(C, 'major'))).toBe(0);
    expect(wheelRotation(key(G, 'major'))).toBe(-SLOT_DEGREES);
    expect(wheelRotation(key(E, 'minor'))).toBe(-SLOT_DEGREES); // same slot as G
    expect(wheelRotation(key(F, 'major'))).toBe(SLOT_DEGREES); // one step anticlockwise, not eleven
    expect(wheelRotation(key(Fs, 'major'))).toBe(180);
    // Rotating a key's slot by the rotation lands on 0°.
    for (const k of ALL_KEYS) {
      expect((((keySlot(k) * SLOT_DEGREES + wheelRotation(k)) % 360) + 360) % 360).toBe(0);
    }
  });

  it('takes the short way round between successive rotations', () => {
    expect(nearestAngle(0, -30)).toBe(-30);
    expect(nearestAngle(-330, 0)).toBe(-360);
    expect(nearestAngle(170, -170)).toBe(190);
    expect(nearestAngle(45, 45)).toBe(45);
    expect(nearestAngle(720, 30)).toBe(750);
  });
});

describe('chord states', () => {
  const cMajor = key(C, 'major');
  const plausible = candidateKeys([C, E, G]); // C/F/G major + relatives
  const used: Triad[] = [
    { root: C, quality: 'major' },
    { root: D, quality: 'major' }, // borrowed: D major is not in C major
  ];

  it('used in-key chord is bright red (usedDiatonic)', () => {
    expect(chordState({ root: C, quality: 'major' }, cMajor, plausible, used)).toBe('usedDiatonic');
  });

  it('used out-of-key chord is light red (usedBorrowed)', () => {
    expect(chordState({ root: D, quality: 'major' }, cMajor, plausible, used)).toBe('usedBorrowed');
  });

  it('unused assumed-key chord is white (diatonic)', () => {
    expect(chordState({ root: F, quality: 'major' }, cMajor, plausible, used)).toBe('diatonic');
    expect(chordState({ root: B, quality: 'dim' }, cMajor, plausible, used)).toBe('diatonic');
  });

  it('unused chord in another plausible key is light gray (possible)', () => {
    // Bm is in G major (plausible) but not in C major.
    expect(chordState({ root: B, quality: 'minor' }, cMajor, plausible, used)).toBe('possible');
    // Bb is in F major (plausible).
    expect(chordState({ root: As, quality: 'major' }, cMajor, plausible, used)).toBe('possible');
  });

  it('chord in no plausible key is dark gray (impossible)', () => {
    expect(chordState({ root: Cs, quality: 'major' }, cMajor, plausible, used)).toBe('impossible');
    expect(chordState({ root: Gs, quality: 'minor' }, cMajor, plausible, used)).toBe('impossible');
  });

  it('with no assumed key nothing is diatonic, but every plausible chord is possible', () => {
    expect(chordState({ root: C, quality: 'major' }, null, candidateKeys([]), [])).toBe('possible');
    expect(chordState({ root: C, quality: 'major' }, null, candidateKeys([]), used)).toBe('usedBorrowed');
  });
});

describe('key states', () => {
  const plausible = candidateKeys([C, E, G]);
  it('distinguishes assumed, plausible and impossible keys', () => {
    expect(keyState(key(C, 'major'), key(C, 'major'), plausible)).toBe('assumed');
    expect(keyState(key(G, 'major'), key(C, 'major'), plausible)).toBe('plausible');
    expect(keyState(key(A, 'minor'), key(C, 'major'), plausible)).toBe('plausible');
    expect(keyState(key(D, 'major'), key(C, 'major'), plausible)).toBe('impossible');
    // C major and A minor are different keys even though they share notes.
    expect(keyState(key(A, 'minor'), key(C, 'major'), plausible)).not.toBe('assumed');
  });
});

describe('resolveAssumedKey', () => {
  const hist = (song: Song) => pitchClassHistogram(song);

  it('has no assumed key without material, and every key stays plausible', () => {
    const song = createSong();
    const r = resolveAssumedKey(song.key, usedPitchClasses(song), hist(song));
    expect(r.assumed).toBeNull();
    expect(r.plausible).toHaveLength(24);
    expect(r.mode).toBe('auto');
    expect(r.tonality).toBe('major');
  });

  it('assumes the best plausible key of the current tonality', () => {
    let [song, layer] = songWithStrumLayer();
    song = withChord(song, layer, 60, 'major'); // C
    song = withChord(song, layer, 55, 'major', 4); // G
    song = withChord(song, layer, 53, 'major', 8); // F
    const r = resolveAssumedKey(song.key, usedPitchClasses(song), hist(song));
    expect(r.assumed).toEqual(key(C, 'major'));
    expect(r.plausible).toEqual([key(C, 'major'), key(A, 'minor')]);
    expect(r.preferred).toBe(false);
    expect(r.confidence).not.toBeNull();

    const minor = resolveAssumedKey({ mode: 'auto', tonality: 'minor' }, usedPitchClasses(song), hist(song));
    expect(minor.assumed).toEqual(key(A, 'minor'));
    expect(minor.tonality).toBe('minor');
  });

  it('manual mode is the single plausible key regardless of material', () => {
    let [song, layer] = songWithStrumLayer();
    song = withChord(song, layer, 60, 'major');
    const r = resolveAssumedKey({ mode: 'manual', tonic: Fs as PitchClass, quality: 'minor' }, usedPitchClasses(song), hist(song));
    expect(r.mode).toBe('manual');
    expect(r.assumed).toEqual(key(Fs, 'minor'));
    expect(r.plausible).toEqual([key(Fs, 'minor')]);
    expect(r.confidence).toBeNull();
  });

  it('falls back to the best-scoring key when the material fits no key', () => {
    let [song, layer] = songWithStrumLayer();
    const single = createLayer('single', song);
    song = { ...song, guitar: { layers: [...song.guitar.layers, single] } };
    for (const [i, midi] of [60, 61, 62, 63, 64, 65].entries()) song = addEvent(song, single.id, createNoteEvent(midi, i, 1));
    void layer;
    const r = resolveAssumedKey(song.key, usedPitchClasses(song), hist(song));
    expect(r.plausible).toHaveLength(0);
    expect(r.assumed).not.toBeNull();
    expect(r.assumed!.quality).toBe('major');
  });
});

describe('Auto key preference', () => {

  it('tapping a plausible key assumes it without leaving Auto', () => {
    let [song] = cThenG();
    expect(buildKeyWheel(song).assumed).toEqual(key(C, 'major'));
    song = setAutoKeyPreference(song, key(G, 'major'));
    expect(song.key.mode).toBe('auto');
    expect(song.key).toEqual({ mode: 'auto', tonality: 'major', preference: key(G, 'major') });
    const wheel = buildKeyWheel(song);
    expect(wheel.mode).toBe('auto');
    expect(wheel.assumed).toEqual(key(G, 'major'));
    expect(wheel.preferred).toBe(true);
    expect(wheel.rotation).toBe(-SLOT_DEGREES);
    expect(keyLabel(song.key, wheel.assumed)).toBe('Auto · G');
  });

  it('tapping a minor key switches the tonality to minor', () => {
    let [song] = cThenG();
    song = setAutoKeyPreference(song, key(E, 'minor'));
    expect(keyTonality(song.key)).toBe('minor');
    expect(buildKeyWheel(song).assumed).toEqual(key(E, 'minor'));
    expect(keyLabel(song.key, buildKeyWheel(song).assumed)).toBe('Auto · Em');
  });

  it('ignores taps on keys that are not plausible', () => {
    const [song] = cThenG();
    expect(setAutoKeyPreference(song, key(D, 'major'))).toBe(song);
    expect(setAutoKeyPreference(song, key(Cs, 'minor'))).toBe(song);
  });

  it('keeps the preferred key while new material still allows it', () => {
    let [song, layer] = cThenG();
    song = setAutoKeyPreference(song, key(G, 'major'));
    song = withChord(song, layer, 52, 'minor', 8); // Em: fits C and G major
    song = reconcileKeyPreference(song);
    expect(song.key).toMatchObject({ mode: 'auto', preference: key(G, 'major') });
    expect(buildKeyWheel(song).assumed).toEqual(key(G, 'major'));
  });

  it('drops the preference as soon as committed material rules it out', () => {
    let [song, layer] = cThenG();
    song = setAutoKeyPreference(song, key(G, 'major'));
    const before = song;
    song = withChord(song, layer, 53, 'major', 8); // F major has an F: impossible in G major
    expect(reconcileKeyPreference(before)).toBe(before); // nothing to drop yet
    song = reconcileKeyPreference(song);
    expect(song.key).toEqual({ mode: 'auto', tonality: 'major' });
    const wheel = buildKeyWheel(song);
    expect(wheel.assumed).toEqual(key(C, 'major'));
    expect(wheel.preferred).toBe(false);
    expect(wheel.plausible).toEqual([key(C, 'major'), key(A, 'minor')]);
  });

  it('a stale preference never becomes the assumed key even before reconciliation', () => {
    let [song, layer] = cThenG();
    song = setAutoKeyPreference(song, key(G, 'major'));
    song = withChord(song, layer, 53, 'major', 8);
    expect(buildKeyWheel(song).assumed).toEqual(key(C, 'major'));
  });

  it('preference is per Auto setting: manual and back clears it', () => {
    let [song] = cThenG();
    song = setAutoKeyPreference(song, key(G, 'major'));
    song = setManualKey(song, key(D, 'major'));
    expect(song.key).toEqual({ mode: 'manual', tonic: D, quality: 'major' });
    song = setAutoKey(song);
    expect(song.key).toEqual({ mode: 'auto', tonality: 'major' });
  });
});

describe('Major / Minor toggle', () => {
  it('re-reads the same material as a minor tonal centre in Auto', () => {
    let [song] = cThenG();
    expect(buildKeyWheel(song).assumed).toEqual(key(C, 'major'));
    song = setKeyTonality(song, 'minor');
    expect(song.key).toEqual({ mode: 'auto', tonality: 'minor' });
    const wheel = buildKeyWheel(song);
    expect(wheel.tonality).toBe('minor');
    expect(wheel.assumed!.quality).toBe('minor');
    expect(wheel.plausible).toContainEqual(wheel.assumed);
    expect(setKeyTonality(song, 'minor')).toBe(song);
  });

  it('moves an Auto preference to its relative key', () => {
    let [song, layer] = songWithStrumLayer();
    song = withChord(song, layer, 60, 'major');
    song = setAutoKeyPreference(song, key(G, 'major'));
    song = setKeyTonality(song, 'minor');
    expect(song.key).toEqual({ mode: 'auto', tonality: 'minor', preference: key(E, 'minor') });
    expect(wheelRotation(buildKeyWheel(song).assumed)).toBe(-SLOT_DEGREES); // same slot, no spin
  });

  it('moves a manual key to its relative key', () => {
    let song = setManualKey(createSong(), key(C, 'major'));
    song = setKeyTonality(song, 'minor');
    expect(song.key).toEqual({ mode: 'manual', tonic: A, quality: 'minor' });
    song = setKeyTonality(song, 'major');
    expect(song.key).toEqual({ mode: 'manual', tonic: C, quality: 'major' });
  });
});

describe('usedChords', () => {
  it('collects major/minor chords across layers, ignoring seeds and custom voicings', () => {
    let [song, layer] = songWithStrumLayer();
    const picked = createLayer('chords', song);
    const single = createLayer('single', song);
    song = { ...song, guitar: { layers: [...song.guitar.layers, picked, single] } };
    song = withChord(song, layer, 60, 'major');
    song = withChord(song, picked.id, 57, 'minor');
    song = addEvent(song, layer, legacySeedChord(62, 4, 4)); // seed D: not a chord
    song = addEvent(song, single.id, createNoteEvent(64, 0, 1)); // single note: not a chord
    expect(names(usedChords(song)).sort()).toEqual(['Am', 'C']);
  });

  it('counts a chord once no matter how many layers repeat it', () => {
    let [song, layer] = songWithStrumLayer();
    song = withChord(song, layer, 60, 'major');
    song = withChord(song, layer, 60, 'major', 4);
    song = duplicateLayer(song, layer);
    song = duplicateLayer(song, layer);
    expect(song.guitar.layers).toHaveLength(3);
    expect(names(usedChords(song))).toEqual(['C']);
    const wheel = buildKeyWheel(song);
    const cCell = wheel.cells.find((c) => c.ring === 'major' && c.triad.root === C)!;
    expect(cCell.chordState).toBe('usedDiatonic');
    expect(cCell.keyState).toBe('assumed');
  });
});

describe('buildKeyWheel end to end', () => {
  it('C major with C and D used: red tonic with yellow halo, light-red D, white diatonic, grays elsewhere', () => {
    let [song, layer] = songWithStrumLayer();
    song = withChord(song, layer, 60, 'major'); // C
    song = withChord(song, layer, 55, 'major', 4); // G
    song = withChord(song, layer, 53, 'major', 8); // F -> C major / A minor only
    // Lock C major, then borrow D major (D F# A). In Auto the F# would leave no
    // plausible key at all; under a manual key it is simply a borrowed chord.
    song = setManualKey(song, key(C, 'major'));
    song = withChord(song, layer, 62, 'major', 12);
    const wheel = buildKeyWheel(song);
    const state = (name: string) => wheel.cells.find((c) => chordName(c.triad.root, c.triad.quality) === name)!;

    expect(state('C').chordState).toBe('usedDiatonic');
    expect(state('C').keyState).toBe('assumed');
    expect(state('D').chordState).toBe('usedBorrowed');
    expect(state('G').chordState).toBe('usedDiatonic');
    expect(state('F').chordState).toBe('usedDiatonic');
    expect(state('Dm').chordState).toBe('diatonic');
    expect(state('Em').chordState).toBe('diatonic');
    expect(state('Am').chordState).toBe('diatonic');
    expect(state('Am').keyState).toBe('impossible'); // manual: only C major is plausible
    expect(state('Bdim').chordState).toBe('diatonic');
    expect(state('Bm').chordState).toBe('impossible');
    expect(wheel.cells.filter((c) => c.chordState === 'diatonic' || c.chordState === 'usedDiatonic')).toHaveLength(7);
    expect(wheel.rotation).toBe(0);
    expect(wheel.cells).toHaveLength(36);
  });

  it('in Auto, other plausible keys light their chords light gray', () => {
    const [song] = cThenG(); // C major or G major (+ relatives)
    const wheel = buildKeyWheel(song);
    expect(wheel.assumed).toEqual(key(C, 'major'));
    const state = (name: string) => wheel.cells.find((c) => chordName(c.triad.root, c.triad.quality) === name)!;
    expect(state('Bm').chordState).toBe('possible'); // G major's iii
    expect(state('D').chordState).toBe('possible'); // G major's V
    expect(state('F#dim').chordState).toBe('possible');
    expect(state('F').chordState).toBe('diatonic');
    expect(state('A#').chordState).toBe('impossible');
    expect(state('G').keyState).toBe('plausible');
    expect(state('Em').keyState).toBe('plausible');
    expect(state('Am').keyState).toBe('plausible');
    expect(state('D').keyState).toBe('impossible');
    // Only plausible tonics are tappable in Auto.
    expect(wheel.cells.filter((c) => c.tappable).map((c) => chordName(c.triad.root, c.triad.quality)).sort()).toEqual(
      ['Am', 'C', 'Em', 'G'],
    );
  });

  it('in manual mode every tonic is tappable so the key can be changed on the wheel', () => {
    const wheel = buildKeyWheel(setManualKey(createSong(), key(G, 'major')));
    expect(wheel.cells.filter((c) => c.tappable)).toHaveLength(24);
    expect(wheel.cells.filter((c) => c.ring === 'dim' && c.tappable)).toHaveLength(0);
  });
});
