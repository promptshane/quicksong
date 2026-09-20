import { changeEventDuration, moveEvent, setEventVelocity } from '../state/actions';
import { eighthBeats, positionLabel } from '../model/time';
import type { AnyEvent, TimeSignature } from '../model/types';

interface EventControlsProps {
  layerId: string;
  event: AnyEvent;
  timeSignature: TimeSignature;
}

function durationLabel(beats: number, ts: TimeSignature): string {
  if (beats >= ts.beatsPerBar && Math.abs(beats % ts.beatsPerBar) < 1e-6) {
    const bars = beats / ts.beatsPerBar;
    return `${bars} bar${bars === 1 ? '' : 's'}`;
  }
  return `${Number(beats.toFixed(2))} beat${beats === 1 ? '' : 's'}`;
}

/** Duration, position and velocity — shared by notes and chords. */
export function EventControls({ layerId, event, timeSignature }: EventControlsProps) {
  const step = eighthBeats(timeSignature);
  return (
    <>
      <div className="steppers">
        <div className="stepper">
          <button className="btn small" onClick={() => changeEventDuration(layerId, event.id, -step)} aria-label="Shorter">
            −
          </button>
          <div className="stepper-label">
            {durationLabel(event.duration, timeSignature)}
            <small>length</small>
          </div>
          <button className="btn small" onClick={() => changeEventDuration(layerId, event.id, step)} aria-label="Longer">
            +
          </button>
        </div>
        <div className="stepper">
          <button className="btn small" onClick={() => moveEvent(layerId, event.id, event.start - step)} aria-label="Earlier">
            ◀
          </button>
          <div className="stepper-label">
            {positionLabel(event.start, timeSignature)}
            <small>bar · beat</small>
          </div>
          <button className="btn small" onClick={() => moveEvent(layerId, event.id, event.start + step)} aria-label="Later">
            ▶
          </button>
        </div>
      </div>
      <div className="panel-section">
        <div className="panel-label">
          <span>Velocity</span>
          <span>{Math.round(event.velocity * 100)}</span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round(event.velocity * 100)}
          onChange={(e) => setEventVelocity(layerId, event.id, Number(e.target.value) / 100)}
          aria-label="Velocity"
        />
      </div>
    </>
  );
}
