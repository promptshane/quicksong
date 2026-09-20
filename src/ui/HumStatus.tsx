import { midiToName } from '../model/music';
import type { HumState } from '../pitch/useHumming';

interface HumStatusProps {
  state: HumState;
  onMetronome: (on: boolean) => void;
}

/**
 * Compact strip shown above the keyboard while the mic is open. Says
 * clearly whether we are only listening (preview) or recording a take.
 */
export function HumStatus({ state, onMetronome }: HumStatusProps) {
  if (!state.mode) return null;
  const recording = state.mode === 'record';
  return (
    <div className={`hum-status-bar ${recording ? 'recording' : ''}`} data-testid="hum-status" data-mode={state.mode}>
      <span className="hum-dot" />
      <span className="hum-mode">{recording ? 'Recording' : 'Listening'}</span>
      <span className="hum-live" data-testid="hum-live">
        {state.liveMidi != null ? midiToName(state.liveMidi) : '…'}
      </span>
      <span className="hum-meter">
        <span style={{ width: `${state.level * 100}%` }} />
      </span>
      {recording ? (
        <>
          <span className="hum-count">
            {state.captured} note{state.captured === 1 ? '' : 's'}
          </span>
          <button className={`btn small ${state.metronome ? 'active' : 'ghost'}`} onClick={() => onMetronome(!state.metronome)}>
            Click
          </button>
        </>
      ) : (
        <span className="hum-count">not recording</span>
      )}
    </div>
  );
}
