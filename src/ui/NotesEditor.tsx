import { useEffect, useMemo, useState } from 'react';
import { transport, useTransport } from '../audio/transport';
import { dimmedPitchClasses } from '../model/keys';
import { midiToName } from '../model/music';
import { assumedKey, findAnyLayer, usedPitchClasses } from '../model/song';
import type { NoteEvent } from '../model/types';
import { useHumming } from '../pitch/useHumming';
import { auditionNote, insertAtCursor, insertDetectedNotes, playSong } from '../state/actions';
import { useStore } from '../state/store';
import { HumStatus } from './HumStatus';
import { Keyboard } from './Keyboard';
import { NotePanel } from './NotePanel';
import { Sheet } from './Sheet';
import { Timeline } from './Timeline';
import { UndoRedo } from './UndoRedo';
import { toast } from './toastStore';
import { KEYBOARD_MAX_BASE, KEYBOARD_MIN_BASE, useKeyboardFollow } from './useKeyboardFollow';

const BACK = { guitar: { label: 'Guitar', view: 'guitar' }, piano: { label: 'Piano', view: 'piano' } } as const;

/**
 * Editor for a single-notes layer (guitar or piano): enter notes with the
 * keyboard or by humming. Record gates input: off = explore and hear, on =
 * keys and humming add notes at the cursor.
 */
export function NotesEditor({ layerId, instrument }: { layerId: string; instrument: 'guitar' | 'piano' }) {
  const song = useStore((s) => s.song);
  const found = findAnyLayer(song, layerId);
  const layer = found && (found.type === 'single' || found.type === 'pianoNotes') ? found : undefined;
  const back = BACK[instrument];
  const selectedId = useStore((s) => s.selectedEventId);
  const cursor = useStore((s) => s.cursorBeat);
  const setView = useStore((s) => s.setView);
  const keyboardBase = useStore((s) => s.keyboardBase);
  const setKeyboardBase = useStore((s) => s.setKeyboardBase);
  const recording = useStore((s) => s.recording);
  const setRecording = useStore((s) => s.setRecording);
  const playing = useTransport((s) => s.playing);

  const [showKeys, setShowKeys] = useState(true);

  const selected: NoteEvent | null = (layer?.events as NoteEvent[] | undefined)?.find((e) => e.id === selectedId) ?? null;

  // Possible-key guidance comes from committed material only; previews
  // never touch the song, so they can never influence this.
  const dimmed = useMemo(() => dimmedPitchClasses(song.key, usedPitchClasses(song)), [song]);
  const songKey = useMemo(() => assumedKey(song), [song]);

  const hum = useHumming(({ notes }) => {
    if (!layer) return;
    if (notes.length === 0) {
      toast('No notes detected — try humming a little louder');
      return;
    }
    insertDetectedNotes(layerId, notes);
    toast(`Added ${notes.length} note${notes.length === 1 ? '' : 's'}`);
  });
  const humActive = hum.state.mode !== null;
  // While listening, keep the hummed note on screen.
  useKeyboardFollow(hum.state.liveMidi, hum.state.frame, humActive && showKeys);

  // The open layer can vanish through Undo (of adding it) or Redo (of
  // deleting it). Return to its instrument page, where Redo/Undo can bring it back.
  useEffect(() => {
    if (!layer) setView({ name: back.view });
  }, [layer, setView, back.view]);

  if (!layer) return null;

  const onKey = (midi: number) => {
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
    else playSong();
  };

  return (
    <div className="screen editor" data-screen="layer" data-layer-type={layer.type}>
      <div className="header">
        <div className="header-side">
          <button className="btn ghost" onClick={() => setView({ name: back.view })} aria-label={`Back to ${back.label.toLowerCase()}`}>
            ‹ {back.label}
          </button>
        </div>
        <div className="header-title">{layer.name}</div>
        <div className="header-side right">
          <UndoRedo />
        </div>
      </div>

      <Timeline song={song} layer={layer} colorKey={songKey} />

      <div className="panel">
        {selected ? (
          <NotePanel layerId={layerId} note={selected} timeSignature={song.timeSignature} instrument={instrument} />
        ) : (
          <div className="panel-hint" data-testid="panel-hint">
            {recording
              ? 'Recording: keys and humming add notes at the cursor.'
              : layer.events.length === 0
                ? 'Tap keys or hum to explore. Turn on Record to add to the song.'
                : 'Tap a note to edit it, or tap empty space to move the cursor.'}
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
            <span className="range">
              {midiToName(keyboardBase)} – {midiToName(keyboardBase + 12)}
            </span>
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
