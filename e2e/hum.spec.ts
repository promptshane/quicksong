import { expect, test } from '@playwright/test';

/**
 * Fake the microphone with an oscillator: A3 for ~1.2s, E4 for ~1.2s, then
 * silence. This drives the real capture → pitch detection → segmentation →
 * quantisation → insert pipeline inside WebKit.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const fake = async () => {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      const t = ctx.currentTime + 0.2;
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.setValueAtTime(329.63, t + 1.2);
      osc.connect(gain).connect(dest);
      osc.start(t);
      osc.stop(t + 2.4);
      await ctx.resume();
      return dest.stream;
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: fake },
      configurable: true,
    });
  });
  await page.goto('/');
  await expect(page.locator('.app[data-hydrated="true"]')).toBeVisible();
  await page.getByTestId('new-project').click();
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
});

test('Record OFF: humming lights the matching key red and commits nothing', async ({ page }) => {
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-type="single"]').click();

  await page.getByTestId('hum').click();
  const status = page.getByTestId('hum-status');
  await expect(status).toHaveAttribute('data-mode', 'preview');
  await expect(status).toContainText('Listening');
  await expect(status).not.toContainText('captured');

  // A3 is on the default C3–C4 keyboard: it goes red, nothing else does.
  await expect(page.locator('.key.live')).toHaveAttribute('data-midi', '57', { timeout: 5000 });
  await expect(page.locator('.key.live')).toHaveCount(1);
  const liveColor = await page.locator('.key.live').evaluate((el) => getComputedStyle(el).backgroundColor);
  const plainColor = await page.locator('.key[data-midi="48"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(liveColor).not.toBe(plainColor);
  // No metronome/playhead in preview.
  await expect(page.locator('.playhead')).toHaveCount(0);

  // E4 is above the visible octave: the keyboard follows so it becomes visible.
  await expect(page.locator('.key.live')).toHaveAttribute('data-midi', '64', { timeout: 5000 });
  await expect(page.locator('.keyboard-head .range')).not.toHaveText('C3 – C4');

  await page.getByTestId('hum').click(); // stop
  await expect(status).toHaveCount(0);
  await expect(page.locator('.key.live')).toHaveCount(0);
  await expect(page.locator('.block')).toHaveCount(0);
  await expect(page.locator('.key.dim')).toHaveCount(0);
  await expect(page.locator('.toast')).toHaveCount(0);
  // Only the layer creation is in history: one undo removes the layer.
  await page.getByTestId('undo').click();
  await expect(page.locator('.empty-state')).toContainText('no longer exists');
});

test('Record OFF: a live red key stays red even where guidance would dim it', async ({ page }) => {
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-type="single"]').click();
  // Choose a manual key that does not contain A, so the hummed A3 is dimmed.
  await page.getByRole('button', { name: 'Back to guitar' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();
  await page.getByRole('button', { name: 'Key' }).click();
  await page.getByRole('button', { name: 'Assume C# major' }).click(); // C# major has no A
  await page.getByTestId('key-lock').click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('open-layer').click();
  await expect(page.locator('.key[data-midi="57"]')).toHaveClass(/dim/);
  const dimColor = await page.locator('.key[data-midi="57"]').evaluate((el) => getComputedStyle(el).backgroundColor);

  await page.getByTestId('hum').click();
  await expect(page.locator('.key[data-midi="57"]')).toHaveClass(/live/, { timeout: 5000 });
  const liveColor = await page.locator('.key[data-midi="57"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(liveColor).not.toBe(dimColor);
  await page.getByTestId('hum').click();
});

test('Record ON: humming creates editable notes at the cursor', async ({ page }) => {
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-type="single"]').click();
  await page.getByTestId('record').click();

  await page.getByTestId('hum').click();
  const status = page.getByTestId('hum-status');
  await expect(status).toHaveAttribute('data-mode', 'record');
  await expect(status).toContainText('Recording');
  await expect(page.getByTestId('hum-live')).toHaveText('A3', { timeout: 5000 });
  await expect(page.getByTestId('hum-live')).toHaveText('E4', { timeout: 5000 });
  await page.waitForTimeout(900);
  await page.getByTestId('hum').click(); // stop
  await expect(status).toHaveCount(0);

  const blocks = page.locator('.block.note');
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(0)).toHaveText('A3');
  await expect(blocks.nth(1)).toHaveText('E4');
  await expect(page.locator('.toast')).toContainText('Added 2 notes');

  // They are real events: undo removes them.
  await page.getByTestId('undo').click();
  await expect(blocks).toHaveCount(0);
});

test('Record ON: humming on a chord layer creates chord seeds', async ({ page }) => {
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-type="strum"]').click();
  await page.getByTestId('record').click();

  await page.getByTestId('hum').click();
  await expect(page.getByTestId('hum-live')).toHaveText('E4', { timeout: 6000 });
  await page.waitForTimeout(900);
  await page.getByTestId('hum').click();

  const blocks = page.locator('.block.chord.seed');
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(0)).toContainText('A');
  await expect(blocks.nth(1)).toContainText('E');
});
