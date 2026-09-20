import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../audio/engine';
import { transport } from '../audio/transport';
import { eighthBeats } from '../model/time';
import type { Song } from '../model/types';
import { createMpmDetector } from './detector';
import { MicCapture } from './mic';
import { NoteSegmenter, quantizeNotes } from './segmenter';

export interface HumResult {
  notes: { midi: number; start: number; duration: number; velocity: number }[];
}

/**
 * 'preview' — detection only: the live note is exposed for the keyboard
 *             highlight, nothing is timed, nothing is committed.
 * 'record'  — a take: metronome from the cursor, notes segmented and
 *             quantised, committed via `onResult` on stop.
 */
export type HumMode = 'preview' | 'record';

export interface HumState {
  mode: HumMode | null;
  /** MIDI note currently being sung (octave included), or null. */
  liveMidi: number | null;
  /** Input level 0..1 for the meter. */
  level: number;
  /** Increments on every analysed mic frame (drives per-frame effects). */
  frame: number;
  /** Notes captured so far — only meaningful while recording. */
  captured: number;
  error: string | null;
  metronome: boolean;
}

const MAX_RECORD_BEATS = 64;

/**
 * The single humming pipeline: mic → pitch detector → note segmenter.
 * Both modes share it; only what happens with the result differs.
 */
export function useHumming(onResult: (result: HumResult) => void) {
  const [state, setState] = useState<HumState>({
    mode: null,
    liveMidi: null,
    level: 0,
    frame: 0,
    captured: 0,
    error: null,
    metronome: true,
  });
  const micRef = useRef<MicCapture | null>(null);
  const segRef = useRef<NoteSegmenter | null>(null);
  const takeRef = useRef<{ song: Song; startBeat: number; startSec: number } | null>(null);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  });

  const stop = useCallback(() => {
    const mic = micRef.current;
    const seg = segRef.current;
    const take = takeRef.current;
    micRef.current = null;
    segRef.current = null;
    takeRef.current = null;
    mic?.stop();
    setState((s) => ({ ...s, mode: null, liveMidi: null, level: 0, captured: 0 }));
    // Preview: nothing else to do. Record: finish the take and hand back notes.
    if (!seg || !take) return;
    const now = getAudioEngine().now();
    transport.stop(take.startBeat);
    const detected = seg.finish(now);
    const notes = quantizeNotes(detected, take.startSec, take.startBeat, take.song.bpm, eighthBeats(take.song.timeSignature));
    onResultRef.current({ notes });
  }, []);

  const start = useCallback(
    async (mode: HumMode, song: Song, startBeat: number) => {
      if (micRef.current) return;
      if (!MicCapture.isSupported()) {
        setState((s) => ({ ...s, error: 'Microphone not available in this browser' }));
        return;
      }
      const engine = getAudioEngine();
      const ctx = await engine.unlock();
      if (!ctx) {
        setState((s) => ({ ...s, error: 'Audio could not start' }));
        return;
      }
      const seg = new NoteSegmenter();
      const mic = new MicCapture(ctx, createMpmDetector());
      try {
        await mic.start((frame) => {
          seg.push(frame);
          const cur = seg.current;
          setState((s) => ({
            ...s,
            liveMidi: cur ? cur.midi : null,
            level: Math.min(1, frame.rms * 6),
            frame: s.frame + 1,
            captured: mode === 'record' ? seg.completed.length : 0,
          }));
        });
      } catch (err) {
        const name = (err as { name?: string }).name;
        setState((s) => ({
          ...s,
          error:
            name === 'NotAllowedError'
              ? 'Microphone access was denied. Allow it in Settings › Safari › Microphone.'
              : `Could not open microphone (${name ?? 'unknown error'})`,
        }));
        return;
      }
      micRef.current = mic;
      segRef.current = seg;
      setState((s) => ({ ...s, mode, error: null, captured: 0, liveMidi: null }));

      if (mode === 'record') {
        // Run the click from the cursor so timing has a reference. Existing
        // layers play too, so the user can hum along to what is already there.
        await transport.play(song, startBeat, {
          metronome: state.metronome,
          endBeat: startBeat + MAX_RECORD_BEATS,
          onEnd: () => stop(),
        });
        takeRef.current = { song, startBeat, startSec: transport.timeForBeat(startBeat) };
      }
    },
    [state.metronome, stop],
  );

  const setMetronome = useCallback((on: boolean) => {
    setState((s) => ({ ...s, metronome: on }));
    const take = takeRef.current;
    if (take) transport.setMetronome(on, take.song.timeSignature.beatsPerBar);
  }, []);
  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  useEffect(
    () => () => {
      micRef.current?.stop();
      if (takeRef.current) transport.stop(takeRef.current.startBeat);
    },
    [],
  );

  return { state, start, stop, setMetronome, clearError };
}
