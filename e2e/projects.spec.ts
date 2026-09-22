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
});

test.afterEach(() => {
  expect(consoleErrors, 'no console errors').toEqual([]);
});

const cards = (page: Page) => page.locator('[data-project-card]');

async function expectAppAndBottomBarToReachViewportBottom(page: Page) {
  const geometry = await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('.app');
    const bottomBar = document.querySelector<HTMLElement>('.bottombar');
    if (!app || !bottomBar) throw new Error('App shell or bottom bar is missing');

    return {
      viewportBottom: window.innerHeight,
      appBottom: app.getBoundingClientRect().bottom,
      bottomBarBottom: bottomBar.getBoundingClientRect().bottom,
    };
  });

  expect(Math.abs(geometry.appBottom - geometry.viewportBottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.bottomBarBottom - geometry.appBottom)).toBeLessThanOrEqual(1);
}

/** Touch-and-hold, including the click a real finger lift produces afterwards. */
async function longPress(page: Page, locator: Locator, withClick = true) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Could not long-press hidden element');
  const point = { pointerId: 1, pointerType: 'touch', clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  await locator.dispatchEvent('pointerdown', point);
  await page.waitForTimeout(650);
  await locator.dispatchEvent('pointerup', point);
  if (withClick) await locator.dispatchEvent('click', point);
}

async function reloadToProjects(page: Page) {
  await page.waitForTimeout(500); // debounced save
  await page.reload();
  await expect(page.locator('.app[data-hydrated="true"]')).toBeVisible();
  await expect(page.locator('[data-screen="projects"]')).toBeVisible();
}

test('launches to an empty Projects screen at iPhone width', async ({ page }) => {
  await expect(page.locator('[data-screen="projects"]')).toBeVisible();
  await expect(page.locator('[data-screen="home"]')).toHaveCount(0);
  await expect(page.locator('.empty-state')).toContainText('No projects yet');
  await expect(page.getByTestId('new-project')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Projects and Song Home paint their bottom bars to the viewport edge', async ({ page }) => {
  await expect(page.locator('[data-screen="projects"]')).toBeVisible();
  await page.evaluate(() => document.documentElement.style.setProperty('--safe-bottom', '34px'));
  await expectAppAndBottomBarToReachViewportBottom(page);
  const projectsBarHeight = (await page.locator('.bottombar').boundingBox())!.height;

  await page.getByTestId('new-project').click();
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
  await expectAppAndBottomBarToReachViewportBottom(page);

  const homeLayout = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('.bottombar')!.getBoundingClientRect();
    const play = document.querySelector<HTMLElement>('.play-btn')!.getBoundingClientRect();
    const safeBottom = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom'));
    return {
      barHeight: bar.height,
      playCenter: play.top + play.height / 2,
      safeControlCenter: bar.top + (bar.height - safeBottom) / 2,
    };
  });
  expect(Math.abs(homeLayout.barHeight - projectsBarHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(homeLayout.playCenter - homeLayout.safeControlCenter)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 844, height: 390 });
  await expectAppAndBottomBarToReachViewportBottom(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expectAppAndBottomBarToReachViewportBottom(page);

  // Playwright cannot install an iOS PWA, but keep the WebKit-specific
  // standalone override covered through the stylesheet WebKit actually read.
  // A CSS property is not a media feature; the former combined query could
  // never activate the standalone height override.
  expect(await page.evaluate(() => window.matchMedia('(-webkit-touch-callout: none)').matches)).toBe(false);

  const standaloneAppRule = await page.evaluate(() => {
    function findRule(rules: CSSRuleList, inStandalone = false): string | null {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSMediaRule) {
          const found = findRule(rule.cssRules, inStandalone || rule.conditionText.includes('display-mode: standalone'));
          if (found) return found;
        } else if (rule instanceof CSSSupportsRule) {
          const found = findRule(rule.cssRules, inStandalone);
          if (found) return found;
        } else if (rule instanceof CSSStyleRule && inStandalone && rule.selectorText === '.app') {
          return rule.style.height;
        }
      }
      return null;
    }

    for (const sheet of Array.from(document.styleSheets)) {
      const height = findRule(sheet.cssRules);
      if (height) return height;
    }
    return null;
  });
  expect(standaloneAppRule).toBe('100vh');
});

test('empty new projects are discarded; projects with information persist', async ({ page }) => {
  await page.getByTestId('new-project').click();
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
  await expect(page.getByTestId('project-title')).toHaveText('Untitled Project');

  // Backing out without changing anything leaves no junk project behind.
  await page.getByRole('button', { name: 'Back to projects' }).click();
  await expect(page.locator('[data-screen="projects"]')).toBeVisible();
  await expect(cards(page)).toHaveCount(0);

  // Any real song information makes the project persistent.
  await page.getByTestId('new-project').click();
  await page.getByRole('button', { name: 'BPM' }).click();
  await page.getByRole('button', { name: 'Faster' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Back to projects' }).click();
  await expect(cards(page)).toHaveText(['Untitled Project']);

  await page.getByTestId('new-project').click();
  await page.getByRole('button', { name: 'BPM' }).click();
  await page.getByRole('button', { name: 'Faster' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('project-title')).toHaveText('Untitled Project 2');
  await page.getByRole('button', { name: 'Back to projects' }).click();
  await expect(cards(page)).toHaveCount(2);

  // Tapping the project name/card still opens it.
  await cards(page).filter({ hasText: /^Untitled Project$/ }).locator('.project-open').click();
  await expect(page.locator('[data-screen="home"]')).toBeVisible();
  await expect(page.getByTestId('project-title')).toHaveText('Untitled Project');

  // Launch still lands on Projects and keeps only meaningful projects.
  await reloadToProjects(page);
  await expect(cards(page)).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('projects keep independent songs and undo survives autosave', async ({ page }) => {
  // Project A: BPM 102 with one recorded note.
  await page.getByTestId('new-project').click();
  await page.getByRole('button', { name: 'BPM' }).click();
  await page.getByRole('button', { name: 'Faster' }).click();
  await page.getByRole('button', { name: 'Faster' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-kind="notes"]').click();
  await page.getByTestId('record').click();
  await page.locator('.key[data-midi="48"]').dispatchEvent('pointerdown');
  await expect(page.locator('.block.note')).toHaveCount(1);
  await page.waitForTimeout(400); // autosave lands

  // Delete the note, let autosave persist it, then undo: the note must come back.
  await longPress(page, page.locator('.block.note'), false);
  await page.getByTestId('context-delete-event').click();
  await expect(page.locator('.block.note')).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.getByTestId('undo').click();
  await expect(page.locator('.block.note')).toHaveCount(1);
  await page.getByTestId('redo').click();
  await expect(page.locator('.block.note')).toHaveCount(0);
  await page.getByTestId('undo').click();
  await expect(page.locator('.block.note')).toHaveCount(1);

  await page.getByRole('button', { name: 'Back to guitar' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();
  await page.getByRole('button', { name: 'Back to projects' }).click();

  // Project B: untouched defaults, and undo has nothing from A.
  await page.getByTestId('new-project').click();
  await expect(page.getByRole('button', { name: 'BPM' })).toContainText('100');
  await expect(page.locator('[data-instrument="guitar"] .overview .clip')).toHaveCount(0);
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-kind="chords"]').click();
  await page.getByTestId('undo').click(); // removes B's layer only, back on the Guitar page
  await expect(page.locator('[data-screen="guitar"]')).toBeVisible();
  await expect(page.locator('.layer-card')).toHaveCount(0);
  await expect(page.getByTestId('undo')).toBeDisabled();
  await page.getByRole('button', { name: 'Back to song' }).click();
  await page.getByRole('button', { name: 'Back to projects' }).click();

  // Reopen A after a reload: its note and tempo are intact.
  await reloadToProjects(page);
  await cards(page).filter({ hasText: /^Untitled Project$/ }).click();
  await expect(page.getByRole('button', { name: 'BPM' })).toContainText('102');
  await expect(page.locator('[data-instrument="guitar"] .overview .clip')).toHaveCount(1);
});

test('project play control previews and loops without opening the project', async ({ page }) => {
  await page.getByTestId('new-project').click();
  await page.getByRole('button', { name: 'Guitar' }).click();
  await page.getByTestId('add-layer').click();
  await page.locator('[data-layer-kind="notes"]').click();
  await page.getByTestId('record').click();
  await page.locator('.key[data-midi="48"]').dispatchEvent('pointerdown');
  await page.getByRole('button', { name: 'Back to guitar' }).click();
  await page.getByRole('button', { name: 'Back to song' }).click();
  await page.getByRole('button', { name: 'Back to projects' }).click();

  const card = cards(page).first();
  const previewButton = card.getByTestId('project-preview');
  await expect(previewButton).toHaveAttribute('aria-label', /Play/);
  await previewButton.click();

  await expect(page.locator('[data-screen="projects"]')).toBeVisible();
  await expect(previewButton).toHaveAttribute('aria-label', /Stop/);
  const firstDash = await previewButton.locator('.project-preview-progress').getAttribute('stroke-dasharray');
  await page.waitForTimeout(350);
  const secondDash = await previewButton.locator('.project-preview-progress').getAttribute('stroke-dasharray');
  expect(secondDash).not.toBe(firstDash);

  await previewButton.click();
  await expect(previewButton).toHaveAttribute('aria-label', /Play/);
  await expect(page.locator('[data-screen="home"]')).toHaveCount(0);
});

test('long-press offers Rename / Duplicate / Delete without opening the project', async ({ page }) => {
  await page.getByTestId('new-project').click();
  await page.getByRole('button', { name: 'BPM' }).click();
  await page.getByRole('button', { name: 'Faster' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Back to projects' }).click();
  const card = cards(page).first();

  // Hold: the menu appears and we stay on Projects.
  await longPress(page, card);
  await expect(page.getByTestId('project-rename')).toBeVisible();
  await expect(page.locator('[data-screen="projects"]')).toBeVisible();
  await expect(page.locator('[data-screen="home"]')).toHaveCount(0);

  // Rename: blank is rejected, whitespace trimmed.
  await page.getByTestId('project-rename').click();
  const input = page.getByTestId('project-name-input');
  await input.fill('   ');
  await expect(page.getByTestId('project-rename-save')).toBeDisabled();
  await input.fill('  Blue Riff ');
  await page.getByTestId('project-rename-save').click();
  await expect(cards(page)).toHaveText(['Blue Riff']);

  // Duplicate: stays on Projects, independent copy listed.
  await longPress(page, cards(page).first());
  await page.getByTestId('project-duplicate').click();
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).filter({ hasText: 'Blue Riff Copy' })).toHaveCount(1);
  await expect(page.locator('[data-screen="projects"]')).toBeVisible();

  // Delete requires confirmation; cancelling keeps it.
  await longPress(page, cards(page).filter({ hasText: /^Blue Riff Copy$/ }));
  await page.getByTestId('project-delete').click();
  await expect(page.getByTestId('confirm-delete-project')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(cards(page)).toHaveCount(2);
  await longPress(page, cards(page).filter({ hasText: /^Blue Riff Copy$/ }));
  await page.getByTestId('project-delete').click();
  await page.getByTestId('confirm-delete-project').click();
  await expect(cards(page)).toHaveText(['Blue Riff']);

  // Everything survives a reload; a plain tap still opens.
  await reloadToProjects(page);
  await expect(cards(page)).toHaveText(['Blue Riff']);
  await cards(page).first().click();
  await expect(page.getByTestId('project-title')).toHaveText('Blue Riff');
});

test('a legacy single song is migrated once into "Untitled Project"', async ({ page }) => {
  // Seed the old single-song key the way the previous version stored it.
  await page.evaluate(async () => {
    const song = {
      version: 1,
      id: 'song_legacy',
      bpm: 117,
      timeSignature: { beatsPerBar: 3, beatUnit: 4 },
      key: { mode: 'manual', tonic: 7, quality: 'major' },
      timelineBars: 2,
      guitar: { layers: [] },
    };
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('keyval-store');
      open.onupgradeneeded = () => open.result.createObjectStore('keyval');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').put(song, 'quicksong:song:v1');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await expect(page.locator('.app[data-hydrated="true"]')).toBeVisible();
  await expect(cards(page)).toHaveText(['Untitled Project']);
  await page.reload();
  await expect(page.locator('.app[data-hydrated="true"]')).toBeVisible();
  await expect(cards(page)).toHaveText(['Untitled Project']);
  await cards(page).first().click();
  await expect(page.getByRole('button', { name: 'BPM' })).toContainText('117');
  await expect(page.getByRole('button', { name: 'Time signature' })).toContainText('3/4');
  await expect(page.getByRole('button', { name: 'Key', exact: true })).toHaveText(/Key\s*G$/);
});
