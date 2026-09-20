import { useEffect, useRef } from 'react';
import { isBlackKey } from '../model/music';
import { useStore } from '../state/store';
import { KEYBOARD_SPAN } from './Keyboard';

export const KEYBOARD_MIN_BASE = 24;
export const KEYBOARD_MAX_BASE = 84;

/** Lowest key must be a white key so the black keys sit between whites. */
export function snapBaseToWhiteKey(midi: number): number {
  let base = Math.max(KEYBOARD_MIN_BASE, Math.min(KEYBOARD_MAX_BASE, Math.round(midi)));
  while (isBlackKey(base)) base -= 1;
  return base;
}

/**
 * Where the keyboard should move so `midi` is visible, or null if it already
 * is. The note is re-centred rather than nudged to the edge, which gives
 * ±6 semitones of slack before the next shift — that, plus the stability
 * requirement in the hook, is what stops the keyboard flapping between two
 * ranges when a melody sits around a boundary note.
 */
export function followBase(currentBase: number, midi: number): number | null {
  if (midi >= currentBase && midi <= currentBase + KEYBOARD_SPAN) return null;
  return snapBaseToWhiteKey(midi - KEYBOARD_SPAN / 2);
}

const STABLE_FRAMES = 3;
const MIN_SHIFT_GAP_MS = 700;

/**
 * Moves the keyboard octave to keep the live hummed note visible.
 * `frame` ticks once per detection frame so the effect re-evaluates while a
 * note is held. Only shifts once the out-of-range note has persisted for a
 * few frames and at least MIN_SHIFT_GAP_MS since the previous shift.
 */
export function useKeyboardFollow(liveMidi: number | null, frame: number, enabled: boolean): void {
  const outsideFrames = useRef(0);
  const lastShift = useRef(0);

  useEffect(() => {
    if (!enabled || liveMidi == null) {
      outsideFrames.current = 0;
      return;
    }
    const { keyboardBase, setKeyboardBase } = useStore.getState();
    const next = followBase(keyboardBase, liveMidi);
    if (next == null) {
      outsideFrames.current = 0;
      return;
    }
    outsideFrames.current += 1;
    const now = Date.now();
    if (outsideFrames.current >= STABLE_FRAMES && now - lastShift.current >= MIN_SHIFT_GAP_MS) {
      setKeyboardBase(next);
      lastShift.current = now;
      outsideFrames.current = 0;
    }
  }, [liveMidi, frame, enabled]);
}
