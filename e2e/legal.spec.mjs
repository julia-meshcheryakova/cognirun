import { expect, test } from '@playwright/test';

test('privacy and terms are reachable from Settings and lead back', async ({ page }) => {
  await page.goto('/#/settings');
  await page.locator('#settings-screen .legal-links').getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/#\/privacy$/);
  await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible();
  await expect(page.getByText('heart rate', { exact: false }).first()).toBeVisible();
  await expect(page.locator('#tabs [aria-current="page"]')).toHaveCount(0);

  await page.locator('.legal .legal-links').getByRole('link', { name: 'Terms' }).click();
  await expect(page.getByRole('heading', { name: 'Terms of use' })).toBeVisible();

  await page.locator('#legal-back').click();
  await expect(page).toHaveURL(/#\/privacy$/);
  await page.locator('#legal-back').click();
  await expect(page).toHaveURL(/#\/settings$/);
});

test('sign-in needs the terms ticked first (when sign-in is configured)', async ({ page }) => {
  await page.goto('/#/account');
  await expect(page.getByRole('heading', { name: 'You' })).toBeVisible();
  await expect(page.locator('.account .legal-links')).toBeVisible();
  const consent = page.locator('#accept-terms');
  await expect(page.locator('.lede').first()).not.toHaveText('Checking your account…');
  test.skip((await consent.count()) === 0, 'this build has no sign-in configured');

  await expect(page.locator('#google-signin')).toBeDisabled();
  await expect(page.locator('#email-signin')).toBeDisabled();
  await consent.check();
  await expect(page.locator('#google-signin')).toBeEnabled();
  await expect(page.locator('#email-signin')).toBeEnabled();

  await page.reload(); // the choice is kept until sign-in records it
  await expect(page.locator('#accept-terms')).toBeChecked();
  await page.locator('#accept-terms').uncheck();
  await expect(page.locator('#google-signin')).toBeDisabled();
});
