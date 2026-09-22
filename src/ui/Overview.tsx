import { useTransport } from '../audio/transport';
import { songBars, songBeats } from '../model/time';
import type { AnyLayer, Song } from '../model/types';
import { useStore } from '../state/store';
import { HitShape } from './HitShape';

interface OverviewProps {
  song: Song;
  layer: AnyLayer;
  showPlayhead?: boolean;
  /** Draw each event as a hit (strike height = velocity, dropoff = duration) instead of a plain bar. */
  hits?: boolean;
}

/** Fit-to-width strip of one layer's clips (Song Home and the instrument layer pages). */
export function Overview({ song, layer, showPlayhead = true, hits = false }: OverviewProps) {
  const total = songBeats(song);
  const bars = songBars(song);
  const playhead = useTransport((s) => s.playheadBeat);
  const playing = useTransport((s) => s.playing);
  const cursor = useStore((s) => s.cursorBeat);
  const pct = (beat: number) => `${(beat / total) * 100}%`;

  return (
    <div className="overview" data-layer-id={layer.id}>
      {Array.from({ length: bars }, (_, i) => (
        <div key={i} className="bar-line" style={{ left: pct(i * song.timeSignature.beatsPerBar) }} />
      ))}
      {layer.events.map((ev) => (
        <div
          key={ev.id}
          className={`clip ${ev.kind} ${hits ? 'hit' : ''}`}
          style={{ left: pct(ev.start), width: pct(ev.duration) }}
          title={ev.id}
          data-velocity={hits ? ev.velocity : undefined}
        >
          {hits && <HitShape velocity={ev.velocity} />}
        </div>
      ))}
      {showPlayhead && <div className="cursor" style={{ left: pct(cursor) }} />}
      {showPlayhead && playing && <div className="playhead" style={{ left: pct(playhead) }} />}
    </div>
  );
}
