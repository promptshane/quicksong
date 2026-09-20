import { useMemo, useState } from 'react';
import { NOTE_NAMES, inferKey, keyLabel } from '../model/music';
import { applyTimeSignature, pitchClassHistogram } from '../model/song';
import { TIME_SIGNATURES, sameTimeSignature, timeSignatureLabel } from '../model/time';
import type { ChordQuality, PitchClass } from '../model/types';
import { useStore } from '../state/store';
import { Sheet } from './Sheet';

type Open = 'bpm' | 'time' | 'key' | null;

const MIN_BPM = 40;
const MAX_BPM = 220;

export function TopBar() {
  const song = useStore((s) => s.song);
  const commit = useStore((s) => s.commit);
  const [open, setOpen] = useState<Open>(null);

  const guess = useMemo(() => inferKey(pitchClassHistogram(song)), [song]);

  const setBpm = (bpm: number) => {
    const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
    commit((s) => ({ ...s, bpm: clamped }));
  };

  return (
    <>
      <div className="topbar">
        <button className="chip" onClick={() => setOpen('bpm')} aria-label="BPM">
          BPM <b>{song.bpm}</b>
        </button>
        <button className="chip" onClick={() => setOpen('time')} aria-label="Time signature">
          <b>{timeSignatureLabel(song.timeSignature)}</b>
        </button>
        <button className="chip" onClick={() => setOpen('key')} aria-label="Key">
          Key <b>{keyLabel(song.key, guess)}</b>
        </button>
      </div>

      {open === 'bpm' && (
        <Sheet title="Tempo" onClose={() => setOpen(null)}>
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
        <Sheet title="Key" onClose={() => setOpen(null)}>
          <button
            className={`option ${song.key.mode === 'auto' ? 'selected' : ''}`}
            onClick={() => commit((s) => ({ ...s, key: { mode: 'auto' } }))}
          >
            <span>Auto</span>
            <small>
              {guess
                ? `Guessing ${NOTE_NAMES[guess.tonic]} ${guess.quality} · ${Math.round(guess.confidence * 100)}%`
                : 'Add notes to infer a key'}
            </small>
          </button>
          {(['major', 'minor'] as ChordQuality[]).map((quality) => (
            <div key={quality} className="panel-section">
              <div className="panel-label">{quality}</div>
              <div className="option-grid">
                {NOTE_NAMES.map((name, i) => {
                  const selected =
                    song.key.mode === 'manual' && song.key.tonic === i && song.key.quality === quality;
                  return (
                    <button
                      key={name}
                      className={`btn small ${selected ? 'active' : ''}`}
                      onClick={() =>
                        commit((s) => ({ ...s, key: { mode: 'manual', tonic: i as PitchClass, quality } }))
                      }
                    >
                      {name}
                      {quality === 'minor' ? 'm' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </Sheet>
      )}
    </>
  );
}
