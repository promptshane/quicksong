import { useEffect } from 'react';
import { transport, useTransport } from '../audio/transport';
import { DRUM_PIECES } from '../model/drums';
import { findDrumLayer } from '../model/song';
import { auditionDrum, playSong } from '../state/actions';
import { useStore } from '../state/store';
import { Timeline } from './Timeline';
import { UndoRedo } from './UndoRedo';

/**
 * Editor for a drum layer: kick, snare and hi-hat hits placed one by one on
 * the eighth-note grid in the timeline. The pads below only play a sound, so
 * each drum can be heard before placing it.
 */
export function DrumsEditor({ layerId }: { layerId: string }) {
  const song = useStore((s) => s.song);
  const layer = findDrumLayer(song, layerId);
  const cursor = useStore((s) => s.cursorBeat);
  const setView = useStore((s) => s.setView);
  const playing = useTransport((s) => s.playing);

  // Undo of adding this layer (or Redo of deleting it) removes it: go back to
  // the Drums page, where Redo/Undo can bring it back.
  useEffect(() => {
    if (!layer) setView({ name: 'drums' });
  }, [layer, setView]);

  if (!layer) return null;

  const togglePlay = () => {
    if (transport.isPlaying) transport.stop(cursor);
    else playSong();
  };

  return (
    <div className="screen editor" data-screen="layer" data-layer-type="drums">
      <div className="header">
        <div className="header-side">
          <button className="btn ghost" onClick={() => setView({ name: 'drums' })} aria-label="Back to drums">
            ‹ Drums
          </button>
        </div>
        <div className="header-title">{layer.name}</div>
        <div className="header-side right">
          <UndoRedo />
        </div>
      </div>

      <Timeline song={song} layer={layer} />

      <div className="panel">
        <div className="panel-hint compact" data-testid="drum-hint">
          Tap a square to add a hit; tap it again to remove it. Hold a hit to set how hard it is played.
        </div>
        <div className="drum-pads">
          {DRUM_PIECES.map((p) => (
            <button key={p.piece} className="btn drum-pad" onClick={() => auditionDrum(p.piece)} data-drum-pad={p.piece}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="editor-bar centered">
        <button className="play-btn small" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} data-testid="play">
          {playing ? '❚❚' : '▶'}
        </button>
      </div>
    </div>
  );
}
