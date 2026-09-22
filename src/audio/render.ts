import { arpSteps, effectiveStyle } from '../model/arpeggio';
import { soundingNotes } from '../model/chords';
import { DRUM_MIDI } from '../model/drums';
import { eventPitches } from '../model/song';
import { eighthBeats, songBeats } from '../model/time';
import type { ChordEvent, GuitarChordLayer, PianoEvent, PianoLayer, Song } from '../model/types';
import type { InstrumentKind } from './engine';

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
  instrument: InstrumentKind;
}

const STRUM_STAGGER_SEC = 0.014;
const UP_STRUM_VELOCITY = 0.8;

type Emit = (n: Omit<ScheduledNote, 'layerId' | 'gain' | 'instrument'>) => void;

function emitter(layer: { id: string; muted: boolean; volume: number }, out: ScheduledNote[], instrument: InstrumentKind = 'melodic'): Emit {
  const gain = layer.muted ? 0 : layer.volume;
  return (n) => out.push({ ...n, layerId: layer.id, gain, instrument });
}

/** Guitar chords played together: strummed on the layer's strum pattern. */
function renderStrums(song: Song, layer: GuitarChordLayer, chords: ChordEvent[], emit: Emit): void {
  const step = eighthBeats(song.timeSignature);
  const slotsPerBar = layer.strumPattern.length;
  const totalSlots = Math.ceil(songBeats(song) / step);
  const slotHasStrum = (slot: number) => layer.strumPattern[slot % slotsPerBar] != null;

  for (let slot = 0; slot < totalSlots; slot++) {
    const kind = layer.strumPattern[slot % slotsPerBar];
    if (!kind) continue;
    const beat = slot * step;
    const chord = chords.find((c) => beat >= c.start - 1e-6 && beat < c.start + c.duration - 1e-6);
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
      emit({ eventId: chord.id, midi: n.midi, velocity, beat, durationBeats, offsetSec: i * STRUM_STAGGER_SEC });
    });
  }
}

/**
 * One chord played a note at a time (guitar picking, piano arpeggio): the
 * bar-long pattern repeats, aligned to the bar, for as long as the chord
 * lasts. Each note rings until the chord ends (at most a bar), like a held
 * pedal or a let-ring pick.
 */
function renderArpeggio(song: Song, chord: ChordEvent | PianoEvent, arp: GuitarChordLayer['arp'], emit: Emit): void {
  const ts = song.timeSignature;
  const step = eighthBeats(ts);
  const tones = [...eventPitches(chord)].sort((a, b) => a - b);
  if (tones.length === 0) return;
  const steps = arpSteps(arp, tones.length, ts);
  const end = chord.start + chord.duration;
  const first = Math.ceil(chord.start / step - 1e-6) || 0; // never -0
  for (let slot = first; slot * step < end - 1e-6; slot++) {
    const beat = slot * step;
    const slotInBar = Math.round((((beat % ts.beatsPerBar) + ts.beatsPerBar) % ts.beatsPerBar) / step) % steps.length;
    const picked = new Set(steps[slotInBar].map((t) => tones[Math.min(t, tones.length - 1)]));
    for (const midi of picked) {
      emit({ eventId: chord.id, midi, velocity: chord.velocity, beat, durationBeats: Math.min(end - beat, ts.beatsPerBar), offsetSec: 0 });
    }
  }
}

function renderGuitarChords(song: Song, layer: GuitarChordLayer, emit: Emit): void {
  const together: ChordEvent[] = [];
  for (const chord of layer.events) {
    const style = effectiveStyle(layer, chord);
    if (style.style === 'together') together.push(chord);
    else renderArpeggio(song, chord, style.arp, emit);
  }
  renderStrums(song, layer, together, emit);
}

/**
 * Piano chords played together are struck, not strummed: every key starts at
 * the same instant and is held for the event's duration (its sustain).
 */
function renderPianoChords(song: Song, layer: PianoLayer, emit: Emit): void {
  for (const ev of layer.events) {
    const style = effectiveStyle(layer, ev);
    if (style.style === 'arpeggio') {
      renderArpeggio(song, ev, style.arp, emit);
      continue;
    }
    for (const midi of ev.notes) {
      emit({ eventId: ev.id, midi, velocity: ev.velocity, beat: ev.start, durationBeats: ev.duration, offsetSec: 0 });
    }
  }
}

/** Flatten the whole song into notes, sorted by time. */
export function renderSong(song: Song): ScheduledNote[] {
  const out: ScheduledNote[] = [];
  for (const layer of [...song.guitar.layers, ...song.piano.layers]) {
    const emit = emitter(layer, out);
    if (layer.type === 'chords') renderGuitarChords(song, layer, emit);
    else if (layer.type === 'piano') renderPianoChords(song, layer, emit);
    else {
      for (const ev of layer.events) {
        emit({ eventId: ev.id, midi: ev.midi, velocity: ev.velocity, beat: ev.start, durationBeats: ev.duration, offsetSec: 0 });
      }
    }
  }
  for (const layer of song.drums.layers) {
    const emit = emitter(layer, out, 'drums');
    for (const hit of layer.events) {
      emit({ eventId: hit.id, midi: DRUM_MIDI[hit.piece], velocity: hit.velocity, beat: hit.start, durationBeats: hit.duration, offsetSec: 0 });
    }
  }
  return out.sort((a, b) => a.beat - b.beat || a.offsetSec - b.offsetSec);
}

/**
 * One event exactly as it will play in the song (strum pattern, arpeggio,
 * sustain), for auditioning it on its own. Beats are relative to the event.
 */
export function renderEvent(song: Song, layerId: string, eventId: string): ScheduledNote[] {
  const notes = renderSong(song).filter((n) => n.layerId === layerId && n.eventId === eventId);
  const first = notes.reduce((min, n) => Math.min(min, n.beat), Infinity);
  return notes.map((n) => ({ ...n, beat: n.beat - first }));
}

/** Notes to play when previewing one guitar chord on its own (a quick down-strum). */
export function renderChordPreview(chord: ChordEvent): { midi: number; offsetSec: number }[] {
  return soundingNotes(chord.strings).map((n, i) => ({ midi: n.midi, offsetSec: i * STRUM_STAGGER_SEC }));
}

/** Notes to play when previewing one piano chord: all keys together. */
export function renderPianoPreview(event: Pick<PianoEvent, 'notes'>): { midi: number; offsetSec: number }[] {
  return event.notes.map((midi) => ({ midi, offsetSec: 0 }));
}
