import { expect, test, type Page } from '@playwright/test';

const consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0;
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  await page.goto('/');
  await expect(page.locator('.app[data-hydrated="true"]')).toBeVisible();
  await page.getByTestId('new-project').click();
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
});

test.afterEach(() => {
  expect(consoleErrors, 'no console errors').toEqual([]);
});

async function openNewPianoLayer(page: Page) {
  await page.getByRole('button', { name: 'Piano' }).click();
  await expect(page.locator('[data-screen="piano"]')).toBeVisible();
  // Piano has one kind of layer, so + Layer opens it straight away.
  await page.getByTestId('add-layer').click();
  await expect(page.locator('[data-screen="pianoLayer"]')).toBeVisible();
}

async function addChord(page: Page, name: string) {
  await page.locator(`.palette-chord[data-chord="${name}"]`).click();
  await page.getByTestId('add-piano-chord').click();
  await expect(page.getByTestId('piano-chord-name')).toHaveText(name);
}

test('piano: pick chords from the key, add a special note, shape the feel', async ({ page }) => {
  await openNewPianoLayer(page);

  // Auto with nothing committed: the chords of C major, diminished left out.
  await expect(page.getByTestId('palette-key')).toHaveText('Chords in C major');
  await expect(page.locator('.palette-chord')).toHaveText(['C', 'Dm', 'Em', 'F', 'G', 'Am']);

  // Tapping a chord only previews it; nothing is added until Add.
  await page.locator('.palette-chord[data-chord="G"]').click();
  await expect(page.getByTestId('add-piano-chord')).toHaveText('Add G at 1.1');
  await expect(page.locator('.block.piano')).toHaveCount(0);
  await page.getByTestId('add-piano-chord').click();
  await expect(page.locator('.block.piano')).toHaveCount(1);
  await expect(page.getByTestId('piano-notes')).toHaveText(/G3\s*B3\s*D4/);

  // Next chord makes room after it and returns to the palette.
  await page.getByTestId('next-piano-chord').click();
  await expect(page.locator('.ruler .bar-label')).toHaveCount(2);
  await addChord(page, 'C');
  await expect(page.locator('.block.piano')).toHaveCount(2);

  // Special-chord wheel: C major surrounded by the other notes.
  await page.getByTestId('open-note-wheel').click();
  const wheel = page.getByTestId('note-wheel');
  await expect(wheel.locator('[data-state="chord"]')).toHaveCount(3);
  await expect(wheel.locator('[data-state="key"]')).toHaveCount(4); // D F A B
  await expect(wheel.locator('[data-state="outside"]')).toHaveCount(5);
  await wheel.getByRole('button', { name: 'Add B' }).click();
  await expect(page.getByTestId('wheel-chord-name')).toHaveText('Cmaj7');
  // Out-of-key notes are secondary but never blocked.
  await wheel.getByRole('button', { name: 'Add F#' }).click();
  await expect(page.getByTestId('wheel-chord-name')).toHaveText('C + B F#');
  await wheel.getByRole('button', { name: 'Remove F#' }).click();
  await expect(page.getByTestId('wheel-chord-name')).toHaveText('Cmaj7');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('piano-chord-name')).toHaveText('Cmaj7');
  await expect(page.locator('.block.piano').nth(1)).toHaveAttribute('aria-label', 'Cmaj7');

  // Velocity and sustain.
  await page.getByTestId('piano-velocity').fill('35');
  await expect(page.getByTestId('piano-velocity-value')).toHaveText('soft · 35');
  await page.getByTestId('piano-sustain').fill('2');
  await expect(page.getByTestId('piano-sustain-value')).toHaveText('2 beats');
  const strike = page.locator('.block.piano').nth(1).locator('.hit-strike');
  await expect(strike).toHaveAttribute('style', /height: 35%/);

  // Undo walks the edits back one step at a time.
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('piano-sustain-value')).toHaveText('1 bar');
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('piano-velocity-value')).toHaveText('hard · 80');
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('piano-chord-name')).toHaveText('C + B F#');
  await page.getByTestId('redo').click();
  await expect(page.getByTestId('piano-chord-name')).toHaveText('Cmaj7');

  // Home shows the piano row with both hits; guitar is untouched.
  await page.getByRole('button', { name: 'Back to piano' }).click();
  await expect(page.locator('.layer-card')).toHaveCount(1);
  await expect(page.locator('.layer-card small')).toHaveText('2 chords');
  await page.getByRole('button', { name: 'Back to song' }).click();
  await expect(page.locator('[data-instrument="piano"] .overview .clip.piano')).toHaveCount(2);
  await expect(page.locator('[data-instrument="guitar"] .row-empty')).toHaveText('Tap to add guitar');

  // Everything survives a reload.
  await page.waitForTimeout(500); // debounced save
  await page.reload();
  await expect(page.locator('.app[data-hydrated="true"]')).toBeVisible();
  await page.locator('[data-project-card]').click();
  await expect(page.locator('[data-instrument="piano"] .overview .clip.piano')).toHaveCount(2);
  // Auto now reads the key from the committed chords: G B D + C E G B fit G major.
  await page.getByRole('button', { name: 'Piano' }).click();
  await page.getByTestId('open-layer').click();
  await expect(page.getByTestId('palette-key')).toHaveText('Chords in G major');
  await page.locator('.block.piano').nth(1).click();
  await expect(page.getByTestId('piano-chord-name')).toHaveText('Cmaj7');
  await expect(page.getByTestId('piano-velocity-value')).toHaveText('hard · 80');
});

test('piano: a manual key sets the palette; change chord swaps it in place', async ({ page }) => {
  await page.getByRole('button', { name: 'Key' }).click();
  await page.getByTestId('key-lock').click();
  await page.getByRole('button', { name: 'Minor', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  await openNewPianoLayer(page);
  await expect(page.getByTestId('palette-key')).toHaveText('Chords in A minor');
  await expect(page.locator('.palette-chord')).toHaveText(['Am', 'C', 'Dm', 'Em', 'F', 'G']);

  await addChord(page, 'Am');
  await page.getByTestId('change-piano-chord').click();
  await page.locator('[data-testid="piano-chord-panel"] .palette-chord[data-chord="F"]').click();
  await expect(page.getByTestId('piano-chord-name')).toHaveText('F');
  await expect(page.locator('.block.piano')).toHaveCount(1);
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('piano-chord-name')).toHaveText('Am');

  // Hold to delete works on piano hits too.
  const block = page.locator('.block.piano');
  const box = (await block.boundingBox())!;
  const point = { pointerId: 1, pointerType: 'touch', clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  await block.dispatchEvent('pointerdown', point);
  await page.waitForTimeout(650);
  await block.dispatchEvent('pointerup', point);
  await page.getByTestId('context-delete-event').click();
  await expect(page.locator('.block.piano')).toHaveCount(0);
});

test('timeline: swiping over an unselected hit scrolls; only the selected hit drags', async ({ page }) => {
  await openNewPianoLayer(page);
  await addChord(page, 'C');
  // Tap empty lane space to deselect.
  await page.locator('.timeline-inner').click({ position: { x: 300, y: 60 } });
  const block = page.locator('.block.piano');
  await expect(block).not.toHaveClass(/selected/);

  const drag = async (dx: number) => {
    const box = (await block.boundingBox())!;
    const from = { pointerId: 1, pointerType: 'touch', clientX: box.x + 20, clientY: box.y + box.height / 2 };
    const to = { ...from, clientX: from.clientX + dx };
    await block.dispatchEvent('pointerdown', from);
    await block.dispatchEvent('pointermove', { ...from, clientX: from.clientX + dx / 2 });
    await block.dispatchEvent('pointermove', to);
    await block.dispatchEvent('pointerup', to);
  };

  // Unselected: the swipe neither moves nor selects it, and it scrolls natively.
  await expect(block).toHaveCSS('touch-action', 'pan-x');
  await drag(112);
  await expect(block).toHaveCSS('left', '0px');
  await expect(block).not.toHaveClass(/selected/);

  // Tap to select, then the same drag moves it by two beats.
  await block.click();
  await expect(block).toHaveClass(/selected/);
  await expect(block).toHaveCSS('touch-action', 'none');
  await drag(112);
  await expect(block).toHaveCSS('left', '112px');
  await page.getByTestId('undo').click();
  await expect(block).toHaveCSS('left', '0px');
});

test('layer pages draw each hit: strike height = velocity, dropoff = duration', async ({ page }) => {
  await openNewPianoLayer(page);
  await addChord(page, 'C');
  await page.getByTestId('piano-velocity').fill('40');
  await page.getByRole('button', { name: 'Back to piano' }).click();
  const pianoHit = page.locator('.layer-card .clip.hit.piano');
  await expect(pianoHit).toHaveCount(1);
  await expect(pianoHit.locator('.hit-strike')).toHaveAttribute('style', /height: 40%/);
  await expect(pianoHit.locator('svg line')).toHaveCount(1);

  // Guitar layers get the same drawing.
  await page.getByRole('button', { name: 'Back to song' }).click();
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-type="single"]').click();
  await page.getByTestId('record').click();
  await page.locator('.key[data-midi="48"]').dispatchEvent('pointerdown');
  await page.getByRole('button', { name: 'Back to guitar' }).click();
  const guitarHit = page.locator('.layer-card .clip.hit.note');
  await expect(guitarHit).toHaveCount(1);
  await expect(guitarHit.locator('.hit-strike')).toHaveAttribute('style', /height: 80%/);

  // Song Home draws the same hits.
  await page.getByRole('button', { name: 'Back to song' }).click();
  await expect(page.locator('.rows .clip.hit')).toHaveCount(2);
  await expect(page.locator('.rows .clip.hit.piano .hit-strike')).toHaveAttribute('style', /height: 40%/);
});

test('Song Home colours every hit by its chord or note degree in the key', async ({ page }) => {
  // Lock C major so the colours are deterministic.
  await page.getByRole('button', { name: 'Key' }).click();
  await page.getByTestId('key-lock').click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('key-legend')).toHaveText('CDmEmFGAmBdim');

  await openNewPianoLayer(page);
  await addChord(page, 'C');
  await page.getByTestId('next-piano-chord').click();
  await addChord(page, 'Am');
  await page.getByTestId('next-piano-chord').click();
  await addChord(page, 'G');
  await page.getByRole('button', { name: 'Back to piano' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();

  // A guitar note: E is iii, an out-of-key C# is neutral.
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-type="single"]').click();
  await page.getByTestId('record').click();
  await page.locator('.key[data-midi="52"]').dispatchEvent('pointerdown');
  await page.locator('.key[data-midi="49"]').dispatchEvent('pointerdown');
  await page.getByRole('button', { name: 'Back to guitar' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();

  const piano = page.locator('[data-instrument="piano"] .clip');
  await expect(piano).toHaveCount(3);
  await expect(piano.nth(0)).toHaveAttribute('data-degree', '0'); // I   red
  await expect(piano.nth(1)).toHaveAttribute('data-degree', '5'); // vi  violet
  await expect(piano.nth(2)).toHaveAttribute('data-degree', '4'); // V   blue
  await expect(piano.nth(0)).toHaveCSS('color', 'rgb(248, 113, 113)');
  const guitar = page.locator('[data-instrument="guitar"] .clip');
  await expect(guitar.nth(0)).toHaveAttribute('data-degree', '2');
  await expect(guitar.nth(1)).toHaveAttribute('data-degree', 'out');
});

test('backgrounding the app stops playback (and the metronome with it)', async ({ page }) => {
  await page.getByRole('button', { name: 'BPM' }).click();
  await page.getByTestId('metronome-toggle').click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByTestId('play').click();
  await expect(page.getByTestId('play')).toHaveAttribute('aria-label', 'Pause');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('play')).toHaveAttribute('aria-label', 'Play');
});

test('editor playback loops back to bar 1; the ruler shows the loop length', async ({ page }) => {
  await page.getByRole('button', { name: 'BPM' }).click();
  await page.getByRole('slider', { name: 'BPM slider' }).fill('220');
  await page.getByRole('button', { name: 'Done' }).click();
  await openNewPianoLayer(page);
  await addChord(page, 'C');
  await expect(page.getByTestId('loop-badge')).toHaveText('⟲ 1 bar');
  await expect(page.getByTestId('loop-badge')).toHaveClass(/even/);

  // One bar at 220 BPM is ~1.1 s: after 1.6 s it is still going round.
  await page.getByTestId('play').click();
  await page.waitForTimeout(1600);
  await expect(page.getByTestId('play')).toHaveAttribute('aria-label', 'Pause');
  await expect(page.locator('.timeline .playhead')).toHaveCount(1);
  await page.getByTestId('play').click();
  await expect(page.getByTestId('play')).toHaveAttribute('aria-label', 'Play');

  await page.getByTestId('next-piano-chord').click();
  await expect(page.getByTestId('loop-badge')).toHaveText('⟲ 2 bars');
  await addChord(page, 'G');
  await page.getByTestId('next-piano-chord').click();
  await expect(page.getByTestId('loop-badge')).toHaveText('⟲ 3 bars · +1 for an even 4');
  await expect(page.getByTestId('loop-badge')).not.toHaveClass(/even/);
});

test('chords carry their key colour in the editor, on buttons and in the wheel', async ({ page }) => {
  await openNewPianoLayer(page);
  // Nothing committed yet: colours follow the C major starting guess.
  await expect(page.locator('.palette-chord[data-chord="C"]')).toHaveAttribute('style', /--tone: var\(--deg-0\)/);
  await expect(page.locator('.palette-chord[data-chord="G"]')).toHaveAttribute('style', /--tone: var\(--deg-4\)/);
  await addChord(page, 'Am');
  await expect(page.locator('.block.piano.keyed')).toHaveAttribute('style', /--tone: var\(--deg-5\)/);
  await expect(page.locator('.piano-chord-name')).toHaveAttribute('style', /--tone: var\(--deg-5\)/);
  await page.getByTestId('open-note-wheel').click();
  await expect(page.getByTestId('note-wheel')).toHaveAttribute('style', /--tone: var\(--deg-5\)/);
  await page.getByRole('button', { name: 'Done' }).click();

  // Guitar: blocks are filled with the key colour; Major/Minor carry it too.
  // Lock C major first — in Auto, more A material would re-read the song as F major.
  await page.getByRole('button', { name: 'Back to piano' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();
  await page.getByRole('button', { name: 'Key' }).click();
  await page.getByTestId('key-lock').click();
  await expect(page.getByTestId('key-lock')).toHaveText('Locked · C major');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-type="strum"]').click();
  await page.getByTestId('record').click();
  await page.locator('.key[data-midi="57"]').dispatchEvent('pointerdown'); // A
  await expect(page.locator('.block.chord.keyed')).toHaveAttribute('style', /--tone: var\(--deg-5\)/);
  await expect(page.getByTestId('make-minor')).toHaveAttribute('style', /--tone: var\(--deg-5\)/);
});

test('Undo on Song Home: a whole tempo adjustment is one step, and says what it undid', async ({ page }) => {
  await expect(page.getByTestId('undo')).toBeDisabled();
  await page.getByRole('button', { name: 'BPM' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Faster' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'BPM' })).toContainText('103');

  await page.getByTestId('undo').click();
  await expect(page.getByRole('button', { name: 'BPM' })).toContainText('100');
  await expect(page.locator('.toast')).toHaveText('Undo: Tempo 100 → 103');
  await expect(page.getByTestId('undo')).toBeDisabled();
  await page.getByTestId('redo').click();
  await expect(page.getByRole('button', { name: 'BPM' })).toContainText('103');
  await expect(page.locator('.toast')).toHaveText('Redo: Tempo 100 → 103');
});

/** Drag an element horizontally with a synthetic touch pointer. */
async function dragBy(page: Page, testId: string, dx: number) {
  const el = page.getByTestId(testId);
  const box = (await el.boundingBox())!;
  const from = { pointerId: 7, pointerType: 'touch', clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  await el.dispatchEvent('pointerdown', from);
  await el.dispatchEvent('pointermove', { ...from, clientX: from.clientX + dx / 2 });
  await el.dispatchEvent('pointermove', { ...from, clientX: from.clientX + dx });
  await el.dispatchEvent('pointerup', { ...from, clientX: from.clientX + dx });
}

test('edge handles on a selected hit change where it starts and ends (piano and guitar)', async ({ page }) => {
  await openNewPianoLayer(page);
  await expect(page.getByTestId('edge-end')).toHaveCount(0);
  await addChord(page, 'C'); // selected, beats 0–4
  const block = page.locator('.block.piano');

  // Default zoom: one beat = 56 px.
  await dragBy(page, 'edge-end', -56);
  await expect(page.getByTestId('piano-sustain-value')).toHaveText('3 beats');
  await page.getByTestId('undo').click(); // the whole drag is one step
  await expect(page.getByTestId('piano-sustain-value')).toHaveText('1 bar');

  await dragBy(page, 'edge-start', 112);
  await expect(block).toHaveCSS('left', '112px');
  await expect(page.getByTestId('piano-sustain-value')).toHaveText('2 beats'); // the end stayed put

  // Guitar notes get the same grips.
  await page.getByRole('button', { name: 'Back to piano' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-type="single"]').click();
  await page.getByTestId('record').click();
  await page.locator('.key[data-midi="48"]').dispatchEvent('pointerdown'); // a 1-beat note, selected
  await dragBy(page, 'edge-end', 56);
  await expect(page.getByTestId('note-panel')).toContainText('2 beats');
});

test('the golden loop region: select, resize, reset — and Play loops only it', async ({ page }) => {
  await openNewPianoLayer(page);
  await addChord(page, 'C');
  await page.getByTestId('next-piano-chord').click();
  await addChord(page, 'G');
  await page.locator('.timeline-inner').click({ position: { x: 120, y: 110 } }); // deselect
  await expect(page.getByTestId('loop-badge')).toHaveText('⟲ 2 bars');

  const loopBar = page.getByTestId('loop-bar');
  await expect(loopBar).toHaveClass(/whole/);
  await loopBar.click({ position: { x: 30, y: 7 } });
  await expect(loopBar).toHaveAttribute('aria-pressed', 'true');
  await dragBy(page, 'loop-end', -224); // one bar at default zoom (snaps to bars)
  await expect(page.getByTestId('loop-badge')).toHaveText('⟲ 1 bar');
  await expect(page.locator('.loop-shade')).toHaveCount(2);
  await expect(page.locator('.toast')).toHaveCount(0);

  await page.getByTestId('undo').click();
  await expect(page.locator('.toast')).toHaveText('Undo: Loop bar 1');
  await expect(page.getByTestId('loop-badge')).toHaveText('⟲ 2 bars');
  await page.getByTestId('redo').click();
  await expect(page.getByTestId('loop-badge')).toHaveText('⟲ 1 bar');

  // Playing loops bar 1 only: the playhead never reaches bar 2.
  await page.getByTestId('play').click();
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(400);
    const left = await page.locator('.timeline .playhead').evaluate((el) => parseFloat((el as HTMLElement).style.left));
    expect(left).toBeLessThan(224);
  }
  await page.getByTestId('play').click();

  // Song Home shows the region on the layer strip.
  await page.getByRole('button', { name: 'Back to piano' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();
  await expect(page.getByTestId('overview-loop')).toHaveCount(1);

  // Back in the editor, "Whole song" resets it.
  await page.getByRole('button', { name: 'Piano' }).click();
  await page.getByTestId('open-layer').click();
  await page.getByTestId('loop-bar').click({ position: { x: 30, y: 7 } });
  await page.getByTestId('loop-whole-song').click();
  await expect(page.getByTestId('loop-badge')).toHaveText('⟲ 2 bars');
  await expect(page.locator('.loop-shade')).toHaveCount(0);
});

test('pinch (ctrl + wheel on desktop) zooms the timeline', async ({ page }) => {
  await openNewPianoLayer(page);
  await addChord(page, 'C');
  const block = page.locator('.block.piano');
  const before = (await block.boundingBox())!.width;
  await page.getByTestId('timeline').dispatchEvent('wheel', { ctrlKey: true, deltaY: -70, clientX: 60, clientY: 150 });
  await expect.poll(async () => (await block.boundingBox())!.width).toBeGreaterThan(before * 1.8);
  // Zoomed in far enough, the loop snaps to beats: pull its end in by one beat.
  await page.locator('.timeline-inner').click({ position: { x: 20, y: 110 } });
  await page.getByTestId('loop-bar').click({ position: { x: 30, y: 7 } });
  const pxPerBeat = (await block.boundingBox())!.width / 4;
  await dragBy(page, 'loop-end', -pxPerBeat);
  await expect(page.getByTestId('loop-badge')).toHaveText('⟲ 3 beats');
});
