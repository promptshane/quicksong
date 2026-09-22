import { create } from 'zustand';
import { isDownbeat } from '../model/time';
import { getAudioEngine } from './engine';
import { scheduleClick } from './synth';
import { transport, useTransport } from './transport';

/**
 * The editing metronome: a click at the song's tempo that keeps going while
 * the user works, toggled from the Tempo sheet.
 *
 * Two clocks, never both at once:
 * - stopped transport: a free-running click (this file), re-reading BPM and
 *   time signature every tick so tempo changes are heard immediately;
 * - playing transport: the transport clicks on the song's own beats, so the
 *   click always lines up with the music (see `transport.setEditClick`).
 */

export interface Tempo {
  bpm: number;
  beatsPerBar: number;
}

interface MetronomeState {
  /** The user's toggle. Session-only; never saved with a song. */
  on: boolean;
}

export const useMetronome = create<MetronomeState>(() => ({ on: false }));

const LOOKAHEAD_SEC = 0.12;
const TICK_MS = 25;

/** Look-ahead click scheduler that runs without the transport. */
class ClickTrack {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private beat = 0;
  private getTempo: () => Tempo = () => ({ bpm: 100, beatsPerBar: 4 });

  setTempoSource(getTempo: () => Tempo): void {
    this.getTempo = getTempo;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  async start(): Promise<void> {
    if (this.timer) return;
    const ctx = await getAudioEngine().unlock();
    if (!ctx || this.timer) return;
    this.nextTime = ctx.currentTime + 0.06;
    this.beat = 0;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const ctx = getAudioEngine().context;
    if (!ctx) return;
    // After the page was backgrounded, restart from now instead of bursting.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.02;
    const horizon = ctx.currentTime + LOOKAHEAD_SEC;
    while (this.nextTime < horizon) {
      const { bpm, beatsPerBar } = this.getTempo();
      scheduleClick(ctx, ctx.destination, this.nextTime, isDownbeat(this.beat, beatsPerBar));
      this.beat = (this.beat + 1) % beatsPerBar;
      this.nextTime += 60 / Math.max(1, bpm);
    }
  }
}

const clickTrack = new ClickTrack();

let active = false;

/** Start/stop whichever clock should be sounding. */
function sync(): void {
  const wanted = active && useMetronome.getState().on;
  transport.setEditClick(wanted);
  if (wanted && !useTransport.getState().playing) void clickTrack.start();
  else clickTrack.stop();
}

/**
 * Wire the metronome to the app. `getTempo` reads the open song;
 * `isActive` says whether a project is open (the Projects screen is silent).
 */
export function installMetronome(getTempo: () => Tempo, subscribeActive: (listener: (active: boolean) => void) => void): void {
  clickTrack.setTempoSource(getTempo);
  subscribeActive((isActive) => {
    active = isActive;
    sync();
  });
  useMetronome.subscribe(sync);
  useTransport.subscribe((s, prev) => {
    if (s.playing !== prev.playing) sync();
  });
}

/** Flip the metronome. Call from a tap so audio can unlock. */
export function setMetronomeOn(on: boolean): void {
  if (on) void getAudioEngine().unlock();
  useMetronome.setState({ on });
}
