import { eighthGrouping, eighthsPerBeat } from '../model/time';
import type { StrumSlot, TimeSignature } from '../model/types';

interface StrumGridProps {
  pattern: StrumSlot[];
  timeSignature: TimeSignature;
  onTap: (index: number) => void;
}

const GLYPH: Record<'down' | 'up' | 'none', string> = { down: '↓', up: '↑', none: '—' };

function slotLabel(index: number, ts: TimeSignature): string {
  const per = eighthsPerBeat(ts);
  if (per === 1) return String(index + 1);
  return index % per === 0 ? String(index / per + 1) : '&';
}

/** One tappable cell per eighth note. Tap cycles — → ↓ → ↑. */
export function StrumGrid({ pattern, timeSignature, onTap }: StrumGridProps) {
  const groupSize = eighthGrouping(timeSignature);
  const groups: number[][] = [];
  pattern.forEach((_, i) => {
    const g = Math.floor(i / groupSize);
    (groups[g] ??= []).push(i);
  });
  return (
    <div className="strum-grid" data-testid="strum-grid">
      {groups.map((indices, g) => (
        <div key={g} className="strum-group">
          {indices.map((i) => {
            const slot = pattern[i];
            return (
              <button
                key={i}
                className={`strum-slot ${slot ?? ''}`}
                onClick={() => onTap(i)}
                aria-label={`Slot ${slotLabel(i, timeSignature)}: ${slot ?? 'no strum'}`}
                data-strum-slot={i}
              >
                <span>{GLYPH[slot ?? 'none']}</span>
                <small>{slotLabel(i, timeSignature)}</small>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
