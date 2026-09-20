import { getAudioEngine } from '../audio/engine';
import { renderChordPreview } from '../audio/render';
import { relabelChord, setStringMuted, shiftStringFret, voicingsFor } from '../model/chords';
import { clampMidi } from '../model/music';
import {
  addEvent,
  addToneToChord,
  buildChord,
  createNoteEvent,
  createSeedChord,
  findLayer,
  isChordLayer,
  removeEvent,
  updateEvent,
  updateLayer,
} from '../model/song';
import { beatsToSeconds, eighthBeats, snapToEighth } from '../model/time';
import type { AnyEvent, ChordEvent, ChordQuality, NoteEvent, Song } from '../model/types';
import { useStore } from './store';

/**
 * High-level editing actions. Each one is a single undoable step. They are
 * plain functions (not React) so the keyboard, the hum input and tests can
 * all drive them the same way.
 */

export function auditionNote(midi: number, velocity = 0.8, seconds = 0.6): void {
  void getAudioEngine().play(midi, velocity, seconds);
}

export function auditionChord(chord: ChordEvent, seconds = 1.2): void {
  const engine = getAudioEngine();
  for (const n of renderChordPreview(chord)) void engine.play(n.midi, chord.velocity, seconds, n.offsetSec);
}

function chordDefaultDuration(song: Song): number {
  return song.timeSignature.beatsPerBar;
}

/** Trim any chord in the layer that spans `beat` so it ends there. */
function truncateChordsAt(song: Song, layerId: string, beat: number): Song {
  return updateLayer(song, layerId, (layer) => {
    if (layer.type === 'single') return layer;
    const step = eighthBeats(song.timeSignature);
    return {
      ...layer,
      events: layer.events.map((c) =>
        c.start < beat - 1e-6 && c.start + c.duration > beat + 1e-6
          ? { ...c, duration: Math.max(step, beat - c.start) }
          : c,
      ),
    };
  });
}

/**
 * Insert a note at the cursor. In a single-note layer this adds a NoteEvent;
 * in a chord layer it adds a one-tone "seed" chord ready for Major/Minor.
 * Returns the new event's id.
 */
export function insertAtCursor(layerId: string, midi: number, velocity?: number): string | null {
  const { song, cursorBeat, commit, setCursor, select } = useStore.getState();
  const layer = findLayer(song, layerId);
  if (!layer) return null;
  const start = snapToEighth(cursorBeat, song.timeSignature);
  let event: AnyEvent;
  if (layer.type === 'single') {
    event = createNoteEvent(clampMidi(midi), start, 1, velocity);
  } else {
    event = createSeedChord(clampMidi(midi), start, chordDefaultDuration(song), velocity);
  }
  commit((s) => addEvent(truncateChordsAt(s, layerId, start), layerId, event));
  setCursor(start + event.duration);
  select(event.id);
  return event.id;
}

/** Insert several already-timed notes (from humming). */
export function insertDetectedNotes(
  layerId: string,
  notes: { midi: number; start: number; duration: number; velocity: number }[],
): string[] {
  const { song, commit, setCursor, select } = useStore.getState();
  const layer = findLayer(song, layerId);
  if (!layer || notes.length === 0) return [];
  const ids: string[] = [];
  let end = 0;
  commit((s) => {
    let next = s;
    notes.forEach((n, i) => {
      let event: AnyEvent;
      if (layer.type === 'single') {
        event = createNoteEvent(clampMidi(n.midi), n.start, n.duration, n.velocity);
      } else {
        // On chord layers each hummed note is a chord change lasting until
        // the next one (or a bar for the last).
        const following = notes[i + 1];
        const duration = following ? Math.max(eighthBeats(s.timeSignature), following.start - n.start) : chordDefaultDuration(s);
        event = createSeedChord(clampMidi(n.midi), n.start, duration, n.velocity);
      }
      ids.push(event.id);
      end = Math.max(end, event.start + event.duration);
      next = addEvent(truncateChordsAt(next, layerId, event.start), layerId, event);
    });
    return next;
  });
  setCursor(end);
  select(ids.length === 1 ? ids[0] : null);
  return ids;
}

export function getSelectedEvent(): { layerId: string; event: AnyEvent } | null {
  const { song, view, selectedEventId } = useStore.getState();
  if (view.name !== 'layer' || !selectedEventId) return null;
  const layer = findLayer(song, view.layerId);
  const event = layer?.events.find((e) => e.id === selectedEventId);
  return layer && event ? { layerId: layer.id, event } : null;
}

function editChord(layerId: string, chordId: string, fn: (c: ChordEvent) => ChordEvent, preview = true): void {
  const { commit } = useStore.getState();
  let result: ChordEvent | null = null;
  commit((s) =>
    updateEvent(s, layerId, chordId, (e) => {
      if (e.kind !== 'chord') return e;
      result = fn(e);
      return result;
    }),
  );
  if (preview && result) auditionChord(result);
}

function editNote(layerId: string, noteId: string, fn: (n: NoteEvent) => NoteEvent, preview = true): void {
  const { commit } = useStore.getState();
  let result: NoteEvent | null = null;
  commit((s) =>
    updateEvent(s, layerId, noteId, (e) => {
      if (e.kind !== 'note') return e;
      result = fn(e);
      return result;
    }),
  );
  if (preview && result) {
    const r: NoteEvent = result;
    auditionNote(r.midi, r.velocity, 0.5);
  }
}

export function makeChord(layerId: string, chordId: string, quality: ChordQuality): void {
  editChord(layerId, chordId, (c) => buildChord(c, quality));
}

export function addToneToSelectedChord(layerId: string, chordId: string, midi: number): void {
  editChord(layerId, chordId, (c) => addToneToChord(c, midi));
}

export function toggleStringMute(layerId: string, chordId: string, index: number): void {
  editChord(layerId, chordId, (c) => relabelChord({ ...c, strings: setStringMuted(c.strings, index, !c.strings[index].muted) }));
}

export function shiftChordTone(layerId: string, chordId: string, index: number, delta: number): void {
  editChord(layerId, chordId, (c) => relabelChord({ ...c, strings: shiftStringFret(c.strings, index, delta) }));
}

/** Cycle through the standard voicings for a major/minor chord. */
export function cycleVoicing(layerId: string, chordId: string): void {
  editChord(layerId, chordId, (c) => {
    if (c.quality !== 'major' && c.quality !== 'minor') return c;
    const options = voicingsFor(c.root, c.quality);
    const current = options.findIndex((v) => v.every((s, i) => s.fret === c.strings[i].fret && s.muted === c.strings[i].muted));
    const next = options[(current + 1) % options.length];
    return { ...c, strings: next };
  });
}

export function setChordPickPattern(layerId: string, chordId: string, pattern: number[] | null): void {
  editChord(layerId, chordId, (c) => ({ ...c, pickPattern: pattern }), false);
}

export function shiftNotePitch(layerId: string, noteId: string, delta: number): void {
  editNote(layerId, noteId, (n) => ({ ...n, midi: clampMidi(n.midi + delta) }));
}

export function setEventVelocity(layerId: string, eventId: string, velocity: number): void {
  const { commit } = useStore.getState();
  commit((s) => updateEvent(s, layerId, eventId, (e) => ({ ...e, velocity })));
}

export function changeEventDuration(layerId: string, eventId: string, deltaBeats: number): void {
  const { commit, song } = useStore.getState();
  const min = eighthBeats(song.timeSignature);
  commit((s) => updateEvent(s, layerId, eventId, (e) => ({ ...e, duration: Math.max(min, e.duration + deltaBeats) })));
}

export function moveEvent(layerId: string, eventId: string, newStart: number): void {
  const { commit, song, setCursor } = useStore.getState();
  const start = Math.max(0, snapToEighth(newStart, song.timeSignature));
  commit((s) => updateEvent(s, layerId, eventId, (e) => (e.start === start ? e : { ...e, start })));
  setCursor(start);
}

export function deleteEvent(layerId: string, eventId: string): void {
  const { commit, select } = useStore.getState();
  commit((s) => removeEvent(s, layerId, eventId));
  select(null);
}

export function setStrumSlot(layerId: string, index: number): void {
  const { commit } = useStore.getState();
  commit((s) =>
    updateLayer(s, layerId, (layer) => {
      if (layer.type !== 'strum') return layer;
      const order = [null, 'down', 'up'] as const;
      const current = layer.strumPattern[index];
      const next = order[(order.indexOf(current) + 1) % order.length];
      const strumPattern = layer.strumPattern.map((v, i) => (i === index ? next : v));
      return { ...layer, strumPattern };
    }),
  );
}

export function setLayerPickPattern(layerId: string, pattern: number[]): void {
  const { commit } = useStore.getState();
  commit((s) => updateLayer(s, layerId, (layer) => (layer.type === 'picked' ? { ...layer, pickPattern: pattern } : layer)));
}

/** Play just the selected event so the user can judge it. */
export function auditionEvent(event: AnyEvent, bpm: number): void {
  if (event.kind === 'note') auditionNote(event.midi, event.velocity, beatsToSeconds(event.duration, bpm));
  else auditionChord(event, Math.min(2, beatsToSeconds(event.duration, bpm)));
}

export { isChordLayer };
