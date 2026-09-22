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

  // Song Home keeps its compact solid clips.
  await page.getByRole('button', { name: 'Back to song' }).click();
  await expect(page.locator('.rows .clip')).toHaveCount(2);
  await expect(page.locator('.rows .clip.hit')).toHaveCount(0);
});
