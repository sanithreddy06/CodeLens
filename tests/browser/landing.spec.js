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
  await page.getByRole('checkbox').check();
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
  await page.getByRole('checkbox').check();
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

test('policies and account data controls work', async ({ page }, testInfo) => {
  await page.goto('/#privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'mudiyalasanith2006@gmail.com', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('privacy-policy.png'), fullPage: true });
  await page.getByRole('link', { name: 'Terms', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Terms of Service', exact: true })).toBeVisible();
  await page.goto('/#signup');
  await page.getByLabel('Email address').fill(`privacy-${testInfo.project.name}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('privacy-test-password');
  await page.getByLabel('Confirm password').fill('privacy-test-password');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Understand your codebase/ })).toBeVisible();
  await page.goto('/#settings');
  await page.getByLabel('Current password').fill('privacy-test-password');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data' }).click();
  expect((await downloaded).suggestedFilename()).toBe('codelens-data.json');
  await expect(page.getByText('Your data export has downloaded.', { exact: false })).toBeVisible();
  await page.getByLabel('Current password').fill('privacy-test-password');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByLabel('Confirmation', { exact: true }).fill('DELETE');
  await page.getByRole('button', { name: 'Permanently delete account' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
});

test('password reset clears the signed-in workspace immediately', async ({ page }) => {
  await page.goto('/#signin');
  await page.getByLabel('Email address').fill('browser@example.com');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.project-name')).toHaveText('Your projects');
  await page.route('**/api/auth/reset-password', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Your password has been updated.' }) }));
  await page.goto('/#reset-password?token=test-link');
  await page.getByLabel('New password', { exact: true }).fill('new-test-password');
  await page.getByLabel('Confirm password').fill('new-test-password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('status')).toHaveText('Your password has been updated.');
  await expect(page).toHaveURL(/#reset-password$/);
  await page.getByRole('link', { name: 'CodeLens home' }).click();
  await expect(page.getByRole('heading', { name: /Understand the code/ })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});
