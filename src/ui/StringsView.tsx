import { stringMidi, stringNumber } from '../model/chords';
import { midiToName } from '../model/music';
import type { Voicing } from '../model/types';

interface StringsViewProps {
  strings: Voicing;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onToggleMute: (index: number) => void;
}

/** The six strings, high e on top like guitar tab. */
export function StringsView({ strings, selectedIndex, onSelect, onToggleMute }: StringsViewProps) {
  const order = [5, 4, 3, 2, 1, 0];
  return (
    <div className="strings" data-testid="strings">
      {order.map((index) => {
        const s = strings[index];
        const midi = stringMidi(index, s);
        return (
          <div
            key={index}
            className={`string ${s.muted ? 'muted' : ''} ${selectedIndex === index ? 'on' : ''}`}
            data-string={stringNumber(index)}
          >
            <span className="string-num">{stringNumber(index)}</span>
            <button className="string-line" onClick={() => onSelect(index)} aria-label={`Select string ${stringNumber(index)}`} />
            <button className="string-fret" onClick={() => onSelect(index)} aria-label={`String ${stringNumber(index)} fret`}>
              {s.muted ? 'x' : s.fret === 0 ? 'open' : s.fret}
            </button>
            <span className="string-note">{s.muted ? '' : midiToName(midi)}</span>
            <button
              className={`btn small ${s.muted ? 'ghost' : 'active'}`}
              onClick={() => onToggleMute(index)}
              aria-label={s.muted ? `Play string ${stringNumber(index)}` : `Mute string ${stringNumber(index)}`}
            >
              {s.muted ? 'Off' : 'On'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
