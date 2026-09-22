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
  await page.getByTestId('new-project').click();
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
});

test.afterEach(() => {
  expect(consoleErrors, 'no console errors').toEqual([]);
});

async function hold(page: Page, locator: Locator) {
  const box = (await locator.boundingBox())!;
  const point = { pointerId: 3, pointerType: 'touch', clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  await locator.dispatchEvent('pointerdown', point);
  await page.waitForTimeout(650);
  await locator.dispatchEvent('pointerup', point);
  await locator.dispatchEvent('click', point);
}

test('drums: place kick, snare and hi-hat hits one by one', async ({ page }) => {
  await page.getByRole('button', { name: 'Drums' }).click();
  await expect(page.locator('[data-screen="drums"]')).toBeVisible();
  // One kind of drum layer: + Layer opens it straight away.
  await page.getByTestId('add-layer').click();
  await expect(page.locator('[data-screen="layer"][data-layer-type="drums"]')).toBeVisible();
  await expect(page.locator('.drum-row-labels')).toHaveText(['Hi-hat', 'Snare', 'Kick'].join(''));
  // 3 rows × 8 eighths in the one bar.
  await expect(page.locator('.drum-cell')).toHaveCount(24);

  const cell = (piece: string, slot: number) => page.locator(`[data-drum-cell="${piece}-${slot}"]`);
  await cell('kick', 0).click();
  await cell('snare', 2).click();
  for (let i = 0; i < 8; i++) await cell('hat', i).click();
  await expect(page.locator('.drum-cell.on')).toHaveCount(10);

  // Tap again removes; undo brings it back.
  await cell('hat', 7).click();
  await expect(cell('hat', 7)).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('undo').click();
  await expect(cell('hat', 7)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.toast')).toHaveText('Undo: Delete Hi-hat · Drums 1');

  // Hold a hit: velocity (and delete).
  await hold(page, cell('snare', 2));
  await expect(page.locator('.sheet[aria-label="Snare at 1.2"]')).toBeVisible();
  await page.getByTestId('drum-velocity').fill('40');
  await expect(page.getByTestId('drum-velocity-value')).toHaveText('40');
  await page.getByTestId('context-delete-event').click();
  await expect(cell('snare', 2)).toHaveAttribute('aria-pressed', 'false');

  // Pads only play a sound.
  await page.locator('[data-drum-pad="kick"]').click();
  await expect(page.locator('.drum-cell.on')).toHaveCount(9);

  // Plays, and shows on Song Home.
  await page.getByTestId('play').click();
  await expect(page.locator('.timeline .playhead')).toBeVisible();
  await page.getByTestId('play').click();
  await page.getByRole('button', { name: 'Back to drums' }).click();
  await expect(page.locator('.layer-card small')).toHaveText('9 hits');
  await page.getByRole('button', { name: 'Back to song' }).click();
  await expect(page.locator('[data-instrument="drums"] .overview .clip.drum')).toHaveCount(9);
});

test('piano: Chords or Notes; chords can be arpeggiated after they are laid down', async ({ page }) => {
  await page.getByRole('button', { name: 'Piano' }).click();
  await page.getByTestId('add-layer').click();
  await expect(page.locator('[data-layer-kind]')).toHaveText([/Chords/, /Notes/]);
  await page.locator('[data-layer-kind="chords"]').click();
  await page.locator('.palette-chord[data-chord="C"]').click();
  await page.getByTestId('add-chord').click();
  await page.getByTestId('next-chord').click();

  const styles = page.getByTestId('layer-style-switch');
  await expect(styles.locator('button')).toHaveText(['Together', 'Arpeggio']);
  await styles.locator('[data-style="arpeggio"]').click();
  await page.getByTestId('layer-arp').locator('[data-arp-preset="updown"]').click();
  await page.getByTestId('layer-arp-customize').click();
  // Rows are the chord's notes: C4 E4 G4, highest first.
  await expect(page.getByTestId('layer-arp').locator('.arp-note')).toHaveText(['G4', 'E4', 'C4', '']);

  await page.getByRole('button', { name: 'Back to piano' }).click();
  await expect(page.locator('.layer-card small')).toHaveText('Chords · Arpeggio · 1 chord');

  // A Notes layer uses the keyboard.
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-kind="notes"]').click();
  await expect(page.locator('[data-screen="layer"][data-layer-type="pianoNotes"]')).toBeVisible();
  await page.getByTestId('record').click();
  await page.locator('.key[data-midi="60"]').dispatchEvent('pointerdown');
  await expect(page.locator('.block.note')).toHaveText(['C4']);
  await page.getByRole('button', { name: 'Back to piano' }).click();
  await expect(page.locator('.layer-card')).toHaveCount(2);
  await expect(page.locator('.layer-card').nth(1).locator('small')).toHaveText('Notes · 1 note');
});
