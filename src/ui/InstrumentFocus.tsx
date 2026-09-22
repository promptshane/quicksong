import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { STYLE_LABELS } from '../model/arpeggio';
import { createDrumLayer } from '../model/drums';
import { createPianoLayer, createPianoNotesLayer } from '../model/piano';
import {
  appendLayer,
  assumedKey,
  createLayer,
  duplicateLayer,
  layerKind,
  removeLayer,
  toggleLayerMute,
  type InstrumentId,
} from '../model/song';
import type { AnyLayer, Song } from '../model/types';
import { useStore } from '../state/store';
import { Overview } from './Overview';
import { PlayButton } from './PlayButton';
import { Sheet } from './Sheet';
import { UndoRedo } from './UndoRedo';

type NewKind = 'chords' | 'notes';

interface InstrumentConfig {
  title: string;
  layers: (song: Song) => AnyLayer[];
  /** Guitar and Piano ask Chords or Notes; Drums has one kind and adds it directly. */
  kinds: { kind: NewKind; hint: string }[] | null;
  create: (song: Song, kind: NewKind | null) => AnyLayer;
}

const INSTRUMENTS: Record<InstrumentId, InstrumentConfig> = {
  guitar: {
    title: 'Guitar',
    layers: (song) => song.guitar.layers,
    kinds: [
      { kind: 'chords', hint: 'Pick chords from the key, then strum or pick them' },
      { kind: 'notes', hint: 'Melodies and riffs, by keyboard or humming' },
    ],
    create: (song, kind) => createLayer(kind === 'notes' ? 'single' : 'chords', song),
  },
  piano: {
    title: 'Piano',
    layers: (song) => song.piano.layers,
    kinds: [
      { kind: 'chords', hint: 'Pick chords from the key, then play them together or as arpeggios' },
      { kind: 'notes', hint: 'Melodies, by keyboard or humming' },
    ],
    create: (song, kind) => (kind === 'notes' ? createPianoNotesLayer(song) : createPianoLayer(song)),
  },
  drums: {
    title: 'Drums',
    layers: (song) => song.drums.layers,
    kinds: null,
    create: (song) => createDrumLayer(song),
  },
};

/** "Chords · Strum · 4 chords", "Notes · 12 notes", "Drums · 16 hits". */
function layerSummary(layer: AnyLayer): string {
  const n = layer.events.length;
  const count = (word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const kind = layerKind(layer);
  if (kind === 'drums') return count('hit');
  if (kind === 'notes') return `Notes · ${count('note')}`;
  const style = layer.type === 'chords' || layer.type === 'piano' ? STYLE_LABELS[layer.type === 'piano' ? 'piano' : 'guitar'][layer.style] : '';
  return `Chords · ${style} · ${count('chord')}`;
}

/** An instrument's layer list: add, open, mute, delete, and hold to duplicate. */
export function InstrumentFocus({ instrument }: { instrument: InstrumentId }) {
  const config = INSTRUMENTS[instrument];
  const song = useStore((s) => s.song);
  const commit = useStore((s) => s.commit);
  const setView = useStore((s) => s.setView);
  const layers = config.layers(song);
  const songKey = useMemo(() => assumedKey(song), [song]);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<string | null>(null);
  const longPress = useRef<{
    id: string;
    startX: number;
    startY: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const suppressOpen = useRef<string | null>(null);

  const addLayer = (kind: NewKind | null) => {
    const layer = config.create(song, kind);
    commit((s) => appendLayer(s, layer));
    setPicking(false);
    setView({ name: 'layer', layerId: layer.id, kind: layerKind(layer), instrument });
  };

  const deleteLayer = (id: string) => {
    commit((s) => removeLayer(s, id));
    setConfirmDelete(null);
  };

  const toggleMute = (id: string) => {
    commit((s) => toggleLayerMute(s, id));
  };

  const clearLayerHold = () => {
    if (longPress.current?.timer) clearTimeout(longPress.current.timer);
    longPress.current = null;
  };

  const startLayerHold = (e: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if ((e.target as HTMLElement).closest('[data-layer-control]')) return;
    clearLayerHold();
    const hold = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      timer: null as ReturnType<typeof setTimeout> | null,
    };
    hold.timer = setTimeout(() => {
      if (longPress.current !== hold) return;
      suppressOpen.current = id;
      setDuplicateTarget(id);
    }, 550);
    longPress.current = hold;
  };

  const moveLayerHold = (e: ReactPointerEvent<HTMLDivElement>) => {
    const hold = longPress.current;
    if (!hold) return;
    if (Math.hypot(e.clientX - hold.startX, e.clientY - hold.startY) > 8) clearLayerHold();
  };

  const openLayer = (id: string) => {
    if (suppressOpen.current === id) {
      suppressOpen.current = null;
      return;
    }
    const layer = layers.find((l) => l.id === id);
    setView({ name: 'layer', layerId: id, kind: layer && layerKind(layer), instrument });
  };

  const closeDuplicate = () => {
    suppressOpen.current = null;
    setDuplicateTarget(null);
  };

  const duplicateSelectedLayer = (id: string) => {
    commit((s) => duplicateLayer(s, id));
    closeDuplicate();
  };

  return (
    <div className="screen" data-screen={instrument}>
      <div className="header">
        <div className="header-side">
          <button className="btn ghost" onClick={() => setView({ name: 'home' })} aria-label="Back to song">
            ‹ Song
          </button>
        </div>
        <div className="header-title">{config.title}</div>
        <div className="header-side right">
          <UndoRedo />
          <button
            className="btn primary small"
            onClick={() => (config.kinds ? setPicking(true) : addLayer(null))}
            data-testid="add-layer"
          >
            + Layer
          </button>
        </div>
      </div>

      <div className="screen-body">
        {layers.length === 0 ? (
          <div className="empty-state">
            No {config.title.toLowerCase()} layers yet.
            <br />
            Add one to start writing.
          </div>
        ) : (
          <div className="layer-list">
            {layers.map((layer) => (
              <div
                key={layer.id}
                className="layer-card"
                data-layer-card={layer.id}
                onPointerDown={(e) => startLayerHold(e, layer.id)}
                onPointerMove={moveLayerHold}
                onPointerUp={clearLayerHold}
                onPointerCancel={clearLayerHold}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className="layer-card-head">
                  <button
                    className="layer-card-title"
                    onClick={() => openLayer(layer.id)}
                    data-testid="open-layer"
                  >
                    <b>{layer.name}</b>
                    <small>{layerSummary(layer)}</small>
                  </button>
                  <button
                    className={`btn small ${layer.muted ? 'active' : 'ghost'}`}
                    onClick={() => toggleMute(layer.id)}
                    data-layer-control
                    aria-label={layer.muted ? 'Unmute layer' : 'Mute layer'}
                  >
                    {layer.muted ? 'Muted' : 'Mute'}
                  </button>
                  <button
                    className="btn small ghost danger"
                    onClick={() => setConfirmDelete(layer.id)}
                    data-layer-control
                    aria-label="Delete layer"
                  >
                    ✕
                  </button>
                </div>
                <button className="row-lane layer-card-lane" onClick={() => openLayer(layer.id)} aria-label={`Open ${layer.name}`}>
                  <Overview song={song} layer={layer} hits colorKey={songKey} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bottombar">
        <PlayButton />
      </div>

      {picking && config.kinds && (
        <Sheet title={`New ${config.title.toLowerCase()} layer`} onClose={() => setPicking(false)}>
          <div className="option-list">
            {config.kinds.map((o) => (
              <button key={o.kind} className="option" onClick={() => addLayer(o.kind)} data-layer-kind={o.kind}>
                <span>{o.kind === 'chords' ? 'Chords' : 'Notes'}</span>
                <small>{o.hint}</small>
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {duplicateTarget && (
        <Sheet title="Duplicate this layer?" onClose={closeDuplicate}>
          <button
            className="btn primary wide"
            onClick={() => duplicateSelectedLayer(duplicateTarget)}
            data-testid="duplicate-layer"
          >
            Duplicate layer
          </button>
        </Sheet>
      )}

      {confirmDelete && (
        <Sheet title="Delete this layer?" onClose={() => setConfirmDelete(null)}>
          <button className="btn danger wide" onClick={() => deleteLayer(confirmDelete)} data-testid="confirm-delete">
            Delete layer
          </button>
        </Sheet>
      )}
    </div>
  );
}
