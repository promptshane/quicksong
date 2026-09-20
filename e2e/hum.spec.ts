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
});

test('humming creates editable notes at the cursor', async ({ page }) => {
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-type="single"]').click();

  await page.getByTestId('hum').click();
  await expect(page.getByTestId('hum-overlay')).toBeVisible();
  await expect(page.locator('.hum-note')).toHaveText('A3', { timeout: 5000 });
  await expect(page.locator('.hum-note')).toHaveText('E4', { timeout: 5000 });
  await page.waitForTimeout(900);
  await page.getByTestId('hum-stop').click();
  await expect(page.getByTestId('hum-overlay')).toHaveCount(0);

  const blocks = page.locator('.block.note');
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(0)).toHaveText('A3');
  await expect(blocks.nth(1)).toHaveText('E4');
  await expect(page.locator('.toast')).toContainText('Added 2 notes');

  // They are real events: undo removes them.
  await page.getByTestId('undo').click();
  await expect(blocks).toHaveCount(0);
});

test('humming on a chord layer creates chord seeds', async ({ page }) => {
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-type="strum"]').click();

  await page.getByTestId('hum').click();
  await expect(page.locator('.hum-note')).toHaveText('E4', { timeout: 6000 });
  await page.waitForTimeout(900);
  await page.getByTestId('hum-stop').click();

  const blocks = page.locator('.block.chord.seed');
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(0)).toContainText('A');
  await expect(blocks.nth(1)).toContainText('E');
});
