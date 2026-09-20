import { isBlackKey, midiToName, pitchClassOf } from '../model/music';
import type { PitchClass } from '../model/types';
import { useStore } from '../state/store';

interface KeyboardProps {
  onKey: (midi: number) => void;
  /** MIDI note currently detected from the mic — shown red. */
  liveMidi?: number | null;
  /** Pitch classes outside every still-plausible key — shown dimmed. */
  dimmed?: Set<PitchClass>;
}

export const KEYBOARD_SPAN = 12;

/**
 * Compact one-octave keyboard (13 keys) with octave shift.
 *
 * Visual states, in priority order: live hummed note (red) > touch feedback
 * (:active) > out-of-key guidance (dimmed) > normal. Dimmed keys stay fully
 * interactive — the dimming is a hint, never a lock.
 */
export function Keyboard({ onKey, liveMidi = null, dimmed }: KeyboardProps) {
  const base = useStore((s) => s.keyboardBase);
  const keys = Array.from({ length: KEYBOARD_SPAN + 1 }, (_, i) => base + i);
  const whites = keys.filter((m) => !isBlackKey(m));

  const classes = (midi: number, black: boolean) =>
    [
      'key',
      black ? 'black' : '',
      dimmed?.has(pitchClassOf(midi)) ? 'dim' : '',
      liveMidi === midi ? 'live' : '',
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <div className="keyboard" data-testid="keyboard">
      {whites.map((midi) => (
        <button key={midi} className={classes(midi, false)} onPointerDown={() => onKey(midi)} aria-label={midiToName(midi)} data-midi={midi}>
          {midiToName(midi)}
        </button>
      ))}
      {keys
        .filter((m) => isBlackKey(m))
        .map((midi) => {
          // Position black keys between their neighbouring whites.
          const whiteIndex = whites.findIndex((w) => w > midi);
          const left = `${(whiteIndex / whites.length) * 100 - 4.5}%`;
          return (
            <button
              key={midi}
              className={classes(midi, true)}
              style={{ left }}
              onPointerDown={() => onKey(midi)}
              aria-label={midiToName(midi)}
              data-midi={midi}
            >
              {midiToName(midi)}
            </button>
          );
        })}
    </div>
  );
}
