# QuickSong — Running Product Spec

This document is the running record of product decisions for QuickSong. It should be updated as the app is defined.

## 1. Song Settings

The top section defines the shared musical settings for the entire song:

- **BPM** — song tempo.
- **Time signature** — determines the rhythmic structure / beats in each bar (for example 4/4, 3/4, 6/8).
- **Key** — defines the song's key and therefore the set of chords/notes that naturally belong to it.

All instrument layers ultimately follow these shared settings.

## 2. Instruments

QuickSong will initially support five core instruments:

1. Drums
2. Guitar
3. Piano
4. Bass
5. Vocals

Each instrument will have its own UI and musical logic because each instrument is played differently. They will be designed one at a time, while remaining synchronized to the song's BPM, time signature, and key.

An instrument can contain multiple independent tracks/layers so different parts can play simultaneously or enter/leave at different points in the song.

---

## 3. Guitar

Guitar has two primary playing types.

### Type 1 — Chords

The user selects chords to play. The selected song key helps present the chords that naturally belong to that key, but the user ultimately chooses the chord.

Type 1 has two subtypes:

#### Type 1A — Full Chord

The chord is played/strummed as a full guitar chord.

**String behavior:**

- Each chord uses a normal guitar voicing by default.
- Strings that are normally muted for that chord are automatically muted.
- The user can manually override the default:
  - unmute a normally muted string;
  - mute a string that would normally be played.

This allows intentional unusual or imperfect voicings without making the default behavior complicated.

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

The guitar can also play individual notes rather than chord shapes.

Detailed Type 2 behavior has not yet been defined.

---

## Current Design Principle

QuickSong is intended to make it extremely fast to turn a song heard in the user's head into something playable. V1 should favor simple musical choices and useful defaults over detailed simulation or professional-DAW complexity.
