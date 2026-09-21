import { isDiatonic, isPlausibleKey, resolveAssumedKey, sameKey, triadId, type KeyResolution, type Triad } from './keys';
import { pitchClassHistogram, usedChords, usedPitchClasses } from './song';
import type { MusicalKey, PitchClass, Song, TriadQuality } from './types';

/**
 * Circle of Fifths model for the Key panel.
 *
 * Three concentric rings, twelve slots each, arranged in fifths clockwise from
 * C. A slot holds the major key's tonic chord (outer), its relative minor
 * (middle) and the leading-tone diminished triad (inner): C / Am / Bdim.
 * Every colour decision is made here as a semantic state; the component only
 * maps states to CSS.
 */

export const WHEEL_SLOTS = 12;
export const SLOT_DEGREES = 360 / WHEEL_SLOTS;

/** Tonics in circle-of-fifths order starting at C. */
export const FIFTHS_ORDER: PitchClass[] = Array.from({ length: WHEEL_SLOTS }, (_, i) => ((i * 7) % 12) as PitchClass);

export type WheelRing = 'major' | 'minor' | 'dim';
export const WHEEL_RINGS: WheelRing[] = ['major', 'minor', 'dim'];

/** The chord sitting in a ring at a slot. */
export function slotTriad(ring: WheelRing, slot: number): Triad {
  const major = FIFTHS_ORDER[((slot % WHEEL_SLOTS) + WHEEL_SLOTS) % WHEEL_SLOTS];
  // Relative minor sits a minor third below; the vii° a semitone below.
  const offset = ring === 'major' ? 0 : ring === 'minor' ? 9 : 11;
  return { root: ((major + offset) % 12) as PitchClass, quality: ring as TriadQuality };
}

/** Which slot (0..11) a key's tonic chord occupies. Minor keys live in the middle ring. */
export function keySlot(key: MusicalKey): number {
  const majorTonic = key.quality === 'major' ? key.tonic : (key.tonic + 3) % 12;
  return FIFTHS_ORDER.indexOf(majorTonic as PitchClass);
}

/** The key a tonic cell stands for; the diminished ring holds no keys. */
export function cellKey(ring: WheelRing, slot: number): MusicalKey | null {
  if (ring === 'dim') return null;
  const triad = slotTriad(ring, slot);
  return { tonic: triad.root, quality: ring };
}

/**
 * Wheel rotation (degrees, clockwise-positive, in (-180, 180]) that brings the
 * assumed key's slot to 12 o'clock. Slot 0 (C) is at the top unrotated.
 */
export function wheelRotation(assumed: MusicalKey | null): number {
  if (!assumed) return 0;
  const deg = (360 - keySlot(assumed) * SLOT_DEGREES) % 360;
  return deg > 180 ? deg - 360 : deg;
}

/** The angle congruent to `target` (mod 360) nearest `previous`, so the wheel takes the short way round. */
export function nearestAngle(previous: number, target: number): number {
  let delta = ((target - previous) % 360 + 360) % 360;
  if (delta > 180) delta -= 360;
  return previous + delta;
}

export type KeyState = 'assumed' | 'plausible' | 'impossible';

export type ChordState =
  /** Used, and diatonic to the assumed key — bright red. */
  | 'usedDiatonic'
  /** Used, but borrowed from outside the assumed key — light red. */
  | 'usedBorrowed'
  /** Unused, diatonic to the assumed key — white. */
  | 'diatonic'
  /** Unused, outside the assumed key but inside another plausible one — light gray. */
  | 'possible'
  /** Unused, in none of the plausible keys — dark gray. */
  | 'impossible';

export interface WheelCell {
  ring: WheelRing;
  slot: number;
  triad: Triad;
  /** The key this cell is the tonic of (outer/middle rings only). */
  key: MusicalKey | null;
  chordState: ChordState;
  keyState: KeyState | null;
  /** In Auto, a plausible key can be tapped to become the assumed key. */
  tappable: boolean;
}

export interface KeyWheel extends KeyResolution {
  rotation: number;
  cells: WheelCell[];
}

export function chordState(triad: Triad, assumed: MusicalKey | null, plausible: MusicalKey[], used: Triad[]): ChordState {
  const isUsed = used.some((u) => triadId(u) === triadId(triad));
  const inAssumed = !!assumed && isDiatonic(triad, assumed);
  if (isUsed) return inAssumed ? 'usedDiatonic' : 'usedBorrowed';
  if (inAssumed) return 'diatonic';
  return plausible.some((k) => isDiatonic(triad, k)) ? 'possible' : 'impossible';
}

export function keyState(key: MusicalKey, assumed: MusicalKey | null, plausible: MusicalKey[]): KeyState {
  if (sameKey(key, assumed)) return 'assumed';
  return isPlausibleKey(key, plausible) ? 'plausible' : 'impossible';
}

/** Everything the Circle of Fifths needs to draw itself for a song. */
export function buildKeyWheel(song: Song): KeyWheel {
  const resolution = resolveAssumedKey(song.key, usedPitchClasses(song), pitchClassHistogram(song));
  const { assumed, plausible, mode } = resolution;
  const used = usedChords(song);
  const cells: WheelCell[] = [];
  for (const ring of WHEEL_RINGS) {
    for (let slot = 0; slot < WHEEL_SLOTS; slot++) {
      const triad = slotTriad(ring, slot);
      const key = cellKey(ring, slot);
      const state = key ? keyState(key, assumed, plausible) : null;
      cells.push({
        ring,
        slot,
        triad,
        key,
        chordState: chordState(triad, assumed, plausible, used),
        keyState: state,
        // Manual mode: any tonic re-selects the manual key. Auto: only plausible ones.
        tappable: !!key && (mode === 'manual' || state !== 'impossible'),
      });
    }
  }
  return { ...resolution, rotation: wheelRotation(assumed), cells };
}
