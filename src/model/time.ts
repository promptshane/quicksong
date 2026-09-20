import type { Song, TimeSignature } from './types';

export const DEFAULT_TIME_SIGNATURE: TimeSignature = { beatsPerBar: 4, beatUnit: 4 };
export const MIN_BARS = 4;

export const TIME_SIGNATURES: TimeSignature[] = [
  { beatsPerBar: 4, beatUnit: 4 },
  { beatsPerBar: 3, beatUnit: 4 },
  { beatsPerBar: 2, beatUnit: 4 },
  { beatsPerBar: 6, beatUnit: 8 },
  { beatsPerBar: 5, beatUnit: 4 },
  { beatsPerBar: 7, beatUnit: 8 },
];

export function timeSignatureLabel(ts: TimeSignature): string {
  return `${ts.beatsPerBar}/${ts.beatUnit}`;
}

export function sameTimeSignature(a: TimeSignature, b: TimeSignature): boolean {
  return a.beatsPerBar === b.beatsPerBar && a.beatUnit === b.beatUnit;
}

/** How many eighth-note grid slots fit in one beat. */
export function eighthsPerBeat(ts: TimeSignature): number {
  return ts.beatUnit === 4 ? 2 : 1;
}

/** Length of one eighth-note grid slot, in beats. */
export function eighthBeats(ts: TimeSignature): number {
  return 1 / eighthsPerBeat(ts);
}

export function eighthsPerBar(ts: TimeSignature): number {
  return ts.beatsPerBar * eighthsPerBeat(ts);
}

/** Group size for visually grouping eighth slots (6/8 -> 3, 4/4 -> 2). */
export function eighthGrouping(ts: TimeSignature): number {
  if (ts.beatUnit === 8) return ts.beatsPerBar % 3 === 0 ? 3 : 2;
  return 2;
}

export function snapToEighth(beat: number, ts: TimeSignature): number {
  const step = eighthBeats(ts);
  return Math.round(beat / step) * step;
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats * 60) / bpm;
}

export function secondsToBeats(seconds: number, bpm: number): number {
  return (seconds * bpm) / 60;
}

/** Last beat that contains any event. */
export function lastEventEnd(song: Song): number {
  let end = 0;
  for (const layer of song.guitar.layers) {
    for (const ev of layer.events) end = Math.max(end, ev.start + ev.duration);
  }
  return end;
}

/**
 * Song length in bars: at least MIN_BARS, and always one empty bar after the
 * last event so there is room to keep adding.
 */
export function songBars(song: Song): number {
  const perBar = song.timeSignature.beatsPerBar;
  const used = Math.ceil(lastEventEnd(song) / perBar + 1e-6);
  return Math.max(MIN_BARS, used + 1);
}

export function songBeats(song: Song): number {
  return songBars(song) * song.timeSignature.beatsPerBar;
}

/** Position label like "2.3" (bar.beat, 1-based); off-beat eighths show as "2.3&". */
export function positionLabel(beat: number, ts: TimeSignature): string {
  const bar = Math.floor(beat / ts.beatsPerBar + 1e-6) + 1;
  const within = beat - (bar - 1) * ts.beatsPerBar;
  const inBar = Math.floor(within + 1e-6) + 1;
  const offbeat = within - Math.floor(within + 1e-6) > 1e-6;
  return `${bar}.${inBar}${offbeat ? '&' : ''}`;
}
