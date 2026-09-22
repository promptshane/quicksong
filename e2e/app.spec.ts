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

async function addLayer(page: Page, type: 'strum' | 'picked' | 'single') {
  await page.getByTestId('add-layer').click();
  await page.locator(`[data-layer-type="${type}"]`).click();
  await expect(page.locator(`[data-screen="layer"][data-layer-type="${type}"]`)).toBeVisible();
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
  await expect(page.locator('.row.locked')).toHaveCount(3);
  await expect(page.locator('.row[data-instrument="piano"]')).not.toHaveClass(/locked/);
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
  await addLayer(page, 'strum');
  await recordOn(page);
  // A full-bar C chord then a shorter G: C major inferred, G major still plausible.
  await tapKey(page, 60);
  await page.getByTestId('make-major').click();
  await tapKey(page, 55);
  await page.getByTestId('make-major').click();
  await page.getByRole('button', { name: 'Shorter' }).click();
  await page.getByRole('button', { name: 'Shorter' }).click();
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

  // Committing an F chord rules G major out: the preference is dropped automatically.
  await openGuitar(page);
  await page.getByTestId('open-layer').click();
  await recordOn(page);
  await tapKey(page, 53);
  await page.getByTestId('make-major').click();
  await page.getByRole('button', { name: 'Back to guitar' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();
  await expect(page.getByRole('button', { name: 'Key', exact: true })).toContainText('Auto · C');
  await page.getByRole('button', { name: 'Key', exact: true }).click();
  await expect(status).toContainText('C major');
  await expect(wheel).toHaveAttribute('data-rotation', '0');
  await expect(cell('G')).toHaveAttribute('data-key-state', 'impossible');
  await expect(cell('F')).toHaveAttribute('data-chord-state', 'usedDiatonic');
  await expect(wheel.getByRole('button')).toHaveCount(2); // C major and A minor
});

test('locked instruments do not open an editor', async ({ page }) => {
  await page.getByRole('button', { name: 'Drums' }).click({ force: true });
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
  await expect(page.locator('.toast')).toHaveText('Undo: Add layer Single Notes 1');
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

test('strummed chord layer: seed note → minor chord, strings, strum grid, playback', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'strum');

  await expect(page.getByTestId('strum-grid')).toBeVisible();
  await expect(page.locator('.strum-slot')).toHaveCount(8);

  // Record OFF: a key press does not create a seed chord.
  await tapKey(page, 57);
  await expect(page.locator('.block.chord')).toHaveCount(0);

  await recordOn(page);
  await tapKey(page, 57); // A3
  await expect(page.locator('.block.chord.seed')).toHaveCount(1);
  await expect(page.getByTestId('chord-panel')).toBeVisible();

  await page.getByTestId('make-minor').click();
  await expect(page.locator('.block.chord').first()).toContainText('Am');
  await expect(page.getByTestId('chord-tones').locator('.tone')).toHaveText(['A2', 'E3', 'A3', 'C4', 'E4']);

  // Strings: low E is muted for Am, enable it, then re-mute
  await page.getByTestId('toggle-strings').click();
  await expect(page.locator('.string[data-string="6"]')).toHaveClass(/muted/);
  await page.getByRole('button', { name: 'Play string 6' }).click();
  await expect(page.locator('.string[data-string="6"]')).not.toHaveClass(/muted/);
  await expect(page.getByTestId('chord-tones').locator('.tone')).toHaveCount(6);
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('chord-tones').locator('.tone')).toHaveCount(5);

  // Remove a chord tone via the chip
  await page.getByTestId('chord-tones').locator('.tone', { hasText: 'C4' }).click();
  await page.getByRole('button', { name: 'Remove tone' }).click();
  await expect(page.getByTestId('chord-tones').locator('.tone')).toHaveCount(4);
  await expect(page.locator('.block.chord').first()).toContainText('A?');
  await page.getByTestId('undo').click();
  await expect(page.locator('.block.chord').first()).toContainText('Am');

  // Strum grid cycles — → ↓ → ↑
  const slot = page.locator('[data-strum-slot="1"]');
  await expect(slot).toHaveText(/—/);
  await slot.click();
  await expect(slot).toHaveText(/↓/);
  await slot.click();
  await expect(slot).toHaveText(/↑/);
  await page.getByTestId('undo').click();
  await expect(slot).toHaveText(/↓/);

  // Second chord with "New chord" target, then Major
  await tapKey(page, 50); // D3
  await page.getByTestId('make-major').click();
  await expect(page.locator('.block.chord')).toHaveCount(2);
  await expect(page.locator('.block.chord').nth(1)).toContainText('D');

  // "Add to chord" is an explicit edit: it works with Record OFF too.
  await page.getByTestId('record').click();
  await expect(page.getByTestId('record')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('input-target').getByText('Add to chord').click();
  await expect(page.getByTestId('chord-tones').locator('.tone')).toHaveCount(4);
  await tapKey(page, 52); // E3 onto a muted string
  await expect(page.getByTestId('chord-tones').locator('.tone')).toHaveCount(5);
  await expect(page.locator('.block.chord')).toHaveCount(2);
  // ...while "Preview" keys with Record OFF add nothing.
  await page.getByTestId('input-target').getByText('Preview').click();
  await tapKey(page, 55);
  await expect(page.locator('.block.chord')).toHaveCount(2);
  await expect(page.getByTestId('chord-tones').locator('.tone')).toHaveCount(5);

  // Key guidance: committed Am + D(+E) material dims notes outside every plausible key.
  await expect(page.locator('.key.dim').first()).toBeVisible();
  await expect(page.locator('.key[data-midi="49"]')).toHaveClass(/dim/); // C#
  await expect(page.locator('.key[data-midi="50"]')).not.toHaveClass(/dim/); // D
  // Dimmed keys still play (Record ON -> still record).
  await recordOn(page);
  await tapKey(page, 49);
  await expect(page.locator('.block.chord')).toHaveCount(3);
  await page.getByTestId('undo').click();
  await expect(page.locator('.block.chord')).toHaveCount(2);

  // Playback runs from the start of the song and the playhead appears
  await page.locator('.timeline-inner').click({ position: { x: 8, y: 100 } });
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

test('duplicate a chord layer and switch the copy from strummed to picked', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'strum');
  await recordOn(page);
  await tapKey(page, 57);
  await page.getByTestId('make-minor').click();
  await expect(page.locator('.block.chord').first()).toContainText('Am');

  await page.getByRole('button', { name: 'Back to guitar' }).click();
  const cards = page.locator('.layer-card');
  await expect(cards).toHaveCount(1);

  await longPress(page, cards.first().getByTestId('open-layer'));
  await expect(page.locator('.sheet[aria-label="Duplicate this layer?"]')).toBeVisible();
  await page.getByTestId('duplicate-layer').click();

  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByTestId('open-layer')).toContainText('Strummed Chords 1');
  await expect(cards.nth(1).getByTestId('open-layer')).toContainText('Strummed Chords 2');

  await cards.nth(1).getByTestId('open-layer').click();
  await expect(page.locator('[data-screen="layer"][data-layer-type="strum"]')).toBeVisible();
  await expect(page.locator('.block.chord')).toHaveCount(1);
  await expect(page.locator('.block.chord').first()).toContainText('Am');

  await page.getByTestId('change-layer-type').click();
  await expect(page.locator('.sheet[aria-label="Layer type"]')).toBeVisible();
  await page.locator('[data-layer-type-choice="picked"]').click();

  await expect(page.locator('[data-screen="layer"][data-layer-type="picked"]')).toBeVisible();
  await expect(page.getByTestId('change-layer-type')).toContainText('Picked Chords 1');
  await expect(page.locator('.block.chord')).toHaveCount(1);
  await expect(page.locator('.block.chord').first()).toContainText('Am');
  await expect(page.getByTestId('pick-grid')).toBeVisible();
});

test('picked chord layer: pattern edits and per-chord override', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'picked');
  await expect(page.getByTestId('pick-grid')).toBeVisible();

  await page.locator('[data-pick="0-5"]').click();
  await expect(page.locator('[data-pick="0-5"]')).toHaveClass(/on/);
  await page.getByTestId('undo').click();
  await expect(page.locator('[data-pick="0-6"]')).toHaveClass(/on/);

  await recordOn(page);
  await tapKey(page, 52); // E3
  await page.getByTestId('make-minor').click();
  await expect(page.locator('.block.chord').first()).toContainText('Em');

  await page.getByTestId('override-pick').click();
  await expect(page.locator('.panel-label', { hasText: 'Picking (this chord)' })).toBeVisible();
  await page.locator('[data-pick="1-1"]').click();
  await expect(page.locator('[data-pick="1-1"]')).toHaveClass(/on/);
  await page.getByRole('button', { name: 'Use default' }).click();
  await expect(page.locator('.panel-label', { hasText: 'Picking (layer default)' })).toBeVisible();
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
