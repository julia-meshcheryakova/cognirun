import { expect, test } from '@playwright/test';

const RUN = {
  id: 'seeded-1',
  schema: 1,
  startedAt: '2026-01-05T09:45:00.000Z',
  finishedAt: '2026-01-05T10:00:00.000Z',
  mode: 'solo',
  challengeId: null,
  course: '3k',
  demo: false,
  distanceM: 3000,
  durationS: 900,
  avgSpeed: 3.33,
  points: 120,
  correct: 2,
  total: 3,
  hrAvg: null,
  hrMax: null,
  answers: [],
  route: [],
  synced: false,
};

test('settings live in their own tab and persist across reloads', async ({ page }) => {
  await page.addInitScript((run) => {
    if (!localStorage.getItem('cognirun.runs.v1')) {
      localStorage.setItem('cognirun.runs.v1', JSON.stringify([run]));
    }
  }, RUN);
  await page.goto('/');
  await expect(page.locator('#voice-toggle')).toHaveCount(0); // not on the run screen

  await page.locator('#tabs [data-tab="settings"]').click();
  await expect(page).toHaveURL(/#\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('#run-count')).toHaveText('1 run saved on this device.');

  await page.locator('#voice-toggle').uncheck();
  await page.locator('[data-default-course="5k"]').click();
  await page.reload();
  await expect(page.locator('#voice-toggle')).not.toBeChecked();
  await expect(page.locator('[data-default-course="5k"]')).toHaveClass(/active/);

  await page.locator('#tabs [data-tab="run"]').click();
  await expect(page.locator('[data-course="5k"]')).toHaveClass(/active/);
  await expect(page.locator('.lede')).toContainText('Run 5K');

  await page.locator('#tabs [data-tab="settings"]').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#clear-runs').click();
  await expect(page.locator('#run-count')).toHaveText('0 runs saved on this device.');
  await page.locator('#tabs [data-tab="history"]').click();
  await expect(page.getByText('No runs yet')).toBeVisible();
});
