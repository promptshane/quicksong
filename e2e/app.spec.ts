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

  // Five instrument rows; only guitar is enabled.
  await expect(page.locator('.row')).toHaveCount(5);
  await expect(page.locator('.row.locked')).toHaveCount(4);
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

  await expect(page.getByRole('button', { name: 'Key' })).toContainText('Auto');
  await page.getByRole('button', { name: 'Key' }).click();
  await expect(page.getByRole('button', { name: 'Auto' })).toHaveClass(/selected/);
  await page.getByRole('button', { name: 'Am', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Key' })).toContainText('Am');
});

test('locked instruments do not open an editor', async ({ page }) => {
  await page.getByRole('button', { name: 'Drums' }).click({ force: true });
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('coming later');
  await page.getByRole('button', { name: 'Piano' }).click({ force: true });
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
});

test('single-note layer: keyboard inserts notes, editing and undo/redo work', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'single');

  await page.locator('.key[data-midi="48"]').dispatchEvent('pointerdown');
  await page.locator('.key[data-midi="52"]').dispatchEvent('pointerdown');
  await page.locator('.key[data-midi="55"]').dispatchEvent('pointerdown');
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

  // Delete then undo brings it back
  await page.getByTestId('delete-event').click();
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

  await page.locator('.key[data-midi="57"]').dispatchEvent('pointerdown'); // A3
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
  await page.locator('.key[data-midi="50"]').dispatchEvent('pointerdown'); // D3
  await page.getByTestId('make-major').click();
  await expect(page.locator('.block.chord')).toHaveCount(2);
  await expect(page.locator('.block.chord').nth(1)).toContainText('D');

  // Add a tone to the selected chord via "Add to chord"
  await page.getByTestId('input-target').getByText('Add to chord').click();
  await expect(page.getByTestId('chord-tones').locator('.tone')).toHaveCount(4);
  await page.locator('.key[data-midi="52"]').dispatchEvent('pointerdown'); // E3 onto a muted string
  await expect(page.getByTestId('chord-tones').locator('.tone')).toHaveCount(5);
  await expect(page.locator('.block.chord')).toHaveCount(2);

  // Playback runs and the playhead appears
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

test('picked chord layer: pattern edits and per-chord override', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'picked');
  await expect(page.getByTestId('pick-grid')).toBeVisible();

  await page.locator('[data-pick="0-5"]').click();
  await expect(page.locator('[data-pick="0-5"]')).toHaveClass(/on/);
  await page.getByTestId('undo').click();
  await expect(page.locator('[data-pick="0-6"]')).toHaveClass(/on/);

  await page.locator('.key[data-midi="52"]').dispatchEvent('pointerdown'); // E3
  await page.getByTestId('make-minor').click();
  await expect(page.locator('.block.chord').first()).toContainText('Em');

  await page.getByTestId('override-pick').click();
  await expect(page.locator('.panel-label', { hasText: 'Picking (this chord)' })).toBeVisible();
  await page.locator('[data-pick="1-1"]').click();
  await expect(page.locator('[data-pick="1-1"]')).toHaveClass(/on/);
  await page.getByRole('button', { name: 'Use default' }).click();
  await expect(page.locator('.panel-label', { hasText: 'Picking (layer default)' })).toBeVisible();
});

test('song persists across reload and home shows layers', async ({ page }) => {
  await openGuitar(page);
  await addLayer(page, 'single');
  await page.locator('.key[data-midi="48"]').dispatchEvent('pointerdown');
  await page.locator('.key[data-midi="50"]').dispatchEvent('pointerdown');
  await page.getByRole('button', { name: 'Back to guitar' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();
  await expect(page.locator('[data-instrument="guitar"] .overview .clip')).toHaveCount(2);

  await page.waitForTimeout(500); // debounced save
  await page.reload();
  await expect(page.locator('.app[data-hydrated="true"]')).toBeVisible();
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
