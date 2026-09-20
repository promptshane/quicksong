import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { initAudioEngine, installAudioUnlockListeners } from './audio/engine';
import { PluckSynth } from './audio/synth';
import { hydrateStore } from './state/store';
import './styles.css';

// The V1 instrument is a simple synth. Replace this factory with a sampled
// guitar later — the song model and sequencer do not change.
const engine = initAudioEngine((ctx, dest) => new PluckSynth(ctx, dest));
installAudioUnlockListeners(engine);

registerSW({ immediate: true });

void hydrateStore();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
