import { rankKeys } from './music';
import type { ChordQuality, KeySetting, MusicalKey, PitchClass, TriadQuality } from './types';

/**
 * Possible-key guidance.
 *
 * This is deliberately *not* "which key is most likely" (see `inferKey`).
 * It answers "which major / natural-minor keys are still compatible with
 * everything committed so far?", and from that, which pitch classes are
 * outside every remaining candidate. V1 uses plain diatonic membership —
 * no borrowed chords, harmonic minor, or modal interchange.
 *
 * On top of that set, `resolveAssumedKey` picks the single key QuickSong
 * currently *assumes* (for the Circle of Fifths and the Key chip) from the
 * user's mode, Major/Minor tonality and optional Auto preference.
 */

export type { MusicalKey } from './types';

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

export const ALL_KEYS: MusicalKey[] = Array.from({ length: 12 }, (_, tonic) => tonic as PitchClass).flatMap(
  (tonic) => [
    { tonic, quality: 'major' as const },
    { tonic, quality: 'minor' as const },
  ],
);

export function sameKey(a: MusicalKey | null | undefined, b: MusicalKey | null | undefined): boolean {
  return !!a && !!b && a.tonic === b.tonic && a.quality === b.quality;
}

/** The key sharing this key's notes: C major <-> A minor. */
export function relativeKey(key: MusicalKey): MusicalKey {
  return key.quality === 'major'
    ? { tonic: ((key.tonic + 9) % 12) as PitchClass, quality: 'minor' }
    : { tonic: ((key.tonic + 3) % 12) as PitchClass, quality: 'major' };
}

/** Pitch classes of a key's diatonic scale in scale-degree order. */
export function keyScale(key: MusicalKey): PitchClass[] {
  const steps = key.quality === 'major' ? MAJOR_STEPS : NATURAL_MINOR_STEPS;
  return steps.map((s) => ((key.tonic + s) % 12) as PitchClass);
}

/**
 * Scale degree (0 = tonic … 6 = seventh) of a pitch class in a key, or null
 * when it is outside the key's scale.
 */
export function scaleDegree(pc: number, key: MusicalKey): number | null {
  const degree = keyScale(key).indexOf((((pc % 12) + 12) % 12) as PitchClass);
  return degree < 0 ? null : degree;
}

/** Pitch classes of a key's diatonic scale. */
export function keyPitchClasses(key: MusicalKey): Set<PitchClass> {
  return new Set(keyScale(key));
}

export interface Triad {
  root: PitchClass;
  quality: TriadQuality;
}

export function sameTriad(a: Triad, b: Triad): boolean {
  return a.root === b.root && a.quality === b.quality;
}

/** Stable string key for a triad, for Sets/Maps. */
export function triadId(triad: Triad): string {
  return `${triad.root}:${triad.quality}`;
}

/**
 * The seven diatonic triads of a key, built by stacking scale thirds on each
 * degree. Major key: I ii iii IV V vi vii°; natural minor: i ii° III iv v VI VII.
 */
export function diatonicChords(key: MusicalKey): Triad[] {
  const scale = keyScale(key);
  return scale.map((root, degree) => {
    const third = (scale[(degree + 2) % 7] - root + 12) % 12;
    const fifth = (scale[(degree + 4) % 7] - root + 12) % 12;
    let quality: TriadQuality;
    if (third === 4 && fifth === 7) quality = 'major';
    else if (third === 3 && fifth === 7) quality = 'minor';
    else if (third === 3 && fifth === 6) quality = 'dim';
    else throw new Error(`Non-tertian triad in ${key.tonic} ${key.quality} at degree ${degree}`);
    return { root, quality };
  });
}

export function isDiatonic(triad: Triad, key: MusicalKey): boolean {
  return diatonicChords(key).some((t) => sameTriad(t, triad));
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

export function isPlausibleKey(key: MusicalKey, candidates: MusicalKey[]): boolean {
  return candidates.some((c) => sameKey(c, key));
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

// ---- assumed key ----------------------------------------------------------

/** Major or minor reading of the song: the manual key's quality, or the Auto toggle. */
export function keyTonality(key: KeySetting): ChordQuality {
  return key.mode === 'manual' ? key.quality : key.tonality ?? 'major';
}

/** The Auto preference, if any. Manual mode has none. */
export function autoKeyPreference(key: KeySetting): MusicalKey | null {
  return key.mode === 'auto' ? key.preference ?? null : null;
}

export interface KeyResolution {
  mode: 'auto' | 'manual';
  tonality: ChordQuality;
  /** The key QuickSong is currently reading the song in; null with no evidence. */
  assumed: MusicalKey | null;
  /** Keys still compatible with all committed material (manual: just that key). */
  plausible: MusicalKey[];
  /** True when `assumed` came from the user's Auto preference. */
  preferred: boolean;
  /** 0..1 inference confidence in `assumed`; null when not inferred. */
  confidence: number | null;
}

/**
 * Decide which key the song is assumed to be in.
 *
 * Manual: the chosen key, full stop.
 * Auto:   candidates are the keys still compatible with the used pitch
 *         classes. A preference wins while it is still a candidate; otherwise
 *         the best-scoring candidate with the chosen tonality. When no key fits
 *         the material at all, fall back to the best-scoring key overall so the
 *         wheel still has something sensible at 12 o'clock.
 */
export function resolveAssumedKey(
  key: KeySetting,
  usedPitchClasses: Iterable<number>,
  histogram: number[],
): KeyResolution {
  if (key.mode === 'manual') {
    const manual = { tonic: key.tonic, quality: key.quality };
    return { mode: 'manual', tonality: key.quality, assumed: manual, plausible: [manual], preferred: false, confidence: null };
  }

  const tonality = keyTonality(key);
  const plausible = candidateKeys(usedPitchClasses);
  const preference = autoKeyPreference(key);
  if (preference && isPlausibleKey(preference, plausible)) {
    return { mode: 'auto', tonality, assumed: preference, plausible, preferred: true, confidence: null };
  }

  const ranked = rankKeys(histogram);
  if (ranked.length === 0) {
    return { mode: 'auto', tonality, assumed: null, plausible, preferred: false, confidence: null };
  }
  const pool = plausible.length > 0 ? ranked.filter((r) => isPlausibleKey(r.key, plausible)) : ranked;
  const ofTonality = pool.filter((r) => r.key.quality === tonality);
  const best = (ofTonality.length > 0 ? ofTonality : pool)[0];
  // Confidence only means something when the assumed key is the outright
  // winner: how far it leads the runner-up across all 24 keys, squashed to 0..1.
  const confidence = sameKey(best.key, ranked[0].key) ? Math.min(1, Math.max(0, ranked[0].score - ranked[1].score) * 4) : null;
  return { mode: 'auto', tonality, assumed: best.key, plausible, preferred: false, confidence };
}
