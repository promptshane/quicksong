import { useMemo, useState } from 'react';
import { transport, useTransport } from '../audio/transport';
import { activeStringNumbers } from '../model/chords';
import { dimmedPitchClasses } from '../model/keys';
import { midiToName } from '../model/music';
import { findLayer, usedPitchClasses } from '../model/song';
import { useHumming } from '../pitch/useHumming';
import {
  addToneToSelectedChord,
  auditionNote,
  insertAtCursor,
  insertDetectedNotes,
  setLayerPickPattern,
  setStrumSlot,
} from '../state/actions';
import { selectCanRedo, selectCanUndo, useStore } from '../state/store';
import { ChordPanel } from './ChordPanel';
import { HumStatus } from './HumStatus';
import { Keyboard } from './Keyboard';
import { NotePanel } from './NotePanel';
import { PickPattern } from './PickPattern';
import { Sheet } from './Sheet';
import { StrumGrid } from './StrumGrid';
import { Timeline } from './Timeline';
import { toast } from './toastStore';
import { KEYBOARD_MAX_BASE, KEYBOARD_MIN_BASE, useKeyboardFollow } from './useKeyboardFollow';

type InputTarget = 'new' | 'add';

export function LayerEditor({ layerId }: { layerId: string }) {
  const song = useStore((s) => s.song);
  const layer = findLayer(song, layerId);
  const selectedId = useStore((s) => s.selectedEventId);
  const cursor = useStore((s) => s.cursorBeat);
  const setView = useStore((s) => s.setView);
  const select = useStore((s) => s.select);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore(selectCanUndo);
  const canRedo = useStore(selectCanRedo);
  const keyboardBase = useStore((s) => s.keyboardBase);
  const setKeyboardBase = useStore((s) => s.setKeyboardBase);
  const recording = useStore((s) => s.recording);
  const setRecording = useStore((s) => s.setRecording);
  const playing = useTransport((s) => s.playing);

  const [showKeys, setShowKeys] = useState(true);
  const [targetChoice, setTarget] = useState<InputTarget>('new');

  const selected = layer?.events.find((e) => e.id === selectedId) ?? null;
  const selectedChord = selected?.kind === 'chord' ? selected : null;
  // "Add to chord" only makes sense while a chord is selected.
  const target: InputTarget = selectedChord ? targetChoice : 'new';

  // Possible-key guidance comes from committed material only; previews
  // never touch the song, so they can never influence this.
  const dimmed = useMemo(() => dimmedPitchClasses(song.key, usedPitchClasses(song)), [song]);

  const hum = useHumming(({ notes }) => {
    if (!layer) return;
    if (notes.length === 0) {
      toast('No notes detected — try humming a little louder');
      return;
    }
    if (selectedChord && target === 'add') {
      // Fold every distinct hummed pitch into the selected chord.
      const distinct = [...new Set(notes.map((n) => n.midi))];
      for (const midi of distinct) addToneToSelectedChord(layerId, selectedChord.id, midi);
      toast(`Added ${distinct.map(midiToName).join(' ')} to chord`);
      return;
    }
    insertDetectedNotes(layerId, notes);
    toast(`Added ${notes.length} ${layer.type === 'single' ? 'note' : 'chord'}${notes.length === 1 ? '' : 's'}`);
  });
  const humActive = hum.state.mode !== null;
  // While listening, keep the hummed note on screen.
  useKeyboardFollow(hum.state.liveMidi, hum.state.frame, humActive && showKeys);

  if (!layer) {
    return (
      <div className="screen">
        <div className="empty-state">
          This layer no longer exists.
          <br />
          <button className="btn" onClick={() => setView({ name: 'guitar' })}>
            Back to Guitar
          </button>
        </div>
      </div>
    );
  }

  const onKey = (midi: number) => {
    // "Add to chord" is an explicit edit of existing material, so it does
    // not depend on Record — Record gates input capture, not editing.
    if (selectedChord && target === 'add') {
      addToneToSelectedChord(layerId, selectedChord.id, midi);
      return;
    }
    auditionNote(midi);
    if (recording) insertAtCursor(layerId, midi);
  };

  const toggleHum = () => {
    if (humActive) {
      hum.stop();
      return;
    }
    if (!showKeys) setShowKeys(true);
    void hum.start(recording ? 'record' : 'preview', song, cursor);
  };

  const toggleRecord = () => {
    if (humActive) hum.stop();
    setRecording(!recording);
  };

  const togglePlay = () => {
    // A recording take owns the transport; pausing it ends the take.
    if (hum.state.mode === 'record') {
      hum.stop();
      return;
    }
    if (transport.isPlaying) transport.stop(cursor);
    else void transport.play(song, cursor);
  };

  const isChord = layer.type !== 'single';

  return (
    <div className="screen editor" data-screen="layer" data-layer-type={layer.type}>
      <div className="header">
        <div className="header-side">
          <button className="btn ghost" onClick={() => setView({ name: 'guitar' })} aria-label="Back to guitar">
            ‹ Guitar
          </button>
        </div>
        <div className="header-title">{layer.name}</div>
        <div className="header-side right">
          <button className="btn icon ghost" onClick={undo} disabled={!canUndo} aria-label="Undo" data-testid="undo">
            ↶
          </button>
          <button className="btn icon ghost" onClick={redo} disabled={!canRedo} aria-label="Redo" data-testid="redo">
            ↷
          </button>
        </div>
      </div>

      <Timeline song={song} layer={layer} />

      <div className="panel">
        {layer.type === 'strum' && (
          <div className="panel-section">
            <div className="panel-label">
              <span>Strum pattern</span>
              <span>tap to cycle ↓ ↑ —</span>
            </div>
            <StrumGrid
              pattern={layer.strumPattern}
              timeSignature={song.timeSignature}
              onTap={(i) => setStrumSlot(layerId, i)}
            />
          </div>
        )}

        {layer.type === 'picked' && !selectedChord?.pickPattern && (
          <div className="panel-section">
            <div className="panel-label">
              <span>Picking order</span>
              <span>one string per beat</span>
            </div>
            <PickPattern
              pattern={layer.pickPattern}
              availableStrings={selectedChord ? activeStringNumbers(selectedChord) : null}
              onChange={(p) => setLayerPickPattern(layerId, p)}
            />
          </div>
        )}

        {selected?.kind === 'note' && <NotePanel layerId={layerId} note={selected} timeSignature={song.timeSignature} />}
        {selectedChord && layer.type !== 'single' && (
          <ChordPanel layer={layer} chord={selectedChord} timeSignature={song.timeSignature} />
        )}

        {!selected && (
          <div className="panel-hint" data-testid="panel-hint">
            {recording
              ? `Recording: keys and humming add ${isChord ? 'chords' : 'notes'} at the cursor.`
              : layer.events.length === 0
                ? 'Tap keys or hum to explore. Turn on Record to add to the song.'
                : 'Tap a block to edit it, or tap empty space to move the cursor.'}
          </div>
        )}
      </div>

      <HumStatus state={hum.state} onMetronome={hum.setMetronome} />

      {showKeys && (
        <div className="keyboard-wrap">
          <div className="keyboard-head">
            <button
              className="btn small"
              onClick={() => setKeyboardBase(Math.max(KEYBOARD_MIN_BASE, keyboardBase - 12))}
              aria-label="Octave down"
              data-testid="octave-down"
            >
              ‹ oct
            </button>
            {selectedChord ? (
              <div className="seg" style={{ flex: 1 }} data-testid="input-target">
                <button className={target === 'new' ? 'on' : ''} onClick={() => setTarget('new')}>
                  {recording ? 'New chord' : 'Preview'}
                </button>
                <button className={target === 'add' ? 'on' : ''} onClick={() => setTarget('add')}>
                  Add to chord
                </button>
              </div>
            ) : (
              <span className="range">
                {midiToName(keyboardBase)} – {midiToName(keyboardBase + 12)}
              </span>
            )}
            <button
              className="btn small"
              onClick={() => setKeyboardBase(Math.min(KEYBOARD_MAX_BASE, keyboardBase + 12))}
              aria-label="Octave up"
              data-testid="octave-up"
            >
              oct ›
            </button>
          </div>
          <Keyboard onKey={onKey} liveMidi={hum.state.liveMidi} dimmed={dimmed} />
        </div>
      )}

      <div className="editor-bar">
        <button
          className={`btn rec ${recording ? 'on' : ''}`}
          onClick={toggleRecord}
          aria-label={recording ? 'Record on' : 'Record off'}
          aria-pressed={recording}
          data-testid="record"
        >
          <span className="rec-dot" /> Rec
        </button>
        <button
          className={`btn ${humActive ? 'active' : ''}`}
          onClick={toggleHum}
          aria-label={humActive ? 'Stop humming' : 'Hum or sing'}
          data-testid="hum"
        >
          {humActive ? '■ Stop' : 'Hum'}
        </button>
        <button className="play-btn small" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} data-testid="play">
          {playing ? '❚❚' : '▶'}
        </button>
        <button className={`btn ${showKeys ? 'active' : ''}`} onClick={() => setShowKeys(!showKeys)} aria-label="Toggle keyboard" data-testid="toggle-keys">
          Keys
        </button>
      </div>

      {hum.state.error && (
        <Sheet title="Microphone" onClose={hum.clearError}>
          <div className="panel-hint">{hum.state.error}</div>
        </Sheet>
      )}
    </div>
  );
}
