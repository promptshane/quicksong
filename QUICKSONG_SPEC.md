# QuickSong — Running Product Spec

This document is the running record of product decisions for QuickSong. It should be updated as the app is defined.

## 1. Song Settings

The top section defines the shared musical settings for the entire song:

- **BPM** — song tempo.
- **Time signature** — determines the rhythmic structure / beats in each bar (for example 4/4, 3/4, 6/8).
- **Key** — defines the song's key and therefore the set of chords/notes that naturally belong to it.

All instrument layers ultimately follow these shared settings.

The key may be selected manually, but QuickSong should also be able to infer likely keys progressively from the notes/chords the user creates. A single hummed note is not enough to uniquely determine a key, so confidence should increase as more musical information is added.

For the first UI, **Key can default to Auto** and become more confident as the user adds committed musical material. The user can override it manually at any time.

### Possible-Key Guidance

QuickSong should use committed notes/chords to maintain a set of still-plausible major/minor keys.

On the manual keyboard:

- notes that belong to at least one still-plausible key remain visually normal;
- notes that belong to **none** of the still-plausible keys are visually grayed out as a soft warning;
- grayed-out notes remain fully playable and recordable;
- previewed notes and live humming while Record is off do **not** affect key inference.

The purpose is guidance, not restriction: “this note is probably outside the song’s current tonal possibilities,” not “you cannot play this note.”

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

Piano is now enabled as the second instrument (see **7. Piano**). Drums, bass, and vocals remain locked.

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

The detected performance should be interpreted as musical information rather than treated as raw recorded audio.

### Preview vs Record

Layer input has a single **Record** mode, which defaults to **OFF**.

When Record is **OFF**:

- humming/singing is detection-only;
- the currently detected note lights the corresponding keyboard key **red** in real time;
- humming does not create timeline events;
- humming does not automatically play the detected synth note back, avoiding microphone/audio feedback;
- the user can then tap the highlighted keyboard key to hear that pitch;
- tapping keyboard keys auditions them only and does not add them to the layer.

When Record is **ON**:

- humming/singing creates editable musical events from detected pitch, octave, rhythm/onset, and duration;
- tapping a keyboard key creates an event at the current timeline position.

This separation between **exploring/hearing** and **committing/recording** is a core interaction rule.

After a recorded capture, the user should be able to:

- hear the committed result;
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
- while Record is OFF, tapping a key auditions the note only;
- while Record is ON, tapping a key auditions it and records/inserts it at the current position;
- when live humming detects a pitch with Record OFF, the matching key lights red.

The exact default octave can be refined during UI testing.

Dragging a keyboard note directly into the timeline is a possible future interaction, but is intentionally deferred until the Record workflow has been tested; it may be unnecessary if Record mode is sufficiently intuitive.

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
- Empty timeline length should not accumulate automatically.
- The app should **not** append a trailing empty bar/slot just because content exists.
- Timeline bar-slots are created explicitly by the user with a compact **+ Slot** control at the end of the timeline.
- A manually created slot may intentionally remain empty; empty explicit slots are part of the song's timing and should persist.
- Existing content must never be clipped if it extends farther than the explicit slot count.
- There is no requirement to maintain a fixed four-bar minimum.

Currently:

- Guitar and Piano are enabled.
- Drums, bass, and vocals remain visible but locked/disabled.

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

Existing guitar layers can be duplicated from the Guitar overview with a long-press. The duplicate should preserve the layer's musical content/settings, receive independent IDs, and appear immediately after the source so both layers can play simultaneously.

For chord layers, the layer title in Layer Focus is interactive. The user can switch an existing layer between **Strummed Chords** and **Picked Chords** without recreating or losing its chord events, voicings, positions, durations, velocities, volume, or mute state.

### Layer Focus

Once a layer is selected, the app should focus only on the controls relevant to that layer.

Do not show chord controls, picking controls, strumming controls, and single-note controls all at once.

The timeline should remain understandable, but controls should change contextually based on the active layer.

Persistent layer-editing actions should include:

- **Undo**
- **Redo**
- **Play / Pause**
- **Record** toggle/state
- **Hum input**
- **Manual note input**

Event deletion should stay out of the persistent editing controls. Holding an existing timeline note/chord should reveal a contextual **Delete** action. A separate persistent **Done** button is unnecessary; tapping elsewhere can dismiss/change selection naturally.

Record should be **OFF by default**. The interface should make the current Record state obvious without making it visually dominant.

### Chord-Building Interaction

A basic chord-building flow should feel fast:

1. Preview a pitch by humming it or tapping the keyboard.
2. When ready, enable Record and commit the desired note, or otherwise explicitly record it into the layer.
3. QuickSong inserts the committed note and octave.
4. User can choose **Major** or **Minor** to build a basic chord around it.
5. The resulting chord plays immediately.
6. The user can:
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

## 6. Projects

QuickSong stores multiple saved projects. A project is a named song with its own settings, layers and events.

### Projects Homepage

On launch the app **always opens to the Projects screen**. It never jumps straight into the last-edited song.

The Projects screen shows:

- the app title;
- every saved project as a simple rounded card showing only the **project name**;
- a clear **+ New Project** action.

Interaction:

- **tap** a project → open it (Song Home);
- each project card has a compact **Play / Stop** control on the far right that previews the saved song directly from Projects without opening it;
- project preview loops continuously until stopped;
- a circular progress indicator around the preview control shows the remaining time in the current loop and resets each time the loop restarts;
- starting another project preview stops the previous one;
- **hold / long-press** a project → contextual actions: **Rename**, **Duplicate**, **Delete**. Once the menu appears, releasing the finger must not open the project. The preview control must not trigger the hold/open gesture. This is the same hold gesture used for timeline event deletion and guitar layer duplication.

Navigation flow:

```
Projects → (tap project) → Song Home → Guitar → Layer
```

Song Home shows the project name and a **‹ Projects** back control. Returning to Projects persists the current project first.

### New Project

**+ New Project** creates a fresh song with the default settings (`createSong()`), names it **Untitled Project** — or **Untitled Project 2**, **Untitled Project 3**, … when that name is taken — and opens it immediately.

A completely untouched default project carries no user information and should not remain in the project library. If the user backs out of a newly created Untitled Project without changing any song setting, layer, event, or timeline slot, it is discarded. If the app is closed before the user backs out, abandoned pristine Untitled projects are pruned on the next launch. Any real song change makes the project persistent.

### Rename

Rename uses a small sheet consistent with the rest of the app. The name is trimmed; blank names are rejected. Renaming never changes the project's ID or song data. Duplicate names are allowed; names are labels, not identifiers.

### Duplicate

Duplicate creates a completely independent project: a new ID and a deep copy of the song, sharing no mutable data with the source. It is named **Song Name Copy**, then **Song Name Copy 2**, … The app stays on the Projects screen after duplicating.

### Delete

Delete asks for confirmation. Afterwards the project is removed from storage and from the list. If the deleted project was somehow open, the app returns safely to Projects.

### Persistence and Autosave

Each project is stored as its own record (stable ID, name, song, created/updated timestamps) alongside a lightweight index used to list projects without loading songs. Project names are never used as IDs.

Projects **autosave continuously** while being edited. Autosave is persistence only:

- it never clears or trims the undo stack;
- it never clears redo history;
- it never creates undo entries;
- an edit remains undoable even after it has been persisted.

Example: the user deletes a chord → autosave persists that state → the user presses Undo → the chord comes back normally → the restored state autosaves in turn. Undo/Redo is an in-memory editing history for the currently open project and is independent of persistence timing.

### Switching Projects

When switching projects the app saves the current project, loads the selected one, and resets project-specific transient state: selection, cursor, current editor view and Record state. Undo/Redo history is per editing session and is reset when a project is opened; history is never carried from one project into another and is not persisted.

Pending debounced saves are bound to the project ID and song snapshot they were scheduled for, and are flushed when switching, so a delayed save can never write one project's song into another.

### Legacy Migration

Earlier versions saved a single song under one storage key. On first launch after the update that song is migrated, unchanged, into a project named **Untitled Project**. The migration is idempotent: the migrated project uses a fixed ID and the legacy key is removed after a successful migration, so relaunching never creates duplicates. With no legacy song, Projects starts empty.

---

## 7. Piano

Piano separates two decisions:

- **Sound** — what is played: a standard chord from the song's key, optionally made special with extra notes.
- **Rhythm** — when and how it is played: timing, velocity and sustain.

This first version deliberately keeps rhythm simple (see *Deferred* below).

### Navigation

```
Projects → Song Home → Piano → Piano Layer
```

Piano has one kind of layer, so **+ Layer** creates a layer (*Piano 1*, *Piano 2*, …) and opens it immediately. The Piano overview otherwise behaves like Guitar's: open, mute, delete, and hold a layer to duplicate it. Multiple piano layers play simultaneously, alongside guitar, on Song Home, in project previews and during playback.

### Piano chords are notes, not voicings

A piano chord is stored as the **actual keys pressed** (MIDI notes), never as a guitar string/fret shape. Each piano hit records:

- the **root** and **major/minor quality** of the standard chord it was picked as;
- the **sounding notes**;
- **start**, **velocity** and **duration** (the sustain).

Example: D major = D F# A; D major plus C# = D F# A C#. Standard chords are voiced in root position around middle C (root between F3 and E4). Because a chord is a note list, inversions/voicings and single piano notes can be added later without changing the model. Songs saved before Piano existed load with an empty piano section.

### Choosing a chord

A new or empty selection shows **Chords in _key_**: the six diatonic major/minor chords of the song's key, in scale order (e.g. C major → C Dm Em F G Am). The diminished chord is left out for now. The user never picks a root and then Major/Minor — they tap the chord itself.

- **Manual key** → that key's chords.
- **Auto** → the currently assumed key (an Auto preference, or inference from committed material). Piano chords count as committed material for key inference and the Circle of Fifths.
- **Auto with nothing committed** → C major, or A minor when the Major/Minor toggle says minor, labelled as a starting guess.

Tapping a chord **previews** it (all notes struck together) and arms it; it does not change the song. **Add _chord_ at _position_** commits it at the cursor as a one-bar hit. A hit still ringing at that point is lifted there. The new hit is selected for shaping.

**＋ Next chord** moves the cursor to where the selected hit ends and returns to the palette. If the hit already reaches the end of the song, this adds one timeline slot — the user is explicitly asking for room — rather than any automatic trailing bar.

**Change chord** swaps the selected hit to another chord from the palette, keeping its timing, velocity and sustain.

### Special-chord wheel

**✦ Special chord** opens a wheel with the chord in the centre and the twelve notes around it, starting from the chord's root at the top and rising clockwise (so a chord's shape looks the same in every key):

- the chord's own notes are solid and fixed;
- notes in the song's key are bright — the natural choices;
- notes outside the key are quieter but still fully available;
- notes the user added are highlighted and a line joins every sounding note.

Tapping a note adds it on top of the chord and immediately plays the result; tapping an added note removes it. **Back to plain _chord_** removes all added notes. The chord's name is shown when it can be named confidently (Dmaj7, Am7, Cadd9, C9, …); otherwise it reads as the chord plus its extra notes (e.g. *C + F#*). Knowing chord names is never required.

### Velocity and sustain

The selected hit has two sliders:

- **Velocity** — how hard the keys are struck (soft / medium / hard). Separate from layer volume.
- **Sustain** — how long the keys are held, in eighth-note steps (up to two bars).

Releasing a slider plays the hit so the change can be heard. One continuous drag is one Undo step.

On the timeline each piano hit is drawn as what it is: horizontal position = timing, a vertical **strike** whose height is the velocity, and a line ramping down to the right across the **sustain**. Hits can be moved by dragging and deleted by holding, as on Guitar.

Every piano edit — adding, changing, wheel notes, velocity, sustain, moving, deleting — is undoable with Undo/Redo.

### Deferred

Intentionally not part of this version:

- tapping in real time to place the next chord, or cycling through a chord sequence while tapping;
- repeated/intra-chord hits, strumming-style patterns, sixteenth notes, advanced quantization, humanization;
- inversions/voicing controls and single-note piano composition;
- humming or keyboard input on piano layers;
- realistic piano samples (Piano currently uses the shared V1 synth, struck rather than strummed).

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
