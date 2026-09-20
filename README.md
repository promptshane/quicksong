# QuickSong

A mobile-first web app (PWA) for turning the song in your head into something playable. V1 is a guitar-only prototype focused on the interaction model, not audio realism.

The product specification lives in [`QUICKSONG_SPEC.md`](./QUICKSONG_SPEC.md).

## Run locally

```sh
npm install
npm run dev          # http://localhost:5173 — also served on your LAN (--host) for phone testing
```

To try it on an iPhone on the same Wi-Fi, open the LAN URL that Vite prints. Note: the microphone (`getUserMedia`) only works on `localhost` or HTTPS, so humming needs either the deployed HTTPS build or a tunnel.

## Build, test, lint

```sh
npm run build        # type-check + production build into dist/ (includes service worker + manifest)
npm run preview      # serve dist/ on http://localhost:4173
npm test             # unit tests (vitest) — model, voicings, renderer, pitch segmenter, undo/redo
npm run test:e2e     # Playwright flow tests in WebKit at iPhone 14 size (builds first)
npm run lint         # oxlint
npm run check        # lint + unit tests + build
```

## Install on an iPhone

The GitHub Actions workflow in `.github/workflows/deploy.yml` builds and deploys `main` to GitHub Pages at `https://promptshane.github.io/quicksong/`. (The first run needs Pages enabled for the repo with source "GitHub Actions"; the workflow attempts to enable it automatically.)

On the phone: open the URL in Safari → Share → **Add to Home Screen**. The app launches full-screen, works offline after the first load (service worker precache), and stores your song in IndexedDB on the device.

## How the PWA works

- `vite-plugin-pwa` generates `manifest.webmanifest` and a Workbox service worker that precaches the app shell. `registerType: 'autoUpdate'` picks up new deployments on the next launch.
- `index.html` carries the iOS-specific meta tags (`apple-mobile-web-app-capable`, status bar style, apple-touch-icon, `viewport-fit=cover`); CSS uses `env(safe-area-inset-*)` for the notch/home indicator and `100dvh` for the app frame.
- Audio on iOS only starts after a user gesture: `installAudioUnlockListeners` creates/resumes the `AudioContext` on the first tap and again when the app returns to the foreground.

## Architecture

```
src/
  model/      Pure data model + music theory. No audio, no DOM.
    types.ts      Song, GuitarLayer (strum | picked | single), NoteEvent, ChordEvent, Voicing
    music.ts      MIDI/name/frequency conversion, triad identification, key inference
    chords.ts     Standard guitar voicings (open + E/A-shape barre), six-string logic
    time.ts       Beats/bars, eighth-note grid, time signatures
    song.ts       Factories + immutable update helpers
  state/
    store.ts      zustand store: song + snapshot-based undo/redo history + UI state
    actions.ts    Every editing action as one undoable step (insert, chordify, mute string, ...)
    persistence.ts IndexedDB (idb-keyval) load/save with debounce
  audio/
    engine.ts     AudioContext lifecycle, iOS unlock, `Instrument` interface
    synth.ts      V1 placeholder instrument (pluck synth) + metronome click
    render.ts     Pure: Song -> ScheduledNote[] (strum stagger, pick order, layer gain)
    transport.ts  Look-ahead scheduler + playhead
  pitch/
    detector.ts   `PitchDetector` interface; MPM implementation via `pitchy`
    mic.ts        getUserMedia + AnalyserNode frame capture
    segmenter.ts  Pure: pitch frames -> DetectedNote[]; quantise to the eighth grid
    useHumming.ts Orchestrates a take (metronome from the cursor, live feedback, insert)
  ui/           React components: Home, GuitarFocus, LayerEditor + contextual panels
```

Key decisions:

- **Time is in beats.** Event `start`/`duration` are beats of the time signature's beat unit. The eighth-note grid is derived (`eighthBeats`). Changing time signature resizes per-bar patterns without moving events.
- **A chord is its six strings.** `ChordEvent.strings` (fret + muted per string) is the single source of truth; the chord's notes, label (`Am`, `D`, `A?` for custom) and picking availability are all derived. Major/Minor pick a standard voicing; user edits relabel automatically.
- **Seed notes on chord layers.** Tapping a key or humming on a chord layer creates a one-tone chord (`quality: 'note'`, shown amber). Major/Minor turns it into a chord — one undoable step, exactly as the spec's "convert note to chord".
- **Undo/redo is real.** The store keeps song snapshots (`past` / `future`). Every action in `actions.ts` is one step, including strum/pick pattern edits, string mutes, moves and deletes. UI state (cursor, selection, view) is outside history.
- **Rendering is separate from sequencing data.** `renderSong` flattens layers into notes; the transport schedules them on whatever `Instrument` the engine was created with. Replacing the synth with sampled guitar means implementing `Instrument.noteOn` — the model and UI do not change.
- **Pitch detection is swappable.** `MicCapture` → `PitchDetector` → `NoteSegmenter` → `quantizeNotes`. The segmenter and quantiser are pure and unit-tested with synthetic frames; the e2e suite fakes `getUserMedia` with an oscillator and checks real notes come out.

## Intentionally deferred (V1)

- Realistic guitar sound (sampled instrument), velocity layers, offline sample caching.
- Manual string/fret choice for single notes (the auto position is shown).
- Sixteenth-note grids, per-chord strum overrides, chord suggestions from the key.
- Drums, piano, bass, vocals editors.
- Multiple songs / song management, export.
