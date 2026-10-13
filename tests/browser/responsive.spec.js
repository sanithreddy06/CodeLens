const { test, expect } = require('@playwright/test');
const { makeZip } = require('../../server/test/zipFixture.cjs');
const sizes = [[320, 568], [390, 844], [768, 1024], [1024, 768], [1280, 480], [1440, 900], [2560, 1440], [844, 390]];
async function fits(page, label) {
  const overflow = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
  expect(overflow.document, label).toBeLessThanOrEqual(overflow.width + 1);
}
test('pages and analysis views adapt across screen sizes', async ({ page }, testInfo) => {
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const route of ['', '#signup', '#forgot-password', '#privacy']) {
      await page.goto('/' + route);
      await expect(page.locator('main')).toBeVisible();
      await fits(page, `${route || 'home'} at ${width}`);
    }
  }
  await page.goto('/#signin');
  await page.getByLabel('Email address').fill('browser@example.com');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.project-name')).toHaveText('Your projects');
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await fits(page, `import at ${width}`);
    await page.goto('/#settings');
    await expect(page.getByRole('heading', { name: 'Make it your workspace.' })).toBeVisible();
    await fits(page, `settings at ${width}`);
    if (width <= 650) expect(await page.getByLabel('Current password').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await page.getByRole('button', { name: 'Delete account', exact: true }).click();
    await fits(page, `confirmation at ${width}`);
    await page.screenshot({ path: testInfo.outputPath(`settings-${width}.png`), fullPage: true });
    await page.goto('/#workspace');
  }
  await page.getByRole('radio', { name: 'Upload ZIP' }).check();
  await page.locator('input[type=file]').setInputFiles({ name: 'a-long-project-name-for-responsive-layout-validation.zip', mimeType: 'application/zip', buffer: makeZip({ 'src/a-long-module-name-for-checking-source-layout.js': 'export function greet() { return "hello"; }', 'README.md': '# Sample' }) });
  await page.getByRole('button', { name: 'Analyze Project', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible({ timeout: 20000 });
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const tab of ['Overview', 'Structure', 'Graph', 'Q&A', 'Tutorials']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await expect(page.locator('.view-loading')).toHaveCount(0);
      await fits(page, `${tab} at ${width}`);
      if (tab === 'Graph') {
        await expect.poll(() => page.locator('.graph-canvas').evaluate(el => {
          const canvas = el.querySelector('canvas');
          return Boolean(canvas && canvas.getBoundingClientRect().width <= el.clientWidth + 1 && canvas.getBoundingClientRect().height <= el.clientHeight + 1);
        })).toBe(true);
      }
    }
    await page.getByRole('button', { name: 'Structure', exact: true }).click();
    await page.getByRole('button', { name: 'a-long-module-name-for-checking-source-layout.js', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const box = await page.getByRole('dialog').boundingBox();
    expect(box.width).toBeLessThanOrEqual(width);
    expect(box.height).toBeLessThanOrEqual(height);
    await page.getByRole('button', { name: 'Close source viewer' }).click();
    await page.screenshot({ path: testInfo.outputPath(`workspace-${width}.png`), fullPage: true });
  }
});
