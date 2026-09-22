# QuickSong — Suggestions Backlog

Ideas and open questions noticed while building, parked here to revisit. Nothing in this file is decided product behaviour — `QUICKSONG_SPEC.md` is the source of truth for that. Remove an item once it is decided (built, or rejected).

## Open questions

- **Should opening a layer start its cursor at bar 1?** The cursor is shared across all layers, so a new layer's first notes land wherever the cursor was left in another layer (e.g. fresh guitar notes starting at bar 5 after writing four bars of piano). Resetting the cursor to the start (or to the loop region's start) when a layer opens is probably what users expect.

## Suggestions

### Editing
- **Metronome toggle inside the layer editors.** The toggle lives only in the Tempo sheet on Song Home, so turning the click off while editing means backing out. A small metronome button in the editor header or bottom bar would fix that.
- **Guitar editing timeline could use the strike-and-dropoff drawing.** Guitar blocks are now key-coloured, but still drawn as labelled bars, while Piano's editor, the layer pages and Song Home all draw hits (strike height = velocity, dropoff = duration).

### Colour
- **Colours can shift while the key is on Auto.** Colours follow the key Auto currently assumes, so adding material can re-read the song in another key and recolour everything (e.g. a piano Am plus a guitar A re-read as F major turns A from violet to yellow). Options: suggest locking the key once a progression is established, or hold the colouring key steady until the user confirms a new one.
- **Alternative colouring by harmonic function** instead of by scale degree: calm colours for home chords (I, iii, vi), warm for chords that move away (ii, IV), hot for chords that pull back home (V, vii). Shows tension and release better, at the cost of I and vi looking alike.
- **Minor-key colouring nuance.** In a minor key, degrees count from the minor tonic, so relative-major chords take different colours than they would in the major key (in A minor, C is III = yellow, not red). Correct, but possibly surprising.

### Visual polish
- **Slider track contrast.** Range-slider tracks are dark-on-dark and hard to see.

### iOS
- **Top-edge blur on the installed iPhone app (low priority).** A soft blur over the top of the UI; no app CSS causes it, most likely iOS 26's status-bar scroll-edge effect. A solid fixed strip behind the status bar did not change it. Untried fallback: `apple-mobile-web-app-status-bar-style` = `black` (stops content running under the status bar; may need the app re-added to the Home Screen).

### Music theory display
- **Flat keys are spelled with sharps.** Note and chord names always use sharps, so F major's IV chord shows as **A#** instead of **B♭** (same for E♭, A♭, D♭ keys). Spelling names from the key would read more naturally.
- **Key inference is duration-weighted, so shortening a chord can re-key an Auto song.** Trimming a C chord's sustain made Auto re-read C–Am–F as F major, recolouring everything. Worth considering whether sustain should count toward key inference at all (vs. the chord's presence), or whether Auto should be "stickier".
- **Borrowed chords can't be picked directly.** The chord palette offers only the key's own chords, so a common borrowed chord (e.g. F or B♭ in G major, the ♭VII / IV of the parallel minor) can only be reached by changing the key or adding notes on the wheel. An "other chords" row (secondary colour) under the palette would keep the default simple while allowing it.

### Chords, notes and drums
- **Hum a chord root.** Chords now come only from the key's chord selector; humming/keyboard feed Notes layers. A "hum to find the chord" shortcut (hum a note → the palette highlights the chords containing it) would bring humming back to chord writing without the old seed-note flow.
- **Drum beat presets / fills.** Drums are written hit by hit; a few one-tap starting beats (rock, half-time, four-on-the-floor) that fill the grid for the loop region would speed things up without taking away hit-level control.
- **Guitar picked notes ring to the chord's end** (at most a bar). A "let ring / stop at next note" choice would make picking sound tighter.
