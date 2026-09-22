/**
 * AudioContext lifecycle, including the iOS "unlock after a user gesture"
 * dance. Everything that makes sound goes through `getAudioEngine()`.
 */

export interface Instrument {
  /**
   * Schedule a note. `when` is an AudioContext time in seconds; `duration`
   * is in seconds. Implementations must be polyphonic.
   */
  noteOn(midi: number, velocity: number, when: number, duration: number, gain?: number): void;
  /** Stop everything currently sounding or scheduled. */
  allNotesOff(): void;
}

type InstrumentFactory = (ctx: AudioContext, destination: AudioNode) => Instrument;
type AudioSessionType = 'playback' | 'play-and-record';

/**
 * Safari/iOS exposes AudioSession even though it is not in every TS DOM lib.
 * Setting playback explicitly keeps Web Audio audible when the hardware
 * silent switch is on; mic capture temporarily switches to play-and-record.
 */
export function setAudioSessionType(type: AudioSessionType): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (!nav.audioSession) return;
  try {
    nav.audioSession.type = type;
  } catch {
    // Unsupported/partially implemented browsers can safely ignore this.
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private instrument: Instrument | null = null;
  private factory: InstrumentFactory;

  constructor(factory: InstrumentFactory) {
    this.factory = factory;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Create the context if needed and try to resume it. Call from a user gesture. */
  async unlock(): Promise<AudioContext | null> {
    if (typeof window === 'undefined') return null;

    // Important on iPhone: the default "ambient" session may obey the silent
    // switch and make Web Audio appear broken even though scheduling works.
    setAudioSessionType('playback');

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!this.ctx) {
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.instrument = this.factory(this.ctx, this.master);
    }
    if (this.ctx.state !== 'running') {
      // Start a silent source immediately while we are still inside the user
      // gesture. Older iOS builds use this to unlock the output route.
      const buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.ctx.destination);
      src.start(0);

      try {
        await this.ctx.resume();
      } catch {
        // Will retry on the next gesture.
      }
    }
    return this.ctx;
  }

  get isRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  getInstrument(): Instrument | null {
    return this.instrument;
  }

  /** Audition a note right now (keyboard taps, chord previews). */
  async play(midi: number, velocity: number, durationSec: number, offsetSec = 0): Promise<void> {
    const ctx = await this.unlock();
    if (!ctx || !this.instrument) return;
    this.instrument.noteOn(midi, velocity, ctx.currentTime + 0.01 + offsetSec, durationSec);
  }

  stopAll(): void {
    this.instrument?.allNotesOff();
  }

  /** Silence everything and pause the audio clock (app sent to the background). */
  suspend(): void {
    this.stopAll();
    if (this.ctx?.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }
}

let engine: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!engine) {
    throw new Error('Audio engine not initialised — call initAudioEngine first');
  }
  return engine;
}

export function initAudioEngine(factory: InstrumentFactory): AudioEngine {
  engine = new AudioEngine(factory);
  return engine;
}

/**
 * Install document-level listeners so the first tap anywhere unlocks audio,
 * the context is resumed when the app returns to the foreground, and nothing
 * keeps sounding once the app is backgrounded (e.g. swiped to the Home Screen).
 * `onHidden` lets the caller stop its own clocks (the transport) first.
 */
export function installAudioUnlockListeners(engineToUnlock: AudioEngine, onHidden: () => void = () => {}): void {
  const unlock = () => {
    void engineToUnlock.unlock();
  };
  for (const evt of ['touchend', 'pointerdown', 'keydown'] as const) {
    document.addEventListener(evt, unlock, { passive: true });
  }
  const hide = () => {
    onHidden();
    engineToUnlock.suspend();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') unlock();
    else hide();
  });
  window.addEventListener('pagehide', hide);
}
