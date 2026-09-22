import type { CSSProperties } from 'react';
import { scaleDegree } from '../model/keys';
import type { MusicalKey } from '../model/types';

/**
 * Colour for a scale degree of the song's key, in rainbow order:
 * I red, ii orange, iii yellow, IV green, V blue, vi violet, vii pink.
 * The same chord is the same colour on every instrument and screen; anything
 * outside the key is neutral gray. Values live in CSS (`--deg-*`).
 */
export function degreeColor(degree: number | null): string {
  return degree === null ? 'var(--deg-out)' : `var(--deg-${degree})`;
}

/** Key colour of a pitch class (a chord root or a note); undefined with no key to read it in. */
export function toneColor(pc: number, key: MusicalKey | null | undefined): string | undefined {
  return key ? degreeColor(scaleDegree(pc, key)) : undefined;
}

/** Inline style exposing a key colour to CSS as `--tone`. */
export function toneStyle(color: string | undefined, extra: CSSProperties = {}): CSSProperties {
  return color ? ({ ...extra, '--tone': color } as CSSProperties) : extra;
}
