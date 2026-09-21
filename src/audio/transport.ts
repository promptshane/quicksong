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
  private playbackNotes: ScheduledNote[] = [];
  private nextIndex = 0;
  private loopCycle = 0;
  private loop = false;
  private loopLength = 0;
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
    const elapsedBeats = Math.max(0, ((getAudioEngine().now() - this.startTime) * this.bpm) / 60);
    if (this.loop && this.loopLength > 0) {
      const wrapped = ((elapsedBeats % this.loopLength) + this.loopLength) % this.loopLength;
      return this.startBeat + wrapped;
    }
    return this.startBeat + elapsedBeats;
  }

  /**
   * Start playing `song` from `fromBeat`. `opts.metronome` adds a click on
   * every beat (used while recording a hum). `opts.endBeat` overrides where
   * playback stops (default: end of song). `opts.loop` keeps the scheduler
   * running continuously and schedules the next pass ahead of the boundary.
   */
  async play(
    song: Song,
    fromBeat: number,
    opts: { metronome?: boolean; endBeat?: number; onEnd?: () => void; loop?: boolean } = {},
  ): Promise<void> {
    const engine = getAudioEngine();
    const ctx = await engine.unlock();
    if (!ctx) return;
    this.stop();

    this.notes = renderSong(song);
    this.bpm = song.bpm;
    this.startBeat = fromBeat;
    this.endBeat = opts.endBeat ?? songBeats(song);
    this.loop = opts.loop === true && this.endBeat > this.startBeat;
    this.loopLength = this.endBeat - this.startBeat;
    this.onEnd = opts.onEnd ?? null;
    this.metronome = opts.metronome ? { beatsPerBar: song.timeSignature.beatsPerBar } : null;
    this.nextClickBeat = Math.ceil(fromBeat - 1e-6);

    this.playbackNotes = this.notes.filter((n) => n.beat >= this.startBeat - 1e-6 && n.beat < this.endBeat - 1e-6);
    this.nextIndex = 0;
    this.loopCycle = 0;
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
    this.loop = false;
    this.loopLength = 0;
    this.playbackNotes = [];
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

    if (this.loop) {
      // Schedule notes using an ever-increasing absolute beat. When one pass
      // is exhausted, immediately advance to the next cycle. Because the
      // look-ahead horizon crosses the loop boundary, beat 0 of the next pass
      // is already scheduled before the current pass ends — no stop/restart gap.
      while (this.playbackNotes.length > 0) {
        const n = this.playbackNotes[this.nextIndex];
        const absoluteBeat = n.beat + this.loopCycle * this.loopLength;
        const when = this.timeForBeat(absoluteBeat) + n.offsetSec;
        if (when > horizon) break;
        if (n.gain > 0) {
          instrument.noteOn(n.midi, n.velocity, when, beatsToSeconds(n.durationBeats, this.bpm), n.gain);
        }
        this.nextIndex++;
        if (this.nextIndex >= this.playbackNotes.length) {
          this.nextIndex = 0;
          this.loopCycle++;
        }
      }
    } else {
      while (this.nextIndex < this.playbackNotes.length) {
        const n = this.playbackNotes[this.nextIndex];
        const when = this.timeForBeat(n.beat) + n.offsetSec;
        if (when > horizon) break;
        if (n.gain > 0) {
          instrument.noteOn(n.midi, n.velocity, when, beatsToSeconds(n.durationBeats, this.bpm), n.gain);
        }
        this.nextIndex++;
      }
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

    if (!this.loop && this.currentBeat() >= this.endBeat) {
      const onEnd = this.onEnd;
      this.stop(this.startBeat);
      onEnd?.();
    }
  }
}

export const transport = new Transport();
