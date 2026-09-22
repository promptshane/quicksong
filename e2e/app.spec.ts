import { expect, test, type Locator, type Page } from '@playwright/test';

const consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0;
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  await page.goto('/');
  await expect(page.locator('.app[data-hydrated="true"]')).toBeVisible();
  // The app launches on Projects; every song-level test starts in a fresh project.
  await expect(page.locator('[data-screen="projects"]')).toBeVisible();
  await page.getByTestId('new-project').click();
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
});

test.afterEach(() => {
  expect(consoleErrors, 'no console errors').toEqual([]);
});

async function openGuitar(page: Page) {
  await page.getByRole('button', { name: 'Guitar' }).click();
  await expect(page.locator('[data-screen="guitar"]')).toBeVisible();
}

async function addLayer(page: Page, kind: 'chords' | 'single') {
  await page.getByTestId('add-layer').click();
  await page.locator(`[data-layer-kind="${kind === 'single' ? 'notes' : 'chords'}"]`).click();
  await expect(page.locator(`[data-screen="layer"][data-layer-type="${kind}"]`)).toBeVisible();
}

/** Pick a chord from the key palette and add it at the cursor. */
async function addChord(page: Page, name: string) {
  await page.locator(`.palette-chord[data-chord="${name}"]`).click();
  await page.getByTestId('add-chord').click();
  await expect(page.getByTestId('chord-name')).toHaveText(name);
}

async function recordOn(page: Page) {
  await page.getByTestId('record').click();
  await expect(page.getByTestId('record')).toHaveAttribute('aria-pressed', 'true');
}

async function tapKey(page: Page, midi: number) {
  await page.locator(`.key[data-midi="${midi}"]`).dispatchEvent('pointerdown');
}

async function longPress(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Could not long-press hidden element');
  const point = { pointerId: 1, pointerType: 'touch', clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  await locator.dispatchEvent('pointerdown', point);
  await page.waitForTimeout(650);
  await locator.dispatchEvent('pointerup', point);
}

test('loads with valid PWA metadata at iPhone width', async ({ page }) => {
  await expect(page).toHaveTitle('QuickSong');
  expect(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content')).toBe('yes');
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifest = await page.request.get(manifestHref!);
  expect(manifest.ok()).toBe(true);
  const json = await manifest.json();
  expect(json.name).toBe('QuickSong');
  expect(json.display).toBe('standalone');
  expect(json.icons.length).toBeGreaterThanOrEqual(2);
  for (const icon of json.icons) {
    const res = await page.request.get(icon.src);
    expect(res.ok(), `icon ${icon.src}`).toBe(true);
  }
  expect((await page.request.get('/sw.js')).ok()).toBe(true);
  expect((await page.request.get('/apple-touch-icon.png')).ok()).toBe(true);

  // Nothing wider than the viewport.
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(390);

  // Five instrument rows; guitar and piano are enabled.
  await expect(page.locator('.row')).toHaveCount(5);
  await expect(page.locator('.row.locked')).toHaveCount(2); // bass, vocals
  for (const inst of ['drums', 'guitar', 'piano']) await expect(page.locator(`.row[data-instrument="${inst}"]`)).not.toHaveClass(/locked/);
});

test('metronome toggles from the Tempo sheet and shows on the BPM chip', async ({ page }) => {
  await expect(page.getByTestId('metronome-indicator')).toHaveCount(0);
  await page.getByRole('button', { name: 'BPM' }).click();
  const toggle = page.getByTestId('metronome-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveText('Metronome on');
  await page.getByRole('button', { name: 'Faster' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('metronome-indicator')).toBeVisible();

  // Keeps running through editing and playback without errors.
  await page.getByTestId('play').click();
  await page.waitForTimeout(400);
  await page.getByTestId('play').click();
  await page.getByRole('button', { name: 'BPM, metronome on' }).click();
  await page.getByTestId('metronome-toggle').click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('metronome-indicator')).toHaveCount(0);
});

test('song settings: BPM, time signature and key', async ({ page }) => {
  await page.getByRole('button', { name: 'BPM' }).click();
  await page.getByRole('button', { name: 'Faster' }).click();
  await page.getByRole('button', { name: 'Faster' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'BPM' })).toContainText('102');

  await page.getByRole('button', { name: 'Time signature' }).click();
  await page.getByRole('button', { name: '6/8' }).click();
  await expect(page.getByRole('button', { name: 'Time signature' })).toContainText('6/8');

  await expect(page.getByRole('button', { name: 'Key', exact: true })).toContainText('Auto');
  await page.getByRole('button', { name: 'Key', exact: true }).click();
  await expect(page.getByTestId('key-auto')).toHaveAttribute('aria-pressed', 'true');
  // With nothing recorded every key is plausible: tapping Am assumes it but stays in Auto.
  await page.getByRole('button', { name: 'Assume A minor' }).click();
  await expect(page.getByTestId('key-auto')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('key-status')).toContainText('Auto');
  await expect(page.getByTestId('key-status')).toContainText('A minor');
  await expect(page.getByRole('button', { name: 'Key', exact: true })).toContainText('Auto · Am');
  // Manual lock is still available.
  await page.getByTestId('key-lock').click();
  await expect(page.getByTestId('key-lock')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Key', exact: true })).toHaveText(/Key\s*Am$/);
  // The manual key survives a reload (saves are debounced).
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('.app[data-hydrated="true"]')).toBeVisible();
  await page.locator('[data-project-card]').click();
  await expect(page.getByRole('button', { name: 'Key', exact: true })).toHaveText(/Key\s*Am$/);
});

test('Key panel: circle of fifths follows committed chords and Auto preferences', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'chords');
  // A full-bar C chord then a shorter G: C major inferred, G major still plausible.
  await addChord(page, 'C');
  await page.getByTestId('next-chord').click();
  await addChord(page, 'G');
  await page.getByTestId('chord-length').fill('3');
  await page.getByRole('button', { name: 'Back to guitar' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();
  await expect(page.getByRole('button', { name: 'Key', exact: true })).toContainText('Auto · C');

  await page.getByRole('button', { name: 'Key', exact: true }).click();
  const status = page.getByTestId('key-status');
  await expect(status).toContainText('Auto');
  await expect(status).toContainText('C major');
  const wheel = page.getByTestId('key-wheel');
  await expect(wheel).toHaveAttribute('data-rotation', '0');
  await expect(wheel.locator('[data-testid="wheel-cell"]')).toHaveCount(36);

  // Fits an iPhone portrait screen: no horizontal overflow, and the wheel is a real touch target.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const box = (await wheel.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390 - 32);
  expect(box.width).toBeGreaterThan(250);
  const cBox = (await wheel.locator('[data-chord="C"]').boundingBox())!;
  expect(Math.min(cBox.width, cBox.height)).toBeGreaterThanOrEqual(40);

  const cell = (chord: string) => wheel.locator(`[data-chord="${chord}"]`);
  await expect(cell('C')).toHaveAttribute('data-chord-state', 'usedDiatonic');
  await expect(cell('C')).toHaveAttribute('data-key-state', 'assumed');
  await expect(cell('G')).toHaveAttribute('data-chord-state', 'usedDiatonic');
  await expect(cell('G')).toHaveAttribute('data-key-state', 'plausible');
  await expect(cell('F')).toHaveAttribute('data-chord-state', 'diatonic');
  await expect(cell('Bdim')).toHaveAttribute('data-chord-state', 'diatonic');
  await expect(cell('D')).toHaveAttribute('data-chord-state', 'possible'); // G major's V
  await expect(cell('D')).toHaveAttribute('data-key-state', 'impossible');
  await expect(cell('A#')).toHaveAttribute('data-chord-state', 'impossible');
  // Only plausible tonics are tappable.
  await expect(wheel.getByRole('button')).toHaveCount(4);

  // Tap G: assumed key, wheel rotates, still Auto.
  await page.getByRole('button', { name: 'Assume G major' }).click();
  await expect(status).toContainText('G major');
  await expect(page.getByTestId('key-auto')).toHaveAttribute('aria-pressed', 'true');
  await expect(wheel).toHaveAttribute('data-rotation', '-30');
  await expect(cell('G')).toHaveAttribute('data-key-state', 'assumed');
  await expect(cell('C')).toHaveAttribute('data-key-state', 'plausible');
  await expect(cell('D')).toHaveAttribute('data-chord-state', 'diatonic');
  await expect(cell('F')).toHaveAttribute('data-chord-state', 'possible');
  // Labels stay upright: the rotor turns one way and every label counters it.
  expect(await wheel.locator('.wheel-rotor').evaluate((el) => (el as HTMLElement).style.transform)).toBe('rotate(-30deg)');
  expect(await wheel.locator('.wheel-label').first().evaluate((el) => (el as HTMLElement).style.transform)).toContain('rotate(30deg)');

  // Major/Minor toggle keeps the slot but reads it as E minor.
  await page.getByRole('button', { name: 'Minor', exact: true }).click();
  await expect(status).toContainText('E minor');
  await expect(wheel).toHaveAttribute('data-rotation', '-30');
  await expect(cell('Em')).toHaveAttribute('data-key-state', 'assumed');
  await expect(page.getByRole('button', { name: 'Key', exact: true })).toContainText('Auto · Em');
  await page.getByRole('button', { name: 'Major', exact: true }).click();
  await expect(status).toContainText('G major');
  await page.getByRole('button', { name: 'Done' }).click();

  // Committing an F note rules G major out: the preference is dropped automatically.
  // (G major's chord palette has no F chord, so add F to the C chord on the wheel.)
  await openGuitar(page);
  await page.getByTestId('open-layer').click();
  await page.locator('.block.chord').first().click();
  await page.getByTestId('open-note-wheel').click();
  await page.getByTestId('note-wheel').getByRole('button', { name: 'Add F', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Back to guitar' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();
  await expect(page.getByRole('button', { name: 'Key', exact: true })).toContainText('Auto · C');
  await page.getByRole('button', { name: 'Key', exact: true }).click();
  await expect(status).toContainText('C major');
  await expect(wheel).toHaveAttribute('data-rotation', '0');
  await expect(cell('G')).toHaveAttribute('data-key-state', 'impossible');
  await expect(cell('C')).toHaveAttribute('data-chord-state', 'usedDiatonic');
  await expect(cell('F')).toHaveAttribute('data-chord-state', 'diatonic'); // an added note, not a chord
  await expect(wheel.getByRole('button')).toHaveCount(2); // C major and A minor
});

test('locked instruments do not open an editor', async ({ page }) => {
  await page.getByRole('button', { name: 'Vocals' }).click({ force: true });
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('coming later');
  await page.getByRole('button', { name: 'Bass' }).click({ force: true });
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
});

test('Record OFF: keys only preview — no events, no history, no key inference', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'single');
  await expect(page.getByTestId('record')).toHaveAttribute('aria-pressed', 'false');

  await tapKey(page, 49); // C#3
  await tapKey(page, 52);
  await tapKey(page, 55);
  await expect(page.locator('.block.note')).toHaveCount(0);
  await expect(page.getByTestId('panel-hint')).toContainText('Turn on Record');
  // Nothing dimmed on the keyboard: previews are not evidence.
  await expect(page.locator('.key.dim')).toHaveCount(0);

  await page.getByRole('button', { name: 'Back to guitar' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();
  await expect(page.getByRole('button', { name: 'Key' })).toHaveText(/Auto$/);

  // The only history entry is the layer creation itself: one undo removes the
  // layer and returns to the Guitar page, where Redo brings it back.
  await openGuitar(page);
  await page.getByTestId('open-layer').click();
  await page.getByTestId('undo').click();
  await expect(page.locator('[data-screen="guitar"]')).toBeVisible();
  await expect(page.locator('.toast')).toHaveText('Undo: Add layer Guitar Notes 1');
  await expect(page.locator('.layer-card')).toHaveCount(0);
  await page.getByTestId('redo').click();
  await expect(page.locator('.layer-card')).toHaveCount(1);
});

test('Record resets to OFF when reopening a layer', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'single');
  await recordOn(page);
  await page.getByRole('button', { name: 'Back to guitar' }).click();
  await page.getByTestId('open-layer').click();
  await expect(page.getByTestId('record')).toHaveAttribute('aria-pressed', 'false');
});

test('single-note layer: Record ON keys insert notes, editing and undo/redo work', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'single');
  await recordOn(page);

  await tapKey(page, 48);
  await tapKey(page, 52);
  await tapKey(page, 55);
  await expect(page.locator('.block.note')).toHaveCount(3);
  await expect(page.locator('.block.note').nth(0)).toHaveText('C3');

  // Last inserted note is selected; edit its pitch and octave.
  await expect(page.getByTestId('note-panel')).toBeVisible();
  await expect(page.getByTestId('note-name')).toHaveText('G3');
  await page.getByRole('button', { name: 'Pitch up' }).click();
  await expect(page.getByTestId('note-name')).toHaveText('G#3');
  await page.getByRole('button', { name: 'Octave up' }).first().click();
  await expect(page.getByTestId('note-name')).toHaveText('G#4');
  await page.getByRole('button', { name: 'Longer' }).click();
  await expect(page.locator('.stepper-label', { hasText: 'length' })).toContainText('1.5 beats');

  // Undo / redo
  await page.getByTestId('undo').click();
  await expect(page.locator('.stepper-label', { hasText: 'length' })).toContainText('1 beat');
  await page.getByTestId('redo').click();
  await expect(page.locator('.stepper-label', { hasText: 'length' })).toContainText('1.5 beats');

  // Delete is contextual: hold the block, then choose Delete.
  await expect(page.getByTestId('delete-event')).toHaveCount(0);
  await longPress(page, page.locator('.block.note').nth(2));
  await expect(page.getByTestId('context-delete-event')).toBeVisible();
  await page.getByTestId('context-delete-event').click();
  await expect(page.locator('.block.note')).toHaveCount(2);
  await page.getByTestId('undo').click();
  await expect(page.locator('.block.note')).toHaveCount(3);

  // Keyboard octave shift
  await expect(page.locator('.keyboard-head .range')).toHaveText('C3 – C4');
  await page.getByTestId('octave-up').click();
  await expect(page.locator('.keyboard-head .range')).toHaveText('C4 – C5');
});

test('guitar chords: pick from the key, special notes, voicing, strum grid, playback', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'chords');

  // The same chord selector as Piano; strumming is the default style.
  await expect(page.getByTestId('palette-key')).toHaveText('Chords in C major');
  await expect(page.locator('.palette-chord')).toHaveText(['C', 'Dm', 'Em', 'F', 'G', 'Am']);
  await expect(page.getByTestId('layer-style-switch').locator('[data-style="together"]')).toHaveText('Strum');
  await expect(page.locator('.strum-slot')).toHaveCount(8);

  // Tapping a chord only previews it.
  await page.locator('.palette-chord[data-chord="Am"]').click();
  await expect(page.locator('.block.chord')).toHaveCount(0);
  await page.getByTestId('add-chord').click();
  await expect(page.locator('.block.chord')).toHaveCount(1);
  await expect(page.locator('.block.chord').first()).toContainText('Am');
  // A real guitar voicing underneath.
  await expect(page.getByTestId('chord-notes').locator('.tone')).toHaveText(['A2', 'E3', 'A3', 'C4', 'E4']);

  // Special chord: + G on the free low string makes Am7; undo takes it off.
  await page.getByTestId('open-note-wheel').click();
  await page.getByTestId('note-wheel').getByRole('button', { name: 'Add G', exact: true }).click();
  await expect(page.getByTestId('wheel-chord-name')).toHaveText('Am7');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('chord-notes').locator('.tone')).toHaveCount(6);
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('chord-name')).toHaveText('Am');

  // Voicing moves the shape up the neck (open Am → 5th-fret barre), same chord.
  await page.getByTestId('cycle-voicing').click();
  await expect(page.getByTestId('chord-name')).toHaveText('Am');
  await expect(page.getByTestId('chord-notes').locator('.tone')).toHaveText(['A2', 'E3', 'A3', 'C4', 'E4', 'A4']);
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('chord-notes').locator('.tone')).toHaveCount(5);

  // Next chord, then the strum grid for the whole layer.
  await page.getByTestId('next-chord').click();
  await addChord(page, 'F');
  await expect(page.locator('.block.chord')).toHaveCount(2);
  await page.getByTestId('next-chord').click();
  const slot = page.locator('[data-strum-slot="1"]');
  await expect(slot).toHaveText(/—/);
  await slot.click();
  await expect(slot).toHaveText(/↓/);
  await slot.click();
  await expect(slot).toHaveText(/↑/);
  await page.getByTestId('undo').click();
  await expect(slot).toHaveText(/↓/);

  // Playback: the playhead moves.
  await page.getByTestId('play').click();
  await expect(page.locator('.playhead')).toBeVisible();
  await page.waitForTimeout(400);
  const left1 = await page.locator('.playhead').evaluate((el) => parseFloat(getComputedStyle(el).left));
  await page.waitForTimeout(400);
  const left2 = await page.locator('.playhead').evaluate((el) => parseFloat(getComputedStyle(el).left));
  expect(left2).toBeGreaterThan(left1);
  await page.getByTestId('play').click();
  await expect(page.locator('.playhead')).toHaveCount(0);
});

test('guitar chords: switch to Pick after laying them down; one chord can differ', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'chords');
  await addChord(page, 'Am');
  await page.getByTestId('next-chord').click();

  // Decide afterwards: pick the whole layer, one note at a time.
  await page.getByTestId('layer-style-switch').locator('[data-style="arpeggio"]').click();
  await expect(page.getByTestId('layer-style-switch').locator('[data-style="arpeggio"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.strum-slot')).toHaveCount(0);
  const arp = page.getByTestId('layer-arp');
  await arp.locator('[data-arp-preset="down"]').click();
  await expect(arp.locator('[data-arp-preset="down"]')).toHaveAttribute('aria-pressed', 'true');
  await arp.locator('[data-arp-rate="quarter"]').click();

  // Customize: rows are the chord's notes (Am: five strings), columns the eighths.
  await page.getByTestId('layer-arp-customize').click();
  await expect(arp.locator('.arp-row:not(.arp-labels)')).toHaveCount(5);
  await expect(arp.locator('[data-arp-cell="0-4"]')).toHaveAttribute('aria-pressed', 'true'); // Down starts on top
  await arp.locator('[data-arp-cell="1-0"]').click();
  await expect(arp.locator('[data-arp-cell="1-0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('layer-arp-customize')).toHaveText('Custom ▾');
  await page.getByTestId('undo').click();
  await expect(arp.locator('[data-arp-cell="1-0"]')).toHaveAttribute('aria-pressed', 'false');

  // One chord can be strummed while the layer picks.
  await page.locator('.block.chord').first().click();
  const chordStyle = page.getByTestId('chord-style');
  await expect(chordStyle).toContainText('layer: Pick');
  await page.getByTestId('chord-style-switch').locator('[data-style="together"]').click();
  await expect(chordStyle).toContainText('its own');
  await page.getByTestId('chord-style-switch').locator('[data-style="layer"]').click();
  await expect(chordStyle).toContainText('layer: Pick');

  // The layer list shows the kind and style; hold duplicates.
  await page.getByRole('button', { name: 'Back to guitar' }).click();
  const cards = page.locator('.layer-card');
  await expect(cards.first().locator('small')).toHaveText('Chords · Pick · 1 chord');
  await longPress(page, cards.first().getByTestId('open-layer'));
  await page.getByTestId('duplicate-layer').click();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1).getByTestId('open-layer')).toContainText('Guitar Chords 2');
});

test('timeline slots are added explicitly and can stay empty', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'single');
  const bars = page.locator('.ruler .bar-label');
  await expect(bars).toHaveCount(1);
  await recordOn(page);

  await tapKey(page, 48); // material in slot 1 does not create slot 2
  await expect(bars).toHaveCount(1);

  await page.getByTestId('add-slot').click();
  await expect(bars).toHaveCount(2);
  await tapKey(page, 50); // Add Slot moves the cursor to the new slot
  await expect(page.locator('.block.note')).toHaveCount(2);
  await expect(bars).toHaveCount(2);

  // An explicitly added empty slot persists even when trailing material is deleted.
  await page.getByTestId('add-slot').click();
  await expect(bars).toHaveCount(3);
  await longPress(page, page.locator('.block.note').nth(1));
  await page.getByTestId('context-delete-event').click();
  await expect(page.locator('.block.note')).toHaveCount(1);
  await expect(bars).toHaveCount(3);
});

test('song persists across reload and home shows layers', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'single');
  await recordOn(page);
  await tapKey(page, 48);
  await tapKey(page, 50);
  await page.getByRole('button', { name: 'Back to guitar' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();
  await expect(page.locator('[data-instrument="guitar"] .overview .clip')).toHaveCount(2);

  await page.waitForTimeout(500); // debounced save
  await page.reload();
  await expect(page.locator('.app[data-hydrated="true"]')).toBeVisible();
  // Launch always lands on Projects, never straight back into the song.
  await expect(page.locator('[data-screen="projects"]')).toBeVisible();
  await page.locator('[data-project-card]').click();
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
  await expect(page.locator('[data-instrument="guitar"] .overview .clip')).toHaveCount(2);

  // Delete the layer
  await openGuitar(page);
  await page.getByRole('button', { name: 'Delete layer' }).click();
  await page.getByTestId('confirm-delete').click();
  await expect(page.locator('.layer-card')).toHaveCount(0);
});

test('hum button requests the microphone and reports denial gracefully', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'single');
  await page.getByTestId('hum').click();
  // WebKit in Playwright has no mic: we expect a clear error sheet, not a crash.
  await expect(page.locator('.sheet[aria-label="Microphone"]')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-screen="layer"]')).toBeVisible();
});
