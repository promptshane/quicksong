import type { ChordQuality, KeySetting, PitchClass } from './types';

/**
 * Possible-key guidance.
 *
 * This is deliberately *not* "which key is most likely" (see `inferKey`).
 * It answers "which major / natural-minor keys are still compatible with
 * everything committed so far?", and from that, which pitch classes are
 * outside every remaining candidate. V1 uses plain diatonic membership —
 * no borrowed chords, harmonic minor, or modal interchange.
 */

export interface MusicalKey {
  tonic: PitchClass;
  quality: ChordQuality;
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

export const ALL_KEYS: MusicalKey[] = Array.from({ length: 12 }, (_, tonic) => tonic as PitchClass).flatMap(
  (tonic) => [
    { tonic, quality: 'major' as const },
    { tonic, quality: 'minor' as const },
  ],
);

/** Pitch classes of a key's diatonic scale. */
export function keyPitchClasses(key: MusicalKey): Set<PitchClass> {
  const steps = key.quality === 'major' ? MAJOR_STEPS : NATURAL_MINOR_STEPS;
  return new Set(steps.map((s) => ((key.tonic + s) % 12) as PitchClass));
}

/** Keys whose scale contains every used pitch class. Empty input = every key. */
export function candidateKeys(used: Iterable<number>): MusicalKey[] {
  const pcs = new Set([...used].map((pc) => ((pc % 12) + 12) % 12));
  return ALL_KEYS.filter((key) => {
    const scale = keyPitchClasses(key);
    for (const pc of pcs) if (!scale.has(pc as PitchClass)) return false;
    return true;
  });
}

/**
 * Pitch classes that belong to none of the candidate keys.
 * With no candidates left (the material fits no single key) nothing is
 * flagged — there is no basis for guidance, so the keyboard stays neutral.
 */
export function impossiblePitchClasses(candidates: MusicalKey[]): Set<PitchClass> {
  if (candidates.length === 0) return new Set();
  const possible = new Set<PitchClass>();
  for (const key of candidates) for (const pc of keyPitchClasses(key)) possible.add(pc);
  const out = new Set<PitchClass>();
  for (let pc = 0; pc < 12; pc++) if (!possible.has(pc as PitchClass)) out.add(pc as PitchClass);
  return out;
}

/**
 * Pitch classes to dim on the keyboard for the current song.
 * A manually chosen key is a direct statement from the user, so it is the
 * only candidate; in Auto mode candidates come from the committed material.
 */
export function dimmedPitchClasses(key: KeySetting, usedPitchClasses: Iterable<number>): Set<PitchClass> {
  if (key.mode === 'manual') return impossiblePitchClasses([{ tonic: key.tonic, quality: key.quality }]);
  return impossiblePitchClasses(candidateKeys(usedPitchClasses));
}
