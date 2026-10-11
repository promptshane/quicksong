import { useState } from 'react';
import { Sheet } from './Sheet';
import { toast } from './toastStore';
import { clearVoiceSettings, getVoiceSettings, saveVoiceSettings } from '../voice/settings';

/** Optional connection to a personal ChatGPT plugin; no API billing. */
export function VoiceControl() {
  const initial = getVoiceSettings();
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? '');
  const [token, setToken] = useState(initial?.token ?? '');
  const [connected, setConnected] = useState(!!initial);

  const save = () => {
    try {
      saveVoiceSettings(endpoint, token);
      setConnected(true);
      setOpen(false);
      toast('Voice connection saved');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Invalid voice connection');
    }
  };
  const disconnect = () => {
    clearVoiceSettings();
    setConnected(false);
    setToken('');
    setOpen(false);
    toast('Voice connection removed');
  };
  return (
    <>
      <button className="btn ghost small" onClick={() => setOpen(true)} aria-label="ChatGPT voice settings">
        {connected ? 'Voice ✓' : 'Voice'}
      </button>
      {open && (
        <Sheet title="ChatGPT Voice" onClose={() => setOpen(false)}>
          <div className="panel-hint">
            Link your private ChatGPT plugin to control the open song by speaking in ChatGPT.
            Songs remain saved only on this device. Keep QuickSong open while using ChatGPT Voice in the background.
          </div>
          <div className="sheet-form">
            <label className="panel-label" htmlFor="voice-relay-url">Connection URL</label>
            <input
              id="voice-relay-url"
              className="text-input"
              type="url"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="https://quicksong-voice.example.workers.dev"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <label className="panel-label" htmlFor="voice-relay-token">Private connection key</label>
            <input
              id="voice-relay-token"
              className="text-input"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="At least 32 characters"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <button className="btn primary wide" onClick={save}>Connect</button>
            {connected && <button className="btn danger wide" onClick={disconnect}>Disconnect</button>}
          </div>
        </Sheet>
      )}
    </>
  );
}
