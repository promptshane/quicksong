import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { initAudioEngine, installAudioUnlockListeners } from './audio/engine';
import { installMetronome } from './audio/metronome';
import { transport } from './audio/transport';
import { PluckSynth } from './audio/synth';
import { hydrateStore, useStore } from './state/store';
import './styles.css';

// The V1 instrument is a simple synth. Replace this factory with a sampled
// guitar later — the song model and sequencer do not change.
const engine = initAudioEngine((ctx, dest) => new PluckSynth(ctx, dest));
// Backgrounding the app stops playback (and with it the metronome).
installAudioUnlockListeners(engine, () => transport.stop());

// The editing metronome clicks during playback of an open project only.
installMetronome((listener) => {
  listener(useStore.getState().activeProjectId !== null);
  useStore.subscribe((s, prev) => {
    if (s.activeProjectId !== prev.activeProjectId) listener(s.activeProjectId !== null);
  });
});

registerSW({ immediate: true });

// Edits, Undo and Redo made while the song plays are heard on the next note.
useStore.subscribe((s, prev) => {
  if (s.song !== prev.song) transport.refresh(s.song);
});

void hydrateStore();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
