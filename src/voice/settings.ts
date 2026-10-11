/** Settings are local to this device. No song data is uploaded to the relay. */
export interface VoiceSettings { endpoint: string; token: string }
export const VOICE_SETTINGS_KEY = 'quicksong:voice:v1';
export const VOICE_SETTINGS_CHANGED = 'quicksong:voice-settings-changed';

export function getVoiceSettings(): VoiceSettings | null {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Partial<VoiceSettings>;
    if (typeof value.endpoint !== 'string' || typeof value.token !== 'string') return null;
    const url = new URL(value.endpoint);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) return null;
    if (value.token.length < 32 || value.token.length > 256) return null;
    return { endpoint: url.origin, token: value.token };
  } catch {
    return null;
  }
}

export function saveVoiceSettings(endpoint: string, token: string): void {
  const url = new URL(endpoint.trim());
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))
    throw new Error('Enter an HTTPS connection URL.');
  if (token.trim().length < 32 || token.trim().length > 256)
    throw new Error('The connection key must contain 32–256 characters.');
  localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify({ endpoint: url.origin, token: token.trim() } satisfies VoiceSettings));
  window.dispatchEvent(new Event(VOICE_SETTINGS_CHANGED));
}

export function clearVoiceSettings(): void {
  localStorage.removeItem(VOICE_SETTINGS_KEY);
  window.dispatchEvent(new Event(VOICE_SETTINGS_CHANGED));
}
