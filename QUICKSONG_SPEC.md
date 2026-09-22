# QuickSong — Running Product Spec

This document is the running record of product decisions for QuickSong. It should be updated as the app is defined.

## 1. Song Settings

The top section defines the shared musical settings for the entire song:

- **BPM** — song tempo.
- **Time signature** — determines the rhythmic structure / beats in each bar (for example 4/4, 3/4, 6/8).
- **Key** — defines the song's key and therefore the set of chords/notes that naturally belong to it.

All instrument layers ultimately follow these shared settings.

### Editing Metronome

Tapping **BPM** opens the Tempo sheet, which includes a **Metronome** on/off toggle. While on, the metronome clicks **only while the song is playing** — on Song Home, instrument and layer screens alike — following the playback's own beats (accenting the first beat of each bar) so it always lines up with the music. Paused means silent. A dot on the BPM chip shows the metronome is on. It never clicks on the Projects screen and is a session setting, not saved with the song.

Sending the app to the background (e.g. swiping to the iPhone Home Screen) stops playback, so nothing — music or metronome — keeps sounding.

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

Piano and Drums are now enabled as well (see **7. Piano** and **8. Drums**). Bass and vocals remain locked.

---

## 3. Guitar

Guitar layers hold one of two kinds of material (see **Chords and Notes** below):

- **Chords** — strummed or picked;
- **Notes** — single notes.

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

A hummed note becomes a single note on a **Notes** layer (guitar or piano). Chords are picked from the key's chord selector instead (see **Chords**); building chords from hummed notes is no longer part of the flow.

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

### Chords and Notes

Guitar and Piano work the same way: every layer holds either **Chords** or **Notes**, chosen when the layer is created.

- **Chords** — pick chords from the song's key, make any of them special, then decide *how* they are played.
- **Notes** — single notes (melodies, riffs), entered with the keyboard or by humming.

### Chords

The user picks chords from the key's **chord selector** — the same one Piano uses (see **7. Piano › Choosing a chord**): the key's diatonic major/minor chords as colour-coded buttons; tap to hear, **Add** to place it at the cursor. The selected or inferred song key presents the chords that naturally belong to it; the user never has to pick a root and then Major/Minor. The special-chord wheel, Change chord, velocity and length work as on Piano.

A chord can begin/change on any V1 rhythmic grid position, including eighth-note subdivisions.

**Chord voicing:**

- Each chord is a real six-string guitar voicing; V1 automatically chooses one sensible standard voicing.
- **Voicing ↕** tries the next standard voicing higher/lower on the neck (open shape, then E- and A-shape barres).
- Notes added on the special-chord wheel go on a muted string near the hand position; with all six strings in use they replace a doubled note, never one of the chord's own notes.
- Alternate/advanced voicing systems can come later. (Hand-editing individual strings is no longer part of the simplified guitar UI.)

### Playing style: together or one note at a time

Chords can be laid down first and how they are played decided afterwards. A chords layer has a **default style**, shown under the chord selector as *Playing · all chords*:

- **Strum** (guitar) / **Together** (piano) — every note at once. Guitar strums on the layer's strum pattern (below); piano strikes the keys once and holds them for the chord's sustain.
- **Pick** (guitar) / **Arpeggio** (piano) — the chord's notes one at a time.

Any single chord can **override** the layer: the selected chord's *Playing · this chord* switch offers **Layer** (use the layer's style), or its own Strum/Together or Pick/Arpeggio. Switching styles never loses chords, voicings, timing, velocity, patterns, volume or mute.

**Strumming pattern (guitar):**

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

**Picking / arpeggio pattern (guitar and piano):**

- Choose a **preset** — *Up*, *Down*, *Up & down*, *Bass + chord* — at **quarter-note** or **eighth-note** speed. Presets adapt to however many notes each chord has.
- **Customize** opens a grid: rows are the chord's notes (lowest at the bottom, labelled with the actual notes), columns are the eighth notes of the bar. Tap cells to choose exactly which note plays when; any slot can play several notes or none.
- The pattern covers one bar and repeats for as long as the chord lasts; each picked note rings until the chord ends (at most a bar).
- The layer's pattern is the default for its chords; a chord with its own style has its own pattern.
- Songs saved with the older "picked chords" (one string per beat) keep that order as a custom pattern.

### Notes

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
- Each event is drawn as a hit: a vertical strike whose height is its velocity, with a line dropping off across its duration.
- Events are colour-coded by their place in the song's key (the manual key, or Auto's assumed key): a chord by its root's scale degree, a single note by its own. The same colours are used everywhere a chord appears — Song Home, the layer pages, the editing timelines (guitar blocks filled with it, piano hits drawn in it), and subtly on the buttons that pick or change a chord (the piano chord palette, the note wheel, Guitar's Major/Minor). Rainbow order — **I red, ii orange, iii yellow, IV green, V blue, vi violet, vii pink** (minor keys likewise from i) — so the same chord is the same colour on guitar and piano and progressions can be read at a glance. Anything outside the key is neutral gray.
- A slim legend under the top bar shows the key's chords in their colours (e.g. C Dm Em F G Am Bdim).
- Empty timeline length should not accumulate automatically.
- The app should **not** append a trailing empty bar/slot just because content exists.
- Timeline bar-slots are created explicitly by the user with a compact **+ Slot** control at the end of the timeline.
- A manually created slot may intentionally remain empty; empty explicit slots are part of the song's timing and should persist.
- Existing content must never be clipped if it extends farther than the explicit slot count.
- There is no requirement to maintain a fixed four-bar minimum.

Currently:

- Drums, Guitar and Piano are enabled.
- Bass and vocals remain visible but locked/disabled.

**Bottom bar:**

- simple Play / Pause control centered at the bottom.

### Instrument Focus

Tapping an instrument should enter a focused instrument view.

When an instrument is selected (Guitar shown as the example; Piano and Drums work the same way):

- all other instrument editing UI disappears;
- the screen becomes dedicated to Guitar;
- existing guitar layers are shown;
- the user can add, edit, or delete layers.

A new Guitar or Piano layer asks the user to choose **Chords** or **Notes**; a new Drums layer opens straight away. New layers are named *Guitar Chords 1*, *Piano Notes 1*, *Drums 1*, … Each layer card summarises what it holds, e.g. *Chords · Pick · 4 chords*.

Each layer card in the Guitar and Piano overviews draws its events as hits in the same key colours as Song Home: a vertical strike whose height is the event's velocity, with a line dropping off across its duration.

Existing layers can be duplicated from their instrument's overview with a long-press. The duplicate should preserve the layer's musical content/settings, receive independent IDs, and appear immediately after the source so both layers can play simultaneously.

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

#### Loop region

Playback loops the song's **loop region**, shown as a **golden bar** in the timeline ruler (as in GarageBand). By default it covers the whole song and follows slots being added or removed.

- Tap the golden bar to select it; drag its ends to shrink/extend it, or its middle to move it. Edges snap to bars, or to beats when zoomed in far enough. **Whole song** resets it. Tap elsewhere to deselect. Unselected, a swipe over it scrolls like the rest of the timeline.
- While looping is on, the lane outside a custom region is dimmed, and Song Home / the layer pages show the region as a gold line along the top of each strip.
- The loop region is saved with the song; changing it is undoable (one drag = one step).
- **Loop on (default):** Play — in a layer editor or on Song Home — always starts at the **start of the loop region** and keeps looping it until paused.
- **Hold the golden bar** to switch looping **off**: it turns gray, the ruler reads *Loop off · Play starts at the cursor*, and Play then starts **at the cursor line**, plays through to the end of the song once, and stops. Hold it again to switch looping back on (a toast confirms either way; a hold is never taken as a tap). The on/off state is saved with the song and undoable.
- Edits, Undo and Redo made while playing are heard on the next pass without restarting; moving the region or switching looping on/off also applies live.

The ruler shows the loop's length (e.g. **⟲ 4 bars**). Because the timeline is built from whole bars, a whole-bar loop always lands back on a downbeat in any time signature — no padding is needed. What makes a loop feel even is its phrase length: 1, 2, 4, 8, 16… bars are highlighted; for the whole-song loop, any other length says how many slots would make it even (e.g. *⟲ 3 bars · +1 for an even 4*). Irregular lengths remain fully allowed; nothing is added automatically.

#### Zoom

Pinch the timeline to zoom in and out around your fingers (ctrl + scroll / trackpad pinch on desktop). Zooming in shows beat and then eighth-note grid lines and makes edits finer to aim; the grid itself stays eighth notes. The zoom level is kept while moving between layers.

Moving or resizing an event takes a deliberate selection first: tap a note/chord to select it, then drag the selected one to move it. A selected note/chord also shows **grips on its start and end**: drag the start grip to change where it begins (its end stays put), or the end grip to lengthen/shorten it. Grips snap to the eighth-note grid, never go shorter than an eighth, play the result on release, and one drag is one Undo step. Swiping across unselected events scrolls the timeline, so rewinding or fast-forwarding never moves anything by accident.

Event deletion should stay out of the persistent editing controls. Holding an existing timeline note/chord should reveal a contextual **Delete** action. A separate persistent **Done** button is unnecessary; tapping elsewhere can dismiss/change selection naturally.

Record should be **OFF by default**. The interface should make the current Record state obvious without making it visually dominant.

### Chord-Building Interaction

Guitar and Piano chords are built the same fast way:

1. Tap a chord in the key's chord selector to hear it.
2. **Add** places it at the cursor (one bar long); it is selected for shaping.
3. Optionally make it special on the note wheel, change it, or (guitar) try another voicing — each change plays immediately.
4. Adjust velocity and length/sustain.
5. **＋ Next chord** moves on to where it ends.
6. At any point, decide how the chords are played (strum/together or pick/arpeggio) for the whole layer or one chord.

Everything is undoable. The chord's notes are shown as chips (added notes highlighted), so the chord is understandable without formal notation. Humming and the keyboard enter single notes on **Notes** layers.

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

Undo/Redo history covers the whole project, so the **Undo / Redo** controls appear on every screen inside a project (Song Home, instrument pages and layer editors), and each press briefly says what it changed (e.g. *Undo: Tempo 100 → 104*, *Undo: Delete Am · Piano 1*) — a change made on another screen is never invisible. Only real changes are recorded: an edit that changes nothing (moving a note to where it already is, + at the tempo limit) adds no step. One continuous adjustment is one step: a slider drag, or all tempo changes made in one visit to the Tempo sheet. If Undo removes the layer currently open (undoing its creation), the app returns to that instrument's page, where Redo brings it back.

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

**+ Layer** asks **Chords** or **Notes** (see **3. Guitar › Chords and Notes**) and opens the new layer. A Notes layer works like a guitar Notes layer — keyboard, humming, Record — without the string/fret information. The Piano overview otherwise behaves like Guitar's: open, mute, delete, and hold a layer to duplicate it. Multiple piano layers play simultaneously, alongside guitar, on Song Home, in project previews and during playback.

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

On the timeline each piano hit is drawn as what it is: horizontal position = timing, a vertical **strike** whose height is the velocity, and a line ramping down to the right across the **sustain**. As on Guitar, a selected hit can be dragged to move it, swiping over unselected hits scrolls the timeline, and holding a hit deletes it.

Every piano edit — adding, changing, wheel notes, velocity, sustain, moving, deleting — is undoable with Undo/Redo.

### Playing style

Piano chords play **Together** (struck once, held for the sustain) or as an **Arpeggio**, for the whole layer or per chord, with the presets and grid described in **3. Guitar › Playing style**.

### Deferred

Intentionally not part of this version:

- tapping in real time to place the next chord, or cycling through a chord sequence while tapping;
- repeated block-chord rhythms, sixteenth notes, advanced quantization, humanization;
- inversion/voicing controls for piano chords;
- realistic piano samples (Piano currently uses the shared V1 synth, struck rather than strummed).

---

## 8. Drums

Drums are a **kick**, **snare** and **hi-hat**, written one hit at a time.

- **+ Layer** on the Drums page creates a drum layer (*Drums 1*, …) and opens it; several drum layers can play together.
- The editor's timeline is a grid: one row per drum (Hi-hat, Snare, Kick — names stay on the left while the grid scrolls) and one square per **eighth note** across the whole song. **Tap a square** to add a hit there; **tap it again** to remove it. Swiping scrolls without toggling anything.
- **Hold a hit** to set its velocity (how hard it is played; shown as the square's brightness) or delete it.
- The pads below the grid (Hi-hat / Snare / Kick) only play the sound, so each drum can be heard before placing it.
- The drum timeline has the same ruler, golden loop region, zoom, cursor and playhead as the other editors; Play follows the same loop rules. Every edit is undoable.
- Drums have no pitch, so they never affect the key or its colours; on Song Home and the Drums page they are drawn as gray hits.
- V1 sounds are synthesised (no samples): a pitch-dropping kick, a noise-and-tone snare and a short, bright hi-hat.

Deferred: more kit pieces (toms, crash/ride, open hi-hat), sixteenth-note hats, beat presets/fills, swing.

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
