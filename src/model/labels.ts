import { chordName, keyLabel, midiToName } from './music';
import { drumLabel } from './drums';
import { guitarChordShape } from './guitarChords';
import { chordShapeName } from './piano';
import { allLayers } from './song';
import { loopRange, rangeLabel, timeSignatureLabel } from './time';
import type { AnyEvent, AnyLayer, Song } from './types';

/** Short name for an event as the user sees it: "C3", "Am", "Dmaj7". */
export function eventLabel(ev: AnyEvent): string {
  if (ev.kind === 'note') return midiToName(ev.midi);
  if (ev.kind === 'piano') return chordShapeName(ev);
  if (ev.kind === 'drum') return drumLabel(ev.piece);
  const shape = guitarChordShape(ev);
  return shape ? chordShapeName(shape) : chordName(ev.root, ev.quality);
}

function layerEvents(layer: AnyLayer): AnyEvent[] {
  return layer.events as AnyEvent[];
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * One-line description of what changed between two versions of a song, from
 * `before` to `after` — e.g. "Tempo 100 → 104", "Add Am · Piano 1". Undo and
 * Redo show it so a change made on another screen is never invisible.
 */
export function describeChange(before: Song, after: Song): string {
  if (before.bpm !== after.bpm) return `Tempo ${before.bpm} → ${after.bpm}`;
  if (!sameJson(before.timeSignature, after.timeSignature)) {
    return `Time signature ${timeSignatureLabel(before.timeSignature)} → ${timeSignatureLabel(after.timeSignature)}`;
  }
  if (!sameJson(before.key, after.key)) return `Key → ${keyLabel(after.key, null)}`;
  if (before.loopOff !== after.loopOff) return after.loopOff ? 'Loop off' : 'Loop on';
  if (!sameJson(before.loopRegion, after.loopRegion)) {
    const loop = loopRange(after);
    if (loop.whole) return 'Loop · whole song';
    return `Loop ${rangeLabel(loop.start, loop.end, after.timeSignature)}`;
  }

  const beforeLayers = allLayers(before);
  const afterLayers = allLayers(after);
  const added = afterLayers.find((l) => !beforeLayers.some((b) => b.id === l.id));
  if (added) return `Add layer ${added.name}`;
  const removed = beforeLayers.find((l) => !afterLayers.some((a) => a.id === l.id));
  if (removed) return `Delete layer ${removed.name}`;

  for (const layer of afterLayers) {
    const old = beforeLayers.find((b) => b.id === layer.id)!;
    if (old.muted !== layer.muted) return `${layer.muted ? 'Mute' : 'Unmute'} ${layer.name}`;
    if (old.type !== layer.type) return `Layer type · ${layer.name}`;
    const oldEvents = layerEvents(old);
    const events = layerEvents(layer);
    const newEvent = events.find((e) => !oldEvents.some((o) => o.id === e.id));
    const goneEvent = oldEvents.find((o) => !events.some((e) => e.id === o.id));
    if (newEvent && goneEvent) return `Edit ${layer.name}`;
    if (newEvent) return `Add ${eventLabel(newEvent)} · ${layer.name}`;
    if (goneEvent) return `Delete ${eventLabel(goneEvent)} · ${layer.name}`;
    for (const e of events) {
      const o = oldEvents.find((x) => x.id === e.id)!;
      if (sameJson(o, e)) continue;
      if (o.start !== e.start) return `Move ${eventLabel(e)} · ${layer.name}`;
      if (o.velocity !== e.velocity) return `Velocity ${eventLabel(e)} · ${layer.name}`;
      if (o.duration !== e.duration) return `Length ${eventLabel(e)} · ${layer.name}`;
      return `Edit ${eventLabel(e)} · ${layer.name}`;
    }
    if (!sameJson(old, layer)) return `Pattern · ${layer.name}`;
  }
  if (before.timelineBars !== after.timelineBars) return 'Timeline slot';
  return 'Edit';
}
