import type { HumState } from '../pitch/useHumming';

interface HumOverlayProps {
  state: HumState;
  onStop: () => void;
  onMetronome: (on: boolean) => void;
}

export function HumOverlay({ state, onStop, onMetronome }: HumOverlayProps) {
  if (!state.active) return null;
  return (
    <div className="hum-overlay" data-testid="hum-overlay">
      <div className="hum-status">
        <span className="hum-dot" />
        Listening — hum or sing
      </div>
      <div className={`hum-note ${state.liveNote ? '' : 'idle'}`}>{state.liveNote ?? '…'}</div>
      <div className="hum-meter">
        <div style={{ width: `${state.level * 100}%` }} />
      </div>
      <div className="hum-status">
        {state.captured} note{state.captured === 1 ? '' : 's'} captured
      </div>
      <button className="btn primary round" style={{ minWidth: 160, minHeight: 56 }} onClick={onStop} data-testid="hum-stop">
        ■ Stop
      </button>
      <button className={`btn small ${state.metronome ? 'active' : 'ghost'}`} onClick={() => onMetronome(!state.metronome)}>
        Click {state.metronome ? 'on' : 'off'}
      </button>
    </div>
  );
}
