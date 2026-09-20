import { transport, useTransport } from '../audio/transport';
import { useStore } from '../state/store';

/** Play/pause the whole song from the cursor. */
export function PlayButton({ small = false }: { small?: boolean }) {
  const playing = useTransport((s) => s.playing);
  const toggle = () => {
    const { song, cursorBeat } = useStore.getState();
    if (transport.isPlaying) transport.stop(cursorBeat);
    else void transport.play(song, cursorBeat);
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
