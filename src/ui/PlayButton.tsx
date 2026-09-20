import { transport, useTransport } from '../audio/transport';
import { songBeats } from '../model/time';
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

    const endBeat = songBeats(song);

    const playLoop = () => {
      void transport.play(song, 0, {
        endBeat,
        onEnd: playLoop,
      });
    };

    playLoop();
  };

  return (
    <button
      className={`play-btn ${small ? 'small' : ''}`}
      onClick={toggle}
      aria-label={playing ? 'Pause' : 'Play'}
      data-testid="play"
    >
      {playing ? '❚❚' : '▶'}
    </button>
  );
}
