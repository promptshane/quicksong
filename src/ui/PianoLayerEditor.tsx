import { useMemo, useRef, useState } from 'react';
import { transport, useTransport } from '../audio/transport';
import { chordName, keyName, midiToName, pitchClassOf } from '../model/music';
import { pianoAddedPitchClasses, pianoChordName, pianoChordNotes, pianoChordTones, pianoPalette, type PianoPalette } from '../model/piano';
import { findPianoLayer } from '../model/song';
import { durationLabel, eighthBeats, positionLabel } from '../model/time';
import type { ChordQuality, PianoEvent, PitchClass, TimeSignature } from '../model/types';
import { DEFAULT_VELOCITY } from '../model/types';
import {
  addPianoChord,
  auditionEvent,
  auditionPianoChord,
  changePianoChord,
  cursorAfterEvent,
  setEventDuration,
  setEventVelocity,
  togglePianoChordNote,
} from '../state/actions';
import { selectCanRedo, selectCanUndo, useStore } from '../state/store';
import { NoteWheel } from './NoteWheel';
import { Sheet } from './Sheet';
import { Timeline } from './Timeline';

interface ChordChoice {
  root: PitchClass;
  quality: ChordQuality;
}

const choiceId = (c: ChordChoice) => `${c.root}:${c.quality}`;

/** The key's chords as big tap targets. Tapping never needs a root + Major/Minor decision. */
function ChordPalette({
  palette,
  activeId,
  onTap,
}: {
  palette: PianoPalette;
  activeId: string | null;
  onTap: (choice: ChordChoice) => void;
}) {
  return (
    <div className="chord-palette" data-testid="chord-palette">
      {palette.chords.map((c) => (
        <button
          key={choiceId(c)}
          className={`palette-chord ${activeId === choiceId(c) ? 'on' : ''}`}
          onClick={() => onTap(c)}
          data-chord={chordName(c.root, c.quality)}
          aria-pressed={activeId === choiceId(c)}
        >
          {chordName(c.root, c.quality)}
        </button>
      ))}
    </div>
  );
}

function paletteLabel(palette: PianoPalette): string {
  return `Chords in ${keyName(palette.key)}`;
}

function velocityWord(velocity: number): string {
  if (velocity < 0.4) return 'soft';
  if (velocity < 0.75) return 'medium';
  return 'hard';
}

/** Step 1: pick a chord from the key, hear it, then add it at the cursor. */
function AddChordPanel({ layerId, palette, timeSignature }: { layerId: string; palette: PianoPalette; timeSignature: TimeSignature }) {
  const cursor = useStore((s) => s.cursorBeat);
  const [armed, setArmed] = useState<ChordChoice | null>(null);

  const tap = (choice: ChordChoice) => {
    auditionPianoChord({ notes: pianoChordNotes(choice.root, choice.quality), velocity: DEFAULT_VELOCITY });
    setArmed(choice);
  };

  const add = () => {
    if (!armed) return;
    addPianoChord(layerId, armed.root, armed.quality);
    setArmed(null);
  };

  return (
    <div className="panel-section" data-testid="piano-add-panel">
      <div className="panel-label">
        <span data-testid="palette-key">{paletteLabel(palette)}</span>
        <span>{palette.guessed ? 'starting guess' : 'tap to hear'}</span>
      </div>
      <ChordPalette palette={palette} activeId={armed ? choiceId(armed) : null} onTap={tap} />
      <button className="btn primary wide" onClick={add} disabled={!armed} data-testid="add-piano-chord">
        {armed ? `Add ${chordName(armed.root, armed.quality)} at ${positionLabel(cursor, timeSignature)}` : 'Tap a chord to hear it'}
      </button>
      <div className="panel-hint">Tap a chord on the timeline to change how it sounds and feels.</div>
    </div>
  );
}

/**
 * A continuous slider whose whole drag is one undo step, and which plays the
 * selected hit on release so the change can be heard.
 */
function FeelSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  onInput,
  onRelease,
  testId,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onInput: (value: number, gestureKey: string) => void;
  onRelease: () => void;
  testId: string;
}) {
  const gesture = useRef(0);
  return (
    <div className="panel-section">
      <div className="panel-label">
        <span>{label}</span>
        <span data-testid={`${testId}-value`}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => (gesture.current += 1)}
        onChange={(e) => onInput(Number(e.target.value), `${testId}:${gesture.current}`)}
        onPointerUp={onRelease}
        onKeyUp={onRelease}
        aria-label={label}
        data-testid={testId}
      />
    </div>
  );
}

/** Step 2: shape the selected hit — change it, add special notes, set its feel. */
function PianoChordPanel({
  layerId,
  event,
  palette,
  timeSignature,
  onOpenWheel,
}: {
  layerId: string;
  event: PianoEvent;
  palette: PianoPalette;
  timeSignature: TimeSignature;
  onOpenWheel: () => void;
}) {
  const bpm = useStore((s) => s.song.bpm);
  const [changing, setChanging] = useState(false);
  const tones = pianoChordTones(event);
  const step = eighthBeats(timeSignature);
  const maxSustain = Math.max(timeSignature.beatsPerBar * 2, event.duration);
  const hear = () => {
    // Read the committed event, not this render's props: release fires right after the last input.
    const { song, selectedEventId } = useStore.getState();
    const latest = findPianoLayer(song, layerId)?.events.find((e) => e.id === selectedEventId);
    if (latest) auditionEvent(latest, bpm);
  };

  return (
    <div className="panel-section" data-testid="piano-chord-panel">
      <div className="piano-chord-head">
        <button className="piano-chord-name" onClick={() => auditionEvent(event, bpm)} aria-label="Hear chord">
          <b data-testid="piano-chord-name">{pianoChordName(event)}</b>
          <small>▶ hear</small>
        </button>
        <button
          className="btn small"
          onClick={() => cursorAfterEvent(layerId, event.id)}
          data-testid="next-piano-chord"
        >
          ＋ Next chord
        </button>
      </div>

      <div className="tones" data-testid="piano-notes">
        {event.notes.map((midi) => (
          <span key={midi} className={`tone ${tones.has(pitchClassOf(midi)) ? '' : 'added'}`}>
            {midiToName(midi)}
          </span>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn" onClick={onOpenWheel} data-testid="open-note-wheel">
          ✦ Special chord
        </button>
        <button className={`btn ${changing ? 'active' : ''}`} onClick={() => setChanging(!changing)} data-testid="change-piano-chord">
          Change chord
        </button>
      </div>

      {changing && (
        <div className="panel-section">
          <div className="panel-label">
            <span>{paletteLabel(palette)}</span>
            <span>tap to switch</span>
          </div>
          <ChordPalette
            palette={palette}
            activeId={choiceId(event)}
            onTap={(c) => changePianoChord(layerId, event.id, c.root, c.quality)}
          />
        </div>
      )}

      <FeelSlider
        label="Velocity"
        value={Math.round(event.velocity * 100)}
        display={`${velocityWord(event.velocity)} · ${Math.round(event.velocity * 100)}`}
        min={10}
        max={100}
        step={1}
        onInput={(v, key) => setEventVelocity(layerId, event.id, v / 100, key)}
        onRelease={hear}
        testId="piano-velocity"
      />
      <FeelSlider
        label="Sustain"
        value={event.duration}
        display={durationLabel(event.duration, timeSignature)}
        min={step}
        max={maxSustain}
        step={step}
        onInput={(v, key) => setEventDuration(layerId, event.id, v, key)}
        onRelease={hear}
        testId="piano-sustain"
      />
    </div>
  );
}

export function PianoLayerEditor({ layerId }: { layerId: string }) {
  const song = useStore((s) => s.song);
  const layer = findPianoLayer(song, layerId);
  const selectedId = useStore((s) => s.selectedEventId);
  const cursor = useStore((s) => s.cursorBeat);
  const setView = useStore((s) => s.setView);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore(selectCanUndo);
  const canRedo = useStore(selectCanRedo);
  const playing = useTransport((s) => s.playing);
  const [showWheel, setShowWheel] = useState(false);

  const palette = useMemo(() => pianoPalette(song), [song]);

  if (!layer) {
    return (
      <div className="screen">
        <div className="empty-state">
          This layer no longer exists.
          <br />
          <button className="btn" onClick={() => setView({ name: 'piano' })}>
            Back to Piano
          </button>
        </div>
      </div>
    );
  }

  const selected = layer.events.find((e) => e.id === selectedId) ?? null;

  const togglePlay = () => {
    if (transport.isPlaying) transport.stop(cursor);
    else void transport.play(song, cursor);
  };

  return (
    <div className="screen editor" data-screen="pianoLayer">
      <div className="header">
        <div className="header-side">
          <button className="btn ghost" onClick={() => setView({ name: 'piano' })} aria-label="Back to piano">
            ‹ Piano
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
        {selected ? (
          <PianoChordPanel
            key={selected.id}
            layerId={layerId}
            event={selected}
            palette={palette}
            timeSignature={song.timeSignature}
            onOpenWheel={() => setShowWheel(true)}
          />
        ) : (
          <AddChordPanel layerId={layerId} palette={palette} timeSignature={song.timeSignature} />
        )}
      </div>

      <div className="editor-bar centered">
        <button className="play-btn small" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} data-testid="play">
          {playing ? '❚❚' : '▶'}
        </button>
      </div>

      {showWheel && selected && (
        <Sheet title="Special chord" onClose={() => setShowWheel(false)}>
          <NoteWheel event={selected} scale={palette.scale} onToggle={(pc) => togglePianoChordNote(layerId, selected.id, pc)} />
          <div className="panel-hint compact">
            Tap a note to add it and hear the chord. Bright notes belong to {keyName(palette.key)}; the others still work.
          </div>
          {pianoAddedPitchClasses(selected).length > 0 && (
            <button
              className="btn wide"
              onClick={() => changePianoChord(layerId, selected.id, selected.root, selected.quality)}
              data-testid="plain-chord"
            >
              Back to plain {chordName(selected.root, selected.quality)}
            </button>
          )}
        </Sheet>
      )}
    </div>
  );
}
