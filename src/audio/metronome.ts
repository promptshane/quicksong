import { create } from 'zustand';
import { transport } from './transport';

/**
 * The editing metronome, toggled from the Tempo sheet. It only ever sounds
 * while the song is playing: the transport clicks on the song's own beats
 * (see `transport.setEditClick`), so paused means silent.
 */

interface MetronomeState {
  /** The user's toggle. Session-only; never saved with a song. */
  on: boolean;
}

export const useMetronome = create<MetronomeState>(() => ({ on: false }));

let active = false;

function sync(): void {
  transport.setEditClick(active && useMetronome.getState().on);
}

/**
 * Wire the metronome to the app. `subscribeActive` reports whether a project
 * is open; project previews on the Projects screen never click.
 */
export function installMetronome(subscribeActive: (listener: (active: boolean) => void) => void): void {
  subscribeActive((isActive) => {
    active = isActive;
    sync();
  });
  useMetronome.subscribe(sync);
}

export function setMetronomeOn(on: boolean): void {
  useMetronome.setState({ on });
}
