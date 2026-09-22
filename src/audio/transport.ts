import { create } from 'zustand';
import { isLoopOn } from '../model/song';
import { beatsToSeconds, isDownbeat, loopRange, songBeats } from '../model/time';
import type { Song } from '../model/types';
import { getAudioEngine } from './engine';
import { passBeat, songBeatAt, type LoopSpan } from './loop';
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
  /** Id of the song being played, so edits to it can be picked up live. */
  private songId: string | null = null;
  /** Rendered notes that can sound in this session, sorted by beat. */
  private notes: ScheduledNote[] = [];
  private nextIndex = 0;
  /** Which pass of the loop `nextIndex` is on (0 = the first pass). */
  private pass = 0;
  private wantLoop = false;
  private loop = false;
  private loopFrom = 0;
  private endBeat = 0;
  /**
   * True when the song decides how to play (`songLoop`): loop on = loop its
   * loop region, loop off = play once to the song's end. Re-read on every
   * edit, so toggling the loop or moving the region applies while playing.
   */
  private followSong = false;
  /** Where the current first pass began (moves when live edits re-anchor). */
  private startBeat = 0;
  /** Where playback was started from; Stop returns here at the end of a one-shot play. */
  private returnBeat = 0;
  /** Unwrapped musical beat corresponding to startTime; reset on live tempo changes. */
  private anchorBeat = 0;
  private startTime = 0;
  /** AudioContext time up to which notes and clicks have been scheduled. */
  private scheduledUntil = 0;
  private bpm = 100;
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

  private get span(): LoopSpan {
    return { loop: this.loop, loopFrom: this.loopFrom, endBeat: this.endBeat };
  }

  private absoluteBeatAt(audioTime: number): number {
    const elapsedBeats = Math.max(0, ((audioTime - this.startTime) * this.bpm) / 60);
    return this.anchorBeat + elapsedBeats;
  }

  currentBeat(): number {
    if (!this.isPlaying) return useTransport.getState().playheadBeat;
    return songBeatAt(this.absoluteBeatAt(getAudioEngine().now()), this.span);
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
   * Start playing `song` from `fromBeat`.
   * - `opts.songLoop`: the song decides (see `followSong`). With the loop on,
   *   a start outside the loop region starts at the region.
   * - `opts.loop`: loop `opts.loopFrom` (default `fromBeat`) to `endBeat`
   *   (default the song's end) — a fixed span, e.g. a project preview.
   * - otherwise: play once to `endBeat` (default the song's end).
   * Later passes are scheduled ahead of the boundary, so there is no gap.
   * - `opts.metronome`: click on every beat (a hum take).
   */
  async play(
    song: Song,
    fromBeat: number,
    opts: {
      metronome?: boolean;
      endBeat?: number;
      onEnd?: () => void;
      loop?: boolean;
      loopFrom?: number;
      songLoop?: boolean;
    } = {},
  ): Promise<void> {
    const engine = getAudioEngine();
    const ctx = await engine.unlock();
    if (!ctx) return;
    this.stop();

    this.songId = song.id;
    this.bpm = song.bpm;
    this.beatsPerBar = song.timeSignature.beatsPerBar;
    this.followSong = opts.songLoop === true;
    if (this.followSong) {
      this.applySongSpan(song);
      if (this.wantLoop && (fromBeat < this.loopFrom - 1e-6 || fromBeat >= this.endBeat - 1e-6)) fromBeat = this.loopFrom;
    } else {
      this.wantLoop = opts.loop === true;
      this.endBeat = opts.endBeat ?? songBeats(song);
      this.loopFrom = Math.min(opts.loopFrom ?? fromBeat, fromBeat);
      this.loop = this.wantLoop && this.endBeat - this.loopFrom > 1e-6;
    }
    this.startBeat = fromBeat;
    this.returnBeat = fromBeat;
    this.anchorBeat = fromBeat;
    this.startTime = ctx.currentTime + 0.05;
    this.scheduledUntil = this.startTime;
    this.onEnd = opts.onEnd ?? null;
    this.takeClick = opts.metronome === true;
    this.nextClickBeat = Math.ceil(fromBeat - 1e-6);

    this.loadNotes(song);
    this.pass = 0;
    this.nextIndex = this.firstIndex((n) => n.beat >= fromBeat - 1e-6);

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

  /**
   * The song changed while playing (an edit, Undo/Redo, a new slot): hear it
   * from the next unscheduled note on, without stopping. Notes already
   * scheduled in the look-ahead window keep playing; everything after comes
   * from the new song. Ignored for any other song (e.g. a project preview).
   */
  refresh(song: Song): void {
    if (!this.isPlaying || song.id !== this.songId) return;
    const ctx = getAudioEngine().context;
    if (!ctx) return;
    if (song.bpm !== this.bpm) this.setBpm(song.bpm);

    const now = ctx.currentTime;
    const until = Math.max(this.scheduledUntil, now);
    const oldSpan = this.span;
    let songNow = songBeatAt(this.absoluteBeatAt(now), oldSpan);
    let songUntil = songBeatAt(this.absoluteBeatAt(until), oldSpan);
    // The look-ahead already reached into the next pass.
    let wrapped = this.loop && songUntil < songNow - 1e-9;

    this.beatsPerBar = song.timeSignature.beatsPerBar;
    if (this.followSong) this.applySongSpan(song);
    this.loop = this.wantLoop && this.endBeat - this.loopFrom > 1e-6;
    if (wrapped && !this.loop) {
      // Looping was just switched off after the look-ahead crossed into the
      // next pass: carry on from the end of the old pass instead.
      songUntil = oldSpan.endBeat - 1e-6;
      wrapped = false;
    }
    if (songNow >= this.endBeat - 1e-6 || (wrapped && songUntil >= this.endBeat - 1e-6)) {
      // The song got shorter than where we are.
      if (!this.loop) {
        this.stop(this.returnBeat);
        return;
      }
      songNow = this.loopFrom;
      songUntil = this.loopFrom - 1e-6;
      wrapped = false;
    }

    // Re-anchor: "now" is `songNow` on a fresh first pass.
    this.startBeat = songNow;
    this.anchorBeat = songNow;
    this.startTime = now;
    this.loadNotes(song);
    this.pass = wrapped ? 1 : 0;
    const after = (n: ScheduledNote) => n.beat > songUntil + 1e-9 && n.beat >= (wrapped ? this.loopFrom : songNow) - 1e-6;
    this.nextIndex = this.firstIndex(after);
    const untilUnwrapped = wrapped ? passBeat(songUntil, 1, this.span) : Math.max(songUntil, songNow);
    this.nextClickBeat = Math.floor(untilUnwrapped + 1e-9) + 1;
    this.scheduledUntil = until;
  }

  /** `songLoop` mode: loop the loop region while the loop is on, else run to the song's end once. */
  private applySongSpan(song: Song): void {
    this.wantLoop = isLoopOn(song);
    if (this.wantLoop) {
      const range = loopRange(song);
      this.endBeat = range.end;
      this.loopFrom = range.start;
    } else {
      this.endBeat = songBeats(song);
      this.loopFrom = 0;
    }
    this.loop = this.wantLoop && this.endBeat - this.loopFrom > 1e-6;
  }

  private loadNotes(song: Song): void {
    const from = this.loop ? Math.min(this.loopFrom, this.startBeat) : this.startBeat;
    this.notes = renderSong(song).filter((n) => n.beat >= from - 1e-6 && n.beat < this.endBeat - 1e-6);
  }

  private firstIndex(test: (n: ScheduledNote) => boolean): number {
    const i = this.notes.findIndex(test);
    return i < 0 ? this.notes.length : i;
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
    this.wantLoop = false;
    this.notes = [];
    this.songId = null;
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

  /** AudioContext time for an unwrapped beat of the current play session. */
  timeForBeat(beat: number): number {
    return this.startTime + beatsToSeconds(beat - this.anchorBeat, this.bpm);
  }

  private tick(): void {
    const engine = getAudioEngine();
    const instrument = engine.getInstrument();
    const ctx = engine.context;
    if (!instrument || !ctx) return;
    const horizon = ctx.currentTime + LOOKAHEAD_SEC;
    const span = this.span;

    // Notes are timed on the unwrapped beat counter. When a pass runs out,
    // move straight on to the next one: the look-ahead crosses the loop
    // boundary, so the next pass is scheduled before this one ends — no gap.
    for (;;) {
      if (this.nextIndex >= this.notes.length) {
        if (!this.loop) break;
        const first = this.firstIndex((n) => n.beat >= this.loopFrom - 1e-6);
        if (first >= this.notes.length) break; // nothing in the loop to play
        this.pass++;
        this.nextIndex = first;
      }
      const n = this.notes[this.nextIndex];
      const when = this.timeForBeat(passBeat(n.beat, this.pass, span)) + n.offsetSec;
      if (when > horizon) break;
      if (n.gain > 0) {
        instrument.noteOn(n.midi, n.velocity, when, beatsToSeconds(n.durationBeats, this.bpm), n.gain);
      }
      this.nextIndex++;
    }

    if (this.clicking) {
      // Clicks count unwrapped beats too, so a loop keeps clicking on every
      // pass; the accent follows the bar position inside the song.
      while (this.loop || this.nextClickBeat < this.endBeat) {
        const when = this.timeForBeat(this.nextClickBeat);
        if (when > horizon) break;
        scheduleClick(ctx, ctx.destination, when, isDownbeat(songBeatAt(this.nextClickBeat, span), this.beatsPerBar));
        this.nextClickBeat++;
      }
    }
    this.scheduledUntil = Math.max(this.scheduledUntil, horizon);

    if (!this.loop && this.absoluteBeatAt(ctx.currentTime) >= this.endBeat) {
      const onEnd = this.onEnd;
      this.stop(this.returnBeat);
      onEnd?.();
    }
  }
}

export const transport = new Transport();
