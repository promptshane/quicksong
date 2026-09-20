interface PickPatternProps {
  pattern: number[];
  /** String numbers (6..1) that sound in the current chord, if one is selected. */
  availableStrings: number[] | null;
  onChange: (pattern: number[]) => void;
}

const STRINGS = [1, 2, 3, 4, 5, 6];

/** Grid of beats × strings: tap a cell to choose which string is picked on that beat. */
export function PickPattern({ pattern, availableStrings, onChange }: PickPatternProps) {
  return (
    <div className="pick-grid" data-testid="pick-grid">
      {pattern.map((chosen, beat) => (
        <div key={beat} className="pick-beat">
          <div className="beat-label">{beat + 1}</div>
          {STRINGS.map((s) => {
            const unavailable = availableStrings !== null && !availableStrings.includes(s);
            return (
              <button
                key={s}
                className={`pick-string ${chosen === s ? 'on' : ''} ${unavailable ? 'unavailable' : ''}`}
                onClick={() => onChange(pattern.map((v, i) => (i === beat ? s : v)))}
                aria-label={`Beat ${beat + 1}: string ${s}`}
                data-pick={`${beat}-${s}`}
              >
                {s}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
