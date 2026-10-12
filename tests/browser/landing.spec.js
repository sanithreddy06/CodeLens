const { test, expect } = require('@playwright/test');

test('public website previews the product and leads into the workspace', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Understand the code/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read the source' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Read the source' }).click();
  await expect(page.getByRole('heading', { name: 'Go straight to the source.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read the source' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('summary').filter({ hasText: 'Can I create an account?' }).click();
  await expect(page.getByText(/Choose Create account on the sign-in page/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('website.png'), fullPage: true });
  await page.getByRole('link', { name: 'Open your workspace' }).click();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await page.getByRole('link', { name: 'Back to CodeLens' }).click();
  await expect(page.getByRole('heading', { name: /Understand the code/ })).toBeVisible();
  await page.goBack();
  await page.getByLabel('Email address').fill(`${testInfo.project.name}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.screenshot({ path: testInfo.outputPath('signin.png'), fullPage: true });
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Understand your codebase/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('workspace.png'), fullPage: true });
  expect(errors).toEqual([]);
});
