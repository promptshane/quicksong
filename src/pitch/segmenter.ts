import { frequencyToMidi } from '../model/music';

/**
 * Turns a stream of pitch frames into discrete notes. Pure and stateful, no
 * audio APIs — so it can be unit tested with synthetic frames and improved
 * independently of capture.
 *
 * Rules (all tunable via options):
 *  - a frame is "voiced" when clarity and level are above thresholds;
 *  - a new note starts when voiced audio appears after silence, or when the
 *    pitch moves by at least `pitchChangeSemitones` and stays there;
 *  - a note ends after `releaseSec` of unvoiced frames;
 *  - a dip-and-return in level on the same pitch re-articulates the note;
 *  - notes shorter than `minNoteSec` are discarded.
 */
export interface SegmenterFrame {
  time: number;
  hz: number;
  clarity: number;
  rms: number;
}

export interface DetectedNote {
  /** Rounded MIDI number (octave included). */
  midi: number;
  startSec: number;
  endSec: number;
  /** Mean clarity over the note, 0..1. */
  confidence: number;
  /** Peak RMS during the note — used for velocity. */
  peakRms: number;
}

export interface SegmenterOptions {
  minClarity: number;
  minRms: number;
  pitchChangeSemitones: number;
  /** Frames a pitch change must persist before it counts as a new note. */
  pitchChangeFrames: number;
  releaseSec: number;
  minNoteSec: number;
  /** Level must fall below peak*dipRatio then recover to re-trigger. */
  dipRatio: number;
}

export const DEFAULT_SEGMENTER_OPTIONS: SegmenterOptions = {
  // Tuned for ordinary close-range iPhone humming. These remain above the
  // detector floor so background noise does not immediately become notes.
  minClarity: 0.78,
  minRms: 0.004,
  pitchChangeSemitones: 0.6,
  pitchChangeFrames: 2,
  releaseSec: 0.09,
  minNoteSec: 0.07,
  dipRatio: 0.35,
};

interface OpenNote {
  startSec: number;
  lastVoicedSec: number;
  midis: number[];
  clarities: number[];
  peakRms: number;
  dipped: boolean;
  /** Consecutive frames at a different pitch (candidate for a new note). */
  driftFrames: number;
  driftMidi: number;
  driftStart: SegmenterFrame | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export class NoteSegmenter {
  private opts: SegmenterOptions;
  private open: OpenNote | null = null;
  private notes: DetectedNote[] = [];
  private recent: number[] = [];

  constructor(opts: Partial<SegmenterOptions> = {}) {
    this.opts = { ...DEFAULT_SEGMENTER_OPTIONS, ...opts };
  }

  /** Note currently being sung, if any (for live feedback). */
  get current(): { midi: number; startSec: number } | null {
    if (!this.open || this.open.midis.length === 0) return null;
    return { midi: Math.round(median(this.open.midis)), startSec: this.open.startSec };
  }

  get completed(): DetectedNote[] {
    return this.notes;
  }

  push(frame: SegmenterFrame): void {
    const voiced = frame.hz > 0 && frame.clarity >= this.opts.minClarity && frame.rms >= this.opts.minRms;

    if (!voiced) {
      if (this.open && frame.time - this.open.lastVoicedSec >= this.opts.releaseSec) {
        this.close(this.open.lastVoicedSec);
      }
      return;
    }

    // Light median smoothing over the last three voiced frames.
    const raw = frequencyToMidi(frame.hz);
    this.recent.push(raw);
    if (this.recent.length > 3) this.recent.shift();
    const midi = median(this.recent);

    if (!this.open) {
      this.begin(frame, midi);
      return;
    }

    const note = this.open;
    const noteMidi = median(note.midis);

    // Re-articulation: same pitch, level dipped and came back.
    if (frame.rms < note.peakRms * this.opts.dipRatio) note.dipped = true;
    else if (note.dipped && frame.rms > note.peakRms * 0.7) {
      this.close(frame.time);
      this.begin(frame, midi);
      return;
    }

    if (Math.abs(midi - noteMidi) >= this.opts.pitchChangeSemitones) {
      if (note.driftFrames > 0 && Math.abs(midi - note.driftMidi) < this.opts.pitchChangeSemitones) {
        note.driftFrames++;
      } else {
        note.driftFrames = 1;
        note.driftMidi = midi;
        note.driftStart = frame;
      }
      if (note.driftFrames >= this.opts.pitchChangeFrames) {
        // The new note really started when the pitch first moved.
        const at = note.driftStart ?? frame;
        this.close(at.time);
        this.begin(at, midi);
        this.open!.midis.push(midi);
        this.open!.clarities.push(frame.clarity);
        this.open!.lastVoicedSec = frame.time;
      }
      return;
    }

    note.driftFrames = 0;
    note.driftStart = null;
    note.midis.push(midi);
    note.clarities.push(frame.clarity);
    note.peakRms = Math.max(note.peakRms, frame.rms);
    note.lastVoicedSec = frame.time;
  }

  /** Call when recording stops to flush the note in progress. */
  finish(atSec: number): DetectedNote[] {
    if (this.open) this.close(Math.max(this.open.lastVoicedSec, Math.min(atSec, this.open.lastVoicedSec + 0.05)));
    return this.notes;
  }

  private begin(frame: SegmenterFrame, midi: number): void {
    this.open = {
      startSec: frame.time,
      lastVoicedSec: frame.time,
      midis: [midi],
      clarities: [frame.clarity],
      peakRms: frame.rms,
      dipped: false,
      driftFrames: 0,
      driftMidi: midi,
      driftStart: null,
    };
  }

  private close(endSec: number): void {
    const note = this.open;
    this.open = null;
    this.recent = [];
    if (!note) return;
    const length = endSec - note.startSec;
    if (length < this.opts.minNoteSec) return;
    this.notes.push({
      midi: Math.round(median(note.midis)),
      startSec: note.startSec,
      endSec,
      confidence: note.clarities.reduce((s, c) => s + c, 0) / note.clarities.length,
      peakRms: note.peakRms,
    });
  }
}

/**
 * Snap detected notes to the eighth-note grid, relative to a recording that
 * started at `recordStartSec` on beat `startBeat`. Returns beat positions.
 */
export function quantizeNotes(
  notes: DetectedNote[],
  recordStartSec: number,
  startBeat: number,
  bpm: number,
  eighthBeats: number,
): { midi: number; start: number; duration: number; velocity: number }[] {
  const toBeats = (sec: number) => ((sec - recordStartSec) * bpm) / 60;
  const snap = (b: number) => Math.round(b / eighthBeats) * eighthBeats;
  const out: { midi: number; start: number; duration: number; velocity: number }[] = [];
  for (const n of notes) {
    const start = startBeat + snap(toBeats(n.startSec));
    let duration = snap(toBeats(n.endSec) - toBeats(n.startSec));
    if (duration < eighthBeats) duration = eighthBeats;
    // Map peak level to a musically useful velocity range.
    const velocity = Math.max(0.4, Math.min(1, 0.5 + n.peakRms * 3));
    const prev = out[out.length - 1];
    if (prev && prev.start === start) {
      // Two notes snapped to the same slot: keep the longer/later one.
      out[out.length - 1] = { midi: n.midi, start, duration, velocity };
      continue;
    }
    if (prev && prev.start + prev.duration > start) prev.duration = Math.max(eighthBeats, start - prev.start);
    out.push({ midi: n.midi, start, duration, velocity });
  }
  return out;
}
