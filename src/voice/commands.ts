import { diatonicChords } from '../model/keys';
import { createPianoChord, createPianoLayer } from '../model/piano';
import { addEvent, appendLayer, createGuitarChord, createLayer, setManualKey } from '../model/song';
import type { PitchClass, Song } from '../model/types';

/** Deliberately small command vocabulary. GPT chooses the arguments; the app checks them. */
export type VoiceCommand =
  | { type: 'tempo'; operation: 'set' | 'adjust'; value: number }
  | {
      type: 'progression';
      tonic: PitchClass;
      mode: 'major' | 'minor';
      degrees: number[];
      instrument: 'guitar' | 'piano';
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Never execute unvalidated data received over the network. */
export function parseVoiceCommand(value: unknown): VoiceCommand | null {
  if (!isRecord(value)) return null;
  if (value.type === 'tempo') {
    if (value.operation !== 'set' && value.operation !== 'adjust') return null;
    if (typeof value.value !== 'number' || !Number.isInteger(value.value)) return null;
    if (value.operation === 'set' && (value.value < 40 || value.value > 220)) return null;
    if (value.operation === 'adjust' && (value.value < -40 || value.value > 40)) return null;
    return { type: 'tempo', operation: value.operation, value: value.value };
  }
  if (value.type === 'progression') {
    if (typeof value.tonic !== 'number' || !Number.isInteger(value.tonic) || value.tonic < 0 || value.tonic > 11) return null;
    if (value.mode !== 'major' && value.mode !== 'minor') return null;
    if (value.instrument !== 'guitar' && value.instrument !== 'piano') return null;
    if (!Array.isArray(value.degrees) || value.degrees.length < 1 || value.degrees.length > 16) return null;
    if (!value.degrees.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 7)) return null;
    return { type: 'progression', tonic: value.tonic as PitchClass, mode: value.mode, degrees: [...value.degrees], instrument: value.instrument };
  }
  return null;
}

/** Pure song edits, making the entire spoken instruction one Undo step. */
export function editSongByVoice(song: Song, command: VoiceCommand, cursorBeat: number): { song: Song; cursorBeat: number } {
  if (command.type === 'tempo') {
    const bpm = Math.min(220, Math.max(40, command.operation === 'set' ? command.value : song.bpm + command.value));
    return { song: bpm === song.bpm ? song : { ...song, bpm }, cursorBeat };
  }
  const chords = diatonicChords({ tonic: command.tonic, quality: command.mode });
  const chosen = command.degrees.map((degree) => chords[degree - 1]);
  if (chosen.some((chord) => chord.quality === 'dim')) {
    throw new Error('Diminished chords are not supported yet; choose another progression.');
  }
  let next = song;
  const instrument = command.instrument;
  const existing = instrument === 'guitar'
    ? next.guitar.layers.find((layer) => layer.type === 'chords')
    : next.piano.layers.find((layer) => layer.type === 'piano');
  const layer = existing ?? (instrument === 'guitar' ? createLayer('chords', next) : createPianoLayer(next));
  if (!existing) next = appendLayer(next, layer);
  const barBeats = next.timeSignature.beatsPerBar;
  const start = Math.max(0, Math.floor(cursorBeat / barBeats + 1e-6) * barBeats);
  chosen.forEach((chord, i) => {
    if (chord.quality === 'dim') return;
    const eventStart = start + i * barBeats;
    const event = instrument === 'guitar'
      ? createGuitarChord(chord.root, chord.quality, eventStart, barBeats)
      : createPianoChord(chord.root, chord.quality, eventStart, barBeats);
    next = addEvent(next, layer.id, event);
  });
  next = setManualKey(next, { tonic: command.tonic, quality: command.mode });
  next = { ...next, timelineBars: Math.max(next.timelineBars, Math.ceil((start + chosen.length * barBeats) / barBeats)) };
  return { song: next, cursorBeat: start + chosen.length * barBeats };
}
