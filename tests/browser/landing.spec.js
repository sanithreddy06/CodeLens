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

test('create account validates confirmation and persists a working login', async ({ page }, testInfo) => {
  const email = `signup-${testInfo.project.name}@example.com`;
  const password = 'signup-test-password';
  await page.goto('/#signin');
  await page.getByRole('link', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create your account.' })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill('different-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Passwords must match.');
  await page.getByLabel('Confirm password').fill(password);
  const created = page.waitForResponse(response => response.url().endsWith('/api/auth/signup'));
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  expect((await created).status()).toBe(201);
  await expect(page.getByRole('heading', { name: /Understand your codebase/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Understand your codebase/ })).toBeVisible();
  await page.context().clearCookies();
  await page.goto('/#signin');
  await page.reload();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Understand your codebase/ })).toBeVisible();
});

test('signup failure stays on the create-account form', async ({ page }) => {
  await page.route('**/api/auth/signup', route => route.fulfill({
    status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Please try again.' }),
  }));
  await page.goto('/#signup');
  await page.getByLabel('Email address').fill('retry@example.com');
  await page.getByLabel('Password', { exact: true }).fill('signup-test-password');
  await page.getByLabel('Confirm password').fill('signup-test-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Please try again.');
  await expect(page.getByRole('heading', { name: 'Create your account.' })).toBeVisible();
  await expect(page).toHaveURL(/#signup$/);
});

test('forgot password opens recovery and explains unavailable delivery', async ({ page }) => {
  await page.goto('/#signin');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  await page.getByLabel('Email address').fill('browser@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('alert')).toContainText('Password reset emails are not available yet.');
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.goto('/#reset-password?token=invalid');
  await page.getByLabel('New password', { exact: true }).fill('new-test-password');
  await page.getByLabel('Confirm password').fill('different-password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toHaveText('Passwords must match.');
  await page.getByLabel('Confirm password').fill('new-test-password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('alert')).toContainText('invalid or expired');
});
