import { describe, expect, it } from 'vitest';
import { followBase, snapBaseToWhiteKey } from '../src/ui/useKeyboardFollow';

describe('keyboard follow', () => {
  it('leaves the keyboard alone while the note is visible', () => {
    expect(followBase(48, 48)).toBeNull();
    expect(followBase(48, 55)).toBeNull();
    expect(followBase(48, 60)).toBeNull(); // top key is visible too
  });

  it('re-centres on an out-of-range note so nearby notes stay visible', () => {
    const next = followBase(48, 67)!; // G4, above C3–C4
    expect(next).not.toBeNull();
    expect(67).toBeGreaterThanOrEqual(next);
    expect(67).toBeLessThanOrEqual(next + 12);
    // With G4 centred, the notes on either side are visible without another shift.
    expect(followBase(next, 62)).toBeNull();
    expect(followBase(next, 72)).toBeNull();
  });

  it('always starts the keyboard on a white key', () => {
    expect(snapBaseToWhiteKey(49)).toBe(48); // C#3 -> C3
    expect(snapBaseToWhiteKey(51)).toBe(50); // D#3 -> D3
    expect(snapBaseToWhiteKey(53)).toBe(53); // F3
    expect(snapBaseToWhiteKey(10)).toBe(24);
    expect(snapBaseToWhiteKey(100)).toBe(84);
  });
});
