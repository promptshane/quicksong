import { useEffect } from 'react';
import { transport, useTransport } from '../audio/transport';
import { DRUM_PIECES } from '../model/drums';
import { findDrumLayer } from '../model/song';
import type { DrumLoopSettings } from '../model/types';
import { auditionDrum, playSong, setDrumLoop } from '../state/actions';
import { useStore } from '../state/store';
import { Timeline } from './Timeline';
import { UndoRedo } from './UndoRedo';

/**
 * Editor for a drum layer: place kick, snare and hi-hat hits on the grid, or
 * repeat a phrase with an optional variation or gap. The pads below preview
 * each drum before placing it.
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
        <DrumLoopControls layerId={layer.id} loop={layer.loop} />
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

function DrumLoopControls({ layerId, loop }: { layerId: string; loop?: DrumLoopSettings }) {
  if (!loop) {
    return (
      <div className="drum-loop-setup">
        <div className="panel-label">Repeating pattern</div>
        <div className="panel-hint compact">Repeat the first bar, then choose how long it runs, where it varies, or when it drops out.</div>
        <button className="btn small" onClick={() => setDrumLoop(layerId, { patternBars: 1, repeatCount: 4 })}>
          Repeat first bar 4 times
        </button>
      </div>
    );
  }

  const update = (patch: Partial<DrumLoopSettings>) => setDrumLoop(layerId, { ...loop, ...patch });
  const repeatOptions = [...new Set([...Array.from({ length: 16 }, (_, i) => i + 1), ...(loop.repeatCount ? [loop.repeatCount] : [])])].sort((a, b) => a - b);
  const countLabel = (n: number) => `${n} ${n === 1 ? 'loop' : 'loops'}`;

  return (
    <div className="drum-loop-setup active">
      <div className="drum-loop-heading">
        <div className="panel-label">Repeating pattern</div>
        <button className="btn ghost small" onClick={() => setDrumLoop(layerId, null)}>Turn off</button>
      </div>
      <div className="drum-loop-options">
        <label>
          <span>Pattern</span>
          <select
            value={loop.patternBars}
            onChange={(e) => update({ patternBars: Number(e.target.value) })}
            aria-label="Drum pattern length"
          >
            {[1, 2, 3, 4, 8].map((bars) => <option key={bars} value={bars}>{bars} {bars === 1 ? 'bar' : 'bars'}</option>)}
          </select>
        </label>
        <label>
          <span>Run</span>
          <select
            value={loop.repeatCount ?? 0}
            onChange={(e) => update({ repeatCount: Number(e.target.value) || null })}
            aria-label="Drum loop duration"
          >
            {repeatOptions.map((n) => <option key={n} value={n}>{countLabel(n)}</option>)}
            <option value={0}>To song end</option>
          </select>
        </label>
        <label>
          <span>Variation</span>
          <select
            value={loop.variationEvery ?? 0}
            onChange={(e) => update({ variationEvery: Number(e.target.value) || undefined })}
            aria-label="Drum loop variation"
          >
            <option value={0}>Off</option>
            {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>Every {n} loops</option>)}
          </select>
        </label>
        <label>
          <span>Cut out</span>
          <select
            value={loop.break?.startLoop ?? 0}
            onChange={(e) => {
              const startLoop = Number(e.target.value);
              update({ break: startLoop ? { startLoop, length: loop.break?.length ?? 1 } : undefined });
            }}
            aria-label="Loop to cut out"
          >
            <option value={0}>Never</option>
            {repeatOptions.filter((n) => n > 1).map((n) => <option key={n} value={n}>Loop {n}</option>)}
          </select>
        </label>
        {loop.break && (
          <label>
            <span>For</span>
            <select
              value={loop.break.length}
              onChange={(e) => update({ break: { ...loop.break!, length: Number(e.target.value) } })}
              aria-label="Length of drum loop break"
            >
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{countLabel(n)}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="panel-hint compact">
        {loop.variationEvery
          ? `Edit the highlighted ${loop.variationEvery}${loop.variationEvery === 2 ? 'nd' : loop.variationEvery === 3 ? 'rd' : 'th'} loop on the timeline; later matching loops reuse it.`
          : 'Edit any repeat on the timeline to change the main pattern.'}
      </div>
    </div>
  );
}
