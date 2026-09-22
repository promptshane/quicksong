import { useRef } from 'react';
import { DRUM_PIECES, drumHitAt } from '../model/drums';
import { eighthSlotLabel, positionLabel } from '../model/time';
import type { DrumHit, DrumLayer, TimeSignature } from '../model/types';
import { toggleDrumCell } from '../state/actions';

const LONG_PRESS_MS = 550;
const MOVE_TOLERANCE_PX = 8;

export const DRUM_ROW_HEIGHT = 30;

interface DrumLaneProps {
  layer: DrumLayer;
  totalBeats: number;
  pxPerBeat: number;
  step: number;
  timeSignature: TimeSignature;
  /** Held an existing hit: show its velocity / delete sheet. */
  onHoldHit: (hit: DrumHit) => void;
}

/**
 * The drum grid inside the timeline: one row per drum (hi-hat, snare, kick)
 * and one cell per eighth note across the whole song. Tap a cell to add a
 * hit, tap a hit to remove it, hold a hit for its velocity. A swipe scrolls
 * the timeline as usual (it never toggles anything).
 */
export function DrumLane({ layer, totalBeats, pxPerBeat, step, timeSignature, onHoldHit }: DrumLaneProps) {
  const hold = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);
  const suppressClick = useRef(false);
  const slots = Math.round(totalBeats / step);
  const width = Math.max(4, step * pxPerBeat - 2);

  const clearHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };

  return (
    <>
      {DRUM_PIECES.map(({ piece, label }, row) =>
        Array.from({ length: slots }, (_, slot) => {
          const start = slot * step;
          const hit = drumHitAt(layer, piece, start);
          const beatInBar = start % timeSignature.beatsPerBar;
          return (
            <button
              key={`${piece}-${slot}`}
              className={`drum-cell ${hit ? 'on' : ''} ${Math.abs(beatInBar - Math.round(beatInBar)) < 1e-6 ? 'on-beat' : ''}`}
              style={{
                left: start * pxPerBeat,
                top: row * DRUM_ROW_HEIGHT + 2,
                width,
                height: DRUM_ROW_HEIGHT - 4,
                opacity: hit ? 0.45 + hit.velocity * 0.55 : undefined,
              }}
              onPointerDown={(e) => {
                clearHold();
                if (!hit) return;
                const h = {
                  x: e.clientX,
                  y: e.clientY,
                  fired: false,
                  timer: setTimeout(() => {
                    h.fired = true;
                    suppressClick.current = true;
                    onHoldHit(hit);
                  }, LONG_PRESS_MS),
                };
                hold.current = h;
              }}
              onPointerMove={(e) => {
                const h = hold.current;
                if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > MOVE_TOLERANCE_PX) clearHold();
              }}
              onPointerUp={clearHold}
              onPointerCancel={clearHold}
              onContextMenu={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation(); // never also move the cursor
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                toggleDrumCell(layer.id, piece, start);
              }}
              aria-pressed={!!hit}
              aria-label={`${label} at ${positionLabel(start, timeSignature)} (${eighthSlotLabel(Math.round(beatInBar / step), timeSignature)})`}
              data-drum-cell={`${piece}-${slot}`}
            />
          );
        }),
      )}
    </>
  );
}
