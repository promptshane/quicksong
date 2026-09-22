import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPianoLayer, duplicatePianoLayer } from '../model/piano';
import { LAYER_TYPE_LABELS, appendLayer, createLayer, duplicateLayer, removeLayer, toggleLayerMute } from '../model/song';
import type { AnyLayer, GuitarLayerType, Song } from '../model/types';
import { useStore, type View } from '../state/store';
import { Overview } from './Overview';
import { PlayButton } from './PlayButton';
import { Sheet } from './Sheet';

const TYPE_OPTIONS: { type: GuitarLayerType; hint: string }[] = [
  { type: 'strum', hint: 'Full chords with a strumming pattern' },
  { type: 'picked', hint: 'Chords played one string at a time' },
  { type: 'single', hint: 'Individual notes — melodies and riffs' },
];

export type InstrumentId = 'guitar' | 'piano';

interface InstrumentConfig {
  title: string;
  layers: (song: Song) => AnyLayer[];
  /** Guitar asks which kind of layer; Piano has one kind and adds it directly. */
  askType: boolean;
  summary: (layer: AnyLayer) => string;
  duplicate: (song: Song, layerId: string) => Song;
  layerView: (layerId: string) => View;
}

const INSTRUMENTS: Record<InstrumentId, InstrumentConfig> = {
  guitar: {
    title: 'Guitar',
    layers: (song) => song.guitar.layers,
    askType: true,
    summary: (layer) =>
      layer.type === 'piano'
        ? ''
        : `${LAYER_TYPE_LABELS[layer.type]} · ${layer.events.length} ${layer.type === 'single' ? 'notes' : 'chords'}`,
    duplicate: duplicateLayer,
    layerView: (layerId) => ({ name: 'layer', layerId }),
  },
  piano: {
    title: 'Piano',
    layers: (song) => song.piano.layers,
    askType: false,
    summary: (layer) => `${layer.events.length} chord${layer.events.length === 1 ? '' : 's'}`,
    duplicate: duplicatePianoLayer,
    layerView: (layerId) => ({ name: 'pianoLayer', layerId }),
  },
};

/** An instrument's layer list: add, open, mute, delete, and hold to duplicate. */
export function InstrumentFocus({ instrument }: { instrument: InstrumentId }) {
  const config = INSTRUMENTS[instrument];
  const song = useStore((s) => s.song);
  const commit = useStore((s) => s.commit);
  const setView = useStore((s) => s.setView);
  const layers = config.layers(song);
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

  const addLayer = (type?: GuitarLayerType) => {
    const layer = type ? createLayer(type, song) : createPianoLayer(song);
    commit((s) => appendLayer(s, layer));
    setPicking(false);
    setView(config.layerView(layer.id));
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
    setView(config.layerView(id));
  };

  const closeDuplicate = () => {
    suppressOpen.current = null;
    setDuplicateTarget(null);
  };

  const duplicateSelectedLayer = (id: string) => {
    commit((s) => config.duplicate(s, id));
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
          <button
            className="btn primary small"
            onClick={() => (config.askType ? setPicking(true) : addLayer())}
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
                    <small>{config.summary(layer)}</small>
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
                  <Overview song={song} layer={layer} hits />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bottombar">
        <PlayButton />
      </div>

      {picking && (
        <Sheet title="New guitar layer" onClose={() => setPicking(false)}>
          <div className="option-list">
            {TYPE_OPTIONS.map((o) => (
              <button key={o.type} className="option" onClick={() => addLayer(o.type)} data-layer-type={o.type}>
                <span>{LAYER_TYPE_LABELS[o.type]}</span>
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
