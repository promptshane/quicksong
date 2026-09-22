import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTransport } from '../audio/transport';
import { chordName, midiToName } from '../model/music';
import { pianoChordName } from '../model/piano';
import { eighthBeats, snapToEighth, songBars, songBeats } from '../model/time';
import type { AnyEvent, AnyLayer, PianoEvent, Song } from '../model/types';
import { addTimelineSlot, deleteEvent, moveEvent } from '../state/actions';
import { useStore } from '../state/store';
import { Sheet } from './Sheet';

const PX_PER_BAR = 224;
const ADD_SLOT_WIDTH = 82;
const DRAG_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 550;

interface TimelineProps {
  song: Song;
  layer: AnyLayer;
}

function eventLabel(ev: AnyEvent): string {
  if (ev.kind === 'note') return midiToName(ev.midi);
  if (ev.kind === 'piano') return pianoChordName(ev);
  return chordName(ev.root, ev.quality);
}

/**
 * A piano hit drawn as what it is: a vertical strike whose height is the
 * velocity, then a line ramping down across the sustain to the key release.
 */
function PianoStrike({ event }: { event: PianoEvent }) {
  const top = 100 - Math.round(event.velocity * 100);
  return (
    <>
      <span className="piano-label">{eventLabel(event)}</span>
      <span className="piano-hit" aria-hidden>
        <svg className="piano-sustain" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points={`0,${top} 100,100 0,100`} />
          <line x1="0" y1={top} x2="100" y2="100" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="piano-strike" style={{ height: `${event.velocity * 100}%` }} />
      </span>
    </>
  );
}

/**
 * Zoomed, horizontally scrollable timeline for one layer. Tap empty space to
 * set the cursor; tap a block to select it; drag a block to move it; hold a
 * block to reveal deletion.
 */
export function Timeline({ song, layer }: TimelineProps) {
  const selectedId = useStore((s) => s.selectedEventId);
  const cursor = useStore((s) => s.cursorBeat);
  const select = useStore((s) => s.select);
  const setCursor = useStore((s) => s.setCursor);
  const playhead = useTransport((s) => s.playheadBeat);
  const playing = useTransport((s) => s.playing);
  const [deleteTarget, setDeleteTarget] = useState<AnyEvent | null>(null);

  const ts = song.timeSignature;
  const pxPerBeat = PX_PER_BAR / ts.beatsPerBar;
  const bars = songBars(song);
  const totalBeats = songBeats(song);
  const contentWidth = bars * PX_PER_BAR;
  const width = contentWidth + ADD_SLOT_WIDTH;
  const step = eighthBeats(ts);
  const innerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the cursor (or the playhead while playing) in view.
  const followBeat = playing ? playhead : cursor;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = followBeat * pxPerBeat;
    const left = el.scrollLeft;
    const viewportWidth = el.clientWidth;
    if (x < left + 16 || x > left + viewportWidth - 48) {
      el.scrollTo({ left: Math.max(0, x - viewportWidth * 0.25), behavior: playing ? 'auto' : 'smooth' });
    }
  }, [followBeat, pxPerBeat, playing]);

  const beatAtClientX = (clientX: number) => {
    const rect = innerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, (clientX - rect.left) / pxPerBeat);
  };

  const onLaneClick = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('.block, .add-slot')) return;
    const beat = snapToEighth(beatAtClientX(e.clientX), ts);
    setCursor(Math.min(beat, totalBeats - step));
    select(null);
  };

  const drag = useRef<{
    id: string;
    startX: number;
    startBeat: number;
    moved: boolean;
    longPressed: boolean;
    timer: ReturnType<typeof setTimeout> | null;
    el: HTMLElement;
  } | null>(null);

  const clearLongPressTimer = () => {
    const d = drag.current;
    if (d?.timer) clearTimeout(d.timer);
    if (d) d.timer = null;
  };

  const onBlockPointerDown = (e: ReactPointerEvent<HTMLDivElement>, ev: AnyEvent) => {
    e.stopPropagation();
    const el = e.currentTarget;
    const pending = {
      id: ev.id,
      startX: e.clientX,
      startBeat: ev.start,
      moved: false,
      longPressed: false,
      timer: null as ReturnType<typeof setTimeout> | null,
      el,
    };
    pending.timer = setTimeout(() => {
      if (drag.current !== pending || pending.moved) return;
      pending.longPressed = true;
      select(ev.id);
      setCursor(ev.start);
      setDeleteTarget(ev);
    }, LONG_PRESS_MS);
    drag.current = pending;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointer: dragging still works via the element's own move/up handlers.
    }
  };

  const onBlockPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.longPressed) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    clearLongPressTimer();
    d.moved = true;
    const beat = Math.max(0, snapToEighth(d.startBeat + dx / pxPerBeat, ts));
    d.el.style.left = `${beat * pxPerBeat}px`;
  };

  const onBlockPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    clearLongPressTimer();
    drag.current = null;
    if (!d || d.longPressed) return;
    if (d.moved) {
      const beat = Math.max(0, snapToEighth(d.startBeat + (e.clientX - d.startX) / pxPerBeat, ts));
      d.el.style.left = '';
      moveEvent(layer.id, d.id, beat);
      select(d.id);
    } else {
      select(d.id);
      setCursor(d.startBeat);
    }
  };

  const onBlockPointerCancel = () => {
    clearLongPressTimer();
    drag.current = null;
  };

  const gridLines = [];
  for (let b = 0; b < totalBeats; b += step) {
    const isBar = Math.abs(b % ts.beatsPerBar) < 1e-6;
    const isBeat = Math.abs(b % 1) < 1e-6;
    if (!isBar && !isBeat) continue;
    gridLines.push(<div key={b} className={`grid-line ${isBar ? 'bar' : ''}`} style={{ left: b * pxPerBeat }} />);
  }

  return (
    <>
      <div className="timeline" data-testid="timeline" ref={scrollRef}>
        <div className="timeline-inner" ref={innerRef} style={{ width, minWidth: '100%' }} onClick={onLaneClick}>
          <div className="ruler" style={{ width: contentWidth, right: 'auto' }}>
            {Array.from({ length: bars }, (_, i) => (
              <span key={i} className="bar-label" style={{ left: i * PX_PER_BAR }}>
                {i + 1}
              </span>
            ))}
          </div>
          {gridLines}
          <div className="lane" style={{ width: contentWidth, right: 'auto' }}>
            {(layer.events as AnyEvent[]).map((ev) => (
              <div
                key={ev.id}
                className={`block ${ev.kind} ${ev.id === selectedId ? 'selected' : ''} ${
                  ev.kind === 'chord' && ev.quality === 'note' ? 'seed' : ''
                }`}
                style={{ left: ev.start * pxPerBeat, width: Math.max(18, ev.duration * pxPerBeat - 2) }}
                onPointerDown={(e) => onBlockPointerDown(e, ev)}
                onPointerMove={onBlockPointerMove}
                onPointerUp={onBlockPointerUp}
                onPointerCancel={onBlockPointerCancel}
                data-event-id={ev.id}
                role="button"
                aria-label={eventLabel(ev)}
              >
                {ev.kind === 'piano' ? <PianoStrike event={ev} /> : eventLabel(ev)}
                {ev.kind === 'chord' && ev.quality === 'note' && <small>tap Major/Minor</small>}
              </div>
            ))}
          </div>
          <div className="cursor" style={{ left: cursor * pxPerBeat }} />
          {playing && <div className="playhead" style={{ left: playhead * pxPerBeat }} />}
          <button
            className="add-slot"
            style={{ left: contentWidth + 8 }}
            onClick={(e) => {
              e.stopPropagation();
              addTimelineSlot();
            }}
            data-testid="add-slot"
            aria-label="Add timeline slot"
          >
            <span>＋</span>
            <small>Slot</small>
          </button>
        </div>
      </div>

      {deleteTarget && (
        <Sheet title={`Delete ${eventLabel(deleteTarget)}?`} onClose={() => setDeleteTarget(null)}>
          <button
            className="btn danger wide"
            onClick={() => {
              deleteEvent(layer.id, deleteTarget.id);
              setDeleteTarget(null);
            }}
            data-testid="context-delete-event"
          >
            Delete
          </button>
        </Sheet>
      )}
    </>
  );
}
