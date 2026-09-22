import { describe, expect, it, vi } from 'vitest';
import * as engine from '../src/audio/engine';
engine.initAudioEngine(() => ({ noteOn() {}, allNotesOff() {} }));
import { installMetronome, setMetronomeOn, useMetronome } from '../src/audio/metronome';
import { transport } from '../src/audio/transport';
import { isDownbeat } from '../src/model/time';

describe('isDownbeat', () => {
  it('accents the first beat of every bar, tolerating float drift', () => {
    expect([0, 1, 2, 3, 4, 5, 8].map((b) => isDownbeat(b, 4))).toEqual([true, false, false, false, true, false, true]);
    expect(isDownbeat(6, 3)).toBe(true);
    expect(isDownbeat(3.9999999, 4)).toBe(true);
    expect(isDownbeat(0.5, 4)).toBe(false);
  });
});

describe('editing metronome', () => {
  it('only ever asks the transport to click (so it is silent while paused), and only in an open project', () => {
    const editClick = vi.spyOn(transport, 'setEditClick');
    let setActive: (active: boolean) => void = () => {};
    installMetronome((listener) => {
      setActive = listener;
      listener(false);
    });

    setMetronomeOn(true);
    expect(useMetronome.getState().on).toBe(true);
    expect(editClick).toHaveBeenLastCalledWith(false); // Projects screen: silent

    setActive(true);
    expect(editClick).toHaveBeenLastCalledWith(true);
    // Nothing is playing, so nothing is scheduled: the transport is the only clock.
    expect(transport.isPlaying).toBe(false);

    setMetronomeOn(false);
    expect(editClick).toHaveBeenLastCalledWith(false);
  });
});
