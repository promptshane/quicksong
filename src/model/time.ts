import type { Song, TimeSignature } from './types';

export const DEFAULT_TIME_SIGNATURE: TimeSignature = { beatsPerBar: 4, beatUnit: 4 };

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
  for (const layer of [...song.guitar.layers, ...song.piano.layers]) {
    for (const ev of layer.events) end = Math.max(end, ev.start + ev.duration);
  }
  return end;
}

/**
 * Song length in bars. Empty timeline space is explicit: the user adds slots
 * manually instead of the app always appending a trailing empty bar.
 *
 * Content can still force the timeline wider (for migrated songs, moved
 * events, etc.), so existing material is never clipped.
 */
export function songBars(song: Song): number {
  const perBar = song.timeSignature.beatsPerBar;
  const used = Math.max(0, Math.ceil(lastEventEnd(song) / perBar - 1e-6));
  const explicit = Number.isFinite(song.timelineBars) ? Math.max(1, Math.floor(song.timelineBars)) : 1;
  return Math.max(1, explicit, used);
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

/** Length label like "2 beats" or "1 bar". */
export function durationLabel(beats: number, ts: TimeSignature): string {
  if (beats >= ts.beatsPerBar && Math.abs(beats % ts.beatsPerBar) < 1e-6) {
    const bars = beats / ts.beatsPerBar;
    return `${bars} bar${bars === 1 ? '' : 's'}`;
  }
  return `${Number(beats.toFixed(2))} beat${beats === 1 ? '' : 's'}`;
}

/** True on the first beat of a bar (tolerant of float drift). */
export function isDownbeat(beat: number, beatsPerBar: number): boolean {
  if (beatsPerBar <= 0) return false;
  const within = ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  return within < 1e-6 || beatsPerBar - within < 1e-6;
}

/**
 * Loops are always whole bars (the timeline is built from bars), so every
 * loop lands back on a downbeat in any time signature. What makes a loop feel
 * "even" is its phrase length: 1, 2, 4, 8, 16… bars. Returns the bar count of
 * the next even phrase at or above `bars` (equal to `bars` when it is even).
 */
export function evenPhraseBars(bars: number): number {
  let phrase = 1;
  while (phrase < bars) phrase *= 2;
  return phrase;
}
