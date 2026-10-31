import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// `vite preview` does not apply web/public/_headers, so this spec serves every
// response with the production Content-Security-Policy and fails on any
// violation while it walks through the app.
const headersFile = readFileSync(new URL('../web/public/_headers', import.meta.url), 'utf8');
const CSP = headersFile.match(/^\s+Content-Security-Policy:\s*(.+)$/m)?.[1].trim();
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const vercelCsp = vercel.headers
  .flatMap((rule) => rule.headers)
  .find((h) => h.key === 'Content-Security-Policy')?.value;

test('Cloudflare (_headers) and Vercel serve the same policy', () => {
  expect(CSP).toBeTruthy();
  expect(vercelCsp).toBe(CSP);
});

test('the app runs under the production Content-Security-Policy', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': CSP } });
  });
  const violations = [];
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CogniRun' })).toBeVisible();
  for (const tab of ['challenges', 'history', 'account', 'settings']) {
    await page.locator(`#tabs [data-tab="${tab}"]`).click();
    await expect(page.locator(`#tabs [data-tab="${tab}"]`)).toHaveAttribute('aria-current', 'page');
  }
  await page.locator('#settings-screen').getByRole('link', { name: 'About' }).click();
  await expect(page.getByRole('heading', { name: 'About CogniRun' })).toBeVisible();
  await page.locator('#about-back').click();
  await expect(page).toHaveURL(/#\/settings$/);
  // Fonts, icons and the lazy Supabase chunk have loaded by now.
  await page.waitForLoadState('networkidle');

  expect(violations).toEqual([]);
});
