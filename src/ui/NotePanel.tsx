import { placeNote, stringNumber } from '../model/chords';
import { midiToName } from '../model/music';
import type { NoteEvent, TimeSignature } from '../model/types';
import { shiftNotePitch } from '../state/actions';
import { EventControls } from './EventControls';

interface NotePanelProps {
  layerId: string;
  note: NoteEvent;
  timeSignature: TimeSignature;
  /** Guitar notes also show where they sit on the neck. */
  instrument: 'guitar' | 'piano';
}

export function NotePanel({ layerId, note, timeSignature, instrument }: NotePanelProps) {
  const pos = placeNote(note.midi);
  return (
    <div className="panel-section" data-testid="note-panel">
      <div className="panel-label">
        <span>Note</span>
        {instrument === 'guitar' && (
          <span>
            string {stringNumber(pos.index)} · fret {pos.fret}
          </span>
        )}
      </div>
      <div className="steppers">
        <div className="stepper">
          <button className="btn small" onClick={() => shiftNotePitch(layerId, note.id, -1)} aria-label="Pitch down">
            ▼
          </button>
          <div className="stepper-label">
            <b data-testid="note-name">{midiToName(note.midi)}</b>
            <small>pitch</small>
          </div>
          <button className="btn small" onClick={() => shiftNotePitch(layerId, note.id, 1)} aria-label="Pitch up">
            ▲
          </button>
        </div>
        <div className="stepper">
          <button className="btn small" onClick={() => shiftNotePitch(layerId, note.id, -12)} aria-label="Octave down">
            ▼
          </button>
          <div className="stepper-label">
            {Math.floor(note.midi / 12) - 1}
            <small>octave</small>
          </div>
          <button className="btn small" onClick={() => shiftNotePitch(layerId, note.id, 12)} aria-label="Octave up">
            ▲
          </button>
        </div>
      </div>
      <EventControls layerId={layerId} event={note} timeSignature={timeSignature} />
    </div>
  );
}
