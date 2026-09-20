import type { PitchDetector, PitchFrame } from './detector';

export interface MicFrame extends PitchFrame {
  /** AudioContext time (seconds) at which this frame was analysed. */
  time: number;
}

/**
 * Captures the microphone and streams analysed frames to a callback.
 * Uses an AnalyserNode polled on a timer — simple, works on iOS Safari, and
 * good enough for ~30 frames/sec. Can be replaced by an AudioWorklet later.
 */
export class MicCapture {
  private ctx: AudioContext;
  private detector: PitchDetector;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private buffer: Float32Array<ArrayBuffer>;

  constructor(ctx: AudioContext, detector: PitchDetector) {
    this.ctx = ctx;
    this.detector = detector;
    this.buffer = new Float32Array(detector.frameSize);
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Request permission and start streaming frames. Throws if denied. */
  async start(onFrame: (frame: MicFrame) => void, intervalMs = 30): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Voice processing smears pitch and onsets; we want the raw signal.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this.detector.frameSize;
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser);
    // Not connected to the destination: we never want to hear the mic.

    this.timer = setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getFloatTimeDomainData(this.buffer);
      const result = this.detector.analyse(this.buffer, this.ctx.sampleRate);
      onFrame({ ...result, time: this.ctx.currentTime });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
    this.analyser = null;
  }
}
