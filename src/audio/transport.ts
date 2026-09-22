import { create } from 'zustand';
import { beatsToSeconds, isDownbeat, songBeats } from '../model/time';
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
  /** Unwrapped musical beat corresponding to startTime; reset on live tempo changes. */
  private anchorBeat = 0;
  private startTime = 0;
  private bpm = 100;
  private endBeat = 0;
  private onEnd: (() => void) | null = null;
  private beatsPerBar = 4;
  /** Click requested by this play session (a hum take). */
  private takeClick = false;
  /** Click requested by the editing metronome; survives across plays. */
  private editClick = false;
  /** Next click, in the same unwrapped beats as `anchorBeat`. */
  private nextClickBeat = 0;

  get isPlaying(): boolean {
    return this.timer !== null;
  }

  private absoluteBeatAt(audioTime: number): number {
    const elapsedBeats = Math.max(0, ((audioTime - this.startTime) * this.bpm) / 60);
    return this.anchorBeat + elapsedBeats;
  }

  currentBeat(): number {
    if (!this.isPlaying) return useTransport.getState().playheadBeat;
    const absoluteBeat = this.absoluteBeatAt(getAudioEngine().now());
    if (this.loop && this.loopLength > 0) {
      const wrapped = ((absoluteBeat - this.startBeat) % this.loopLength + this.loopLength) % this.loopLength;
      return this.startBeat + wrapped;
    }
    return absoluteBeat;
  }

  /**
   * Change tempo without restarting playback. Preserve the exact musical
   * position by making "now" a new time/beat anchor, then schedule subsequent
   * notes against the new BPM.
   */
  setBpm(nextBpm: number): void {
    if (!Number.isFinite(nextBpm) || nextBpm <= 0 || nextBpm === this.bpm) return;

    if (!this.isPlaying) {
      this.bpm = nextBpm;
      return;
    }

    const now = getAudioEngine().now();
    const beatNow = this.absoluteBeatAt(now);
    this.anchorBeat = beatNow;
    this.startTime = now;
    this.bpm = nextBpm;

    // Fill the look-ahead immediately at the new tempo rather than waiting
    // for the next 25 ms scheduler tick.
    this.tick();
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
    this.anchorBeat = fromBeat;
    this.endBeat = opts.endBeat ?? songBeats(song);
    this.loop = opts.loop === true && this.endBeat > this.startBeat;
    this.loopLength = this.endBeat - this.startBeat;
    this.onEnd = opts.onEnd ?? null;
    this.beatsPerBar = song.timeSignature.beatsPerBar;
    this.takeClick = opts.metronome === true;
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

  private get clicking(): boolean {
    return this.takeClick || this.editClick;
  }

  /** Before switching the click on mid-play, start it from the next beat. */
  private armClick(): void {
    if (!this.isPlaying || this.clicking) return;
    this.nextClickBeat = Math.ceil(this.absoluteBeatAt(getAudioEngine().now()) + 0.05);
  }

  /** Turn the take's click on/off during playback (used by the hum overlay). */
  setMetronome(on: boolean, beatsPerBar: number): void {
    if (on) this.armClick();
    this.beatsPerBar = beatsPerBar;
    this.takeClick = on;
  }

  /** The editing metronome: click on the song's beats whenever playing. */
  setEditClick(on: boolean): void {
    if (on) this.armClick();
    this.editClick = on;
  }

  /** AudioContext time for a song beat, given the current play session. */
  timeForBeat(beat: number): number {
    return this.startTime + beatsToSeconds(beat - this.anchorBeat, this.bpm);
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

    if (this.clicking) {
      // Clicks count unwrapped beats, so a looping song keeps clicking on
      // every pass; the accent follows the bar position inside the song.
      while (this.loop || this.nextClickBeat < this.endBeat) {
        const when = this.timeForBeat(this.nextClickBeat);
        if (when > horizon) break;
        const songBeat = this.loop
          ? this.startBeat + ((((this.nextClickBeat - this.startBeat) % this.loopLength) + this.loopLength) % this.loopLength)
          : this.nextClickBeat;
        scheduleClick(ctx, ctx.destination, when, isDownbeat(songBeat, this.beatsPerBar));
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
