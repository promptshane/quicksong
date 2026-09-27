import { newId } from './ids';
import { LAYER_LABELS, nextLayerName, updateAnyLayer } from './song';
import { eighthBeats, songBeats } from './time';
import type { DrumHit, DrumLayer, DrumLoopSettings, DrumPiece, Song, TimeSignature } from './types';
import { DEFAULT_VELOCITY } from './types';

/**
 * Drums: kick, snare and hi-hat, each hit placed on the eighth-note grid.
 * A layer may repeat a phrase, substitute an alternate phrase, or leave a
 * short gap in its repeats. A hit is one grid step long.
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

interface DrumCellPosition {
  repeated: boolean;
  cycle: number;
  localStart: number;
  variation: boolean;
  broken: boolean;
}

function drumCellPosition(layer: DrumLayer, start: number, ts: TimeSignature): DrumCellPosition | null {
  const loop = layer.loop;
  if (!loop) return null;
  const patternBeats = loop.patternBars * ts.beatsPerBar;
  const cycle = Math.floor(start / patternBeats + 1e-6);
  const repeatCount = loop.repeatCount;
  const repeated = repeatCount === null || cycle < repeatCount;
  if (!repeated) return { repeated: false, cycle, localStart: start, variation: false, broken: false };
  const loopNumber = cycle + 1;
  const variation = !!loop.variationEvery && loopNumber % loop.variationEvery === 0;
  const broken = !!loop.break && loopNumber >= loop.break.startLoop && loopNumber < loop.break.startLoop + loop.break.length;
  return { repeated: true, cycle, localStart: start - cycle * patternBeats, variation, broken };
}

/** The source hit a timeline cell edits, even when the displayed loop is a break. */
export function drumHitForEdit(layer: DrumLayer, piece: DrumPiece, start: number, ts: TimeSignature): DrumHit | undefined {
  const position = drumCellPosition(layer, start, ts);
  if (!position?.repeated) return drumHitAt(layer, piece, start);
  const pattern = position.variation ? (layer.loop?.variationEvents ?? layer.events) : layer.events;
  const source = pattern.find((e) => e.piece === piece && Math.abs(e.start - position.localStart) < 1e-6);
  if (source) return source;
  const patternBeats = (layer.loop?.patternBars ?? 1) * ts.beatsPerBar;
  return layer.events.find((e) => e.piece === piece && e.start >= patternBeats - 1e-6 && Math.abs(e.start - start) < 1e-6);
}

/** The hit shown at an absolute timeline position, including generated loop copies. */
export function drumHitAtTimeline(
  layer: DrumLayer,
  piece: DrumPiece,
  start: number,
  totalBeats: number,
  ts: TimeSignature,
): DrumHit | undefined {
  const position = drumCellPosition(layer, start, ts);
  if (!position?.repeated) return drumHitAt(layer, piece, start);
  if (start >= totalBeats - 1e-6) return undefined;
  if (position.broken) {
    const patternBeats = (layer.loop?.patternBars ?? 1) * ts.beatsPerBar;
    return layer.events.find((e) => e.piece === piece && e.start >= patternBeats - 1e-6 && Math.abs(e.start - start) < 1e-6);
  }
  const source = drumHitForEdit(layer, piece, start, ts);
  return source ? { ...source, start } : undefined;
}

/** Whether a timeline cell is one of the generated pattern's variation/break cells. */
export function drumCellStyle(layer: DrumLayer, start: number, ts: TimeSignature): Pick<DrumCellPosition, 'variation' | 'broken' | 'cycle'> {
  const position = drumCellPosition(layer, start, ts);
  return position ?? { variation: false, broken: false, cycle: 0 };
}

/** Turn looping on/off or update its phrase, duration, variation, or break. */
export function configureDrumLoop(song: Song, layerId: string, settings: DrumLoopSettings | null): Song {
  const layer = song.drums.layers.find((l) => l.id === layerId);
  if (!layer) return song;
  if (!settings) {
    return updateAnyLayer(song, layerId, (current) => {
      if (current.type !== 'drums' || !current.loop) return current;
      const updated = { ...current };
      const loop = current.loop;
      const patternBeats = loop.patternBars * song.timeSignature.beatsPerBar;
      updated.events = drumHitsForTimeline(current, songBeats(song), song.timeSignature)
        .filter((hit) => {
          const cycle = Math.floor(hit.start / patternBeats + 1e-6);
          const loopNumber = cycle + 1;
          const inRun = loop.repeatCount === null || cycle < loop.repeatCount;
          const inBreak = inRun && loop.break && loopNumber >= loop.break.startLoop && loopNumber < loop.break.startLoop + loop.break.length;
          return !inBreak;
        })
        .map((hit) => ({ ...hit, id: newId('d') }));
      delete updated.loop;
      return updated;
    });
  }

  const next: DrumLoopSettings = {
    ...settings,
    patternBars: Math.max(1, Math.floor(settings.patternBars)),
    repeatCount: settings.repeatCount === null ? null : Math.max(1, Math.floor(settings.repeatCount)),
  };
  if (next.variationEvery) {
    next.variationEvery = Math.max(2, Math.floor(next.variationEvery));
    const previousLoop = layer.loop;
    if (!previousLoop?.variationEvery || !previousLoop.variationEvents) {
      const patternBeats = next.patternBars * song.timeSignature.beatsPerBar;
      next.variationEvents = layer.events
        .filter((event) => event.start < patternBeats - 1e-6)
        .map((event) => ({ ...event, id: newId('d') }));
    } else if (next.patternBars > previousLoop.patternBars) {
      const oldPatternBeats = previousLoop.patternBars * song.timeSignature.beatsPerBar;
      const newPatternBeats = next.patternBars * song.timeSignature.beatsPerBar;
      const variant = [...previousLoop.variationEvents];
      for (const event of layer.events) {
        if (event.start < oldPatternBeats - 1e-6 || event.start >= newPatternBeats - 1e-6) continue;
        if (variant.some((existing) => existing.piece === event.piece && Math.abs(existing.start - event.start) < 1e-6)) continue;
        variant.push({ ...event, id: newId('d') });
      }
      next.variationEvents = variant.sort((a, b) => a.start - b.start);
    }
  } else {
    delete next.variationEvery;
    delete next.variationEvents;
  }

  // If the user has already copied the phrase across the timeline, fold hits
  // that land in the same pattern cells into the generated repeats.
  let events = layer.events;
  if (!layer.loop) {
    const patternBeats = next.patternBars * song.timeSignature.beatsPerBar;
    const sourceHits = layer.events.filter((event) => event.start < patternBeats - 1e-6);
    events = layer.events.filter((event) => {
      if (event.start < patternBeats - 1e-6) return true;
      const localStart = event.start % patternBeats;
      return !sourceHits.some((source) => source.piece === event.piece && Math.abs(source.start - localStart) < 1e-6);
    });
  }

  const breakEnd = next.break ? next.break.startLoop - 1 + next.break.length : 0;
  if (next.repeatCount !== null) {
    next.repeatCount = Math.max(1, Math.floor(next.repeatCount), next.variationEvery ?? 0, breakEnd);
  }
  const updated = updateAnyLayer(song, layerId, (current) => (current.type === 'drums' ? { ...current, events, loop: next } : current));
  const minimumCycles = next.repeatCount ?? Math.max(next.variationEvery ?? 0, breakEnd);
  const loopBars = next.patternBars * minimumCycles;
  return { ...updated, timelineBars: Math.max(song.timelineBars, loopBars) };
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

/** Toggle a timeline cell, editing its source phrase or its configured variation. */
export function toggleDrumLoopCell(song: Song, layerId: string, piece: DrumPiece, start: number): Song {
  const layer = song.drums.layers.find((l) => l.id === layerId);
  if (!layer?.loop) return toggleDrumHit(song, layerId, piece, start);
  const position = drumCellPosition(layer, start, song.timeSignature);
  if (!position?.repeated) return toggleDrumHit(song, layerId, piece, start);
  return updateAnyLayer(song, layerId, (current) => {
    if (current.type !== 'drums' || !current.loop) return current;
    const variation = position.variation && !!current.loop.variationEvery;
    const hits = variation ? current.loop.variationEvents ?? [] : current.events;
    const existing = hits.find((e) => e.piece === piece && Math.abs(e.start - position.localStart) < 1e-6);
    if (!existing) {
      const patternBeats = current.loop.patternBars * song.timeSignature.beatsPerBar;
      const oneOff = current.events.find((e) => e.piece === piece && e.start >= patternBeats - 1e-6 && Math.abs(e.start - start) < 1e-6);
      if (oneOff) return { ...current, events: current.events.filter((e) => e.id !== oneOff.id) };
    }
    const nextHits = existing
      ? hits.filter((e) => e.id !== existing.id)
      : [...hits, createDrumHit(piece, position.localStart, eighthBeats(song.timeSignature))].sort((a, b) => a.start - b.start);
    if (!variation) return { ...current, events: nextHits };
    return { ...current, loop: { ...current.loop, variationEvents: nextHits } };
  });
}

/** All audible drum hits across the song, including generated phrase repeats. */
export function drumHitsForTimeline(layer: DrumLayer, totalBeats: number, ts: TimeSignature): DrumHit[] {
  const step = eighthBeats(ts);
  const hits: DrumHit[] = [];
  for (let slot = 0; slot < Math.ceil(totalBeats / step); slot++) {
    const start = slot * step;
    if (drumCellPosition(layer, start, ts)?.broken) continue;
    for (const { piece } of DRUM_PIECES) {
      const hit = drumHitAtTimeline(layer, piece, start, totalBeats, ts);
      if (hit) hits.push(hit);
    }
  }
  return hits;
}
