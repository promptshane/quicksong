import { activeStringNumbers, soundingNotes, stringIndex, stringMidi } from '../model/chords';
import { eighthBeats, songBeats } from '../model/time';
import type { ChordEvent, PianoEvent, PianoLayer, PickedLayer, Song, StrumLayer } from '../model/types';

/**
 * A single note to play, in song time. Produced by `renderSong` — the pure
 * step that turns the musical data model into something an Instrument can
 * schedule. No Web Audio in here, so it is fully unit-testable.
 */
export interface ScheduledNote {
  layerId: string;
  eventId: string;
  midi: number;
  velocity: number;
  /** Start in beats from song start. */
  beat: number;
  /** Length in beats. */
  durationBeats: number;
  /** Extra offset in seconds (used for the strum stagger). */
  offsetSec: number;
  /** Layer gain, 0..1. */
  gain: number;
}

const STRUM_STAGGER_SEC = 0.014;
const UP_STRUM_VELOCITY = 0.8;

function chordAt(events: ChordEvent[], beat: number): ChordEvent | undefined {
  return events.find((c) => beat >= c.start - 1e-6 && beat < c.start + c.duration - 1e-6);
}

function renderStrumLayer(song: Song, layer: StrumLayer, out: ScheduledNote[]): void {
  const ts = song.timeSignature;
  const step = eighthBeats(ts);
  const slotsPerBar = layer.strumPattern.length;
  const totalSlots = Math.ceil(songBeats(song) / step);
  const gain = layer.muted ? 0 : layer.volume;

  const slotHasStrum = (slot: number) => layer.strumPattern[slot % slotsPerBar] != null;

  for (let slot = 0; slot < totalSlots; slot++) {
    const kind = layer.strumPattern[slot % slotsPerBar];
    if (!kind) continue;
    const beat = slot * step;
    const chord = chordAt(layer.events, beat);
    if (!chord) continue;

    // Ring until the next strum inside this chord, or the chord's end.
    let next = slot + 1;
    while (next * step < chord.start + chord.duration - 1e-6 && !slotHasStrum(next)) next++;
    const ringUntil = Math.min(next * step, chord.start + chord.duration);
    const durationBeats = Math.max(step, ringUntil - beat);

    const notes = soundingNotes(chord.strings);
    const ordered = kind === 'down' ? notes : [...notes].reverse();
    const velocity = chord.velocity * (kind === 'up' ? UP_STRUM_VELOCITY : 1);
    ordered.forEach((n, i) => {
      out.push({
        layerId: layer.id,
        eventId: chord.id,
        midi: n.midi,
        velocity,
        beat,
        durationBeats,
        offsetSec: i * STRUM_STAGGER_SEC,
        gain,
      });
    });
  }
}

/** Resolve a requested string number to one that sounds in the chord. */
export function resolvePickString(chord: ChordEvent, wanted: number): number | null {
  const active = activeStringNumbers(chord);
  if (active.length === 0) return null;
  if (active.includes(wanted)) return wanted;
  // Nearest sounding string, preferring the lower (higher-numbered) one on ties.
  return active.reduce((best, s) => {
    const d = Math.abs(s - wanted);
    const bd = Math.abs(best - wanted);
    if (d < bd) return s;
    if (d === bd && s > best) return s;
    return best;
  });
}

function renderPickedLayer(song: Song, layer: PickedLayer, out: ScheduledNote[]): void {
  const ts = song.timeSignature;
  const gain = layer.muted ? 0 : layer.volume;
  for (const chord of layer.events) {
    const pattern = chord.pickPattern ?? layer.pickPattern;
    if (pattern.length === 0) continue;
    const firstBeat = Math.ceil(chord.start - 1e-6);
    const endBeat = chord.start + chord.duration;
    for (let beat = firstBeat; beat < endBeat - 1e-6; beat++) {
      const beatInBar = ((beat % ts.beatsPerBar) + ts.beatsPerBar) % ts.beatsPerBar;
      const wanted = pattern[beatInBar % pattern.length];
      const stringNum = resolvePickString(chord, wanted);
      if (stringNum == null) continue;
      const idx = stringIndex(stringNum);
      out.push({
        layerId: layer.id,
        eventId: chord.id,
        midi: stringMidi(idx, chord.strings[idx]),
        velocity: chord.velocity,
        beat,
        durationBeats: Math.min(endBeat - beat, 2),
        offsetSec: 0,
        gain,
      });
    }
  }
}

/**
 * Piano hits are struck, not strummed: every key of a chord starts at the
 * same instant and is held for the event's duration (its sustain).
 */
function renderPianoLayer(layer: PianoLayer, out: ScheduledNote[]): void {
  const gain = layer.muted ? 0 : layer.volume;
  for (const ev of layer.events) {
    for (const midi of ev.notes) {
      out.push({
        layerId: layer.id,
        eventId: ev.id,
        midi,
        velocity: ev.velocity,
        beat: ev.start,
        durationBeats: ev.duration,
        offsetSec: 0,
        gain,
      });
    }
  }
}

/** Flatten the whole song into notes, sorted by time. */
export function renderSong(song: Song): ScheduledNote[] {
  const out: ScheduledNote[] = [];
  for (const layer of song.guitar.layers) {
    if (layer.type === 'single') {
      const gain = layer.muted ? 0 : layer.volume;
      for (const ev of layer.events) {
        out.push({
          layerId: layer.id,
          eventId: ev.id,
          midi: ev.midi,
          velocity: ev.velocity,
          beat: ev.start,
          durationBeats: ev.duration,
          offsetSec: 0,
          gain,
        });
      }
    } else if (layer.type === 'strum') {
      renderStrumLayer(song, layer, out);
    } else {
      renderPickedLayer(song, layer, out);
    }
  }
  for (const layer of song.piano.layers) renderPianoLayer(layer, out);
  return out.sort((a, b) => a.beat - b.beat || a.offsetSec - b.offsetSec);
}

/** Notes to play when previewing one chord on its own (a quick down-strum). */
export function renderChordPreview(chord: ChordEvent): { midi: number; offsetSec: number }[] {
  return soundingNotes(chord.strings).map((n, i) => ({ midi: n.midi, offsetSec: i * STRUM_STAGGER_SEC }));
}

/** Notes to play when previewing one piano chord: all keys together. */
export function renderPianoPreview(event: Pick<PianoEvent, 'notes'>): { midi: number; offsetSec: number }[] {
  return event.notes.map((midi) => ({ midi, offsetSec: 0 }));
}
