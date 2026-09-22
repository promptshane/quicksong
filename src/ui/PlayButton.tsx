import { transport, useTransport } from '../audio/transport';
import { playSong } from '../state/actions';
import { useStore } from '../state/store';

/**
 * Song Home's Play / Pause. Same rule as the editors: loop on = start at the
 * loop region and keep looping it; loop off = play once from the cursor.
 */
export function PlayButton({ small = false }: { small?: boolean }) {
  const playing = useTransport((s) => s.playing);

  const toggle = () => {
    if (transport.isPlaying) transport.stop(useStore.getState().cursorBeat);
    else playSong();
  };

  return (
    <button
      className={`play-btn ${small ? 'small' : ''}`}
      onClick={toggle}
      aria-label={playing ? 'Pause' : 'Play'}
      data-testid="play"
    >
      {playing ? (
        <svg className="play-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="5" width="4.5" height="14" rx="1" />
          <rect x="13.5" y="5" width="4.5" height="14" rx="1" />
        </svg>
      ) : (
        <svg className="play-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.5 5.2v13.6a1 1 0 0 0 1.54.84l10.2-6.8a1 1 0 0 0 0-1.68L9.04 4.36A1 1 0 0 0 7.5 5.2Z" />
        </svg>
      )}
    </button>
  );
}
