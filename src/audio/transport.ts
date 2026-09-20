import { create } from 'zustand';
import { beatsToSeconds, songBeats } from '../model/time';
import type { Song } from '../model/types';
import { getAudioEngine } from './engine';
import { renderSong, type ScheduledNote } from './render';
import { scheduleClick } from './synth';

/**
 * Look-ahead scheduler (the standard "tale of two clocks" pattern). Notes are
 * scheduled a short window ahead on the AudioContext clock; a timer keeps the
 * window topped up. The UI reads `currentBeat()` from requestAnimationFrame.
 */

interface TransportState {
  playing: boolean;
  /** Beat the playhead is at (updated ~60fps while playing). */
  playheadBeat: number;
}

export const useTransport = create<TransportState>(() => ({ playing: false, playheadBeat: 0 }));

const LOOKAHEAD_SEC = 0.12;
const TICK_MS = 25;

class Transport {
  private timer: ReturnType<typeof setInterval> | null = null;
  private raf = 0;
  private notes: ScheduledNote[] = [];
  private nextIndex = 0;
  private startBeat = 0;
  private startTime = 0;
  private bpm = 100;
  private endBeat = 0;
  private onEnd: (() => void) | null = null;
  private metronome: { beatsPerBar: number } | null = null;
  private nextClickBeat = 0;

  get isPlaying(): boolean {
    return this.timer !== null;
  }

  currentBeat(): number {
    if (!this.isPlaying) return useTransport.getState().playheadBeat;
    const elapsed = getAudioEngine().now() - this.startTime;
    return this.startBeat + (elapsed * this.bpm) / 60;
  }

  /**
   * Start playing `song` from `fromBeat`. `opts.metronome` adds a click on
   * every beat (used while recording a hum). `opts.endBeat` overrides where
   * playback stops (default: end of song).
   */
  async play(
    song: Song,
    fromBeat: number,
    opts: { metronome?: boolean; endBeat?: number; onEnd?: () => void } = {},
  ): Promise<void> {
    const engine = getAudioEngine();
    const ctx = await engine.unlock();
    if (!ctx) return;
    this.stop();

    this.notes = renderSong(song);
    this.bpm = song.bpm;
    this.startBeat = fromBeat;
    this.endBeat = opts.endBeat ?? songBeats(song);
    this.onEnd = opts.onEnd ?? null;
    this.metronome = opts.metronome ? { beatsPerBar: song.timeSignature.beatsPerBar } : null;
    this.nextClickBeat = Math.ceil(fromBeat - 1e-6);
    this.nextIndex = this.notes.findIndex((n) => n.beat >= fromBeat - 1e-6);
    if (this.nextIndex < 0) this.nextIndex = this.notes.length;
    this.startTime = ctx.currentTime + 0.05;

    useTransport.setState({ playing: true, playheadBeat: fromBeat });
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
    const frame = () => {
      if (!this.isPlaying) return;
      useTransport.setState({ playheadBeat: this.currentBeat() });
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(resetTo?: number): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    cancelAnimationFrame(this.raf);
    try {
      getAudioEngine().stopAll();
    } catch {
      // engine not created yet
    }
    useTransport.setState({ playing: false, playheadBeat: resetTo ?? useTransport.getState().playheadBeat });
  }

  /** Turn the click on/off during playback (used by the hum overlay). */
  setMetronome(on: boolean, beatsPerBar: number): void {
    if (!on) {
      this.metronome = null;
      return;
    }
    if (!this.metronome) {
      this.metronome = { beatsPerBar };
      this.nextClickBeat = Math.ceil(this.currentBeat() + 0.1);
    }
  }

  /** AudioContext time for a song beat, given the current play session. */
  timeForBeat(beat: number): number {
    return this.startTime + beatsToSeconds(beat - this.startBeat, this.bpm);
  }

  private tick(): void {
    const engine = getAudioEngine();
    const instrument = engine.getInstrument();
    const ctx = engine.context;
    if (!instrument || !ctx) return;
    const horizon = ctx.currentTime + LOOKAHEAD_SEC;

    while (this.nextIndex < this.notes.length) {
      const n = this.notes[this.nextIndex];
      if (n.beat >= this.endBeat - 1e-6) break;
      const when = this.timeForBeat(n.beat) + n.offsetSec;
      if (when > horizon) break;
      if (n.gain > 0) {
        instrument.noteOn(n.midi, n.velocity, when, beatsToSeconds(n.durationBeats, this.bpm), n.gain);
      }
      this.nextIndex++;
    }

    if (this.metronome) {
      while (this.nextClickBeat < this.endBeat) {
        const when = this.timeForBeat(this.nextClickBeat);
        if (when > horizon) break;
        const accent = this.nextClickBeat % this.metronome.beatsPerBar === 0;
        scheduleClick(ctx, ctx.destination, when, accent);
        this.nextClickBeat++;
      }
    }

    if (this.currentBeat() >= this.endBeat) {
      const onEnd = this.onEnd;
      this.stop(this.startBeat);
      onEnd?.();
    }
  }
}

export const transport = new Transport();
