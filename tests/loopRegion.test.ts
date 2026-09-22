import { beforeEach, describe, expect, it } from 'vitest';
import * as engine from '../src/audio/engine';
engine.initAudioEngine(() => ({ noteOn() {}, allNotesOff() {} }));
import { describeChange } from '../src/model/labels';
import { createPianoLayer } from '../src/model/piano';
import { isPristineSong } from '../src/model/projects';
import {
  appendLayer,
  createSong,
  findPianoLayer,
  isLoopOn,
  setLoopOn,
  setLoopRegion,
} from '../src/model/song';
import { loopRange, rangeLabel } from '../src/model/time';
import type { Song } from '../src/model/types';
import { addChordAtCursor, resizeEvent, setSongLoop } from '../src/state/actions';
import { useStore } from '../src/state/store';

const fourBars = (): Song => ({ ...createSong(), timelineBars: 4 }); // 16 beats in 4/4

describe('loop region model', () => {
  it('defaults to the whole song, which follows the song length', () => {
    const song = fourBars();
    expect(loopRange(song)).toEqual({ start: 0, end: 16, whole: true });
    expect(loopRange({ ...song, timelineBars: 6 })).toEqual({ start: 0, end: 24, whole: true });
  });

  it('keeps a custom region inside the song, and clears it when it covers everything', () => {
    const song = fourBars();
    expect(setLoopRegion(song, 4, 12).loopRegion).toEqual({ start: 4, end: 12 });
    expect(setLoopRegion(song, -4, 30).loopRegion).toBeUndefined(); // clamped to the whole song
    expect(setLoopRegion(setLoopRegion(song, 4, 12), 0, 16).loopRegion).toBeUndefined();
    expect(setLoopRegion(song, 8, 8).loopRegion).toBeUndefined(); // empty
  });

  it('a region that no longer fits the song falls back to what does', () => {
    const song = setLoopRegion(fourBars(), 8, 16);
    expect(loopRange({ ...song, timelineBars: 3 })).toEqual({ start: 8, end: 12, whole: false });
    expect(loopRange({ ...song, timelineBars: 2 })).toEqual({ start: 0, end: 8, whole: true });
  });

  it('is described in bars, and makes a new project worth keeping', () => {
    const song = fourBars();
    const looped = setLoopRegion(song, 4, 12);
    expect(describeChange(song, looped)).toBe('Loop bars 2–3');
    expect(describeChange(looped, song)).toBe('Loop · whole song');
    expect(rangeLabel(4, 8, song.timeSignature)).toBe('bar 2');
    expect(rangeLabel(5, 8, song.timeSignature)).toBe('2.2–3.1');
    expect(isPristineSong(setLoopRegion(createSong(), 0, 2))).toBe(false);
  });
});

describe('editing the loop and event edges', () => {
  beforeEach(() => {
    useStore.setState({ ...useStore.getInitialState(), hydrated: true, song: fourBars() });
  });

  it('one loop drag is one Undo step', () => {
    for (const end of [14, 12, 10]) setSongLoop(0, end, 'loop:1');
    expect(useStore.getState().song.loopRegion).toEqual({ start: 0, end: 10 });
    expect(useStore.getState().past).toHaveLength(1);
    useStore.getState().undo();
    expect(useStore.getState().song.loopRegion).toBeUndefined();
  });

  it('edge handles set start and length on the eighth grid in one step', () => {
    const layer = createPianoLayer(useStore.getState().song);
    useStore.getState().commit((s) => appendLayer(s, layer));
    useStore.getState().setView({ name: 'pianoLayer', layerId: layer.id });
    const id = addChordAtCursor(layer.id, 0, 'major')!; // beats 0..4
    const event = () => findPianoLayer(useStore.getState().song, layer.id)!.events.find((e) => e.id === id)!;
    const steps = useStore.getState().past.length;

    // Drag the start in by ~1.2 beats (snaps to 1), keeping the end.
    resizeEvent(layer.id, id, 0.6, 3.4, 'edge:1');
    resizeEvent(layer.id, id, 1.2, 2.8, 'edge:1');
    expect(event()).toMatchObject({ start: 1, duration: 3 });
    expect(useStore.getState().past.length).toBe(steps + 1);

    // Never shorter than an eighth, never before the start of the song.
    resizeEvent(layer.id, id, -2, 0.1, 'edge:2');
    expect(event()).toMatchObject({ start: 0, duration: 0.5 });
    useStore.getState().undo();
    expect(event()).toMatchObject({ start: 1, duration: 3 });
  });
});

describe('loop on / off in the song', () => {
  it('is on by default, saved when off, and described for Undo', () => {
    const song = fourBars();
    expect(isLoopOn(song)).toBe(true);
    const off = setLoopOn(song, false);
    expect(off.loopOff).toBe(true);
    expect(isLoopOn(off)).toBe(false);
    expect(setLoopOn(off, true)).not.toHaveProperty('loopOff');
    expect(describeChange(song, off)).toBe('Loop off');
    expect(describeChange(off, song)).toBe('Loop on');
    expect(isPristineSong(setLoopOn(createSong(), false))).toBe(false);
  });
});
