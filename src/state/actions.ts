import { getAudioEngine } from '../audio/engine';
import { renderChordPreview, renderEvent, renderPianoPreview } from '../audio/render';
import { transport } from '../audio/transport';
import { voicingsFor } from '../model/chords';
import { DRUM_MIDI, drumHitAt, toggleDrumHit } from '../model/drums';
import { setGuitarChord, toggleGuitarChordNote } from '../model/guitarChords';
import { clampMidi } from '../model/music';
import { createPianoChord, pianoChordNotes, setPianoChord, togglePianoNote } from '../model/piano';
import {
  addEvent,
  createGuitarChord,
  createNoteEvent,
  findAnyLayer,
  isLoopOn,
  isStyledLayer,
  layerKind,
  removeEvent,
  setChordStyleOverride,
  setLayerArp,
  setLayerStyle,
  setLoopOn,
  setLoopRegion,
  updateAnyLayer,
  updateEvent,
  updateLayer,
} from '../model/song';
import { beatsToSeconds, eighthBeats, loopRange, snapToEighth, songBars, songBeats } from '../model/time';
import type {
  AnyEvent,
  ArpPattern,
  ChordEvent,
  ChordQuality,
  ChordStyle,
  ChordStyleOverride,
  DrumPiece,
  NoteEvent,
  PianoEvent,
  PitchClass,
} from '../model/types';
import { DEFAULT_VELOCITY } from '../model/types';
import { useStore } from './store';

/**
 * High-level editing actions. Each one is a single undoable step. They are
 * plain functions (not React) so the keyboard, the hum input and tests can
 * all drive them the same way.
 */

// ---- hearing things ----------------------------------------------------------

export function auditionNote(midi: number, velocity = 0.8, seconds = 0.6): void {
  void getAudioEngine().play(midi, velocity, seconds);
}

export function auditionDrum(piece: DrumPiece, velocity = DEFAULT_VELOCITY): void {
  void getAudioEngine().play(DRUM_MIDI[piece], velocity, 0.3, 0, 'drums');
}

/**
 * Preview a chord picked from the key before it is added: a quick down-strum
 * of its guitar voicing, or all piano keys at once.
 */
export function auditionPaletteChord(instrument: 'guitar' | 'piano', root: PitchClass, quality: ChordQuality): void {
  const engine = getAudioEngine();
  if (instrument === 'guitar') {
    const chord = createGuitarChord(root, quality, 0, 1);
    for (const n of renderChordPreview(chord)) void engine.play(n.midi, DEFAULT_VELOCITY, 1.2, n.offsetSec);
  } else {
    for (const n of renderPianoPreview({ notes: pianoChordNotes(root, quality) })) void engine.play(n.midi, DEFAULT_VELOCITY, 1.6, n.offsetSec);
  }
}

/** Long enough to hear a pattern or a sustain, short enough not to drag on. */
const PREVIEW_MAX_SEC = 4;

/**
 * Play one event exactly as it sounds in the song — strum pattern, picking /
 * arpeggio, sustain — up to a few seconds.
 */
export function auditionEvent(layerId: string, eventId: string): void {
  const { song } = useStore.getState();
  const engine = getAudioEngine();
  for (const n of renderEvent(song, layerId, eventId)) {
    const at = beatsToSeconds(n.beat, song.bpm) + n.offsetSec;
    if (at >= PREVIEW_MAX_SEC) continue;
    const seconds = Math.min(beatsToSeconds(n.durationBeats, song.bpm), PREVIEW_MAX_SEC - at);
    void engine.play(n.midi, n.velocity, seconds, at, n.instrument);
  }
}

// ---- notes layers (guitar and piano single notes) ----------------------------

/** Insert a note at the cursor in a notes layer. Returns the new event's id. */
export function insertAtCursor(layerId: string, midi: number, velocity?: number): string | null {
  const { song, cursorBeat, commit, setCursor, select } = useStore.getState();
  const layer = findAnyLayer(song, layerId);
  if (!layer || layerKind(layer) !== 'notes') return null;
  const start = snapToEighth(cursorBeat, song.timeSignature);
  const event = createNoteEvent(clampMidi(midi), start, 1, velocity);
  commit((s) => addEvent(s, layerId, event));
  setCursor(start + event.duration);
  select(event.id);
  return event.id;
}

/** Insert several already-timed notes (from humming) into a notes layer. */
export function insertDetectedNotes(
  layerId: string,
  notes: { midi: number; start: number; duration: number; velocity: number }[],
): string[] {
  const { song, commit, setCursor, select } = useStore.getState();
  const layer = findAnyLayer(song, layerId);
  if (!layer || layerKind(layer) !== 'notes' || notes.length === 0) return [];
  const events = notes.map((n) => createNoteEvent(clampMidi(n.midi), n.start, n.duration, n.velocity));
  commit((s) => events.reduce((next, event) => addEvent(next, layerId, event), s));
  setCursor(Math.max(...events.map((e) => e.start + e.duration)));
  select(events.length === 1 ? events[0].id : null);
  return events.map((e) => e.id);
}

export function getSelectedEvent(): { layerId: string; event: AnyEvent } | null {
  const { song, view, selectedEventId } = useStore.getState();
  if (view.name !== 'layer' || !selectedEventId) return null;
  const layer = findAnyLayer(song, view.layerId);
  const event = (layer?.events as AnyEvent[] | undefined)?.find((e) => e.id === selectedEventId);
  return layer && event ? { layerId: layer.id, event } : null;
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

export function shiftNotePitch(layerId: string, noteId: string, delta: number): void {
  editNote(layerId, noteId, (n) => ({ ...n, midi: clampMidi(n.midi + delta) }));
}

// ---- chords layers (guitar and piano) ----------------------------------------

/**
 * Add a chord picked from the key at the cursor, lasting a bar: a guitar
 * chord in its default voicing, or piano keys. A chord already ringing at
 * that point is lifted there, like moving your hands to the next chord.
 * Returns the new event's id.
 */
export function addChordAtCursor(layerId: string, root: PitchClass, quality: ChordQuality): string | null {
  const { song, cursorBeat, commit, setCursor, select } = useStore.getState();
  const layer = findAnyLayer(song, layerId);
  if (!layer || !isStyledLayer(layer)) return null;
  const ts = song.timeSignature;
  const start = snapToEighth(cursorBeat, ts);
  const event: ChordEvent | PianoEvent =
    layer.type === 'piano' ? createPianoChord(root, quality, start, ts.beatsPerBar) : createGuitarChord(root, quality, start, ts.beatsPerBar);
  commit((s) => {
    const lifted = updateAnyLayer(s, layerId, (l) => ({
      ...l,
      events: (l.events as AnyEvent[]).map((e) =>
        e.start < start - 1e-6 && e.start + e.duration > start + 1e-6 ? { ...e, duration: Math.max(eighthBeats(ts), start - e.start) } : e,
      ),
    }));
    return addEvent(lifted, layerId, event);
  });
  setCursor(start + event.duration);
  select(event.id);
  return event.id;
}

/**
 * "Next chord": put the cursor where this chord ends and clear the
 * selection, ready to add the next one. If it already runs to the end of the
 * song there is no room left, so this is the user asking for another slot —
 * the same explicit action as + Slot, never an automatic trailing bar.
 */
export function cursorAfterEvent(layerId: string, eventId: string): void {
  const { song, setCursor, select } = useStore.getState();
  const event = (findAnyLayer(song, layerId)?.events as AnyEvent[] | undefined)?.find((e) => e.id === eventId);
  if (!event) return;
  const end = event.start + event.duration;
  if (end >= songBeats(song) - 1e-6) addTimelineSlot();
  setCursor(end);
  select(null);
}

function editChord(layerId: string, eventId: string, guitar: (c: ChordEvent) => ChordEvent, piano: (e: PianoEvent) => PianoEvent): void {
  let changed = false;
  useStore.getState().commit((s) =>
    updateEvent(s, layerId, eventId, (e) => {
      if (e.kind === 'chord') {
        changed = true;
        return guitar(e);
      }
      if (e.kind === 'piano') {
        changed = true;
        return piano(e);
      }
      return e;
    }),
  );
  if (changed) auditionEvent(layerId, eventId);
}

/** Swap a chord to another standard chord (drops any wheel notes), keeping timing, feel and style. */
export function changeChord(layerId: string, eventId: string, root: PitchClass, quality: ChordQuality): void {
  editChord(layerId, eventId, (c) => setGuitarChord(c, root, quality), (e) => setPianoChord(e, root, quality));
}

/** Special-chord wheel: add a note to the chord, or take an added one away, and hear the result. */
export function toggleChordNote(layerId: string, eventId: string, pc: PitchClass): void {
  editChord(layerId, eventId, (c) => toggleGuitarChordNote(c, pc), (e) => togglePianoNote(e, pc));
}

/** Guitar only: step through the standard voicings (higher / lower on the neck). */
export function cycleVoicing(layerId: string, chordId: string): void {
  editChord(
    layerId,
    chordId,
    (c) => {
      if (c.quality !== 'major' && c.quality !== 'minor') return c;
      const options = voicingsFor(c.root, c.quality);
      const current = options.findIndex((v) => v.every((s, i) => s.fret === c.strings[i].fret && s.muted === c.strings[i].muted));
      return { ...c, strings: options[(current + 1) % options.length] };
    },
    (e) => e,
  );
}

/** A chords layer's default style: together (strum / one strike) or one note at a time (pick / arpeggio). */
export function setChordLayerStyle(layerId: string, style: ChordStyle): void {
  useStore.getState().commit((s) => setLayerStyle(s, layerId, style));
}

/** A chords layer's default pick / arpeggio pattern. */
export function setChordLayerArp(layerId: string, arp: ArpPattern): void {
  useStore.getState().commit((s) => setLayerArp(s, layerId, arp));
}

/** One chord's own style, or (null) back to the layer's. */
export function setChordOverride(layerId: string, eventId: string, override: ChordStyleOverride | null): void {
  useStore.getState().commit((s) => setChordStyleOverride(s, layerId, eventId, override));
}

export function setStrumSlot(layerId: string, index: number): void {
  const { commit } = useStore.getState();
  commit((s) =>
    updateLayer(s, layerId, (layer) => {
      if (layer.type !== 'chords') return layer;
      const order = [null, 'down', 'up'] as const;
      const current = layer.strumPattern[index];
      const next = order[(order.indexOf(current) + 1) % order.length];
      return { ...layer, strumPattern: layer.strumPattern.map((v, i) => (i === index ? next : v)) };
    }),
  );
}

// ---- drums ---------------------------------------------------------------------

/** Tap a drum-grid cell: add a hit there (and hear it), or remove the one that is there. */
export function toggleDrumCell(layerId: string, piece: DrumPiece, start: number): void {
  const { song, commit } = useStore.getState();
  const layer = song.drums.layers.find((l) => l.id === layerId);
  if (!layer) return;
  const adding = !drumHitAt(layer, piece, start);
  commit((s) => toggleDrumHit(s, layerId, piece, start));
  if (adding) auditionDrum(piece);
}

// ---- any event -------------------------------------------------------------------

/** `coalesceKey` merges one continuous slider drag into a single undo step. */
export function setEventVelocity(layerId: string, eventId: string, velocity: number, coalesceKey?: string): void {
  const { commit } = useStore.getState();
  commit((s) => updateEvent(s, layerId, eventId, (e) => (e.velocity === velocity ? e : { ...e, velocity })), coalesceKey);
}

/** Set an event's length (a piano hit's sustain) directly, in beats. */
export function setEventDuration(layerId: string, eventId: string, beats: number, coalesceKey?: string): void {
  const { commit, song } = useStore.getState();
  const duration = Math.max(eighthBeats(song.timeSignature), beats);
  commit((s) => updateEvent(s, layerId, eventId, (e) => (e.duration === duration ? e : { ...e, duration })), coalesceKey);
}

export function changeEventDuration(layerId: string, eventId: string, deltaBeats: number): void {
  const { commit, song } = useStore.getState();
  const min = eighthBeats(song.timeSignature);
  commit((s) => updateEvent(s, layerId, eventId, (e) => ({ ...e, duration: Math.max(min, e.duration + deltaBeats) })));
}

/**
 * Set where an event starts and how long it lasts in one step — the edge
 * handles on a selected block. Kept on the eighth-note grid, at least one
 * eighth long and never before the song start. `coalesceKey` makes one drag
 * one Undo step.
 */
export function resizeEvent(layerId: string, eventId: string, start: number, duration: number, coalesceKey?: string): void {
  const { commit, song } = useStore.getState();
  const step = eighthBeats(song.timeSignature);
  const s = Math.max(0, snapToEighth(start, song.timeSignature));
  const d = Math.max(step, snapToEighth(duration, song.timeSignature));
  commit(
    (so) => updateEvent(so, layerId, eventId, (e) => (e.start === s && e.duration === d ? e : { ...e, start: s, duration: d })),
    coalesceKey,
  );
}

/**
 * Play the open song. With the loop on, playback starts at the loop region's
 * start and keeps looping it; with the loop off, it starts at the cursor and
 * plays through to the end once.
 */
export function playSong(): void {
  const { song, cursorBeat } = useStore.getState();
  const from = isLoopOn(song) ? loopRange(song).start : cursorBeat;
  void transport.play(song, from, { songLoop: true });
}

/** Switch looping on or off (hold the golden loop bar). */
export function setSongLoopOn(on: boolean): void {
  useStore.getState().commit((s) => setLoopOn(s, on));
}

/** Set the song's loop region (beats); covering the whole song clears it. */
export function setSongLoop(start: number, end: number, coalesceKey?: string): void {
  useStore.getState().commit((s) => setLoopRegion(s, start, end), coalesceKey);
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

/** Add one explicit empty timeline slot (one bar) and move the cursor into it. */
export function addTimelineSlot(): void {
  const { song, commit, setCursor } = useStore.getState();
  const currentBars = songBars(song);
  const nextBarStart = currentBars * song.timeSignature.beatsPerBar;
  commit((s) => ({ ...s, timelineBars: songBars(s) + 1 }));
  setCursor(nextBarStart);
}
