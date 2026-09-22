/**
 * Colour for a scale degree of the song's key, in rainbow order:
 * I red, ii orange, iii yellow, IV green, V blue, vi violet, vii pink.
 * The same chord is the same colour on every instrument; anything outside
 * the key is neutral gray. Values live in CSS (`--deg-*`).
 */
export function degreeColor(degree: number | null): string {
  return degree === null ? 'var(--deg-out)' : `var(--deg-${degree})`;
}
