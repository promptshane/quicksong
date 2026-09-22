import { useState } from 'react';
import { activeStringNumbers, soundingNotes, stringNumber } from '../model/chords';
import { NOTE_NAMES, midiToName } from '../model/music';
import type { ChordEvent, ChordLayer, MusicalKey, TimeSignature } from '../model/types';
import {
  auditionChord,
  cycleVoicing,
  makeChord,
  setChordPickPattern,
  shiftChordTone,
  toggleStringMute,
} from '../state/actions';
import { toneColor, toneStyle } from './degreeColor';
import { EventControls } from './EventControls';
import { PickPattern } from './PickPattern';
import { StringsView } from './StringsView';

interface ChordPanelProps {
  layer: ChordLayer;
  chord: ChordEvent;
  timeSignature: TimeSignature;
  /** The song key, for colouring the chord by its degree. */
  songKey: MusicalKey | null;
}

export function ChordPanel({ layer, chord, timeSignature, songKey }: ChordPanelProps) {
  const [selectedString, setSelectedString] = useState<number | null>(null);
  const [showStrings, setShowStrings] = useState(false);
  const tones = soundingNotes(chord.strings);
  const isSeed = chord.quality === 'note';
  const canCycle = chord.quality === 'major' || chord.quality === 'minor';
  const tone = toneStyle(toneColor(chord.root, songKey));

  return (
    <div className="panel-section" data-testid="chord-panel">
      <div className="panel-label">
        <span>{isSeed ? 'Note — make it a chord' : 'Chord'}</span>
        <button className="btn small ghost" onClick={() => auditionChord(chord)} aria-label="Play chord">
          ▶ hear
        </button>
      </div>

      <div className="btn-row">
        <button
          className={`btn tinted ${chord.quality === 'major' ? 'active' : ''}`}
          style={tone}
          onClick={() => makeChord(layer.id, chord.id, 'major')}
          data-testid="make-major"
        >
          {NOTE_NAMES[chord.root]} major
        </button>
        <button
          className={`btn tinted ${chord.quality === 'minor' ? 'active' : ''}`}
          style={tone}
          onClick={() => makeChord(layer.id, chord.id, 'minor')}
          data-testid="make-minor"
        >
          {NOTE_NAMES[chord.root]} minor
        </button>
      </div>

      <div className="panel-label">
        <span>Notes in chord</span>
        <span>{tones.length === 0 ? 'none' : `${tones.length}`}</span>
      </div>
      <div className="tones" data-testid="chord-tones">
        {tones.map((t) => (
          <button
            key={t.index}
            className={`tone ${selectedString === t.index ? 'on' : ''}`}
            onClick={() => setSelectedString(selectedString === t.index ? null : t.index)}
            aria-label={`${midiToName(t.midi)} on string ${stringNumber(t.index)}`}
          >
            {midiToName(t.midi)}
          </button>
        ))}
        {tones.length === 0 && <span className="panel-hint">All strings muted</span>}
      </div>

      {selectedString !== null && !chord.strings[selectedString].muted && (
        <div className="stepper">
          <button className="btn small" onClick={() => shiftChordTone(layer.id, chord.id, selectedString, -1)} aria-label="Tone down">
            ▼
          </button>
          <div className="stepper-label">
            {midiToName(soundingNotes(chord.strings).find((t) => t.index === selectedString)?.midi ?? 0)}
            <small>string {stringNumber(selectedString)}</small>
          </div>
          <button className="btn small" onClick={() => shiftChordTone(layer.id, chord.id, selectedString, 1)} aria-label="Tone up">
            ▲
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              toggleStringMute(layer.id, chord.id, selectedString);
              setSelectedString(null);
            }}
            aria-label="Remove tone"
          >
            ✕
          </button>
        </div>
      )}

      <div className="btn-row">
        <button className="btn small" onClick={() => setShowStrings(!showStrings)} data-testid="toggle-strings">
          {showStrings ? 'Hide strings' : 'Strings'}
        </button>
        <button className="btn small" onClick={() => cycleVoicing(layer.id, chord.id)} disabled={!canCycle} data-testid="cycle-voicing">
          Shift voicing
        </button>
      </div>

      {showStrings && (
        <StringsView
          strings={chord.strings}
          selectedIndex={selectedString}
          onSelect={(i) => setSelectedString(i)}
          onToggleMute={(i) => toggleStringMute(layer.id, chord.id, i)}
        />
      )}

      {layer.type === 'picked' && (
        <div className="panel-section">
          <div className="panel-label">
            <span>{chord.pickPattern ? 'Picking (this chord)' : 'Picking (layer default)'}</span>
            {chord.pickPattern ? (
              <button className="btn small ghost" onClick={() => setChordPickPattern(layer.id, chord.id, null)}>
                Use default
              </button>
            ) : (
              <button className="btn small ghost" onClick={() => setChordPickPattern(layer.id, chord.id, [...layer.pickPattern])} data-testid="override-pick">
                Customise
              </button>
            )}
          </div>
          {chord.pickPattern && (
            <PickPattern
              pattern={chord.pickPattern}
              availableStrings={activeStringNumbers(chord)}
              onChange={(p) => setChordPickPattern(layer.id, chord.id, p)}
            />
          )}
        </div>
      )}

      <EventControls layerId={layer.id} event={chord} timeSignature={timeSignature} />
    </div>
  );
}
