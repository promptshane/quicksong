import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useTransport } from '../audio/transport';
import { chordName, midiToName } from '../model/music';
import { eighthBeats, snapToEighth, songBars, songBeats } from '../model/time';
import type { AnyEvent, GuitarLayer, Song } from '../model/types';
import { moveEvent } from '../state/actions';
import { useStore } from '../state/store';

const PX_PER_BAR = 224;
const DRAG_THRESHOLD_PX = 6;

interface TimelineProps {
  song: Song;
  layer: GuitarLayer;
}

function eventLabel(ev: AnyEvent): string {
  return ev.kind === 'note' ? midiToName(ev.midi) : chordName(ev.root, ev.quality);
}

/**
 * Zoomed, horizontally scrollable timeline for one layer. Tap empty space to
 * set the cursor; tap a block to select it; drag a block to move it.
 */
export function Timeline({ song, layer }: TimelineProps) {
  const selectedId = useStore((s) => s.selectedEventId);
  const cursor = useStore((s) => s.cursorBeat);
  const select = useStore((s) => s.select);
  const setCursor = useStore((s) => s.setCursor);
  const playhead = useTransport((s) => s.playheadBeat);
  const playing = useTransport((s) => s.playing);

  const ts = song.timeSignature;
  const pxPerBeat = PX_PER_BAR / ts.beatsPerBar;
  const bars = songBars(song);
  const totalBeats = songBeats(song);
  const width = bars * PX_PER_BAR;
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
    const width = el.clientWidth;
    if (x < left + 16 || x > left + width - 48) {
      el.scrollTo({ left: Math.max(0, x - width * 0.25), behavior: playing ? 'auto' : 'smooth' });
    }
  }, [followBeat, pxPerBeat, playing]);

  const beatAtClientX = (clientX: number) => {
    const rect = innerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, (clientX - rect.left) / pxPerBeat);
  };

  const onLaneClick = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('.block')) return;
    const beat = snapToEighth(beatAtClientX(e.clientX), ts);
    setCursor(Math.min(beat, totalBeats - step));
    select(null);
  };

  const drag = useRef<{ id: string; startX: number; startBeat: number; moved: boolean; el: HTMLElement } | null>(null);

  const onBlockPointerDown = (e: ReactPointerEvent<HTMLDivElement>, ev: AnyEvent) => {
    e.stopPropagation();
    const el = e.currentTarget;
    drag.current = { id: ev.id, startX: e.clientX, startBeat: ev.start, moved: false, el };
    el.setPointerCapture(e.pointerId);
  };

  const onBlockPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    const beat = Math.max(0, snapToEighth(d.startBeat + dx / pxPerBeat, ts));
    d.el.style.left = `${beat * pxPerBeat}px`;
  };

  const onBlockPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
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

  const gridLines = [];
  for (let b = 0; b < totalBeats; b += step) {
    const isBar = Math.abs(b % ts.beatsPerBar) < 1e-6;
    const isBeat = Math.abs(b % 1) < 1e-6;
    if (!isBar && !isBeat) continue;
    gridLines.push(<div key={b} className={`grid-line ${isBar ? 'bar' : ''}`} style={{ left: b * pxPerBeat }} />);
  }

  return (
    <div className="timeline" data-testid="timeline" ref={scrollRef}>
      <div className="timeline-inner" ref={innerRef} style={{ width }} onClick={onLaneClick}>
        <div className="ruler">
          {Array.from({ length: bars }, (_, i) => (
            <span key={i} className="bar-label" style={{ left: i * PX_PER_BAR }}>
              {i + 1}
            </span>
          ))}
        </div>
        {gridLines}
        <div className="lane">
          {layer.events.map((ev) => (
            <div
              key={ev.id}
              className={`block ${ev.kind} ${ev.id === selectedId ? 'selected' : ''} ${
                ev.kind === 'chord' && ev.quality === 'note' ? 'seed' : ''
              }`}
              style={{ left: ev.start * pxPerBeat, width: Math.max(18, ev.duration * pxPerBeat - 2) }}
              onPointerDown={(e) => onBlockPointerDown(e, ev)}
              onPointerMove={onBlockPointerMove}
              onPointerUp={onBlockPointerUp}
              onPointerCancel={() => (drag.current = null)}
              data-event-id={ev.id}
              role="button"
              aria-label={eventLabel(ev)}
            >
              {eventLabel(ev)}
              {ev.kind === 'chord' && ev.quality === 'note' && <small>tap Major/Minor</small>}
            </div>
          ))}
        </div>
        <div className="cursor" style={{ left: cursor * pxPerBeat }} />
        {playing && <div className="playhead" style={{ left: playhead * pxPerBeat }} />}
      </div>
    </div>
  );
}
