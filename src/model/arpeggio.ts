import { eighthsPerBar } from './time';
import type { ArpPattern, ArpPreset, ChordStyle, ChordStyleOverride, TimeSignature } from './types';

/**
 * Arpeggios (piano) and picking (guitar): playing a chord's notes one at a
 * time. A pattern covers one bar on the eighth-note grid and repeats for as
 * long as the chord lasts. Presets adapt to the chord's size; a custom
 * pattern names chord notes by position, lowest = 0.
 */

export const DEFAULT_ARP: ArpPattern = { preset: 'up', rate: 'eighth' };

export const ARP_PRESETS: { preset: ArpPreset; label: string }[] = [
  { preset: 'up', label: 'Up' },
  { preset: 'down', label: 'Down' },
  { preset: 'updown', label: 'Up & down' },
  { preset: 'bass', label: 'Bass + chord' },
];

/** Labels for the playing styles, per instrument. */
export const STYLE_LABELS: Record<'guitar' | 'piano', Record<ChordStyle, string>> = {
  guitar: { together: 'Strum', arpeggio: 'Pick' },
  piano: { together: 'Together', arpeggio: 'Arpeggio' },
};

function presetSequence(preset: ArpPreset, toneCount: number): number[][] {
  const n = Math.max(1, toneCount);
  const up = Array.from({ length: n }, (_, i) => [i]);
  switch (preset) {
    case 'up':
      return up;
    case 'down':
      return [...up].reverse();
    case 'updown':
      // 0 1 2 3 2 1 — the ends are not repeated, so it flows round.
      return n <= 2 ? up : [...up, ...up.slice(1, -1).reverse()];
    case 'bass':
      // Bass alone, then the rest of the chord together.
      return n === 1 ? [[0]] : [[0], up.slice(1).map(([i]) => i)];
  }
}

/**
 * The notes to play on each eighth slot of a bar (one entry per slot; an
 * empty entry is a rest), for a chord with `toneCount` notes.
 */
export function arpSteps(pattern: ArpPattern, toneCount: number, ts: TimeSignature): number[][] {
  const slots = eighthsPerBar(ts);
  if (pattern.preset === 'custom') {
    return Array.from({ length: slots }, (_, i) => [...(pattern.steps?.[i] ?? [])]);
  }
  const every = pattern.rate === 'quarter' ? 2 : 1; // a quarter note is two eighth slots
  const sequence = presetSequence(pattern.preset, toneCount);
  return Array.from({ length: slots }, (_, i) => (i % every === 0 ? [...sequence[(i / every) % sequence.length]] : []));
}

/** Turn any pattern into an editable custom grid for a chord of `toneCount` notes. */
export function customize(pattern: ArpPattern, toneCount: number, ts: TimeSignature): ArpPattern {
  return { preset: 'custom', rate: pattern.rate, steps: arpSteps(pattern, toneCount, ts) };
}

/** Switch one cell of a custom grid on or off. */
export function toggleArpStep(pattern: ArpPattern, slot: number, tone: number, ts: TimeSignature): ArpPattern {
  const steps = arpSteps(pattern, 0, ts);
  const cell = steps[slot] ?? [];
  steps[slot] = cell.includes(tone) ? cell.filter((t) => t !== tone) : [...cell, tone].sort((a, b) => a - b);
  return { preset: 'custom', rate: pattern.rate, steps };
}

/** Keep a custom grid's slots in step with a new time signature. */
export function resizeArp(pattern: ArpPattern, ts: TimeSignature): ArpPattern {
  if (pattern.preset !== 'custom') return pattern;
  const slots = eighthsPerBar(ts);
  return { ...pattern, steps: Array.from({ length: slots }, (_, i) => [...(pattern.steps?.[i] ?? [])]) };
}

/** The style a chord actually plays with: its own, or its layer's. */
export function effectiveStyle(
  layer: { style: ChordStyle; arp: ArpPattern },
  chord: { styleOverride?: ChordStyleOverride },
): ChordStyleOverride {
  return chord.styleOverride ?? { style: layer.style, arp: layer.arp };
}
