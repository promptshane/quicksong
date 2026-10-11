import { useEffect } from 'react';
import { transport } from '../audio/transport';
import { flushPendingSave } from '../state/persistence';
import { useStore } from '../state/store';
import { toast } from '../ui/toastStore';
import { editSongByVoice, parseVoiceCommand } from './commands';
import { getVoiceSettings, VOICE_SETTINGS_CHANGED, type VoiceSettings } from './settings';

const RECENT_KEY = 'quicksong:voice:processed:v1';
interface Envelope { id: string; command: unknown }

function processedIds(): string[] {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string').slice(-200) : [];
  } catch { return []; }
}
function rememberId(id: string): void {
  const ids = processedIds();
  localStorage.setItem(RECENT_KEY, JSON.stringify([...ids.filter((entry) => entry !== id), id].slice(-200)));
}
async function acknowledge(settings: VoiceSettings, id: string): Promise<void> {
  const response = await fetch(settings.endpoint + '/v1/ack', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + settings.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Could not confirm command delivery');
}

/** Runs only while an open project is on screen. iOS may pause a hidden PWA. */
export function useVoiceRelay(): void {
  const activeProjectId = useStore((s) => s.activeProjectId);
  useEffect(() => {
    if (!activeProjectId) return;
    let closed = false;
    let running = false;

    const poll = async () => {
      const settings = getVoiceSettings();
      if (!settings || closed || running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const response = await fetch(settings.endpoint + '/v1/commands', {
          headers: { Authorization: 'Bearer ' + settings.token },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('commands' in data)) return;
        const commands = (data as { commands: unknown }).commands;
        if (!Array.isArray(commands)) return;

        for (const item of commands.slice(0, 20)) {
          if (closed || useStore.getState().activeProjectId !== activeProjectId) break;
          if (!item || typeof item !== 'object') continue;
          const envelope = item as Envelope;
          if (typeof envelope.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(envelope.id)) continue;
          if (processedIds().includes(envelope.id)) {
            await acknowledge(settings, envelope.id);
            continue;
          }
          const command = parseVoiceCommand(envelope.command);
          if (!command) {
            toast('Voice: unsupported command ignored');
            rememberId(envelope.id);
            await acknowledge(settings, envelope.id);
            continue;
          }
          try {
            const state = useStore.getState();
            const change = editSongByVoice(state.song, command, state.cursorBeat);
            state.commit(() => change.song);
            state.setCursor(change.cursorBeat);
            if (command.type === 'tempo') transport.setBpm(useStore.getState().song.bpm);
            await flushPendingSave();
            rememberId(envelope.id);
            toast(command.type === 'tempo' ? 'Tempo updated by voice' : 'Chord progression added by voice');
            await acknowledge(settings, envelope.id);
          } catch (error) {
            toast(error instanceof Error ? error.message : 'Voice command failed');
            break;
          }
        }
      } catch {
        // The app remains usable offline. Poll again when connected.
      } finally {
        running = false;
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), 2500);
    const refresh = () => void poll();
    window.addEventListener(VOICE_SETTINGS_CHANGED, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      closed = true;
      window.clearInterval(interval);
      window.removeEventListener(VOICE_SETTINGS_CHANGED, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [activeProjectId]);
}
