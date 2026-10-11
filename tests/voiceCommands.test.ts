import { describe, expect, it } from 'vitest';
import { createSong } from '../src/model/song';
import { editSongByVoice, parseVoiceCommand } from '../src/voice/commands';

describe('voice commands', () => {
  it('rejects unknown and unsafe commands', () => {
    expect(parseVoiceCommand({ type: 'delete_project' })).toBeNull();
    expect(parseVoiceCommand({ type: 'tempo', operation: 'set', value: 999 })).toBeNull();
    expect(parseVoiceCommand({ type: 'progression', tonic: 0, mode: 'major', instrument: 'guitar', degrees: [0] })).toBeNull();
  });

  it('adjusts tempo without exceeding limits', () => {
    const command = parseVoiceCommand({ type: 'tempo', operation: 'adjust', value: 5 });
    expect(command).not.toBeNull();
    const changed = editSongByVoice(createSong(), command!, 0);
    expect(changed.song.bpm).toBe(105);
    expect(editSongByVoice({ ...createSong(), bpm: 218 }, command!, 0).song.bpm).toBe(220);
  });

  it('creates a V-IV-I progression in C major on a guitar layer', () => {
    const command = parseVoiceCommand({ type: 'progression', tonic: 0, mode: 'major', degrees: [5, 4, 1], instrument: 'guitar' });
    expect(command).not.toBeNull();
    const result = editSongByVoice(createSong(), command!, 0);
    const events = result.song.guitar.layers[0].events;
    expect(events).toHaveLength(3);
    expect(events.map((event) => 'root' in event ? event.root : -1)).toEqual([7, 5, 0]);
    expect(events.map((event) => event.start)).toEqual([0, 4, 8]);
    expect(result.song.timelineBars).toBe(3);
    expect(result.song.key).toEqual({ mode: 'manual', tonic: 0, quality: 'major' });
  });

  it('adds the progression in one pass without overwriting existing chords', () => {
    const command = parseVoiceCommand({ type: 'progression', tonic: 0, mode: 'major', degrees: [5, 1], instrument: 'piano' })!;
    const first = editSongByVoice(createSong(), command, 0);
    const second = editSongByVoice(first.song, command, 8);
    expect(second.song.piano.layers).toHaveLength(1);
    expect(second.song.piano.layers[0].events).toHaveLength(4);
    expect(second.song.timelineBars).toBe(4);
  });

  it('rejects diminished degrees until supported by the model', () => {
    const command = parseVoiceCommand({ type: 'progression', tonic: 0, mode: 'major', degrees: [7], instrument: 'guitar' })!;
    expect(() => editSongByVoice(createSong(), command, 0)).toThrow('Diminished');
  });
});
