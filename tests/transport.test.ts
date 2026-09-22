import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as engine from '../src/audio/engine';
import { passBeat, songBeatAt } from '../src/audio/loop';
import { transport } from '../src/audio/transport';
import { createPianoChord, createPianoLayer } from '../src/model/piano';
import { addEvent, appendLayer, createSong, removeEvent } from '../src/model/song';
import type { Song } from '../src/model/types';

// A fake audio clock the test moves by hand; the transport schedules against it.
const ctx = { currentTime: 0, state: 'running', destination: {} } as unknown as AudioContext & { currentTime: number };
const played: { midi: number; when: number }[] = [];
const instrument = { noteOn: (midi: number, _v: number, when: number) => played.push({ midi, when }), allNotesOff() {} };
const audio = engine.initAudioEngine(() => instrument);
Object.assign(audio, {
  unlock: async () => ctx,
  now: () => ctx.currentTime,
  getInstrument: () => instrument,
});
Object.defineProperty(audio, 'context', { get: () => ctx });
globalThis.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = () => {};

/** Advance the audio clock and the scheduler timer together. */
function runUntil(seconds: number) {
  while (ctx.currentTime < seconds - 1e-9) {
    ctx.currentTime = Math.min(seconds, ctx.currentTime + 0.025);
    vi.advanceTimersByTime(25);
  }
}

/** Distinct hit times (seconds, 2 dp) for one MIDI note. */
const hitsOf = (midi: number) => [...new Set(played.filter((p) => p.midi === midi).map((p) => Number(p.when.toFixed(2))))];

// 120 BPM = 0.5 s per beat; playback starts 0.05 s after Play.
function song(): { song: Song; layerId: string } {
  let s = { ...createSong(), bpm: 120 };
  const layer = createPianoLayer(s);
  s = appendLayer(s, layer);
  s = addEvent(s, layer.id, { ...createPianoChord(0, 'major', 0, 1), id: 'c' }); // C4 = 60 at beat 0
  s = addEvent(s, layer.id, { ...createPianoChord(7, 'major', 2, 1), id: 'g' }); // G3 = 55 at beat 2
  return { song: s, layerId: layer.id };
}

beforeEach(() => {
  vi.useFakeTimers();
  ctx.currentTime = 0;
  played.length = 0;
});
afterEach(() => {
  transport.stop();
  vi.useRealTimers();
});

describe('loop geometry', () => {
  it('first pass runs from the start position, later passes replay loopFrom..end', () => {
    const span = { loop: true, loopFrom: 0, endBeat: 4 };
    expect(songBeatAt(3, span)).toBe(3);
    expect(songBeatAt(4, span)).toBe(0);
    expect(songBeatAt(9.5, span)).toBe(1.5);
    expect(passBeat(2, 0, span)).toBe(2);
    expect(passBeat(0, 1, span)).toBe(4);
    expect(passBeat(2, 2, span)).toBe(10);
    expect(songBeatAt(5, { ...span, loop: false })).toBe(5);
  });
});

describe('transport', () => {
  it('editor play: from the cursor to the end, then loops the whole song', async () => {
    const { song: s } = song();
    await transport.play(s, 2, { loop: true, loopFrom: 0 });
    runUntil(4.5);
    expect(hitsOf(55)).toEqual([0.05, 2.05, 4.05]); // G at beat 2 on every pass
    expect(hitsOf(60)).toEqual([1.05, 3.05]); // C at beat 0 only from the second pass
    expect(transport.isPlaying).toBe(true);
  });

  it('hears edits made while playing, without restarting', async () => {
    const { song: s, layerId } = song();
    await transport.play(s, 0, { loop: true });
    runUntil(0.5); // around beat 0.9

    // Add a Dm at beat 3 and remove the G at beat 2 — both still ahead.
    let edited = addEvent(s, layerId, { ...createPianoChord(2, 'minor', 3, 1), id: 'dm' }); // D4 F4 A4; F4 = 65
    edited = removeEvent(edited, layerId, 'g');
    transport.refresh(edited);
    runUntil(4.2);
    expect(hitsOf(65)).toEqual([1.55, 3.55]);
    expect(hitsOf(55)).toEqual([]);
    expect(hitsOf(60)).toEqual([0.05, 2.05, 4.05]); // the loop itself is undisturbed
  });

  it('the loop follows a slot added while playing', async () => {
    const { song: s } = song();
    await transport.play(s, 0, { loop: true });
    runUntil(0.5);
    transport.refresh({ ...s, timelineBars: 2 }); // 8 beats now
    runUntil(4.5);
    expect(hitsOf(60)).toEqual([0.05, 4.05]);
  });

  it('ignores refreshes for a different song (e.g. a project preview)', async () => {
    const { song: s, layerId } = song();
    await transport.play(s, 0, { loop: true });
    runUntil(0.3);
    transport.refresh({ ...removeEvent(s, layerId, 'g'), id: 'other' });
    runUntil(1.2);
    expect(hitsOf(55)).toEqual([1.05]);
  });

  it('a one-shot play stops at the end and returns to where it started', async () => {
    const { song: s } = song();
    await transport.play(s, 2);
    runUntil(1.2);
    expect(transport.isPlaying).toBe(false);
    expect(hitsOf(60)).toEqual([]);
  });
});

describe('transport and the loop region', () => {
  it('loops only the region, starting there when played from outside it', async () => {
    let { song: s, layerId } = song();
    s = addEvent({ ...s, timelineBars: 2 }, layerId, { ...createPianoChord(2, 'minor', 4, 1), id: 'dm' }); // F4 = 65 at beat 4
    s = { ...s, loopRegion: { start: 4, end: 8 } }; // bar 2 only
    await transport.play(s, 0, { loop: true });
    runUntil(4.5);
    expect(hitsOf(65)).toEqual([0.05, 2.05, 4.05]); // bar 2, every 2 s
    expect(hitsOf(60)).toEqual([]); // bar 1 never plays
  });

  it('follows the region being changed while playing', async () => {
    const { song: s } = song();
    const looped = { ...s, timelineBars: 2 };
    await transport.play(looped, 0, { loop: true });
    runUntil(0.5);
    transport.refresh({ ...looped, loopRegion: { start: 0, end: 4 } }); // now just bar 1
    runUntil(4.5);
    expect(hitsOf(60)).toEqual([0.05, 2.05, 4.05]);
  });
});
