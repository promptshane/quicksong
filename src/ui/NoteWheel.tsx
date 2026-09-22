import { NOTE_NAMES } from '../model/music';
import { pianoAddedPitchClasses, pianoChordName, pianoChordTones } from '../model/piano';
import type { PianoEvent, PitchClass } from '../model/types';

interface NoteWheelProps {
  event: PianoEvent;
  /** Pitch classes of the song's key: the natural choices. */
  scale: Set<PitchClass>;
  onToggle: (pc: PitchClass) => void;
}

type NoteState = 'chord' | 'added' | 'key' | 'outside';

/** Position on the ring, 0 = 12 o'clock, clockwise, as percentages of the wheel box. */
function ringPoint(step: number, radius: number): { x: number; y: number } {
  const angle = (step / 12) * 2 * Math.PI;
  return { x: 50 + radius * Math.sin(angle), y: 50 - radius * Math.cos(angle) };
}

const RING_RADIUS = 40;

/**
 * The special-chord wheel. The chord sits in the middle; the twelve notes
 * surround it, starting from the root at the top and rising clockwise, so a
 * chord's shape looks the same in every key. Chord tones are fixed, in-key
 * notes are the bright natural choices, out-of-key notes are quieter but
 * still one tap away. Tapping an added note takes it off again.
 */
export function NoteWheel({ event, scale, onToggle }: NoteWheelProps) {
  const tones = pianoChordTones(event);
  const added = new Set(pianoAddedPitchClasses(event));
  const notes = Array.from({ length: 12 }, (_, step) => {
    const pc = ((event.root + step) % 12) as PitchClass;
    const state: NoteState = tones.has(pc) ? 'chord' : added.has(pc) ? 'added' : scale.has(pc) ? 'key' : 'outside';
    return { pc, step, state };
  });
  const shape = notes
    .filter((n) => n.state === 'chord' || n.state === 'added')
    .map((n) => ringPoint(n.step, RING_RADIUS))
    .map((p) => `${p.x},${p.y}`)
    .join(' ');

  return (
    <div className="note-wheel" data-testid="note-wheel">
      <svg className="note-wheel-shape" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={RING_RADIUS} />
        <polygon points={shape} />
      </svg>
      <div className="note-wheel-hub">
        <b data-testid="wheel-chord-name">{pianoChordName(event)}</b>
      </div>
      {notes.map(({ pc, step, state }) => {
        const p = ringPoint(step, RING_RADIUS);
        return (
          <button
            key={pc}
            className="note-wheel-note"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            data-state={state}
            data-pc={pc}
            disabled={state === 'chord'}
            onClick={() => onToggle(pc)}
            aria-pressed={state === 'chord' || state === 'added'}
            aria-label={
              state === 'chord'
                ? `${NOTE_NAMES[pc]} (in chord)`
                : state === 'added'
                  ? `Remove ${NOTE_NAMES[pc]}`
                  : `Add ${NOTE_NAMES[pc]}`
            }
          >
            {NOTE_NAMES[pc]}
          </button>
        );
      })}
    </div>
  );
}
