import { transport, useTransport } from '../audio/transport';
import { useStore } from '../state/store';

/** Play/pause the whole song from the beginning, looping at the content end. */
export function PlayButton({ small = false }: { small?: boolean }) {
  const playing = useTransport((s) => s.playing);

  const toggle = () => {
    const { song } = useStore.getState();

    if (transport.isPlaying) {
      // Homepage playback always returns to the start when stopped.
      transport.stop(0);
      return;
    }

    // No explicit end: the loop follows slots added or removed while playing.
    void transport.play(song, 0, { loop: true });
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
