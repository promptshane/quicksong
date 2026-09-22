import { newId } from './ids';
import { LAYER_LABELS, nextLayerName, updateAnyLayer } from './song';
import { eighthBeats } from './time';
import type { DrumHit, DrumLayer, DrumPiece, Song } from './types';
import { DEFAULT_VELOCITY } from './types';

/**
 * Drums: kick, snare and hi-hat, each hit placed individually on the
 * eighth-note grid. A hit is short; its duration is one grid step, which is
 * what the timeline draws.
 */

/** Top to bottom, as the drum grid shows them. */
export const DRUM_PIECES: { piece: DrumPiece; label: string }[] = [
  { piece: 'hat', label: 'Hi-hat' },
  { piece: 'snare', label: 'Snare' },
  { piece: 'kick', label: 'Kick' },
];

/** General-MIDI drum numbers, so drum hits travel through the scheduler like notes. */
export const DRUM_MIDI: Record<DrumPiece, number> = { kick: 36, snare: 38, hat: 42 };

export function drumPieceForMidi(midi: number): DrumPiece | null {
  return (Object.keys(DRUM_MIDI) as DrumPiece[]).find((p) => DRUM_MIDI[p] === midi) ?? null;
}

export function drumLabel(piece: DrumPiece): string {
  return DRUM_PIECES.find((p) => p.piece === piece)!.label;
}

export function createDrumLayer(song: Song): DrumLayer {
  return { id: newId('layer'), type: 'drums', name: nextLayerName(song, LAYER_LABELS.drums.drums), volume: 0.9, muted: false, events: [] };
}

export function createDrumHit(piece: DrumPiece, start: number, duration: number, velocity = DEFAULT_VELOCITY): DrumHit {
  return { kind: 'drum', id: newId('d'), piece, start, duration, velocity };
}

/** The hit of `piece` at grid position `start`, if there is one. */
export function drumHitAt(layer: DrumLayer, piece: DrumPiece, start: number): DrumHit | undefined {
  return layer.events.find((e) => e.piece === piece && Math.abs(e.start - start) < 1e-6);
}

/** Tap on the drum grid: add a hit there, or take the one that is there away. */
export function toggleDrumHit(song: Song, layerId: string, piece: DrumPiece, start: number): Song {
  const step = eighthBeats(song.timeSignature);
  return updateAnyLayer(song, layerId, (layer) => {
    if (layer.type !== 'drums') return layer;
    const existing = drumHitAt(layer, piece, start);
    const events = existing
      ? layer.events.filter((e) => e.id !== existing.id)
      : [...layer.events, createDrumHit(piece, start, step)].sort((a, b) => a.start - b.start);
    return { ...layer, events } as typeof layer;
  });
}
