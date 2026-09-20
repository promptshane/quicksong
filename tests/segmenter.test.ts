import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '../src/model/music';
import { NoteSegmenter, quantizeNotes } from '../src/pitch/segmenter';

/** Feed a synthetic "performance": a list of [midi | null, seconds] segments. */
function sing(seg: NoteSegmenter, parts: [number | null, number][], frameSec = 0.03): number {
  let t = 0;
  for (const [midi, dur] of parts) {
    const frames = Math.round(dur / frameSec);
    for (let i = 0; i < frames; i++) {
      seg.push({
        time: t,
        hz: midi == null ? 0 : midiToFrequency(midi + (Math.random() - 0.5) * 0.2),
        clarity: midi == null ? 0.2 : 0.97,
        rms: midi == null ? 0.002 : 0.1,
      });
      t += frameSec;
    }
  }
  return t;
}

describe('NoteSegmenter', () => {
  it('splits a hummed phrase into notes by pitch change and silence', () => {
    const seg = new NoteSegmenter();
    const end = sing(seg, [
      [60, 0.5],
      [64, 0.5],
      [null, 0.3],
      [67, 0.4],
    ]);
    const notes = seg.finish(end);
    expect(notes.map((n) => n.midi)).toEqual([60, 64, 67]);
    expect(notes[0].startSec).toBeCloseTo(0, 1);
    expect(notes[0].endSec).toBeCloseTo(0.5, 1);
    expect(notes[2].startSec).toBeCloseTo(1.3, 1);
  });

  it('ignores very short blips', () => {
    const seg = new NoteSegmenter();
    const end = sing(seg, [
      [60, 0.5],
      [null, 0.2],
      [72, 0.03],
      [null, 0.2],
    ]);
    expect(seg.finish(end).map((n) => n.midi)).toEqual([60]);
  });

  it('does not split on a single-frame pitch glitch', () => {
    const seg = new NoteSegmenter();
    let t = 0;
    const push = (midi: number) => {
      seg.push({ time: t, hz: midiToFrequency(midi), clarity: 0.97, rms: 0.1 });
      t += 0.03;
    };
    for (let i = 0; i < 10; i++) push(60);
    push(67); // one glitchy frame
    for (let i = 0; i < 10; i++) push(60);
    expect(seg.finish(t).map((n) => n.midi)).toEqual([60]);
  });

  it('re-articulates the same pitch after a level dip', () => {
    const seg = new NoteSegmenter();
    let t = 0;
    const push = (rms: number) => {
      seg.push({ time: t, hz: 220, clarity: 0.97, rms });
      t += 0.03;
    };
    for (let i = 0; i < 10; i++) push(0.1);
    for (let i = 0; i < 2; i++) push(0.02); // dip
    for (let i = 0; i < 10; i++) push(0.1);
    const notes = seg.finish(t);
    expect(notes).toHaveLength(2);
    expect(notes.every((n) => n.midi === 57)).toBe(true);
  });
});

describe('quantizeNotes', () => {
  it('snaps to the eighth grid at the given tempo', () => {
    const bpm = 120; // beat = 0.5s, eighth = 0.25s
    const notes = quantizeNotes(
      [
        { midi: 60, startSec: 10.02, endSec: 10.49, confidence: 1, peakRms: 0.1 },
        { midi: 62, startSec: 10.55, endSec: 11.2, confidence: 1, peakRms: 0.2 },
      ],
      10,
      4,
      bpm,
      0.5,
    );
    expect(notes.map((n) => [n.midi, n.start, n.duration])).toEqual([
      [60, 4, 1],
      [62, 5, 1.5],
    ]);
    expect(notes[1].velocity).toBeGreaterThan(notes[0].velocity);
  });

  it('never produces zero-length or overlapping notes', () => {
    const notes = quantizeNotes(
      [
        { midi: 60, startSec: 0, endSec: 0.05, confidence: 1, peakRms: 0.1 },
        { midi: 62, startSec: 0.1, endSec: 0.9, confidence: 1, peakRms: 0.1 },
      ],
      0,
      0,
      120,
      0.5,
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].midi).toBe(62);
  });
});
