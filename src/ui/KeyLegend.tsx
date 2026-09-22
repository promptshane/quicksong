import { chordName } from '../model/music';
import { diatonicChords } from '../model/keys';
import type { MusicalKey } from '../model/types';
import { degreeColor } from './degreeColor';

/** One line mapping colours to the key's chords: C Dm Em F G Am Bdim, rainbow order. */
export function KeyLegend({ songKey }: { songKey: MusicalKey | null }) {
  if (!songKey) return null;
  return (
    <div className="key-legend" data-testid="key-legend" aria-label="Chord colours for this key">
      {diatonicChords(songKey).map((triad, degree) => (
        <span key={degree} className="key-legend-chord" style={{ color: degreeColor(degree) }} data-degree={degree}>
          {chordName(triad.root, triad.quality)}
        </span>
      ))}
    </div>
  );
}
