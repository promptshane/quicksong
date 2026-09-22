import { useRef } from 'react';
import { findAnyLayer } from '../model/song';
import { eighthBeats, snapToEighth } from '../model/time';
import type { AnyEvent, TimeSignature } from '../model/types';
import { auditionEvent, resizeEvent } from '../state/actions';
import { useStore } from '../state/store';
import { useHorizontalDrag } from './useHorizontalDrag';

interface EdgeHandlesProps {
  layerId: string;
  event: AnyEvent;
  pxPerBeat: number;
  timeSignature: TimeSignature;
}

let gestures = 0;

/**
 * Grips on both ends of the selected block. Drag the start to change where it
 * begins (its end stays put); drag the end to lengthen or shorten it. Snaps to
 * the eighth-note grid; one drag is one Undo step, and the result is played
 * on release.
 */
export function EdgeHandles({ layerId, event, pxPerBeat, timeSignature }: EdgeHandlesProps) {
  const step = eighthBeats(timeSignature);
  const origin = useRef({ start: event.start, end: event.start + event.duration, key: '' });
  const begin = () => {
    gestures += 1;
    origin.current = { start: event.start, end: event.start + event.duration, key: `edge:${event.id}:${gestures}` };
  };
  const hear = (moved: boolean) => {
    if (!moved) return;
    const { song } = useStore.getState();
    const latest = (findAnyLayer(song, layerId)?.events as AnyEvent[] | undefined)?.find((e) => e.id === event.id);
    if (latest) auditionEvent(latest, song.bpm);
  };

  const startDrag = useHorizontalDrag({
    onStart: begin,
    onMove: (dx) => {
      const o = origin.current;
      const start = Math.min(Math.max(0, snapToEighth(o.start + dx / pxPerBeat, timeSignature)), o.end - step);
      resizeEvent(layerId, event.id, start, o.end - start, o.key);
    },
    onEnd: hear,
  });
  const endDrag = useHorizontalDrag({
    onStart: begin,
    onMove: (dx) => {
      const o = origin.current;
      const end = Math.max(o.start + step, snapToEighth(o.end + dx / pxPerBeat, timeSignature));
      resizeEvent(layerId, event.id, o.start, end - o.start, o.key);
    },
    onEnd: hear,
  });

  return (
    <>
      <div
        className="edge-handle start"
        style={{ left: event.start * pxPerBeat }}
        {...startDrag}
        role="slider"
        aria-label="Drag to change where it starts"
        aria-valuenow={event.start}
        data-testid="edge-start"
      >
        <span />
      </div>
      <div
        className="edge-handle end"
        style={{ left: (event.start + event.duration) * pxPerBeat }}
        {...endDrag}
        role="slider"
        aria-label="Drag to change where it ends"
        aria-valuenow={event.start + event.duration}
        data-testid="edge-end"
      >
        <span />
      </div>
    </>
  );
}
