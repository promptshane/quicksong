import { useRef } from 'react';
import { loopRange, songBeats } from '../model/time';
import type { Song } from '../model/types';
import { setSongLoop } from '../state/actions';
import { useHorizontalDrag } from './useHorizontalDrag';

interface LoopBarProps {
  song: Song;
  pxPerBeat: number;
  selected: boolean;
  onSelect: (selected: boolean) => void;
}

/** Zoomed in this far (px per beat), loop edges snap to beats instead of bars. */
const BEAT_SNAP_PX = 100;

let gestures = 0;

/**
 * The golden loop region in the ruler — what Play keeps looping. It covers the
 * whole song until changed. Tap it to select it; then drag its ends to resize
 * it or its middle to move it. Unselected, a swipe over it scrolls.
 */
export function LoopBar({ song, pxPerBeat, selected, onSelect }: LoopBarProps) {
  const range = loopRange(song);
  const total = songBeats(song);
  const unit = pxPerBeat >= BEAT_SNAP_PX ? 1 : song.timeSignature.beatsPerBar;
  const snap = (beat: number) => Math.round(beat / unit) * unit;
  const origin = useRef({ start: range.start, end: range.end, key: '' });
  const begin = () => {
    gestures += 1;
    origin.current = { start: range.start, end: range.end, key: `loop:${gestures}` };
  };

  const body = useHorizontalDrag(
    {
      onStart: begin,
      onMove: (dx) => {
        const o = origin.current;
        const length = o.end - o.start;
        const start = Math.max(0, Math.min(total - length, o.start + snap(dx / pxPerBeat)));
        setSongLoop(start, start + length, o.key);
      },
      onEnd: (moved) => {
        if (!moved) onSelect(!selected);
      },
    },
    selected,
  );
  const startEdge = useHorizontalDrag({
    onStart: begin,
    onMove: (dx) => {
      const o = origin.current;
      setSongLoop(Math.max(0, Math.min(o.end - unit, snap(o.start + dx / pxPerBeat))), o.end, o.key);
    },
  });
  const endEdge = useHorizontalDrag({
    onStart: begin,
    onMove: (dx) => {
      const o = origin.current;
      setSongLoop(o.start, Math.min(total, Math.max(o.start + unit, snap(o.end + dx / pxPerBeat))), o.key);
    },
  });

  const left = range.start * pxPerBeat;
  const width = (range.end - range.start) * pxPerBeat;
  return (
    <>
      <div
        className={`loop-bar ${selected ? 'selected' : ''} ${range.whole ? 'whole' : ''}`}
        style={{ left, width }}
        {...body}
        role="button"
        aria-label={selected ? 'Loop region (drag to move)' : 'Loop region'}
        aria-pressed={selected}
        data-testid="loop-bar"
      />
      {selected && (
        <>
          <div className="loop-edge start" style={{ left }} {...startEdge} role="slider" aria-label="Loop start" aria-valuenow={range.start} data-testid="loop-start">
            <span />
          </div>
          <div className="loop-edge end" style={{ left: left + width }} {...endEdge} role="slider" aria-label="Loop end" aria-valuenow={range.end} data-testid="loop-end">
            <span />
          </div>
          {!range.whole && (
            <button
              className="loop-reset"
              style={{ left: left + width + 14 }}
              onClick={(e) => {
                e.stopPropagation();
                setSongLoop(0, total);
              }}
              data-testid="loop-whole-song"
            >
              Whole song
            </button>
          )}
        </>
      )}
    </>
  );
}
