import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { initAudioEngine, installAudioUnlockListeners } from './audio/engine';
import { installMetronome } from './audio/metronome';
import { PluckSynth } from './audio/synth';
import { hydrateStore, useStore } from './state/store';
import './styles.css';

// The V1 instrument is a simple synth. Replace this factory with a sampled
// guitar later — the song model and sequencer do not change.
const engine = initAudioEngine((ctx, dest) => new PluckSynth(ctx, dest));
installAudioUnlockListeners(engine);

// The editing metronome follows the open song's tempo and is silent on Projects.
installMetronome(
  () => {
    const { song } = useStore.getState();
    return { bpm: song.bpm, beatsPerBar: song.timeSignature.beatsPerBar };
  },
  (listener) => {
    listener(useStore.getState().activeProjectId !== null);
    useStore.subscribe((s, prev) => {
      if (s.activeProjectId !== prev.activeProjectId) listener(s.activeProjectId !== null);
    });
  },
);

registerSW({ immediate: true });

void hydrateStore();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
