import { useMemo, useRef, useState } from 'react';
import { setMetronomeOn, useMetronome } from '../audio/metronome';
import { transport } from '../audio/transport';
import { buildKeyWheel } from '../model/keyWheel';
import { keyLabel, keyName } from '../model/music';
import { applyTimeSignature, setAutoKey, setAutoKeyPreference, setKeyTonality, setManualKey } from '../model/song';
import { TIME_SIGNATURES, sameTimeSignature, timeSignatureLabel } from '../model/time';
import type { ChordQuality, MusicalKey } from '../model/types';
import { useStore } from '../state/store';
import { CircleOfFifths } from './CircleOfFifths';
import { Sheet } from './Sheet';

type Open = 'bpm' | 'time' | 'key' | null;

const MIN_BPM = 40;
const MAX_BPM = 220;

export function TopBar() {
  const song = useStore((s) => s.song);
  const commit = useStore((s) => s.commit);
  const metronomeOn = useMetronome((s) => s.on);
  const [open, setOpen] = useState<Open>(null);
  // Every tempo change during one visit to the Tempo sheet is one Undo step.
  const tempoVisit = useRef(0);

  const wheel = useMemo(() => buildKeyWheel(song), [song]);
  // Locking with nothing inferred yet pins whatever sits at 12 o'clock.
  const lockTarget: MusicalKey = wheel.assumed ?? (wheel.tonality === 'major' ? { tonic: 0, quality: 'major' } : { tonic: 9, quality: 'minor' });

  const tapKey = (key: MusicalKey) =>
    commit((s) => (s.key.mode === 'manual' ? setManualKey(s, key) : setAutoKeyPreference(s, key)));

  const setBpm = (bpm: number) => {
    const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
    transport.setBpm(clamped);
    commit((s) => ({ ...s, bpm: clamped }), `bpm:${tempoVisit.current}`);
  };

  return (
    <>
      <div className="topbar">
        <button
          className="chip"
          onClick={() => {
            tempoVisit.current += 1;
            setOpen('bpm');
          }}
          aria-label={metronomeOn ? 'BPM, metronome on' : 'BPM'}
        >
          BPM <b>{song.bpm}</b>
          {metronomeOn && <span className="metro-dot" data-testid="metronome-indicator" />}
        </button>
        <button className="chip" onClick={() => setOpen('time')} aria-label="Time signature">
          <b>{timeSignatureLabel(song.timeSignature)}</b>
        </button>
        <button className="chip" onClick={() => setOpen('key')} aria-label="Key">
          Key <b>{keyLabel(song.key, wheel.assumed)}</b>
        </button>
      </div>

      {open === 'bpm' && (
        <Sheet title="Tempo" onClose={() => setOpen(null)}>
          <button
            className={`btn wide metronome-toggle ${metronomeOn ? 'active' : ''}`}
            onClick={() => setMetronomeOn(!metronomeOn)}
            aria-pressed={metronomeOn}
            data-testid="metronome-toggle"
          >
            <span className="metro-dot" aria-hidden />
            Metronome {metronomeOn ? 'on' : 'off'}
          </button>
          <div className="panel-hint compact">Clicks along whenever the song is playing.</div>
          <div className="sheet-row center">
            <button className="btn icon" onClick={() => setBpm(song.bpm - 1)} aria-label="Slower">
              −
            </button>
            <div className="big-value">{song.bpm}</div>
            <button className="btn icon" onClick={() => setBpm(song.bpm + 1)} aria-label="Faster">
              +
            </button>
          </div>
          <input
            type="range"
            min={MIN_BPM}
            max={MAX_BPM}
            value={song.bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            aria-label="BPM slider"
          />
          <div className="btn-row">
            {[70, 90, 100, 120, 140].map((b) => (
              <button key={b} className={`btn small ${song.bpm === b ? 'active' : ''}`} onClick={() => setBpm(b)}>
                {b}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {open === 'time' && (
        <Sheet title="Time signature" onClose={() => setOpen(null)}>
          <div className="option-list">
            {TIME_SIGNATURES.map((ts) => {
              const selected = sameTimeSignature(ts, song.timeSignature);
              return (
                <button
                  key={timeSignatureLabel(ts)}
                  className={`option ${selected ? 'selected' : ''}`}
                  onClick={() => {
                    commit((s) => applyTimeSignature(s, ts));
                    setOpen(null);
                  }}
                >
                  <span>{timeSignatureLabel(ts)}</span>
                  <small>{ts.beatsPerBar} beats per bar</small>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      {open === 'key' && (
        <Sheet title="Key" className="tall" onClose={() => setOpen(null)}>
          <div className="key-status" data-testid="key-status">
            <span className={`key-mode ${wheel.mode}`}>{wheel.mode === 'auto' ? 'Auto' : 'Manual'}</span>
            {wheel.assumed ? (
              <>
                <span className="key-sep">·</span>
                <b>{keyName(wheel.assumed)}</b>
                {wheel.confidence !== null && (
                  <small data-testid="key-confidence">{Math.round(wheel.confidence * 100)}%</small>
                )}
              </>
            ) : (
              <small>add notes or chords to infer a key</small>
            )}
          </div>

          <CircleOfFifths wheel={wheel} onTapKey={tapKey} />

          <div className="segmented" role="group" aria-label="Tonality">
            {(['major', 'minor'] as ChordQuality[]).map((quality) => (
              <button
                key={quality}
                className={wheel.tonality === quality ? 'active' : ''}
                aria-pressed={wheel.tonality === quality}
                onClick={() => commit((s) => setKeyTonality(s, quality))}
              >
                {quality === 'major' ? 'Major' : 'Minor'}
              </button>
            ))}
          </div>

          <div className="btn-row">
            <button
              className={`btn small ${wheel.mode === 'auto' ? 'active' : ''}`}
              data-testid="key-auto"
              aria-pressed={wheel.mode === 'auto'}
              onClick={() => commit(setAutoKey)}
            >
              Auto
            </button>
            <button
              className={`btn small ${wheel.mode === 'manual' ? 'active' : ''}`}
              data-testid="key-lock"
              aria-pressed={wheel.mode === 'manual'}
              onClick={() => commit((s) => setManualKey(s, lockTarget))}
            >
              {wheel.mode === 'manual' ? `Locked · ${keyName(lockTarget)}` : `Lock ${keyName(lockTarget)}`}
            </button>
          </div>

          <div className="panel-hint">
            {wheel.mode === 'auto'
              ? 'Tap a light-yellow key to assume it for now. Auto drops it if your material rules it out.'
              : 'Key is locked. Tap any tonic on the wheel to change it.'}
          </div>
        </Sheet>
      )}
    </>
  );
}
