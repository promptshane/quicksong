import { useEffect, useMemo, useRef, useState } from 'react';
import { transport, useTransport } from '../audio/transport';
import { STYLE_LABELS, effectiveStyle } from '../model/arpeggio';
import { guitarChordShape } from '../model/guitarChords';
import { eventLabel } from '../model/labels';
import { chordName, keyName, midiToName, pitchClassOf } from '../model/music';
import { addedPitchClasses, chordShapeName, chordTonesOf, keyChordPalette, type ChordShape, type KeyChordPalette } from '../model/piano';
import { eventPitches, findAnyLayer, isStyledLayer, type StyledLayer } from '../model/song';
import { durationLabel, eighthBeats, positionLabel } from '../model/time';
import type { ChordEvent, ChordQuality, ChordStyle, PianoEvent, PitchClass, TimeSignature } from '../model/types';
import {
  addChordAtCursor,
  auditionEvent,
  auditionPaletteChord,
  changeChord,
  cursorAfterEvent,
  cycleVoicing,
  playSong,
  setChordLayerArp,
  setChordLayerStyle,
  setChordOverride,
  setEventDuration,
  setEventVelocity,
  setStrumSlot,
  toggleChordNote,
} from '../state/actions';
import { useStore } from '../state/store';
import { ArpEditor } from './ArpEditor';
import { toneColor, toneStyle } from './degreeColor';
import { NoteWheel } from './NoteWheel';
import { Sheet } from './Sheet';
import { StrumGrid } from './StrumGrid';
import { Timeline } from './Timeline';
import { UndoRedo } from './UndoRedo';

type Instrument = 'guitar' | 'piano';
type ChordLike = ChordEvent | PianoEvent;

interface ChordChoice {
  root: PitchClass;
  quality: ChordQuality;
}

const choiceId = (c: ChordChoice) => `${c.root}:${c.quality}`;

/** The chord as notes (for naming and the wheel); legacy guitar seed / hand-edited chords have none. */
function shapeOf(ev: ChordLike): ChordShape | null {
  return ev.kind === 'piano' ? ev : guitarChordShape(ev);
}

/** Sounding notes, low to high. */
function tonesOf(ev: ChordLike): number[] {
  return [...eventPitches(ev)].sort((a, b) => a - b);
}

/** The key's chords as big tap targets. Tapping never needs a root + Major/Minor decision. */
function ChordPalette({
  palette,
  activeId,
  onTap,
}: {
  palette: KeyChordPalette;
  activeId: string | null;
  onTap: (choice: ChordChoice) => void;
}) {
  return (
    <div className="chord-palette" data-testid="chord-palette">
      {palette.chords.map((c) => (
        <button
          key={choiceId(c)}
          className={`palette-chord ${activeId === choiceId(c) ? 'on' : ''}`}
          style={toneStyle(toneColor(c.root, palette.key))}
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

function paletteLabel(palette: KeyChordPalette): string {
  return `Chords in ${keyName(palette.key)}`;
}

function velocityWord(velocity: number): string {
  if (velocity < 0.4) return 'soft';
  if (velocity < 0.75) return 'medium';
  return 'hard';
}

/** Step 1: pick a chord from the key, hear it, then add it at the cursor. */
function AddChordPanel({
  layerId,
  instrument,
  palette,
  timeSignature,
}: {
  layerId: string;
  instrument: Instrument;
  palette: KeyChordPalette;
  timeSignature: TimeSignature;
}) {
  const cursor = useStore((s) => s.cursorBeat);
  const [armed, setArmed] = useState<ChordChoice | null>(null);

  const tap = (choice: ChordChoice) => {
    auditionPaletteChord(instrument, choice.root, choice.quality);
    setArmed(choice);
  };

  const add = () => {
    if (!armed) return;
    addChordAtCursor(layerId, armed.root, armed.quality);
    setArmed(null);
  };

  return (
    <div className="panel-section" data-testid="add-chord-panel">
      <div className="panel-label">
        <span data-testid="palette-key">{paletteLabel(palette)}</span>
        <span>{palette.guessed ? 'starting guess' : 'tap to hear'}</span>
      </div>
      <ChordPalette palette={palette} activeId={armed ? choiceId(armed) : null} onTap={tap} />
      <button className="btn primary wide" onClick={add} disabled={!armed} data-testid="add-chord">
        {armed ? `Add ${chordName(armed.root, armed.quality)} at ${positionLabel(cursor, timeSignature)}` : 'Tap a chord to hear it'}
      </button>
    </div>
  );
}

/**
 * How the layer's chords are played: all together (strum / one strike) or
 * one note at a time (pick / arpeggio), with the strum grid or arpeggio
 * pattern for it. Chords can be laid down first and this decided after.
 */
function LayerStylePanel({ layer, instrument, timeSignature }: { layer: StyledLayer; instrument: Instrument; timeSignature: TimeSignature }) {
  const labels = STYLE_LABELS[instrument];
  // Rows of the arpeggio grid: the layer's biggest chord (or a typical one).
  const tones = (layer.events as ChordLike[]).map(tonesOf).reduce((a, b) => (b.length > a.length ? b : a), [] as number[]);
  return (
    <div className="panel-section" data-testid="layer-style">
      <div className="panel-label">
        <span>Playing · all chords</span>
      </div>
      <StyleSwitch value={layer.style} labels={labels} onChange={(style) => setChordLayerStyle(layer.id, style)} testId="layer-style-switch" />
      {layer.style === 'together' && layer.type === 'chords' && (
        <StrumGrid pattern={layer.strumPattern} timeSignature={timeSignature} onTap={(i) => setStrumSlot(layer.id, i)} />
      )}
      {layer.style === 'arpeggio' && (
        <ArpEditor
          arp={layer.arp}
          tones={tones.length ? tones : placeholderTones(instrument)}
          timeSignature={timeSignature}
          onChange={(arp) => setChordLayerArp(layer.id, arp)}
          testId="layer-arp"
        />
      )}
    </div>
  );
}

/** Row labels for the arpeggio grid before any chord exists. */
function placeholderTones(instrument: Instrument): number[] {
  return instrument === 'guitar' ? [45, 52, 57, 60, 64] : [57, 60, 64];
}

function StyleSwitch({
  value,
  labels,
  onChange,
  testId,
}: {
  value: ChordStyle;
  labels: Record<ChordStyle, string>;
  onChange: (style: ChordStyle) => void;
  testId: string;
}) {
  return (
    <div className="seg" data-testid={testId}>
      {(['together', 'arpeggio'] as const).map((style) => (
        <button key={style} className={value === style ? 'on' : ''} onClick={() => onChange(style)} aria-pressed={value === style} data-style={style}>
          {labels[style]}
        </button>
      ))}
    </div>
  );
}

/**
 * A continuous slider whose whole drag is one undo step, and which plays the
 * selected chord on release so the change can be heard.
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

/** Step 2: shape the selected chord — change it, add special notes, how it is played, its feel. */
function ChordPanel({
  layer,
  instrument,
  event,
  palette,
  timeSignature,
  onOpenWheel,
}: {
  layer: StyledLayer;
  instrument: Instrument;
  event: ChordLike;
  palette: KeyChordPalette;
  timeSignature: TimeSignature;
  onOpenWheel: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const shape = shapeOf(event);
  const baseTones = shape ? chordTonesOf(shape) : null;
  const tones = tonesOf(event);
  const step = eighthBeats(timeSignature);
  const maxLength = Math.max(timeSignature.beatsPerBar * 2, event.duration);
  const labels = STYLE_LABELS[instrument];
  const style = effectiveStyle(layer, event);
  const hear = () => auditionEvent(layer.id, event.id);

  return (
    <div className="panel-section" data-testid="chord-panel">
      <div className="piano-chord-head">
        <button className="piano-chord-name" style={toneStyle(toneColor(event.root, palette.key))} onClick={hear} aria-label="Hear chord">
          <b data-testid="chord-name">{shape ? chordShapeName(shape) : eventLabel(event)}</b>
          <small>▶ hear</small>
        </button>
        <button className="btn small" onClick={() => cursorAfterEvent(layer.id, event.id)} data-testid="next-chord">
          ＋ Next chord
        </button>
      </div>

      <div className="tones" data-testid="chord-notes">
        {tones.map((midi) => (
          <span key={midi} className={`tone ${!baseTones || baseTones.has(pitchClassOf(midi)) ? '' : 'added'}`}>
            {midiToName(midi)}
          </span>
        ))}
      </div>

      <div className="btn-row">
        {shape && (
          <button className="btn" onClick={onOpenWheel} data-testid="open-note-wheel">
            ✦ Special chord
          </button>
        )}
        <button className={`btn ${changing ? 'active' : ''}`} onClick={() => setChanging(!changing)} data-testid="change-chord">
          Change chord
        </button>
        {instrument === 'guitar' && shape && (
          <button className="btn" onClick={() => cycleVoicing(layer.id, event.id)} data-testid="cycle-voicing" aria-label="Move the voicing up or down the neck">
            Voicing ↕
          </button>
        )}
      </div>

      {changing && (
        <div className="panel-section">
          <div className="panel-label">
            <span>{paletteLabel(palette)}</span>
            <span>tap to switch</span>
          </div>
          <ChordPalette palette={palette} activeId={shape ? choiceId(shape) : null} onTap={(c) => changeChord(layer.id, event.id, c.root, c.quality)} />
        </div>
      )}

      <div className="panel-section" data-testid="chord-style">
        <div className="panel-label">
          <span>Playing · this chord</span>
          <span>{event.styleOverride ? 'its own' : `layer: ${labels[layer.style]}`}</span>
        </div>
        <div className="seg" data-testid="chord-style-switch">
          <button className={!event.styleOverride ? 'on' : ''} onClick={() => setChordOverride(layer.id, event.id, null)} aria-pressed={!event.styleOverride} data-style="layer">
            Layer
          </button>
          {(['together', 'arpeggio'] as const).map((s) => (
            <button
              key={s}
              className={event.styleOverride?.style === s ? 'on' : ''}
              onClick={() => setChordOverride(layer.id, event.id, { style: s, arp: event.styleOverride?.arp ?? layer.arp })}
              aria-pressed={event.styleOverride?.style === s}
              data-style={s}
            >
              {labels[s]}
            </button>
          ))}
        </div>
        {event.styleOverride?.style === 'arpeggio' && (
          <ArpEditor
            arp={style.arp}
            tones={tones}
            timeSignature={timeSignature}
            onChange={(arp) => setChordOverride(layer.id, event.id, { style: 'arpeggio', arp })}
            testId="chord-arp"
          />
        )}
        {event.styleOverride?.style === 'together' && layer.type === 'chords' && (
          <div className="panel-hint compact">Strummed on the layer's strum pattern.</div>
        )}
      </div>

      <FeelSlider
        label="Velocity"
        value={Math.round(event.velocity * 100)}
        display={`${velocityWord(event.velocity)} · ${Math.round(event.velocity * 100)}`}
        min={10}
        max={100}
        step={1}
        onInput={(v, key) => setEventVelocity(layer.id, event.id, v / 100, key)}
        onRelease={hear}
        testId="chord-velocity"
      />
      <FeelSlider
        label={instrument === 'piano' ? 'Sustain' : 'Length'}
        value={event.duration}
        display={durationLabel(event.duration, timeSignature)}
        min={step}
        max={maxLength}
        step={step}
        onInput={(v, key) => setEventDuration(layer.id, event.id, v, key)}
        onRelease={hear}
        testId="chord-length"
      />
    </div>
  );
}

/**
 * Editor for a chords layer, guitar or piano: pick chords from the song's
 * key, make them special on the note wheel, then decide how they are played
 * (together, or one note at a time) and how each one feels.
 */
export function ChordsEditor({ layerId, instrument }: { layerId: string; instrument: Instrument }) {
  const song = useStore((s) => s.song);
  const found = findAnyLayer(song, layerId);
  const layer = found && isStyledLayer(found) ? found : undefined;
  const selectedId = useStore((s) => s.selectedEventId);
  const cursor = useStore((s) => s.cursorBeat);
  const setView = useStore((s) => s.setView);
  const playing = useTransport((s) => s.playing);
  const [showWheel, setShowWheel] = useState(false);

  const palette = useMemo(() => keyChordPalette(song), [song]);

  // Undo of adding this layer (or Redo of deleting it) removes it: go back to
  // the instrument page, where Redo/Undo can bring it back.
  useEffect(() => {
    if (!layer) setView({ name: instrument });
  }, [layer, setView, instrument]);

  if (!layer) return null;

  const selected = (layer.events as ChordLike[]).find((e) => e.id === selectedId) ?? null;
  const selectedShape = selected ? shapeOf(selected) : null;
  const backLabel = instrument === 'piano' ? 'Piano' : 'Guitar';

  const togglePlay = () => {
    if (transport.isPlaying) transport.stop(cursor);
    else playSong();
  };

  return (
    <div className="screen editor" data-screen="layer" data-layer-type={layer.type}>
      <div className="header">
        <div className="header-side">
          <button className="btn ghost" onClick={() => setView({ name: instrument })} aria-label={`Back to ${backLabel.toLowerCase()}`}>
            ‹ {backLabel}
          </button>
        </div>
        <div className="header-title">{layer.name}</div>
        <div className="header-side right">
          <UndoRedo />
        </div>
      </div>

      <Timeline song={song} layer={layer} colorKey={palette.key} />

      <div className="panel">
        {selected ? (
          <ChordPanel
            key={selected.id}
            layer={layer}
            instrument={instrument}
            event={selected}
            palette={palette}
            timeSignature={song.timeSignature}
            onOpenWheel={() => setShowWheel(true)}
          />
        ) : (
          <>
            <AddChordPanel layerId={layerId} instrument={instrument} palette={palette} timeSignature={song.timeSignature} />
            <LayerStylePanel layer={layer} instrument={instrument} timeSignature={song.timeSignature} />
          </>
        )}
      </div>

      <div className="editor-bar centered">
        <button className="play-btn small" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} data-testid="play">
          {playing ? '❚❚' : '▶'}
        </button>
      </div>

      {showWheel && selected && selectedShape && (
        <Sheet title="Special chord" onClose={() => setShowWheel(false)}>
          <NoteWheel
            shape={selectedShape}
            scale={palette.scale}
            tone={toneColor(selected.root, palette.key)}
            onToggle={(pc) => toggleChordNote(layerId, selected.id, pc)}
          />
          <div className="panel-hint compact">
            Tap a note to add it and hear the chord. Bright notes belong to {keyName(palette.key)}; the others still work.
          </div>
          {addedPitchClasses(selectedShape).length > 0 && (
            <button
              className="btn wide"
              onClick={() => changeChord(layerId, selected.id, selectedShape.root, selectedShape.quality)}
              data-testid="plain-chord"
            >
              Back to plain {chordName(selectedShape.root, selectedShape.quality)}
            </button>
          )}
        </Sheet>
      )}
    </div>
  );
}
