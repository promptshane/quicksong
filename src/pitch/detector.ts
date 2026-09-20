import { PitchDetector as Mpm } from 'pitchy';

/**
 * Pitch detection is isolated behind this interface so the algorithm can be
 * swapped (e.g. for a CREPE-style model, or an AudioWorklet implementation)
 * without touching the mic capture or note segmentation code.
 */
export interface PitchFrame {
  /** Detected fundamental in Hz, or 0 if none. */
  hz: number;
  /** 0..1 — how periodic/clear the signal was. */
  clarity: number;
  /** RMS level of the frame, 0..1. */
  rms: number;
}

export interface PitchDetector {
  readonly frameSize: number;
  analyse(frame: Float32Array, sampleRate: number): PitchFrame;
}

function rmsOf(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

/** McLeod Pitch Method via the `pitchy` package. Good for monophonic voice. */
export function createMpmDetector(frameSize = 2048): PitchDetector {
  const mpm = Mpm.forFloat32Array(frameSize);
  mpm.minVolumeDecibels = -40;
  mpm.clarityThreshold = 0.85;
  return {
    frameSize,
    analyse(frame, sampleRate) {
      const [hz, clarity] = mpm.findPitch(frame, sampleRate);
      // Ignore anything outside a plausible human humming range.
      const inRange = hz >= 60 && hz <= 1200;
      return { hz: inRange ? hz : 0, clarity: inRange ? clarity : 0, rms: rmsOf(frame) };
    },
  };
}
