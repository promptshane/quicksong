import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTransport } from '../audio/transport';
import { eventLabel } from '../model/labels';
import { eventRootPitchClass, isLoopOn } from '../model/song';
import { DRUM_PIECES } from '../model/drums';
import { eighthBeats, evenPhraseBars, loopRange, positionLabel, snapToEighth, songBars, songBeats } from '../model/time';
import type { AnyEvent, AnyLayer, MusicalKey, PianoEvent, Song } from '../model/types';
import { addTimelineSlot, auditionDrum, deleteEvent, moveEvent, setEventVelocity } from '../state/actions';
import { useStore } from '../state/store';
import { toneColor, toneStyle } from './degreeColor';
import { EdgeHandles } from './EdgeHandles';
import { HitShape } from './HitShape';
import { LoopBar } from './LoopBar';
import { DRUM_ROW_HEIGHT, DrumLane } from './DrumLane';
import { Sheet } from './Sheet';
import { isPinching, useTimelineZoom } from './useTimelineZoom';

const ADD_SLOT_WIDTH = 82;
const DRAG_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 550;

interface TimelineProps {
  song: Song;
  layer: AnyLayer;
  /** Colour blocks by their place in this key (see degreeColor). */
  colorKey?: MusicalKey | null;
}

/** A piano hit: its name, then the strike and sustain drawn below it. */
function PianoStrike({ event }: { event: PianoEvent }) {
  return (
    <>
      <span className="piano-label">{eventLabel(event)}</span>
      <HitShape velocity={event.velocity} className="piano-hit" />
    </>
  );
}

/** Loop length for the ruler badge: "⟲ 4 bars", with a hint when it is not an even phrase. */
function loopBadgeText(song: Song): { text: string; even: boolean } {
  if (!isLoopOn(song)) return { text: 'Loop off · Play starts at the cursor', even: false };
  const range = loopRange(song);
  const perBar = song.timeSignature.beatsPerBar;
  const beats = range.end - range.start;
  const bars = beats / perBar;
  if (Math.abs(bars - Math.round(bars)) > 1e-6) return { text: `⟲ ${beats} beats`, even: false };
  const whole = Math.round(bars);
  const even = evenPhraseBars(whole);
  const label = `⟲ ${whole} bar${whole === 1 ? '' : 's'}`;
  if (even === whole) return { text: label, even: true };
  // Only the whole-song loop grows by adding slots.
  return { text: range.whole ? `${label} · +${even - whole} for an even ${even}` : label, even: false };
}

/**
 * Zoomable, horizontally scrollable timeline for one layer. Tap empty space to
 * set the cursor; tap a block to select it; drag the *selected* block to move
 * it, or its edge handles to change where it starts and ends; hold a block to
 * reveal deletion. Swiping across unselected blocks scrolls the timeline (CSS
 * `touch-action: pan-x`), so changing something always takes a deliberate tap
 * first. Pinch to zoom. The golden bar in the ruler is the loop region.
 */
export function Timeline({ song, layer, colorKey = null }: TimelineProps) {
  const selectedId = useStore((s) => s.selectedEventId);
  const cursor = useStore((s) => s.cursorBeat);
  const select = useStore((s) => s.select);
  const setCursor = useStore((s) => s.setCursor);
  const playhead = useTransport((s) => s.playheadBeat);
  const playing = useTransport((s) => s.playing);
  const [deleteTarget, setDeleteTarget] = useState<AnyEvent | null>(null);
  const [loopPicked, setLoopSelected] = useState(false);

  const ts = song.timeSignature;
  const innerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pxPerBar = useTimelineZoom(scrollRef, ts.beatsPerBar);
  const pxPerBeat = pxPerBar / ts.beatsPerBar;
  const bars = songBars(song);
  const totalBeats = songBeats(song);
  const contentWidth = bars * pxPerBar;
  const badge = loopBadgeText(song);
  const loop = loopRange(song);
  const width = contentWidth + ADD_SLOT_WIDTH;
  const step = eighthBeats(ts);
  const selected = (layer.events as AnyEvent[]).find((e) => e.id === selectedId) ?? null;

  // Selecting a block and selecting the loop are exclusive.
  const loopSelected = loopPicked && selectedId === null;

  // Keep the cursor (or the playhead while playing) in view. Zooming alone
  // does not re-follow: the pinch keeps its own point steady.
  const followBeat = playing ? playhead : cursor;
  const pxPerBeatRef = useRef(pxPerBeat);
  useEffect(() => {
    pxPerBeatRef.current = pxPerBeat;
  }, [pxPerBeat]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = followBeat * pxPerBeatRef.current;
    const left = el.scrollLeft;
    const viewportWidth = el.clientWidth;
    if (x < left + 16 || x > left + viewportWidth - 48) {
      el.scrollTo({ left: Math.max(0, x - viewportWidth * 0.25), behavior: playing ? 'auto' : 'smooth' });
    }
  }, [followBeat, playing]);

  const beatAtClientX = (clientX: number) => {
    const rect = innerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, (clientX - rect.left) / pxPerBeat);
  };

  const onLaneClick = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('.block, .add-slot, .edge-handle, .loop-bar, .loop-edge, .loop-reset')) return;
    const beat = snapToEighth(beatAtClientX(e.clientX), ts);
    setCursor(Math.min(beat, totalBeats - step));
    select(null);
    setLoopSelected(false);
  };

  const drag = useRef<{
    id: string;
    startX: number;
    startBeat: number;
    moved: boolean;
    /** Only the already-selected block can be dragged; others scroll. */
    draggable: boolean;
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
      draggable: ev.id === selectedId,
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
    if (!pending.draggable) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointer: dragging still works via the element's own move/up handlers.
    }
  };

  const onBlockPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.longPressed) return;
    if (isPinching()) {
      onBlockPointerCancel();
      return;
    }
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    clearLongPressTimer();
    d.moved = true;
    if (!d.draggable) return; // a swipe across the timeline, not a move
    const beat = Math.max(0, snapToEighth(d.startBeat + dx / pxPerBeat, ts));
    d.el.style.left = `${beat * pxPerBeat}px`;
  };

  const onBlockPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    clearLongPressTimer();
    drag.current = null;
    if (!d || d.longPressed) return;
    if (d.moved) {
      if (!d.draggable) return;
      const beat = Math.max(0, snapToEighth(d.startBeat + (e.clientX - d.startX) / pxPerBeat, ts));
      d.el.style.left = '';
      moveEvent(layer.id, d.id, beat);
      select(d.id);
    } else {
      select(d.id);
      setCursor(d.startBeat);
      setLoopSelected(false);
    }
  };

  // Also fires when the browser takes a swipe over for native scrolling.
  const onBlockPointerCancel = () => {
    const d = drag.current;
    clearLongPressTimer();
    drag.current = null;
    if (d?.draggable) d.el.style.left = '';
  };

  // Denser grid the further in you zoom: bars only, then beats, then eighths.
  const gridLines = [];
  for (let b = 0; b < totalBeats; b += step) {
    const isBar = Math.abs(b % ts.beatsPerBar) < 1e-6;
    const isBeat = Math.abs(b % 1) < 1e-6;
    const visible = isBar || (isBeat && pxPerBeat >= 24) || pxPerBeat * step >= 40;
    if (!visible) continue;
    gridLines.push(
      <div key={b} className={`grid-line ${isBar ? 'bar' : isBeat ? '' : 'eighth'}`} style={{ left: b * pxPerBeat }} />,
    );
  }

  return (
    <>
      <div className={`timeline-wrap ${layer.type === 'drums' ? 'drums' : ''}`}>
        {/* Drum row names stay put while the grid scrolls under them. */}
        {layer.type === 'drums' && (
          <div className="drum-row-labels" aria-hidden>
            {DRUM_PIECES.map((p) => (
              <span key={p.piece} style={{ height: DRUM_ROW_HEIGHT }}>
                {p.label}
              </span>
            ))}
          </div>
        )}
        <div className="timeline" data-testid="timeline" ref={scrollRef}>
          <div className="timeline-inner" ref={innerRef} style={{ width, minWidth: '100%' }} onClick={onLaneClick}>
            <div className="ruler" style={{ width: contentWidth, right: 'auto' }}>
              {Array.from({ length: bars }, (_, i) => (
                <span key={i} className="bar-label" style={{ left: i * pxPerBar }}>
                  {i + 1}
                </span>
              ))}
              {/* Playback loops the region; an even phrase (1, 2, 4, 8…) loops most naturally. */}
              <span className={`loop-badge ${badge.even ? 'even' : ''}`} data-testid="loop-badge">
                {badge.text}
              </span>
              <LoopBar
                song={song}
                pxPerBeat={pxPerBeat}
                selected={loopSelected}
                onSelect={(on) => {
                  setLoopSelected(on);
                  if (on) select(null);
                }}
              />
            </div>
            {gridLines}
            <div className="lane" style={{ width: contentWidth, right: 'auto' }}>
              {/* Outside a custom loop region the lane is shaded (only while looping). */}
              {!loop.whole && isLoopOn(song) && (
                <>
                  <div className="loop-shade" style={{ left: 0, width: loop.start * pxPerBeat }} />
                  <div className="loop-shade" style={{ left: loop.end * pxPerBeat, right: 0 }} />
                </>
              )}
              {layer.type === 'drums' && (
                <DrumLane
                  layer={layer}
                  totalBeats={totalBeats}
                  pxPerBeat={pxPerBeat}
                  step={step}
                  timeSignature={ts}
                  onHoldHit={setDeleteTarget}
                />
              )}
              {layer.type !== 'drums' && (layer.events as AnyEvent[]).map((ev) => {
                const tone = toneColor(eventRootPitchClass(ev), colorKey);
                return (
                  <div
                    key={ev.id}
                    className={`block ${ev.kind} ${ev.id === selectedId ? 'selected' : ''} ${
                      ev.kind === 'chord' && ev.quality === 'note' ? 'seed' : ''
                    } ${tone ? 'keyed' : ''}`}
                    style={toneStyle(tone, { left: ev.start * pxPerBeat, width: Math.max(18, ev.duration * pxPerBeat - 2) })}
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
                );
              })}
              {selected && layer.type !== 'drums' && <EdgeHandles key={selected.id} layerId={layer.id} event={selected} pxPerBeat={pxPerBeat} timeSignature={ts} />}
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
      </div>

      {deleteTarget && (
        <Sheet
          title={deleteTarget.kind === 'drum' ? `${eventLabel(deleteTarget)} at ${positionLabel(deleteTarget.start, ts)}` : `Delete ${eventLabel(deleteTarget)}?`}
          onClose={() => setDeleteTarget(null)}
        >
          {deleteTarget.kind === 'drum' && <DrumHitVelocity layerId={layer.id} hitId={deleteTarget.id} />}
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

/** Velocity of one held drum hit; one drag is one Undo step, heard on release. */
function DrumHitVelocity({ layerId, hitId }: { layerId: string; hitId: string }) {
  const hit = useStore((s) => s.song.drums.layers.find((l) => l.id === layerId)?.events.find((e) => e.id === hitId));
  const gesture = useRef(0);
  if (!hit) return null;
  return (
    <div className="panel-section">
      <div className="panel-label">
        <span>Velocity</span>
        <span data-testid="drum-velocity-value">{Math.round(hit.velocity * 100)}</span>
      </div>
      <input
        type="range"
        min={10}
        max={100}
        value={Math.round(hit.velocity * 100)}
        onPointerDown={() => (gesture.current += 1)}
        onChange={(e) => setEventVelocity(layerId, hitId, Number(e.target.value) / 100, `drumvel:${hitId}:${gesture.current}`)}
        onPointerUp={() => auditionDrum(hit.piece, hit.velocity)}
        aria-label="Velocity"
        data-testid="drum-velocity"
      />
    </div>
  );
}
