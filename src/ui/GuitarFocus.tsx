import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { LAYER_TYPE_LABELS, createLayer, duplicateLayer } from '../model/song';
import type { GuitarLayerType } from '../model/types';
import { useStore } from '../state/store';
import { Overview } from './Overview';
import { PlayButton } from './PlayButton';
import { Sheet } from './Sheet';

const TYPE_OPTIONS: { type: GuitarLayerType; hint: string }[] = [
  { type: 'strum', hint: 'Full chords with a strumming pattern' },
  { type: 'picked', hint: 'Chords played one string at a time' },
  { type: 'single', hint: 'Individual notes — melodies and riffs' },
];

export function GuitarFocus() {
  const song = useStore((s) => s.song);
  const commit = useStore((s) => s.commit);
  const setView = useStore((s) => s.setView);
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

  const addLayer = (type: GuitarLayerType) => {
    const layer = createLayer(type, song);
    commit((s) => ({ ...s, guitar: { ...s.guitar, layers: [...s.guitar.layers, layer] } }));
    setPicking(false);
    setView({ name: 'layer', layerId: layer.id });
  };

  const deleteLayer = (id: string) => {
    commit((s) => ({ ...s, guitar: { ...s.guitar, layers: s.guitar.layers.filter((l) => l.id !== id) } }));
    setConfirmDelete(null);
  };

  const toggleMute = (id: string) => {
    commit((s) => ({
      ...s,
      guitar: { ...s.guitar, layers: s.guitar.layers.map((l) => (l.id === id ? { ...l, muted: !l.muted } : l)) },
    }));
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
    setView({ name: 'layer', layerId: id });
  };

  const duplicateSelectedLayer = (id: string) => {
    commit((s) => duplicateLayer(s, id));
    setDuplicateTarget(null);
  };

  return (
    <div className="screen" data-screen="guitar">
      <div className="header">
        <div className="header-side">
          <button className="btn ghost" onClick={() => setView({ name: 'home' })} aria-label="Back to song">
            ‹ Song
          </button>
        </div>
        <div className="header-title">Guitar</div>
        <div className="header-side right">
          <button className="btn primary small" onClick={() => setPicking(true)} data-testid="add-layer">
            + Layer
          </button>
        </div>
      </div>

      <div className="screen-body">
        {song.guitar.layers.length === 0 ? (
          <div className="empty-state">
            No guitar layers yet.
            <br />
            Add one to start writing.
          </div>
        ) : (
          <div className="layer-list">
            {song.guitar.layers.map((layer) => (
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
                    <small>
                      {LAYER_TYPE_LABELS[layer.type]} · {layer.events.length}{' '}
                      {layer.type === 'single' ? 'notes' : 'chords'}
                    </small>
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
                <button
                  className="row-lane"
                  style={{ minHeight: 22 }}
                  onClick={() => openLayer(layer.id)}
                  aria-label={`Open ${layer.name}`}
                >
                  <Overview song={song} layer={layer} />
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
        <Sheet title="Duplicate this layer?" onClose={() => setDuplicateTarget(null)}>
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
