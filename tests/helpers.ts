import { OPEN_STRINGS, placeNote } from '../src/model/chords';
import { pitchClassOf } from '../src/model/music';
import type { ChordEvent, Voicing } from '../src/model/types';

let n = 0;

/**
 * A legacy guitar "seed" chord (one tone, not yet made major/minor). The app
 * no longer creates these, but songs saved before the chord palette can still
 * contain them, so key inference and rendering must keep handling them.
 */
export function legacySeedChord(midi: number, start: number, duration: number): ChordEvent {
  n += 1;
  const pos = placeNote(midi);
  const strings = OPEN_STRINGS.map((_, i) => ({ fret: i === pos.index ? pos.fret : 0, muted: i !== pos.index })) as Voicing;
  return { kind: 'chord', id: `seed${n}`, root: pitchClassOf(midi), quality: 'note', strings, start, duration, velocity: 0.8 };
}
