# QuickSong — Running Product Spec

This document is the running record of product decisions for QuickSong. It should be updated as the app is defined.

## 1. Song Settings

The top section defines the shared musical settings for the entire song:

- **BPM** — song tempo.
- **Time signature** — determines the rhythmic structure / beats in each bar (for example 4/4, 3/4, 6/8).
- **Key** — defines the song's key and therefore the set of chords/notes that naturally belong to it.

All instrument layers ultimately follow these shared settings.

The key may be selected manually, but QuickSong should also be able to infer likely keys progressively from the notes/chords the user creates. A single hummed note is not enough to uniquely determine a key, so confidence should increase as more musical information is added.

For the first UI, **Key can default to Auto** and become more confident as the user adds material. The user can override it manually at any time.

## 2. Instruments

QuickSong will initially support five core instruments:

1. Drums
2. Guitar
3. Piano
4. Bass
5. Vocals

Each instrument will have its own UI and musical logic because each instrument is played differently. They will be designed one at a time, while remaining synchronized to the song's BPM, time signature, and key.

An instrument can contain multiple independent tracks/layers so different parts can play simultaneously or enter/leave at different points in the song.

### Initial Build Strategy

V1 development should begin with:

- Song settings at the top: BPM, time signature, and key.
- Guitar enabled as the first fully developed instrument.
- Drums, piano, bass, and vocals visible but locked/disabled initially.

The guitar workflow and UI should be tested and refined before expanding the same underlying concepts to the other instruments. Guitar is intentionally the first instrument because its interaction model is comparatively complex and will establish useful patterns for the rest of the app.

---

## 3. Guitar

Guitar has two primary playing types:

- **Type 1 — Chords**
- **Type 2 — Single Notes**

Unless otherwise specified, rules described for "chords" apply to both Type 1A and Type 1B.

### Shared Guitar Controls

Both chords and single notes should support:

- **Velocity** — represents how hard the note/chord is played. Velocity can affect both loudness and tone, making it more musically realistic than simply changing track volume.
- **Duration** — controls how long the note/chord is allowed to ring before being stopped.

Track-level volume should remain separate from note/chord velocity.

### Humming / Pitch Input

QuickSong should support using the user's voice as a fast musical input method.

When the user hums or sings, V1 should attempt to capture:

1. **Pitch**
2. **Likely octave**
3. **Rhythm / onset timing**
4. **Duration**

The detected performance should be snapped into editable musical events rather than treated as raw recorded audio.

After capture, the user should be able to:

- hear the detected result immediately;
- move a note up or down in pitch/octave;
- adjust timing or duration if detection was imperfect;
- undo or redo edits.

A hummed note can then be used as:

- a Type 2 single note;
- the starting/root note for a chord;
- one note in a chord the user builds manually by humming additional notes.

For fast chord creation, the user should be able to hum a note and then choose a simple chord interpretation such as **Major** or **Minor**. The user may instead build the chord note-by-note when the desired harmony is more specific.

As notes and chords accumulate, QuickSong can progressively infer likely song keys and use that information to prioritize sensible next notes/chords.

### Manual Note Input

If the user does not want to hum:

- provide a compact one-octave piano keyboard;
- default around a useful middle register, approximately **C3–C4**;
- include black keys;
- provide simple octave up/down controls;
- selecting a note inserts it into the current layer at the current position.

The exact default octave can be refined during UI testing.

### Type 1 — Chords

The user selects chords to play. The selected or inferred song key helps present the chords that naturally belong to that key, but the user ultimately chooses the chord.

A chord can begin/change on any V1 rhythmic grid position, including eighth-note subdivisions.

Type 1 has two subtypes:

#### Type 1A — Full Chord / Strum

The chord is played/strummed as a full guitar chord.

**Chord voicing:**

- V1 automatically chooses one sensible standard guitar voicing for each chord.
- The user can easily test moving the chord/voicing higher or lower when desired.
- Alternate/advanced voicing systems can come later.

**String behavior:**

- Strings that are normally muted for the selected chord/voicing are automatically muted.
- The user can manually override the default:
  - unmute a normally muted string;
  - mute a string that would normally be played.

This allows intentional unusual or imperfect voicings without making the default behavior complicated.

**Strumming pattern:**

Strumming rhythm is separate from the time signature.

For V1, use an **eighth-note subdivision grid**. Each available slot can contain:

- **↓** down-strum
- **↑** up-strum
- **—** no strum

Example in 4/4:

`1  &  2  &  3  &  4  &`

This creates eight available strum positions in the bar while keeping the system visually simple.

For 6/8, the six eighth-note positions should naturally read as:

`1  2  3  |  4  5  6`

The user should be able to define a strumming pattern visually rather than needing to know formal rhythmic notation.

More detailed subdivisions such as sixteenth notes are intentionally excluded from V1.

#### Type 1B — Picked Chord

The same chord/voicing system is used, but the chord is played one string at a time instead of as a full strum.

**String behavior:**

- Uses the same automatic chord-specific muted strings as Type 1A.
- The user can manually override which strings are muted or enabled.

**Picking pattern:**

- The user chooses the order in which the available guitar strings are picked.
- For V1, keep the rhythm simple: **one pick per beat**. No complex subdivisions or advanced picking rhythms yet.
- The time signature determines how many beat/pick positions exist within a bar.
- When a picking pattern is created for one chord, that pattern becomes the default for the other chords in that guitar part.
- Any individual chord can then override the default and use its own picking pattern.

### Type 2 — Single Notes

The guitar can play individual notes rather than chord shapes.

For V1:

- Notes use the shared velocity and duration controls.
- A note can be entered manually or detected from humming/singing.
- Pitch detection includes the likely octave.
- Because the same pitch can often be played at multiple places on a guitar neck, QuickSong automatically chooses a sensible string/fret position.
- The user can manually move the note to another valid string/fret position if desired.
- The user can easily move the note higher or lower in pitch/octave.

---

## 4. V1 Mobile UI

QuickSong is primarily designed around an iPhone-sized screen. The interface should stay sparse and contextual.

### Home Screen

The home screen shows the full song at a high level.

**Top bar:**

- **BPM** — upper left
- **Time Signature** — centered
- **Key** — upper right

These controls should be compact and visually out of the way.

**Main area:**

Five vertically stacked instrument rows:

- Drums
- Guitar
- Piano
- Bass
- Vocals

Use small square instrument icons on the far left rather than large text labels.

Each instrument row represents its place in the song timeline.

- If an instrument has no layers, its row appears empty/grayed.
- If it has one layer, that layer fills the available row area.
- If it has multiple layers, the row visually divides to show them.
- Clips/events should appear at their actual positions across the song timeline.

For the first build:

- Guitar is enabled.
- Other instruments remain visible but locked/disabled.

**Bottom bar:**

- simple Play / Pause control centered at the bottom.

### Instrument Focus

Tapping an instrument should enter a focused instrument view.

When Guitar is selected:

- all other instrument editing UI disappears;
- the screen becomes dedicated to Guitar;
- existing guitar layers are shown;
- the user can add, edit, or delete layers.

A new guitar layer asks the user to choose:

- **Type 1A — Full Chord / Strum**
- **Type 1B — Picked Chord**
- **Type 2 — Single Notes**

### Layer Focus

Once a layer is selected, the app should focus only on the controls relevant to that layer.

Do not show chord controls, picking controls, strumming controls, and single-note controls all at once.

The timeline should remain understandable, but controls should change contextually based on the active layer.

Persistent layer-editing actions should include:

- **Undo**
- **Redo**
- **Play / Pause**
- **Record / Hum input**
- **Manual note input**

### Chord-Building Interaction

A basic chord-building flow should feel fast:

1. Hum or manually enter a note.
2. QuickSong detects/inserts the note and octave.
3. User can choose **Major** or **Minor** to build a basic chord around it.
4. The resulting chord plays immediately.
5. The user can:
   - accept it;
   - undo it;
   - redo it;
   - move individual chord tones;
   - add another hummed/manual note;
   - remove chord tones.

The visual editor should make the individual notes inside the chord understandable without requiring formal music notation.

---

## 5. Audio / Playback Architecture

QuickSong will run as a mobile web app / home-screen app on iPhone.

The app does **not** need to stream audio continuously from GitHub.

Recommended V1 approach:

- use the browser's **Web Audio API** for playback;
- bundle instrument audio assets with the app;
- begin with **sample-based guitar sounds** rather than attempting to synthesize a realistic guitar from scratch;
- use different samples/velocity layers only where they materially improve realism;
- use the microphone for humming/pitch/rhythm/duration capture;
- cache the core app and audio assets so the installed home-screen app can work offline after initial load.

GitHub is the source repository and deployment source; playback occurs locally on the phone after the relevant assets are loaded.

For V1, audio quality only needs to be convincing enough that the user clearly perceives the intended guitar performance and can judge the musical idea. It does not need to sound like a final studio recording.

---

## Current Design Principle

QuickSong is intended to make it extremely fast to turn a song heard in the user's head into something playable.

The interface should prefer:

- visual musical controls over formal notation;
- sensible defaults over configuration;
- fast experimentation over technical precision;
- progressive complexity, where deeper controls appear only when needed;
- one focused task/view at a time on mobile.

V1 should feel substantially simpler than a DAW while still providing enough musical control to capture the song the user is hearing.
