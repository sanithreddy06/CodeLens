const { test, expect } = require('@playwright/test');
const { makeZip } = require('../../server/test/zipFixture.cjs');
test('architecture supports source inspection, filtering, layout, export, and file imports', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#signin');
  await page.getByLabel('Email address').fill(`architecture-${testInfo.project.name}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.project-name')).toHaveText('Your projects');
  await page.getByRole('radio', { name: 'Upload ZIP' }).check();
  await page.locator('input[type=file]').setInputFiles({ name: 'architecture.zip', mimeType: 'application/zip', buffer: makeZip({
    'ui/app.js': 'import { load } from "../api/service.js"; export function app() { return load(); }',
    'api/service.js': 'import { read } from "./store.js"; export function load() { return read(); }',
    'api/store.js': 'export function read() { return "hello"; }',
    'README.md': '# Architecture fixture',
  }) });
  await page.getByRole('button', { name: 'Analyze Project', exact: true }).click();
  await expect(page.getByText('Analyzed 4 of 4 files', { exact: false })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Explore interactive architecture', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Architecture', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Inspect Entry Point', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect Entry Point', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Component details' });
  await expect(inspector).toBeVisible();
  await inspector.locator('.architecture-files button').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close source viewer' }).click();
  await inspector.getByRole('button', { name: 'Focus connections' }).click();
  await expect(inspector.getByRole('button', { name: 'Show full architecture' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close component details' }).click();
  await page.getByLabel('Diagram layout', { exact: true }).selectOption('TB');
  await page.getByRole('button', { name: 'Fit diagram', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('architecture-architecture.svg');
  const svg = require('node:fs').readFileSync(await download.path(), 'utf8');
  expect(svg).toContain('<svg'); expect(svg).not.toContain('<script');
  await page.getByLabel('Search architecture').fill('no-such-component');
  await expect(page.getByRole('heading', { name: 'No components found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('button', { name: 'Inspect Entry Point', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('architecture.png'), fullPage: true });
  await page.getByRole('button', { name: 'File imports', exact: true }).click();
  await expect(page.getByText('Showing 4 of 4 nodes', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});
