import { NOTE_NAMES } from '../model/music';
import { addedPitchClasses, chordShapeName, chordTonesOf, type ChordShape } from '../model/piano';
import type { PitchClass } from '../model/types';
import { toneStyle } from './degreeColor';

interface NoteWheelProps {
  /** The chord: its standard chord plus every sounding note (piano keys or guitar strings). */
  shape: ChordShape;
  /** Pitch classes of the song's key: the natural choices. */
  scale: Set<PitchClass>;
  /** The chord's key colour, used for its own notes and name. */
  tone?: string;
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
export function NoteWheel({ shape: event, scale, tone, onToggle }: NoteWheelProps) {
  const tones = chordTonesOf(event);
  const added = new Set(addedPitchClasses(event));
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
    <div className="note-wheel" data-testid="note-wheel" style={toneStyle(tone)}>
      <svg className="note-wheel-shape" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={RING_RADIUS} />
        <polygon points={shape} />
      </svg>
      <div className="note-wheel-hub">
        <b data-testid="wheel-chord-name">{chordShapeName(event)}</b>
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
