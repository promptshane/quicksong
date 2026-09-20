import { isBlackKey, midiToName } from '../model/music';
import { useStore } from '../state/store';

interface KeyboardProps {
  onKey: (midi: number) => void;
}

/** Compact one-octave keyboard (C→C, 13 keys) with octave shift. */
export function Keyboard({ onKey }: KeyboardProps) {
  const base = useStore((s) => s.keyboardBase);
  const keys = Array.from({ length: 13 }, (_, i) => base + i);
  const whites = keys.filter((m) => !isBlackKey(m));

  return (
    <div className="keyboard">
      {whites.map((midi) => (
        <button key={midi} className="key" onPointerDown={() => onKey(midi)} aria-label={midiToName(midi)} data-midi={midi}>
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
              className="key black"
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
