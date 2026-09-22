/**
 * Loop geometry for the transport, kept pure so it can be tested without
 * audio. Playback runs on an ever-increasing ("unwrapped") beat counter; the
 * first pass plays from the start position to `endBeat`, and every later pass
 * replays `loopFrom`..`endBeat`. So playing from bar 3 of a 4-bar song plays
 * bars 3–4 once, then loops bars 1–4.
 */
export interface LoopSpan {
  loop: boolean;
  loopFrom: number;
  endBeat: number;
}

function loopLength(span: LoopSpan): number {
  return span.endBeat - span.loopFrom;
}

/** Song position for an unwrapped play position. */
export function songBeatAt(unwrapped: number, span: LoopSpan): number {
  const length = loopLength(span);
  if (!span.loop || length <= 0 || unwrapped < span.endBeat - 1e-9) return unwrapped;
  const into = (((unwrapped - span.endBeat) % length) + length) % length;
  return span.loopFrom + into;
}

/** Unwrapped play position of song beat `beat` on pass `pass` (0 = the first pass). */
export function passBeat(beat: number, pass: number, span: LoopSpan): number {
  if (pass === 0) return beat;
  return span.endBeat + (pass - 1) * loopLength(span) + (beat - span.loopFrom);
}
